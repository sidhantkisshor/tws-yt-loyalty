/*
  Warnings:

  - You are about to drop the column `googleAccessToken` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `googleRefreshToken` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `googleTokenExpiry` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `viewerAccountId` on the `Viewer` table. All the data in the column will be lost.
  - You are about to drop the `PointTransaction` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ViewerAccount` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "WorkspaceMemberRole" AS ENUM ('OWNER', 'ADMIN', 'MODERATOR');

-- CreateEnum
CREATE TYPE "TokenStatus" AS ENUM ('VALID', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "EngagementEventType" AS ENUM ('CHAT_MESSAGE', 'SUPER_CHAT', 'MEMBERSHIP', 'CODE_REDEMPTION', 'ATTENDANCE');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('INGEST_CHAT', 'DAILY_SCORING', 'FRAUD_SCAN', 'BACKFILL');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- DropForeignKey
ALTER TABLE "PointTransaction" DROP CONSTRAINT "PointTransaction_streamId_fkey";

-- DropForeignKey
ALTER TABLE "PointTransaction" DROP CONSTRAINT "PointTransaction_viewerId_fkey";

-- DropForeignKey
ALTER TABLE "Viewer" DROP CONSTRAINT "Viewer_viewerAccountId_fkey";

-- DropIndex
DROP INDEX "Viewer_viewerAccountId_idx";

-- AlterTable
ALTER TABLE "Channel" ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "googleAccessToken",
DROP COLUMN "googleRefreshToken",
DROP COLUMN "googleTokenExpiry";

-- AlterTable
ALTER TABLE "Viewer" DROP COLUMN "viewerAccountId",
ADD COLUMN     "fanProfileId" TEXT;

-- DropTable
DROP TABLE "PointTransaction";

-- DropTable
DROP TABLE "ViewerAccount";

-- CreateTable
CREATE TABLE "PointLedger" (
    "id" TEXT NOT NULL,
    "fanProfileId" TEXT,
    "viewerId" TEXT,
    "streamId" TEXT,
    "type" "TransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "description" TEXT,
    "adjustedBy" TEXT,
    "isReversed" BOOLEAN NOT NULL DEFAULT false,
    "reversedBy" TEXT,
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FanProfile" (
    "id" TEXT NOT NULL,
    "googleId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT '',
    "profileImageUrl" TEXT,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "availablePoints" INTEGER NOT NULL DEFAULT 0,
    "lifetimePoints" INTEGER NOT NULL DEFAULT 0,
    "rank" "ViewerRank" NOT NULL DEFAULT 'PAPER_TRADER',
    "trustScore" DOUBLE PRECISION NOT NULL DEFAULT 50.0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "banReason" TEXT,
    "bannedAt" TIMESTAMP(3),
    "workspaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FanProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMember" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkspaceMemberRole" NOT NULL DEFAULT 'ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelCredential" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "googleAccountEmail" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "tokenStatus" "TokenStatus" NOT NULL DEFAULT 'VALID',
    "lastRefreshedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngagementEvent" (
    "id" TEXT NOT NULL,
    "fanProfileId" TEXT,
    "channelId" TEXT NOT NULL,
    "streamId" TEXT,
    "externalId" TEXT NOT NULL,
    "eventType" "EngagementEventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngagementEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "jobType" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "channelId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "eventsProcessed" INTEGER NOT NULL DEFAULT 0,
    "errorsCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PointLedger_fanProfileId_idx" ON "PointLedger"("fanProfileId");

-- CreateIndex
CREATE INDEX "PointLedger_viewerId_idx" ON "PointLedger"("viewerId");

-- CreateIndex
CREATE INDEX "PointLedger_streamId_idx" ON "PointLedger"("streamId");

-- CreateIndex
CREATE INDEX "PointLedger_createdAt_idx" ON "PointLedger"("createdAt");

-- CreateIndex
CREATE INDEX "PointLedger_type_idx" ON "PointLedger"("type");

-- CreateIndex
CREATE UNIQUE INDEX "FanProfile_googleId_key" ON "FanProfile"("googleId");

-- CreateIndex
CREATE INDEX "FanProfile_googleId_idx" ON "FanProfile"("googleId");

-- CreateIndex
CREATE INDEX "FanProfile_email_idx" ON "FanProfile"("email");

-- CreateIndex
CREATE INDEX "FanProfile_workspaceId_idx" ON "FanProfile"("workspaceId");

-- CreateIndex
CREATE INDEX "FanProfile_totalPoints_idx" ON "FanProfile"("totalPoints");

-- CreateIndex
CREATE INDEX "FanProfile_rank_idx" ON "FanProfile"("rank");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE INDEX "Workspace_ownerId_idx" ON "Workspace"("ownerId");

-- CreateIndex
CREATE INDEX "Workspace_slug_idx" ON "Workspace"("slug");

-- CreateIndex
CREATE INDEX "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelCredential_channelId_key" ON "ChannelCredential"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "EngagementEvent_externalId_key" ON "EngagementEvent"("externalId");

-- CreateIndex
CREATE INDEX "EngagementEvent_channelId_occurredAt_idx" ON "EngagementEvent"("channelId", "occurredAt");

-- CreateIndex
CREATE INDEX "EngagementEvent_fanProfileId_idx" ON "EngagementEvent"("fanProfileId");

-- CreateIndex
CREATE INDEX "EngagementEvent_eventType_idx" ON "EngagementEvent"("eventType");

-- CreateIndex
CREATE INDEX "EngagementEvent_externalId_idx" ON "EngagementEvent"("externalId");

-- CreateIndex
CREATE INDEX "JobRun_jobType_status_idx" ON "JobRun"("jobType", "status");

-- CreateIndex
CREATE INDEX "JobRun_channelId_idx" ON "JobRun"("channelId");

-- CreateIndex
CREATE INDEX "JobRun_createdAt_idx" ON "JobRun"("createdAt");

-- CreateIndex
CREATE INDEX "Channel_workspaceId_idx" ON "Channel"("workspaceId");

-- CreateIndex
CREATE INDEX "ChatMessage_streamId_publishedAt_idx" ON "ChatMessage"("streamId", "publishedAt");

-- CreateIndex
CREATE INDEX "FraudEvent_viewerId_createdAt_idx" ON "FraudEvent"("viewerId", "createdAt");

-- CreateIndex
CREATE INDEX "FraudEvent_viewerId_eventType_createdAt_idx" ON "FraudEvent"("viewerId", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "Viewer_fanProfileId_idx" ON "Viewer"("fanProfileId");

-- CreateIndex
CREATE INDEX "Viewer_channelId_trustScore_idx" ON "Viewer"("channelId", "trustScore");

-- CreateIndex
CREATE INDEX "Viewer_channelId_totalPoints_idx" ON "Viewer"("channelId", "totalPoints");

-- CreateIndex
CREATE INDEX "Viewer_isBanned_idx" ON "Viewer"("isBanned");

-- CreateIndex
CREATE INDEX "Viewer_currentSegment_idx" ON "Viewer"("currentSegment");

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viewer" ADD CONSTRAINT "Viewer_fanProfileId_fkey" FOREIGN KEY ("fanProfileId") REFERENCES "FanProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointLedger" ADD CONSTRAINT "PointLedger_fanProfileId_fkey" FOREIGN KEY ("fanProfileId") REFERENCES "FanProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointLedger" ADD CONSTRAINT "PointLedger_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "Viewer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointLedger" ADD CONSTRAINT "PointLedger_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "Stream"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FanProfile" ADD CONSTRAINT "FanProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelCredential" ADD CONSTRAINT "ChannelCredential_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementEvent" ADD CONSTRAINT "EngagementEvent_fanProfileId_fkey" FOREIGN KEY ("fanProfileId") REFERENCES "FanProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementEvent" ADD CONSTRAINT "EngagementEvent_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementEvent" ADD CONSTRAINT "EngagementEvent_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "Stream"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRun" ADD CONSTRAINT "JobRun_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
