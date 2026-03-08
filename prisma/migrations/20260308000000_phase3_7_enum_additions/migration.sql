-- Phase 3-7: Add new enum values for ingestion workers, scoring, and fulfillment

-- EngagementEventType: add VIDEO_COMMENT for comment ingestion
ALTER TYPE "EngagementEventType" ADD VALUE IF NOT EXISTS 'VIDEO_COMMENT';

-- JobType: add new job types for ingestion and discovery crons
ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'INGEST_COMMENTS';
ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'DISCOVER_VIDEOS';

-- TransactionType: add SUPER_CHAT_BONUS for daily scoring
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'SUPER_CHAT_BONUS';
