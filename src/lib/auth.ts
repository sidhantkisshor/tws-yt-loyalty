import { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { PrismaAdapter } from '@auth/prisma-adapter'
import prisma from './prisma'
import { env } from './env'
import { logger } from '@/lib/logger'

// Only these emails can access the admin dashboard
// Configure via ADMIN_EMAILS environment variable (comma-separated)
const ADMIN_EMAILS = env.ADMIN_EMAILS

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as NextAuthOptions['adapter'],
  providers: [
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          prompt: 'consent',
          access_type: 'offline',
          response_type: 'code',
          scope: [
            'openid',
            'email',
            'profile',
            'https://www.googleapis.com/auth/youtube.readonly',
            'https://www.googleapis.com/auth/youtube.force-ssl',
          ].join(' '),
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      // Only allow admin emails to sign in
      if (!user.email || !ADMIN_EMAILS.includes(user.email.toLowerCase())) {
        return false // Reject sign-in
      }
      return true
    },
    async jwt({ token, account, user }) {
      // Initial sign in
      if (account && user) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          accessTokenExpires: account.expires_at ? account.expires_at * 1000 : 0,
          userId: user.id,
        }
      }

      // Return previous token if the access token has not expired yet
      if (Date.now() < (token.accessTokenExpires as number)) {
        return token
      }

      // Access token has expired, try to update it
      return refreshAccessToken(token)
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.userId as string
        session.accessToken = token.accessToken as string
        session.refreshToken = token.refreshToken as string
        session.error = token.error as string | undefined
      }
      return session
    },
  },
  events: {
    async signIn({ user, account }) {
      // Sync OAuth tokens to ChannelCredential for any channel owned by this user
      if (account && user.id && account.access_token && account.refresh_token) {
        const channel = await prisma.channel.findFirst({
          where: { ownerId: user.id },
        })
        if (channel) {
          await prisma.channelCredential.upsert({
            where: { channelId: channel.id },
            update: {
              accessToken: account.access_token,
              refreshToken: account.refresh_token,
              tokenExpiresAt: account.expires_at
                ? new Date(account.expires_at * 1000)
                : null,
              tokenStatus: 'VALID',
              lastRefreshedAt: new Date(),
            },
            create: {
              channelId: channel.id,
              googleAccountEmail: user.email ?? '',
              accessToken: account.access_token,
              refreshToken: account.refresh_token,
              tokenExpiresAt: account.expires_at
                ? new Date(account.expires_at * 1000)
                : null,
              tokenStatus: 'VALID',
              lastRefreshedAt: new Date(),
            },
          })
        }
      }
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  session: {
    strategy: 'jwt',
  },
  debug: env.NODE_ENV === 'development',
}

interface TokenWithRefresh {
  refreshToken?: string
  userId?: string
  accessToken?: string
  accessTokenExpires?: number
  error?: string
  [key: string]: unknown
}

/**
 * Refresh the access token using the refresh token
 */
async function refreshAccessToken(token: TokenWithRefresh): Promise<TokenWithRefresh> {
  try {
    const url = 'https://oauth2.googleapis.com/token'
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken || '',
      }),
    })

    const refreshedTokens = await response.json()

    if (!response.ok) {
      throw refreshedTokens
    }

    // Update tokens in the Account table and any ChannelCredential
    if (token.userId && typeof token.userId === 'string') {
      // Update Account table (NextAuth's built-in OAuth storage)
      await prisma.account.updateMany({
        where: { userId: token.userId, provider: 'google' },
        data: {
          access_token: refreshedTokens.access_token,
          expires_at: Math.floor((Date.now() + refreshedTokens.expires_in * 1000) / 1000),
        },
      })

      // Update ChannelCredential for any channel owned by this user
      const channel = await prisma.channel.findFirst({
        where: { ownerId: token.userId },
      })
      if (channel) {
        await prisma.channelCredential.updateMany({
          where: { channelId: channel.id },
          data: {
            accessToken: refreshedTokens.access_token,
            tokenExpiresAt: new Date(Date.now() + refreshedTokens.expires_in * 1000),
            tokenStatus: 'VALID',
            lastRefreshedAt: new Date(),
          },
        })
      }
    }

    return {
      ...token,
      accessToken: refreshedTokens.access_token,
      accessTokenExpires: Date.now() + refreshedTokens.expires_in * 1000,
      refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
    }
  } catch (error) {
    logger.error('Error refreshing access token', error, { userId: token.userId })
    return {
      ...token,
      error: 'RefreshAccessTokenError',
    }
  }
}

// Extend next-auth types
declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
    }
    accessToken: string
    refreshToken: string
    error?: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string
    refreshToken?: string
    accessTokenExpires?: number
    userId?: string
    error?: string
  }
}

export default authOptions
