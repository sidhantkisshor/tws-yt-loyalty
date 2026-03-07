import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import {
  setStreamState,
  clearStreamState,
  getStreamLeaderboard,
} from '@/lib/redis'
import { z } from 'zod'
import { adminReadLimiter, adminWriteLimiter, getRateLimitIdentifier, checkRateLimit } from '@/lib/rateLimits'
import { logger } from '@/lib/logger'

const updateStreamSchema = z.object({
  status: z.enum(['SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED']).optional(),
  pollIntervalMs: z.number().min(3000).max(15000).optional(),
})

// GET /api/streams/[id] - Get stream details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limit check
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'anonymous'
    const identifier = getRateLimitIdentifier(session.user.id, ip)
    const rateLimit = await checkRateLimit(adminReadLimiter, identifier)

    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Too many requests' }, {
        status: 429,
        headers: rateLimit.headers
      })
    }

    const { id } = await params

    const stream = await prisma.stream.findUnique({
      where: { id },
      include: {
        channel: {
          select: {
            id: true,
            title: true,
            thumbnailUrl: true,
            ownerId: true,
          },
        },
        loyaltyCodes: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        _count: {
          select: {
            loyaltyCodes: true,
            chatMessages: true,
            streamAttendances: true,
          },
        },
      },
    })

    if (!stream) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 })
    }

    // Verify ownership
    if (stream.channel.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get live leaderboard
    const leaderboard = await getStreamLeaderboard(id, 10)

    // Enrich leaderboard with viewer names
    const viewerIds = leaderboard.map((e) => e.viewerId)
    const viewers = await prisma.viewer.findMany({
      where: { id: { in: viewerIds } },
      select: { id: true, displayName: true, rank: true },
    })

    type ViewerInfo = { id: string; displayName: string; rank: string }
    const viewerMap = new Map<string, ViewerInfo>()
    viewers.forEach((v: ViewerInfo) => viewerMap.set(v.id, v))
    const enrichedLeaderboard = leaderboard.map((entry: { viewerId: string; points: number }, index: number) => ({
      rank: index + 1,
      viewerId: entry.viewerId,
      displayName: viewerMap.get(entry.viewerId)?.displayName ?? 'Unknown',
      viewerRank: viewerMap.get(entry.viewerId)?.rank ?? 'PAPER_TRADER',
      points: entry.points,
    }))

    return NextResponse.json({
      stream,
      leaderboard: enrichedLeaderboard,
    })
  } catch (error) {
    logger.error('Error fetching stream', error)
    return NextResponse.json(
      { error: 'Failed to fetch stream' },
      { status: 500 }
    )
  }
}

// PATCH /api/streams/[id] - Update stream
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params
    const body = await request.json()
    const updates = updateStreamSchema.parse(body)

    // Get stream and verify ownership
    const stream = await prisma.stream.findUnique({
      where: { id },
      include: {
        channel: {
          select: { ownerId: true, youtubeChannelId: true },
        },
      },
    })

    if (!stream) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 })
    }

    if (stream.channel.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Handle status changes
    const updateData: Record<string, unknown> = { ...updates }

    if (updates.status === 'LIVE' && stream.status !== 'LIVE') {
      updateData.actualStartAt = new Date()
      updateData.isPollingActive = true

      // Set up Redis state for polling
      if (stream.youtubeLiveChatId) {
        await setStreamState(id, {
          channelId: stream.channelId,
          youtubeLiveChatId: stream.youtubeLiveChatId,
          status: 'live',
          lastPollAt: new Date().toISOString(),
          pollingIntervalMs: stream.pollIntervalMs,
        })
      }
    }

    if (updates.status === 'ENDED' && stream.status === 'LIVE') {
      updateData.endedAt = new Date()
      updateData.isPollingActive = false

      // Clear Redis state
      await clearStreamState(id)
    }

    const updatedStream = await prisma.stream.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ stream: updatedStream })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Error updating stream', error)
    return NextResponse.json(
      { error: 'Failed to update stream' },
      { status: 500 }
    )
  }
}

// DELETE /api/streams/[id] - Delete stream
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params

    // Get stream and verify ownership
    const stream = await prisma.stream.findUnique({
      where: { id },
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

    // Don't allow deleting live streams
    if (stream.status === 'LIVE') {
      return NextResponse.json(
        { error: 'Cannot delete a live stream. End it first.' },
        { status: 400 }
      )
    }

    await prisma.stream.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Error deleting stream', error)
    return NextResponse.json(
      { error: 'Failed to delete stream' },
      { status: 500 }
    )
  }
}
