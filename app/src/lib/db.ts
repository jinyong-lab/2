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

  // Cloudflare D1: patch fs to prevent binary engine lookup, then use standard import
  const fs = await import('node:fs')
  const origReaddir = fs.readdir
  if (origReaddir && origReaddir.toString && origReaddir.toString().includes('not implemented')) {
    ;(fs as any).readdir = (...args: any[]) => {
      const cb = args[args.length - 1]
      if (typeof cb === 'function') cb(null, [])
    }
    ;(fs as any).readdirSync = () => []
    ;(fs as any).readFileSync = (...args: any[]) => {
      const p = String(args[0])
      if (p.includes('os-release') || p.includes('alpine')) throw new Error('ENOENT')
      return ''
    }
  }

  const { PrismaClient: PrismaClientStd } = await import('@/generated/prisma')
  const { getCloudflareContext } = await import('@opennextjs/cloudflare')
  const { PrismaD1 } = await import('@prisma/adapter-d1')
  const { env } = await getCloudflareContext({ async: true })
  const adapter = new PrismaD1(env.DB)
  return new PrismaClientStd({ adapter } as any)
}
