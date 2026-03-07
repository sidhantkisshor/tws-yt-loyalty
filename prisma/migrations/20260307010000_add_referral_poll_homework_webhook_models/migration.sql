-- CreateEnum
CREATE TYPE "HomeworkStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AddForeignKey (self-referential relation for viewer referrals)
ALTER TABLE "Viewer" ADD CONSTRAINT "Viewer_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "Viewer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "referredId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "referredAttended" BOOLEAN NOT NULL DEFAULT false,
    "referredPurchased" BOOLEAN NOT NULL DEFAULT false,
    "referrerPointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "referredPointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "convertedAt" TIMESTAMP(3),

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreamPoll" (
    "id" TEXT NOT NULL,
    "streamId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreamPoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollResponse" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "selectedOption" INTEGER NOT NULL,
    "pointsAwarded" INTEGER NOT NULL DEFAULT 15,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomeworkSubmission" (
    "id" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "imageUrl" TEXT,
    "status" "HomeworkStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "pointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "HomeworkSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookConfig" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" JSONB NOT NULL,
    "secret" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggeredAt" TIMESTAMP(3),
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "statusCode" INTEGER,
    "response" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpfulUpvote" (
    "id" TEXT NOT NULL,
    "giverId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "streamId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpfulUpvote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreakPause" (
    "id" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "pauseType" TEXT NOT NULL,
    "pointsCost" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "wasUsed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreakPause_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Referral_referrerId_idx" ON "Referral"("referrerId");

-- CreateIndex
CREATE INDEX "Referral_referredId_idx" ON "Referral"("referredId");

-- CreateIndex
CREATE INDEX "Referral_channelId_idx" ON "Referral"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_referrerId_referredId_channelId_key" ON "Referral"("referrerId", "referredId", "channelId");

-- CreateIndex
CREATE INDEX "StreamPoll_streamId_idx" ON "StreamPoll"("streamId");

-- CreateIndex
CREATE INDEX "PollResponse_viewerId_idx" ON "PollResponse"("viewerId");

-- CreateIndex
CREATE UNIQUE INDEX "PollResponse_pollId_viewerId_key" ON "PollResponse"("pollId", "viewerId");

-- CreateIndex
CREATE INDEX "HomeworkSubmission_viewerId_idx" ON "HomeworkSubmission"("viewerId");

-- CreateIndex
CREATE INDEX "HomeworkSubmission_channelId_idx" ON "HomeworkSubmission"("channelId");

-- CreateIndex
CREATE INDEX "HomeworkSubmission_status_idx" ON "HomeworkSubmission"("status");

-- CreateIndex
CREATE INDEX "WebhookConfig_channelId_idx" ON "WebhookConfig"("channelId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_webhookId_idx" ON "WebhookDelivery"("webhookId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_event_idx" ON "WebhookDelivery"("event");

-- CreateIndex
CREATE INDEX "HelpfulUpvote_receiverId_idx" ON "HelpfulUpvote"("receiverId");

-- CreateIndex
CREATE INDEX "HelpfulUpvote_streamId_idx" ON "HelpfulUpvote"("streamId");

-- CreateIndex
CREATE UNIQUE INDEX "HelpfulUpvote_giverId_receiverId_streamId_key" ON "HelpfulUpvote"("giverId", "receiverId", "streamId");

-- CreateIndex
CREATE INDEX "StreakPause_viewerId_idx" ON "StreakPause"("viewerId");

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "Viewer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredId_fkey" FOREIGN KEY ("referredId") REFERENCES "Viewer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamPoll" ADD CONSTRAINT "StreamPoll_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "Stream"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollResponse" ADD CONSTRAINT "PollResponse_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "StreamPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollResponse" ADD CONSTRAINT "PollResponse_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "Viewer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeworkSubmission" ADD CONSTRAINT "HomeworkSubmission_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "Viewer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeworkSubmission" ADD CONSTRAINT "HomeworkSubmission_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookConfig" ADD CONSTRAINT "WebhookConfig_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpfulUpvote" ADD CONSTRAINT "HelpfulUpvote_giverId_fkey" FOREIGN KEY ("giverId") REFERENCES "Viewer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpfulUpvote" ADD CONSTRAINT "HelpfulUpvote_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "Viewer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpfulUpvote" ADD CONSTRAINT "HelpfulUpvote_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "Stream"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreakPause" ADD CONSTRAINT "StreakPause_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "Viewer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
