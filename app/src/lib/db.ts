import { PrismaClient } from '@/generated/prisma/client'

let cachedPrisma: PrismaClient | null = null

export async function getDb(): Promise<PrismaClient> {
  // Local development: use better-sqlite3 when DATABASE_URL is set
  if (process.env.DATABASE_URL) {
    if (cachedPrisma) return cachedPrisma
    const { PrismaBetterSqlite3 } = await import('@prisma/adapter-better-sqlite3')
    const path = await import('path')
    const dbUrl = process.env.DATABASE_URL
    const filePath = dbUrl.replace(/^file:/, '')
    const resolvedPath = path.default.isAbsolute(filePath)
      ? filePath
      : path.default.resolve(process.cwd(), filePath)
    const adapter = new PrismaBetterSqlite3({ url: resolvedPath })
    cachedPrisma = new PrismaClient({ adapter } as any)
    return cachedPrisma
  }

  // Cloudflare D1: per-request client
  const { getCloudflareContext } = await import('@opennextjs/cloudflare')
  const { PrismaD1 } = await import('@prisma/adapter-d1')
  const { env } = await getCloudflareContext()
  const adapter = new PrismaD1(env.DB)
  return new PrismaClient({ adapter } as any)
}
