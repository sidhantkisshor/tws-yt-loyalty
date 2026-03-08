import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { updateViewerStreaks, awardFullStreamBonuses } from '@/services/bonusCalculator'
import { awardWatchTimePointsForStream } from '@/services/watchTimeTracker'
import { dispatchWebhooks } from '@/services/webhookDispatcher'
import { adminWriteLimiter, getRateLimitIdentifier, checkRateLimit } from '@/lib/rateLimits'
import { logger } from '@/lib/logger'

// End a stream and trigger bonus calculations
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limit check
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'anonymous'
    const identifier = getRateLimitIdentifier(session.user.id, ip)
    const rateLimit = await checkRateLimit(adminWriteLimiter, identifier)

    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Too many requests' }, {
        status: 429,
        headers: rateLimit.headers
      })
    }

    const { id: streamId } = await params

    // Get stream with channel info
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      include: {
        channel: true,
      },
    })

    if (!stream) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 })
    }

    // Verify ownership
    if (stream.channel.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Check if stream is live
    if (stream.status !== 'LIVE') {
      return NextResponse.json(
        { error: 'Stream is not live' },
        { status: 400 }
      )
    }

    // Update stream status
    const updatedStream = await prisma.stream.update({
      where: { id: streamId },
      data: {
        status: 'ENDED',
        isPollingActive: false,
        endedAt: new Date(),
      },
    })

    // Calculate final stats
    const stats = await prisma.streamAttendance.aggregate({
      where: { streamId },
      _count: { viewerId: true },
      _sum: { pointsEarned: true, codesRedeemed: true },
    })

    // Update stream with final stats
    await prisma.stream.update({
      where: { id: streamId },
      data: {
        totalUniqueChatters: stats._count.viewerId,
      },
    })

    // Award bonuses in background
    const [streakUpdates, fullStreamBonuses, watchTimeResults] = await Promise.all([
      updateViewerStreaks(streamId),
      awardFullStreamBonuses(streamId),
      awardWatchTimePointsForStream(streamId),
    ])

    // Dispatch stream.ended webhook
    dispatchWebhooks(stream.channelId, 'stream.ended', {
      streamId: updatedStream.id,
      channelId: stream.channelId,
      title: stream.title,
      endedAt: updatedStream.endedAt,
      stats: {
        uniqueChatters: stats._count.viewerId,
        totalPointsAwarded: stats._sum.pointsEarned || 0,
        totalCodesRedeemed: stats._sum.codesRedeemed || 0,
        streakUpdates,
        fullStreamBonuses,
        watchTimePoints: watchTimeResults.totalPointsAwarded,
        watchTimeViewers: watchTimeResults.viewersAwarded,
      },
    }).catch((err) => {
      logger.error('Failed to dispatch stream.ended webhook', err as Error, { streamId })
    })

    return NextResponse.json({
      message: 'Stream ended successfully',
      stream: {
        id: updatedStream.id,
        status: updatedStream.status,
        endedAt: updatedStream.endedAt,
      },
      stats: {
        uniqueChatters: stats._count.viewerId,
        totalPointsAwarded: stats._sum.pointsEarned || 0,
        totalCodesRedeemed: stats._sum.codesRedeemed || 0,
        streakUpdates,
        fullStreamBonuses,
        watchTimePoints: watchTimeResults.totalPointsAwarded,
        watchTimeViewers: watchTimeResults.viewersAwarded,
      },
    })
  } catch (error) {
    logger.error('End stream error', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to end stream' },
      { status: 500 }
    )
  }
}
