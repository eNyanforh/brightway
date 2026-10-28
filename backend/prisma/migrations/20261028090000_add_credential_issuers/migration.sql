BEGIN;
ALTER TABLE "CredentialReview" ADD COLUMN "issuerOrganizationId" TEXT, ADD COLUMN "issuerName" VARCHAR(160);
ALTER TABLE "CredentialAttempt" ADD COLUMN "issuerOrganizationId" TEXT, ADD COLUMN "issuerName" VARCHAR(160);
ALTER TABLE "CredentialReview" ADD CONSTRAINT "CredentialReview_issuerOrganizationId_fkey" FOREIGN KEY ("issuerOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CredentialAttempt" ADD CONSTRAINT "CredentialAttempt_issuerOrganizationId_fkey" FOREIGN KEY ("issuerOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CredentialReview" ADD CONSTRAINT "CredentialReview_issuer_pair" CHECK (("issuerOrganizationId" IS NULL) = ("issuerName" IS NULL));
ALTER TABLE "CredentialAttempt" ADD CONSTRAINT "CredentialAttempt_issuer_pair" CHECK (("issuerOrganizationId" IS NULL) = ("issuerName" IS NULL));
CREATE INDEX "CredentialReview_issuer_kind_submitted_id_idx" ON "CredentialReview"("issuerOrganizationId", "kind", "initialSubmittedAt", "id");
COMMIT;
