'use client'

import { useState, useEffect, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Reward {
  id: string
  name: string
  description: string | null
  imageUrl: string | null
  rewardType: 'DIGITAL' | 'PHYSICAL'
  requiresShipping: boolean
  stockQuantity: number | null
  tokenCost: number
  maxPerViewer: number | null
  maxTotal: number | null
  minTrustScore: number
  minAccountAgeDays: number
  minRank: string | null
  isActive: boolean
  channel: {
    id: string
    title: string
  }
  _count: {
    redemptions: number
  }
  redemptions: Array<{
    id: string
    redeemedAt: string
    deliveryStatus: string
    viewer: {
      id: string
      displayName: string
      profileImageUrl: string | null
    }
  }>
}

export default function EditRewardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [reward, setReward] = useState<Reward | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    name: '',
    description: '',
    imageUrl: '',
    rewardType: 'DIGITAL' as 'DIGITAL' | 'PHYSICAL',
    tokenCost: 1,
    maxPerViewer: '',
    maxTotal: '',
    stockQuantity: '',
    minTrustScore: 30,
    minAccountAgeDays: 7,
    minRank: '',
    isActive: true,
  })

  const fetchReward = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/rewards/${id}`)
      if (!res.ok) throw new Error('Reward not found')
      const data = await res.json()
      setReward(data.reward)
      setForm({
        name: data.reward.name,
        description: data.reward.description || '',
        imageUrl: data.reward.imageUrl || '',
        rewardType: data.reward.rewardType,
        tokenCost: data.reward.tokenCost,
        maxPerViewer: data.reward.maxPerViewer?.toString() || '',
        maxTotal: data.reward.maxTotal?.toString() || '',
        stockQuantity: data.reward.stockQuantity?.toString() || '',
        minTrustScore: data.reward.minTrustScore,
        minAccountAgeDays: data.reward.minAccountAgeDays,
        minRank: data.reward.minRank || '',
        isActive: data.reward.isActive,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reward')
    }
    setLoading(false)
  }, [id])

  useEffect(() => {
    fetchReward()
  }, [fetchReward])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      const payload = {
        name: form.name,
        description: form.description || null,
        imageUrl: form.imageUrl || null,
        rewardType: form.rewardType,
        requiresShipping: form.rewardType === 'PHYSICAL',
        tokenCost: form.tokenCost,
        maxPerViewer: form.maxPerViewer ? parseInt(form.maxPerViewer) : null,
        maxTotal: form.maxTotal ? parseInt(form.maxTotal) : null,
        stockQuantity: form.stockQuantity ? parseInt(form.stockQuantity) : null,
        minTrustScore: form.minTrustScore,
        minAccountAgeDays: form.minAccountAgeDays,
        minRank: form.minRank || null,
        isActive: form.isActive,
      }

      const res = await fetch(`/api/admin/rewards/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update reward')
      }

      router.push('/admin/rewards')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update reward')
    }

    setSaving(false)
  }

  async function handleDelete() {
    if (!confirm('Are you sure you want to delete this reward?')) return

    try {
      const res = await fetch(`/api/admin/rewards/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      router.push('/admin/rewards')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  if (loading) {
    return <div className="text-gray-400">Loading reward...</div>
  }

  if (!reward) {
    return <div className="text-red-400">{error || 'Reward not found'}</div>
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Edit Reward</h1>
        <Link
          href="/admin/rewards"
          className="text-gray-400 hover:text-white"
        >
          Back to Rewards
        </Link>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit} className="space-y-6 bg-gray-800 rounded-lg p-6">
            {/* Active Toggle */}
            <div className="flex items-center justify-between">
              <span className="text-gray-300">Active</span>
              <button
                type="button"
                onClick={() => setForm({ ...form, isActive: !form.isActive })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  form.isActive ? 'bg-indigo-600' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    form.isActive ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Reward Type */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Reward Type
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="rewardType"
                    value="DIGITAL"
                    checked={form.rewardType === 'DIGITAL'}
                    onChange={() => setForm({ ...form, rewardType: 'DIGITAL' })}
                    className="text-indigo-600"
                  />
                  <span className="text-gray-300">Digital</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="rewardType"
                    value="PHYSICAL"
                    checked={form.rewardType === 'PHYSICAL'}
                    onChange={() => setForm({ ...form, rewardType: 'PHYSICAL' })}
                    className="text-indigo-600"
                  />
                  <span className="text-gray-300">Physical</span>
                </label>
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Name
              </label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Description
              </label>
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                rows={3}
              />
            </div>

            {/* Image URL */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Image URL
              </label>
              <input
                type="url"
                value={form.imageUrl}
                onChange={e => setForm({ ...form, imageUrl: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
              />
            </div>

            {/* Token Cost */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Token Cost
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={form.tokenCost}
                  onChange={e => setForm({ ...form, tokenCost: parseInt(e.target.value) || 1 })}
                  className="w-32 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                  required
                />
                <span className="text-gray-400">({form.tokenCost * 1000} points)</span>
              </div>
            </div>

            {/* Limits */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Max Per Viewer
                </label>
                <input
                  type="number"
                  min={1}
                  value={form.maxPerViewer}
                  onChange={e => setForm({ ...form, maxPerViewer: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                  placeholder="Unlimited"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Max Total
                </label>
                <input
                  type="number"
                  min={1}
                  value={form.maxTotal}
                  onChange={e => setForm({ ...form, maxTotal: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                  placeholder="Unlimited"
                />
              </div>
            </div>

            {/* Stock */}
            {form.rewardType === 'PHYSICAL' && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Stock Quantity
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.stockQuantity}
                  onChange={e => setForm({ ...form, stockQuantity: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                />
              </div>
            )}

            {/* Requirements */}
            <div className="border-t border-gray-700 pt-4">
              <h3 className="text-sm font-medium text-gray-300 mb-4">Requirements</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Min Trust Score
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.minTrustScore}
                    onChange={e => setForm({ ...form, minTrustScore: parseInt(e.target.value) || 0 })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Min Account Age (days)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={form.minAccountAgeDays}
                    onChange={e => setForm({ ...form, minAccountAgeDays: parseInt(e.target.value) || 0 })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                  />
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-sm text-gray-400 mb-1">
                  Min Rank
                </label>
                <select
                  value={form.minRank}
                  onChange={e => setForm({ ...form, minRank: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                >
                  <option value="">No requirement</option>
                  <option value="PAPER_TRADER">Paper Trader</option>
                  <option value="RETAIL_TRADER">Retail Trader</option>
                  <option value="SWING_TRADER">Swing Trader</option>
                  <option value="FUND_MANAGER">Fund Manager</option>
                  <option value="MARKET_MAKER">Market Maker</option>
                  <option value="HEDGE_FUND">Hedge Fund</option>
                  <option value="WHALE">Whale</option>
                </select>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-4 pt-4">
              <button
                type="submit"
                disabled={saving}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-medium"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-medium"
              >
                Delete
              </button>
            </div>
          </form>
        </div>

        {/* Stats & Recent Redemptions */}
        <div className="space-y-6">
          {/* Stats */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="font-medium text-white mb-3">Stats</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Channel</span>
                <span className="text-white">{reward.channel.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Total Redeemed</span>
                <span className="text-white">{reward._count.redemptions}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Status</span>
                <span className={reward.isActive ? 'text-green-400' : 'text-red-400'}>
                  {reward.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </div>

          {/* Recent Redemptions */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="font-medium text-white mb-3">Recent Redemptions</h3>
            {reward.redemptions.length === 0 ? (
              <p className="text-sm text-gray-400">No redemptions yet</p>
            ) : (
              <div className="space-y-3">
                {reward.redemptions.map((r) => (
                  <div key={r.id} className="flex items-center gap-3">
                    {r.viewer.profileImageUrl ? (
                      <img
                        src={r.viewer.profileImageUrl}
                        alt=""
                        className="w-8 h-8 rounded-full"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-700" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{r.viewer.displayName}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(r.redeemedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      r.deliveryStatus === 'DELIVERED' ? 'bg-green-900 text-green-300' :
                      r.deliveryStatus === 'SHIPPED' ? 'bg-blue-900 text-blue-300' :
                      'bg-yellow-900 text-yellow-300'
                    }`}>
                      {r.deliveryStatus}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
