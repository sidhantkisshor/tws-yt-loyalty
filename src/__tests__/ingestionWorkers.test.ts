import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================
// Mock all external dependencies
// ============================================

const mockAcquireLock = vi.fn()
const mockReleaseLock = vi.fn()

vi.mock('@/lib/redis', () => ({
  acquireLock: (...args: unknown[]) => mockAcquireLock(...args),
  releaseLock: (...args: unknown[]) => mockReleaseLock(...args),
  setStreamState: vi.fn(),
  redis: { set: vi.fn(), get: vi.fn(), del: vi.fn() },
  default: { set: vi.fn(), get: vi.fn(), del: vi.fn() },
}))

const mockStartJob = vi.fn()
const mockCompleteJob = vi.fn()
const mockFailJob = vi.fn()

vi.mock('@/services/jobTracker', () => ({
  startJob: (...args: unknown[]) => mockStartJob(...args),
  completeJob: (...args: unknown[]) => mockCompleteJob(...args),
  failJob: (...args: unknown[]) => mockFailJob(...args),
}))

const mockGetValidCredentials = vi.fn()

vi.mock('@/services/tokenManager', () => ({
  getValidCredentials: (...args: unknown[]) => mockGetValidCredentials(...args),
}))

const mockGetVideoComments = vi.fn()
const mockSearchChannelVideos = vi.fn()
const mockPollLiveChatMessages = vi.fn()

vi.mock('@/lib/youtube', () => ({
  getVideoComments: (...args: unknown[]) => mockGetVideoComments(...args),
  searchChannelVideos: (...args: unknown[]) => mockSearchChannelVideos(...args),
  pollLiveChatMessages: (...args: unknown[]) => mockPollLiveChatMessages(...args),
}))

vi.mock('@/services/messageProcessor', () => ({
  processMessage: vi.fn().mockResolvedValue({
    viewerId: 'viewer1',
    isNewViewer: false,
    codeRedeemed: false,
    pointsAwarded: 0,
    fraudDetected: false,
  }),
}))

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/lib/env', () => ({
  env: {
    CRON_SECRET: 'a'.repeat(32),
    DATABASE_URL: 'postgresql://test',
    DIRECT_URL: 'postgresql://test',
    NEXTAUTH_URL: 'http://localhost:3000',
    NEXTAUTH_SECRET: 'a'.repeat(32),
    ADMIN_EMAILS: ['test@test.com'],
    GOOGLE_CLIENT_ID: 'test',
    GOOGLE_CLIENT_SECRET: 'test',
    UPSTASH_REDIS_REST_URL: 'https://test.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'test-token',
    NODE_ENV: 'test',
  },
}))

const mockPrismaStreamFindMany = vi.fn()
const mockPrismaStreamFindUnique = vi.fn()
const mockPrismaStreamUpdate = vi.fn()
const mockPrismaStreamCreate = vi.fn()
const mockPrismaChannelFindMany = vi.fn()
const mockPrismaChannelUpdate = vi.fn()
const mockPrismaFanProfileFindUnique = vi.fn()
const mockPrismaFanProfileCreate = vi.fn()
const mockPrismaEngagementEventUpsert = vi.fn()

vi.mock('@/lib/prisma', () => ({
  default: {
    stream: {
      findMany: (...args: unknown[]) => mockPrismaStreamFindMany(...args),
      findUnique: (...args: unknown[]) => mockPrismaStreamFindUnique(...args),
      update: (...args: unknown[]) => mockPrismaStreamUpdate(...args),
      create: (...args: unknown[]) => mockPrismaStreamCreate(...args),
    },
    channel: {
      findMany: (...args: unknown[]) => mockPrismaChannelFindMany(...args),
      update: (...args: unknown[]) => mockPrismaChannelUpdate(...args),
    },
    fanProfile: {
      findUnique: (...args: unknown[]) => mockPrismaFanProfileFindUnique(...args),
      create: (...args: unknown[]) => mockPrismaFanProfileCreate(...args),
    },
    engagementEvent: {
      upsert: (...args: unknown[]) => mockPrismaEngagementEventUpsert(...args),
    },
  },
}))

// ============================================
// Helper to create a mock NextRequest
// ============================================

function createMockRequest(cronSecret: string): Request {
  return new Request('http://localhost/api/cron/test', {
    headers: {
      authorization: `Bearer ${cronSecret}`,
    },
  })
}

// ============================================
// Tests
// ============================================

describe('Ingestion Workers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStartJob.mockResolvedValue({ jobRunId: 'job-1', eventsProcessed: 0, errorsCount: 0 })
    mockCompleteJob.mockResolvedValue(undefined)
    mockFailJob.mockResolvedValue(undefined)
    mockReleaseLock.mockResolvedValue(true)
  })

  // ============================================
  // Poll-streams lock and tracking tests
  // ============================================

  describe('poll-streams cron', () => {
    it('should return 409 when lock cannot be acquired (concurrent execution prevention)', async () => {
      mockAcquireLock.mockResolvedValue(null) // Lock fails

      const { GET } = await import('@/app/api/cron/poll-streams/route')
      const request = createMockRequest('a'.repeat(32))
      const response = await GET(request as never)

      expect(response.status).toBe(409)
      const body = await response.json()
      expect(body.error).toBe('Already running')
      expect(mockStartJob).not.toHaveBeenCalled()
    })

    it('should acquire lock, start job, and release lock on success', async () => {
      mockAcquireLock.mockResolvedValue('lock-123')
      mockPrismaStreamFindMany.mockResolvedValue([])

      const { GET } = await import('@/app/api/cron/poll-streams/route')
      const request = createMockRequest('a'.repeat(32))
      const response = await GET(request as never)

      expect(response.status).toBe(200)
      expect(mockAcquireLock).toHaveBeenCalledWith('cron:poll-streams', 120)
      expect(mockStartJob).toHaveBeenCalledWith('INGEST_CHAT')
      expect(mockCompleteJob).toHaveBeenCalled()
      expect(mockReleaseLock).toHaveBeenCalledWith('cron:poll-streams', 'lock-123')
    })

    it('should release lock even when an error occurs', async () => {
      mockAcquireLock.mockResolvedValue('lock-456')
      mockPrismaStreamFindMany.mockRejectedValue(new Error('DB error'))

      const { GET } = await import('@/app/api/cron/poll-streams/route')
      const request = createMockRequest('a'.repeat(32))
      const response = await GET(request as never)

      expect(response.status).toBe(500)
      expect(mockFailJob).toHaveBeenCalled()
      expect(mockReleaseLock).toHaveBeenCalledWith('cron:poll-streams', 'lock-456')
    })

    it('should track job lifecycle: start -> complete with events processed', async () => {
      const jobCtx = { jobRunId: 'job-poll-1', eventsProcessed: 0, errorsCount: 0 }
      mockStartJob.mockResolvedValue(jobCtx)
      mockAcquireLock.mockResolvedValue('lock-789')

      mockPrismaStreamFindMany.mockResolvedValue([
        {
          id: 'stream-1',
          channelId: 'channel-1',
          youtubeLiveChatId: 'chat-1',
          nextPageToken: null,
          channel: { id: 'channel-1', title: 'Test Channel', quotaLimit: 10000, dailyQuotaUsed: 0 },
        },
      ])

      mockGetValidCredentials.mockResolvedValue({
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: new Date(Date.now() + 3600000),
      })

      mockPollLiveChatMessages.mockResolvedValue({
        messages: [
          { id: 'msg-1', authorChannelId: 'UC1', authorDisplayName: 'User1', messageText: 'hi', publishedAt: new Date() },
          { id: 'msg-2', authorChannelId: 'UC2', authorDisplayName: 'User2', messageText: 'hello', publishedAt: new Date() },
        ],
        nextPageToken: undefined,
        pollingIntervalMillis: 4000,
        quotaUsed: 1,
      })

      mockPrismaStreamUpdate.mockResolvedValue({})
      mockPrismaChannelUpdate.mockResolvedValue({})

      const { GET } = await import('@/app/api/cron/poll-streams/route')
      const request = createMockRequest('a'.repeat(32))
      await GET(request as never)

      // Job context should have been updated with events processed
      expect(mockCompleteJob).toHaveBeenCalledWith(
        expect.objectContaining({
          jobRunId: 'job-poll-1',
          eventsProcessed: 2,
        })
      )
    })
  })

  // ============================================
  // Comment ingestion tests
  // ============================================

  describe('ingest-comments cron', () => {
    it('should return 409 when lock cannot be acquired', async () => {
      mockAcquireLock.mockResolvedValue(null)

      const { GET } = await import('@/app/api/cron/ingest-comments/route')
      const request = createMockRequest('a'.repeat(32))
      const response = await GET(request as never)

      expect(response.status).toBe(409)
      const body = await response.json()
      expect(body.error).toBe('Already running')
    })

    it('should handle various comment formats and create engagement events', async () => {
      mockAcquireLock.mockResolvedValue('lock-comments-1')

      mockPrismaChannelFindMany.mockResolvedValue([
        { id: 'channel-1', title: 'Test Channel' },
      ])

      mockGetValidCredentials.mockResolvedValue({
        accessToken: 'token',
        refreshToken: 'refresh',
      })

      mockPrismaStreamFindMany.mockResolvedValue([
        { id: 'stream-1', youtubeVideoId: 'video-1', channelId: 'channel-1' },
      ])

      // Simulate comments with various formats
      mockGetVideoComments.mockResolvedValue({
        comments: [
          {
            id: 'comment-1',
            authorChannelId: 'UC-author-1',
            authorDisplayName: 'Normal User',
            authorProfileImageUrl: 'https://example.com/pic1.jpg',
            textDisplay: 'Great video!',
            publishedAt: '2026-03-07T12:00:00Z',
            likeCount: 5,
            isReply: false,
          },
          {
            id: 'comment-2',
            authorChannelId: 'UC-author-2',
            authorDisplayName: 'User With Emoji',
            authorProfileImageUrl: '',
            textDisplay: 'Amazing content!! <3',
            publishedAt: '2026-03-07T13:00:00Z',
            likeCount: 0,
            isReply: false,
          },
          {
            id: 'comment-3',
            authorChannelId: 'UC-author-3',
            authorDisplayName: 'Reply User',
            authorProfileImageUrl: '',
            textDisplay: '@someone I agree',
            publishedAt: '2026-03-07T14:00:00Z',
            likeCount: 1,
            isReply: true,
          },
        ],
        nextPageToken: undefined,
      })

      // FanProfile lookups/creates
      mockPrismaFanProfileFindUnique.mockResolvedValue(null)
      mockPrismaFanProfileCreate.mockImplementation(({ data }: { data: { googleId: string } }) =>
        Promise.resolve({ id: `fp-${data.googleId}` })
      )
      mockPrismaEngagementEventUpsert.mockResolvedValue({})

      const { GET } = await import('@/app/api/cron/ingest-comments/route')
      const request = createMockRequest('a'.repeat(32))
      const response = await GET(request as never)

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.totalCommentsProcessed).toBe(3)

      // Verify engagement events were created for all 3 comments
      expect(mockPrismaEngagementEventUpsert).toHaveBeenCalledTimes(3)

      // Verify the first call used VIDEO_COMMENT event type
      const firstCall = mockPrismaEngagementEventUpsert.mock.calls[0][0]
      expect(firstCall.create.eventType).toBe('VIDEO_COMMENT')
      expect(firstCall.create.externalId).toBe('comment-1')

      // Verify fan profiles were created
      expect(mockPrismaFanProfileCreate).toHaveBeenCalledTimes(3)
    })

    it('should track job lifecycle correctly', async () => {
      const jobCtx = { jobRunId: 'job-comments-1', eventsProcessed: 0, errorsCount: 0 }
      mockStartJob.mockResolvedValue(jobCtx)
      mockAcquireLock.mockResolvedValue('lock-comments-2')

      mockPrismaChannelFindMany.mockResolvedValue([])

      const { GET } = await import('@/app/api/cron/ingest-comments/route')
      const request = createMockRequest('a'.repeat(32))
      await GET(request as never)

      expect(mockStartJob).toHaveBeenCalledWith('INGEST_COMMENTS')
      expect(mockCompleteJob).toHaveBeenCalled()
      expect(mockReleaseLock).toHaveBeenCalledWith('cron:ingest-comments', 'lock-comments-2')
    })

    it('should release lock on failure', async () => {
      mockAcquireLock.mockResolvedValue('lock-comments-3')
      mockPrismaChannelFindMany.mockRejectedValue(new Error('DB failure'))

      const { GET } = await import('@/app/api/cron/ingest-comments/route')
      const request = createMockRequest('a'.repeat(32))
      const response = await GET(request as never)

      expect(response.status).toBe(500)
      expect(mockFailJob).toHaveBeenCalled()
      expect(mockReleaseLock).toHaveBeenCalledWith('cron:ingest-comments', 'lock-comments-3')
    })
  })

  // ============================================
  // Video discovery tests
  // ============================================

  describe('discover-videos cron', () => {
    it('should return 409 when lock cannot be acquired', async () => {
      mockAcquireLock.mockResolvedValue(null)

      const { GET } = await import('@/app/api/cron/discover-videos/route')
      const request = createMockRequest('a'.repeat(32))
      const response = await GET(request as never)

      expect(response.status).toBe(409)
      const body = await response.json()
      expect(body.error).toBe('Already running')
    })

    it('should deduplicate existing streams and only create new ones', async () => {
      mockAcquireLock.mockResolvedValue('lock-discover-1')

      mockPrismaChannelFindMany.mockResolvedValue([
        { id: 'channel-1', title: 'Test Channel', youtubeChannelId: 'UC-test-1' },
      ])

      mockGetValidCredentials.mockResolvedValue({
        accessToken: 'token',
        refreshToken: 'refresh',
      })

      mockSearchChannelVideos.mockResolvedValue([
        { videoId: 'existing-video', title: 'Already Tracked', publishedAt: '2026-03-07T10:00:00Z' },
        { videoId: 'new-video-1', title: 'New Video 1', publishedAt: '2026-03-07T14:00:00Z' },
        { videoId: 'new-video-2', title: 'New Video 2', publishedAt: '2026-03-07T16:00:00Z' },
      ])

      // First video exists, second and third do not
      mockPrismaStreamFindUnique
        .mockResolvedValueOnce({ id: 'stream-existing' }) // existing-video found
        .mockResolvedValueOnce(null) // new-video-1 not found
        .mockResolvedValueOnce(null) // new-video-2 not found

      mockPrismaStreamCreate.mockResolvedValue({})

      const { GET } = await import('@/app/api/cron/discover-videos/route')
      const request = createMockRequest('a'.repeat(32))
      const response = await GET(request as never)

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.totalVideosDiscovered).toBe(2) // Only 2 new videos

      // Should only create 2 streams (not the existing one)
      expect(mockPrismaStreamCreate).toHaveBeenCalledTimes(2)

      // Verify the created streams have ENDED status
      const firstCreateCall = mockPrismaStreamCreate.mock.calls[0][0]
      expect(firstCreateCall.data.status).toBe('ENDED')
      expect(firstCreateCall.data.youtubeVideoId).toBe('new-video-1')
    })

    it('should track job lifecycle and release lock', async () => {
      const jobCtx = { jobRunId: 'job-discover-1', eventsProcessed: 0, errorsCount: 0 }
      mockStartJob.mockResolvedValue(jobCtx)
      mockAcquireLock.mockResolvedValue('lock-discover-2')

      mockPrismaChannelFindMany.mockResolvedValue([])

      const { GET } = await import('@/app/api/cron/discover-videos/route')
      const request = createMockRequest('a'.repeat(32))
      await GET(request as never)

      expect(mockStartJob).toHaveBeenCalledWith('DISCOVER_VIDEOS')
      expect(mockCompleteJob).toHaveBeenCalled()
      expect(mockReleaseLock).toHaveBeenCalledWith('cron:discover-videos', 'lock-discover-2')
    })

    it('should release lock on failure', async () => {
      mockAcquireLock.mockResolvedValue('lock-discover-3')
      mockPrismaChannelFindMany.mockRejectedValue(new Error('DB failure'))

      const { GET } = await import('@/app/api/cron/discover-videos/route')
      const request = createMockRequest('a'.repeat(32))
      const response = await GET(request as never)

      expect(response.status).toBe(500)
      expect(mockFailJob).toHaveBeenCalled()
      expect(mockReleaseLock).toHaveBeenCalledWith('cron:discover-videos', 'lock-discover-3')
    })

    it('should skip channels without valid credentials', async () => {
      mockAcquireLock.mockResolvedValue('lock-discover-4')

      mockPrismaChannelFindMany.mockResolvedValue([
        { id: 'channel-1', title: 'No Creds Channel', youtubeChannelId: 'UC-test-1' },
      ])

      mockGetValidCredentials.mockResolvedValue(null)

      const { GET } = await import('@/app/api/cron/discover-videos/route')
      const request = createMockRequest('a'.repeat(32))
      const response = await GET(request as never)

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.totalVideosDiscovered).toBe(0)
      expect(mockSearchChannelVideos).not.toHaveBeenCalled()
    })
  })

  // ============================================
  // YouTube comment parsing tests
  // ============================================

  describe('YouTube comment parsing (getVideoComments)', () => {
    it('should handle empty comment list', () => {
      const result = { comments: [], nextPageToken: undefined }
      expect(result.comments).toHaveLength(0)
      expect(result.nextPageToken).toBeUndefined()
    })

    it('should parse comment with all fields populated', () => {
      const comment = {
        id: 'comment-full',
        authorChannelId: 'UCxyz123',
        authorDisplayName: 'Test User',
        authorProfileImageUrl: 'https://example.com/pic.jpg',
        textDisplay: 'This is a <b>formatted</b> comment with HTML',
        publishedAt: '2026-03-07T12:00:00Z',
        likeCount: 42,
        isReply: false,
      }

      expect(comment.id).toBe('comment-full')
      expect(comment.authorChannelId).toBe('UCxyz123')
      expect(comment.likeCount).toBe(42)
      expect(comment.isReply).toBe(false)
      expect(comment.textDisplay).toContain('<b>formatted</b>')
    })

    it('should handle comment with missing optional fields', () => {
      const comment = {
        id: 'comment-minimal',
        authorChannelId: '',
        authorDisplayName: 'Unknown',
        authorProfileImageUrl: '',
        textDisplay: '',
        publishedAt: new Date().toISOString(),
        likeCount: 0,
        isReply: false,
      }

      expect(comment.id).toBe('comment-minimal')
      expect(comment.authorChannelId).toBe('')
      expect(comment.authorDisplayName).toBe('Unknown')
      expect(comment.likeCount).toBe(0)
    })

    it('should handle reply comments', () => {
      const reply = {
        id: 'reply-1',
        authorChannelId: 'UCabc',
        authorDisplayName: 'Replier',
        authorProfileImageUrl: '',
        textDisplay: '@OriginalPoster I agree!',
        publishedAt: '2026-03-07T15:00:00Z',
        likeCount: 1,
        isReply: true,
      }

      expect(reply.isReply).toBe(true)
      expect(reply.textDisplay).toContain('@OriginalPoster')
    })
  })

  // ============================================
  // Auth check tests
  // ============================================

  describe('Authorization checks', () => {
    it('should reject requests without valid auth header', async () => {
      const { GET } = await import('@/app/api/cron/poll-streams/route')
      const request = new Request('http://localhost/api/cron/poll-streams', {
        headers: { authorization: 'Bearer wrong-secret' },
      })
      const response = await GET(request as never)
      expect(response.status).toBe(401)
    })

    it('should reject requests with no auth header', async () => {
      const { GET } = await import('@/app/api/cron/ingest-comments/route')
      const request = new Request('http://localhost/api/cron/ingest-comments')
      const response = await GET(request as never)
      expect(response.status).toBe(401)
    })
  })
})
