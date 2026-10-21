import "dotenv/config";
import { prisma } from "../src/config/database.js";
try {
  const timestamp = new Date();
  const challenges = await prisma.mfaLoginChallenge.deleteMany({ where: { expiresAt: { lt: timestamp } } });
  const pending = await prisma.mfaFactor.updateMany({ where: { enabled: false, setupExpiresAt: { lt: timestamp } }, data: { encryptedSecret: "", setupExpiresAt: null } });
  console.log(`Removed ${challenges.count} expired two-factor login challenges and cleared ${pending.count} expired setup secrets. Enabled factors and audit history were retained.`);
} catch { console.error("Two-factor cleanup failed. Check database connectivity and migrations."); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
