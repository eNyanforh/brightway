CREATE TABLE "ScholarshipEditorDraft" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScholarshipEditorDraft_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ScholarshipEditorDraft_organizationId_authorId_key"
  ON "ScholarshipEditorDraft"("organizationId", "authorId");
CREATE INDEX "ScholarshipEditorDraft_authorId_updatedAt_idx"
  ON "ScholarshipEditorDraft"("authorId", "updatedAt");
ALTER TABLE "ScholarshipEditorDraft"
  ADD CONSTRAINT "ScholarshipEditorDraft_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScholarshipEditorDraft"
  ADD CONSTRAINT "ScholarshipEditorDraft_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
