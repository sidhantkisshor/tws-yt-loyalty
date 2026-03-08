import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // ============================================
  // SECURITY HEADERS
  // ============================================
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Prevent clickjacking attacks
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          // Prevent MIME type sniffing
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          // Enable XSS protection (legacy browsers)
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          // Control referrer information
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          // Permissions Policy (formerly Feature Policy)
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
      // Production-only HSTS header
      ...(process.env.NODE_ENV === 'production'
        ? [
            {
              source: '/(.*)',
              headers: [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=63072000; includeSubDomains; preload',
                },
              ],
            },
          ]
        : []),
    ]
  },

  // ============================================
  // COMPILER OPTIMIZATIONS
  // ============================================
  compiler: {
    // Remove console logs in production
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },

  // ============================================
  // COMPRESSION & PERFORMANCE
  // ============================================
  compress: true,
  poweredByHeader: false,

  // ============================================
  // IMAGE OPTIMIZATION
  // ============================================
  images: {
    // Use modern image formats
    formats: ['image/avif', 'image/webp'],
    // Remote patterns for YouTube images
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.ytimg.com',
      },
      {
        protocol: 'https',
        hostname: '*.ggpht.com',
      },
      {
        protocol: 'https',
        hostname: '*.googleusercontent.com',
      },
    ],
  },

  // ============================================
  // PRODUCTION OPTIMIZATIONS
  // ============================================
  // Production source maps for error tracking
  productionBrowserSourceMaps: true,

  // ============================================
  // LOGGING
  // ============================================
  logging: {
    fetches: {
      fullUrl: process.env.NODE_ENV === 'development',
    },
  },
}

export default nextConfig
