-- Permit reporting published organization posts without changing existing member reports.
ALTER TABLE "PostReport"
  ALTER COLUMN "memberPostId" DROP NOT NULL,
  ADD COLUMN "organizationPostId" TEXT;

ALTER TABLE "PostReport"
  ADD CONSTRAINT "PostReport_organizationPostId_fkey"
  FOREIGN KEY ("organizationPostId") REFERENCES "OrganizationPost"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "PostReport_organizationPostId_reporterId_key"
  ON "PostReport"("organizationPostId", "reporterId");

ALTER TABLE "PostReport"
  ADD CONSTRAINT "PostReport_exactly_one_post_target_check"
  CHECK (num_nonnulls("memberPostId", "organizationPostId") = 1);
