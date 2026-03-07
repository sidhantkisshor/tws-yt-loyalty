import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { logger } from '@/lib/logger'

// GET: Return top 10 earners for a stream (public, no auth)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: streamId } = await params

    const topEarners = await prisma.streamAttendance.findMany({
      where: { streamId },
      orderBy: { pointsEarned: 'desc' },
      take: 10,
      include: {
        viewer: {
          select: {
            displayName: true,
            rank: true,
          },
        },
      },
    })

    const leaderboard = topEarners.map((entry, index) => ({
      rank: index + 1,
      displayName: entry.viewer.displayName,
      pointsEarned: entry.pointsEarned,
      tier: entry.viewer.rank,
    }))

    return NextResponse.json(leaderboard)
  } catch (error) {
    logger.error('Stream leaderboard error', error)
    return NextResponse.json(
      { error: 'Failed to get stream leaderboard' },
      { status: 500 }
    )
  }
}
