import { google } from 'googleapis'
import { incrementQuota, incrementGlobalQuota, getQuotaUsage, redis } from './redis'
import { env } from './env'
import { logger } from './logger'

// Initialize YouTube API client
const youtube = google.youtube('v3')

// Cache TTLs
const LIVE_CHAT_ID_CACHE_TTL = 3600 // 1 hour (rarely changes during a stream)
const VIDEO_INFO_CACHE_TTL = 300 // 5 minutes (for live status checks)

// Quota costs for different operations
const QUOTA_COSTS = {
  LIST: 1,
  INSERT: 50,
  UPDATE: 50,
  DELETE: 50,
} as const

export interface YouTubeCredentials {
  accessToken: string
  refreshToken: string
  expiresAt?: Date
}

export interface LiveChatMessage {
  id: string
  authorChannelId: string
  authorDisplayName: string
  authorProfileImageUrl: string
  authorIsChatOwner: boolean
  authorIsChatModerator: boolean
  authorIsChatSponsor: boolean
  messageText: string
  publishedAt: Date
  messageType: string
  superChatAmount?: number
  superChatCurrency?: string
}

export interface LiveChatPollResult {
  messages: LiveChatMessage[]
  nextPageToken?: string
  pollingIntervalMillis: number
  quotaUsed: number
}

/**
 * Create an authenticated OAuth2 client
 */
export function createOAuth2Client(credentials?: YouTubeCredentials) {
  const oauth2Client = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    `${env.NEXTAUTH_URL}/api/auth/callback/google`
  )

  if (credentials) {
    oauth2Client.setCredentials({
      access_token: credentials.accessToken,
      refresh_token: credentials.refreshToken,
      expiry_date: credentials.expiresAt?.getTime(),
    })
  }

  return oauth2Client
}

/**
 * Get live chat ID from a video ID (with Redis caching)
 */
export async function getLiveChatId(
  videoId: string,
  channelId: string,
  credentials: YouTubeCredentials
): Promise<string | null> {
  const cacheKey = `youtube:liveChatId:${videoId}`

  // Check cache first
  const cached = await redis.get<string>(cacheKey)
  if (cached) {
    return cached
  }

  const auth = createOAuth2Client(credentials)

  try {
    const response = await youtube.videos.list({
      auth,
      part: ['liveStreamingDetails'],
      id: [videoId],
    })

    // Track quota
    await incrementQuota(channelId, QUOTA_COSTS.LIST)
    await incrementGlobalQuota(QUOTA_COSTS.LIST)

    const video = response.data.items?.[0]
    const liveChatId = video?.liveStreamingDetails?.activeLiveChatId ?? null

    // Cache the result if found
    if (liveChatId) {
      await redis.set(cacheKey, liveChatId, { ex: LIVE_CHAT_ID_CACHE_TTL })
    }

    return liveChatId
  } catch (error) {
    logger.error('Error getting live chat ID', error, {
      videoId,
      channelId,
    })
    throw error
  }
}

/**
 * Poll live chat messages with exponential backoff for rate limit errors
 */
export async function pollLiveChatMessages(
  liveChatId: string,
  channelId: string,
  credentials: YouTubeCredentials,
  pageToken?: string
): Promise<LiveChatPollResult> {
  const auth = createOAuth2Client(credentials)
  const maxRetries = 3
  const baseDelayMs = 1000

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await youtube.liveChatMessages.list({
        auth,
        liveChatId,
        part: ['snippet', 'authorDetails'],
        maxResults: 200,
        pageToken,
      })

      // Track quota
      await incrementQuota(channelId, QUOTA_COSTS.LIST)
      await incrementGlobalQuota(QUOTA_COSTS.LIST)

      const messages: LiveChatMessage[] = (response.data.items ?? []).map((item) => ({
        id: item.id!,
        authorChannelId: item.authorDetails?.channelId ?? '',
        authorDisplayName: item.authorDetails?.displayName ?? 'Unknown',
        authorProfileImageUrl: item.authorDetails?.profileImageUrl ?? '',
        authorIsChatOwner: item.authorDetails?.isChatOwner ?? false,
        authorIsChatModerator: item.authorDetails?.isChatModerator ?? false,
        authorIsChatSponsor: item.authorDetails?.isChatSponsor ?? false,
        messageText: item.snippet?.displayMessage ?? '',
        publishedAt: new Date(item.snippet?.publishedAt ?? Date.now()),
        messageType: item.snippet?.type ?? 'textMessageEvent',
        superChatAmount: item.snippet?.superChatDetails?.amountMicros
          ? parseInt(item.snippet.superChatDetails.amountMicros) / 1000000
          : undefined,
        superChatCurrency: item.snippet?.superChatDetails?.currency ?? undefined,
      }))

      return {
        messages,
        nextPageToken: response.data.nextPageToken ?? undefined,
        pollingIntervalMillis: response.data.pollingIntervalMillis ?? 4000,
        quotaUsed: QUOTA_COSTS.LIST,
      }
    } catch (error) {
      const isRateLimitError =
        error instanceof Error &&
        ('code' in error && (error as { code?: number }).code === 429)

      if (isRateLimitError && attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const delayMs = baseDelayMs * Math.pow(2, attempt)
        logger.warn(`Rate limited, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`, {
          liveChatId,
          channelId,
        })
        await new Promise((resolve) => setTimeout(resolve, delayMs))
        continue
      }

      logger.error('Error polling live chat', error, {
        liveChatId,
        channelId,
        attempt,
      })
      throw error
    }
  }

  // Should never reach here, but TypeScript needs this
  throw new Error('Max retries exceeded')
}

/**
 * Post a message to live chat (for announcing codes)
 */
export async function postLiveChatMessage(
  liveChatId: string,
  message: string,
  channelId: string,
  credentials: YouTubeCredentials
): Promise<boolean> {
  const auth = createOAuth2Client(credentials)

  try {
    await youtube.liveChatMessages.insert({
      auth,
      part: ['snippet'],
      requestBody: {
        snippet: {
          liveChatId,
          type: 'textMessageEvent',
          textMessageDetails: {
            messageText: message,
          },
        },
      },
    })

    // Track quota (insert costs 50 units)
    await incrementQuota(channelId, QUOTA_COSTS.INSERT)
    await incrementGlobalQuota(QUOTA_COSTS.INSERT)

    return true
  } catch (error) {
    logger.error('Error posting to live chat', error, {
      liveChatId,
      channelId,
    })
    return false
  }
}

/**
 * Get channel info from YouTube
 */
export async function getChannelInfo(
  credentials: YouTubeCredentials
): Promise<{ id: string; title: string; thumbnailUrl: string } | null> {
  const auth = createOAuth2Client(credentials)

  try {
    const response = await youtube.channels.list({
      auth,
      part: ['snippet'],
      mine: true,
    })

    // Note: This uses quota but we don't track it to a specific channel yet
    await incrementGlobalQuota(QUOTA_COSTS.LIST)

    const channel = response.data.items?.[0]
    if (!channel) return null

    return {
      id: channel.id!,
      title: channel.snippet?.title ?? 'Unknown Channel',
      thumbnailUrl: channel.snippet?.thumbnails?.default?.url ?? '',
    }
  } catch (error) {
    logger.error('Error getting channel info', error)
    throw error
  }
}

/**
 * Get video info from YouTube (with Redis caching)
 */
export async function getVideoInfo(
  videoId: string,
  credentials: YouTubeCredentials
): Promise<{
  title: string
  thumbnailUrl: string
  isLive: boolean
  liveChatId?: string
} | null> {
  const cacheKey = `youtube:videoInfo:${videoId}`

  // Check cache first
  const cached = await redis.get<string>(cacheKey)
  if (cached) {
    return JSON.parse(cached)
  }

  const auth = createOAuth2Client(credentials)

  try {
    const response = await youtube.videos.list({
      auth,
      part: ['snippet', 'liveStreamingDetails'],
      id: [videoId],
    })

    await incrementGlobalQuota(QUOTA_COSTS.LIST)

    const video = response.data.items?.[0]
    if (!video) return null

    const result = {
      title: video.snippet?.title ?? 'Unknown Video',
      thumbnailUrl: video.snippet?.thumbnails?.medium?.url ?? '',
      isLive: video.snippet?.liveBroadcastContent === 'live',
      liveChatId: video.liveStreamingDetails?.activeLiveChatId ?? undefined,
    }

    // Cache the result (shorter TTL since live status can change)
    await redis.set(cacheKey, JSON.stringify(result), { ex: VIDEO_INFO_CACHE_TTL })

    return result
  } catch (error) {
    logger.error('Error getting video info', error, {
      videoId,
    })
    throw error
  }
}

/**
 * Check if we have enough quota to continue polling
 */
export async function checkQuotaAvailable(
  channelId: string,
  quotaLimit: number = 10000
): Promise<boolean> {
  const used = await getQuotaUsage(channelId)
  return used < quotaLimit - 100 // Leave buffer
}

/**
 * Extract video ID from YouTube URL
 */
export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/live\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/, // Direct video ID
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }

  return null
}

// ============================================
// VIDEO COMMENTS
// ============================================

export interface YouTubeComment {
  id: string
  authorChannelId: string
  authorDisplayName: string
  authorProfileImageUrl: string
  textDisplay: string
  publishedAt: string
  likeCount: number
  isReply: boolean
}

/**
 * Fetch video comments using the commentThreads.list endpoint
 * Cost: 1 quota unit per request
 */
export async function getVideoComments(
  videoId: string,
  credentials: YouTubeCredentials,
  pageToken?: string
): Promise<{ comments: YouTubeComment[]; nextPageToken?: string }> {
  const auth = createOAuth2Client(credentials)

  try {
    const response = await youtube.commentThreads.list({
      auth,
      part: ['snippet'],
      videoId,
      maxResults: 100,
      order: 'time',
      pageToken,
    })

    await incrementGlobalQuota(QUOTA_COSTS.LIST)

    const comments: YouTubeComment[] = (response.data.items ?? []).map((item) => {
      const topComment = item.snippet?.topLevelComment
      const snippet = topComment?.snippet
      // The YouTube API returns authorChannelId as an object { value: "UCxxx" }
      const rawAuthorChannelId = snippet?.authorChannelId as unknown
      const authorChannelId =
        typeof rawAuthorChannelId === 'string'
          ? rawAuthorChannelId
          : typeof rawAuthorChannelId === 'object' && rawAuthorChannelId !== null && 'value' in rawAuthorChannelId
            ? String((rawAuthorChannelId as { value: string }).value)
            : ''
      return {
        id: topComment?.id ?? item.id ?? '',
        authorChannelId,
        authorDisplayName: snippet?.authorDisplayName ?? 'Unknown',
        authorProfileImageUrl: snippet?.authorProfileImageUrl ?? '',
        textDisplay: snippet?.textDisplay ?? '',
        publishedAt: snippet?.publishedAt ?? new Date().toISOString(),
        likeCount: snippet?.likeCount ?? 0,
        isReply: false,
      }
    })

    return {
      comments,
      nextPageToken: response.data.nextPageToken ?? undefined,
    }
  } catch (error) {
    logger.error('Error fetching video comments', error, { videoId })
    throw error
  }
}

// ============================================
// VIDEO DISCOVERY (search.list)
// ============================================

/**
 * Search for recent video uploads on a channel using the search.list endpoint
 * Cost: 100 quota units per request
 */
export async function searchChannelVideos(
  youtubeChannelId: string,
  credentials: YouTubeCredentials,
  publishedAfter?: Date
): Promise<{ videoId: string; title: string; publishedAt: string }[]> {
  const auth = createOAuth2Client(credentials)

  try {
    const searchParams: {
      auth: ReturnType<typeof createOAuth2Client>
      part: string[]
      channelId: string
      type: string[]
      order: string
      maxResults: number
      publishedAfter?: string
    } = {
      auth,
      part: ['snippet'],
      channelId: youtubeChannelId,
      type: ['video'],
      order: 'date',
      maxResults: 25,
    }

    if (publishedAfter) {
      searchParams.publishedAfter = publishedAfter.toISOString()
    }

    const response = await youtube.search.list(searchParams)

    // search.list costs 100 quota units
    await incrementGlobalQuota(100)

    return (response.data.items ?? [])
      .filter((item) => item.id?.videoId)
      .map((item) => ({
        videoId: item.id!.videoId!,
        title: item.snippet?.title ?? 'Unknown Video',
        publishedAt: item.snippet?.publishedAt ?? new Date().toISOString(),
      }))
  } catch (error) {
    logger.error('Error searching channel videos', error, { youtubeChannelId })
    throw error
  }
}

const youtubeService = {
  createOAuth2Client,
  getLiveChatId,
  pollLiveChatMessages,
  postLiveChatMessage,
  getChannelInfo,
  getVideoInfo,
  checkQuotaAvailable,
  extractVideoId,
  getVideoComments,
  searchChannelVideos,
}

export default youtubeService
