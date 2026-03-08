import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Content Security Policy Middleware
 *
 * Implements CSP with nonce-based script execution
 * to prevent XSS attacks while allowing inline scripts
 */

export function middleware(request: NextRequest) {
  // Generate a random nonce for this request
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')

  // Build Content Security Policy
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https:;
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data: https://i.ytimg.com https://yt3.ggpht.com https://yt3.googleusercontent.com;
    font-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    connect-src 'self' https://accounts.google.com https://*.ingest.sentry.io https://*.upstash.io;
    upgrade-insecure-requests;
  `
    .replace(/\s{2,}/g, ' ')
    .trim()

  // Clone the request headers
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)

  // Create response with CSP header
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })

  response.headers.set('Content-Security-Policy', cspHeader)

  return response
}

// Configure which routes to apply middleware to
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - /api/ (API routes)
     * - /_next/ (Next.js internals)
     * - /favicon.ico, /robots.txt (static files)
     */
    {
      source: '/((?!api|_next|favicon.ico|robots.txt).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
