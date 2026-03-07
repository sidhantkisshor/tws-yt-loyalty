import * as Sentry from '@sentry/nextjs'

/**
 * Structured Logger with Sentry Integration
 *
 * Provides consistent logging across the application with automatic
 * error tracking in Sentry for production monitoring.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogContext {
  [key: string]: unknown
}

class Logger {
  /**
   * Filters sensitive information from context objects
   */
  private sanitizeContext(context?: LogContext): LogContext | undefined {
    if (!context) return undefined

    const sensitiveKeys = [
      'password',
      'token',
      'accessToken',
      'refreshToken',
      'apiKey',
      'secret',
      'authorization',
      'cookie',
      'googleAccessToken',
      'googleRefreshToken',
    ]

    const sanitized: LogContext = {}

    for (const [key, value] of Object.entries(context)) {
      // Check if key contains sensitive terms (case-insensitive)
      const isSensitive = sensitiveKeys.some((sensitiveKey) =>
        key.toLowerCase().includes(sensitiveKey.toLowerCase())
      )

      if (isSensitive) {
        sanitized[key] = '[REDACTED]'
      } else if (typeof value === 'object' && value !== null) {
        // Recursively sanitize nested objects
        sanitized[key] = this.sanitizeContext(value as LogContext)
      } else {
        sanitized[key] = value
      }
    }

    return sanitized
  }

  /**
   * Debug level logging - only shows in development
   */
  debug(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV === 'development') {
      const sanitized = this.sanitizeContext(context)
      console.debug(`[DEBUG] ${message}`, sanitized || '')
    }
  }

  /**
   * Info level logging - general information
   */
  info(message: string, context?: LogContext): void {
    const sanitized = this.sanitizeContext(context)

    if (process.env.NODE_ENV === 'development') {
      console.info(`[INFO] ${message}`, sanitized || '')
    }

    // Send breadcrumb to Sentry
    Sentry.addBreadcrumb({
      category: 'info',
      message,
      level: 'info',
      data: sanitized,
    })
  }

  /**
   * Warning level logging - potential issues
   */
  warn(message: string, context?: LogContext): void {
    const sanitized = this.sanitizeContext(context)

    console.warn(`[WARN] ${message}`, sanitized || '')

    // Send breadcrumb to Sentry
    Sentry.addBreadcrumb({
      category: 'warning',
      message,
      level: 'warning',
      data: sanitized,
    })
  }

  /**
   * Error level logging - captures exceptions in Sentry
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const sanitized = this.sanitizeContext(context)

    console.error(`[ERROR] ${message}`, error || '', sanitized || '')

    // Capture in Sentry with context
    if (error instanceof Error) {
      Sentry.captureException(error, {
        tags: { logMessage: message },
        extra: sanitized,
      })
    } else {
      // If error is not an Error object, capture as message
      Sentry.captureMessage(message, {
        level: 'error',
        tags: { errorType: 'non-error-thrown' },
        extra: {
          ...sanitized,
          thrownValue: error,
        },
      })
    }
  }

  /**
   * Set user context for Sentry tracking
   */
  setUser(userId: string, email?: string): void {
    Sentry.setUser({
      id: userId,
      // Only include email in development or if explicitly enabled
      email: process.env.NODE_ENV === 'development' ? email : undefined,
    })
  }

  /**
   * Clear user context (e.g., on logout)
   */
  clearUser(): void {
    Sentry.setUser(null)
  }

  /**
   * Add custom tags to Sentry context
   */
  setTags(tags: Record<string, string>): void {
    Sentry.setTags(tags)
  }

  /**
   * Add custom context to Sentry
   */
  setContext(name: string, context: LogContext): void {
    const sanitized = this.sanitizeContext(context)
    Sentry.setContext(name, sanitized || {})
  }
}

// Export singleton instance
export const logger = new Logger()
