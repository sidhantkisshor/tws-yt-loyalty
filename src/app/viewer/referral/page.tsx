'use client'

import { useEffect, useState, useCallback } from 'react'
import { useViewer } from '@/components/ViewerProvider'
import { logger } from '@/lib/logger'

interface ReferralData {
  referralCode: string
  referralCount: number
}

export default function ReferralPage() {
  const { activeChannelId } = useViewer()
  const [data, setData] = useState<ReferralData | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  const fetchReferral = useCallback(async () => {
    if (!activeChannelId) return
    try {
      const res = await fetch(`/api/viewer/referral?channelId=${activeChannelId}`)
      if (res.ok) {
        setData(await res.json())
      }
    } catch (error) {
      logger.error('Error fetching referral', error)
    } finally {
      setLoading(false)
    }
  }, [activeChannelId])

  useEffect(() => { fetchReferral() }, [fetchReferral])

  function getReferralLink(): string {
    if (!data) return ''
    return `${typeof window !== 'undefined' ? window.location.origin : ''}/viewer/signin?ref=${data.referralCode}`
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-12 h-12 relative">
          <div className="absolute inset-0 border-4 border-[var(--neon-cyan)] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="font-[Orbitron] text-3xl font-bold text-white tracking-wider">
          REFER<span className="text-[var(--neon-cyan)]">RALS</span>
        </h1>
        <p className="text-gray-400 mt-2">Invite friends and earn bonus points together</p>
      </div>

      {/* Referral Code Card */}
      <div className="cyber-card rounded-xl p-8">
        <h2 className="font-[Orbitron] text-sm text-[var(--neon-cyan)] tracking-widest uppercase mb-4">Your Referral Code</h2>
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 bg-[var(--cyber-dark)] border border-[var(--cyber-border)] rounded-lg px-6 py-4">
            <span className="font-[Orbitron] text-2xl text-white tracking-[0.3em]">
              {data?.referralCode || '---'}
            </span>
          </div>
          <button
            onClick={() => data && copyToClipboard(data.referralCode)}
            className="px-4 py-4 bg-[var(--neon-cyan)]/10 border border-[var(--neon-cyan)]/30 rounded-lg text-[var(--neon-cyan)] hover:bg-[var(--neon-cyan)]/20 transition-colors"
          >
            {copied ? '✓' : '📋'}
          </button>
        </div>

        {/* Referral Link */}
        <h2 className="font-[Orbitron] text-sm text-[var(--neon-purple)] tracking-widest uppercase mb-3">Share Link</h2>
        <div className="flex items-center gap-3">
          <input
            readOnly
            value={getReferralLink()}
            className="flex-1 bg-[var(--cyber-dark)] border border-[var(--cyber-border)] rounded-lg px-4 py-3 text-gray-300 text-sm font-mono truncate"
          />
          <button
            onClick={() => copyToClipboard(getReferralLink())}
            className="px-6 py-3 bg-gradient-to-r from-[var(--neon-cyan)] to-[var(--neon-purple)] text-[var(--cyber-black)] font-[Orbitron] text-sm font-bold rounded-lg hover:opacity-90 transition-opacity"
          >
            Copy Link
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="cyber-card rounded-xl p-6">
        <h2 className="font-[Orbitron] text-sm text-[var(--neon-green)] tracking-widest uppercase mb-4">Referral Stats</h2>
        <div className="text-center py-4">
          <p className="font-[Orbitron] text-5xl font-bold text-white">{data?.referralCount || 0}</p>
          <p className="text-gray-400 text-sm mt-2">Friends Referred</p>
        </div>
      </div>

      {/* How it Works */}
      <div className="cyber-card rounded-xl p-6">
        <h2 className="font-[Orbitron] text-sm text-[var(--neon-yellow)] tracking-widest uppercase mb-4">How It Works</h2>
        <div className="space-y-4">
          {[
            { step: '01', title: 'Share your link', desc: 'Send your unique referral link to a friend', pts: '' },
            { step: '02', title: 'They sign up & attend', desc: 'Friend creates an account and attends a stream', pts: '+50 pts for you, +25 pts for them' },
            { step: '03', title: 'They reach Retail Trader', desc: 'When your friend hits Retail Trader tier', pts: '+100 pts for you' },
            { step: '04', title: 'They buy a course', desc: 'Friend purchases any course', pts: '+500 pts for you, 5% discount for them' },
          ].map((item) => (
            <div key={item.step} className="flex items-start gap-4">
              <span className="font-[Orbitron] text-[var(--neon-cyan)] text-sm font-bold">{item.step}</span>
              <div className="flex-1">
                <p className="text-white font-medium">{item.title}</p>
                <p className="text-gray-500 text-sm">{item.desc}</p>
              </div>
              {item.pts && (
                <span className="text-[var(--neon-green)] text-xs font-[Orbitron]">{item.pts}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
