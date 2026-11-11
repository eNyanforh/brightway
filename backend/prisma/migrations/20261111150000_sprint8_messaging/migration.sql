-- CreateTable
CREATE TABLE "MessagingConversation" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "leftAccountId" TEXT,
    "rightAccountId" TEXT,
    "recipientAccountId" TEXT,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessagingConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectMessage" (
    "sequence" BIGSERIAL NOT NULL,
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderAccountId" TEXT,
    "senderStaffId" TEXT,
    "requestKey" VARCHAR(36) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "body" VARCHAR(4000) NOT NULL,
    "shareKind" TEXT,
    "shareId" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageAttachment" (
    "discardedAt" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "messageId" TEXT,
    "storageKey" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "contentType" VARCHAR(80) NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessagingPreference" (
    "accountId" TEXT NOT NULL,
    "showActive" BOOLEAN NOT NULL DEFAULT false,
    "showTyping" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MessagingPreference_pkey" PRIMARY KEY ("accountId")
);

-- CreateTable
CREATE TABLE "MessagingPresence" (
    "accountId" TEXT NOT NULL,
    "lastActiveAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessagingPresence_pkey" PRIMARY KEY ("accountId")
);

-- CreateTable
CREATE TABLE "PlatformNotification" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "kind" VARCHAR(60) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "href" VARCHAR(300) NOT NULL,
    "actorAccountId" TEXT,
    "readAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessagingTyping" (
    "conversationId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessagingTyping_pkey" PRIMARY KEY ("conversationId","accountId")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessagingConversation_key_key" ON "MessagingConversation"("key");

-- CreateIndex
CREATE INDEX "MessagingConversation_leftAccountId_updatedAt_id_idx" ON "MessagingConversation"("leftAccountId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "MessagingConversation_rightAccountId_updatedAt_id_idx" ON "MessagingConversation"("rightAccountId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "MessagingConversation_recipientAccountId_updatedAt_id_idx" ON "MessagingConversation"("recipientAccountId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "MessagingConversation_organizationId_updatedAt_id_idx" ON "MessagingConversation"("organizationId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "DirectMessage_conversationId_createdAt_id_idx" ON "DirectMessage"("conversationId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "DirectMessage_conversationId_requestKey_key" ON "DirectMessage"("conversationId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "MessageAttachment_storageKey_key" ON "MessageAttachment"("storageKey");

-- CreateIndex
CREATE INDEX "MessageAttachment_ownerId_createdAt_idx" ON "MessageAttachment"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "MessageAttachment_conversationId_messageId_idx" ON "MessageAttachment"("conversationId", "messageId");

-- CreateIndex
CREATE INDEX "MessagingPresence_lastActiveAt_idx" ON "MessagingPresence"("lastActiveAt");

-- CreateIndex
CREATE INDEX "PlatformNotification_recipientId_createdAt_id_idx" ON "PlatformNotification"("recipientId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformNotification_recipientId_eventKey_key" ON "PlatformNotification"("recipientId", "eventKey");

-- CreateIndex
CREATE INDEX "MessagingTyping_expiresAt_idx" ON "MessagingTyping"("expiresAt");

-- AddForeignKey
ALTER TABLE "MessagingConversation" ADD CONSTRAINT "MessagingConversation_leftAccountId_fkey" FOREIGN KEY ("leftAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingConversation" ADD CONSTRAINT "MessagingConversation_rightAccountId_fkey" FOREIGN KEY ("rightAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingConversation" ADD CONSTRAINT "MessagingConversation_recipientAccountId_fkey" FOREIGN KEY ("recipientAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingConversation" ADD CONSTRAINT "MessagingConversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "MessagingConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_senderAccountId_fkey" FOREIGN KEY ("senderAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_senderStaffId_fkey" FOREIGN KEY ("senderStaffId") REFERENCES "ManagementStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "MessagingConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "DirectMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingPreference" ADD CONSTRAINT "MessagingPreference_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingPresence" ADD CONSTRAINT "MessagingPresence_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformNotification" ADD CONSTRAINT "PlatformNotification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "DirectMessage_sequence_key" ON "DirectMessage"("sequence");

-- Database-level shape, sender and receipt invariants supplement HTTP validation.
ALTER TABLE "MessagingConversation" ADD CONSTRAINT "MessagingConversation_shape" CHECK (
  (kind = 'DIRECT' AND "leftAccountId" IS NOT NULL AND "rightAccountId" IS NOT NULL AND "leftAccountId" < "rightAccountId" AND "recipientAccountId" IS NULL AND "organizationId" IS NULL)
  OR (kind = 'OFFICIAL_USER' AND "recipientAccountId" IS NOT NULL AND "leftAccountId" IS NULL AND "rightAccountId" IS NULL AND "organizationId" IS NULL)
  OR (kind = 'OFFICIAL_ORGANIZATION' AND "organizationId" IS NOT NULL AND "leftAccountId" IS NULL AND "rightAccountId" IS NULL AND "recipientAccountId" IS NULL)
);
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_sender" CHECK (("senderAccountId" IS NULL) <> ("senderStaffId" IS NULL));
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_receipts" CHECK (("deliveredAt" IS NULL OR "deliveredAt" >= "createdAt") AND ("readAt" IS NULL OR ("deliveredAt" IS NOT NULL AND "readAt" >= "deliveredAt")));
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_size" CHECK (size > 0 AND size <= 5242880);
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_type" CHECK ("contentType" IN ('image/webp', 'application/pdf'));
ALTER TABLE "MessagingTyping" ADD CONSTRAINT "MessagingTyping_conversation_fkey" FOREIGN KEY ("conversationId") REFERENCES "MessagingConversation"(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessagingTyping" ADD CONSTRAINT "MessagingTyping_account_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"(id) ON DELETE CASCADE ON UPDATE CASCADE;

-- Content and actual sender cannot be rewritten after send. Receipts only advance.
CREATE FUNCTION brightway_message_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.sequence, NEW.id, NEW."conversationId", NEW."senderAccountId", NEW."senderStaffId", NEW."requestKey", NEW."requestHash", NEW.body, NEW."shareKind", NEW."shareId", NEW."createdAt") IS DISTINCT FROM ROW(OLD.sequence, OLD.id, OLD."conversationId", OLD."senderAccountId", OLD."senderStaffId", OLD."requestKey", OLD."requestHash", OLD.body, OLD."shareKind", OLD."shareId", OLD."createdAt")
    OR (OLD."deliveredAt" IS NOT NULL AND NEW."deliveredAt" IS DISTINCT FROM OLD."deliveredAt")
    OR (OLD."readAt" IS NOT NULL AND NEW."readAt" IS DISTINCT FROM OLD."readAt") THEN
    RAISE EXCEPTION 'Sent messages and existing receipts are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER brightway_message_immutable BEFORE UPDATE ON "DirectMessage" FOR EACH ROW EXECUTE FUNCTION brightway_message_immutable();

CREATE TABLE "MessagingUploadAttempt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "inputSize" INTEGER NOT NULL CHECK ("inputSize" > 0 AND "inputSize" <= 5242880),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "MessagingUploadAttempt_accountId_createdAt_idx" ON "MessagingUploadAttempt"("accountId", "createdAt");
