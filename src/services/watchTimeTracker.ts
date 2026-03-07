import prisma from '@/lib/prisma'

// Configuration
const POINTS_PER_INTERVAL = 10  // Points awarded per interval
const INTERVAL_MINUTES = 5      // Minutes per interval
const MIN_MESSAGES_FOR_WATCH_TIME = 3  // Minimum messages required to earn watch time
const MAX_WATCH_TIME_MINUTES = 240     // Cap watch time at 4 hours per stream

/**
 * Calculate watch time from first message to last message
 * and award points based on presence intervals
 *
 * Anti-gaming measures:
 * - Requires minimum 3 messages to earn any watch time
 * - Caps watch time at 4 hours per stream
 */
export async function calculateWatchTimeForAttendance(
  streamId: string,
  viewerId: string
): Promise<{ watchTimeMinutes: number; pointsAwarded: number }> {
  const attendance = await prisma.streamAttendance.findUnique({
    where: {
      streamId_viewerId: { streamId, viewerId },
    },
  })

  if (!attendance) {
    return { watchTimeMinutes: 0, pointsAwarded: 0 }
  }

  // Anti-gaming: Require minimum message count
  if (attendance.messageCount < MIN_MESSAGES_FOR_WATCH_TIME) {
    return { watchTimeMinutes: 0, pointsAwarded: 0 }
  }

  // Calculate watch time from first to last message
  const firstMessage = attendance.firstMessageAt.getTime()
  const lastMessage = attendance.lastMessageAt.getTime()
  const watchTimeMs = lastMessage - firstMessage
  let watchTimeMinutes = Math.floor(watchTimeMs / (1000 * 60))

  // Anti-gaming: Cap maximum watch time
  watchTimeMinutes = Math.min(watchTimeMinutes, MAX_WATCH_TIME_MINUTES)

  // Calculate points: 10 points per 5 minutes
  const intervals = Math.floor(watchTimeMinutes / INTERVAL_MINUTES)
  const pointsAwarded = intervals * POINTS_PER_INTERVAL

  return { watchTimeMinutes, pointsAwarded }
}

/**
 * Award watch time points to all attendees when a stream ends
 * Returns the number of viewers awarded
 */
export async function awardWatchTimePointsForStream(
  streamId: string
): Promise<{ viewersAwarded: number; totalPointsAwarded: number }> {
  // Get all attendances for this stream
  const attendances = await prisma.streamAttendance.findMany({
    where: { streamId },
    include: { viewer: true },
  })

  let viewersAwarded = 0
  let totalPointsAwarded = 0

  for (const attendance of attendances) {
    const { watchTimeMinutes, pointsAwarded } = await calculateWatchTimeForAttendance(
      streamId,
      attendance.viewerId
    )

    if (pointsAwarded > 0) {
      // Update attendance record with watch time stats
      await prisma.$transaction([
        // Update attendance
        prisma.streamAttendance.update({
          where: { id: attendance.id },
          data: {
            estimatedWatchTimeMinutes: watchTimeMinutes,
            watchTimePoints: pointsAwarded,
          },
        }),
        // Award points to viewer
        prisma.viewer.update({
          where: { id: attendance.viewerId },
          data: {
            totalPoints: { increment: pointsAwarded },
            availablePoints: { increment: pointsAwarded },
            lifetimePoints: { increment: pointsAwarded },
            totalWatchTimeMinutes: { increment: watchTimeMinutes },
          },
        }),
        // Create transaction record
        prisma.pointLedger.create({
          data: {
            viewerId: attendance.viewerId,
            streamId,
            type: 'WATCH_TIME',
            amount: pointsAwarded,
            balanceBefore: attendance.viewer.availablePoints,
            balanceAfter: attendance.viewer.availablePoints + pointsAwarded,
            description: `Watch time bonus: ${watchTimeMinutes} minutes`,
            referenceType: 'stream_attendance',
            referenceId: attendance.id,
          },
        }),
      ])

      viewersAwarded++
      totalPointsAwarded += pointsAwarded
    }
  }

  return { viewersAwarded, totalPointsAwarded }
}

/**
 * Update the stream attendance when a message is received
 * This extends the "last seen" time to calculate watch time
 */
export async function updateAttendanceForMessage(
  streamId: string,
  viewerId: string,
  messageTime: Date
): Promise<void> {
  await prisma.streamAttendance.upsert({
    where: {
      streamId_viewerId: { streamId, viewerId },
    },
    update: {
      lastMessageAt: messageTime,
      messageCount: { increment: 1 },
    },
    create: {
      streamId,
      viewerId,
      firstMessageAt: messageTime,
      lastMessageAt: messageTime,
      messageCount: 1,
    },
  })
}
