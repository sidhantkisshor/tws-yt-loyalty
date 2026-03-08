import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { viewerAuthOptions } from '@/lib/viewerAuth'
import prisma from '@/lib/prisma'
import { viewerPublicLimiter, getRateLimitIdentifier, checkRateLimit } from '@/lib/rateLimits'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

// Get all channels available to the logged-in viewer
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession(viewerAuthOptions)

    if (!session?.viewerId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limit check
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'anonymous'
    const identifier = getRateLimitIdentifier(session.viewerId, ip)
    const rateLimit = await checkRateLimit(viewerPublicLimiter, identifier)

    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Too many requests' }, {
        status: 429,
        headers: rateLimit.headers
      })
    }

    // Find the viewer's account first (since session only has one viewerId)
    const currentViewer = await prisma.viewer.findUnique({
      where: { id: session.viewerId },
      select: { fanProfileId: true }
    })

    if (!currentViewer?.fanProfileId) {
      // Fallback: if no account link (legacy?), just return the current channel
      // But based on new flow, this shouldn't happen for logged in users
      return NextResponse.json({ channels: [] })
    }

    // Fetch all viewers associated with this account
    const viewers = await prisma.viewer.findMany({
      where: { fanProfileId: currentViewer.fanProfileId },
      select: {
        id: true,
        channel: {
          select: {
            id: true,
            title: true,
            thumbnailUrl: true
          }
        }
      }
    })

    // Map to simplified structure
    const channels = viewers.map(v => ({
      channelId: v.channel.id,
      channelTitle: v.channel.title,
      viewerId: v.id
    }))

    return NextResponse.json({ channels })

  } catch (error) {
    logger.error('Get viewer channels error', error)
    return NextResponse.json(
      { error: 'Failed to fetch channels' },
      { status: 500 }
    )
  }
}
