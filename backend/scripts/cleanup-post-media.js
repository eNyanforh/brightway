import "dotenv/config";
import { prisma } from "../src/config/database.js";
import { createPostMediaStorage } from "../src/modules/posts/post-media.storage.js";
import { createPostMediaService } from "../src/modules/posts/post-media.service.js";

// Run from a trusted scheduled job; uploads older than one day are discarded
// only when they have not been attached to a published post.
try {
  const result = await createPostMediaService({
    prisma, storage: createPostMediaStorage(),
  }).cleanupDrafts();
  console.log("Post attachment maintenance:", result);
} catch {
  console.error("Post attachment maintenance could not complete. Check the private media bucket.");
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
