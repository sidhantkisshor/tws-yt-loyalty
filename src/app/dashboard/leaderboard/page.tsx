'use client'

import { useState, useEffect } from 'react'

interface LeaderboardEntry {
  position: number
  viewerId: string
  points: number
  viewer: {
    id: string
    displayName: string
    profileImageUrl: string | null
    rank: string
    isMember: boolean
    isModerator: boolean
    channelTitle?: string
  } | null
}

interface LeaderboardResponse {
  type: 'global' | 'channel' | 'stream'
  leaderboard: LeaderboardEntry[]
}

const RANK_COLORS: Record<string, string> = {
  PAPER_TRADER: 'text-gray-400',
  RETAIL_TRADER: 'text-green-400',
  SWING_TRADER: 'text-blue-400',
  FUND_MANAGER: 'text-orange-400',
  MARKET_MAKER: 'text-cyan-400',
  HEDGE_FUND: 'text-yellow-400',
  WHALE: 'text-purple-400',
}

const POSITION_STYLES: Record<number, string> = {
  1: 'bg-yellow-500/20 border-yellow-500',
  2: 'bg-gray-400/20 border-gray-400',
  3: 'bg-amber-600/20 border-amber-600',
}

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchLeaderboard()
  }, [])

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch('/api/leaderboard?limit=50')
      const data: LeaderboardResponse = await res.json()

      if (!res.ok) {
        throw new Error('Failed to fetch leaderboard')
      }

      setLeaderboard(data.leaderboard)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leaderboard')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-800 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Leaderboard</h1>
      <p className="text-gray-400 mb-8">Top viewers across all channels</p>

      {error && (
        <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-8">
          {error}
        </div>
      )}

      {leaderboard.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400">No viewers on the leaderboard yet</p>
          <p className="text-gray-500 text-sm mt-2">
            Watch live streams and redeem codes to earn points!
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {leaderboard.map((entry) => (
            <div
              key={entry.viewerId}
              className={`flex items-center gap-4 p-4 rounded-lg border ${
                POSITION_STYLES[entry.position] ||
                'bg-gray-800/50 border-gray-700'
              }`}
            >
              {/* Position */}
              <div className="w-10 text-center">
                {entry.position <= 3 ? (
                  <span className="text-2xl">
                    {entry.position === 1 && '🥇'}
                    {entry.position === 2 && '🥈'}
                    {entry.position === 3 && '🥉'}
                  </span>
                ) : (
                  <span className="text-lg font-bold text-gray-500">
                    #{entry.position}
                  </span>
                )}
              </div>

              {/* Avatar */}
              {entry.viewer?.profileImageUrl ? (
                <img
                  src={entry.viewer.profileImageUrl}
                  alt={entry.viewer.displayName}
                  className="w-10 h-10 rounded-full"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center">
                  {entry.viewer?.displayName?.charAt(0) || '?'}
                </div>
              )}

              {/* Name and badges */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">
                    {entry.viewer?.displayName || 'Unknown'}
                  </span>
                  {entry.viewer?.isMember && (
                    <span className="px-1.5 py-0.5 rounded text-xs bg-green-600">
                      Member
                    </span>
                  )}
                  {entry.viewer?.isModerator && (
                    <span className="px-1.5 py-0.5 rounded text-xs bg-blue-600">
                      Mod
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className={RANK_COLORS[entry.viewer?.rank || 'PAPER_TRADER'] || 'text-gray-400'}>
                    {entry.viewer?.rank?.replace(/_/g, ' ') || 'Paper Trader'}
                  </span>
                  {entry.viewer?.channelTitle && (
                    <span className="text-gray-500">
                      • {entry.viewer.channelTitle}
                    </span>
                  )}
                </div>
              </div>

              {/* Points */}
              <div className="text-right">
                <div className="text-xl font-bold text-blue-400">
                  {entry.points.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500">points</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
