import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { StreamAttendance } from '@prisma/client'

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  default: {
    streamAttendance: {
      findUnique: vi.fn(),
    },
  },
}))

type MockAttendance = Pick<StreamAttendance, 'streamId' | 'viewerId' | 'firstMessageAt' | 'lastMessageAt' | 'messageCount'>

import prisma from '@/lib/prisma'
import { calculateWatchTimeForAttendance } from '@/services/watchTimeTracker'

describe('Watch Time Tracker Security', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Anti-Gaming: Minimum Message Requirement', () => {
    it('should return 0 points if viewer has less than 3 messages', async () => {
      const mockAttendance = {
        streamId: 'stream-1',
        viewerId: 'viewer-1',
        firstMessageAt: new Date('2024-01-01T10:00:00Z'),
        lastMessageAt: new Date('2024-01-01T12:00:00Z'), // 2 hours
        messageCount: 2, // Less than minimum (3)
      }

      vi.mocked(prisma.streamAttendance.findUnique).mockResolvedValue(mockAttendance as MockAttendance as StreamAttendance)

      const result = await calculateWatchTimeForAttendance('stream-1', 'viewer-1')

      expect(result.watchTimeMinutes).toBe(0)
      expect(result.pointsAwarded).toBe(0)
    })

    it('should return 0 points if viewer has exactly 2 messages', async () => {
      const mockAttendance = {
        streamId: 'stream-1',
        viewerId: 'viewer-1',
        firstMessageAt: new Date('2024-01-01T10:00:00Z'),
        lastMessageAt: new Date('2024-01-01T14:00:00Z'), // 4 hours - would be max points normally
        messageCount: 2,
      }

      vi.mocked(prisma.streamAttendance.findUnique).mockResolvedValue(mockAttendance as MockAttendance as StreamAttendance)

      const result = await calculateWatchTimeForAttendance('stream-1', 'viewer-1')

      expect(result.pointsAwarded).toBe(0)
    })

    it('should award points if viewer has 3+ messages', async () => {
      const mockAttendance = {
        streamId: 'stream-1',
        viewerId: 'viewer-1',
        firstMessageAt: new Date('2024-01-01T10:00:00Z'),
        lastMessageAt: new Date('2024-01-01T10:30:00Z'), // 30 minutes
        messageCount: 3, // Minimum met
      }

      vi.mocked(prisma.streamAttendance.findUnique).mockResolvedValue(mockAttendance as MockAttendance as StreamAttendance)

      const result = await calculateWatchTimeForAttendance('stream-1', 'viewer-1')

      // 30 minutes = 6 intervals of 5 minutes = 60 points
      expect(result.watchTimeMinutes).toBe(30)
      expect(result.pointsAwarded).toBe(60)
    })
  })

  describe('Anti-Gaming: Maximum Watch Time Cap', () => {
    it('should cap watch time at 240 minutes (4 hours)', async () => {
      const mockAttendance = {
        streamId: 'stream-1',
        viewerId: 'viewer-1',
        firstMessageAt: new Date('2024-01-01T00:00:00Z'),
        lastMessageAt: new Date('2024-01-01T10:00:00Z'), // 10 hours - exceeds cap
        messageCount: 100,
      }

      vi.mocked(prisma.streamAttendance.findUnique).mockResolvedValue(mockAttendance as MockAttendance as StreamAttendance)

      const result = await calculateWatchTimeForAttendance('stream-1', 'viewer-1')

      // Capped at 240 minutes = 48 intervals = 480 points (max)
      expect(result.watchTimeMinutes).toBe(240)
      expect(result.pointsAwarded).toBe(480)
    })

    it('should not cap if under 240 minutes', async () => {
      const mockAttendance = {
        streamId: 'stream-1',
        viewerId: 'viewer-1',
        firstMessageAt: new Date('2024-01-01T10:00:00Z'),
        lastMessageAt: new Date('2024-01-01T12:00:00Z'), // 2 hours = 120 min
        messageCount: 50,
      }

      vi.mocked(prisma.streamAttendance.findUnique).mockResolvedValue(mockAttendance as MockAttendance as StreamAttendance)

      const result = await calculateWatchTimeForAttendance('stream-1', 'viewer-1')

      expect(result.watchTimeMinutes).toBe(120)
      expect(result.pointsAwarded).toBe(240) // 24 intervals * 10 points
    })
  })

  describe('Edge Cases', () => {
    it('should return 0 if attendance not found', async () => {
      vi.mocked(prisma.streamAttendance.findUnique).mockResolvedValue(null)

      const result = await calculateWatchTimeForAttendance('stream-1', 'viewer-1')

      expect(result.watchTimeMinutes).toBe(0)
      expect(result.pointsAwarded).toBe(0)
    })

    it('should handle 0 watch time (same first/last message)', async () => {
      const sameTime = new Date('2024-01-01T10:00:00Z')
      const mockAttendance = {
        streamId: 'stream-1',
        viewerId: 'viewer-1',
        firstMessageAt: sameTime,
        lastMessageAt: sameTime,
        messageCount: 5,
      }

      vi.mocked(prisma.streamAttendance.findUnique).mockResolvedValue(mockAttendance as MockAttendance as StreamAttendance)

      const result = await calculateWatchTimeForAttendance('stream-1', 'viewer-1')

      expect(result.watchTimeMinutes).toBe(0)
      expect(result.pointsAwarded).toBe(0)
    })
  })
})
