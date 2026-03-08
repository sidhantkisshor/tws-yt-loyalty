# Setup & Deployment

## Prerequisites

- **Node.js 20+**
- **PostgreSQL** database (Supabase, Neon, Railway, or self-hosted)
- **Upstash Redis** account (free tier works for development)
- **Google Cloud** project with OAuth 2.0 credentials
- **Sentry** account (optional but recommended)

---

## Local Development Setup

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd yt-loyalty
npm install
```

### 2. Configure Environment

Create `.env.local` in the project root:

```env
# --- Database ---
# Connection string with PgBouncer (for runtime queries)
DATABASE_URL="postgresql://user:password@host:6543/database?sslmode=require&pgbouncer=true"
# Direct connection (for migrations - bypasses PgBouncer)
DIRECT_URL="postgresql://user:password@host:5432/database?sslmode=require"

# --- NextAuth ---
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"

# --- Admin Access ---
ADMIN_EMAILS="admin@example.com,other-admin@example.com"

# --- Google OAuth ---
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"

# --- Upstash Redis ---
UPSTASH_REDIS_REST_URL="https://your-redis.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your-token"

# --- Cron Security ---
CRON_SECRET="generate-with-openssl-rand-base64-32"

# --- Sentry (Optional) ---
SENTRY_DSN="https://key@org.ingest.sentry.io/project"
NEXT_PUBLIC_SENTRY_DSN="https://key@org.ingest.sentry.io/project"
SENTRY_AUTH_TOKEN="your-sentry-auth-token"
SENTRY_ORG="your-org"
SENTRY_PROJECT="your-project"

# --- YouTube (Optional) ---
YOUTUBE_DAILY_QUOTA_LIMIT="10000"
```

### 3. Google Cloud Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable the **YouTube Data API v3**
4. Go to **Credentials** > **Create Credentials** > **OAuth 2.0 Client ID**
5. Set application type to **Web application**
6. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (admin)
   - `http://localhost:3000/api/viewer-auth/callback/google` (viewer)
   - `http://localhost:3000/api/channels/oauth/callback` (channel connect)
   - Your production URLs when deploying
7. Copy Client ID and Client Secret to `.env.local`

### 4. Database Setup

```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npx prisma migrate dev

# (Optional) Open Prisma Studio to inspect data
npm run db:studio
```

### 5. Start Development Server

```bash
# Standard dev server
npm run dev

# With Turbopack (faster HMR)
npm run dev:turbo
```

Open [http://localhost:3000](http://localhost:3000)

---

## NPM Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `next dev` | Development server |
| `dev:turbo` | `next dev --turbopack` | Dev server with Turbopack |
| `build` | `next build` | Production build |
| `start` | `next start` | Production server |
| `lint` | `eslint` | Run linter |
| `test` | `vitest` | Run tests (watch mode) |
| `test:run` | `vitest run` | Run tests once |
| `typecheck` | `tsc --noEmit` | Type checking |
| `db:generate` | `prisma generate` | Generate Prisma client |
| `db:migrate` | `prisma migrate deploy` | Apply migrations |
| `db:studio` | `prisma studio` | Visual database browser |
| `deploy` | `bash scripts/deploy.sh` | Deploy to Vercel |
| `deploy:setup` | `bash scripts/setup-vercel-env.sh` | Configure Vercel env vars |

---

## Testing

```bash
# Run all tests in watch mode
npm test

# Run once (CI mode)
npm run test:run

# Type checking
npm run typecheck

# Linting
npm run lint
```

Tests are in `src/__tests__/` and cover:
- Bonus calculations
- Code generation & validation
- Fraud detection algorithms
- Watch time estimation
- Chat command parsing
- Rank progression
- Streak logic
- Webhook dispatch
- Auth, env validation, error handling, rate limiting

---

## Deployment to Vercel

### Quick Deploy

```bash
# Install Vercel CLI
npm install -g vercel

# Set up environment variables on Vercel
npm run deploy:setup

# Deploy
npm run deploy
```

### Deployment Script (`scripts/deploy.sh`)

The deploy script runs pre-deployment checks:

1. **TypeScript compilation** - ensures no type errors
2. **Environment validation** - verifies all required env vars
3. **ESLint** - checks for code quality issues
4. **Uncommitted changes** - warns about uncommitted work

Then presents a checklist:
- Database connection configured
- Google OAuth configured
- Redis configured
- Sentry configured (optional)
- Secrets generated (not placeholder values)
- Production domain set
- OAuth redirect URIs updated for production (including channel callback)
- Database migrations applied

Finally deploys to either preview or production.

### Post-Deployment Checklist

After deploying, verify:

1. **Health checks pass:**
   - `GET /api/health` -> `{ status: "ok" }`
   - `GET /api/health/db` -> Database connected
   - `GET /api/health/redis` -> Redis connected
   - `GET /api/health/full` -> All systems operational

2. **Auth works:**
   - Admin can sign in via Google OAuth
   - Viewer can sign in via viewer portal

3. **Channel connect works:**
   - Admin can connect a YouTube channel via `/api/channels/connect`
   - Token health shows VALID at `/api/channels/[id]/health`

4. **Sentry receives events** (if configured)

5. **Monitor ops dashboard** (`/api/admin/ops/health`) for 15-30 minutes

---

## Vercel Cron Configuration

The full cron schedule is defined in `vercel.json`:

| Cron Path | Schedule | Max Duration | Purpose |
|-----------|----------|-------------|---------|
| `/api/cron/poll-streams` | `*/3 * * * *` (every 3 min) | 300s | Poll YouTube Live Chat |
| `/api/cron/ingest-comments` | `*/15 * * * *` (every 15 min) | 300s | Ingest video comments |
| `/api/cron/discover-videos` | `0 */4 * * *` (every 4 hours) | 120s | Discover new videos |
| `/api/cron/daily-scoring` | `0 2 * * *` (2:00 AM UTC) | 600s | Daily point settlement |
| `/api/cron/fraud-scan` | `0 3 * * *` (3:00 AM UTC) | 300s | Auto-confirm fraud events |
| `/api/cron/fulfill-rewards` | `*/5 * * * *` (every 5 min) | 300s | Digital reward delivery |
| `/api/cron/token-health` | `0 */1 * * *` (every hour) | 60s | Refresh expiring tokens |
| `/api/cron/tier-decay` | `0 0 * * *` (midnight UTC) | 300s | Decay inactive ranks |
| `/api/cron/update-segments` | `0 */6 * * *` (every 6 hours) | 300s | Update viewer segments |

### Vercel Function Duration Config

API routes default to 30s max duration. Overrides in `vercel.json`:

| Function | Max Duration |
|----------|-------------|
| `api/**/*.ts` (default) | 30s |
| `api/streams/[id]/poll` | 60s |
| All cron routes | 120s - 600s (varies) |

The `daily-scoring` cron gets the longest duration (600s / 10 min) because it processes all engagement events since the last run.

Cron jobs authenticate via the `CRON_SECRET` environment variable.

---

## Migration Steps (Phase 1-7)

Migrations are applied in sequence. The key Phase 1 migration adds:
- `Workspace` and `WorkspaceMember` models
- `FanProfile` model (global identity + wallet)
- `ChannelCredential` model (per-channel OAuth)
- `EngagementEvent` model (immutable event log)
- `JobRun` model (job tracking)
- `PointLedger` model (replaces PointTransaction)
- New enums: `TokenStatus`, `EngagementEventType`, `JobType`, `JobStatus`, `WorkspaceMemberRole`

### Applying Migrations

```bash
# Development: create and apply migrations
npx prisma migrate dev --name description_of_change

# Production: apply pending migrations
npm run db:migrate
# or
npx prisma migrate deploy

# Reset database (development only!)
npx prisma migrate reset
```

Migrations are stored in `prisma/migrations/` and should be committed to git.

### Backfill Script

After applying the Phase 1 migration on an existing database, run the backfill script to populate new models from existing data:

```bash
npx tsx scripts/backfill-phase1.ts
```

The backfill performs 5 steps:

1. **Create default workspace** - Creates a workspace for the first user
2. **Backfill FanProfile wallets** - Aggregates points from Viewer records into FanProfile (sum totalPoints, pick highest rank, average trust scores)
3. **Create ChannelCredentials** - Creates credential records from channel owners (tokens set to EXPIRED; channels must be reconnected via OAuth)
4. **Link PointLedger entries** - Links existing ledger entries to their FanProfile via viewer-to-fan mapping
5. **Reconciliation** - Verifies that FanProfile `availablePoints` matches the sum of non-reversed PointLedger entries

After backfill, connect channels via the admin UI to establish valid OAuth tokens.

---

## Production Environment Variables

All variables from `.env.local` must be set in Vercel:

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | With `?pgbouncer=true` for pooling |
| `DIRECT_URL` | Yes | Direct connection for Prisma migrations |
| `NEXTAUTH_URL` | Yes | Production domain (e.g., `https://your-app.vercel.app`) |
| `NEXTAUTH_SECRET` | Yes | Generate: `openssl rand -base64 32` |
| `ADMIN_EMAILS` | Yes | Comma-separated admin emails |
| `GOOGLE_CLIENT_ID` | Yes | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Yes | From Google Cloud Console |
| `UPSTASH_REDIS_REST_URL` | Yes | From Upstash dashboard |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | From Upstash dashboard |
| `CRON_SECRET` | Yes | Generate: `openssl rand -base64 32` |
| `SENTRY_DSN` | No | Sentry error tracking |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Client-side Sentry |
| `SENTRY_AUTH_TOKEN` | No | For source map uploads |
| `SENTRY_ORG` | No | Sentry organization slug |
| `SENTRY_PROJECT` | No | Sentry project slug |
| `YOUTUBE_DAILY_QUOTA_LIMIT` | No | Default: 10,000 |
