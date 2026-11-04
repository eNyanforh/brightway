CREATE TYPE "NetworkStatus" AS ENUM ('NONE', 'PENDING', 'CONNECTED');
CREATE TABLE "NetworkPair" (
  "id" TEXT PRIMARY KEY,
  "leftAccountId" TEXT NOT NULL REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "rightAccountId" TEXT NOT NULL REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "requestedById" TEXT REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "status" "NetworkStatus" NOT NULL DEFAULT 'NONE',
  "leftBlocked" BOOLEAN NOT NULL DEFAULT false,
  "rightBlocked" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 0,
  "lastRequestedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NetworkPair_ordered_accounts" CHECK ("leftAccountId" < "rightAccountId"),
  CONSTRAINT "NetworkPair_pending_requester" CHECK (("status" = 'PENDING' AND "requestedById" IS NOT NULL AND "requestedById" IN ("leftAccountId", "rightAccountId")) OR ("status" <> 'PENDING' AND "requestedById" IS NULL)),
  CONSTRAINT "NetworkPair_block_ends_connection" CHECK (NOT ("leftBlocked" OR "rightBlocked") OR "status" = 'NONE'),
  CONSTRAINT "NetworkPair_version" CHECK ("version" >= 0)
);
CREATE UNIQUE INDEX "NetworkPair_leftAccountId_rightAccountId_key" ON "NetworkPair"("leftAccountId", "rightAccountId");
CREATE INDEX "NetworkPair_leftAccountId_status_updatedAt_id_idx" ON "NetworkPair"("leftAccountId", "status", "updatedAt", "id");
CREATE INDEX "NetworkPair_rightAccountId_status_updatedAt_id_idx" ON "NetworkPair"("rightAccountId", "status", "updatedAt", "id");
CREATE TABLE "NetworkEvent" (
  "id" TEXT PRIMARY KEY,
  "pairId" TEXT NOT NULL REFERENCES "NetworkPair"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "actorId" TEXT NOT NULL REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "action" VARCHAR(16) NOT NULL,
  "requestKey" VARCHAR(36) NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL,
  "resultVersion" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NetworkEvent_action" CHECK ("action" IN ('REQUEST','ACCEPT','DECLINE','CANCEL','REMOVE','BLOCK','UNBLOCK'))
);
CREATE UNIQUE INDEX "NetworkEvent_actorId_requestKey_key" ON "NetworkEvent"("actorId", "requestKey");
CREATE INDEX "NetworkEvent_actorId_action_createdAt_idx" ON "NetworkEvent"("actorId", "action", "createdAt");
CREATE INDEX "NetworkEvent_actorId_createdAt_idx" ON "NetworkEvent"("actorId", "createdAt");
CREATE INDEX "NetworkEvent_pairId_createdAt_idx" ON "NetworkEvent"("pairId", "createdAt");
