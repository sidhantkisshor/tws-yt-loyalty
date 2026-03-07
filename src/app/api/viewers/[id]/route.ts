import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import prisma from '@/lib/prisma'
import { viewerAuthOptions } from '@/lib/viewerAuth'
import { authOptions } from '@/lib/auth'
import { adminReadLimiter, viewerPublicLimiter, getRateLimitIdentifier, checkRateLimit } from '@/lib/rateLimits'
import { logger } from '@/lib/logger'

// Get a specific viewer's details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params

    // Check authentication - allow both admin and viewer sessions
    const [adminSession, viewerSession] = await Promise.all([
      getServerSession(authOptions),
      getServerSession(viewerAuthOptions),
    ])

    // Viewers can only access their own data
    if (viewerSession?.viewerId && viewerSession.viewerId !== id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Must be authenticated as either admin or the viewer themselves
    if (!adminSession && !viewerSession?.viewerId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limit check - use appropriate limiter based on session type
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'anonymous'
    const limiter = adminSession ? adminReadLimiter : viewerPublicLimiter
    const identifier = getRateLimitIdentifier(adminSession?.user?.id || viewerSession?.viewerId, ip)
    const rateLimit = await checkRateLimit(limiter, identifier)

    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Too many requests' }, {
        status: 429,
        headers: rateLimit.headers
      })
    }

    const viewer = await prisma.viewer.findUnique({
      where: { id },
      include: {
        channel: {
          select: {
            id: true,
            title: true,
            thumbnailUrl: true,
          },
        },
        pointLedger: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            type: true,
            amount: true,
            description: true,
            createdAt: true,
          },
        },
        codeRedemptions: {
          orderBy: { redeemedAt: 'desc' },
          take: 10,
          include: {
            code: {
              select: {
                code: true,
                codeType: true,
                basePoints: true,
              },
            },
          },
        },
        streamAttendances: {
          orderBy: { firstMessageAt: 'desc' },
          take: 10,
          include: {
            stream: {
              select: {
                id: true,
                title: true,
                actualStartAt: true,
              },
            },
          },
        },
      },
    })

    if (!viewer) {
      return NextResponse.json({ error: 'Viewer not found' }, { status: 404 })
    }

    // Calculate tokens (1000 points = 1 token)
    const availableTokens = Math.floor(viewer.availablePoints / 1000)

    return NextResponse.json({
      ...viewer,
      availableTokens,
    })
  } catch (error) {
    logger.error('Get viewer error', error)
    return NextResponse.json(
      { error: 'Failed to get viewer' },
      { status: 500 }
    )
  }
}
