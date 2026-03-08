'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { logger } from '@/lib/logger'

interface Channel {
  id: string
  title: string
  thumbnailUrl: string | null
  _count: {
    streams: number
    viewers: number
  }
}

interface Stream {
  id: string
  title: string
  status: string
  totalPointsAwarded: number
  _count: {
    streamAttendances: number
  }
}

export default function AdminDashboard() {
  const { data: session } = useSession()
  const [channels, setChannels] = useState<Channel[]>([])
  const [streams, setStreams] = useState<Stream[]>([])
  const [loading, setLoading] = useState(true)
  const [addingChannel, setAddingChannel] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    try {
      const [channelsRes, streamsRes] = await Promise.all([
        fetch('/api/channels'),
        fetch('/api/streams?status=LIVE'),
      ])

      if (channelsRes.ok) {
        const data = await channelsRes.json()
        setChannels(data.channels)
      }

      if (streamsRes.ok) {
        const data = await streamsRes.json()
        setStreams(data.streams)
      }
    } catch (error) {
      logger.error('Error fetching data', error)
    } finally {
      setLoading(false)
    }
  }

  async function addChannel() {
    setAddingChannel(true)
    try {
      const res = await fetch('/api/channels', { method: 'POST' })
      if (res.ok) {
        fetchData()
      } else {
        const error = await res.json()
        alert(error.error || 'Failed to add channel')
      }
    } catch (error) {
      logger.error('Error adding channel', error)
    } finally {
      setAddingChannel(false)
    }
  }

  if (loading) {
    return (
      <div className="text-white">Loading...</div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 mt-1">
          Welcome back, {session?.user?.name}
        </p>
      </div>

      {/* Channels Section */}
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Your Channels</h2>
          <button
            onClick={addChannel}
            disabled={addingChannel}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
          >
            {addingChannel ? 'Adding...' : 'Connect YouTube Channel'}
          </button>
        </div>

        {channels.length === 0 ? (
          <p className="text-gray-400">
            No channels connected. Click the button above to connect your YouTube channel.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {channels.map((channel) => (
              <div
                key={channel.id}
                className="bg-gray-700 rounded-lg p-4 flex items-center space-x-4"
              >
                {channel.thumbnailUrl && (
                  <img
                    src={channel.thumbnailUrl}
                    alt=""
                    className="h-12 w-12 rounded-full"
                  />
                )}
                <div>
                  <h3 className="text-white font-medium">{channel.title}</h3>
                  <p className="text-gray-400 text-sm">
                    {channel._count.streams} streams &bull; {channel._count.viewers} viewers
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Live Streams Section */}
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Live Streams</h2>
          <Link
            href="/admin/streams"
            className="text-red-500 hover:text-red-400 text-sm"
          >
            View all streams →
          </Link>
        </div>

        {streams.length === 0 ? (
          <p className="text-gray-400">
            No live streams at the moment.{' '}
            <Link href="/admin/streams" className="text-red-500 hover:underline">
              Start a new stream
            </Link>
          </p>
        ) : (
          <div className="space-y-3">
            {streams.map((stream) => (
              <Link
                key={stream.id}
                href={`/admin/streams/${stream.id}`}
                className="block bg-gray-700 rounded-lg p-4 hover:bg-gray-600 transition"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-white font-medium">{stream.title}</h3>
                    <p className="text-gray-400 text-sm">
                      {stream._count.streamAttendances} participants &bull;{' '}
                      {stream.totalPointsAwarded.toLocaleString()} points awarded
                    </p>
                  </div>
                  <span className="px-2 py-1 bg-green-600 text-white text-xs rounded-full">
                    LIVE
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="bg-gray-800 rounded-lg p-6">
          <p className="text-gray-400 text-sm">Total Channels</p>
          <p className="text-3xl font-bold text-white">{channels.length}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <p className="text-gray-400 text-sm">Live Streams</p>
          <p className="text-3xl font-bold text-green-500">{streams.length}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <p className="text-gray-400 text-sm">Total Viewers</p>
          <p className="text-3xl font-bold text-white">
            {channels.reduce((sum, c) => sum + c._count.viewers, 0)}
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <p className="text-gray-400 text-sm">Total Streams</p>
          <p className="text-3xl font-bold text-white">
            {channels.reduce((sum, c) => sum + c._count.streams, 0)}
          </p>
        </div>
      </div>
    </div>
  )
}
