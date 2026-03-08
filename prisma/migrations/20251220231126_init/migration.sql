-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'STREAMER');

-- CreateEnum
CREATE TYPE "ViewerRank" AS ENUM ('OBSERVER', 'OPERATOR', 'SNIPER', 'ARCHITECT', 'INNER_CIRCLE');

-- CreateEnum
CREATE TYPE "StreamStatus" AS ENUM ('SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CodeType" AS ENUM ('STANDARD', 'FLASH', 'BONUS', 'FIRST_RESPONSE');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('CODE_REDEMPTION', 'CHAT_ACTIVITY', 'ATTENDANCE_BONUS', 'STREAK_BONUS', 'RANK_BONUS', 'MANUAL_CREDIT', 'MANUAL_DEBIT', 'REWARD_REDEMPTION', 'FRAUD_REVERSAL');

-- CreateEnum
CREATE TYPE "FraudEventType" AS ENUM ('INSTANT_RESPONSE', 'RAPID_REDEMPTION', 'IDENTICAL_TIMING', 'PATTERN_DETECTION', 'NEW_ACCOUNT', 'MESSAGE_SPAM');

-- CreateEnum
CREATE TYPE "FraudSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FALSE_POSITIVE', 'ESCALATED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'STREAMER',
    "googleAccessToken" TEXT,
    "googleRefreshToken" TEXT,
    "googleTokenExpiry" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "youtubeChannelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "ownerId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "dailyQuotaUsed" INTEGER NOT NULL DEFAULT 0,
    "dailyQuotaResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quotaLimit" INTEGER NOT NULL DEFAULT 10000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Viewer" (
    "id" TEXT NOT NULL,
    "youtubeChannelId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "profileImageUrl" TEXT,
    "channelId" TEXT NOT NULL,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "availablePoints" INTEGER NOT NULL DEFAULT 0,
    "lifetimePoints" INTEGER NOT NULL DEFAULT 0,
    "rank" "ViewerRank" NOT NULL DEFAULT 'OBSERVER',
    "trustScore" DOUBLE PRECISION NOT NULL DEFAULT 50.0,
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "banReason" TEXT,
    "bannedAt" TIMESTAMP(3),
    "bannedBy" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalStreamsAttended" INTEGER NOT NULL DEFAULT 0,
    "totalMessagesCount" INTEGER NOT NULL DEFAULT 0,
    "totalCodesRedeemed" INTEGER NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastStreamAttended" TEXT,
    "isMember" BOOLEAN NOT NULL DEFAULT false,
    "isModerator" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Viewer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stream" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "youtubeVideoId" TEXT NOT NULL,
    "youtubeLiveChatId" TEXT,
    "title" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "status" "StreamStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledStartAt" TIMESTAMP(3),
    "actualStartAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "isPollingActive" BOOLEAN NOT NULL DEFAULT false,
    "lastPollAt" TIMESTAMP(3),
    "pollIntervalMs" INTEGER NOT NULL DEFAULT 4000,
    "nextPageToken" TEXT,
    "quotaUsedThisStream" INTEGER NOT NULL DEFAULT 0,
    "peakConcurrentChatters" INTEGER NOT NULL DEFAULT 0,
    "totalUniqueChatters" INTEGER NOT NULL DEFAULT 0,
    "totalMessagesProcessed" INTEGER NOT NULL DEFAULT 0,
    "totalCodesGenerated" INTEGER NOT NULL DEFAULT 0,
    "totalPointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stream_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreamAttendance" (
    "id" TEXT NOT NULL,
    "streamId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "firstMessageAt" TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "codesRedeemed" INTEGER NOT NULL DEFAULT 0,
    "pointsEarned" INTEGER NOT NULL DEFAULT 0,
    "wasSponsor" BOOLEAN NOT NULL DEFAULT false,
    "wasModerator" BOOLEAN NOT NULL DEFAULT false,
    "earlyBirdBonus" BOOLEAN NOT NULL DEFAULT false,
    "fullStreamBonus" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StreamAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyCode" (
    "id" TEXT NOT NULL,
    "streamId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "codeType" "CodeType" NOT NULL DEFAULT 'STANDARD',
    "basePoints" INTEGER NOT NULL DEFAULT 100,
    "memberBonus" INTEGER NOT NULL DEFAULT 50,
    "modBonus" INTEGER NOT NULL DEFAULT 25,
    "firstResponseBonus" INTEGER NOT NULL DEFAULT 50,
    "firstResponseLimit" INTEGER NOT NULL DEFAULT 10,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "durationSeconds" INTEGER NOT NULL DEFAULT 120,
    "maxRedemptions" INTEGER,
    "currentRedemptions" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "announcedAt" TIMESTAMP(3),
    "announcedInChat" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeRedemption" (
    "id" TEXT NOT NULL,
    "codeId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "pointsAwarded" INTEGER NOT NULL,
    "bonusType" TEXT,
    "bonusPoints" INTEGER NOT NULL DEFAULT 0,
    "redemptionLatencyMs" INTEGER NOT NULL,
    "messageId" TEXT,
    "trustScoreAtTime" DOUBLE PRECISION NOT NULL,
    "flaggedForReview" BOOLEAN NOT NULL DEFAULT false,
    "flagReason" TEXT,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodeRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointTransaction" (
    "id" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "streamId" TEXT,
    "type" "TransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "description" TEXT,
    "adjustedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "streamId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "youtubeMessageId" TEXT NOT NULL,
    "messageText" TEXT NOT NULL,
    "messageType" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isSuperChat" BOOLEAN NOT NULL DEFAULT false,
    "superChatAmount" DOUBLE PRECISION,
    "superChatCurrency" TEXT,
    "containsCode" BOOLEAN NOT NULL DEFAULT false,
    "detectedCode" TEXT,
    "similarityHash" TEXT,
    "flaggedAsSuspicious" BOOLEAN NOT NULL DEFAULT false,
    "suspicionReason" TEXT,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FraudEvent" (
    "id" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "streamId" TEXT,
    "eventType" "FraudEventType" NOT NULL,
    "severity" "FraudSeverity" NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" JSONB,
    "trustPenaltyApplied" DOUBLE PRECISION NOT NULL,
    "wasAutoBanned" BOOLEAN NOT NULL DEFAULT false,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FraudEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardConfig" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "tokenCost" INTEGER NOT NULL,
    "maxPerViewer" INTEGER,
    "maxTotal" INTEGER,
    "currentTotal" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "availableFrom" TIMESTAMP(3),
    "availableUntil" TIMESTAMP(3),
    "minTrustScore" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "minAccountAgeDays" INTEGER NOT NULL DEFAULT 7,
    "minRank" "ViewerRank",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardRedemption" (
    "id" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "tokensSpent" INTEGER NOT NULL,
    "pointsSpent" INTEGER NOT NULL,
    "rewardCode" TEXT,
    "deliveryStatus" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "deliveredAt" TIMESTAMP(3),
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "previousValue" JSONB,
    "newValue" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotaUsageLog" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "liveChatCalls" INTEGER NOT NULL DEFAULT 0,
    "insertCalls" INTEGER NOT NULL DEFAULT 0,
    "otherApiCalls" INTEGER NOT NULL DEFAULT 0,
    "totalUnits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuotaUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_youtubeChannelId_key" ON "Channel"("youtubeChannelId");

-- CreateIndex
CREATE INDEX "Channel_ownerId_idx" ON "Channel"("ownerId");

-- CreateIndex
CREATE INDEX "Channel_youtubeChannelId_idx" ON "Channel"("youtubeChannelId");

-- CreateIndex
CREATE INDEX "Viewer_channelId_idx" ON "Viewer"("channelId");

-- CreateIndex
CREATE INDEX "Viewer_youtubeChannelId_idx" ON "Viewer"("youtubeChannelId");

-- CreateIndex
CREATE INDEX "Viewer_trustScore_idx" ON "Viewer"("trustScore");

-- CreateIndex
CREATE INDEX "Viewer_totalPoints_idx" ON "Viewer"("totalPoints");

-- CreateIndex
CREATE INDEX "Viewer_rank_idx" ON "Viewer"("rank");

-- CreateIndex
CREATE UNIQUE INDEX "Viewer_youtubeChannelId_channelId_key" ON "Viewer"("youtubeChannelId", "channelId");

-- CreateIndex
CREATE INDEX "Stream_channelId_idx" ON "Stream"("channelId");

-- CreateIndex
CREATE INDEX "Stream_status_idx" ON "Stream"("status");

-- CreateIndex
CREATE INDEX "Stream_actualStartAt_idx" ON "Stream"("actualStartAt");

-- CreateIndex
CREATE UNIQUE INDEX "Stream_youtubeVideoId_key" ON "Stream"("youtubeVideoId");

-- CreateIndex
CREATE INDEX "StreamAttendance_streamId_idx" ON "StreamAttendance"("streamId");

-- CreateIndex
CREATE INDEX "StreamAttendance_viewerId_idx" ON "StreamAttendance"("viewerId");

-- CreateIndex
CREATE UNIQUE INDEX "StreamAttendance_streamId_viewerId_key" ON "StreamAttendance"("streamId", "viewerId");

-- CreateIndex
CREATE INDEX "LoyaltyCode_streamId_idx" ON "LoyaltyCode"("streamId");

-- CreateIndex
CREATE INDEX "LoyaltyCode_validUntil_idx" ON "LoyaltyCode"("validUntil");

-- CreateIndex
CREATE INDEX "LoyaltyCode_isActive_idx" ON "LoyaltyCode"("isActive");

-- CreateIndex
CREATE INDEX "LoyaltyCode_code_idx" ON "LoyaltyCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyCode_streamId_code_key" ON "LoyaltyCode"("streamId", "code");

-- CreateIndex
CREATE INDEX "CodeRedemption_codeId_idx" ON "CodeRedemption"("codeId");

-- CreateIndex
CREATE INDEX "CodeRedemption_viewerId_idx" ON "CodeRedemption"("viewerId");

-- CreateIndex
CREATE INDEX "CodeRedemption_redeemedAt_idx" ON "CodeRedemption"("redeemedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CodeRedemption_codeId_viewerId_key" ON "CodeRedemption"("codeId", "viewerId");

-- CreateIndex
CREATE INDEX "PointTransaction_viewerId_idx" ON "PointTransaction"("viewerId");

-- CreateIndex
CREATE INDEX "PointTransaction_streamId_idx" ON "PointTransaction"("streamId");

-- CreateIndex
CREATE INDEX "PointTransaction_createdAt_idx" ON "PointTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "PointTransaction_type_idx" ON "PointTransaction"("type");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_youtubeMessageId_key" ON "ChatMessage"("youtubeMessageId");

-- CreateIndex
CREATE INDEX "ChatMessage_streamId_idx" ON "ChatMessage"("streamId");

-- CreateIndex
CREATE INDEX "ChatMessage_viewerId_idx" ON "ChatMessage"("viewerId");

-- CreateIndex
CREATE INDEX "ChatMessage_publishedAt_idx" ON "ChatMessage"("publishedAt");

-- CreateIndex
CREATE INDEX "ChatMessage_containsCode_idx" ON "ChatMessage"("containsCode");

-- CreateIndex
CREATE INDEX "FraudEvent_viewerId_idx" ON "FraudEvent"("viewerId");

-- CreateIndex
CREATE INDEX "FraudEvent_streamId_idx" ON "FraudEvent"("streamId");

-- CreateIndex
CREATE INDEX "FraudEvent_createdAt_idx" ON "FraudEvent"("createdAt");

-- CreateIndex
CREATE INDEX "FraudEvent_severity_idx" ON "FraudEvent"("severity");

-- CreateIndex
CREATE INDEX "FraudEvent_reviewStatus_idx" ON "FraudEvent"("reviewStatus");

-- CreateIndex
CREATE INDEX "RewardConfig_channelId_idx" ON "RewardConfig"("channelId");

-- CreateIndex
CREATE INDEX "RewardConfig_isActive_idx" ON "RewardConfig"("isActive");

-- CreateIndex
CREATE INDEX "RewardRedemption_rewardId_idx" ON "RewardRedemption"("rewardId");

-- CreateIndex
CREATE INDEX "RewardRedemption_viewerId_idx" ON "RewardRedemption"("viewerId");

-- CreateIndex
CREATE INDEX "RewardRedemption_redeemedAt_idx" ON "RewardRedemption"("redeemedAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "QuotaUsageLog_channelId_idx" ON "QuotaUsageLog"("channelId");

-- CreateIndex
CREATE INDEX "QuotaUsageLog_date_idx" ON "QuotaUsageLog"("date");

-- CreateIndex
CREATE UNIQUE INDEX "QuotaUsageLog_channelId_date_key" ON "QuotaUsageLog"("channelId", "date");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viewer" ADD CONSTRAINT "Viewer_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stream" ADD CONSTRAINT "Stream_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamAttendance" ADD CONSTRAINT "StreamAttendance_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "Stream"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamAttendance" ADD CONSTRAINT "StreamAttendance_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "Viewer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyCode" ADD CONSTRAINT "LoyaltyCode_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "Stream"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeRedemption" ADD CONSTRAINT "CodeRedemption_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "LoyaltyCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeRedemption" ADD CONSTRAINT "CodeRedemption_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "Viewer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointTransaction" ADD CONSTRAINT "PointTransaction_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "Viewer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointTransaction" ADD CONSTRAINT "PointTransaction_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "Stream"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "Stream"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "Viewer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudEvent" ADD CONSTRAINT "FraudEvent_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "Viewer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudEvent" ADD CONSTRAINT "FraudEvent_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "Stream"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardConfig" ADD CONSTRAINT "RewardConfig_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardRedemption" ADD CONSTRAINT "RewardRedemption_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "RewardConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardRedemption" ADD CONSTRAINT "RewardRedemption_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "Viewer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
