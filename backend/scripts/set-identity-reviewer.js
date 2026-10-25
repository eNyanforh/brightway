import { config } from "dotenv";
import { fileURLToPath } from "node:url";
config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });
const { prisma } = await import("../src/config/database.js");
const [username, action] = process.argv.slice(2);
try {
  if (!/^[a-z0-9_]{3,30}$/.test(username ?? "") || !["grant", "revoke"].includes(action) || process.argv.length !== 4) {
    throw Error("Usage: node backend/scripts/set-identity-reviewer.js <username> grant|revoke");
  }
  await prisma.$transaction(async (tx) => {
    const account = await tx.account.findUnique({ where: { username }, select: { id: true, status: true, emailVerifiedAt: true } });
    if (!account) throw Error("Account not found.");
    if (action === "grant" && (account.status !== "ACTIVE" || !account.emailVerifiedAt)) throw Error("An active account with verified email is required.");
    const locked = await tx.account.updateMany({ where: { id: account.id, status: account.status, emailVerifiedAt: account.emailVerifiedAt }, data: { identityRevision: { increment: 0 } } });
    if (locked.count !== 1) throw Error("Account changed. Retry the permission update.");
    const previous = await tx.manualIdentityReviewer.findUnique({ where: { accountId: account.id } });
    const enabled = action === "grant";
    if (Boolean(previous?.enabled) === enabled) return;
    await tx.manualIdentityReviewer.upsert({ where: { accountId: account.id }, create: { accountId: account.id, enabled }, update: { enabled } });
    await tx.manualIdentityAudit.create({ data: { targetAccountId: account.id, actorId: "SERVER_OPERATOR_CLI", action: enabled ? "REVIEWER_GRANTED" : "REVIEWER_REVOKED" } });
  });
  console.log(`Identity reviewer permission ${action === "grant" ? "granted" : "revoked"}. Credential-review permissions were preserved. MFA is still required for identity review.`);
} catch (error) {
  console.error(error.code ? "Reviewer permission update failed. Check database connectivity and migrations." : error.message);
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
