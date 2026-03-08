import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Set environment
  environment: process.env.NODE_ENV || 'development',

  // Lower sample rate for server to reduce quota usage
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 1.0,

  // Server-side error filtering
  beforeSend(event) {
    // Remove sensitive data from request context
    if (event.request) {
      // Remove sensitive headers
      if (event.request.headers) {
        delete event.request.headers['authorization']
        delete event.request.headers['cookie']
        delete event.request.headers['set-cookie']
        delete event.request.headers['x-api-key']
        delete event.request.headers['x-auth-token']
      }

      // Remove sensitive query parameters
      if (event.request.url) {
        try {
          const url = new URL(event.request.url)
          const sensitiveParams = [
            'token',
            'api_key',
            'access_token',
            'refresh_token',
            'password',
            'secret',
            'apiKey',
          ]
          sensitiveParams.forEach((param) => url.searchParams.delete(param))
          event.request.url = url.toString()
        } catch {
          // Invalid URL, ignore
        }
      }

      // Remove request body (may contain sensitive data)
      delete event.request.data
    }

    // Remove sensitive context data
    if (event.contexts) {
      // Remove user sensitive data but keep user ID for tracking
      if (event.contexts.user) {
        const { email, ip_address, ...safeUser } = event.contexts.user
        void email
        void ip_address
        event.contexts.user = safeUser
      }
    }

    // Remove sensitive extra data
    if (event.extra) {
      const sensitiveKeys = [
        'accessToken',
        'refreshToken',
        'password',
        'secret',
        'apiKey',
        'googleAccessToken',
        'googleRefreshToken',
      ]
      sensitiveKeys.forEach((key) => delete event.extra?.[key])
    }

    return event
  },

  // Ignore specific errors
  ignoreErrors: [
    // Browser extensions
    'top.GLOBALS',
    'canvas.contentDocument',
    'MyApp_RemoveAllHighlights',
    'atomicFindClose',
    // Network errors that are expected
    'Network request failed',
    'NetworkError',
    // Rate limiting (expected behavior)
    'Too many requests',
    'Rate limit exceeded',
  ],

  // Don't send events in development unless explicitly enabled
  enabled: process.env.NODE_ENV === 'production' || process.env.SENTRY_ENABLED === 'true',
})
