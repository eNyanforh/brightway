import { createManualIdentityReviewService } from "../modules/manual-identity/manual-identity-review.service.js";
import { createIdentityNameChangeService } from "../modules/manual-identity/identity-name-change.service.js";
import { createManualIdentityEvidenceService } from "../modules/manual-identity/manual-identity-evidence.service.js";

export async function runIdentityCleanup({ prisma, storage, now }) {
  const config = { prisma, storage, ...(now ? { now } : {}) };
  const reviews = await createManualIdentityReviewService(config).cleanup();
  const names = await createIdentityNameChangeService(config).cleanup();
  const files = await createManualIdentityEvidenceService(config).cleanup();
  return { purged: reviews.purged + names.purged, deleted: files.deleted, failed: files.failed };
}

// Use a dedicated DIRECT_URL connection, never a transaction-pooled runtime connection.
// This is a session lock, not a database transaction held across R2 work.
export async function runLockedCleanup({ client, cleanup }) {
  let acquired = false;
  try {
    await client.connect();
    const result = await client.query("SELECT pg_try_advisory_lock(682117, 1) AS acquired");
    acquired = result.rows[0]?.acquired === true;
    if (!acquired) return { status: "skipped_locked" };
    const counts = await cleanup();
    return { status: counts.failed === 0 ? "success" : "retry_pending", ...counts };
  } finally {
    try { if (acquired) await client.query("SELECT pg_advisory_unlock(682117, 1)"); }
    finally { await client.end(); }
  }
}
