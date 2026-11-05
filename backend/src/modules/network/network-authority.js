import { Prisma } from "@prisma/client";
import { fail, networkCursorSchema } from "./network.schema.js";
export async function assertNetworkSession(db, actor, now) {
    if (!actor || !networkCursorSchema.shape.owner.safeParse(actor.accountId).success || !networkCursorSchema.shape.owner.safeParse(actor.sessionId).success) throw fail(401, "Sign in to your personal BrightWay account.");
    const rows = await db.$queryRaw(Prisma.sql`
      SELECT s."id" FROM "Session" s JOIN "Account" a ON a."id" = s."accountId"
      LEFT JOIN "MfaFactor" mf ON mf."accountId" = a."id"
      WHERE s."id" = ${actor.sessionId} AND s."accountId" = ${actor.accountId}
        AND s."expiresAt" > ${now()} AND a."status" = 'ACTIVE'
        AND (mf."enabled" IS NOT TRUE OR (s."mfaVerifiedAt" IS NOT NULL AND s."mfaVersion" = mf."version")) LIMIT 1`);
    if (!rows.length) throw fail(401, "Your personal session changed. Sign in again.");
  }

export async function lockNetworkAccounts(db, ids) {
  for (const id of [...new Set(ids)].sort()) await db.account.updateMany({ where: { id }, data: { accessVersion: { increment: 0 } } });
}
