CREATE TABLE "SubmissionFileComment" (
  "id" TEXT NOT NULL,
  "fileId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SubmissionFileComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SubmissionFileComment_fileId_createdAt_idx" ON "SubmissionFileComment"("fileId", "createdAt");

ALTER TABLE "SubmissionFileComment"
ADD CONSTRAINT "SubmissionFileComment_fileId_fkey"
FOREIGN KEY ("fileId") REFERENCES "SubmissionFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SubmissionFileComment"
ADD CONSTRAINT "SubmissionFileComment_authorUserId_fkey"
FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
