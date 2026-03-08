# Phase 3: Ingestion Workers — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Redis-based distributed locks, populate EngagementEvent on every message, track all cron jobs via JobRun, and add video comment ingestion — ensuring no duplicate events.

**Architecture:** Enhance existing Vercel cron endpoints with distributed locking (Redis SETNX), immutable event logging (EngagementEvent with externalId uniqueness), and job lifecycle tracking (JobRun). Add comment ingestion as a new cron endpoint.

**Tech Stack:** Next.js 15 App Router, Upstash Redis (REST), Prisma 7, Vitest

---

### Task 1: Redis Distributed Lock Service

Add lock functions to `src/lib/redis.ts` for worker coordination.

### Task 2: Job Tracking Service

Create `src/services/jobTracker.ts` to wrap cron jobs with JobRun lifecycle.

### Task 3: EngagementEvent Population

Update `src/services/messageProcessor.ts` to write EngagementEvent for every processed message.

### Task 4: Wrap Poll-Streams Cron with Locks + Job Tracking

Update `src/app/api/cron/poll-streams/route.ts` to use distributed lock and JobRun tracking.

### Task 5: YouTube Comment API + Comment Ingestion Cron

Add `getVideoComments()` to youtube.ts, create `src/app/api/cron/ingest-comments/route.ts`.

### Task 6: Video Discovery Cron

Create `src/app/api/cron/discover-videos/route.ts` to find new uploads from connected channels.

### Task 7: Tests + Verification
