-- Trigram indexes support incomplete names and spelling-tolerant suggestions.
-- Only public names and handles are indexed; no emails, phones or private data.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Person_directory_full_name_trgm_idx" ON "Person" USING GIN (
  (lower("firstName" || ' ' || coalesce("middleName", '') || ' ' || "lastName")) gin_trgm_ops
);

CREATE INDEX "Account_directory_handle_trgm_idx" ON "Account" USING GIN (
  (lower("username")) gin_trgm_ops
) WHERE "status" = 'ACTIVE';

CREATE INDEX "Organization_directory_name_trgm_idx" ON "Organization" USING GIN (
  (lower("name")) gin_trgm_ops
) WHERE "status" = 'ACTIVE' AND "profileReadyAt" IS NOT NULL;
