import prisma from '@/lib/prisma'
import { RANK_EARNING_BOOST, ViewerRankName } from '@/lib/ranks'

// Streak bonus: +10% per consecutive stream (max 50%)
const STREAK_BONUS_PERCENT = 10
const MAX_STREAK_BONUS_PERCENT = 50

// Early bird bonus: first 5 minutes of stream
const EARLY_BIRD_BONUS = 25
const EARLY_BIRD_WINDOW_MS = 5 * 60 * 1000 // 5 minutes

// Full stream bonus
const FULL_STREAM_BONUS = 100

export interface BonusResult {
  basePoints: number
  streakBonus: number
  rankBonus: number
  earlyBirdBonus: number
  memberBonus: number
  modBonus: number
  totalBonus: number
  totalPoints: number
  bonusTypes: string[]
}

/**
 * Calculate all bonuses for a code redemption
 */
export function calculateBonuses(
  basePoints: number,
  viewer: {
    rank: ViewerRankName
    currentStreak: number
    isMember: boolean
    isModerator: boolean
  },
  code: {
    memberBonus: number
    modBonus: number
    firstResponseBonus: number
    currentRedemptions: number
    firstResponseLimit: number
  },
  isEarlyBird: boolean
): BonusResult {
  const bonusTypes: string[] = []
  let totalBonus = 0

  // Streak bonus (percentage of base)
  const streakMultiplier = Math.min(
    viewer.currentStreak * STREAK_BONUS_PERCENT,
    MAX_STREAK_BONUS_PERCENT
  )
  const streakBonus = Math.floor((basePoints * streakMultiplier) / 100)
  if (streakBonus > 0) {
    totalBonus += streakBonus
    bonusTypes.push(`streak_${viewer.currentStreak}`)
  }

  // Rank bonus (percentage of base)
  const rankBoostDecimal = RANK_EARNING_BOOST[viewer.rank] ?? 0
  const rankBonus = Math.floor(basePoints * rankBoostDecimal)
  if (rankBonus > 0) {
    totalBonus += rankBonus
    bonusTypes.push(`rank_${viewer.rank.toLowerCase()}`)
  }

  // Early bird bonus (flat)
  const earlyBirdBonus = isEarlyBird ? EARLY_BIRD_BONUS : 0
  if (earlyBirdBonus > 0) {
    totalBonus += earlyBirdBonus
    bonusTypes.push('early_bird')
  }

  // Member bonus (from code config)
  const memberBonus = viewer.isMember ? code.memberBonus : 0
  if (memberBonus > 0) {
    totalBonus += memberBonus
    bonusTypes.push('member')
  }

  // Mod bonus (from code config)
  const modBonus = viewer.isModerator ? code.modBonus : 0
  if (modBonus > 0) {
    totalBonus += modBonus
    bonusTypes.push('mod')
  }

  // First response bonus
  if (
    code.currentRedemptions < code.firstResponseLimit &&
    code.firstResponseBonus > 0
  ) {
    totalBonus += code.firstResponseBonus
    bonusTypes.push('first')
  }

  return {
    basePoints,
    streakBonus,
    rankBonus,
    earlyBirdBonus,
    memberBonus,
    modBonus,
    totalBonus,
    totalPoints: basePoints + totalBonus,
    bonusTypes,
  }
}

/**
 * Check if a message qualifies for early bird bonus
 */
export function isEarlyBirdEligible(
  messageTime: Date,
  streamStartTime: Date | null
): boolean {
  if (!streamStartTime) return false
  const elapsed = messageTime.getTime() - streamStartTime.getTime()
  return elapsed >= 0 && elapsed <= EARLY_BIRD_WINDOW_MS
}

/**
 * Update viewer streak after stream ends (optimized with batch operations)
 */
export async function updateViewerStreaks(streamId: string): Promise<number> {
  // Get all viewers who attended this stream
  const attendances = await prisma.streamAttendance.findMany({
    where: { streamId },
    select: { viewerId: true },
  })

  if (attendances.length === 0) return 0

  const viewerIds = attendances.map((a) => a.viewerId)

  // Batch fetch: stream details and all viewers in parallel
  const [stream, viewers] = await Promise.all([
    prisma.stream.findUnique({
      where: { id: streamId },
      select: { channelId: true },
    }),
    prisma.viewer.findMany({
      where: { id: { in: viewerIds } },
      select: {
        id: true,
        currentStreak: true,
        longestStreak: true,
        lastStreamAttended: true,
      },
    }),
  ])

  if (!stream) return 0

  // Get the previous stream for this channel
  const previousStream = await prisma.stream.findFirst({
    where: {
      channelId: stream.channelId,
      id: { not: streamId },
      status: 'ENDED',
    },
    orderBy: { endedAt: 'desc' },
    select: { id: true },
  })

  // Calculate updates for all viewers
  const updates = viewers.map((viewer) => {
    let newStreak: number
    if (previousStream && viewer.lastStreamAttended === previousStream.id) {
      newStreak = viewer.currentStreak + 1
    } else if (!previousStream) {
      newStreak = 1
    } else {
      newStreak = 1
    }

    return {
      id: viewer.id,
      newStreak,
      longestStreak: Math.max(newStreak, viewer.longestStreak),
    }
  })

  // Batch update all viewers in a single transaction
  await prisma.$transaction(
    updates.map((update) =>
      prisma.viewer.update({
        where: { id: update.id },
        data: {
          currentStreak: update.newStreak,
          longestStreak: update.longestStreak,
          lastStreamAttended: streamId,
          totalStreamsAttended: { increment: 1 },
        },
      })
    )
  )

  return updates.length
}

/**
 * Award full stream bonus to qualifying viewers (optimized with batch transaction)
 */
export async function awardFullStreamBonuses(streamId: string): Promise<number> {
  const stream = await prisma.stream.findUnique({
    where: { id: streamId },
    select: {
      id: true,
      channelId: true,
      actualStartAt: true,
      endedAt: true,
    },
  })

  if (!stream?.actualStartAt || !stream?.endedAt) return 0

  const streamDuration = stream.endedAt.getTime() - stream.actualStartAt.getTime()
  const minDuration = 30 * 60 * 1000 // 30 minutes minimum stream

  if (streamDuration < minDuration) return 0

  // Find viewers who were present from start to near end
  const earlyWindow = new Date(stream.actualStartAt.getTime() + 10 * 60 * 1000)
  const lateWindow = new Date(stream.endedAt.getTime() - 10 * 60 * 1000)

  const qualifyingAttendances = await prisma.streamAttendance.findMany({
    where: {
      streamId,
      firstMessageAt: { lte: earlyWindow },
      lastMessageAt: { gte: lateWindow },
      fullStreamBonus: false,
    },
    select: {
      id: true,
      viewerId: true,
      viewer: {
        select: { availablePoints: true },
      },
    },
  })

  if (qualifyingAttendances.length === 0) return 0

  // Batch all operations in a single transaction
  await prisma.$transaction([
    // Update all attendances
    ...qualifyingAttendances.map((attendance) =>
      prisma.streamAttendance.update({
        where: { id: attendance.id },
        data: {
          fullStreamBonus: true,
          pointsEarned: { increment: FULL_STREAM_BONUS },
        },
      })
    ),
    // Update all viewers
    ...qualifyingAttendances.map((attendance) =>
      prisma.viewer.update({
        where: { id: attendance.viewerId },
        data: {
          totalPoints: { increment: FULL_STREAM_BONUS },
          availablePoints: { increment: FULL_STREAM_BONUS },
          lifetimePoints: { increment: FULL_STREAM_BONUS },
        },
      })
    ),
    // Create all point transactions
    prisma.pointTransaction.createMany({
      data: qualifyingAttendances.map((attendance) => ({
        viewerId: attendance.viewerId,
        streamId,
        type: 'ATTENDANCE_BONUS' as const,
        amount: FULL_STREAM_BONUS,
        balanceBefore: attendance.viewer.availablePoints,
        balanceAfter: attendance.viewer.availablePoints + FULL_STREAM_BONUS,
        description: 'Full stream attendance bonus',
      })),
    }),
  ])

  return qualifyingAttendances.length
}

/**
 * Award early bird bonus
 */
export async function awardEarlyBirdBonus(
  streamId: string,
  viewerId: string
): Promise<boolean> {
  const attendance = await prisma.streamAttendance.findUnique({
    where: { streamId_viewerId: { streamId, viewerId } },
    select: {
      id: true,
      earlyBirdBonus: true,
      viewer: {
        select: { availablePoints: true },
      },
    },
  })

  if (!attendance || attendance.earlyBirdBonus) return false

  await prisma.$transaction([
    prisma.streamAttendance.update({
      where: { id: attendance.id },
      data: {
        earlyBirdBonus: true,
        pointsEarned: { increment: EARLY_BIRD_BONUS },
      },
    }),
    prisma.viewer.update({
      where: { id: viewerId },
      data: {
        totalPoints: { increment: EARLY_BIRD_BONUS },
        availablePoints: { increment: EARLY_BIRD_BONUS },
        lifetimePoints: { increment: EARLY_BIRD_BONUS },
      },
    }),
    prisma.pointTransaction.create({
      data: {
        viewerId,
        streamId,
        type: 'ATTENDANCE_BONUS',
        amount: EARLY_BIRD_BONUS,
        balanceBefore: attendance.viewer.availablePoints,
        balanceAfter: attendance.viewer.availablePoints + EARLY_BIRD_BONUS,
        description: 'Early bird bonus',
      },
    }),
  ])

  return true
}

const bonusCalculatorService = {
  calculateBonuses,
  isEarlyBirdEligible,
  updateViewerStreaks,
  awardFullStreamBonuses,
  awardEarlyBirdBonus,
}

export default bonusCalculatorService
