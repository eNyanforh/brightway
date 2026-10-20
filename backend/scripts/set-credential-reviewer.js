import "dotenv/config";
import { prisma } from "../src/config/database.js";
const [username, action] = process.argv.slice(2);
try {
  if (!/^[a-z0-9_]{3,30}$/.test(username || "") || !["grant", "revoke"].includes(action) || process.argv.length !== 4) throw new Error("Usage from backend: node scripts/set-credential-reviewer.js <username> grant|revoke");
  await prisma.$transaction(async (tx) => {
    const account = await tx.account.findUnique({ where: { username }, select: { id: true, status: true, emailVerifiedAt: true, platformRole: true } });
    if (!account) throw new Error("Account not found.");
    if (action === "grant" && (account.status !== "ACTIVE" || !account.emailVerifiedAt)) throw new Error("The reviewer must have an active account and verified email.");
    const role = action === "grant" ? "CREDENTIAL_REVIEWER" : "MEMBER";
    if (role === account.platformRole) return;
    const changed = await tx.account.updateMany({ where: { id: account.id, platformRole: account.platformRole }, data: { platformRole: role } });
    if (changed.count !== 1) throw new Error("Role changed concurrently. Run the command again.");
    await tx.reviewerRoleAudit.create({ data: { targetAccountId: account.id, fromRole: account.platformRole, toRole: role } });
  });
  console.log(`Credential reviewer access ${action === "grant" ? "granted to" : "revoked from"} @${username}.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
