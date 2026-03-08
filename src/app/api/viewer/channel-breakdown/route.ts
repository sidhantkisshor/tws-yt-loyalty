import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { viewerAuthOptions } from '@/lib/viewerAuth'
import prisma from '@/lib/prisma'
import { viewerPublicLimiter, getRateLimitIdentifier, checkRateLimit } from '@/lib/rateLimits'
import { logger } from '@/lib/logger'

// Get per-channel point breakdown for the authenticated viewer
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

    // Find the viewer to get their fanProfileId
    const primaryViewer = await prisma.viewer.findUnique({
      where: { id: session.viewerId },
      select: { fanProfileId: true },
    })

    if (!primaryViewer?.fanProfileId) {
      return NextResponse.json({ error: 'Fan profile not found' }, { status: 404 })
    }

    // Fetch the FanProfile global wallet
    const fanProfile = await prisma.fanProfile.findUnique({
      where: { id: primaryViewer.fanProfileId },
      select: {
        totalPoints: true,
        availablePoints: true,
        lifetimePoints: true,
      },
    })

    if (!fanProfile) {
      return NextResponse.json({ error: 'Fan profile not found' }, { status: 404 })
    }

    // Fetch all Viewer records under this FanProfile with channel info
    const viewers = await prisma.viewer.findMany({
      where: { fanProfileId: primaryViewer.fanProfileId },
      select: {
        totalPoints: true,
        lifetimePoints: true,
        totalMessagesCount: true,
        totalStreamsAttended: true,
        totalCodesRedeemed: true,
        channel: {
          select: {
            id: true,
            title: true,
            thumbnailUrl: true,
          },
        },
      },
    })

    const channels = viewers.map((v) => ({
      channelId: v.channel.id,
      channelTitle: v.channel.title,
      thumbnailUrl: v.channel.thumbnailUrl,
      totalPoints: v.totalPoints,
      lifetimePoints: v.lifetimePoints,
      messagesCount: v.totalMessagesCount,
      streamsAttended: v.totalStreamsAttended,
      codesRedeemed: v.totalCodesRedeemed,
    }))

    return NextResponse.json({
      globalTotal: fanProfile.totalPoints,
      globalAvailable: fanProfile.availablePoints,
      globalLifetime: fanProfile.lifetimePoints,
      channels,
    })
  } catch (error) {
    logger.error('Channel breakdown error', error)
    return NextResponse.json(
      { error: 'Failed to get channel breakdown' },
      { status: 500 }
    )
  }
}
