import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { viewerAuthOptions } from '@/lib/viewerAuth'
import prisma from '@/lib/prisma'
import {
  canActivatePause,
  getPauseCost,
  getPauseDurationDays,
  PauseType,
} from '@/services/streakManager'
import { logger } from '@/lib/logger'

// POST: Activate a streak pause (viewer auth)
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession(viewerAuthOptions)

    if (!session?.viewerId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { pauseType } = body as { pauseType?: string }

    if (pauseType !== '3day' && pauseType !== '7day') {
      return NextResponse.json(
        { error: 'Invalid pauseType. Must be "3day" or "7day".' },
        { status: 400 }
      )
    }

    const typedPauseType: PauseType = pauseType

    // Determine target viewer ID based on channel selection
    let targetViewerId = session.viewerId
    const { searchParams } = new URL(request.url)
    const channelId = searchParams.get('channelId')

    if (channelId && session.availableChannels) {
      const channelData = session.availableChannels.find(
        (c: { channelId: string; viewerId: string }) => c.channelId === channelId
      )
      if (channelData) {
        targetViewerId = channelData.viewerId
      } else {
        return NextResponse.json(
          { error: 'Unauthorized for this channel' },
          { status: 403 }
        )
      }
    }

    const viewer = await prisma.viewer.findUnique({
      where: { id: targetViewerId },
    })

    if (!viewer) {
      return NextResponse.json({ error: 'Viewer not found' }, { status: 404 })
    }

    // Reset monthly pause counts if new month
    const now = new Date()
    const currentMonth = now.getFullYear() * 12 + now.getMonth()
    let shortPausesUsed = viewer.shortPausesUsedThisMonth
    let longPausesUsed = viewer.longPausesUsedThisMonth

    if (viewer.lastPauseResetMonth !== currentMonth) {
      shortPausesUsed = 0
      longPausesUsed = 0
    }

    // Validate pause limits and active pause
    if (
      !canActivatePause(
        typedPauseType,
        shortPausesUsed,
        longPausesUsed,
        viewer.pauseEndsAt
      )
    ) {
      return NextResponse.json(
        { error: 'Cannot activate pause. Limit reached or pause already active.' },
        { status: 400 }
      )
    }

    // Validate point balance for 7-day pause
    const cost = getPauseCost(typedPauseType)
    if (cost > 0 && viewer.availablePoints < cost) {
      return NextResponse.json(
        { error: `Not enough points. ${cost} points required.` },
        { status: 400 }
      )
    }

    const durationDays = getPauseDurationDays(typedPauseType)
    const pauseStartedAt = now
    const endsAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000)

    // Transaction: update viewer fields, create StreakPause, optionally create cost transaction
    await prisma.$transaction(async (tx) => {
      // Update viewer pause fields
      await tx.viewer.update({
        where: { id: targetViewerId },
        data: {
          activePauseType: typedPauseType,
          pauseStartedAt,
          pauseEndsAt: endsAt,
          shortPausesUsedThisMonth:
            typedPauseType === '3day' ? shortPausesUsed + 1 : shortPausesUsed,
          longPausesUsedThisMonth:
            typedPauseType === '7day' ? longPausesUsed + 1 : longPausesUsed,
          lastPauseResetMonth: currentMonth,
          ...(cost > 0 && { availablePoints: { decrement: cost } }),
        },
      })

      // Create StreakPause record
      await tx.streakPause.create({
        data: {
          viewerId: targetViewerId,
          pauseType: typedPauseType,
          pointsCost: cost,
          startedAt: pauseStartedAt,
          endsAt,
        },
      })

      // Create cost transaction if applicable
      if (cost > 0) {
        await tx.pointLedger.create({
          data: {
            viewerId: targetViewerId,
            type: 'STREAK_PAUSE_COST',
            amount: -cost,
            balanceBefore: viewer.availablePoints,
            balanceAfter: viewer.availablePoints - cost,
            description: `Streak pause (${typedPauseType}) activated`,
          },
        })
      }
    })

    return NextResponse.json({
      success: true,
      pauseType: typedPauseType,
      endsAt: endsAt.toISOString(),
      pointsDeducted: cost,
    })
  } catch (error) {
    logger.error('Streak pause error', error)
    return NextResponse.json(
      { error: 'Failed to activate streak pause' },
      { status: 500 }
    )
  }
}
