# Architecture Overview

## What is YT Loyalty?

YT Loyalty is a **Next.js 15** application that lets YouTube creators run loyalty programs across livestreams and video content. Viewers earn points by watching streams, redeeming codes, commenting on videos, and engaging with the community. Points can be exchanged for digital and physical rewards. A single fan identity (FanProfile) aggregates points across multiple channels.

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | Next.js 15 (App Router) | SSR, API routes, React UI |
| Language | TypeScript 5 | Type safety across the stack |
| Database | PostgreSQL + Prisma 7 | Primary data store with ORM |
| Cache | Upstash Redis | Leaderboards, rate limiting, distributed locks, stream state |
| Auth | NextAuth.js 4 | Google OAuth for admins and viewers |
| Monitoring | Sentry | Error tracking, performance monitoring |
| Hosting | Vercel | Serverless deployment with Fluid Compute |
| Styling | Tailwind CSS 4 | Utility-first CSS |
| Testing | Vitest | Unit tests for business logic |

## High-Level Architecture

```
                    +------------------+
                    |   Vercel (Edge)   |
                    |                  |
                    |  Next.js App     |
                    |  - Pages (SSR)   |
                    |  - API Routes    |
                    |  - Cron Workers  |
                    |  - Middleware     |
                    +--------+---------+
                             |
              +--------------+--------------+
              |              |              |
     +--------v---+   +-----v------+  +----v--------+
     | PostgreSQL  |   |  Upstash   |  |   YouTube   |
     | (Prisma)    |   |  Redis     |  |   Data API  |
     |             |   |            |  |             |
     | - FanProfile|   | - Leaders  |  | - Chat msgs |
     | - Viewers   |   | - Codes    |  | - Video info|
     | - Streams   |   | - Locks    |  | - Comments  |
     | - Ledger    |   | - Rates    |  | - Channel   |
     | - JobRun    |   | - State    |  |             |
     +-------------+   +------------+  +-------------+
```

## Application Structure

```
src/
├── app/                          # Next.js App Router
│   ├── page.tsx                  # Marketing homepage
│   ├── layout.tsx                # Root layout (Providers wrapper)
│   ├── globals.css               # Tailwind styles
│   ├── admin/                    # Admin dashboard (protected)
│   │   ├── page.tsx              # Dashboard overview
│   │   ├── streams/              # Stream management
│   │   ├── rewards/              # Reward configuration
│   │   ├── fulfillment/          # Physical reward shipping
│   │   ├── analytics/            # Metrics & reporting
│   │   ├── homework/             # Homework review
│   │   ├── viewers/              # Viewer management
│   │   └── webhooks/             # Webhook config
│   ├── viewer/                   # Viewer portal (protected)
│   │   ├── signin/               # Viewer sign-in
│   │   └── redemptions/          # Redemption history
│   ├── auth/                     # Admin auth pages
│   │   └── signin/               # Admin sign-in
│   ├── dashboard/                # Protected layout wrapper
│   └── api/                      # API routes
│       ├── auth/[...nextauth]/   # Admin OAuth
│       ├── viewer-auth/          # Viewer OAuth
│       ├── channels/             # Channel OAuth connect/disconnect/health
│       ├── streams/              # Stream CRUD + polling
│       ├── rewards/              # Reward CRUD
│       ├── admin/                # Admin-only operations
│       │   ├── ops/              # Operations monitoring (health, jobs, alerts)
│       │   └── redemptions/      # Fulfillment management
│       ├── viewer/               # Viewer-facing APIs
│       ├── cron/                 # 9 background workers
│       ├── health/               # Health checks
│       └── leaderboard/          # Rankings
├── lib/                          # Core utilities
│   ├── auth.ts                   # NextAuth config + token refresh
│   ├── prisma.ts                 # DB client (pooled connections)
│   ├── redis.ts                  # Redis ops (leaderboards, codes, locks, fraud)
│   ├── youtube.ts                # YouTube API wrapper
│   ├── env.ts                    # Zod env validation
│   ├── logger.ts                 # Structured logging + Sentry
│   ├── errorHandler.ts           # Centralized error handling
│   ├── validators.ts             # Zod schemas for input validation
│   ├── rateLimits.ts             # Rate limiter configs
│   ├── ranks.ts                  # Rank thresholds & boosts
│   ├── admin.ts                  # Admin authorization checks
│   └── viewerAuth.ts             # Viewer auth helpers
├── services/                     # Business logic
│   ├── tokenManager.ts           # Per-channel OAuth token lifecycle
│   ├── jobTracker.ts             # Job run lifecycle (start/complete/fail)
│   ├── batchAntiCheat.ts         # Batch fraud detection (4 rules)
│   ├── dailyScoring.ts           # Daily settlement engine
│   ├── fulfillment.ts            # Digital reward delivery
│   ├── opsMonitor.ts             # System health + alert generation
│   ├── fraudDetection.ts         # Real-time trust scoring & fraud detection
│   ├── bonusCalculator.ts        # Point bonus calculations
│   ├── watchTimeTracker.ts       # Watch time estimation
│   ├── streakManager.ts          # Streak tracking
│   ├── messageProcessor.ts       # Chat message handling
│   ├── chatCommandParser.ts      # Code extraction from chat
│   ├── segmentation.ts           # Viewer A/B segmentation
│   └── webhookDispatcher.ts      # Webhook event dispatch
├── components/                   # React components
│   ├── Providers.tsx             # Session + context providers
│   └── ViewerProvider.tsx        # Viewer context
├── middleware.ts                 # CSP headers + security
└── __tests__/                    # Vitest unit tests
```

## Core Data Flow

### 1. Ingestion Pipeline

Three cron workers ingest data from YouTube into `EngagementEvent` records:

```
poll-streams (every 3 min)
  → Polls YouTube Live Chat API for active streams
  → Creates ChatMessage + EngagementEvent records

ingest-comments (every 15 min)
  → Fetches video comments for recent streams (last 7 days)
  → Creates EngagementEvent records (type: VIDEO_COMMENT)
  → Auto-creates FanProfile for new commenters

discover-videos (every 4 hours)
  → Searches each channel for new videos (last 24 hours)
  → Creates Stream records for newly discovered videos
```

All ingestion workers use per-channel OAuth credentials (via `tokenManager`) and are idempotent (dedup by `externalId`).

### 2. Daily Scoring + Anti-Cheat Pipeline

Runs daily at 2:00 AM UTC via the `daily-scoring` cron:

```
Query EngagementEvents since last successful scoring run
       ↓
Group events by FanProfile
       ↓
Calculate base points per type (with daily caps):
  ├── Chat: 1 pt/msg, cap 50/day
  ├── Comments: 2 pts/comment, cap 20/day
  ├── Super Chat: 10% of amount in cents
  └── Attendance: 5 pts/stream
       ↓
Run batch anti-cheat (4 rules):
  ├── Velocity anomaly (>100 msgs/hour → 50% penalty)
  ├── Duplicate text (>60% identical → 30% penalty)
  ├── Timing patterns (stddev < 500ms → 50% penalty)
  └── Rapid account (<24h old, >50 events → 20% penalty)
       ↓
Apply channel multiplier + fraud penalty
       ↓
Create PointLedger entries + update FanProfile (in transaction)
```

A separate `fraud-scan` cron (3:00 AM) auto-confirms pending fraud events based on severity thresholds, creates point reversals, and auto-bans low-trust viewers.

### 3. Digital Fulfillment Pipeline

The `fulfill-rewards` cron (every 5 min) processes pending digital reward redemptions:

```
Find PENDING/PROCESSING digital redemptions
       ↓
For each: generate unique code (PREFIX-UUID format)
       ↓
Update status: PENDING → PROCESSING → DELIVERED
       ↓
Retry previously FAILED fulfillments (batch of 100)
```

Fulfillment is idempotent: re-processing an already-delivered redemption returns success without generating a new code. Manual fulfillment is available via `/api/admin/redemptions/[id]/fulfill`.

### 4. Points Economy

```
Viewer earns points via:
  ├── Code redemption (STANDARD, FLASH, BONUS, FIRST_RESPONSE)
  ├── Chat activity (daily scoring)
  ├── Video comments (daily scoring)
  ├── Super Chat bonuses (daily scoring)
  ├── Stream attendance (daily scoring)
  ├── Watch time rewards
  ├── Streak bonuses (consecutive streams)
  ├── Rank multiplier (up to +50%)
  ├── Referral bonuses
  ├── Homework submissions
  ├── Poll participation
  └── CTA (call-to-action) bonuses

Points are tracked in PointLedger (immutable append-only)
  → balance before/after for audit trail
  → reversible via FRAUD_REVERSAL entries
  → 1000 points = 1 token (reward currency)

FanProfile holds the global wallet across all channels
Viewer holds per-channel point snapshots
```

### 5. Rank Progression

| Rank | Points Required | Earning Boost |
|------|----------------|---------------|
| Paper Trader | 0 | 0% |
| Retail Trader | 2,500 | +10% |
| Swing Trader | 10,000 | +20% |
| Fund Manager | 35,000 | +35% |
| Market Maker | 100,000 | +50% |
| Hedge Fund | 200,000 | +50% |
| Whale | 400,000 | +50% |

### 6. Fraud Prevention

Two layers of fraud detection:

**Real-time** (during code redemption):
- Trust score evaluation (0-100)
- Redemption latency tracking (<500ms = bot-like)
- Identical timing detection (synchronized bots)
- Rate limiting (10 redemptions/min)
- Message similarity hashing

**Batch** (daily scoring pipeline):
- Velocity anomaly detection
- Duplicate text analysis
- Timing pattern analysis (stddev-based)
- Rapid account behavior detection

## Operations Monitoring

The `opsMonitor` service provides system health dashboards via three admin endpoints:

- **Health** (`/api/admin/ops/health`): Database latency, Redis latency, channel token status, job failure counts, ingestion lag, quota usage
- **Jobs** (`/api/admin/ops/jobs`): Full job history with per-type summary stats (success rate, avg duration)
- **Alerts** (`/api/admin/ops/alerts`): Auto-generated alerts based on thresholds (ingestion lag >30 min, job failures, expired tokens, quota >80%)

## Cron Jobs

| Endpoint | Schedule | Lock TTL | Purpose |
|----------|----------|----------|---------|
| `/api/cron/poll-streams` | Every 3 min | - | Polls YouTube Live Chat for active streams |
| `/api/cron/ingest-comments` | Every 15 min | 300s | Ingests video comments as EngagementEvents |
| `/api/cron/discover-videos` | Every 4 hours | 120s | Discovers new videos per channel |
| `/api/cron/daily-scoring` | 2:00 AM | 600s | Processes events, calculates points, creates ledger entries |
| `/api/cron/fraud-scan` | 3:00 AM | 300s | Auto-confirms fraud events, creates reversals |
| `/api/cron/fulfill-rewards` | Every 5 min | 300s | Delivers pending digital rewards |
| `/api/cron/token-health` | Every hour | - | Refreshes expiring channel OAuth tokens |
| `/api/cron/tier-decay` | Midnight | - | Decays inactive viewer ranks |
| `/api/cron/update-segments` | Every 6 hours | - | Updates viewer segmentation groups |

All cron endpoints are protected by `CRON_SECRET` header validation. Most use Redis distributed locks to prevent concurrent execution.

## Distributed Lock Pattern

Cron workers that must not run concurrently use a Redis-based distributed lock:

```
1. acquireLock(key, ttlSeconds) → SET key lockId NX EX ttl
   Returns null if already locked (caller returns 409)

2. Worker executes inside try/finally

3. releaseLock(key, lockId) → Lua script:
   if GET key == lockId then DEL key (atomic compare-and-delete)
```

This prevents double-processing when Vercel invokes the same cron endpoint on overlapping schedules.

## Job Lifecycle Tracking

Every cron worker records its execution in the `JobRun` table via `jobTracker`:

```
startJob(type, channelId?) → creates RUNNING record, returns context
  ↓
Worker processes events, increments ctx.eventsProcessed / ctx.errorsCount
  ↓
completeJob(ctx) or failJob(ctx, errorMessage)
```

This provides a queryable history of all background work, used by the ops monitoring dashboard.

## Caching Strategy

| Data | Store | TTL |
|------|-------|-----|
| Stream leaderboard | Redis sorted set | 7 days |
| Channel leaderboard | Redis sorted set | 30 days |
| Active loyalty codes | Redis key | Until cleared |
| Stream state | Redis hash | 24 hours |
| Distributed locks | Redis key (NX + EX) | Per-lock TTL |
| Fraud redemption tracking | Redis | Variable |
| YouTube live chat ID | In-memory | 1 hour |
| Video info | In-memory | 5 minutes |
| API quota usage | Redis | 24 hours |

## Key Design Decisions

1. **FanProfile as global identity** - A single `FanProfile` (keyed by Google ID) holds the global point wallet. Per-channel `Viewer` records track channel-specific stats. Points aggregate upward.

2. **EngagementEvent as immutable event log** - All ingested activity (chat, comments, super chats, attendance) lands in `EngagementEvent` before scoring. This separates ingestion from point calculation and enables replay.

3. **Daily batch scoring** - Points from engagement events are not awarded in real-time. Instead, the `dailyScoring` service processes them in batch with anti-cheat analysis. Code redemptions remain real-time.

4. **Per-channel OAuth** - Each connected channel has its own `ChannelCredential` with independent access/refresh tokens. The `tokenManager` service handles refresh with 5-minute buffer. This replaces the original single-admin-token model.

5. **Point ledger pattern** - Every point change is an immutable `PointLedger` entry with balance-before/after. This enables full audit trails, fraud reversals, and reconciliation.

6. **Redis for hot data and coordination** - Leaderboards, active codes, and stream state live in Redis for fast reads. Distributed locks prevent cron overlap. PostgreSQL is the source of truth.

7. **Serverless-first** - Designed for Vercel's serverless functions. Connection pooling (3 max), short timeouts, and stateless handlers. Cron workers get extended durations (up to 600s for daily scoring).

8. **Workspace model** - A `Workspace` groups channels and fan profiles under a single admin. Channels are linked to workspaces; fan profiles can be scoped per workspace.
