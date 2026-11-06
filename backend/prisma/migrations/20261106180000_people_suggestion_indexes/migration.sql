CREATE INDEX "Profile_suggestion_skills_idx" ON "Profile" USING GIN ("skills")
  WHERE "profilePublicEnabled";

CREATE INDEX "Profile_suggestion_interests_idx" ON "Profile" USING GIN ("interests")
  WHERE "profilePublicEnabled";

CREATE INDEX "Profile_suggestion_career_idx" ON "Profile" (lower("careerField"))
  WHERE "profilePublicEnabled" AND "careerField" IS NOT NULL;
