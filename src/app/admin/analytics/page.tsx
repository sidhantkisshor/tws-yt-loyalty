'use client'

import { useEffect, useState, useCallback } from 'react'
import { logger } from '@/lib/logger'

interface TierData {
  tier: string
  count: number
}

interface SegmentData {
  segment: string
  count: number
}

interface OverviewData {
  totalViewers: number
  activeViewers30d: number
  tierDistribution: TierData[]
  segmentDistribution: SegmentData[]
  pointsEconomy: {
    issued: number
    redeemed: number
    earnToBurnRatio: number
  }
  averageStreak: number
  rewardRedemptions30d: number
}

interface FunnelData {
  tiers: TierData[]
  courseBuyers: number
  premiumCohortBuyers: number
}

const TIER_ORDER = ['PAPER_TRADER', 'RETAIL_TRADER', 'SWING_TRADER', 'FUND_MANAGER', 'MARKET_MAKER', 'HEDGE_FUND', 'WHALE']

const TIER_COLORS: Record<string, string> = {
  PAPER_TRADER: '#6b7280',
  RETAIL_TRADER: '#22c55e',
  SWING_TRADER: '#3b82f6',
  FUND_MANAGER: '#a855f7',
  MARKET_MAKER: '#fbbf24',
  HEDGE_FUND: '#06b6d4',
  WHALE: '#ec4899',
}

const SEGMENT_LABELS: Record<string, string> = {
  warming_lead: 'Warming Lead',
  hot_lead: 'Hot Lead',
  at_risk: 'At-Risk Fan',
  superfan: 'Superfan',
  whale_candidate: 'Whale Candidate',
  UNASSIGNED: 'Unassigned',
}

const SEGMENT_COLORS: Record<string, string> = {
  warming_lead: '#f59e0b',
  hot_lead: '#ef4444',
  at_risk: '#6b7280',
  superfan: '#a855f7',
  whale_candidate: '#ec4899',
  UNASSIGNED: '#374151',
}

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'funnel'>('overview')
  const [channelId, setChannelId] = useState<string | null>(null)
  const [channels, setChannels] = useState<{ id: string; title: string }[]>([])
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [funnel, setFunnel] = useState<FunnelData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch('/api/channels')
      if (res.ok) {
        const data = await res.json()
        setChannels(data.channels || [])
        if (data.channels?.length > 0 && !channelId) {
          setChannelId(data.channels[0].id)
        }
      }
    } catch (error) {
      logger.error('Error fetching channels', error)
    }
  }, [channelId])

  useEffect(() => {
    fetchChannels()
  }, [fetchChannels])

  const fetchAnalytics = useCallback(async () => {
    if (!channelId) return
    setLoading(true)
    try {
      const [overviewRes, funnelRes] = await Promise.all([
        fetch(`/api/admin/analytics/overview?channelId=${channelId}`),
        fetch(`/api/admin/analytics/funnel?channelId=${channelId}`),
      ])

      if (overviewRes.ok) {
        setOverview(await overviewRes.json())
      }
      if (funnelRes.ok) {
        setFunnel(await funnelRes.json())
      }
    } catch (error) {
      logger.error('Error fetching analytics', error)
    } finally {
      setLoading(false)
    }
  }, [channelId])

  useEffect(() => {
    fetchAnalytics()
  }, [fetchAnalytics])

  function formatNumber(n: number): string {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
    return n.toLocaleString()
  }

  function getEconomyHealth(ratio: number): { label: string; color: string } {
    if (ratio < 0.4) return { label: 'Rewards too expensive', color: 'text-red-400' }
    if (ratio > 0.9) return { label: 'Rewards too cheap', color: 'text-yellow-400' }
    return { label: 'Healthy', color: 'text-green-400' }
  }

  const sortedTiers = overview?.tierDistribution
    ? [...overview.tierDistribution].sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier))
    : []

  const totalTierViewers = sortedTiers.reduce((sum, t) => sum + t.count, 0)

  const funnelTiers = funnel?.tiers
    ? [...funnel.tiers].sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier))
    : []

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        <div className="flex items-center gap-4">
          {channels.length > 1 && (
            <select
              value={channelId || ''}
              onChange={(e) => setChannelId(e.target.value)}
              className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm"
            >
              {channels.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          )}
          <div className="flex bg-gray-800 rounded-md">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 text-sm rounded-md ${activeTab === 'overview' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('funnel')}
              className={`px-4 py-2 text-sm rounded-md ${activeTab === 'funnel' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Funnel
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-gray-800 rounded-lg p-6 animate-pulse h-28" />
          ))}
        </div>
      ) : activeTab === 'overview' && overview ? (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <p className="text-gray-400 text-sm">Total Viewers</p>
              <p className="text-3xl font-bold text-white mt-1">{formatNumber(overview.totalViewers)}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <p className="text-gray-400 text-sm">Active (30d)</p>
              <p className="text-3xl font-bold text-green-400 mt-1">{formatNumber(overview.activeViewers30d)}</p>
              <p className="text-xs text-gray-500 mt-1">
                {overview.totalViewers > 0 ? Math.round((overview.activeViewers30d / overview.totalViewers) * 100) : 0}% of total
              </p>
            </div>
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <p className="text-gray-400 text-sm">Avg Streak</p>
              <p className="text-3xl font-bold text-yellow-400 mt-1">{overview.averageStreak}</p>
              <p className="text-xs text-gray-500 mt-1">days</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <p className="text-gray-400 text-sm">Redemptions (30d)</p>
              <p className="text-3xl font-bold text-purple-400 mt-1">{formatNumber(overview.rewardRedemptions30d)}</p>
            </div>
          </div>

          {/* Points Economy */}
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-lg font-semibold text-white mb-4">Points Economy</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-gray-400 text-sm">Points Issued</p>
                <p className="text-2xl font-bold text-green-400">{formatNumber(overview.pointsEconomy.issued)}</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Points Redeemed</p>
                <p className="text-2xl font-bold text-red-400">{formatNumber(overview.pointsEconomy.redeemed)}</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Earn-to-Burn Ratio</p>
                <p className="text-2xl font-bold text-white">{overview.pointsEconomy.earnToBurnRatio}x</p>
                {(() => {
                  const redemptionRate = overview.pointsEconomy.issued > 0
                    ? overview.pointsEconomy.redeemed / overview.pointsEconomy.issued
                    : 0
                  const health = getEconomyHealth(redemptionRate)
                  return <p className={`text-xs mt-1 ${health.color}`}>{health.label} ({Math.round(redemptionRate * 100)}% redemption)</p>
                })()}
              </div>
            </div>
          </div>

          {/* Tier Distribution */}
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-lg font-semibold text-white mb-4">Tier Distribution</h2>
            <div className="space-y-3">
              {sortedTiers.map((tier) => {
                const pct = totalTierViewers > 0 ? (tier.count / totalTierViewers) * 100 : 0
                return (
                  <div key={tier.tier} className="flex items-center gap-4">
                    <span className="text-sm text-gray-300 w-36 truncate">{tier.tier.replace(/_/g, ' ')}</span>
                    <div className="flex-1 h-6 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: TIER_COLORS[tier.tier] || '#6b7280' }}
                      />
                    </div>
                    <span className="text-sm text-gray-400 w-20 text-right">{tier.count} ({Math.round(pct)}%)</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Segment Distribution */}
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-lg font-semibold text-white mb-4">Viewer Segments</h2>
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
              {overview.segmentDistribution.map((seg) => (
                <div key={seg.segment} className="text-center p-4 bg-gray-700 rounded-lg">
                  <div
                    className="w-3 h-3 rounded-full mx-auto mb-2"
                    style={{ backgroundColor: SEGMENT_COLORS[seg.segment] || '#374151' }}
                  />
                  <p className="text-2xl font-bold text-white">{seg.count}</p>
                  <p className="text-xs text-gray-400 mt-1">{SEGMENT_LABELS[seg.segment] || seg.segment}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : activeTab === 'funnel' && funnel ? (
        <div className="space-y-6">
          {/* Funnel Visualization */}
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-lg font-semibold text-white mb-6">Conversion Funnel</h2>
            <div className="space-y-2 max-w-2xl mx-auto">
              {funnelTiers.map((tier, i) => {
                const maxCount = funnelTiers[0]?.count || 1
                const widthPct = Math.max((tier.count / maxCount) * 100, 15)
                return (
                  <div key={tier.tier} className="flex items-center gap-4">
                    <span className="text-sm text-gray-300 w-36 truncate text-right">{tier.tier.replace(/_/g, ' ')}</span>
                    <div className="flex-1">
                      <div
                        className="h-10 rounded flex items-center px-3 transition-all duration-500"
                        style={{
                          width: `${widthPct}%`,
                          backgroundColor: TIER_COLORS[tier.tier] || '#6b7280',
                        }}
                      >
                        <span className="text-sm font-bold text-white">{tier.count}</span>
                      </div>
                    </div>
                    {i > 0 && funnelTiers[i - 1].count > 0 && (
                      <span className="text-xs text-gray-500 w-16">
                        {Math.round((tier.count / funnelTiers[i - 1].count) * 100)}% conv.
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Buyer Stats */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <p className="text-gray-400 text-sm">Course Buyers</p>
              <p className="text-3xl font-bold text-green-400 mt-1">{funnel.courseBuyers}</p>
              <p className="text-xs text-gray-500 mt-1">
                {overview && overview.totalViewers > 0
                  ? `${Math.round((funnel.courseBuyers / overview.totalViewers) * 100)}% of viewers`
                  : ''}
              </p>
            </div>
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <p className="text-gray-400 text-sm">Premium Cohort Buyers</p>
              <p className="text-3xl font-bold text-pink-400 mt-1">{funnel.premiumCohortBuyers}</p>
              <p className="text-xs text-gray-500 mt-1">
                {overview && overview.totalViewers > 0
                  ? `${Math.round((funnel.premiumCohortBuyers / overview.totalViewers) * 100)}% of viewers`
                  : ''}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400">No analytics data available. Add a channel first.</p>
        </div>
      )}
    </div>
  )
}
