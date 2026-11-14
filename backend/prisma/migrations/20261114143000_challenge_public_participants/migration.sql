-- Applicants are private by default. Only an explicit Challenge opt-in can
-- make an applicant's public profile appear in the participant facepile.
ALTER TABLE "OpportunityApplication"
  ADD COLUMN "publicParticipant" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "OpportunityApplication_opportunityId_publicParticipant_submittedAt_id_idx"
  ON "OpportunityApplication"("opportunityId", "publicParticipant", "submittedAt", "id");
