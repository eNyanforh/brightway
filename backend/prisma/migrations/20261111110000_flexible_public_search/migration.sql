-- Rebuild the GIN index using only immutable operations on public profile text.
-- Skills/interests remain searchable in the service, but cannot be embedded
-- into this expression index through PostgreSQL's stable array_to_string().
-- No personal email, phone, or private contact fields are indexed.
DROP INDEX IF EXISTS "Profile_directory_public_text_search_idx";
CREATE INDEX "Profile_directory_public_text_search_idx" ON "Profile" USING GIN (
  to_tsvector('simple', coalesce("headline", '') || ' ' ||
    coalesce("careerField", '') || ' ' || coalesce("bio", '') || ' ' ||
    coalesce("locality", '') || ' ' || coalesce("region", ''))
);
