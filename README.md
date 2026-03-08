# YT Loyalty

A cross-channel YouTube loyalty platform. Connect multiple YouTube channels (even with different Google accounts), ingest live chat and comments, score engagement daily, and let fans redeem digital rewards from a single global wallet.

## Architecture

```
Vercel (control plane)          Shared Infra
  Admin dashboard                PostgreSQL (Prisma 7)
  Viewer portal                  Upstash Redis (locks, cache, leaderboards)
  API routes                     Sentry (errors, tracing)
  9 cron endpoints
```

**Key models:** Workspace > Channel > Stream > Viewer, with FanProfile as the global identity and PointLedger as the immutable transaction log.

## Features

**Admin** — Channel management, stream control, reward catalog, fulfillment queue, fraud review, ops dashboard with health/alerts/job history.

**Viewer** — Global wallet across all channels, rank progression (Paper Trader to Whale), reward redemption, transaction history, streak tracking, channel switcher.

**Backend** — Distributed lock coordination, daily scoring settlement, batch anti-cheat (velocity/duplicate/timing/rapid-account), digital fulfillment pipeline, per-channel OAuth with auto-refresh.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict) |
| Database | PostgreSQL + Prisma 7 (PrismaPg adapter) |
| Cache | Upstash Redis (REST) |
| Auth | NextAuth.js (Google OAuth) |
| Testing | Vitest (356 tests) |
| Monitoring | Sentry |
| Deployment | Vercel |

## Quick Start

```bash
git clone https://github.com/sidhantkisshor/tws-yt-loyalty.git
cd tws-yt-loyalty
npm install
cp .env.example .env.local   # fill in real values
npx prisma generate
npx prisma migrate dev
npm run dev
```

See [`.env.example`](.env.example) for all required variables.

## Cron Schedule

| Endpoint | Schedule | Purpose |
|----------|----------|---------|
| `poll-streams` | Every 3 min | Live chat ingestion |
| `ingest-comments` | Every 15 min | Video comment ingestion |
| `fulfill-rewards` | Every 5 min | Digital reward delivery |
| `token-health` | Hourly | OAuth token monitoring |
| `discover-videos` | Every 4 hrs | New video discovery |
| `update-segments` | Every 6 hrs | Fan segmentation |
| `daily-scoring` | 2 AM UTC | Point settlement |
| `fraud-scan` | 3 AM UTC | Fraud review + enforcement |
| `tier-decay` | Midnight UTC | Rank decay |

## Testing

```bash
npm test              # run all tests
npx tsc --noEmit      # type check
npx next build        # production build
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [API Reference](docs/API_REFERENCE.md)
- [Database Schema](docs/DATABASE_SCHEMA.md)
- [Services](docs/SERVICES.md)
- [Auth & Security](docs/AUTH_AND_SECURITY.md)
- [Setup & Deployment](docs/SETUP_AND_DEPLOYMENT.md)

## License

Proprietary. All rights reserved.
