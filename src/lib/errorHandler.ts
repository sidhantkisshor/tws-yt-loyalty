import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'

/**
 * Error Handler Utilities for API Routes
 *
 * Provides safe error handling that prevents information disclosure
 * in production while maintaining helpful errors in development
 */

/**
 * Sanitize error message based on environment
 * Prevents leaking internal details in production
 */
export function sanitizeErrorMessage(
  error: unknown,
  defaultMessage: string
): string {
  if (process.env.NODE_ENV === 'development') {
    if (error instanceof Error) {
      return error.message
    }
    return String(error)
  }
  return defaultMessage
}

/**
 * Simplify Zod errors for client consumption
 * Only returns field path and message, hiding internal validation logic
 */
export function simplifyZodErrors(error: z.ZodError) {
  return error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }))
}

/**
 * Handle Prisma database errors with appropriate HTTP status codes
 */
export function handlePrismaError(error: Prisma.PrismaClientKnownRequestError): NextResponse | null {
  switch (error.code) {
    case 'P2002':
      // Unique constraint violation
      return NextResponse.json(
        { error: 'Resource already exists' },
        { status: 409 }
      )
    case 'P2025':
      // Record not found
      return NextResponse.json(
        { error: 'Resource not found' },
        { status: 404 }
      )
    case 'P2003':
      // Foreign key constraint failed
      return NextResponse.json(
        { error: 'Invalid reference' },
        { status: 400 }
      )
    case 'P2014':
      // Invalid ID
      return NextResponse.json(
        { error: 'Invalid ID format' },
        { status: 400 }
      )
    default:
      return null // Let generic handler handle it
  }
}

/**
 * Centralized API error handler
 * Returns appropriate HTTP responses based on error type
 *
 * @example
 * ```typescript
 * try {
 *   // ... your code
 * } catch (error) {
 *   return handleApiError(error, 'Failed to process request')
 * }
 * ```
 */
export function handleApiError(
  error: unknown,
  defaultMessage: string = 'An unexpected error occurred'
): NextResponse {
  // Zod validation errors
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        error: 'Validation failed',
        fields: simplifyZodErrors(error),
      },
      { status: 400 }
    )
  }

  // Prisma database errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const prismaResponse = handlePrismaError(error)
    if (prismaResponse) return prismaResponse
  }

  // Generic error response
  const message = sanitizeErrorMessage(error, defaultMessage)

  // Log the actual error for debugging (only in server logs)
  if (error instanceof Error) {
    console.error('API Error:', {
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    })
  } else {
    console.error('API Error:', error)
  }

  return NextResponse.json(
    { error: message },
    { status: 500 }
  )
}

/**
 * Safe error logger that sanitizes sensitive information
 */
export function logError(context: string, error: unknown, metadata?: Record<string, unknown>) {
  const errorInfo: Record<string, unknown> = {
    context,
    timestamp: new Date().toISOString(),
    ...metadata,
  }

  if (error instanceof Error) {
    errorInfo.message = error.message
    errorInfo.name = error.name

    if (process.env.NODE_ENV === 'development') {
      errorInfo.stack = error.stack
    }
  } else {
    errorInfo.error = String(error)
  }

  console.error('Error Log:', errorInfo)
}
