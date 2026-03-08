'use client'

import { useState, useEffect, useCallback } from 'react'
import { logger } from '@/lib/logger'

interface Redemption {
  id: string
  tokensSpent: number
  pointsSpent: number
  deliveryStatus: string
  redeemedAt: string
  rewardCode: string | null
  deliveredAt: string | null
  shippingName: string | null
  shippingAddress: string | null
  shippingCity: string | null
  shippingState: string | null
  shippingZip: string | null
  shippingCountry: string | null
  trackingNumber: string | null
  shippedAt: string | null
  adminNotes: string | null
  reward: {
    id: string
    name: string
    rewardType: 'DIGITAL' | 'PHYSICAL'
    requiresShipping: boolean
    channel: {
      id: string
      title: string
    }
  }
  viewer: {
    id: string
    displayName: string
    profileImageUrl: string | null
    youtubeChannelId: string
  }
}

const STATUS_OPTIONS = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'FAILED', 'CANCELLED']
const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-900 text-yellow-300',
  PROCESSING: 'bg-blue-900 text-blue-300',
  SHIPPED: 'bg-indigo-900 text-indigo-300',
  DELIVERED: 'bg-green-900 text-green-300',
  FAILED: 'bg-red-900 text-red-300',
  CANCELLED: 'bg-gray-700 text-gray-400',
}

export default function FulfillmentPage() {
  const [redemptions, setRedemptions] = useState<Redemption[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'PENDING' | 'FAILED' | 'PHYSICAL'>('PENDING')
  const [selectedRedemption, setSelectedRedemption] = useState<Redemption | null>(null)
  const [updating, setUpdating] = useState(false)
  const [fulfilling, setFulfilling] = useState<string | null>(null)

  const fetchRedemptions = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter === 'PENDING') {
        params.set('status', 'PENDING')
      } else if (filter === 'FAILED') {
        params.set('status', 'FAILED')
      } else if (filter === 'PHYSICAL') {
        params.set('type', 'PHYSICAL')
      }
      const res = await fetch(`/api/admin/redemptions?${params}`)
      const data = await res.json()
      setRedemptions(data.redemptions || [])
    } catch (error) {
      logger.error('Failed to fetch redemptions', error)
    }
    setLoading(false)
  }, [filter])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: async data fetch on mount
    fetchRedemptions()
  }, [fetchRedemptions])

  async function updateStatus(id: string, status: string, trackingNumber?: string) {
    setUpdating(true)
    try {
      await fetch(`/api/admin/redemptions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deliveryStatus: status, trackingNumber }),
      })
      fetchRedemptions()
      setSelectedRedemption(null)
    } catch (error) {
      logger.error('Failed to update redemption', error)
    }
    setUpdating(false)
  }

  async function triggerFulfillment(id: string) {
    setFulfilling(id)
    try {
      const res = await fetch(`/api/admin/redemptions/${id}/fulfill`, {
        method: 'POST',
      })
      const data = await res.json()
      if (res.ok) {
        fetchRedemptions()
        setSelectedRedemption(null)
      } else {
        alert(data.error || 'Fulfillment failed')
      }
    } catch (error) {
      logger.error('Failed to trigger fulfillment', error)
      alert('Failed to trigger fulfillment')
    }
    setFulfilling(null)
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Fulfillment</h1>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        {[
          { key: 'PENDING', label: 'Pending' },
          { key: 'FAILED', label: 'Failed' },
          { key: 'PHYSICAL', label: 'Physical Items' },
          { key: 'all', label: 'All' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key as typeof filter)}
            className={`px-4 py-2 rounded-lg font-medium ${
              filter === key
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-400">Loading redemptions...</div>
      ) : redemptions.length === 0 ? (
        <div className="text-center py-12 bg-gray-800 rounded-lg">
          <p className="text-gray-400">No redemptions to fulfill</p>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-900">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Viewer</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Reward</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Type</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Status</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Code</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Date</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {redemptions.map((r) => (
                <tr key={r.id} className="hover:bg-gray-750">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {r.viewer.profileImageUrl ? (
                        <img
                          src={r.viewer.profileImageUrl}
                          alt=""
                          className="w-8 h-8 rounded-full"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-700" />
                      )}
                      <span className="text-white">{r.viewer.displayName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-white">{r.reward.name}</p>
                      <p className="text-xs text-gray-500">{r.reward.channel.title}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      r.reward.rewardType === 'DIGITAL'
                        ? 'bg-blue-900 text-blue-300'
                        : 'bg-orange-900 text-orange-300'
                    }`}>
                      {r.reward.rewardType}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded ${STATUS_COLORS[r.deliveryStatus]}`}>
                      {r.deliveryStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {r.rewardCode ? (
                      <code className="text-xs text-green-400 bg-green-900/30 px-2 py-1 rounded font-mono">
                        {r.rewardCode}
                      </code>
                    ) : (
                      <span className="text-xs text-gray-500">--</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">
                    {new Date(r.redeemedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {/* Fulfill / Retry button for digital PENDING or FAILED */}
                      {r.reward.rewardType === 'DIGITAL' &&
                        (r.deliveryStatus === 'PENDING' || r.deliveryStatus === 'FAILED') && (
                        <button
                          onClick={() => triggerFulfillment(r.id)}
                          disabled={fulfilling === r.id}
                          className="px-3 py-1 text-xs font-medium bg-green-700 text-green-100 rounded hover:bg-green-600 disabled:opacity-50"
                        >
                          {fulfilling === r.id
                            ? 'Fulfilling...'
                            : r.deliveryStatus === 'FAILED'
                              ? 'Retry'
                              : 'Fulfill'}
                        </button>
                      )}
                      <button
                        onClick={() => setSelectedRedemption(r)}
                        className="text-indigo-400 hover:text-indigo-300 text-sm"
                      >
                        Manage
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Manage Modal */}
      {selectedRedemption && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-white mb-4">Manage Redemption</h2>

            {/* Viewer Info */}
            <div className="mb-4 p-3 bg-gray-700 rounded-lg">
              <div className="flex items-center gap-3 mb-2">
                {selectedRedemption.viewer.profileImageUrl ? (
                  <img
                    src={selectedRedemption.viewer.profileImageUrl}
                    alt=""
                    className="w-10 h-10 rounded-full"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-600" />
                )}
                <div>
                  <p className="text-white font-medium">{selectedRedemption.viewer.displayName}</p>
                  <p className="text-xs text-gray-400">Redeemed {selectedRedemption.tokensSpent} tokens</p>
                </div>
              </div>
              <p className="text-sm text-gray-300">
                Reward: <span className="text-white">{selectedRedemption.reward.name}</span>
              </p>
            </div>

            {/* Delivery Code (for fulfilled digital rewards) */}
            {selectedRedemption.rewardCode && (
              <div className="mb-4 p-3 bg-gray-700 rounded-lg">
                <h3 className="text-sm font-medium text-gray-300 mb-2">Delivery Code</h3>
                <code className="text-green-400 font-mono text-lg">{selectedRedemption.rewardCode}</code>
                {selectedRedemption.deliveredAt && (
                  <p className="text-xs text-gray-500 mt-1">
                    Delivered: {new Date(selectedRedemption.deliveredAt).toLocaleString()}
                  </p>
                )}
              </div>
            )}

            {/* Shipping Address (for physical) */}
            {selectedRedemption.reward.requiresShipping && selectedRedemption.shippingName && (
              <div className="mb-4 p-3 bg-gray-700 rounded-lg">
                <h3 className="text-sm font-medium text-gray-300 mb-2">Shipping Address</h3>
                <p className="text-white">{selectedRedemption.shippingName}</p>
                <p className="text-gray-300">{selectedRedemption.shippingAddress}</p>
                <p className="text-gray-300">
                  {selectedRedemption.shippingCity}, {selectedRedemption.shippingState} {selectedRedemption.shippingZip}
                </p>
                <p className="text-gray-300">{selectedRedemption.shippingCountry}</p>
              </div>
            )}

            {/* Current Status */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">Current Status</label>
              <span className={`px-3 py-1 rounded ${STATUS_COLORS[selectedRedemption.deliveryStatus]}`}>
                {selectedRedemption.deliveryStatus}
              </span>
            </div>

            {/* Admin Notes */}
            {selectedRedemption.adminNotes && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-1">Notes</label>
                <p className="text-sm text-gray-400">{selectedRedemption.adminNotes}</p>
              </div>
            )}

            {/* Tracking Number */}
            {selectedRedemption.trackingNumber && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-1">Tracking Number</label>
                <p className="text-white">{selectedRedemption.trackingNumber}</p>
              </div>
            )}

            {/* Fulfill / Retry Button for digital rewards */}
            {selectedRedemption.reward.rewardType === 'DIGITAL' &&
              (selectedRedemption.deliveryStatus === 'PENDING' ||
                selectedRedemption.deliveryStatus === 'FAILED') && (
              <div className="mb-4">
                <button
                  onClick={() => triggerFulfillment(selectedRedemption.id)}
                  disabled={fulfilling === selectedRedemption.id}
                  className="w-full px-4 py-2.5 bg-green-700 text-green-100 rounded-lg font-medium hover:bg-green-600 disabled:opacity-50"
                >
                  {fulfilling === selectedRedemption.id
                    ? 'Fulfilling...'
                    : selectedRedemption.deliveryStatus === 'FAILED'
                      ? 'Retry Fulfillment'
                      : 'Fulfill Now'}
                </button>
              </div>
            )}

            {/* Quick Actions */}
            <div className="space-y-2 mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">Update Status</label>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.filter(s => s !== selectedRedemption.deliveryStatus).map((status) => (
                  <button
                    key={status}
                    onClick={() => {
                      if (status === 'SHIPPED' && selectedRedemption.reward.requiresShipping) {
                        const tracking = prompt('Enter tracking number (optional):')
                        updateStatus(selectedRedemption.id, status, tracking || undefined)
                      } else {
                        updateStatus(selectedRedemption.id, status)
                      }
                    }}
                    disabled={updating}
                    className={`px-3 py-1.5 rounded text-sm font-medium ${STATUS_COLORS[status]} hover:opacity-80 disabled:opacity-50`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            {/* Close Button */}
            <div className="flex justify-end">
              <button
                onClick={() => setSelectedRedemption(null)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
