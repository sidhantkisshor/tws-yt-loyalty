import NextAuth from 'next-auth'
import { authOptions } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { authLimiter, getRateLimitIdentifier } from '@/lib/rateLimits'

const handler = NextAuth(authOptions)

async function withRateLimit(
  request: NextRequest,
  originalHandler: (req: NextRequest) => Promise<Response>
) {
  // Get IP address for rate limiting
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'anonymous'
  const identifier = getRateLimitIdentifier(undefined, ip)

  // Check rate limit
  const { success, limit, remaining, reset } = await authLimiter.limit(identifier)

  if (!success) {
    return NextResponse.json(
      { error: 'Too many authentication attempts. Please try again later.' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': String(remaining),
          'X-RateLimit-Reset': String(reset),
          'Retry-After': '900', // 15 minutes
        },
      }
    )
  }

  // Add rate limit headers to successful requests
  const response = await originalHandler(request)
  response.headers.set('X-RateLimit-Limit', String(limit))
  response.headers.set('X-RateLimit-Remaining', String(remaining))
  response.headers.set('X-RateLimit-Reset', String(reset))

  return response
}

export async function GET(request: NextRequest) {
  return withRateLimit(request, handler)
}

export async function POST(request: NextRequest) {
  return withRateLimit(request, handler)
}
