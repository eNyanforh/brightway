import { config } from "dotenv";
import { fileURLToPath } from "node:url";
config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });
const { prisma } = await import("../src/config/database.js");
const { createManualIdentityEvidenceService } = await import("../src/modules/manual-identity/manual-identity-evidence.service.js");
const { createManualIdentityStorage } = await import("../src/modules/manual-identity/manual-identity.storage.js");
try {
  const service = createManualIdentityEvidenceService({ prisma, storage: createManualIdentityStorage() });
  const result = await service.cleanup();
  console.log(`Identity evidence cleanup: ${result.deleted} deleted; ${result.failed} awaiting retry.`);
  if (result.failed) process.exitCode = 1;
} catch { console.error("Identity evidence cleanup failed. Check private bucket configuration and database migrations."); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
