-- Purpose-driven engagement: one registration per member, answer voting, moderation and unique view tracking.
CREATE TYPE "PostReportReason" AS ENUM ('SPAM', 'HARASSMENT', 'MISINFORMATION', 'OTHER');

CREATE TABLE "EventRegistration" (
  "id" TEXT NOT NULL, "memberPostId" TEXT NOT NULL, "accountId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventRegistration_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EventRegistration_memberPostId_accountId_key" ON "EventRegistration"("memberPostId","accountId");
CREATE INDEX "EventRegistration_accountId_createdAt_idx" ON "EventRegistration"("accountId","createdAt");
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_memberPostId_fkey" FOREIGN KEY ("memberPostId") REFERENCES "MemberPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "QuestionAnswer" (
  "id" TEXT NOT NULL, "questionId" TEXT NOT NULL, "authorId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL, "body" VARCHAR(2000) NOT NULL, "score" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "deletedAt" TIMESTAMP(3),
  CONSTRAINT "QuestionAnswer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QuestionAnswer_authorId_requestKey_key" ON "QuestionAnswer"("authorId","requestKey");
CREATE INDEX "QuestionAnswer_questionId_deletedAt_createdAt_id_idx" ON "QuestionAnswer"("questionId","deletedAt","createdAt","id");
ALTER TABLE "QuestionAnswer" ADD CONSTRAINT "QuestionAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "MemberPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionAnswer" ADD CONSTRAINT "QuestionAnswer_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AnswerVote" (
  "id" TEXT NOT NULL, "answerId" TEXT NOT NULL, "accountId" TEXT NOT NULL, "value" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnswerVote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AnswerVote_value_check" CHECK ("value" IN (-1,1))
);
CREATE UNIQUE INDEX "AnswerVote_answerId_accountId_key" ON "AnswerVote"("answerId","accountId");
CREATE INDEX "AnswerVote_accountId_idx" ON "AnswerVote"("accountId");
ALTER TABLE "AnswerVote" ADD CONSTRAINT "AnswerVote_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "QuestionAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnswerVote" ADD CONSTRAINT "AnswerVote_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AnswerComment" (
  "id" TEXT NOT NULL, "answerId" TEXT NOT NULL, "authorId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL, "body" VARCHAR(1000) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "deletedAt" TIMESTAMP(3),
  CONSTRAINT "AnswerComment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AnswerComment_authorId_requestKey_key" ON "AnswerComment"("authorId","requestKey");
CREATE INDEX "AnswerComment_answerId_deletedAt_createdAt_id_idx" ON "AnswerComment"("answerId","deletedAt","createdAt","id");
ALTER TABLE "AnswerComment" ADD CONSTRAINT "AnswerComment_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "QuestionAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnswerComment" ADD CONSTRAINT "AnswerComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PostView" (
  "id" TEXT NOT NULL, "accountId" TEXT NOT NULL, "memberPostId" TEXT, "organizationPostId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostView_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PostView_exactly_one_source_check" CHECK (("memberPostId" IS NOT NULL) <> ("organizationPostId" IS NOT NULL))
);
CREATE UNIQUE INDEX "PostView_memberPostId_accountId_key" ON "PostView"("memberPostId","accountId");
CREATE UNIQUE INDEX "PostView_organizationPostId_accountId_key" ON "PostView"("organizationPostId","accountId");
CREATE INDEX "PostView_accountId_idx" ON "PostView"("accountId");
ALTER TABLE "PostView" ADD CONSTRAINT "PostView_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostView" ADD CONSTRAINT "PostView_memberPostId_fkey" FOREIGN KEY ("memberPostId") REFERENCES "MemberPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostView" ADD CONSTRAINT "PostView_organizationPostId_fkey" FOREIGN KEY ("organizationPostId") REFERENCES "OrganizationPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PostReport" (
  "id" TEXT NOT NULL, "memberPostId" TEXT NOT NULL, "reporterId" TEXT NOT NULL,
  "reason" "PostReportReason" NOT NULL, "details" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PostReport_memberPostId_reporterId_key" ON "PostReport"("memberPostId","reporterId");
CREATE INDEX "PostReport_createdAt_idx" ON "PostReport"("createdAt");
ALTER TABLE "PostReport" ADD CONSTRAINT "PostReport_memberPostId_fkey" FOREIGN KEY ("memberPostId") REFERENCES "MemberPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostReport" ADD CONSTRAINT "PostReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
