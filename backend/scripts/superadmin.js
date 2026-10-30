import { config } from "dotenv";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { Writable } from "node:stream";
import { createInterface } from "node:readline/promises";
import { staffGrantSchema, createStaffProvisioning } from "../src/modules/management/staff-provisioning.service.js";

const usage = 'Usage: node backend/scripts/superadmin.js bootstrap <username> --reason "Reason"\n   or: node backend/scripts/superadmin.js staff <username> superadmin|credential-reviewer|identity-reviewer|organization-agent|organization-approver grant|revoke --by <superadmin_username> --reason "Reason"';
export function parseSuperadminCommand(args) {
  const bootstrap = args[0] === "bootstrap";
  if (bootstrap ? args.length !== 4 || args[2] !== "--reason" : args[0] !== "staff" || args.length !== 8 || args[4] !== "--by" || args[6] !== "--reason") throw Error(usage);
  const input = staffGrantSchema.safeParse({ username: args[1], capability: bootstrap ? "superadmin" : args[2], action: bootstrap ? "grant" : args[3], reason: args[bootstrap ? 3 : 7] });
  const actorUsername = bootstrap ? input.data?.username : args[5]?.trim().toLowerCase();
  if (!input.success || !/^[a-z0-9_]{3,30}$/.test(actorUsername || "")) throw Error(usage);
  return { bootstrap, input: input.data, actorUsername };
}

// Read secrets from a real terminal, without echo, argv, environment variables or files.
export async function hiddenPrompt(label, { input = process.stdin, output = process.stdout } = {}) {
  if (!input.isTTY || !output.isTTY) throw Error("An interactive terminal is required. Passwords and MFA codes must not be passed as arguments or environment variables.");
  output.write(label);
  const silent = new Writable({ write(chunk, encoding, callback) { callback(); } }); silent.isTTY = true;
  const terminal = createInterface({ input, output: silent, terminal: true, historySize: 0 });
  const abort = new AbortController();
  terminal.once("SIGINT", () => abort.abort());
  try { return await terminal.question("", { signal: abort.signal }); }
  finally { terminal.close(); output.write("\n"); }
}

export async function withTerminalAuthentication({ prisma, sessions, mfa, username, prompt = hiddenPrompt }, work) {
  let token, challenge;
  try {
    const account = await prisma.account.findUnique({ where: { username }, select: { id: true, status: true, emailVerifiedAt: true } });
    const factor = account && await prisma.mfaFactor.findUnique({ where: { accountId: account.id } });
    if (!account || account.status !== "ACTIVE" || !account.emailVerifiedAt || factor?.enabled !== true) throw Error("Prepare an active, verified-email account with authenticator MFA before terminal provisioning.");
    const password = await prompt(`Password for @${username} (hidden): `);
    const login = await sessions.login({ identifier: username, password });
    token = login.token; challenge = login.challengeToken;
    if (!login.mfaRequired || !challenge) throw Error("A new MFA sign-in is required for terminal provisioning.");
    const code = await prompt("Fresh authenticator or unused backup code (hidden): ");
    const verified = await mfa.complete(challenge, code.trim()); token = verified.token;
    const { tokenHash } = await import("../src/modules/auth/session.service.js");
    const session = await prisma.session.findUnique({ where: { tokenHash: tokenHash(token) }, select: { id: true, accountId: true } });
    if (!session || session.accountId !== account.id || verified.account.id !== account.id) throw Error("Terminal authentication could not be verified.");
    return await work({ accountId: account.id, sessionId: session.id });
  } finally {
    // Never leave a CLI-created bearer session or pending login challenge behind.
    await sessions.logout(token, challenge);
  }
}

export async function runSuperadminCommand(args) {
  const command = parseSuperadminCommand(args);
  config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });
  const { prisma } = await import("../src/config/database.js");
  try {
    const { createSessionService } = await import("../src/modules/auth/session.service.js");
    const { createMfaService } = await import("../src/modules/auth/mfa.service.js");
    const mfa = createMfaService({ prisma, sessionLifetimeMs: 300000 }), sessions = createSessionService({ prisma, mfa });
    const result = await withTerminalAuthentication({ prisma, sessions, mfa, username: command.actorUsername }, actor => createStaffProvisioning({ prisma })(command.input, actor, command.bootstrap));
    console.log(`@${result.username}: ${result.capability} ${result.enabled ? "enabled" : "disabled"}${result.changed ? "" : " (already in that state)"}. Change audited; other permissions preserved.`);
    console.log("Sign out and sign in with a fresh MFA code at /superadmin. No password or account was created by this role-provisioning command.");
  } finally { await prisma.$disconnect(); }
}

export async function superadminMain(args) {
  try { await runSuperadminCommand(args); }
  catch (error) {
    console.error(error.status && error.status < 500 || /^(Usage:|An interactive terminal|Prepare an active)/.test(error.message) ? error.message : "Terminal provisioning failed. Check credentials, a fresh MFA code, connectivity, migration state and Super Admin permission. Sensitive details are hidden.");
    process.exitCode = 1;
  }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await superadminMain(process.argv.slice(2));
