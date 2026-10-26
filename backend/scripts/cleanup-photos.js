import { config } from "dotenv";
import { fileURLToPath } from "node:url";
config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });
const { prisma } = await import("../src/config/database.js");
const { createPhotoService } = await import("../src/modules/photos/photo.service.js");
const { createR2Storage } = await import("../src/modules/photos/photo.storage.js");

try {
  const result = await createPhotoService({ prisma, storage: createR2Storage() }).cleanup();
  console.info(`Deleted ${result.deleted} abandoned or replaced photo objects.`);
} catch {
  console.error("Profile photo cleanup failed. Check database connectivity, migrations and profile-photo storage configuration.");
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
