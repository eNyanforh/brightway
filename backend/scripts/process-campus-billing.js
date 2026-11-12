// Run hourly with the same runtime environment as the API. Safe to retry/overlap.
import { prisma } from "../src/config/database.js";
import { createBillingService } from "../src/modules/billing/billing.service.js";
try { console.log(JSON.stringify(await createBillingService({ prisma }).processNotices())); }
catch { console.error("Campus billing notice processing failed; retry and inspect the billing audit."); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
