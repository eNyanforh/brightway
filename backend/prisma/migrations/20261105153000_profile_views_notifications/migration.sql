ALTER TABLE "Profile"
  ADD COLUMN "profilePublicEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ProfileViewNotification" (
  "id" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "viewerId" TEXT NOT NULL,
  "viewedOn" DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMP(3),
  CONSTRAINT "ProfileViewNotification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProfileViewNotification_not_self_check" CHECK ("recipientId" <> "viewerId"),
  CONSTRAINT "ProfileViewNotification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProfileViewNotification_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProfileViewNotification_recipientId_viewerId_viewedOn_key"
  ON "ProfileViewNotification"("recipientId", "viewerId", "viewedOn");
CREATE INDEX "ProfileViewNotification_recipientId_readAt_createdAt_id_idx"
  ON "ProfileViewNotification"("recipientId", "readAt", "createdAt", "id");
CREATE INDEX "ProfileViewNotification_viewerId_createdAt_idx"
  ON "ProfileViewNotification"("viewerId", "createdAt");
