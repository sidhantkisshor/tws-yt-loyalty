import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { calculateSegment, type SegmentInput } from '@/services/segmentation'
import { dispatchWebhooks } from '@/services/webhookDispatcher'

const BATCH_SIZE = 100

const VIEWER_SELECT = {
  id: true,
  channelId: true,
  displayName: true,
  rank: true,
  totalStreamsAttended: true,
  hasPurchasedCourse: true,
  hasPurchasedPremiumCohort: true,
  currentStreak: true,
  helpfulUpvotesReceived: true,
  lastSeenAt: true,
  currentSegment: true,
  rewardRedemptions: {
    where: {
      reward: {
        externalModuleId: { not: null },
      },
    },
    select: { id: true },
    take: 1,
  },
} as const

type ViewerBatchResult = Awaited<ReturnType<typeof prisma.viewer.findMany<{ select: typeof VIEWER_SELECT }>>>

async function fetchViewerBatch(cursor: string | undefined): Promise<ViewerBatchResult> {
  return prisma.viewer.findMany({
    take: BATCH_SIZE,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: { id: 'asc' as const },
    select: VIEWER_SELECT,
  })
}

// POST: Batch update viewer segments (auth via Bearer CRON_SECRET)
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Verify cron secret
  if (!env.CRON_SECRET) {
    logger.error('CRON_SECRET environment variable is not configured')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    let updated = 0
    let cursor: string | undefined = undefined

    // Process viewers in batches of 100 using cursor-based pagination
    while (true) {
      const viewers = await fetchViewerBatch(cursor)

      if (viewers.length === 0) break

      for (const viewer of viewers) {
        const segmentInput: SegmentInput = {
          rank: viewer.rank,
          totalStreamsAttended: viewer.totalStreamsAttended,
          hasPurchasedCourse: viewer.hasPurchasedCourse,
          hasPurchasedPremiumCohort: viewer.hasPurchasedPremiumCohort,
          currentStreak: viewer.currentStreak,
          helpfulUpvotesReceived: viewer.helpfulUpvotesReceived,
          lastSeenAt: viewer.lastSeenAt,
          hasRedeemedModuleUnlock: viewer.rewardRedemptions.length > 0,
        }

        const newSegment = calculateSegment(segmentInput)

        if (newSegment !== viewer.currentSegment) {
          await prisma.viewer.update({
            where: { id: viewer.id },
            data: {
              currentSegment: newSegment,
              segmentUpdatedAt: new Date(),
            },
          })

          updated++

          // Fire webhook for segment change
          await dispatchWebhooks(viewer.channelId, 'viewer.segment_changed', {
            viewerId: viewer.id,
            displayName: viewer.displayName,
            previousSegment: viewer.currentSegment,
            newSegment,
          })
        }
      }

      cursor = viewers[viewers.length - 1].id

      // If we got fewer than batch size, we've reached the end
      if (viewers.length < BATCH_SIZE) break
    }

    return NextResponse.json({ success: true, updated })
  } catch (error) {
    logger.error('Update segments cron error', error)
    return NextResponse.json(
      { error: 'Update segments cron failed' },
      { status: 500 }
    )
  }
}
