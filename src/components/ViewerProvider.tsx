'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { SessionProvider, useSession } from 'next-auth/react'

interface ChannelOption {
  channelId: string
  channelTitle: string
  viewerId: string
}

interface ViewerProfile {
  id: string
  displayName: string
  profileImageUrl: string | null
  totalPoints: number
  availablePoints: number
  rank: string
  currentStreak: number
  longestStreak: number
  streakPauseEndsAt: string | null
  shortPausesUsedThisMonth: number
  longPausesUsedThisMonth: number
  referralCode: string | null
  referralCount: number
  channel: {
    id: string
    title: string
    thumbnailUrl: string | null
  }
}

interface ViewerContextType {
  activeChannelId: string | null
  setActiveChannelId: (id: string) => void
  availableChannels: ChannelOption[]
  currentViewerProfile: ViewerProfile | null
  loading: boolean
  refreshProfile?: () => void
}

const ViewerContext = createContext<ViewerContextType | undefined>(undefined)

export function useViewer() {
  const context = useContext(ViewerContext)
  if (context === undefined) {
    throw new Error('useViewer must be used within a ViewerProvider')
  }
  return context
}

function ViewerContextWrapper({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession()
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null)
  const [availableChannels, setAvailableChannels] = useState<ChannelOption[]>([])
  const [currentViewerProfile, setCurrentViewerProfile] = useState<ViewerProfile | null>(null)
  const [loading, setLoading] = useState(false)

  // Initialize active channel from session
  const initializeChannel = useCallback(() => {
    if (session?.viewer?.channelId && !activeChannelId) {
      setActiveChannelId(session.viewer.channelId)
    }
  }, [session?.viewer?.channelId, activeChannelId])

  useEffect(() => {
    initializeChannel()
  }, [initializeChannel])

  // Fetch available channels
  const fetchChannels = useCallback(async () => {
    if (!session?.viewerId) return
    try {
      const res = await fetch('/api/viewer/channels')
      const data = await res.json()
      if (data.channels) {
        setAvailableChannels(data.channels)
      }
    } catch (err) {
      console.error('Failed to fetch channels', err)
    }
  }, [session?.viewerId])

  useEffect(() => {
    fetchChannels()
  }, [fetchChannels])

  // Fetch profile when active channel changes
  const fetchProfile = useCallback(async () => {
    if (!activeChannelId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/viewer/me?channelId=${activeChannelId}`)
      const data = await res.json()
      if (data.viewer) {
        setCurrentViewerProfile(data.viewer)
      }
    } catch (err) {
      console.error('Failed to fetch profile', err)
    } finally {
      setLoading(false)
    }
  }, [activeChannelId])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  return (
    <ViewerContext.Provider value={{
      activeChannelId,
      setActiveChannelId,
      availableChannels,
      currentViewerProfile,
      loading,
      refreshProfile: fetchProfile,
    }}>
      {children}
    </ViewerContext.Provider>
  )
}

export default function ViewerProvider({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SessionProvider basePath="/api/viewer-auth">
      <ViewerContextWrapper>
        {children}
      </ViewerContextWrapper>
    </SessionProvider>
  )
}
