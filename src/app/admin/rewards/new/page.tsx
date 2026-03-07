'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { logger } from '@/lib/logger'

interface Channel {
  id: string
  title: string
  thumbnailUrl: string | null
}

export default function NewRewardPage() {
  const router = useRouter()
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    channelId: '',
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
  })

  useEffect(() => {
    fetchChannels()
  }, [])

  async function fetchChannels() {
    try {
      const res = await fetch('/api/channels')
      const data = await res.json()
      setChannels(data.channels || [])
      if (data.channels?.length > 0) {
        setForm(f => ({ ...f, channelId: data.channels[0].id }))
      }
    } catch (error) {
      logger.error('Failed to fetch channels', error)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const payload = {
        channelId: form.channelId,
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
      }

      const res = await fetch('/api/admin/rewards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create reward')
      }

      router.push('/admin/rewards')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create reward')
    }

    setLoading(false)
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-6">Create New Reward</h1>

      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Channel */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Channel
          </label>
          <select
            value={form.channelId}
            onChange={e => setForm({ ...form, channelId: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            required
          >
            {channels.map(ch => (
              <option key={ch.id} value={ch.id}>{ch.title}</option>
            ))}
          </select>
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
              <span className="text-gray-300">Digital (Discord roles, content, etc.)</span>
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
              <span className="text-gray-300">Physical (requires shipping)</span>
            </label>
          </div>
        </div>

        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Reward Name
          </label>
          <input
            type="text"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            placeholder="e.g., Discord VIP Role, Exclusive Sticker Pack"
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
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            rows={3}
            placeholder="What does this reward include?"
          />
        </div>

        {/* Image URL */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Image URL (optional)
          </label>
          <input
            type="url"
            value={form.imageUrl}
            onChange={e => setForm({ ...form, imageUrl: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            placeholder="https://..."
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
              className="w-32 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              required
            />
            <span className="text-gray-400">tokens ({form.tokenCost * 1000} points)</span>
          </div>
        </div>

        {/* Limits */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Max Per Viewer (optional)
            </label>
            <input
              type="number"
              min={1}
              value={form.maxPerViewer}
              onChange={e => setForm({ ...form, maxPerViewer: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              placeholder="Unlimited"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Max Total (optional)
            </label>
            <input
              type="number"
              min={1}
              value={form.maxTotal}
              onChange={e => setForm({ ...form, maxTotal: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              placeholder="Unlimited"
            />
          </div>
        </div>

        {/* Stock (for physical) */}
        {form.rewardType === 'PHYSICAL' && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Stock Quantity (optional)
            </label>
            <input
              type="number"
              min={0}
              value={form.stockQuantity}
              onChange={e => setForm({ ...form, stockQuantity: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              placeholder="Track inventory"
            />
          </div>
        )}

        {/* Requirements */}
        <div className="border-t border-gray-700 pt-6">
          <h3 className="text-lg font-medium text-white mb-4">Requirements</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Minimum Trust Score
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={form.minTrustScore}
                onChange={e => setForm({ ...form, minTrustScore: parseInt(e.target.value) || 0 })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Minimum Account Age (days)
              </label>
              <input
                type="number"
                min={0}
                value={form.minAccountAgeDays}
                onChange={e => setForm({ ...form, minAccountAgeDays: parseInt(e.target.value) || 0 })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Minimum Rank (optional)
            </label>
            <select
              value={form.minRank}
              onChange={e => setForm({ ...form, minRank: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">No rank requirement</option>
              <option value="PAPER_TRADER">Paper Trader (0+ points)</option>
              <option value="RETAIL_TRADER">Retail Trader (2,500+ points)</option>
              <option value="SWING_TRADER">Swing Trader (10,000+ points)</option>
              <option value="FUND_MANAGER">Fund Manager (35,000+ points)</option>
              <option value="MARKET_MAKER">Market Maker (100,000+ points)</option>
              <option value="HEDGE_FUND">Hedge Fund (200,000+ points)</option>
              <option value="WHALE">Whale (400,000+ points)</option>
            </select>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <button
            type="submit"
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-medium"
          >
            {loading ? 'Creating...' : 'Create Reward'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded-lg font-medium"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
