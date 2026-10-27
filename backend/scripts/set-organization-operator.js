import { config } from "dotenv";
import { fileURLToPath } from "node:url";
config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });
const [username, capability, action] = process.argv.slice(2);
if (process.argv.length !== 5 || !/^[a-z0-9_]{3,30}$/.test(username ?? "") || !["agent", "approver"].includes(capability) || !["grant", "revoke"].includes(action)) {
  console.error("Usage: node backend/scripts/set-organization-operator.js <username> agent|approver grant|revoke"); process.exitCode = 1;
} else {
  const { prisma } = await import("../src/config/database.js");
  try {
    await prisma.$transaction(async tx => {
      const account = await tx.account.findUnique({ where: { username }, select: { id: true, status: true, emailVerifiedAt: true } });
      if (!account) throw Error("Account not found.");
      if (action === "grant" && (account.status !== "ACTIVE" || !account.emailVerifiedAt)) throw Error("An active account with verified email is required.");
      if ((await tx.account.updateMany({ where: { id: account.id, status: account.status, emailVerifiedAt: account.emailVerifiedAt }, data: { identityRevision: { increment: 0 } } })).count !== 1) throw Error("Account changed. Retry.");
      const field = capability === "agent" ? "agentEnabled" : "approverEnabled", enabled = action === "grant";
      const previous = await tx.organizationOperator.findUnique({ where: { accountId: account.id } });
      if ((previous?.[field] === true) === enabled) return;
      await tx.organizationOperator.upsert({ where: { accountId: account.id }, create: { accountId: account.id, [field]: enabled }, update: { [field]: enabled } });
      await tx.organizationOperatorAudit.create({ data: { targetAccountId: account.id, actorId: "SERVER_OPERATOR_CLI", capability, enabled } });
    });
    console.log(`Organization ${capability} permission ${action === "grant" ? "granted" : "revoked"}. Other permissions were preserved. MFA is required for organization operations.`);
  } catch (error) { console.error(error.code ? "Organization permission update failed. Check connectivity and migrations." : error.message); process.exitCode = 1; }
  finally { await prisma.$disconnect(); }
}
