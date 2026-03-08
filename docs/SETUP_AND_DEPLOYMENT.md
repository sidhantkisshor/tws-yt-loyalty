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
# ─── Database ───────────────────────────────────────────
# Connection string with PgBouncer (for runtime queries)
DATABASE_URL="postgresql://user:password@host:6543/database?sslmode=require&pgbouncer=true"
# Direct connection (for migrations - bypasses PgBouncer)
DIRECT_URL="postgresql://user:password@host:5432/database?sslmode=require"

# ─── NextAuth ───────────────────────────────────────────
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"

# ─── Admin Access ───────────────────────────────────────
ADMIN_EMAILS="admin@example.com,other-admin@example.com"

# ─── Google OAuth ───────────────────────────────────────
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"

# ─── Upstash Redis ──────────────────────────────────────
UPSTASH_REDIS_REST_URL="https://your-redis.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your-token"

# ─── Cron Security ──────────────────────────────────────
CRON_SECRET="generate-with-openssl-rand-base64-32"

# ─── Sentry (Optional) ─────────────────────────────────
SENTRY_DSN="https://key@org.ingest.sentry.io/project"
NEXT_PUBLIC_SENTRY_DSN="https://key@org.ingest.sentry.io/project"
SENTRY_AUTH_TOKEN="your-sentry-auth-token"
SENTRY_ORG="your-org"
SENTRY_PROJECT="your-project"

# ─── YouTube (Optional) ─────────────────────────────────
YOUTUBE_DAILY_QUOTA_LIMIT="10000"
```

### 3. Google Cloud Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable the **YouTube Data API v3**
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Set application type to **Web application**
6. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (admin)
   - `http://localhost:3000/api/viewer-auth/callback/google` (viewer)
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
- OAuth redirect URIs updated for production
- Database migrations applied

Finally deploys to either preview or production.

### Post-Deployment Checklist

After deploying, verify:

1. **Health checks pass:**
   - `GET /api/health` → `{ status: "ok" }`
   - `GET /api/health/db` → Database connected
   - `GET /api/health/redis` → Redis connected
   - `GET /api/health/full` → All systems operational

2. **Auth works:**
   - Admin can sign in via Google OAuth
   - Viewer can sign in via viewer portal

3. **Sentry receives events** (if configured)

4. **Monitor for 15-30 minutes** for any errors

### Vercel Cron Configuration

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/poll-streams",
      "schedule": "* * * * *"
    },
    {
      "path": "/api/cron/tier-decay",
      "schedule": "0 0 * * *"
    },
    {
      "path": "/api/cron/update-segments",
      "schedule": "0 1 * * *"
    }
  ]
}
```

Cron jobs authenticate via the `CRON_SECRET` environment variable.

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

---

## Database Migrations

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
