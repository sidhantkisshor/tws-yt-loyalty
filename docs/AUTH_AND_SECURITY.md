# Authentication & Security

## Authentication Architecture

YT Loyalty uses **two separate auth systems** for admins and viewers.

### Admin Auth (NextAuth.js)

**Flow:** Google OAuth → JWT session → Admin dashboard access

```
Admin clicks "Sign In"
    → Redirected to Google OAuth
    → Grants YouTube API scopes:
        - youtube.readonly (read chat, video info)
        - youtube.force-ssl (post chat messages)
    → Google tokens stored in User model
    → JWT session created (stateless)
    → Admin dashboard accessible
```

**Configuration** (`src/lib/auth.ts`):
- Provider: Google OAuth 2.0
- Strategy: JWT (no database sessions)
- Token refresh: Automatic when expired
- Admin check: Email must be in `ADMIN_EMAILS` env var
- Adapter: `@auth/prisma-adapter` for User/Account storage

**Key behaviors:**
- Access tokens are stored on the User model for YouTube API calls
- Refresh tokens are used to get new access tokens automatically
- Session includes `userId`, `email`, `role`, and `accessToken`

### Viewer Auth (Separate NextAuth instance)

**Flow:** Google OAuth → Session → Viewer portal access

```
Viewer clicks "Sign In"
    → Redirected to Google OAuth (basic scopes)
    → Matched to existing Viewer by YouTube channel ID
    → ViewerAccount record created/linked
    → Session created
    → Viewer portal accessible
```

**Key differences from admin auth:**
- Does NOT request YouTube API scopes
- Links to `Viewer` model (not `User`)
- Separate session namespace (no cross-contamination)
- No admin privileges regardless of email

---

## Security Headers

### Content Security Policy (Middleware)

Applied via `src/middleware.ts` with per-request nonce:

```
default-src 'self'
script-src  'self' 'nonce-{random}' 'strict-dynamic' https:
style-src   'self' 'unsafe-inline'
img-src     'self' *.youtube.com *.googleusercontent.com *.ggpht.com data:
connect-src 'self' accounts.google.com *.sentry.io *.upstash.io
font-src    'self'
object-src  'none'
frame-ancestors 'none'
upgrade-insecure-requests
```

### HTTP Security Headers (next.config.ts)

| Header | Value | Purpose |
|--------|-------|---------|
| X-Frame-Options | DENY | Prevent clickjacking |
| X-Content-Type-Options | nosniff | Prevent MIME sniffing |
| X-XSS-Protection | 1; mode=block | Legacy XSS protection |
| Referrer-Policy | strict-origin-when-cross-origin | Control referrer leaks |
| Permissions-Policy | camera=(), microphone=(), geolocation=() | Disable unused browser APIs |
| Strict-Transport-Security | max-age=63072000; includeSubDomains; preload | HSTS (production only) |
| X-Powered-By | (removed) | Hide tech stack |

---

## Rate Limiting

Implemented via Upstash Rate Limit (distributed, Redis-backed).

| Limiter | Limit | Window | Purpose |
|---------|-------|--------|---------|
| `authLimiter` | 5 | 15 min | Brute force prevention |
| `streamPollLimiter` | 20 | 1 min | Prevent polling abuse |
| `adminWriteLimiter` | 30 | 1 min | Admin mutation throttle |
| `adminReadLimiter` | 100 | 1 min | Admin read throttle |
| `viewerLimiter` | 30 | 1 min | Viewer request throttle |
| Code redemption | 10 | 1 min | Anti-bot redemption |
| Reward redemption | 3 | 1 min | Prevent reward spam |

Rate-limited responses return HTTP `429` with appropriate error message.

---

## Input Validation

All API inputs validated with **Zod** schemas (`src/lib/validators.ts`).

- Request bodies parsed and validated before any business logic
- Invalid inputs return `400` with structured error messages
- Zod errors are simplified for client consumption (no internal leaks)

---

## Error Handling

Centralized in `src/lib/errorHandler.ts`:

| Function | Purpose |
|----------|---------|
| `sanitizeErrorMessage()` | Hides internal errors in production, shows details in dev |
| `simplifyZodErrors()` | Converts Zod validation errors to client-friendly format |
| `handlePrismaError()` | Maps Prisma errors to appropriate HTTP status codes |
| `handleApiError()` | Catch-all API error handler |
| `logError()` | Safe error logging (never throws) |

**Production behavior:** Internal errors return generic "Something went wrong" messages. Stack traces and database details are never exposed.

---

## Logging

Structured logging via `src/lib/logger.ts` with Sentry integration.

### Sensitive Data Redaction
The logger automatically redacts values for keys containing:
- `password`, `secret`, `token`, `credential`, `authorization`
- `cookie`, `api_key`, `apikey`, `access_token`, `refresh_token`

### Sentry Integration
- Errors → Sentry error capture with context
- Warnings → Sentry breadcrumbs
- User context attached to error reports
- Release tracking for deployment correlation

---

## Cron Job Security

Background jobs at `/api/cron/*` are protected by:

```typescript
// Every cron endpoint validates:
const authHeader = request.headers.get("authorization");
if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  return new Response("Unauthorized", { status: 401 });
}
```

The `CRON_SECRET` must be a 32+ character random string, shared between Vercel Cron config and the env var.

---

## Database Security

- **Connection pooling**: Max 3 connections via PgBouncer (prevents connection exhaustion)
- **Parameterized queries**: Prisma prevents SQL injection by design
- **Cascade deletes**: Configured for referential integrity
- **Unique constraints**: Prevent duplicate data (e.g., one redemption per code per viewer)
- **Audit logging**: `AuditLog` model tracks admin actions with before/after values

---

## Anti-Fraud Measures

See [Services - Fraud Detection](./SERVICES.md#fraud-detection-srcservicesfrauddetectionts) for the full fraud detection system.

Summary of protections:
1. Trust score system (0-100) evaluates viewer reliability
2. Redemption latency tracking identifies bots (<500ms = suspicious)
3. Identical timing detection finds synchronized bot networks
4. Rate limiting prevents rapid-fire redemptions
5. Message similarity hashing detects spam
6. Manual review queue for flagged events
7. Fraud reversals can claw back points with full audit trail
