import { config } from "dotenv";
import { fileURLToPath } from "node:url";
config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });
const { prisma } = await import("../src/config/database.js");
const { createManualIdentityReviewService } = await import("../src/modules/manual-identity/manual-identity-review.service.js");
const { createManualIdentityEvidenceService } = await import("../src/modules/manual-identity/manual-identity-evidence.service.js");
const { createIdentityNameChangeService } = await import("../src/modules/manual-identity/identity-name-change.service.js");
const { createManualIdentityStorage } = await import("../src/modules/manual-identity/manual-identity.storage.js");
try {
  const storage = createManualIdentityStorage();
  const reviews = await createManualIdentityReviewService({ prisma, storage }).cleanup();
  const names = await createIdentityNameChangeService({ prisma, storage }).cleanup();
  const files = await createManualIdentityEvidenceService({ prisma, storage }).cleanup();
  console.log(`Identity cleanup: ${reviews.purged + names.purged} snapshots purged; ${files.deleted} objects deleted; ${files.failed} deletions pending retry.`);
  if (files.failed) process.exitCode = 1;
} catch { console.error("Manual identity cleanup failed. Check the database, migrations and private R2 bucket configuration."); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
