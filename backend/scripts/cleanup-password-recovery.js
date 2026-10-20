import "dotenv/config";
import { prisma } from "../src/config/database.js";
try {
  const now = new Date();
  const result = await prisma.passwordResetChallenge.deleteMany({ where: { expiresAt: { lt: now }, lastRequestedAt: { lt: new Date(+now - 86400000) } } });
  console.log(`Removed ${result.count} expired password recovery challenges. Recovery audit was retained.`);
} catch {
  console.error("Password recovery cleanup failed. Check database connectivity and migrations.");
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
