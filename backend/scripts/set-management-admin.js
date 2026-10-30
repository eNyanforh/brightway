import { config } from "dotenv";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createManagementProvisioning, managementGrantSchema } from "../src/modules/management/management-access.service.js";
export function parseManagementCommand(args) {
  if (args.length !== 4 || args[2] !== "--reason") throw Error('Usage: node backend/scripts/set-management-admin.js <username> grant|revoke --reason "Operational reason (10–500 characters)"');
  const result = managementGrantSchema.safeParse({ username: args[0], action: args[1], reason: args[3] });
  if (!result.success) throw Error("Provide a valid existing username, grant|revoke and an operational reason of 10–500 characters.");
  return result.data;
}
async function main() {
  const input = parseManagementCommand(process.argv.slice(2));
  config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });
  const { prisma } = await import("../src/config/database.js");
  try {
    const result = await createManagementProvisioning({ prisma })(input);
    console.log(`Management administrator access ${result.enabled ? "enabled" : "disabled"} for @${result.username}${result.changed ? "" : " (already in that state)"}. Review and organization permissions were preserved.`);
    if (result.enabled) console.log("Sign out and sign in with MFA, then open /management. Keep your backup codes private.");
  } finally { await prisma.$disconnect(); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { await main(); } catch (error) { console.error(error.status || !error.code && /Usage:|Provide a valid/.test(error.message) ? error.message : "Management access update failed. Check connectivity, migrations and account prerequisites; credentials are hidden."); process.exitCode = 1; }
}
