import { createMessagingService } from "../modules/messaging/messaging.service.js";
import { createMessagingRoutes } from "../modules/messaging/messaging.routes.js";
import { createMessageStorage } from "../modules/messaging/messaging.storage.js";
import { createLearningService } from "../modules/learning/learning.service.js";
import { createLearningRoutes } from "../modules/learning/learning.routes.js";
import { createFollowingService } from "../modules/network/network-follow.service.js";
import { createNetworkService } from "../modules/network/network.service.js";
import { createNetworkRoutes } from "../modules/network/network.routes.js";
import { createManagementOperations } from "../modules/management/management-operations.service.js";
import { createManagementCases } from "../modules/management/management-cases.service.js";
import { createManagementOperationsRoutes, createSupportRoutes } from "../modules/management/management-operations.routes.js";
import { createManagementAuth } from "../modules/management/management-auth.service.js";
import { createManagementEmail } from "../modules/management/management-email.js";
import { createManagementAuthRoutes } from "../modules/management/management-auth.http.js";
import { createManagementService } from "../modules/management/management-access.service.js";
import { createManagementRoutes } from "../modules/management/management.routes.js";
import { createOrganizationProfileService } from "../modules/organizations/organization-profile.service.js";
import { createOrganizationProfileRoutes } from "../modules/organizations/organization-profile.routes.js";
import { createOrganizationStaffService } from "../modules/organizations/organization-staff.service.js";
import { createOrganizationStaffRoutes } from "../modules/organizations/organization-staff.routes.js";
import { createOrganizationService } from "../modules/organizations/organization.service.js";
import { createOrganizationRoutes } from "../modules/organizations/organization.routes.js";
import { createProfilePhotoReviewService } from "../modules/photos/profile-photo-review.service.js";
import { createIdentityNameChangeService } from "../modules/manual-identity/identity-name-change.service.js";
import { createIdentityNameChangeRoutes } from "../modules/manual-identity/identity-name-change.routes.js";
import { createProfilePhotoReviewRoutes } from "../modules/photos/profile-photo-review.routes.js";
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
import { createOpportunityService } from "../modules/opportunities/opportunity.service.js";
import { createOpportunityRoutes } from "../modules/opportunities/opportunity.routes.js";
import { createApplicationStorage } from "../modules/opportunities/opportunity.storage.js";

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
import { createProfileDashboardService } from "../modules/profile/profile-dashboard.service.js";
import { createPhotoService } from "../modules/photos/photo.service.js";
import { createR2Storage } from "../modules/photos/photo.storage.js";
import { createPhotoRoutes } from "../modules/photos/photo.routes.js";
import { createNotificationsService } from "../modules/notifications/notifications.service.js";
import { createNotificationsRoutes } from "../modules/notifications/notifications.routes.js";
import { createPeopleSuggestions } from "../modules/recommendations/people-suggestions.service.js";
import { createPeopleSuggestionRoutes } from "../modules/recommendations/people-suggestions.routes.js";
import { createDirectorySearch } from "../modules/search/directory-search.service.js";
import { createContentSearch } from "../modules/search/content-search.service.js";
import { createDirectorySearchRoutes } from "../modules/search/directory-search.routes.js";
import { createOrganizationPosts } from "../modules/posts/organization-posts.service.js";
import { createMemberPostModeration } from "../modules/posts/member-post-moderation.service.js";
import { createOrganizationPostRoutes } from "../modules/posts/organization-posts.routes.js";

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
router.use(createOpportunityRoutes({ opportunities: createOpportunityService({ prisma, storage: createApplicationStorage() }), sessions, clientUrl: env.CLIENT_URL, nodeEnv: env.NODE_ENV }));
router.use(createLearningRoutes({ learning: createLearningService({ prisma, storage: createApplicationStorage() }), sessions, clientUrl: env.CLIENT_URL, nodeEnv: env.NODE_ENV }));
const network = createNetworkService({ prisma });
router.use(createNetworkRoutes({ network, following: createFollowingService({ prisma }), sessions, clientUrl: env.CLIENT_URL, nodeEnv: env.NODE_ENV }));
router.use(createNotificationsRoutes({ notifications: createNotificationsService({ prisma }), sessions, clientUrl: env.CLIENT_URL, nodeEnv: env.NODE_ENV }));
const publicPosts = createOrganizationPosts({ prisma });
router.use(createDirectorySearchRoutes({
  search: createDirectorySearch({ prisma }),
  contentSearch: createContentSearch({ prisma, posts: publicPosts }),
  sessions, nodeEnv: env.NODE_ENV,
}));
router.use(createPeopleSuggestionRoutes({ suggest: createPeopleSuggestions({ prisma }), sessions, nodeEnv: env.NODE_ENV }));
const photoStorage = createR2Storage();
const photos = createPhotoService({ prisma, storage: photoStorage });
router.use(createOrganizationPostRoutes({ posts: publicPosts, photos, sessions, clientUrl: env.CLIENT_URL, nodeEnv: env.NODE_ENV }));
const managementCases = createManagementCases({ prisma });
const authentication = createManagementAuth({ prisma, sender: createManagementEmail() });
router.use(createManagementAuthRoutes({ authentication, clientUrl: env.CLIENT_URL, nodeEnv: env.NODE_ENV }));
router.use(createMessagingRoutes({ messaging: createMessagingService({ prisma, storage: createMessageStorage() }), notifications: createNotificationsService({ prisma }), sessions, authentication, clientUrl: env.CLIENT_URL, nodeEnv: env.NODE_ENV }));
router.use(createManagementOperationsRoutes({ operations: createManagementOperations({ prisma }), cases: managementCases, postModeration: createMemberPostModeration({ prisma }), authentication, clientUrl: env.CLIENT_URL, nodeEnv: env.NODE_ENV }));
router.use(createSupportRoutes({ cases: managementCases, sessions, clientUrl: env.CLIENT_URL, nodeEnv: env.NODE_ENV }));
router.use(createManagementRoutes({ management: createManagementService({ prisma }), authentication, nodeEnv: env.NODE_ENV }));
router.use(createOrganizationProfileRoutes({ profiles: createOrganizationProfileService({ prisma, storage: createR2Storage() }), sessions, clientUrl: env.CLIENT_URL, nodeEnv: env.NODE_ENV }));
router.use(createOrganizationStaffRoutes({ staff: createOrganizationStaffService({ prisma, storage: createR2Storage() }), sessions, clientUrl: env.CLIENT_URL, nodeEnv: env.NODE_ENV }));
router.use(createOrganizationRoutes({ organizations: createOrganizationService({ prisma }), sessions, authentication, clientUrl: env.CLIENT_URL, nodeEnv: env.NODE_ENV }));
router.use(createIdentityRoutes({ identity: createIdentityService({ prisma }), sessions, clientUrl: env.CLIENT_URL, nodeEnv: env.NODE_ENV }));
router.use("/auth", createMfaRoutes({ mfa, sessions, clientUrl: env.CLIENT_URL, nodeEnv: env.NODE_ENV }));
router.use("/auth", createAccountEmailRoutes({ verification: createAccountEmailService({ prisma }), sessions, clientUrl: env.CLIENT_URL, nodeEnv: env.NODE_ENV }));
router.use(createCredentialRoutes({ credentials: createCredentialService({ prisma, storage: createR2Storage() }), sessions, authentication, clientUrl: env.CLIENT_URL, nodeEnv: env.NODE_ENV }));
router.use(createManualIdentityEvidenceRoutes({ evidence: createManualIdentityEvidenceService({ prisma, storage: createManualIdentityStorage() }), sessions, clientUrl: env.CLIENT_URL, nodeEnv: env.NODE_ENV }));
router.use(createManualIdentityReviewRoutes({ reviews: createManualIdentityReviewService({ prisma, storage: createManualIdentityStorage() }), sessions, authentication, clientUrl: env.CLIENT_URL, nodeEnv: env.NODE_ENV }));
router.use(createIdentityNameChangeRoutes({ changes: createIdentityNameChangeService({ prisma, storage: createManualIdentityStorage(), photoStorage }), sessions, authentication, clientUrl: env.CLIENT_URL, nodeEnv: env.NODE_ENV }));
router.use(createProfilePhotoReviewRoutes({ reviews: createProfilePhotoReviewService({ prisma, storage: photoStorage }), sessions, authentication, clientUrl: env.CLIENT_URL, nodeEnv: env.NODE_ENV }));

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
  profiles: createProfileService({ prisma, contactReader: network.visibleContact }),
  dashboard: createProfileDashboardService({ prisma }),
  sessions,
  clientUrl: env.CLIENT_URL,
  nodeEnv: env.NODE_ENV,
}));

// Application health check
router.get("/health", getHealth);

// Database connectivity health check
router.get("/health/database", getDatabaseHealth);

export default router;
