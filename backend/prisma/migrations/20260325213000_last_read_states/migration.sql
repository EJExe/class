CREATE TABLE "ChannelReadState" (
  "id" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ChannelReadState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssignmentReadState" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AssignmentReadState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChannelReadState_channelId_userId_key" ON "ChannelReadState"("channelId", "userId");
CREATE INDEX "ChannelReadState_userId_lastReadAt_idx" ON "ChannelReadState"("userId", "lastReadAt");
CREATE UNIQUE INDEX "AssignmentReadState_assignmentId_userId_key" ON "AssignmentReadState"("assignmentId", "userId");
CREATE INDEX "AssignmentReadState_userId_lastReadAt_idx" ON "AssignmentReadState"("userId", "lastReadAt");

ALTER TABLE "ChannelReadState" ADD CONSTRAINT "ChannelReadState_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChannelReadState" ADD CONSTRAINT "ChannelReadState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssignmentReadState" ADD CONSTRAINT "AssignmentReadState_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssignmentReadState" ADD CONSTRAINT "AssignmentReadState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
