import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import prisma from '@/lib/prisma'
import { viewerAuthOptions } from '@/lib/viewerAuth'
import { authOptions } from '@/lib/auth'
import { adminReadLimiter, viewerPublicLimiter, getRateLimitIdentifier, checkRateLimit } from '@/lib/rateLimits'
import { logger } from '@/lib/logger'

// Look up a viewer by YouTube channel ID
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Check authentication - allow both admin and viewer sessions
    const [adminSession, viewerSession] = await Promise.all([
      getServerSession(authOptions),
      getServerSession(viewerAuthOptions),
    ])

    // Must be authenticated
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

    const { searchParams } = new URL(request.url)
    const youtubeChannelId = searchParams.get('youtubeChannelId')
    const channelId = searchParams.get('channelId')

    if (!youtubeChannelId) {
      return NextResponse.json(
        { error: 'youtubeChannelId is required' },
        { status: 400 }
      )
    }

    // Build where clause
    const where: { youtubeChannelId: string; channelId?: string } = {
      youtubeChannelId,
    }
    if (channelId) {
      where.channelId = channelId
    }

    const viewers = await prisma.viewer.findMany({
      where,
      include: {
        channel: {
          select: {
            id: true,
            title: true,
            thumbnailUrl: true,
          },
        },
      },
      orderBy: { totalPoints: 'desc' },
    })

    if (viewers.length === 0) {
      return NextResponse.json({ error: 'Viewer not found' }, { status: 404 })
    }

    // If looking for a specific channel, return single viewer
    if (channelId) {
      const viewer = viewers[0]
      return NextResponse.json({
        ...viewer,
        availableTokens: Math.floor(viewer.availablePoints / 1000),
      })
    }

    // Return all viewers across channels
    return NextResponse.json({
      viewers: viewers.map((v: typeof viewers[number]) => ({
        ...v,
        availableTokens: Math.floor(v.availablePoints / 1000),
      })),
    })
  } catch (error) {
    logger.error('Viewer lookup error', error)
    return NextResponse.json(
      { error: 'Failed to lookup viewer' },
      { status: 500 }
    )
  }
}
