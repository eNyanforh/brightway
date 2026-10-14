
import { Router } from "express";

import { getHealth } from "../controllers/health.controller.js";
import { getDatabaseHealth } from "../controllers/database.controller.js";
import { prisma } from "../config/database.js";
import { createAuthRoutes } from "../modules/auth/auth.routes.js";
import { createRegistrationService } from "../modules/auth/registration.service.js";
import { env } from "../config/env.js";
import { createSessionRoutes } from "../modules/auth/session.routes.js";
import { createSessionService } from "../modules/auth/session.service.js";
import { createProfileRoutes } from "../modules/profile/profile.routes.js";
import { createProfileService } from "../modules/profile/profile.service.js";
import { createPhotoService } from "../modules/photos/photo.service.js";
import { createR2Storage } from "../modules/photos/photo.storage.js";
import { createPhotoRoutes } from "../modules/photos/photo.routes.js";

const router = Router();
const sessions = createSessionService({ prisma });
const photos = createPhotoService({ prisma, storage: createR2Storage() });

router.use(createPhotoRoutes({ photos, sessions, clientUrl: env.CLIENT_URL, nodeEnv: env.NODE_ENV }));

router.use("/auth", createAuthRoutes({
  register: createRegistrationService({ prisma, photos }),
  clientUrl: env.CLIENT_URL,
  nodeEnv: env.NODE_ENV,
}));

router.use("/auth", createSessionRoutes({
  sessions,
  clientUrl: env.CLIENT_URL,
  nodeEnv: env.NODE_ENV,
}));

router.use("/profile", createProfileRoutes({
  profiles: createProfileService({ prisma }),
  sessions,
  clientUrl: env.CLIENT_URL,
  nodeEnv: env.NODE_ENV,
}));

// Application health check
router.get("/health", getHealth);

// Database connectivity health check
router.get("/health/database", getDatabaseHealth);

export default router;