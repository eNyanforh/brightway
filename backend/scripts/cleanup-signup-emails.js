import "dotenv/config";
import { prisma } from "../src/config/database.js";
import { createSignupEmailService } from "../src/modules/auth/signup-email.service.js";
try {
  const result = await createSignupEmailService({ prisma }).cleanup();
  console.log(`Removed ${result.count} expired email delivery limits.`);
} finally { await prisma.$disconnect(); }
