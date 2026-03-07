'use client'

import { useEffect, useState, useCallback } from 'react'
import { useViewer } from '@/components/ViewerProvider'
import { logger } from '@/lib/logger'

interface Homework {
  id: string
  title: string
  content: string
  imageUrl: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  submittedAt: string
  reviewedAt: string | null
}

export default function HomeworkPage() {
  const { activeChannelId } = useViewer()
  const [submissions, setSubmissions] = useState<Homework[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [imageUrl, setImageUrl] = useState('')

  const fetchHomework = useCallback(async () => {
    if (!activeChannelId) return
    try {
      const res = await fetch(`/api/viewer/homework?channelId=${activeChannelId}`)
      if (res.ok) {
        const data = await res.json()
        setSubmissions(data.submissions || [])
      }
    } catch (error) {
      logger.error('Error fetching homework', error)
    } finally {
      setLoading(false)
    }
  }, [activeChannelId])

  useEffect(() => { fetchHomework() }, [fetchHomework])

  async function handleSubmit() {
    if (!title.trim() || !content.trim() || !activeChannelId) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/viewer/homework', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: activeChannelId,
          title: title.trim(),
          content: content.trim(),
          imageUrl: imageUrl.trim() || null,
        }),
      })
      if (res.ok) {
        setShowForm(false)
        setTitle('')
        setContent('')
        setImageUrl('')
        fetchHomework()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to submit')
      }
    } catch (error) {
      logger.error('Error submitting homework', error)
    } finally {
      setSubmitting(false)
    }
  }

  const statusStyle: Record<string, { bg: string; text: string; label: string }> = {
    PENDING: { bg: 'bg-[var(--neon-yellow)]/10', text: 'text-[var(--neon-yellow)]', label: 'Pending Review' },
    APPROVED: { bg: 'bg-[var(--neon-green)]/10', text: 'text-[var(--neon-green)]', label: 'Approved +30 pts' },
    REJECTED: { bg: 'bg-[var(--neon-pink)]/10', text: 'text-[var(--neon-pink)]', label: 'Rejected' },
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
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-[Orbitron] text-3xl font-bold text-white tracking-wider">
            HOME<span className="text-[var(--neon-purple)]">WORK</span>
          </h1>
          <p className="text-gray-400 mt-1">Submit your trading homework for review</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-6 py-3 bg-gradient-to-r from-[var(--neon-purple)] to-[var(--neon-pink)] text-white font-[Orbitron] text-sm font-bold rounded-lg hover:opacity-90 transition-opacity"
        >
          {showForm ? 'Cancel' : '+ Submit'}
        </button>
      </div>

      {/* Submission Form */}
      {showForm && (
        <div className="cyber-card rounded-xl p-6 border border-[var(--neon-purple)]/30">
          <h2 className="font-[Orbitron] text-sm text-[var(--neon-purple)] tracking-widest uppercase mb-4">New Submission</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., NIFTY Analysis - March 7"
                className="w-full px-4 py-3 bg-[var(--cyber-dark)] border border-[var(--cyber-border)] rounded-lg text-white focus:border-[var(--neon-purple)] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Content</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Share your analysis, journal entry, or trade review..."
                rows={6}
                className="w-full px-4 py-3 bg-[var(--cyber-dark)] border border-[var(--cyber-border)] rounded-lg text-white focus:border-[var(--neon-purple)] focus:outline-none resize-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Chart/Image URL (optional)</label>
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-4 py-3 bg-[var(--cyber-dark)] border border-[var(--cyber-border)] rounded-lg text-white focus:border-[var(--neon-purple)] focus:outline-none"
              />
            </div>
            <button
              onClick={handleSubmit}
              disabled={submitting || !title.trim() || !content.trim()}
              className="w-full px-6 py-3 bg-gradient-to-r from-[var(--neon-purple)] to-[var(--neon-pink)] text-white font-[Orbitron] text-sm font-bold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit for Review'}
            </button>
          </div>
        </div>
      )}

      {/* Submissions List */}
      {submissions.length === 0 ? (
        <div className="cyber-card rounded-xl p-12 text-center">
          <p className="text-gray-400 mb-2">No submissions yet.</p>
          <p className="text-gray-500 text-sm">Submit your trading homework to earn 30 points per approved entry.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {submissions.map((item) => {
            const style = statusStyle[item.status]
            return (
              <div key={item.id} className="cyber-card rounded-xl p-6">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                  <span className={`px-3 py-1 rounded-full text-xs font-[Orbitron] tracking-wider ${style.bg} ${style.text}`}>
                    {style.label}
                  </span>
                </div>
                <p className="text-gray-300 whitespace-pre-wrap text-sm">{item.content}</p>
                {item.imageUrl && (
                  <img src={item.imageUrl} alt="Chart" className="mt-3 max-w-full rounded-lg border border-[var(--cyber-border)]" />
                )}
                <p className="text-gray-500 text-xs mt-3">
                  Submitted {new Date(item.submittedAt).toLocaleDateString()}
                  {item.reviewedAt && ` • Reviewed ${new Date(item.reviewedAt).toLocaleDateString()}`}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
