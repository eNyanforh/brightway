-- Expand the same privacy-safe public profile search index.
-- Only publicly visible profile fields are included; no email or phone indexes.
DROP INDEX IF EXISTS "Profile_directory_public_text_search_idx";
CREATE INDEX "Profile_directory_public_text_search_idx" ON "Profile" USING GIN (
  to_tsvector('simple', coalesce("headline", '') || ' ' ||
    coalesce("careerField", '') || ' ' || coalesce("bio", '') || ' ' ||
    coalesce(array_to_string("skills", ' '), '') || ' ' ||
    coalesce(array_to_string("interests", ' '), '') || ' ' ||
    coalesce("locality", '') || ' ' || coalesce("region", ''))
);
