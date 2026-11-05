CREATE TABLE "NetworkFollow" (
  "id" TEXT PRIMARY KEY,
  "followerId" TEXT NOT NULL REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "targetAccountId" TEXT REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "targetOrganizationId" TEXT REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NetworkFollow_one_target" CHECK (("targetAccountId" IS NULL) <> ("targetOrganizationId" IS NULL)),
  CONSTRAINT "NetworkFollow_not_self" CHECK ("targetAccountId" IS NULL OR "followerId" <> "targetAccountId"),
  CONSTRAINT "NetworkFollow_version" CHECK ("version" >= 0)
);
CREATE UNIQUE INDEX "NetworkFollow_followerId_targetAccountId_key" ON "NetworkFollow"("followerId", "targetAccountId");
CREATE UNIQUE INDEX "NetworkFollow_followerId_targetOrganizationId_key" ON "NetworkFollow"("followerId", "targetOrganizationId");
CREATE INDEX "NetworkFollow_followerId_active_updatedAt_id_idx" ON "NetworkFollow"("followerId", "active", "updatedAt", "id");
CREATE INDEX "NetworkFollow_targetAccountId_active_updatedAt_id_idx" ON "NetworkFollow"("targetAccountId", "active", "updatedAt", "id");
CREATE INDEX "NetworkFollow_targetOrganizationId_active_idx" ON "NetworkFollow"("targetOrganizationId", "active");
CREATE TABLE "NetworkFollowEvent" (
  "id" TEXT PRIMARY KEY,
  "followId" TEXT NOT NULL REFERENCES "NetworkFollow"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "actorId" TEXT NOT NULL REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "action" VARCHAR(16) NOT NULL,
  "requestKey" VARCHAR(36) NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL,
  "resultVersion" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NetworkFollowEvent_action" CHECK ("action" IN ('FOLLOW','UNFOLLOW'))
);
CREATE UNIQUE INDEX "NetworkFollowEvent_actorId_requestKey_key" ON "NetworkFollowEvent"("actorId", "requestKey");
CREATE INDEX "NetworkFollowEvent_actorId_action_createdAt_idx" ON "NetworkFollowEvent"("actorId", "action", "createdAt");
CREATE INDEX "NetworkFollowEvent_actorId_createdAt_idx" ON "NetworkFollowEvent"("actorId", "createdAt");
CREATE INDEX "NetworkFollowEvent_followId_createdAt_idx" ON "NetworkFollowEvent"("followId", "createdAt");
