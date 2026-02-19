import { PrismaClient } from '@/generated/prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import path from 'path'

function createAdapter() {
  const dbUrl = process.env.DATABASE_URL || 'file:./dev.db'
  const filePath = dbUrl.replace(/^file:/, '')
  const resolvedPath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath)
  return new PrismaBetterSqlite3({ url: resolvedPath })
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({ adapter: createAdapter() } as any)

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
