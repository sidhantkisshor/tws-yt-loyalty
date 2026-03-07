'use client'

import { useEffect, useState, useCallback } from 'react'
import { logger } from '@/lib/logger'

interface Homework {
  id: string
  title: string
  content: string
  imageUrl: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  submittedAt: string
  reviewedAt: string | null
  viewer: {
    displayName: string
    rank: string
  }
}

export default function HomeworkReviewPage() {
  const [homework, setHomework] = useState<Homework[]>([])
  const [filter, setFilter] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'>('PENDING')
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [channelId, setChannelId] = useState<string | null>(null)
  const [channels, setChannels] = useState<{ id: string; title: string }[]>([])

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

  useEffect(() => { fetchChannels() }, [fetchChannels])

  const fetchHomework = useCallback(async () => {
    if (!channelId) return
    setLoading(true)
    try {
      const statusParam = filter !== 'ALL' ? `&status=${filter}` : ''
      const res = await fetch(`/api/admin/homework?channelId=${channelId}${statusParam}`)
      if (res.ok) {
        const data = await res.json()
        setHomework(data.submissions || [])
      }
    } catch (error) {
      logger.error('Error fetching homework', error)
    } finally {
      setLoading(false)
    }
  }, [channelId, filter])

  useEffect(() => { fetchHomework() }, [fetchHomework])

  async function handleReview(id: string, status: 'APPROVED' | 'REJECTED') {
    setProcessing(id)
    try {
      const res = await fetch(`/api/admin/homework/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) {
        setHomework((prev) => prev.map((h) =>
          h.id === id ? { ...h, status, reviewedAt: new Date().toISOString() } : h
        ))
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to update')
      }
    } catch (error) {
      logger.error('Error reviewing homework', error)
    } finally {
      setProcessing(null)
    }
  }

  const statusColor: Record<string, string> = {
    PENDING: 'bg-yellow-600',
    APPROVED: 'bg-green-600',
    REJECTED: 'bg-red-600',
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Homework Review</h1>
        <div className="flex items-center gap-3">
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
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm"
          >
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="ALL">All</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-gray-800 rounded-lg p-6 animate-pulse h-32" />
          ))}
        </div>
      ) : homework.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400">No {filter.toLowerCase()} submissions.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {homework.map((item) => (
            <div key={item.id} className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                    <span className={`px-2 py-0.5 text-xs text-white rounded-full ${statusColor[item.status]}`}>
                      {item.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400 mb-1">
                    by <span className="text-gray-300">{item.viewer.displayName}</span>
                    <span className="mx-2">•</span>
                    <span className="text-gray-500">{item.viewer.rank.replace(/_/g, ' ')}</span>
                    <span className="mx-2">•</span>
                    {new Date(item.submittedAt).toLocaleDateString()}
                  </p>
                  <p className="text-gray-300 mt-3 whitespace-pre-wrap">{item.content}</p>
                  {item.imageUrl && (
                    <img src={item.imageUrl} alt="Homework" className="mt-3 max-w-md rounded-lg border border-gray-700" />
                  )}
                </div>
                {item.status === 'PENDING' && (
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handleReview(item.id, 'APPROVED')}
                      disabled={processing === item.id}
                      className="px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50"
                    >
                      {processing === item.id ? '...' : 'Approve (+30 pts)'}
                    </button>
                    <button
                      onClick={() => handleReview(item.id, 'REJECTED')}
                      disabled={processing === item.id}
                      className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
