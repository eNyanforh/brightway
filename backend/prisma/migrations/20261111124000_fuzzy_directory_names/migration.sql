-- Indexed nearest-neighbor searches for incomplete and misspelled public names.
-- GiST trigram indexes support distance ordering and substring queries.
-- No email, phone or private profile fields enter these indexes.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
-- Historical migration tests replay into an isolated schema whose search_path
-- omits public. Keep their table schema first, then expose extension opclasses.
SELECT set_config('search_path', format('%I, public, extensions', current_schema()), false);

CREATE INDEX "Person_directory_full_name_trgm_idx" ON "Person" USING GIST (
  (lower("firstName" || ' ' || coalesce("middleName", '') || ' ' || "lastName")) gist_trgm_ops
);
CREATE INDEX "Person_directory_first_name_trgm_idx" ON "Person" USING GIST (
  (lower("firstName")) gist_trgm_ops
);
CREATE INDEX "Person_directory_last_name_trgm_idx" ON "Person" USING GIST (
  (lower("lastName")) gist_trgm_ops
);
CREATE INDEX "Account_directory_handle_trgm_idx" ON "Account" USING GIST (
  (lower("username")) gist_trgm_ops
) WHERE "status" = 'ACTIVE';
CREATE INDEX "Organization_directory_name_trgm_idx" ON "Organization" USING GIST (
  (lower("name")) gist_trgm_ops
) WHERE "status" = 'ACTIVE' AND "profileReadyAt" IS NOT NULL;
