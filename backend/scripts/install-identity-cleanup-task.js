import { execFileSync } from "node:child_process";
import { access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanupTaskPaths, projectRoot, readCleanupStatus } from "./run-identity-cleanup-job.js";

// Configuration is passed as JSON data, never interpolated into PowerShell source.
export const taskScript = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  Import-Module ScheduledTasks -ErrorAction Stop
  $c = $env:BRIGHTWAY_IDENTITY_TASK_CONFIG | ConvertFrom-Json
  $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $existing = Get-ScheduledTask -TaskName $c.taskName -TaskPath '\' -ErrorAction SilentlyContinue
  if ($null -ne $existing -and $existing.Principal.UserId -ne $user) {
    throw 'TASK_OWNER_MISMATCH'
  }
  if ($c.mode -eq 'remove') {
    if ($null -ne $existing) {
      Unregister-ScheduledTask -TaskName $c.taskName -TaskPath '\' -Confirm:$false
    }
    @{ registered = $false; taskName = $c.taskName; logsRetained = $true } | ConvertTo-Json -Compress
    exit 0
  }
  if ($c.mode -eq 'install') {
    $action = New-ScheduledTaskAction -Execute $c.node -Argument ('"' + $c.runner + '"') -WorkingDirectory $c.backend
    $repeat = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 30)
    $logon = New-ScheduledTaskTrigger -AtLogOn -User $user
    $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
    $task = New-ScheduledTask -Action $action -Trigger @($repeat, $logon) -Principal $principal -Settings $settings -Description 'BrightWay development identity retention cleanup. Uses backend/.env. Runs only while this Windows user is signed in.'
    Register-ScheduledTask -TaskName $c.taskName -TaskPath '\' -InputObject $task -Force | Out-Null
    Start-ScheduledTask -TaskName $c.taskName -TaskPath '\'
    $existing = Get-ScheduledTask -TaskName $c.taskName -TaskPath '\'
  }
  if ($null -eq $existing) {
    @{ registered = $false; taskName = $c.taskName } | ConvertTo-Json -Compress
    exit 0
  }
  $info = Get-ScheduledTaskInfo -TaskName $c.taskName -TaskPath '\'
  $lastRun = if ($info.LastRunTime.Year -gt 2000) { $info.LastRunTime.ToUniversalTime().ToString('o') } else { $null }
  $nextRun = if ($info.NextRunTime.Year -gt 2000) { $info.NextRunTime.ToUniversalTime().ToString('o') } else { $null }
  @{
    registered = $true
    taskName = $c.taskName
    state = [string]$existing.State
    multipleInstances = [string]$existing.Settings.MultipleInstances
    lastRunUtc = $lastRun
    nextRunUtc = $nextRun
    lastTaskResult = $info.LastTaskResult
  } | ConvertTo-Json -Compress
} catch {
  # Do not emit raw exceptions, environment variables, provider responses or configuration.
  [Console]::Error.WriteLine('Windows task operation failed. Check Task Scheduler permissions, the ScheduledTasks module, and ownership of this task. No task success is being reported.')
  exit 1
}
`;

export async function manageCleanupTask(args = process.argv.slice(2)) {
  if (args.length > 1 || (args.length && !["--status", "--remove"].includes(args[0]))) {
    throw new Error("Usage: node backend/scripts/install-identity-cleanup-task.js [--status|--remove]");
  }
  if (process.platform !== "win32") throw new Error("This installer is for Windows development only.");
  const mode = args[0] === "--status" ? "status" : args[0] === "--remove" ? "remove" : "install";
  const { taskName, stateDir } = cleanupTaskPaths();
  const backend = join(projectRoot, "backend");
  const runner = join(backend, "scripts/run-identity-cleanup-job.js");
  if (mode === "install") {
    await Promise.all([
      access(join(backend, ".env")), access(join(backend, "scripts/cleanup-manual-identity-reviews.js")), access(runner),
    ]).catch(() => { throw new Error("Keep both new scripts in backend/scripts and ensure backend/.env and the existing cleanup script are present."); });
  }
  for (const path of [process.execPath, runner, backend]) {
    if (/[\r\n"]/.test(path)) throw new Error("Unsupported quote or newline in a local task path.");
  }
  const powershell = join(process.env.SystemRoot ?? "C:\\Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
  let native;
  try {
    const output = execFileSync(powershell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(taskScript, "utf16le").toString("base64")], {
      env: { ...process.env, BRIGHTWAY_IDENTITY_TASK_CONFIG: JSON.stringify({ mode, taskName, backend, runner, node: process.execPath }) },
      windowsHide: true,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
    });
    native = JSON.parse(output.trim().replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("Windows could not confirm the task operation. Inspect Task Scheduler for this task; do not assume installation or cleanup succeeded.");
  }
  console.log(JSON.stringify({ ...native, logDirectory: stateDir }, null, 2));
  if (mode === "install") {
    console.log("Task registered and a first run requested. It repeats every 30 minutes while you are signed in. This is not confirmation that cleanup has finished.");
    console.log("Run this command with --status after the first run and again after the next scheduled run.");
  }
  if (mode === "status") {
    const latest = await readCleanupStatus(stateDir);
    console.log("Latest cleanup result:");
    console.log(JSON.stringify(latest ?? { status: "NO_RECORDED_RUN" }, null, 2));
    if (!native.registered) process.exitCode = 1;
    if (latest?.status === "FAILED") process.exitCode = 1;
  }
  return native;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await manageCleanupTask(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
