'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { logger } from '@/lib/logger'

interface Stream {
  id: string
  title: string
  thumbnailUrl: string | null
  status: string
  youtubeVideoId: string
  actualStartAt: string | null
  endedAt: string | null
  totalPointsAwarded: number
  totalCodesGenerated: number
  channel: {
    title: string
    thumbnailUrl: string | null
  }
  _count: {
    loyaltyCodes: number
    streamAttendances: number
  }
}

interface Channel {
  id: string
  title: string
}

export default function StreamsPage() {
  const [streams, setStreams] = useState<Stream[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [newStreamUrl, setNewStreamUrl] = useState('')
  const [selectedChannel, setSelectedChannel] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    try {
      const [streamsRes, channelsRes] = await Promise.all([
        fetch('/api/streams'),
        fetch('/api/channels'),
      ])

      if (streamsRes.ok) {
        const data = await streamsRes.json()
        setStreams(data.streams)
      }

      if (channelsRes.ok) {
        const data = await channelsRes.json()
        setChannels(data.channels)
        if (data.channels.length > 0) {
          setSelectedChannel(data.channels[0].id)
        }
      }
    } catch (error) {
      logger.error('Error fetching data', error)
    } finally {
      setLoading(false)
    }
  }

  async function createStream() {
    if (!newStreamUrl || !selectedChannel) return

    setCreating(true)
    try {
      const res = await fetch('/api/streams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: selectedChannel,
          youtubeUrl: newStreamUrl,
        }),
      })

      if (res.ok) {
        setShowModal(false)
        setNewStreamUrl('')
        fetchData()
      } else {
        const error = await res.json()
        alert(error.error || 'Failed to create stream')
      }
    } catch (error) {
      logger.error('Error creating stream', error)
    } finally {
      setCreating(false)
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'LIVE':
        return 'bg-green-600'
      case 'SCHEDULED':
        return 'bg-yellow-600'
      case 'ENDED':
        return 'bg-gray-600'
      case 'CANCELLED':
        return 'bg-red-600'
      default:
        return 'bg-gray-600'
    }
  }

  if (loading) {
    return <div className="text-white">Loading...</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Streams</h1>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
        >
          Add Stream
        </button>
      </div>

      {/* Streams List */}
      {streams.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400 mb-4">No streams yet.</p>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            Add Your First Stream
          </button>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Stream
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Participants
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Points
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Codes
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {streams.map((stream) => (
                <tr key={stream.id} className="hover:bg-gray-700">
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3">
                      {stream.thumbnailUrl && (
                        <img
                          src={stream.thumbnailUrl}
                          alt=""
                          className="h-10 w-16 rounded object-cover"
                        />
                      )}
                      <div>
                        <p className="text-white font-medium">{stream.title}</p>
                        <p className="text-gray-400 text-sm">
                          {stream.channel.title}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 text-xs text-white rounded-full ${getStatusColor(
                        stream.status
                      )}`}
                    >
                      {stream.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-300">
                    {stream._count.streamAttendances}
                  </td>
                  <td className="px-6 py-4 text-gray-300">
                    {stream.totalPointsAwarded.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-gray-300">
                    {stream._count.loyaltyCodes}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/admin/streams/${stream.id}`}
                      className="text-red-500 hover:text-red-400"
                    >
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Stream Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-white mb-4">Add Stream</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Channel
                </label>
                <select
                  value={selectedChannel}
                  onChange={(e) => setSelectedChannel(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                >
                  {channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  YouTube URL or Video ID
                </label>
                <input
                  type="text"
                  value={newStreamUrl}
                  onChange={(e) => setNewStreamUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=... or dQw4w9WgXcQ"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-gray-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={createStream}
                disabled={creating || !newStreamUrl || !selectedChannel}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Add Stream'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
