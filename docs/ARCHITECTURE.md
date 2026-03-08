# Architecture Overview

## What is YT Loyalty?

YT Loyalty is a **Next.js 15** application that lets YouTube creators run loyalty programs during livestreams. Viewers earn points by watching streams, redeeming codes posted in chat, and engaging with the community. Points can be exchanged for digital and physical rewards.

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | Next.js 15 (App Router) | SSR, API routes, React UI |
| Language | TypeScript 5 | Type safety across the stack |
| Database | PostgreSQL + Prisma 7 | Primary data store with ORM |
| Cache | Upstash Redis | Leaderboards, rate limiting, fraud tracking, stream state |
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
                    |  - Middleware     |
                    +--------+---------+
                             |
              +--------------+--------------+
              |              |              |
     +--------v---+   +-----v------+  +----v--------+
     | PostgreSQL  |   |  Upstash   |  |   YouTube   |
     | (Prisma)    |   |  Redis     |  |   Data API  |
     |             |   |            |  |             |
     | - Users     |   | - Leaders  |  | - Chat msgs |
     | - Viewers   |   | - Codes    |  | - Video info|
     | - Streams   |   | - Rates    |  | - Channel   |
     | - Points    |   | - Fraud    |  |             |
     | - Rewards   |   | - State    |  |             |
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
│   └── api/                      # API routes (45+ endpoints)
│       ├── auth/[...nextauth]/   # Admin OAuth
│       ├── viewer-auth/          # Viewer OAuth
│       ├── streams/              # Stream CRUD + polling
│       ├── rewards/              # Reward CRUD
│       ├── admin/                # Admin-only operations
│       ├── viewer/               # Viewer-facing APIs
│       ├── cron/                 # Background jobs
│       ├── health/               # Health checks
│       └── leaderboard/          # Rankings
├── lib/                          # Core utilities
│   ├── auth.ts                   # NextAuth config + token refresh
│   ├── prisma.ts                 # DB client (pooled connections)
│   ├── redis.ts                  # Redis ops (leaderboards, codes, fraud)
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
│   ├── fraudDetection.ts         # Trust scoring & fraud detection
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

### 1. Stream Lifecycle

```
Admin creates stream → Stream set to SCHEDULED
       ↓
Admin starts polling → Cron job polls YouTube Live Chat API
       ↓
Messages arrive → MessageProcessor parses codes + chat
       ↓
Viewers redeem codes → Points awarded (with fraud checks)
       ↓
Admin ends stream → Final bonuses calculated (attendance, watch time)
       ↓
Stream set to ENDED → Leaderboard updated in Redis
```

### 2. Points Economy

```
Viewer earns points via:
  ├── Code redemption (STANDARD, FLASH, BONUS, FIRST_RESPONSE)
  ├── Chat activity bonuses
  ├── Watch time rewards
  ├── Streak bonuses (consecutive streams)
  ├── Attendance bonuses (early bird, full stream)
  ├── Rank multiplier (up to +50%)
  ├── Referral bonuses
  ├── Homework submissions
  ├── Poll participation
  └── CTA (call-to-action) bonuses

Points are tracked in PointTransaction ledger
  → Balance before/after for audit trail
  → 1000 points = 1 token (reward currency)
```

### 3. Rank Progression

| Rank | Points Required | Earning Boost |
|------|----------------|---------------|
| Paper Trader | 0 | 0% |
| Retail Trader | 2,500 | +10% |
| Swing Trader | 10,000 | +20% |
| Fund Manager | 35,000 | +35% |
| Market Maker | 100,000 | +50% |
| Hedge Fund | 200,000 | +50% |
| Whale | 400,000 | +50% |

### 4. Fraud Prevention Pipeline

```
Code redemption request
       ↓
Rate limit check (10/min per viewer)
       ↓
Trust score evaluation (0-100)
  ├── Account age (+0.5/day, max +15)
  ├── Streams attended (+2 each, max +20)
  ├── Messages sent (+0.01 each, max +5)
  ├── Member/Mod status (+10 each)
  ├── Prior fraud events (-5 each, -10 if recent)
  └── Redemption latency (<500ms = -20, bot-like)
       ↓
Fraud event detection
  ├── INSTANT_RESPONSE (<500ms latency)
  ├── RAPID_REDEMPTION (too many too fast)
  ├── IDENTICAL_TIMING (synchronized bots)
  ├── PATTERN_DETECTION (multi-event correlation)
  ├── NEW_ACCOUNT (suspicious new accounts)
  └── MESSAGE_SPAM (duplicate messages)
       ↓
Severity assignment (LOW → CRITICAL)
       ↓
Review queue for admin (PENDING, CONFIRMED, FALSE_POSITIVE, ESCALATED)
```

## Cron Jobs

| Endpoint | Schedule | Purpose |
|----------|----------|---------|
| `/api/cron/poll-streams` | Every minute | Polls YouTube Live Chat for active streams |
| `/api/cron/tier-decay` | Daily | Decays inactive viewer ranks/tiers |
| `/api/cron/update-segments` | Daily | Updates viewer segmentation groups |

All cron endpoints are protected by `CRON_SECRET` header validation.

## Caching Strategy

| Data | Store | TTL |
|------|-------|-----|
| Stream leaderboard | Redis sorted set | 7 days |
| Channel leaderboard | Redis sorted set | 30 days |
| Active loyalty codes | Redis key | Until cleared |
| Stream state | Redis hash | 24 hours |
| Fraud redemption tracking | Redis | Variable |
| YouTube live chat ID | In-memory | 1 hour |
| Video info | In-memory | 5 minutes |
| API quota usage | Redis | 24 hours |

## Key Design Decisions

1. **Separate admin and viewer auth** - Admins use NextAuth with Google OAuth (YouTube scopes). Viewers have their own OAuth flow with a separate session.

2. **Point ledger pattern** - Every point change is an immutable `PointTransaction` with balance-before/after. This enables full audit trails and fraud reversals.

3. **Redis for hot data** - Leaderboards, active codes, and stream state live in Redis for fast reads. PostgreSQL is the source of truth.

4. **Serverless-first** - Designed for Vercel's serverless functions. Connection pooling (3 max), short timeouts, and stateless handlers.

5. **YouTube API quota management** - Tracks quota usage per channel per day (LIST=1, INSERT=50 units). Automatically pauses polling when quota is exhausted.

6. **Trust score system** - Instead of binary allow/deny, viewers build trust over time. Low-trust actions get flagged for review rather than blocked.
