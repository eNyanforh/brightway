CREATE TABLE "AccountEmailChallenge" (
  "accountId" TEXT NOT NULL PRIMARY KEY,
  "email" VARCHAR(254) NOT NULL,
  "nonce" TEXT NOT NULL,
  "codeHash" VARCHAR(64),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "AccountEmailChallenge_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
