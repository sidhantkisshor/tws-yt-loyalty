'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { logger } from '@/lib/logger'

interface Reward {
  id: string
  name: string
  description: string | null
  imageUrl: string | null
  rewardType: 'DIGITAL' | 'PHYSICAL'
  requiresShipping: boolean
  stockQuantity: number | null
  tokenCost: number
  isActive: boolean
  currentTotal: number
  maxTotal: number | null
  channel: {
    id: string
    title: string
    thumbnailUrl: string | null
  }
  _count: {
    redemptions: number
  }
}

export default function RewardsPage() {
  const [rewards, setRewards] = useState<Reward[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'DIGITAL' | 'PHYSICAL'>('all')

  const fetchRewards = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter !== 'all') {
        params.set('type', filter)
      }
      const res = await fetch(`/api/admin/rewards?${params}`)
      const data = await res.json()
      setRewards(data.rewards || [])
    } catch (error) {
      logger.error('Failed to fetch rewards', error)
    }
    setLoading(false)
  }, [filter])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: async data fetch on mount/filter change
    fetchRewards()
  }, [fetchRewards])

  async function toggleActive(reward: Reward) {
    try {
      await fetch(`/api/admin/rewards/${reward.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !reward.isActive }),
      })
      fetchRewards()
    } catch (error) {
      logger.error('Failed to toggle reward', error)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Rewards</h1>
        <Link
          href="/admin/rewards/new"
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium"
        >
          + New Reward
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        {(['all', 'DIGITAL', 'PHYSICAL'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg font-medium ${
              filter === f
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {f === 'all' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-400">Loading rewards...</div>
      ) : rewards.length === 0 ? (
        <div className="text-center py-12 bg-gray-800 rounded-lg">
          <p className="text-gray-400 mb-4">No rewards yet</p>
          <Link
            href="/admin/rewards/new"
            className="text-indigo-400 hover:text-indigo-300"
          >
            Create your first reward
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rewards.map((reward) => (
            <div
              key={reward.id}
              className={`bg-gray-800 rounded-lg p-4 border ${
                reward.isActive ? 'border-gray-700' : 'border-red-900 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  {reward.imageUrl ? (
                    <img
                      src={reward.imageUrl}
                      alt={reward.name}
                      className="w-12 h-12 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-gray-700 flex items-center justify-center">
                      <span className="text-2xl">
                        {reward.rewardType === 'DIGITAL' ? '🎁' : '📦'}
                      </span>
                    </div>
                  )}
                  <div>
                    <h3 className="font-semibold text-white">{reward.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      reward.rewardType === 'DIGITAL'
                        ? 'bg-blue-900 text-blue-300'
                        : 'bg-orange-900 text-orange-300'
                    }`}>
                      {reward.rewardType}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => toggleActive(reward)}
                  className={`text-xs px-2 py-1 rounded ${
                    reward.isActive
                      ? 'bg-green-900 text-green-300'
                      : 'bg-red-900 text-red-300'
                  }`}
                >
                  {reward.isActive ? 'Active' : 'Inactive'}
                </button>
              </div>

              {reward.description && (
                <p className="text-gray-400 text-sm mb-3 line-clamp-2">
                  {reward.description}
                </p>
              )}

              <div className="flex items-center justify-between text-sm">
                <div className="text-gray-400">
                  <span className="text-indigo-400 font-semibold">
                    {reward.tokenCost}
                  </span>{' '}
                  tokens
                </div>
                <div className="text-gray-500">
                  {reward._count.redemptions} redeemed
                  {reward.maxTotal && ` / ${reward.maxTotal}`}
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-gray-700 flex justify-between items-center">
                <span className="text-xs text-gray-500">{reward.channel.title}</span>
                <Link
                  href={`/admin/rewards/${reward.id}`}
                  className="text-indigo-400 hover:text-indigo-300 text-sm"
                >
                  Edit
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
