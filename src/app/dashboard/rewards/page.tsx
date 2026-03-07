'use client'

import { useState, useEffect } from 'react'

interface Reward {
  id: string
  name: string
  description: string | null
  imageUrl: string | null
  tokenCost: number
  maxPerViewer: number | null
  maxTotal: number | null
  currentTotal: number
  minTrustScore: number
  minAccountAgeDays: number
  minRank: string | null
  channel: {
    id: string
    title: string
    thumbnailUrl: string | null
  }
  redemptionCount: number
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

export default function RewardsPage() {
  const [rewards, setRewards] = useState<Reward[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedReward, setSelectedReward] = useState<Reward | null>(null)
  const [viewerId, setViewerId] = useState('')
  const [redeeming, setRedeeming] = useState(false)
  const [redeemResult, setRedeemResult] = useState<{
    success: boolean
    message: string
    code?: string
  } | null>(null)

  useEffect(() => {
    fetchRewards()
  }, [])

  const fetchRewards = async () => {
    try {
      const res = await fetch('/api/rewards')
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch rewards')
      }

      setRewards(data.rewards)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rewards')
    } finally {
      setLoading(false)
    }
  }

  const handleRedeem = async () => {
    if (!selectedReward || !viewerId.trim()) return

    setRedeeming(true)
    setRedeemResult(null)

    try {
      const res = await fetch('/api/rewards/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          viewerId: viewerId.trim(),
          rewardId: selectedReward.id,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setRedeemResult({
          success: false,
          message: data.error || 'Failed to redeem reward',
        })
      } else {
        setRedeemResult({
          success: true,
          message: 'Reward redeemed successfully!',
          code: data.redemption.rewardCode,
        })
        fetchRewards() // Refresh to update counts
      }
    } catch {
      setRedeemResult({
        success: false,
        message: 'Failed to redeem reward',
      })
    } finally {
      setRedeeming(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-48 bg-gray-800 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Rewards</h1>
      <p className="text-gray-400 mb-8">
        Spend your tokens on exclusive rewards (1 token = 1,000 points)
      </p>

      {error && (
        <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-8">
          {error}
        </div>
      )}

      {rewards.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400">No rewards available yet</p>
          <p className="text-gray-500 text-sm mt-2">
            Check back later for exclusive rewards!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rewards.map((reward) => (
            <div
              key={reward.id}
              className="bg-gray-800 rounded-lg overflow-hidden hover:bg-gray-750 transition-colors"
            >
              {reward.imageUrl && (
                <img
                  src={reward.imageUrl}
                  alt={reward.name}
                  className="w-full h-32 object-cover"
                />
              )}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-lg">{reward.name}</h3>
                  <div className="text-right">
                    <div className="text-xl font-bold text-green-400">
                      {reward.tokenCost}
                    </div>
                    <div className="text-xs text-gray-500">tokens</div>
                  </div>
                </div>

                {reward.description && (
                  <p className="text-gray-400 text-sm mt-2">
                    {reward.description}
                  </p>
                )}

                <div className="flex flex-wrap gap-2 mt-3 text-xs">
                  {reward.minRank && (
                    <span className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded">
                      {RANK_NAMES[reward.minRank]}+ required
                    </span>
                  )}
                  {reward.maxTotal && (
                    <span className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded">
                      {reward.maxTotal - reward.currentTotal} left
                    </span>
                  )}
                  {reward.maxPerViewer && (
                    <span className="px-2 py-1 bg-gray-500/20 text-gray-300 rounded">
                      Max {reward.maxPerViewer} per person
                    </span>
                  )}
                </div>

                <button
                  onClick={() => setSelectedReward(reward)}
                  className="w-full mt-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
                >
                  Redeem
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Redeem Modal */}
      {selectedReward && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4">
              Redeem: {selectedReward.name}
            </h2>

            {redeemResult ? (
              <div
                className={`p-4 rounded-lg mb-4 ${
                  redeemResult.success
                    ? 'bg-green-900/50 border border-green-500'
                    : 'bg-red-900/50 border border-red-500'
                }`}
              >
                <p
                  className={
                    redeemResult.success ? 'text-green-200' : 'text-red-200'
                  }
                >
                  {redeemResult.message}
                </p>
                {redeemResult.code && (
                  <div className="mt-3">
                    <p className="text-sm text-gray-400">Your reward code:</p>
                    <p className="text-xl font-mono font-bold text-green-400 mt-1">
                      {redeemResult.code}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <>
                <p className="text-gray-400 mb-4">
                  This will cost{' '}
                  <span className="text-green-400 font-bold">
                    {selectedReward.tokenCost} tokens
                  </span>{' '}
                  ({selectedReward.tokenCost * 1000} points)
                </p>

                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Your Viewer ID
                </label>
                <input
                  type="text"
                  value={viewerId}
                  onChange={(e) => setViewerId(e.target.value)}
                  placeholder="Enter your viewer ID"
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
                />
                <p className="text-xs text-gray-500 -mt-2 mb-4">
                  Find your viewer ID in your dashboard
                </p>
              </>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setSelectedReward(null)
                  setRedeemResult(null)
                }}
                className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium"
              >
                {redeemResult ? 'Close' : 'Cancel'}
              </button>
              {!redeemResult && (
                <button
                  onClick={handleRedeem}
                  disabled={redeeming || !viewerId.trim()}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium disabled:opacity-50"
                >
                  {redeeming ? 'Redeeming...' : 'Confirm'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
