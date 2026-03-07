'use client'

import { useState, useEffect, useCallback, use } from 'react'
import { useViewer } from '@/components/ViewerProvider'
import Link from 'next/link'
import { logger } from '@/lib/logger'

interface Reward {
  id: string
  name: string
  description: string | null
  imageUrl: string | null
  rewardType: 'DIGITAL' | 'PHYSICAL'
  requiresShipping: boolean
  tokenCost: number
  isActive: boolean
  maxTotal: number | null
  currentTotal: number
  stockQuantity: number | null
  minRank: string | null
  minTrustScore: number
  minAccountAgeDays: number
}

export default function RewardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { currentViewerProfile } = useViewer()
  const [reward, setReward] = useState<Reward | null>(null)
  const [loading, setLoading] = useState(true)
  const [redeeming, setRedeeming] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const [shipping, setShipping] = useState({
    fullName: '',
    addressLine1: '',
    city: '',
    state: '',
    postalCode: '',
    country: '',
  })

  const viewerTokens = currentViewerProfile
    ? Math.floor(currentViewerProfile.availablePoints / 1000)
    : 0

  const fetchReward = useCallback(async () => {
    try {
      const res = await fetch(`/api/rewards/${id}`)
      if (res.ok) {
        const data = await res.json()
        setReward(data.reward)
      }
    } catch (error) {
      logger.error('Failed to fetch reward', error)
    }
    setLoading(false)
  }, [id])

  useEffect(() => {
    fetchReward()
  }, [fetchReward])

  async function handleRedeem(e: React.FormEvent) {
    e.preventDefault()
    setRedeeming(true)
    setError('')

    try {
      const payload: Record<string, unknown> = { rewardId: id }

      if (reward?.requiresShipping) {
        payload.shippingAddress = shipping
      }

      const res = await fetch('/api/viewer/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to redeem')
      }

      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to redeem')
    }

    setRedeeming(false)
  }

  if (loading) {
    return <div className="text-gray-400">Loading...</div>
  }

  if (!reward) {
    return <div className="text-red-400">Reward not found</div>
  }

  if (success) {
    return (
      <div className="max-w-lg mx-auto text-center py-12">
        <div className="text-6xl mb-4">🎉</div>
        <h1 className="text-2xl font-bold text-white mb-2">Redemption Successful!</h1>
        <p className="text-gray-400 mb-6">
          Your redemption for <span className="text-white">{reward.name}</span> has been submitted.
        </p>
        {reward.requiresShipping && (
          <p className="text-gray-500 text-sm mb-6">
            We&apos;ll notify you when your item ships!
          </p>
        )}
        <div className="flex gap-4 justify-center">
          <Link
            href="/viewer/redemptions"
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-medium"
          >
            View My Redemptions
          </Link>
          <Link
            href="/viewer/rewards"
            className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded-lg font-medium"
          >
            Browse More Rewards
          </Link>
        </div>
      </div>
    )
  }

  const canAfford = viewerTokens >= reward.tokenCost
  const isSoldOut = (reward.maxTotal && reward.currentTotal >= reward.maxTotal) ||
    (reward.rewardType === 'PHYSICAL' && reward.stockQuantity !== null && reward.stockQuantity <= 0)

  return (
    <div className="max-w-3xl mx-auto">
      <Link
        href="/viewer/rewards"
        className="text-gray-400 hover:text-white text-sm mb-6 inline-block"
      >
        ← Back to Rewards
      </Link>

      <div className="bg-gray-800 rounded-lg overflow-hidden">
        {reward.imageUrl ? (
          <img
            src={reward.imageUrl}
            alt={reward.name}
            className="w-full h-64 object-cover"
          />
        ) : (
          <div className="w-full h-64 bg-gray-700 flex items-center justify-center">
            <span className="text-8xl">
              {reward.rewardType === 'DIGITAL' ? '🎁' : '📦'}
            </span>
          </div>
        )}

        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-white">{reward.name}</h1>
              <span className={`text-xs px-2 py-0.5 rounded ${
                reward.rewardType === 'DIGITAL'
                  ? 'bg-blue-900 text-blue-300'
                  : 'bg-orange-900 text-orange-300'
              }`}>
                {reward.rewardType}
              </span>
            </div>
            <div className="text-right">
              <span className="text-3xl font-bold text-indigo-400">{reward.tokenCost}</span>
              <span className="text-gray-500"> tokens</span>
              <p className="text-gray-500 text-sm">({reward.tokenCost * 1000} points)</p>
            </div>
          </div>

          {reward.description && (
            <p className="text-gray-300 mb-6">{reward.description}</p>
          )}

          {/* Requirements */}
          <div className="bg-gray-900 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-medium text-gray-400 mb-2">Requirements</h3>
            <ul className="text-sm space-y-1">
              <li className="text-gray-300">
                Min Trust Score: <span className="text-white">{reward.minTrustScore}</span>
              </li>
              <li className="text-gray-300">
                Min Account Age: <span className="text-white">{reward.minAccountAgeDays} days</span>
              </li>
              {reward.minRank && (
                <li className="text-gray-300">
                  Min Rank: <span className="text-white">{reward.minRank.replace('_', ' ')}</span>
                </li>
              )}
            </ul>
          </div>

          {error && (
            <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-6">
              {error}
            </div>
          )}

          {isSoldOut ? (
            <div className="text-center py-4">
              <p className="text-red-400 font-medium">This reward is sold out</p>
            </div>
          ) : !canAfford ? (
            <div className="text-center py-4">
              <p className="text-gray-400">
                You need <span className="text-red-400">{reward.tokenCost - viewerTokens}</span> more tokens
              </p>
            </div>
          ) : (
            <form onSubmit={handleRedeem}>
              {/* Shipping Form for Physical Rewards */}
              {reward.requiresShipping && (
                <div className="space-y-4 mb-6">
                  <h3 className="text-lg font-medium text-white">Shipping Information</h3>

                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      value={shipping.fullName}
                      onChange={e => setShipping({ ...shipping, fullName: e.target.value })}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Street Address</label>
                    <input
                      type="text"
                      required
                      value={shipping.addressLine1}
                      onChange={e => setShipping({ ...shipping, addressLine1: e.target.value })}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">City</label>
                      <input
                        type="text"
                        required
                        value={shipping.city}
                        onChange={e => setShipping({ ...shipping, city: e.target.value })}
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">State/Province</label>
                      <input
                        type="text"
                        required
                        value={shipping.state}
                        onChange={e => setShipping({ ...shipping, state: e.target.value })}
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">ZIP/Postal Code</label>
                      <input
                        type="text"
                        required
                        value={shipping.postalCode}
                        onChange={e => setShipping({ ...shipping, postalCode: e.target.value })}
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Country (2-letter code)</label>
                      <input
                        type="text"
                        required
                        maxLength={2}
                        value={shipping.country}
                        onChange={e => setShipping({ ...shipping, country: e.target.value })}
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                        placeholder="IN"
                      />
                    </div>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={redeeming}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-3 rounded-lg font-medium"
              >
                {redeeming ? 'Redeeming...' : `Redeem for ${reward.tokenCost} tokens`}
              </button>

              <p className="text-center text-gray-500 text-sm mt-3">
                Your balance after: {viewerTokens - reward.tokenCost} tokens
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
