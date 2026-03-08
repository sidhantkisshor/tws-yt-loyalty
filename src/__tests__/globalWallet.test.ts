import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================
// MOCK SETUP
// ============================================

// Mock prisma
const mockPrisma = {
  viewer: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  fanProfile: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  rewardConfig: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  rewardRedemption: {
    count: vi.fn(),
    create: vi.fn(),
  },
  pointLedger: {
    create: vi.fn(),
  },
  streamAttendance: {
    findMany: vi.fn(),
  },
  $transaction: vi.fn(),
}
vi.mock('@/lib/prisma', () => ({ default: mockPrisma }))

// Mock next-auth
const mockGetServerSession = vi.fn()
vi.mock('next-auth', () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

// Mock viewerAuth
vi.mock('@/lib/viewerAuth', () => ({
  viewerAuthOptions: {},
}))

// Mock rate limits
vi.mock('@/lib/rateLimits', () => ({
  viewerPublicLimiter: {},
  getRateLimitIdentifier: vi.fn().mockReturnValue('test-id'),
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, headers: {} }),
}))

// Mock redis
vi.mock('@/lib/redis', () => ({
  redis: {},
  getStreamLeaderboard: vi.fn().mockResolvedValue([]),
  getChannelLeaderboard: vi.fn().mockResolvedValue([]),
  getCachedDisplayNames: vi.fn().mockResolvedValue(new Map()),
  rewardRedemptionLimiter: { limit: vi.fn().mockResolvedValue({ success: true, reset: Date.now() + 60000 }) },
}))

// Mock nanoid
vi.mock('nanoid', () => ({
  nanoid: vi.fn().mockReturnValue('abc12345'),
}))

// Mock validators
vi.mock('@/lib/validators', () => ({
  redeemRewardSchema: {
    parse: vi.fn((data: unknown) => data),
  },
}))

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

// Mock Sentry (needed by logger)
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  setUser: vi.fn(),
  setTags: vi.fn(),
  setContext: vi.fn(),
}))

// ============================================
// HELPERS
// ============================================

function createRequest(url: string, options?: RequestInit): Request {
  return new Request(`http://localhost${url}`, {
    ...options,
    headers: {
      'x-forwarded-for': '127.0.0.1',
      ...(options?.headers || {}),
    },
  })
}

const mockSession = {
  viewerId: 'viewer-1',
  isViewer: true,
  availableChannels: [
    { channelId: 'channel-1', channelTitle: 'Channel A', viewerId: 'viewer-1' },
    { channelId: 'channel-2', channelTitle: 'Channel B', viewerId: 'viewer-2' },
  ],
}

const mockViewer = {
  id: 'viewer-1',
  displayName: 'TestViewer',
  profileImageUrl: 'https://example.com/pic.jpg',
  channelId: 'channel-1',
  totalPoints: 2000,
  availablePoints: 1500,
  lifetimePoints: 3000,
  rank: 'RETAIL_TRADER',
  trustScore: 60,
  totalStreamsAttended: 10,
  totalMessagesCount: 150,
  totalCodesRedeemed: 8,
  currentStreak: 3,
  longestStreak: 7,
  pauseEndsAt: null,
  shortPausesUsedThisMonth: 0,
  longPausesUsedThisMonth: 0,
  referralCode: 'REF123',
  totalWatchTimeMinutes: 600,
  firstSeenAt: new Date('2024-01-01'),
  lastSeenAt: new Date(),
  isMember: false,
  isModerator: false,
  fanProfileId: 'fan-1',
  channel: {
    id: 'channel-1',
    title: 'Channel A',
    thumbnailUrl: 'https://example.com/ch.jpg',
  },
}

const mockFanProfile = {
  totalPoints: 5000,
  availablePoints: 3200,
  lifetimePoints: 8000,
  rank: 'SWING_TRADER',
  trustScore: 85,
  currentStreak: 5,
  longestStreak: 12,
}

// ============================================
// TESTS
// ============================================

describe('/api/viewer/me - Global Wallet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue(mockSession)
  })

  it('returns globalWallet alongside channelProfile when FanProfile exists', async () => {
    mockPrisma.viewer.findUnique.mockResolvedValue(mockViewer)
    mockPrisma.fanProfile.findUnique.mockResolvedValue(mockFanProfile)

    const { GET } = await import('@/app/api/viewer/me/route')
    const request = createRequest('/api/viewer/me?channelId=channel-1')
    const response = await GET(request as unknown as import('next/server').NextRequest)
    const data = await response.json()

    expect(data.globalWallet).toBeDefined()
    expect(data.globalWallet.totalPoints).toBe(5000)
    expect(data.globalWallet.availablePoints).toBe(3200)
    expect(data.globalWallet.lifetimePoints).toBe(8000)
    expect(data.globalWallet.rank).toBe('SWING_TRADER')
    expect(data.globalWallet.trustScore).toBe(85)
    expect(data.globalWallet.currentStreak).toBe(5)
    expect(data.globalWallet.longestStreak).toBe(12)
  })

  it('returns channelProfile with per-channel data', async () => {
    mockPrisma.viewer.findUnique.mockResolvedValue(mockViewer)
    mockPrisma.fanProfile.findUnique.mockResolvedValue(mockFanProfile)

    const { GET } = await import('@/app/api/viewer/me/route')
    const request = createRequest('/api/viewer/me?channelId=channel-1')
    const response = await GET(request as unknown as import('next/server').NextRequest)
    const data = await response.json()

    expect(data.channelProfile).toBeDefined()
    expect(data.channelProfile.totalPoints).toBe(2000)
    expect(data.channelProfile.availablePoints).toBe(1500)
    expect(data.channelProfile.lifetimePoints).toBe(3000)
    expect(data.channelProfile.rank).toBe('RETAIL_TRADER')
  })

  it('uses global wallet values as primary in viewer object', async () => {
    mockPrisma.viewer.findUnique.mockResolvedValue(mockViewer)
    mockPrisma.fanProfile.findUnique.mockResolvedValue(mockFanProfile)

    const { GET } = await import('@/app/api/viewer/me/route')
    const request = createRequest('/api/viewer/me?channelId=channel-1')
    const response = await GET(request as unknown as import('next/server').NextRequest)
    const data = await response.json()

    // Primary viewer object should reflect global values
    expect(data.viewer.totalPoints).toBe(5000)
    expect(data.viewer.availablePoints).toBe(3200)
    expect(data.viewer.rank).toBe('SWING_TRADER')
    // Tokens should be calculated from global available
    expect(data.viewer.tokens).toBe(3) // 3200 / 1000 = 3
  })

  it('falls back to channel-local values when no FanProfile', async () => {
    const viewerWithoutFan = { ...mockViewer, fanProfileId: null }
    mockPrisma.viewer.findUnique.mockResolvedValue(viewerWithoutFan)

    const { GET } = await import('@/app/api/viewer/me/route')
    const request = createRequest('/api/viewer/me?channelId=channel-1')
    const response = await GET(request as unknown as import('next/server').NextRequest)
    const data = await response.json()

    expect(data.globalWallet).toBeNull()
    expect(data.viewer.totalPoints).toBe(2000)
    expect(data.viewer.availablePoints).toBe(1500)
    expect(data.viewer.tokens).toBe(1) // 1500 / 1000 = 1
  })

  it('returns 401 when session is missing', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const { GET } = await import('@/app/api/viewer/me/route')
    const request = createRequest('/api/viewer/me')
    const response = await GET(request as unknown as import('next/server').NextRequest)

    expect(response.status).toBe(401)
  })
})

describe('/api/viewer/channel-breakdown', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue(mockSession)
  })

  it('returns per-channel data with global totals', async () => {
    mockPrisma.viewer.findUnique.mockResolvedValue({ fanProfileId: 'fan-1' })
    mockPrisma.fanProfile.findUnique.mockResolvedValue({
      totalPoints: 5000,
      availablePoints: 3200,
      lifetimePoints: 8000,
    })
    mockPrisma.viewer.findMany.mockResolvedValue([
      {
        totalPoints: 2000,
        lifetimePoints: 3000,
        totalMessagesCount: 150,
        totalStreamsAttended: 10,
        totalCodesRedeemed: 8,
        channel: { id: 'channel-1', title: 'Channel A', thumbnailUrl: 'https://example.com/a.jpg' },
      },
      {
        totalPoints: 3000,
        lifetimePoints: 5000,
        totalMessagesCount: 200,
        totalStreamsAttended: 15,
        totalCodesRedeemed: 12,
        channel: { id: 'channel-2', title: 'Channel B', thumbnailUrl: 'https://example.com/b.jpg' },
      },
    ])

    const { GET } = await import('@/app/api/viewer/channel-breakdown/route')
    const request = createRequest('/api/viewer/channel-breakdown')
    const response = await GET(request as unknown as import('next/server').NextRequest)
    const data = await response.json()

    expect(data.globalTotal).toBe(5000)
    expect(data.globalAvailable).toBe(3200)
    expect(data.globalLifetime).toBe(8000)
    expect(data.channels).toHaveLength(2)
    expect(data.channels[0].channelId).toBe('channel-1')
    expect(data.channels[0].channelTitle).toBe('Channel A')
    expect(data.channels[0].totalPoints).toBe(2000)
    expect(data.channels[0].messagesCount).toBe(150)
    expect(data.channels[1].channelId).toBe('channel-2')
    expect(data.channels[1].totalPoints).toBe(3000)
  })

  it('returns 404 when fan profile is missing', async () => {
    mockPrisma.viewer.findUnique.mockResolvedValue({ fanProfileId: null })

    const { GET } = await import('@/app/api/viewer/channel-breakdown/route')
    const request = createRequest('/api/viewer/channel-breakdown')
    const response = await GET(request as unknown as import('next/server').NextRequest)

    expect(response.status).toBe(404)
  })

  it('channel breakdown sums should relate to global total', async () => {
    const channelAPoints = 2000
    const channelBPoints = 3000

    mockPrisma.viewer.findUnique.mockResolvedValue({ fanProfileId: 'fan-1' })
    mockPrisma.fanProfile.findUnique.mockResolvedValue({
      totalPoints: channelAPoints + channelBPoints,
      availablePoints: 4000,
      lifetimePoints: 8000,
    })
    mockPrisma.viewer.findMany.mockResolvedValue([
      {
        totalPoints: channelAPoints,
        lifetimePoints: 3000,
        totalMessagesCount: 100,
        totalStreamsAttended: 5,
        totalCodesRedeemed: 3,
        channel: { id: 'ch-a', title: 'A', thumbnailUrl: null },
      },
      {
        totalPoints: channelBPoints,
        lifetimePoints: 5000,
        totalMessagesCount: 200,
        totalStreamsAttended: 10,
        totalCodesRedeemed: 7,
        channel: { id: 'ch-b', title: 'B', thumbnailUrl: null },
      },
    ])

    const { GET } = await import('@/app/api/viewer/channel-breakdown/route')
    const request = createRequest('/api/viewer/channel-breakdown')
    const response = await GET(request as unknown as import('next/server').NextRequest)
    const data = await response.json()

    const channelSum = data.channels.reduce(
      (sum: number, ch: { totalPoints: number }) => sum + ch.totalPoints,
      0
    )
    expect(channelSum).toBe(data.globalTotal)
  })
})

describe('/api/leaderboard - Global mode uses FanProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('queries FanProfile for global leaderboard', async () => {
    mockPrisma.fanProfile.findMany.mockResolvedValue([
      {
        id: 'fan-1',
        displayName: 'TopFan',
        profileImageUrl: 'https://example.com/1.jpg',
        totalPoints: 10000,
        rank: 'FUND_MANAGER',
      },
      {
        id: 'fan-2',
        displayName: 'SecondFan',
        profileImageUrl: null,
        totalPoints: 7000,
        rank: 'SWING_TRADER',
      },
    ])

    const { GET } = await import('@/app/api/leaderboard/route')
    const request = createRequest('/api/leaderboard')
    const response = await GET(request as unknown as import('next/server').NextRequest)
    const data = await response.json()

    expect(data.type).toBe('global')
    expect(data.leaderboard).toHaveLength(2)
    expect(data.leaderboard[0].position).toBe(1)
    expect(data.leaderboard[0].fanProfileId).toBe('fan-1')
    expect(data.leaderboard[0].points).toBe(10000)
    expect(data.leaderboard[0].viewer.displayName).toBe('TopFan')
    expect(data.leaderboard[0].viewer.rank).toBe('FUND_MANAGER')
    expect(data.leaderboard[1].position).toBe(2)
    expect(data.leaderboard[1].fanProfileId).toBe('fan-2')

    // Verify FanProfile was queried (not Viewer)
    expect(mockPrisma.fanProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isBanned: false },
        orderBy: { totalPoints: 'desc' },
      })
    )
  })
})

describe('/api/viewer/redeem - FanProfile wallet deduction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue(mockSession)
  })

  it('checks FanProfile availablePoints before redemption', async () => {
    const viewerWithFan = {
      ...mockViewer,
      channelId: 'channel-1',
      fanProfileId: 'fan-1',
      fanProfile: {
        id: 'fan-1',
        availablePoints: 500, // Not enough for 1-token reward (1000 pts)
        totalPoints: 2000,
        rank: 'RETAIL_TRADER',
        trustScore: 80,
      },
    }
    // rewardConfig.findUnique is called first, then viewer.findUnique
    mockPrisma.rewardConfig.findUnique.mockResolvedValue({
      id: 'reward-1',
      channelId: 'channel-1',
      name: 'Test Reward',
      tokenCost: 1,
      isActive: true,
      requiresShipping: false,
      minTrustScore: 30,
      minAccountAgeDays: 0,
      minRank: null,
      rewardType: 'DIGITAL',
      stockQuantity: null,
      maxPerViewer: null,
      maxTotal: null,
      _count: { redemptions: 0 },
    })
    mockPrisma.viewer.findUnique.mockResolvedValue(viewerWithFan)

    const { POST } = await import('@/app/api/viewer/redeem/route')
    const request = createRequest('/api/viewer/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rewardId: 'reward-1' }),
    })
    const response = await POST(request as unknown as import('next/server').NextRequest)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Not enough points')
  })

  it('deducts from FanProfile inside transaction when fanProfileId exists', async () => {
    const viewerWithFan = {
      ...mockViewer,
      channelId: 'channel-1',
      fanProfileId: 'fan-1',
      fanProfile: {
        id: 'fan-1',
        availablePoints: 5000, // Enough for 2-token reward
        totalPoints: 8000,
        rank: 'SWING_TRADER',
        trustScore: 80,
      },
    }
    mockPrisma.rewardConfig.findUnique.mockResolvedValue({
      id: 'reward-1',
      channelId: 'channel-1',
      name: 'Test Reward',
      tokenCost: 2,
      isActive: true,
      requiresShipping: false,
      minTrustScore: 30,
      minAccountAgeDays: 0,
      minRank: null,
      rewardType: 'DIGITAL',
      stockQuantity: null,
      maxPerViewer: null,
      maxTotal: null,
      _count: { redemptions: 0 },
    })
    mockPrisma.viewer.findUnique.mockResolvedValue(viewerWithFan)

    // Track what happens inside the transaction
    let txFanProfileUpdateCall: unknown = null
    let txViewerUpdateCall: unknown = null
    let txPointLedgerCreateCall: unknown = null

    // Mock the transaction to execute the callback
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const txMock = {
        rewardRedemption: {
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue({ id: 'redemption-1' }),
        },
        fanProfile: {
          findUnique: vi.fn().mockResolvedValue({ availablePoints: 5000 }),
          update: vi.fn().mockImplementation(async (args: unknown) => {
            txFanProfileUpdateCall = args
            return {}
          }),
        },
        viewer: {
          findUnique: vi.fn().mockResolvedValue({ availablePoints: 1500 }),
          update: vi.fn().mockImplementation(async (args: unknown) => {
            txViewerUpdateCall = args
            return {}
          }),
        },
        rewardConfig: {
          findUnique: vi.fn().mockResolvedValue({ stockQuantity: null }),
          update: vi.fn().mockResolvedValue({}),
        },
        pointLedger: {
          create: vi.fn().mockImplementation(async (args: unknown) => {
            txPointLedgerCreateCall = args
            return {}
          }),
        },
      }

      return await fn(txMock)
    })

    const { POST } = await import('@/app/api/viewer/redeem/route')
    const request = createRequest('/api/viewer/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rewardId: 'reward-1' }),
    })
    const response = await POST(request as unknown as import('next/server').NextRequest)
    const data = await response.json()

    expect(data.success).toBe(true)
    expect(data.redemption.pointsSpent).toBe(2000)

    // Verify FanProfile was updated (not Viewer)
    expect(txFanProfileUpdateCall).toEqual(
      expect.objectContaining({
        where: { id: 'fan-1' },
        data: { availablePoints: { decrement: 2000 } },
      })
    )
    // Verify Viewer was NOT updated for points
    expect(txViewerUpdateCall).toBeNull()

    // Verify PointLedger includes fanProfileId
    expect(txPointLedgerCreateCall).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          fanProfileId: 'fan-1',
          viewerId: 'viewer-1',
          amount: -2000,
        }),
      })
    )
  })
})
