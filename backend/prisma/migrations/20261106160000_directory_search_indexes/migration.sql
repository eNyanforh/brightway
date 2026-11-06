CREATE INDEX "Person_directory_name_search_idx" ON "Person" USING GIN (
  to_tsvector('simple', "firstName" || ' ' || coalesce("middleName", '') || ' ' || "lastName")
);

CREATE INDEX "Account_directory_username_search_idx" ON "Account" USING GIN (
  to_tsvector('simple', replace("username", '_', ' '))
) WHERE "status" = 'ACTIVE';

CREATE INDEX "Organization_directory_search_idx" ON "Organization" USING GIN (
  to_tsvector('simple', "name" || ' ' || replace(coalesce("username", ''), '_', ' '))
) WHERE "status" = 'ACTIVE' AND "profileReadyAt" IS NOT NULL;
