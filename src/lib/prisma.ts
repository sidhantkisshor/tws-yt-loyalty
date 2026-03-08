import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { env } from './env'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  const connectionString = env.DATABASE_URL

  // Configure connection pool for serverless/Vercel environment
  // Using 3 connections allows better throughput while staying within serverless limits
  const pool = new Pool({
    connectionString,
    max: 3, // 3 connections per instance for better concurrency with parallel queries
    idleTimeoutMillis: 10000, // Close idle connections after 10 seconds
    connectionTimeoutMillis: 10000, // Timeout connection attempts after 10 seconds
  })

  const adapter = new PrismaPg(pool)

  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma
