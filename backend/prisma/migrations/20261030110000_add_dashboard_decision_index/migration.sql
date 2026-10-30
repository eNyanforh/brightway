CREATE INDEX "CredentialAttempt_issuer_decided_review_idx" ON "CredentialAttempt"("issuerOrganizationId", "decidedAt", "reviewId");
