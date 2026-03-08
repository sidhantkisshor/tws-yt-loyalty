'use client'

import { useState } from 'react'

interface Viewer {
  id: string
  displayName: string
  profileImageUrl: string | null
  totalPoints: number
  availablePoints: number
  lifetimePoints: number
  availableTokens: number
  rank: string
  trustScore: number
  currentStreak: number
  longestStreak: number
  totalStreamsAttended: number
  totalCodesRedeemed: number
  isMember: boolean
  isModerator: boolean
  channel: {
    id: string
    title: string
    thumbnailUrl: string | null
  }
  pointLedger: Array<{
    id: string
    type: string
    amount: number
    description: string | null
    createdAt: string
  }>
  codeRedemptions: Array<{
    id: string
    pointsAwarded: number
    bonusType: string | null
    redeemedAt: string
    code: {
      code: string
      codeType: string
    }
  }>
  streamAttendances: Array<{
    id: string
    messageCount: number
    codesRedeemed: number
    pointsEarned: number
    stream: {
      id: string
      title: string
      actualStartAt: string | null
    }
  }>
}

const RANK_COLORS: Record<string, string> = {
  PAPER_TRADER: 'bg-gray-500',
  RETAIL_TRADER: 'bg-green-600',
  SWING_TRADER: 'bg-blue-500',
  FUND_MANAGER: 'bg-orange-600',
  MARKET_MAKER: 'bg-cyan-500',
  HEDGE_FUND: 'bg-yellow-600',
  WHALE: 'bg-purple-500',
}

const RANK_NAMES: Record<string, string> = {
  PAPER_TRADER: 'Paper Trader',
  RETAIL_TRADER: 'Retail Trader',
  SWING_TRADER: 'Swing Trader',
  FUND_MANAGER: 'Fund Manager',
  MARKET_MAKER: 'Market Maker',
  HEDGE_FUND: 'Hedge Fund',
  WHALE: 'Whale',
}

export default function ViewerDashboard() {
  const [youtubeChannelId, setYoutubeChannelId] = useState('')
  const [viewer, setViewer] = useState<Viewer | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lookupViewer = async () => {
    if (!youtubeChannelId.trim()) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(
        `/api/viewers/lookup?youtubeChannelId=${encodeURIComponent(youtubeChannelId.trim())}`
      )
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Viewer not found')
      }

      // If multiple viewers returned, use first one for now
      if (data.viewers) {
        setViewer(data.viewers[0])
      } else {
        setViewer(data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to lookup viewer')
      setViewer(null)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const formatTransactionType = (type: string) => {
    return type
      .split('_')
      .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
      .join(' ')
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-2">Viewer Dashboard</h1>
        <p className="text-gray-400 mb-8">
          Look up your loyalty points and rewards
        </p>

        {/* Search Box */}
        <div className="bg-gray-800 rounded-lg p-6 mb-8">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Your YouTube Channel ID
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              value={youtubeChannelId}
              onChange={(e) => setYoutubeChannelId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && lookupViewer()}
              placeholder="UC..."
              className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={lookupViewer}
              disabled={loading}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium disabled:opacity-50"
            >
              {loading ? 'Looking up...' : 'Look Up'}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Find your channel ID from your YouTube channel URL or About page
          </p>
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-8">
            {error}
          </div>
        )}

        {viewer && (
          <>
            {/* Profile Header */}
            <div className="bg-gray-800 rounded-lg p-6 mb-6">
              <div className="flex items-center gap-4">
                {viewer.profileImageUrl ? (
                  <img
                    src={viewer.profileImageUrl}
                    alt={viewer.displayName}
                    className="w-16 h-16 rounded-full"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gray-600 flex items-center justify-center text-2xl">
                    {viewer.displayName.charAt(0)}
                  </div>
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold">{viewer.displayName}</h2>
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${RANK_COLORS[viewer.rank]}`}
                    >
                      {RANK_NAMES[viewer.rank]}
                    </span>
                    {viewer.isMember && (
                      <span className="px-2 py-1 rounded text-xs font-medium bg-green-600">
                        Member
                      </span>
                    )}
                    {viewer.isModerator && (
                      <span className="px-2 py-1 rounded text-xs font-medium bg-blue-600">
                        Mod
                      </span>
                    )}
                  </div>
                  <p className="text-gray-400 text-sm">
                    {viewer.channel.title}
                  </p>
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-gray-800 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-blue-400">
                  {viewer.availablePoints.toLocaleString()}
                </div>
                <div className="text-sm text-gray-400">Available Points</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-green-400">
                  {viewer.availableTokens}
                </div>
                <div className="text-sm text-gray-400">Tokens</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-yellow-400">
                  {viewer.currentStreak}
                </div>
                <div className="text-sm text-gray-400">Current Streak</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-purple-400">
                  {viewer.totalStreamsAttended}
                </div>
                <div className="text-sm text-gray-400">Streams Attended</div>
              </div>
            </div>

            {/* Secondary Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="text-sm text-gray-400">Lifetime Points</div>
                <div className="text-xl font-bold">
                  {viewer.lifetimePoints.toLocaleString()}
                </div>
              </div>
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="text-sm text-gray-400">Codes Redeemed</div>
                <div className="text-xl font-bold">
                  {viewer.totalCodesRedeemed}
                </div>
              </div>
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="text-sm text-gray-400">Longest Streak</div>
                <div className="text-xl font-bold">{viewer.longestStreak}</div>
              </div>
            </div>

            {/* Recent Activity Tabs */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Recent Transactions */}
              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-bold mb-4">Recent Transactions</h3>
                <div className="space-y-3">
                  {viewer.pointLedger.length === 0 ? (
                    <p className="text-gray-500">No transactions yet</p>
                  ) : (
                    viewer.pointLedger.slice(0, 10).map((tx) => (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0"
                      >
                        <div>
                          <div className="text-sm font-medium">
                            {formatTransactionType(tx.type)}
                          </div>
                          {tx.description && (
                            <div className="text-xs text-gray-500">
                              {tx.description}
                            </div>
                          )}
                        </div>
                        <div
                          className={`font-bold ${
                            tx.amount >= 0 ? 'text-green-400' : 'text-red-400'
                          }`}
                        >
                          {tx.amount >= 0 ? '+' : ''}
                          {tx.amount}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Recent Streams */}
              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-bold mb-4">Recent Streams</h3>
                <div className="space-y-3">
                  {viewer.streamAttendances.length === 0 ? (
                    <p className="text-gray-500">No streams attended yet</p>
                  ) : (
                    viewer.streamAttendances.map((attendance) => (
                      <div
                        key={attendance.id}
                        className="py-2 border-b border-gray-700 last:border-0"
                      >
                        <div className="text-sm font-medium truncate">
                          {attendance.stream.title}
                        </div>
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                          <span>
                            {attendance.stream.actualStartAt
                              ? formatDate(attendance.stream.actualStartAt)
                              : 'Scheduled'}
                          </span>
                          <span>
                            {attendance.codesRedeemed} codes /{' '}
                            {attendance.pointsEarned} pts
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Rank Progress */}
            <div className="bg-gray-800 rounded-lg p-6 mt-6">
              <h3 className="text-lg font-bold mb-4">Rank Progress</h3>
              <div className="relative">
                <div className="flex justify-between text-xs text-gray-500 mb-2">
                  <span>Paper Trader (0)</span>
                  <span>Retail Trader (2.5K)</span>
                  <span>Swing Trader (10K)</span>
                  <span>Fund Manager (35K)</span>
                  <span>Market Maker (100K)</span>
                </div>
                <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-gray-500 via-yellow-500 to-purple-500"
                    style={{
                      width: `${Math.min(100, (viewer.totalPoints / 100000) * 100)}%`,
                    }}
                  />
                </div>
                <div className="text-center mt-2 text-sm text-gray-400">
                  {viewer.totalPoints.toLocaleString()} / 100,000 points
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
