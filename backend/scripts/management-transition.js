import { config } from "dotenv";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createManagementAuth } from "../src/modules/management/management-auth.service.js";
import { createManagementEmail } from "../src/modules/management/management-email.js";
import { createManagementTransition } from "../src/modules/management/management-transition.js";
import { withTerminalAuthentication } from "./superadmin.js";
export function parseTransition(args) {
  if (args[0] === "inventory" && args.length === 3 && args[1] === "--by" && /^[a-z0-9_]{3,30}$/.test(args[2])) return { mode: "inventory", username: args[2] };
  if (args[0] === "release" && args.length === 8 && ["credentials", "identities", "photos", "names"].includes(args[1]) && /^[a-f0-9-]{36}$/.test(args[2]) && /^[1-9]\d{0,8}$/.test(args[3]) && args[4] === "--by" && /^[a-z0-9_]{3,30}$/.test(args[5]) && args[6] === "--reason" && args[7].length >= 10 && args[7].length <= 500) return { mode: "release", kind: args[1], id: args[2], version: Number(args[3]), username: args[5], reason: args[7] };
  throw Error('Usage: management-transition.js inventory --by ROOT | release credentials|identities|photos|names REQUEST_UUID VERSION --by ROOT --reason "Reason"');
}
async function main(args) {
  let prisma;
  try {
    const input = parseTransition(args); config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });
    ({ prisma } = await import("../src/config/database.js")); const authentication = createManagementAuth({ prisma, sender: createManagementEmail() });
    const service = createManagementTransition({ prisma });
    const result = await withTerminalAuthentication({ prisma, authentication, username: input.username }, actor => input.mode === "inventory" ? service.inventory(actor) : service.release(actor, input.kind, input.id, input.version, input.reason));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) { console.error(error.status && error.status < 500 || error.message.startsWith("Usage:") ? error.message : "Management transition failed. Check current version, management credentials, MFA, connectivity and migrations. Sensitive details hidden."); process.exitCode = 1; }
  finally { if (prisma) await prisma.$disconnect(); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main(process.argv.slice(2));
