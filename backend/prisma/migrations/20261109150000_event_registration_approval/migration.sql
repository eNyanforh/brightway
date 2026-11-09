-- Existing event registrations retain confirmed attendance.
CREATE TYPE "EventRegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "EventRegistration"
  ADD COLUMN "status" "EventRegistrationStatus" NOT NULL DEFAULT 'APPROVED';

CREATE INDEX "EventRegistration_memberPostId_status_createdAt_idx"
  ON "EventRegistration"("memberPostId", "status", "createdAt");
