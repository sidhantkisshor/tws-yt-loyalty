import { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import prisma from './prisma'
import { getChannelInfo } from './youtube'
import { env } from './env'
import { logger } from './logger'

// Viewer-specific auth configuration
// Viewers sign in with Google to access their points and redeem rewards
export const viewerAuthOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          prompt: 'consent',
          access_type: 'offline',
          response_type: 'code',
          // Viewers only need basic profile access
          scope: 'openid email profile https://www.googleapis.com/auth/youtube.readonly',
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!account || !profile) return false

      const googleId = account.providerAccountId
      const email = user.email || ''

      try {
        // 1. Get or Create FanProfile
        let fanProfile = await prisma.fanProfile.findUnique({
          where: { googleId },
        })

        if (!fanProfile) {
          fanProfile = await prisma.fanProfile.create({
            data: {
              googleId,
              email,
            },
          })
        }

        // 2. Determine YouTube Identity
        let youtubeChannelId = `google:${googleId}` // Default fallback
        let channelTitle = user.name || 'Viewer'
        let channelThumbnail = user.image

        if (account.access_token) {
          try {
            const channelInfo = await getChannelInfo({
              accessToken: account.access_token,
              refreshToken: account.refresh_token ?? '',
            })

            if (channelInfo) {
              youtubeChannelId = channelInfo.id
              channelTitle = channelInfo.title
              channelThumbnail = channelInfo.thumbnailUrl || user.image
            }
          } catch (err) {
            logger.error('Failed to fetch YouTube channel info during sign in', err, {
              googleId,
            })
          }
        }

        // 3. Ensure Viewer records exist in ALL active channels
        const channels = await prisma.channel.findMany({
          where: { isActive: true },
          select: { id: true },
        })

        if (channels.length === 0) {
          logger.warn('No channels exist, viewer login deferred', { googleId })
          return false
        }

        for (const channel of channels) {
          // Use upsert to handle race conditions if chat processor creates viewer simultaneously
          await prisma.viewer.upsert({
            where: {
              youtubeChannelId_channelId: {
                youtubeChannelId,
                channelId: channel.id,
              },
            },
            create: {
              youtubeChannelId,
              displayName: channelTitle,
              profileImageUrl: channelThumbnail,
              channelId: channel.id,
              trustScore: 50,
              fanProfileId: fanProfile.id,
            },
            update: {
              // Ensure link to account if it existed but wasn't linked
              fanProfileId: fanProfile.id,
              // Update profile info
              displayName: channelTitle,
              profileImageUrl: channelThumbnail,
            },
          })
        }

        return true
      } catch (error) {
        logger.error('Viewer sign in error', error, {
          googleId: account?.providerAccountId,
          email: user.email,
        })
        return false
      }
    },

    async jwt({ token, account, user }) {
      // Initial sign in
      if (account && user) {
        const googleId = account.providerAccountId
        token.googleId = googleId
      }
      return token
    },

    async session({ session, token }) {
      if (token && token.googleId) {
        const googleId = token.googleId as string

        const fanProfile = await prisma.fanProfile.findUnique({
          where: { googleId },
          include: {
            viewers: {
              include: {
                channel: {
                  select: { id: true, title: true }
                }
              }
            }
          }
        })

        if (fanProfile && fanProfile.viewers.length > 0) {
          const defaultViewer = fanProfile.viewers[0]

          session.viewerId = defaultViewer.id
          session.isViewer = true

          // Populate available channels for multi-channel viewer resolution
          session.availableChannels = fanProfile.viewers.map(v => ({
            channelId: v.channel.id,
            channelTitle: v.channel.title,
            viewerId: v.id,
          }))

          session.viewer = {
            id: defaultViewer.id,
            displayName: defaultViewer.displayName,
            profileImageUrl: defaultViewer.profileImageUrl,
            totalPoints: defaultViewer.totalPoints,
            availablePoints: defaultViewer.availablePoints,
            rank: defaultViewer.rank,
            channelId: defaultViewer.channel.id,
            channelTitle: defaultViewer.channel.title,
          }
        }
      }

      return session
    },
  },
  pages: {
    signIn: '/viewer/signin',
    error: '/viewer/signin',
  },
  session: {
    strategy: 'jwt',
  },
  debug: env.NODE_ENV === 'development',
}

// Extend next-auth types for viewer sessions
declare module 'next-auth' {
  interface Session {
    viewerId?: string
    isViewer?: boolean
    viewer?: {
      id: string
      displayName: string
      profileImageUrl: string | null
      totalPoints: number
      availablePoints: number
      rank: string
      channelId: string
      channelTitle: string
    }
    availableChannels?: Array<{
      channelId: string
      channelTitle: string
      viewerId: string
    }>
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    viewerId?: string
    googleId?: string
  }
}

export default viewerAuthOptions
