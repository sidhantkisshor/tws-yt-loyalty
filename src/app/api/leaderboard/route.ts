import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getStreamLeaderboard, getChannelLeaderboard, getCachedDisplayNames } from '@/lib/redis'
import { viewerPublicLimiter, getRateLimitIdentifier, checkRateLimit } from '@/lib/rateLimits'
import { logger } from '@/lib/logger'

interface ViewerBase {
  id: string
  displayName: string
  profileImageUrl: string | null
  rank: string
  isMember: boolean
  isModerator: boolean
}

interface ViewerWithPoints extends ViewerBase {
  totalPoints: number
}

interface StreamAttendanceEntry {
  viewerId: string
  pointsEarned: number
  viewer: ViewerBase
}

interface GlobalViewer extends ViewerWithPoints {
  channel: { title: string }
}

interface FanProfileLeaderboardEntry {
  id: string
  displayName: string
  profileImageUrl: string | null
  totalPoints: number
  rank: string
}

// Get leaderboard (stream or channel)
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Rate limit check (public endpoint)
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'anonymous'
    const identifier = getRateLimitIdentifier(undefined, ip)
    const rateLimit = await checkRateLimit(viewerPublicLimiter, identifier)

    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Too many requests' }, {
        status: 429,
        headers: rateLimit.headers
      })
    }

    const { searchParams } = new URL(request.url)
    const streamId = searchParams.get('streamId')
    const channelId = searchParams.get('channelId')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)

    if (streamId) {
      // Get stream leaderboard from Redis
      const redisLeaderboard = await getStreamLeaderboard(streamId, limit)

      if (redisLeaderboard.length > 0) {
        const viewerIds = redisLeaderboard.map((entry) => entry.viewerId)

        // Try to get display names from Redis cache first
        const cachedNames = await getCachedDisplayNames(viewerIds)

        // Only query DB for viewers not in cache or for full details
        const uncachedIds = viewerIds.filter((id) => !cachedNames.has(id))

        let viewers: ViewerBase[] = []
        if (uncachedIds.length > 0 || cachedNames.size < viewerIds.length) {
          // Need to fetch from DB for uncached viewers or for full details
          viewers = await prisma.viewer.findMany({
            where: { id: { in: viewerIds } },
            select: {
              id: true,
              displayName: true,
              profileImageUrl: true,
              rank: true,
              isMember: true,
              isModerator: true,
            },
          })
        }

        const viewerMap = new Map<string, ViewerBase>()
        viewers.forEach((v: ViewerBase) => viewerMap.set(v.id, v))

        return NextResponse.json({
          type: 'stream',
          streamId,
          leaderboard: redisLeaderboard.map((entry, index) => ({
            position: index + 1,
            viewerId: entry.viewerId,
            points: entry.points,
            viewer: viewerMap.get(entry.viewerId) || null,
          })),
        })
      }

      // Fallback to database
      const dbLeaderboard = await prisma.streamAttendance.findMany({
        where: { streamId },
        orderBy: { pointsEarned: 'desc' },
        take: limit,
        include: {
          viewer: {
            select: {
              id: true,
              displayName: true,
              profileImageUrl: true,
              rank: true,
              isMember: true,
              isModerator: true,
            },
          },
        },
      })

      return NextResponse.json({
        type: 'stream',
        streamId,
        leaderboard: dbLeaderboard.map((entry: StreamAttendanceEntry, index: number) => ({
          position: index + 1,
          viewerId: entry.viewerId,
          points: entry.pointsEarned,
          viewer: entry.viewer,
        })),
      })
    }

    if (channelId) {
      // Get channel leaderboard from Redis
      const redisLeaderboard = await getChannelLeaderboard(channelId, limit)

      if (redisLeaderboard.length > 0) {
        const viewerIds = redisLeaderboard.map((entry) => entry.viewerId)
        const viewers = await prisma.viewer.findMany({
          where: { id: { in: viewerIds } },
          select: {
            id: true,
            displayName: true,
            profileImageUrl: true,
            rank: true,
            totalPoints: true,
            isMember: true,
            isModerator: true,
          },
        })

        const viewerMap = new Map<string, ViewerWithPoints>()
        viewers.forEach((v: ViewerWithPoints) => viewerMap.set(v.id, v))

        return NextResponse.json({
          type: 'channel',
          channelId,
          leaderboard: redisLeaderboard.map((entry, index) => ({
            position: index + 1,
            viewerId: entry.viewerId,
            points: entry.points,
            viewer: viewerMap.get(entry.viewerId) || null,
          })),
        })
      }

      // Fallback to database
      const dbLeaderboard = await prisma.viewer.findMany({
        where: { channelId },
        orderBy: { totalPoints: 'desc' },
        take: limit,
        select: {
          id: true,
          displayName: true,
          profileImageUrl: true,
          rank: true,
          totalPoints: true,
          isMember: true,
          isModerator: true,
        },
      })

      return NextResponse.json({
        type: 'channel',
        channelId,
        leaderboard: dbLeaderboard.map((viewer: ViewerWithPoints, index: number) => ({
          position: index + 1,
          viewerId: viewer.id,
          points: viewer.totalPoints,
          viewer,
        })),
      })
    }

    // Global leaderboard from FanProfile (cross-channel identity)
    const globalLeaderboard = await prisma.fanProfile.findMany({
      where: { isBanned: false },
      orderBy: { totalPoints: 'desc' },
      take: limit,
      select: {
        id: true,
        displayName: true,
        profileImageUrl: true,
        totalPoints: true,
        rank: true,
      },
    })

    return NextResponse.json({
      type: 'global',
      leaderboard: globalLeaderboard.map((fan: FanProfileLeaderboardEntry, index: number) => ({
        position: index + 1,
        fanProfileId: fan.id,
        points: fan.totalPoints,
        viewer: {
          id: fan.id,
          displayName: fan.displayName,
          profileImageUrl: fan.profileImageUrl,
          rank: fan.rank,
        },
      })),
    })
  } catch (error) {
    logger.error('Leaderboard error', error)
    return NextResponse.json(
      { error: 'Failed to get leaderboard' },
      { status: 500 }
    )
  }
}
