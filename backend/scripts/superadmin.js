import { config } from "dotenv";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { Writable } from "node:stream";
import { createInterface } from "node:readline/promises";
import { createManagementProvisioner } from "../src/modules/management/management-provisioning.js";
import { createManagementAuth, managementTokenHash } from "../src/modules/management/management-auth.service.js";
import { createManagementEmail } from "../src/modules/management/management-email.js";
import { hashPassword } from "../src/modules/auth/password.js";
const usage = 'Usage: superadmin.js bootstrap USERNAME --reason "Reason" | create USERNAME --by ROOT --reason "Reason" | staff USERNAME CAPABILITY grant|revoke --by ROOT --reason "Reason"';
export function parseSuperadminCommand(args) {
  const [mode, username] = args;
  const bootstrap = mode === "bootstrap", create = mode === "create" || bootstrap;
  if (!/^[a-z0-9_]{3,30}$/.test(username || "")) throw Error(usage);
  if (bootstrap ? args.length !== 4 || args[2] !== "--reason" : create ? args.length !== 6 || args[2] !== "--by" || args[4] !== "--reason" : mode !== "staff" || args.length !== 8 || args[4] !== "--by" || args[6] !== "--reason" || !["grant", "revoke"].includes(args[3])) throw Error(usage);
  const reason = args.at(-1), actorUsername = bootstrap ? null : args[create ? 3 : 5];
  if (reason.length < 10 || reason.length > 500 || /[\r\n]/.test(reason) || (!bootstrap && !/^[a-z0-9_]{3,30}$/.test(actorUsername || ""))) throw Error(usage);
  return { bootstrap, create, username, actorUsername, reason, capability: create ? null : args[2], enabled: args[3] === "grant" };
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


export async function withTerminalAuthentication({ prisma, authentication, username, prompt = hiddenPrompt }, work) {
  let token, challenge;
  try {
    const password = await prompt(`Management password for @${username} (hidden): `);
    const result = await authentication.login({ identifier: username, password }); challenge = result.challengeToken;
    if (result.step !== "mfa") throw Error("Finish separate management email/MFA enrollment in /superadmin/login first.");
    const code = await prompt("Fresh management authenticator or unused management backup code (hidden): ");
    const verified = await authentication.complete(challenge, { code: code.trim() }); token = verified.token;
    const session = await prisma.managementSession.findUnique({ where: { tokenHash: managementTokenHash(token) } });
    if (!session || session.staffId !== verified.staff.id) throw Error("Management terminal authentication failed.");
    return await work({ staffId: session.staffId, sessionId: session.id });
  } finally { await authentication.logout(token, challenge); }
}
export async function runSuperadminCommand(args) {
  const command = parseSuperadminCommand(args);
  config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });
  const { prisma } = await import("../src/config/database.js");
  try {
    const provisioner = createManagementProvisioner({ prisma });
    const authentication = createManagementAuth({ prisma, sender: createManagementEmail() });
    const work = async actor => {
      if (command.create) {
        const fullName = (await hiddenPrompt("Staff full name (hidden): ")).trim();
        const email = (await hiddenPrompt("Separate management email (hidden): ")).trim().toLowerCase();
        const password = await hiddenPrompt("New management password, at least 12 characters (hidden): ");
        const confirm = await hiddenPrompt("Repeat new management password (hidden): ");
        if (password !== confirm || password.length < 12 || password.length > 128) throw Error("Management passwords must match and contain 12–128 characters.");
        return provisioner.create({ username: command.username, fullName, email, passwordHash: await hashPassword(password), reason: command.reason }, actor, command.bootstrap);
      }
      return provisioner.change({ username: command.username, capability: command.capability, enabled: command.enabled, reason: command.reason }, actor);
    };
    const result = command.bootstrap ? await work(null) : await withTerminalAuthentication({ prisma, authentication, username: command.actorUsername }, work);
    console.log(`Management operation completed for @${result.username}. Audited. No personal account was created or promoted.`);
    if (command.create) console.log("Sign in at /superadmin/login with the new management password. Verify management email and enroll a new authenticator before workspace access.");
  } finally { await prisma.$disconnect(); }
}
export async function superadminMain(args) {
  try { await runSuperadminCommand(args); }
  catch (error) {
    console.error(error.status && error.status < 500 || /^(Usage:|An interactive terminal|Finish separate|Management passwords)/.test(error.message) ? error.message : "Management provisioning failed. Check configuration, migration state, credentials and fresh management MFA. Sensitive details are hidden.");
    process.exitCode = 1;
  }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await superadminMain(process.argv.slice(2));
