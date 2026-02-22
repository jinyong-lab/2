import type { PrismaClient } from '@/generated/prisma'

let cachedPrisma: PrismaClient | null = null

export async function getDb(): Promise<PrismaClient> {
  // Local development: use better-sqlite3 when DATABASE_URL is set
  if (process.env.DATABASE_URL) {
    if (cachedPrisma) return cachedPrisma
    const { PrismaClient: PrismaClientNode } = await import('@/generated/prisma')
    const { PrismaBetterSQLite3 } = await import('@prisma/adapter-better-sqlite3')
    const path = await import('path')
    const dbUrl = process.env.DATABASE_URL
    const filePath = dbUrl.replace(/^file:/, '')
    const resolvedPath = path.default.isAbsolute(filePath)
      ? filePath
      : path.default.resolve(process.cwd(), filePath)
    const adapter = new PrismaBetterSQLite3({ url: resolvedPath })
    cachedPrisma = new PrismaClientNode({ adapter } as any)
    return cachedPrisma
  }

  // Cloudflare D1: use WASM runtime (supports adapter, no binary engine)
  const { getCloudflareContext } = await import('@opennextjs/cloudflare')
  const { PrismaD1 } = await import('@prisma/adapter-d1')
  const { PrismaClient: PrismaClientWasm } = await import('@/generated/prisma/wasm')
  const { env } = await getCloudflareContext({ async: true })
  const adapter = new PrismaD1(env.DB)
  return new PrismaClientWasm({ adapter } as any)
}
