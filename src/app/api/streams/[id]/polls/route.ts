import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { z } from 'zod'
import { logger } from '@/lib/logger'

const createPollSchema = z.object({
  question: z.string().min(3).max(200),
  options: z.array(z.string().min(1).max(200)).min(2).max(6),
})

// GET /api/streams/[id]/polls - List polls for a stream (public)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: streamId } = await params

    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      select: { id: true },
    })

    if (!stream) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 })
    }

    const polls = await prisma.streamPoll.findMany({
      where: { streamId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { responses: true },
        },
      },
    })

    return NextResponse.json({ polls })
  } catch (error) {
    logger.error('List polls error', error)
    return NextResponse.json(
      { error: 'Failed to list polls' },
      { status: 500 }
    )
  }
}

// POST /api/streams/[id]/polls - Create a new poll (admin only)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: streamId } = await params
    const body = await request.json()
    const data = createPollSchema.parse(body)

    // Verify stream exists and admin owns it
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      include: {
        channel: {
          select: { ownerId: true },
        },
      },
    })

    if (!stream) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 })
    }

    if (stream.channel.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Auto-close any active polls for this stream, then create new one
    const poll = await prisma.$transaction(async (tx) => {
      await tx.streamPoll.updateMany({
        where: { streamId, isActive: true },
        data: { isActive: false, closedAt: new Date() },
      })

      return tx.streamPoll.create({
        data: {
          streamId,
          question: data.question,
          options: data.options,
          isActive: true,
        },
      })
    })

    return NextResponse.json({ poll }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Create poll error', error)
    return NextResponse.json(
      { error: 'Failed to create poll' },
      { status: 500 }
    )
  }
}
