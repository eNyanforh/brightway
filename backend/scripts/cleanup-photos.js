import "dotenv/config";
import { prisma } from "../src/config/database.js";
import { createPhotoService } from "../src/modules/photos/photo.service.js";
import { createR2Storage } from "../src/modules/photos/photo.storage.js";

try {
  const result = await createPhotoService({ prisma, storage: createR2Storage() }).cleanup();
  console.info(`Deleted ${result.deleted} abandoned or replaced photo objects.`);
} finally { await prisma.$disconnect(); }