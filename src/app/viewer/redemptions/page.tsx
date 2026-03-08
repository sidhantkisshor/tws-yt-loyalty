'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { logger } from '@/lib/logger'

interface Redemption {
  id: string
  tokensSpent: number
  pointsSpent: number
  rewardCode: string | null
  deliveryStatus: string
  redeemedAt: string
  deliveredAt: string | null
  shippedAt: string | null
  trackingNumber: string | null
  reward: {
    id: string
    name: string
    description: string | null
    imageUrl: string | null
    rewardType: 'DIGITAL' | 'PHYSICAL'
  }
}

const STATUS_CONFIG: Record<string, {
  label: string
  color: string
  bgClass: string
  icon: string
  step: number
}> = {
  PENDING: {
    label: 'Pending',
    color: 'var(--neon-yellow)',
    bgClass: 'status-pending',
    icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
    step: 1
  },
  PROCESSING: {
    label: 'Processing',
    color: 'var(--neon-blue)',
    bgClass: 'status-processing',
    icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
    step: 2
  },
  SHIPPED: {
    label: 'Shipped',
    color: 'var(--neon-purple)',
    bgClass: 'status-shipped',
    icon: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4',
    step: 3
  },
  DELIVERED: {
    label: 'Delivered',
    color: 'var(--neon-green)',
    bgClass: 'status-delivered',
    icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    step: 4
  },
  FAILED: {
    label: 'Failed',
    color: '#ef4444',
    bgClass: 'status-failed',
    icon: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z',
    step: 0
  },
  CANCELLED: {
    label: 'Cancelled',
    color: '#6b7280',
    bgClass: 'bg-gray-700/50 border border-gray-600 text-gray-400',
    icon: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636',
    step: 0
  },
}

const PHYSICAL_STEPS = ['Confirmed', 'Processing', 'Shipped', 'Delivered']
const DIGITAL_STEPS = ['Confirmed', 'Processing', 'Ready']

export default function ViewerRedemptionsPage() {
  const [redemptions, setRedemptions] = useState<Redemption[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchRedemptions = useCallback(async () => {
    try {
      const res = await fetch('/api/viewer/redemptions')
      if (res.ok) {
        const data = await res.json()
        setRedemptions(data.redemptions || [])
      }
    } catch (error) {
      logger.error('Failed to fetch redemptions', error)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: async data fetch
    fetchRedemptions()
  }, [fetchRedemptions])

  const filteredRedemptions = redemptions.filter(r => {
    if (filter === 'active') {
      return ['PENDING', 'PROCESSING', 'SHIPPED'].includes(r.deliveryStatus)
    }
    if (filter === 'completed') {
      return ['DELIVERED', 'FAILED', 'CANCELLED'].includes(r.deliveryStatus)
    }
    return true
  })

  function getProgressPercent(redemption: Redemption): number {
    const status = STATUS_CONFIG[redemption.deliveryStatus]
    if (!status || status.step === 0) return 0

    const isPhysical = redemption.reward.rewardType === 'PHYSICAL'
    const totalSteps = isPhysical ? 4 : 3
    return (status.step / totalSteps) * 100
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-64 skeleton rounded-lg" />
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="cyber-card rounded-xl p-6 h-32 skeleton" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-gray-500 text-sm font-[Orbitron] tracking-widest uppercase mb-1">Redemption Log</p>
          <h1 className="text-3xl md:text-4xl font-[Orbitron] font-bold text-white">
            My <span className="text-[var(--neon-pink)]">Claimed</span> Rewards
          </h1>
        </div>

        {/* Stats */}
        <div className="flex gap-4">
          <div className="cyber-card rounded-lg px-4 py-2 text-center">
            <p className="font-[Orbitron] font-bold text-xl text-white">{redemptions.length}</p>
            <p className="text-gray-500 text-[10px] uppercase tracking-wider">Total</p>
          </div>
          <div className="cyber-card rounded-lg px-4 py-2 text-center">
            <p className="font-[Orbitron] font-bold text-xl text-[var(--neon-green)]">
              {redemptions.filter(r => r.deliveryStatus === 'DELIVERED').length}
            </p>
            <p className="text-gray-500 text-[10px] uppercase tracking-wider">Delivered</p>
          </div>
          <div className="cyber-card rounded-lg px-4 py-2 text-center">
            <p className="font-[Orbitron] font-bold text-xl text-[var(--neon-blue)]">
              {redemptions.filter(r => ['PENDING', 'PROCESSING', 'SHIPPED'].includes(r.deliveryStatus)).length}
            </p>
            <p className="text-gray-500 text-[10px] uppercase tracking-wider">Active</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        {(['all', 'active', 'completed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-5 py-2.5 rounded-lg font-[Orbitron] text-xs tracking-wider uppercase transition-all ${
              filter === f
                ? 'bg-[var(--neon-cyan)]/20 text-[var(--neon-cyan)] border border-[var(--neon-cyan)]'
                : 'bg-[var(--cyber-surface)] text-gray-400 border border-[var(--cyber-border)] hover:border-gray-500 hover:text-gray-300'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Redemptions List */}
      {filteredRedemptions.length === 0 ? (
        <div className="cyber-card rounded-xl p-12 text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[var(--cyber-surface)] flex items-center justify-center">
            <svg className="w-10 h-10 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          </div>
          <h3 className="font-[Orbitron] text-xl text-white mb-2">
            {filter === 'all' ? 'No Redemptions Yet' : `No ${filter} redemptions`}
          </h3>
          <p className="text-gray-500 mb-6">
            {filter === 'all'
              ? "You haven't claimed any rewards yet."
              : filter === 'active'
                ? "You don't have any active redemptions."
                : "You don't have any completed redemptions."
            }
          </p>
          <Link
            href="/viewer/rewards"
            className="cyber-button px-6 py-3 rounded-lg text-[var(--cyber-black)] inline-flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Browse Rewards
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRedemptions.map((redemption) => {
            const statusConfig = STATUS_CONFIG[redemption.deliveryStatus] || STATUS_CONFIG.PENDING
            const isExpanded = expandedId === redemption.id
            const isPhysical = redemption.reward.rewardType === 'PHYSICAL'
            const progressPercent = getProgressPercent(redemption)
            const steps = isPhysical ? PHYSICAL_STEPS : DIGITAL_STEPS
            const currentStep = statusConfig.step

            return (
              <div
                key={redemption.id}
                className={`cyber-card rounded-xl overflow-hidden transition-all ${
                  isPhysical ? 'cyber-card-pink' : ''
                }`}
              >
                {/* Main Row */}
                <div
                  className="p-5 flex items-center gap-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : redemption.id)}
                >
                  {/* Image */}
                  {redemption.reward.imageUrl ? (
                    <img
                      src={redemption.reward.imageUrl}
                      alt=""
                      className="w-16 h-16 rounded-xl object-cover shrink-0"
                    />
                  ) : (
                    <div className={`w-16 h-16 rounded-xl flex items-center justify-center shrink-0 ${
                      isPhysical
                        ? 'bg-gradient-to-br from-[var(--neon-orange)]/20 to-[var(--neon-pink)]/20'
                        : 'bg-gradient-to-br from-[var(--neon-cyan)]/20 to-[var(--neon-blue)]/20'
                    }`}>
                      <svg className={`w-8 h-8 ${
                        isPhysical ? 'text-[var(--neon-orange)]' : 'text-[var(--neon-cyan)]'
                      }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {isPhysical ? (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        ) : (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        )}
                      </svg>
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-[Orbitron] font-bold text-white text-lg truncate">
                          {redemption.reward.name}
                        </h3>
                        <div className="flex items-center gap-3 mt-1">
                          <span className={`text-xs font-[Orbitron] tracking-wider ${
                            isPhysical ? 'tag-physical' : 'tag-digital'
                          } px-2 py-0.5 rounded`}>
                            {redemption.reward.rewardType}
                          </span>
                          <span className="text-gray-500 text-sm">
                            {redemption.tokensSpent} tokens
                          </span>
                          <span className="text-gray-600 text-sm">
                            {new Date(redemption.redeemedAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </span>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1.5 rounded-lg text-xs font-[Orbitron] tracking-wider ${statusConfig.bgClass}`}>
                          {statusConfig.label.toUpperCase()}
                        </span>
                        <svg
                          className={`w-5 h-5 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>

                    {/* Mini Progress Bar */}
                    {!isExpanded && statusConfig.step > 0 && (
                      <div className="mt-3 h-1 bg-[var(--cyber-surface)] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${progressPercent}%`,
                            background: `linear-gradient(90deg, ${statusConfig.color}, var(--neon-purple))`
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="px-5 pb-5 pt-2 border-t border-[var(--cyber-border)]">
                    {/* Progress Steps */}
                    {statusConfig.step > 0 && (
                      <div className="mb-6">
                        <div className="flex items-center justify-between mb-2">
                          {steps.map((step, index) => {
                            const stepNumber = index + 1
                            const isCompleted = stepNumber <= currentStep
                            const isCurrent = stepNumber === currentStep

                            return (
                              <div key={step} className="flex flex-col items-center flex-1">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                                  isCompleted
                                    ? 'bg-gradient-to-br from-[var(--neon-cyan)] to-[var(--neon-purple)] border-transparent'
                                    : 'border-[var(--cyber-border)] bg-[var(--cyber-surface)]'
                                } ${isCurrent ? 'ring-2 ring-[var(--neon-cyan)]/50 ring-offset-2 ring-offset-[var(--cyber-dark)]' : ''}`}>
                                  {isCompleted ? (
                                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                  ) : (
                                    <span className="text-gray-500 font-[Orbitron] text-sm">{stepNumber}</span>
                                  )}
                                </div>
                                <p className={`mt-2 text-xs font-[Orbitron] tracking-wider ${
                                  isCompleted ? 'text-white' : 'text-gray-600'
                                }`}>
                                  {step.toUpperCase()}
                                </p>
                              </div>
                            )
                          })}
                        </div>
                        {/* Connecting Lines */}
                        <div className="flex items-center justify-between px-5 -mt-[52px] mb-8">
                          {steps.slice(0, -1).map((_, index) => (
                            <div
                              key={index}
                              className={`flex-1 h-0.5 mx-2 ${
                                index + 1 < currentStep
                                  ? 'bg-gradient-to-r from-[var(--neon-cyan)] to-[var(--neon-purple)]'
                                  : 'bg-[var(--cyber-border)]'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Details Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Tracking Info */}
                      {isPhysical && redemption.trackingNumber && (
                        <div className="cyber-card rounded-lg p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Tracking Number</p>
                              <p className="font-mono text-white">{redemption.trackingNumber}</p>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                copyToClipboard(redemption.trackingNumber!)
                              }}
                              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                            >
                              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Digital Code */}
                      {!isPhysical && redemption.rewardCode && redemption.deliveryStatus === 'DELIVERED' && (
                        <div className="cyber-card rounded-lg p-4 md:col-span-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Your Code</p>
                              <p className="font-mono text-[var(--neon-green)] text-lg">{redemption.rewardCode}</p>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                copyToClipboard(redemption.rewardCode!)
                              }}
                              className="cyber-button px-4 py-2 rounded-lg text-xs flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                              </svg>
                              COPY
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Timeline */}
                      <div className={`cyber-card rounded-lg p-4 ${!isPhysical && redemption.rewardCode ? '' : 'md:col-span-2'}`}>
                        <p className="text-gray-500 text-xs uppercase tracking-wider mb-3">Timeline</p>
                        <div className="space-y-3">
                          <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-[var(--neon-cyan)]" />
                            <span className="text-gray-400 text-sm">Claimed</span>
                            <span className="text-gray-600 text-sm ml-auto">
                              {new Date(redemption.redeemedAt).toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                          {redemption.shippedAt && (
                            <div className="flex items-center gap-3">
                              <div className="w-2 h-2 rounded-full bg-[var(--neon-purple)]" />
                              <span className="text-gray-400 text-sm">Shipped</span>
                              <span className="text-gray-600 text-sm ml-auto">
                                {new Date(redemption.shippedAt).toLocaleString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>
                          )}
                          {redemption.deliveredAt && (
                            <div className="flex items-center gap-3">
                              <div className="w-2 h-2 rounded-full bg-[var(--neon-green)]" />
                              <span className="text-gray-400 text-sm">Delivered</span>
                              <span className="text-gray-600 text-sm ml-auto">
                                {new Date(redemption.deliveredAt).toLocaleString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
