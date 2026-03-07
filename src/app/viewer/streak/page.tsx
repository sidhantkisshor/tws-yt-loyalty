'use client'

import { useState } from 'react'
import { useViewer } from '@/components/ViewerProvider'
import { logger } from '@/lib/logger'

const MILESTONES = [
  { day: 7, bonus: 100, label: '1 Week' },
  { day: 14, bonus: 150, label: '2 Weeks' },
  { day: 30, bonus: 400, label: '1 Month' },
  { day: 60, bonus: 800, label: '2 Months' },
  { day: 100, bonus: 1500, label: '100 Days' },
  { day: 200, bonus: 3000, label: '200 Days' },
  { day: 365, bonus: 7500, label: '1 Year' },
]

function getDailyBonus(streak: number): number {
  if (streak <= 1) return 0
  if (streak >= 5) return 25
  return streak * 5
}

export default function StreakPage() {
  const { currentViewerProfile: viewer, activeChannelId, refreshProfile } = useViewer()
  const [activating, setActivating] = useState(false)

  const currentStreak = viewer?.currentStreak ?? 0
  const longestStreak = viewer?.longestStreak ?? 0
  const pauseEndsAt = viewer?.pauseEndsAt ? new Date(viewer.pauseEndsAt) : null
  const isPaused = pauseEndsAt && pauseEndsAt.getTime() > Date.now()
  const shortPausesUsed = viewer?.shortPausesUsedThisMonth ?? 0
  const longPausesUsed = viewer?.longPausesUsedThisMonth ?? 0

  async function activatePause(pauseType: '3day' | '7day') {
    if (!activeChannelId) return
    const cost = pauseType === '7day' ? 500 : 0
    if (cost > 0 && !confirm(`This will cost 500 points. Continue?`)) return

    setActivating(true)
    try {
      const res = await fetch(`/api/viewer/streak/pause?channelId=${activeChannelId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pauseType }),
      })
      if (res.ok) {
        refreshProfile?.()
        alert(`${pauseType === '3day' ? '3-day' : '7-day'} pause activated!`)
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to activate pause')
      }
    } catch (error) {
      logger.error('Error activating pause', error)
    } finally {
      setActivating(false)
    }
  }

  const nextMilestone = MILESTONES.find((m) => m.day > currentStreak)

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="font-[Orbitron] text-3xl font-bold text-white tracking-wider">
          STREAK<span className="text-[var(--neon-orange)]"> TRACKER</span>
        </h1>
        <p className="text-gray-400 mt-2">Keep your streak alive for daily bonuses</p>
      </div>

      {/* Current Streak */}
      <div className="cyber-card rounded-xl p-8 text-center">
        <div className="relative inline-block">
          <div className="w-36 h-36 rounded-full border-4 border-[var(--neon-orange)] flex items-center justify-center mx-auto relative">
            <div className="absolute inset-0 rounded-full border-4 border-[var(--neon-orange)] opacity-30 animate-pulse" />
            <div>
              <p className="font-[Orbitron] text-5xl font-bold text-white">{currentStreak}</p>
              <p className="font-[Orbitron] text-xs text-[var(--neon-orange)] tracking-widest">DAYS</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-8">
          <div>
            <p className="text-gray-500 text-xs uppercase tracking-wider">Longest</p>
            <p className="font-[Orbitron] text-xl text-white">{longestStreak}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs uppercase tracking-wider">Daily Bonus</p>
            <p className="font-[Orbitron] text-xl text-[var(--neon-green)]">+{getDailyBonus(currentStreak)}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs uppercase tracking-wider">Status</p>
            <p className={`font-[Orbitron] text-sm ${isPaused ? 'text-[var(--neon-yellow)]' : 'text-[var(--neon-green)]'}`}>
              {isPaused ? '⏸ PAUSED' : '🔥 ACTIVE'}
            </p>
          </div>
        </div>

        {isPaused && pauseEndsAt && (
          <p className="text-[var(--neon-yellow)] text-sm mt-4">
            Pause ends: {pauseEndsAt.toLocaleDateString()} at {pauseEndsAt.toLocaleTimeString()}
          </p>
        )}
      </div>

      {/* Next Milestone */}
      {nextMilestone && (
        <div className="cyber-card rounded-xl p-6">
          <h2 className="font-[Orbitron] text-sm text-[var(--neon-cyan)] tracking-widest uppercase mb-3">Next Milestone</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-semibold">{nextMilestone.label} ({nextMilestone.day} days)</p>
              <p className="text-[var(--neon-green)] text-sm font-[Orbitron]">+{nextMilestone.bonus} bonus points</p>
            </div>
            <div className="text-right">
              <p className="font-[Orbitron] text-2xl text-white">{nextMilestone.day - currentStreak}</p>
              <p className="text-gray-500 text-xs">days to go</p>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-4 h-2 bg-[var(--cyber-dark)] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[var(--neon-cyan)] to-[var(--neon-purple)] rounded-full transition-all duration-500"
              style={{
                width: `${Math.min((currentStreak / nextMilestone.day) * 100, 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Milestones */}
      <div className="cyber-card rounded-xl p-6">
        <h2 className="font-[Orbitron] text-sm text-[var(--neon-purple)] tracking-widest uppercase mb-4">Milestones</h2>
        <div className="space-y-3">
          {MILESTONES.map((m) => {
            const reached = currentStreak >= m.day
            return (
              <div key={m.day} className={`flex items-center gap-4 p-3 rounded-lg ${reached ? 'bg-[var(--neon-green)]/5' : 'bg-[var(--cyber-dark)]'}`}>
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  reached ? 'bg-[var(--neon-green)] text-[var(--cyber-black)]' : 'bg-[var(--cyber-dark)] border border-[var(--cyber-border)] text-gray-500'
                }`}>
                  {reached ? '✓' : m.day}
                </span>
                <div className="flex-1">
                  <p className={`font-medium ${reached ? 'text-white' : 'text-gray-500'}`}>{m.label}</p>
                  <p className="text-xs text-gray-600">{m.day} consecutive days</p>
                </div>
                <span className={`font-[Orbitron] text-sm ${reached ? 'text-[var(--neon-green)]' : 'text-gray-600'}`}>
                  +{m.bonus} pts
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Pause Controls */}
      <div className="cyber-card rounded-xl p-6">
        <h2 className="font-[Orbitron] text-sm text-[var(--neon-yellow)] tracking-widest uppercase mb-4">Streak Pause</h2>
        <p className="text-gray-400 text-sm mb-4">Take a break without losing your streak.</p>

        <div className="grid gap-4 md:grid-cols-2">
          {/* 3-day pause */}
          <div className="bg-[var(--cyber-dark)] rounded-lg p-4 border border-[var(--cyber-border)]">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-white font-semibold">3-Day Pause</h3>
              <span className="text-[var(--neon-green)] text-xs font-[Orbitron]">FREE</span>
            </div>
            <p className="text-gray-500 text-xs mb-3">{shortPausesUsed}/2 used this month</p>
            <button
              onClick={() => activatePause('3day')}
              disabled={activating || !!isPaused || shortPausesUsed >= 2}
              className="w-full px-4 py-2 bg-[var(--neon-yellow)]/10 border border-[var(--neon-yellow)]/30 text-[var(--neon-yellow)] text-sm rounded-lg hover:bg-[var(--neon-yellow)]/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed font-[Orbitron] tracking-wider"
            >
              {isPaused ? 'Already Paused' : shortPausesUsed >= 2 ? 'Limit Reached' : 'Activate'}
            </button>
          </div>

          {/* 7-day pause */}
          <div className="bg-[var(--cyber-dark)] rounded-lg p-4 border border-[var(--cyber-border)]">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-white font-semibold">7-Day Pause</h3>
              <span className="text-[var(--neon-orange)] text-xs font-[Orbitron]">500 PTS</span>
            </div>
            <p className="text-gray-500 text-xs mb-3">{longPausesUsed}/1 used this month</p>
            <button
              onClick={() => activatePause('7day')}
              disabled={activating || !!isPaused || longPausesUsed >= 1}
              className="w-full px-4 py-2 bg-[var(--neon-orange)]/10 border border-[var(--neon-orange)]/30 text-[var(--neon-orange)] text-sm rounded-lg hover:bg-[var(--neon-orange)]/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed font-[Orbitron] tracking-wider"
            >
              {isPaused ? 'Already Paused' : longPausesUsed >= 1 ? 'Limit Reached' : 'Activate (500 pts)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
