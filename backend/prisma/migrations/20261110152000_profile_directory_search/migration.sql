-- Search public career/profile descriptions without reading private contact fields.
CREATE INDEX "Profile_directory_public_text_search_idx" ON "Profile" USING GIN (
  to_tsvector('simple', coalesce("headline", '') || ' ' ||
    coalesce("careerField", '') || ' ' || coalesce("bio", ''))
);
