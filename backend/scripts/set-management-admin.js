import { managementGrantSchema } from "../src/modules/management/management-access.service.js";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
// Kept for argument-validation compatibility; authority now lives in superadmin.js.
export function parseManagementCommand(args) {
  if (args.length !== 4 || args[2] !== "--reason") throw Error("Use superadmin.js bootstrap or staff with --by and --reason.");
  const result = managementGrantSchema.safeParse({ username: args[0], action: args[1], reason: args[3] });
  if (!result.success) throw Error("Provide a valid username, action and reason.");
  return result.data;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.error("This unauthenticated grant command has been retired. Use node backend/scripts/superadmin.js bootstrap <username> --reason \"Reason\" for the first Super Admin, or superadmin.js staff with --by and --reason afterward.");
  process.exitCode = 1;
}
