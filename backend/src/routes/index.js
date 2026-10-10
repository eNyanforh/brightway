
import { Router } from "express";

import { getHealth } from "../controllers/health.controller.js";
import { getDatabaseHealth } from "../controllers/database.controller.js";
import { prisma } from "../config/database.js";
import { createAuthRoutes } from "../modules/auth/auth.routes.js";
import { createRegistrationService } from "../modules/auth/registration.service.js";
import { env } from "../config/env.js";
import { createSessionRoutes } from "../modules/auth/session.routes.js";
import { createSessionService } from "../modules/auth/session.service.js";

const router = Router();

router.use("/auth", createAuthRoutes({
  register: createRegistrationService({ prisma }),
}));

router.use("/auth", createSessionRoutes({
  sessions: createSessionService({ prisma }),
  clientUrl: env.CLIENT_URL,
  nodeEnv: env.NODE_ENV,
}));

// Application health check
router.get("/health", getHealth);

// Database connectivity health check
router.get("/health/database", getDatabaseHealth);

export default router;
