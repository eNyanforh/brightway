import "dotenv/config";
import { prisma } from "../src/config/database.js";
import { createMessagingService } from "../src/modules/messaging/messaging.service.js";
import { createMessageStorage } from "../src/modules/messaging/messaging.storage.js";
try {
  const result = await createMessagingService({ prisma, storage: createMessageStorage() }).cleanupDraftFiles();
  console.log("Message attachment maintenance:", result);
} catch { console.error("Message attachment maintenance could not complete. Check the database and private message storage configuration."); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
