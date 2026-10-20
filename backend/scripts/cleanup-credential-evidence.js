import "dotenv/config";
import { prisma } from "../src/config/database.js";
import { createR2Storage } from "../src/modules/photos/photo.storage.js";
import { createCredentialService } from "../src/modules/credentials/credential.service.js";
try { console.log(await createCredentialService({ prisma, storage: createR2Storage() }).cleanup()); }
catch { console.error("Credential evidence cleanup failed. Retry after checking database and storage availability."); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
