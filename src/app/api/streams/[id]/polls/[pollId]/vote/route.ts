import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { viewerAuthOptions } from '@/lib/viewerAuth'
import prisma from '@/lib/prisma'
import { z } from 'zod'
import { logger } from '@/lib/logger'

const voteSchema = z.object({
  selectedOption: z.number().int().min(0),
})

// POST /api/streams/[id]/polls/[pollId]/vote - Vote on a poll (viewer auth)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pollId: string }> }
): Promise<NextResponse> {
  try {
    const session = await getServerSession(viewerAuthOptions)
    if (!session?.viewerId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: streamId, pollId } = await params
    const body = await request.json()
    const data = voteSchema.parse(body)

    // Fetch the poll
    const poll = await prisma.streamPoll.findUnique({
      where: { id: pollId },
    })

    if (!poll || poll.streamId !== streamId) {
      return NextResponse.json({ error: 'Poll not found' }, { status: 404 })
    }

    if (!poll.isActive) {
      return NextResponse.json({ error: 'Poll is no longer active' }, { status: 400 })
    }

    // Validate selectedOption is within range
    const options = poll.options as string[]
    if (data.selectedOption >= options.length) {
      return NextResponse.json(
        { error: `selectedOption must be less than ${options.length}` },
        { status: 400 }
      )
    }

    const viewerId = session.viewerId
    const pointsToAward = 15

    // Award points and create vote atomically
    const result = await prisma.$transaction(async (tx) => {
      // Get current viewer balance
      const viewer = await tx.viewer.findUnique({
        where: { id: viewerId },
        select: { availablePoints: true, totalPoints: true, lifetimePoints: true },
      })

      if (!viewer) {
        throw new Error('VIEWER_NOT_FOUND')
      }

      // Create the poll response (unique constraint on [pollId, viewerId] handles duplicates)
      const response = await tx.pollResponse.create({
        data: {
          pollId,
          viewerId,
          selectedOption: data.selectedOption,
          pointsAwarded: pointsToAward,
        },
      })

      // Award points
      await tx.viewer.update({
        where: { id: viewerId },
        data: {
          totalPoints: { increment: pointsToAward },
          availablePoints: { increment: pointsToAward },
          lifetimePoints: { increment: pointsToAward },
        },
      })

      // Create point transaction
      await tx.pointLedger.create({
        data: {
          viewerId,
          streamId,
          type: 'POLL_PARTICIPATION',
          amount: pointsToAward,
          balanceBefore: viewer.availablePoints,
          balanceAfter: viewer.availablePoints + pointsToAward,
          referenceType: 'poll_response',
          referenceId: response.id,
          description: `Poll participation: ${poll.question}`,
        },
      })

      return response
    })

    return NextResponse.json({
      success: true,
      response: result,
      pointsAwarded: pointsToAward,
    }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }

    // Handle unique constraint violation (duplicate vote)
    if (
      error instanceof Error &&
      'code' in error &&
      (error as Record<string, unknown>).code === 'P2002'
    ) {
      return NextResponse.json(
        { error: 'You have already voted on this poll' },
        { status: 409 }
      )
    }

    if (error instanceof Error && error.message === 'VIEWER_NOT_FOUND') {
      return NextResponse.json({ error: 'Viewer not found' }, { status: 404 })
    }

    logger.error('Poll vote error', error)
    return NextResponse.json(
      { error: 'Failed to submit vote' },
      { status: 500 }
    )
  }
}
