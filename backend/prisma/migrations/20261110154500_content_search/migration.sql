-- Support full-text discovery of published community content.
-- Do not index event meeting links or private registration details.
CREATE INDEX "MemberPost_public_content_search_idx" ON "MemberPost" USING GIN (
  to_tsvector('simple', "body" || ' ' ||
    coalesce("eventDetails"->>'title', '') || ' ' ||
    coalesce("questionDetails"->>'title', ''))
) WHERE "withdrawnAt" IS NULL AND "type" IN ('ACHIEVEMENT','QUESTION','EVENT');
