-- ============================================
-- Step 1: Replace ViewerRank enum values
-- Map old rank values to new trading-themed ones
-- ============================================

-- Create the new enum type
CREATE TYPE "ViewerRank_new" AS ENUM ('PAPER_TRADER', 'RETAIL_TRADER', 'SWING_TRADER', 'FUND_MANAGER', 'MARKET_MAKER', 'HEDGE_FUND', 'WHALE');

-- Update existing viewer ranks: map old values to new values
-- OBSERVER -> PAPER_TRADER (lowest tier)
-- OPERATOR -> RETAIL_TRADER
-- SNIPER -> SWING_TRADER
-- ARCHITECT -> FUND_MANAGER
-- INNER_CIRCLE -> MARKET_MAKER
ALTER TABLE "Viewer" ALTER COLUMN "rank" TYPE TEXT;
UPDATE "Viewer" SET "rank" = 'PAPER_TRADER' WHERE "rank" = 'OBSERVER';
UPDATE "Viewer" SET "rank" = 'RETAIL_TRADER' WHERE "rank" = 'OPERATOR';
UPDATE "Viewer" SET "rank" = 'SWING_TRADER' WHERE "rank" = 'SNIPER';
UPDATE "Viewer" SET "rank" = 'FUND_MANAGER' WHERE "rank" = 'ARCHITECT';
UPDATE "Viewer" SET "rank" = 'MARKET_MAKER' WHERE "rank" = 'INNER_CIRCLE';

-- Update RewardConfig minRank column too (nullable)
ALTER TABLE "RewardConfig" ALTER COLUMN "minRank" TYPE TEXT;
UPDATE "RewardConfig" SET "minRank" = 'PAPER_TRADER' WHERE "minRank" = 'OBSERVER';
UPDATE "RewardConfig" SET "minRank" = 'RETAIL_TRADER' WHERE "minRank" = 'OPERATOR';
UPDATE "RewardConfig" SET "minRank" = 'SWING_TRADER' WHERE "minRank" = 'SNIPER';
UPDATE "RewardConfig" SET "minRank" = 'FUND_MANAGER' WHERE "minRank" = 'ARCHITECT';
UPDATE "RewardConfig" SET "minRank" = 'MARKET_MAKER' WHERE "minRank" = 'INNER_CIRCLE';

-- Drop old enum (CASCADE to remove default dependency) and rename new one
DROP TYPE "ViewerRank" CASCADE;
ALTER TYPE "ViewerRank_new" RENAME TO "ViewerRank";

-- Cast columns back to the enum type
ALTER TABLE "Viewer" ALTER COLUMN "rank" TYPE "ViewerRank" USING "rank"::"ViewerRank";
ALTER TABLE "Viewer" ALTER COLUMN "rank" SET DEFAULT 'PAPER_TRADER';
ALTER TABLE "RewardConfig" ALTER COLUMN "minRank" TYPE "ViewerRank" USING "minRank"::"ViewerRank";

-- ============================================
-- Step 2: Add new TransactionType values
-- ============================================

ALTER TYPE "TransactionType" ADD VALUE 'REFERRAL_BONUS';
ALTER TYPE "TransactionType" ADD VALUE 'HOMEWORK_SUBMISSION';
ALTER TYPE "TransactionType" ADD VALUE 'POLL_PARTICIPATION';
ALTER TYPE "TransactionType" ADD VALUE 'CTA_BONUS';
ALTER TYPE "TransactionType" ADD VALUE 'QUALITY_QUESTION';
ALTER TYPE "TransactionType" ADD VALUE 'HELPFUL_UPVOTE';
ALTER TYPE "TransactionType" ADD VALUE 'STREAK_MILESTONE';
ALTER TYPE "TransactionType" ADD VALUE 'COURSE_COMPLETION';
ALTER TYPE "TransactionType" ADD VALUE 'MODULE_COMPLETION';
ALTER TYPE "TransactionType" ADD VALUE 'STREAK_PAUSE_COST';

-- ============================================
-- Step 3: Add new fields to Viewer model
-- ============================================

-- Prestige tier fields
ALTER TABLE "Viewer" ADD COLUMN "hasPurchasedCourse" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Viewer" ADD COLUMN "hasPurchasedPremiumCohort" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Viewer" ADD COLUMN "courseCompleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Viewer" ADD COLUMN "premiumCohortCompleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Viewer" ADD COLUMN "purchasedCourseId" TEXT;
ALTER TABLE "Viewer" ADD COLUMN "purchasedCohortId" TEXT;

-- Community contribution
ALTER TABLE "Viewer" ADD COLUMN "helpfulUpvotesReceived" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Viewer" ADD COLUMN "helpfulUpvotesGiven" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Viewer" ADD COLUMN "qualityQuestionsCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Viewer" ADD COLUMN "homeworkSubmissions" INTEGER NOT NULL DEFAULT 0;

-- Referral tracking
ALTER TABLE "Viewer" ADD COLUMN "referralCode" TEXT;
ALTER TABLE "Viewer" ADD COLUMN "referredById" TEXT;

-- Streak pause
ALTER TABLE "Viewer" ADD COLUMN "activePauseType" TEXT;
ALTER TABLE "Viewer" ADD COLUMN "pauseStartedAt" TIMESTAMP(3);
ALTER TABLE "Viewer" ADD COLUMN "pauseEndsAt" TIMESTAMP(3);
ALTER TABLE "Viewer" ADD COLUMN "shortPausesUsedThisMonth" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Viewer" ADD COLUMN "longPausesUsedThisMonth" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Viewer" ADD COLUMN "lastPauseResetMonth" INTEGER;

-- Segment
ALTER TABLE "Viewer" ADD COLUMN "currentSegment" TEXT;
ALTER TABLE "Viewer" ADD COLUMN "segmentUpdatedAt" TIMESTAMP(3);

-- Unique constraint on referralCode
CREATE UNIQUE INDEX "Viewer_referralCode_key" ON "Viewer"("referralCode");

-- ============================================
-- Step 4: Add CTA tracking fields to Stream model
-- ============================================

ALTER TABLE "Stream" ADD COLUMN "ctaTimestamp" TIMESTAMP(3);
ALTER TABLE "Stream" ADD COLUMN "ctaPointsAwarded" BOOLEAN NOT NULL DEFAULT false;

-- ============================================
-- Step 5: Add RewardCategory enum and update RewardConfig
-- ============================================

-- CreateEnum
CREATE TYPE "RewardCategory" AS ENUM ('GATEWAY', 'ENGAGEMENT', 'COMMITMENT', 'PREMIUM', 'PRESTIGE', 'ROTATING');

-- Add new fields to RewardConfig
ALTER TABLE "RewardConfig" ADD COLUMN "category" "RewardCategory" NOT NULL DEFAULT 'GATEWAY';
ALTER TABLE "RewardConfig" ADD COLUMN "funnelPosition" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "RewardConfig" ADD COLUMN "externalCourseId" TEXT;
ALTER TABLE "RewardConfig" ADD COLUMN "externalModuleId" TEXT;
ALTER TABLE "RewardConfig" ADD COLUMN "isLimitedTime" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RewardConfig" ADD COLUMN "limitedTimeEndsAt" TIMESTAMP(3);
ALTER TABLE "RewardConfig" ADD COLUMN "pointsCost" INTEGER NOT NULL DEFAULT 0;
