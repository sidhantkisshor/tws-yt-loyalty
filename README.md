# YT Loyalty - YouTube Livestream Loyalty Program

A production-ready Next.js application that enables YouTube content creators to run loyalty programs during livestreams, rewarding viewers with redeemable codes and points.

## Features

### For Content Creators (Admins)
- 🔴 **Stream Management**: Create and manage YouTube livestreams
- 🎁 **Loyalty Codes**: Generate unique codes with customizable point values
- 📊 **Real-time Analytics**: Track viewer engagement and code redemptions
- 🛡️ **Fraud Detection**: Automated trust scoring and bot detection
- 📦 **Reward Management**: Create digital and physical rewards
- 🎯 **Point System**: Flexible point allocation with member/moderator bonuses

### For Viewers
- 💰 **Point Accumulation**: Earn points by redeeming codes during livestreams
- 🏆 **Rank System**: Progress through ranks (Observer → Operator → Sniper → Architect → Inner Circle)
- 🎁 **Reward Redemption**: Exchange points for exclusive rewards
- 📜 **Transaction History**: Track all point earnings and redemptions
- 🔐 **Secure Authentication**: Google OAuth integration

### Security Features
- ✅ Rate limiting on all endpoints
- ✅ Input validation with Zod
- ✅ Content Security Policy (CSP) with nonce
- ✅ Comprehensive security headers
- ✅ Error message sanitization
- ✅ Sentry error tracking
- ✅ Structured logging
- ✅ Fraud detection system

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Authentication**: NextAuth.js with Google OAuth
- **Database**: PostgreSQL with Prisma ORM
- **Cache/Rate Limiting**: Redis (Upstash)
- **Monitoring**: Sentry
- **Deployment**: Vercel
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Testing**: Vitest

## Prerequisites

- Node.js 20+
- PostgreSQL database (recommended: Neon, Supabase, or Railway)
- Redis database (Upstash)
- Google Cloud project with OAuth credentials
- Sentry account (optional but recommended)

## Quick Start

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd yt-loyalty
npm install
```

### 2. Environment Setup

Create `.env.local` file:

```env
# Database (PostgreSQL with connection pooling)
DATABASE_URL="postgresql://user:password@host/database?sslmode=require&pgbouncer=true"

# NextAuth.js
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-here"  # Generate: openssl rand -base64 32

# Google OAuth
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"

# Redis (Upstash)
UPSTASH_REDIS_REST_URL="https://your-redis.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your-token"

# Sentry (Optional)
SENTRY_DSN="https://key@org.ingest.sentry.io/project"
NEXT_PUBLIC_SENTRY_DSN="https://key@org.ingest.sentry.io/project"
```

### 3. Database Setup

```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npx prisma migrate dev

# (Optional) Open Prisma Studio
npm run db:studio
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
yt-loyalty/
├── src/
│   ├── app/                 # Next.js App Router pages
│   │   ├── admin/          # Admin dashboard
│   │   ├── viewer/         # Viewer interface
│   │   └── api/            # API routes
│   ├── components/         # React components
│   ├── lib/                # Utilities and configurations
│   │   ├── auth.ts         # NextAuth configuration
│   │   ├── prisma.ts       # Database client
│   │   ├── redis.ts        # Redis client
│   │   ├── rateLimits.ts   # Rate limiting
│   │   ├── validators.ts   # Input validation
│   │   ├── logger.ts       # Structured logging
│   │   └── env.ts          # Environment validation
│   ├── services/           # Business logic
│   │   ├── fraudDetection.ts
│   │   └── messageProcessor.ts
│   └── middleware.ts       # CSP and security middleware
├── prisma/
│   └── schema.prisma       # Database schema
├── scripts/                # Deployment and utility scripts
└── __tests__/             # Test suites
```

## Deployment

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for comprehensive deployment instructions.

### Quick Deploy to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Configure environment variables
npm run deploy:setup

# Deploy
npm run deploy
```

## Testing

```bash
# Run all tests
npm test

# Type checking
npm run typecheck

# Linting
npm run lint
```

See [TESTING_GUIDE.md](TESTING_GUIDE.md) for detailed testing documentation.

## Security

This application has been hardened for production with comprehensive security measures.

See [SECURITY_AUDIT_CHECKLIST.md](SECURITY_AUDIT_CHECKLIST.md) for the complete security checklist.

## Documentation

- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) - Production deployment
- [SECURITY_AUDIT_CHECKLIST.md](SECURITY_AUDIT_CHECKLIST.md) - Security checklist
- [SENTRY_ALERTS_GUIDE.md](SENTRY_ALERTS_GUIDE.md) - Monitoring setup
- [TESTING_GUIDE.md](TESTING_GUIDE.md) - Testing procedures
- [PRODUCTION_HARDENING_PROGRESS.md](PRODUCTION_HARDENING_PROGRESS.md) - Hardening status
- [KNOWN_ISSUES.md](KNOWN_ISSUES.md) - Known issues and workarounds

## Learn More

To learn more about Next.js:

- [Next.js Documentation](https://nextjs.org/docs)
- [Learn Next.js](https://nextjs.org/learn)

## License

This project is proprietary. All rights reserved.

---

**Built with Next.js and TypeScript** | **Production Ready** | **Secure** | **Scalable**
