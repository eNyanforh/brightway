import { createManualIdentityReviewService } from "../modules/manual-identity/manual-identity-review.service.js";
import { createManualIdentityReviewRoutes } from "../modules/manual-identity/manual-identity-review.routes.js";
import { createManualIdentityEvidenceService } from "../modules/manual-identity/manual-identity-evidence.service.js";
import { createManualIdentityEvidenceRoutes } from "../modules/manual-identity/manual-identity-evidence.routes.js";
import { createManualIdentityStorage } from "../modules/manual-identity/manual-identity.storage.js";
import { createIdentityService } from "../modules/identity/identity.service.js";
import { createIdentityRoutes } from "../modules/identity/identity.routes.js";
import { createMfaService } from "../modules/auth/mfa.service.js";
import { createMfaRoutes } from "../modules/auth/mfa.routes.js";
import { createPasswordResetService } from "../modules/auth/password-reset.service.js";
import { createPasswordResetRoutes } from "../modules/auth/password-reset.routes.js";

import { createCredentialService } from "../modules/credentials/credential.service.js";
import { createCredentialRoutes } from "../modules/credentials/credential.routes.js";
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

import { createAccountEmailService } from "../modules/auth/account-email.service.js";
import { createAccountEmailRoutes } from "../modules/auth/account-email.routes.js";
import { createSignupEmailService } from "../modules/auth/signup-email.service.js";
import { createSignupEmailRoutes } from "../modules/auth/signup-email.routes.js";

const router = Router();
router.use("/auth", createPasswordResetRoutes({ recovery: createPasswordResetService({ prisma }), clientUrl: env.CLIENT_URL, nodeEnv: env.NODE_ENV }));
const verification = createSignupEmailService({ prisma });
router.use("/auth", createSignupEmailRoutes({ verification, clientUrl: env.CLIENT_URL, nodeEnv: env.NODE_ENV }));
const mfa = createMfaService({ prisma });
const sessions = createSessionService({ prisma, mfa });
router.use(createIdentityRoutes({ identity: createIdentityService({ prisma }), sessions, clientUrl: env.CLIENT_URL, nodeEnv: env.NODE_ENV }));
router.use("/auth", createMfaRoutes({ mfa, sessions, clientUrl: env.CLIENT_URL, nodeEnv: env.NODE_ENV }));
router.use("/auth", createAccountEmailRoutes({ verification: createAccountEmailService({ prisma }), sessions, clientUrl: env.CLIENT_URL, nodeEnv: env.NODE_ENV }));
router.use(createCredentialRoutes({ credentials: createCredentialService({ prisma, storage: createR2Storage() }), sessions, clientUrl: env.CLIENT_URL, nodeEnv: env.NODE_ENV }));
router.use(createManualIdentityEvidenceRoutes({ evidence: createManualIdentityEvidenceService({ prisma, storage: createManualIdentityStorage() }), sessions, clientUrl: env.CLIENT_URL, nodeEnv: env.NODE_ENV }));
router.use(createManualIdentityReviewRoutes({ reviews: createManualIdentityReviewService({ prisma, storage: createManualIdentityStorage() }), sessions, clientUrl: env.CLIENT_URL, nodeEnv: env.NODE_ENV }));
const photos = createPhotoService({ prisma, storage: createR2Storage() });

router.use(createPhotoRoutes({ photos, sessions, clientUrl: env.CLIENT_URL, nodeEnv: env.NODE_ENV }));

router.use("/auth", createAuthRoutes({
  register: createRegistrationService({ prisma, photos, verification }),
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