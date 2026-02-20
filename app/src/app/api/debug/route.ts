import { NextResponse } from "next/server"

export async function GET() {
  const info: Record<string, unknown> = {
    env_keys: Object.keys(process.env).filter(k => !k.startsWith('__')),
    has_DATABASE_URL: !!process.env.DATABASE_URL,
  }

  // Test 1: Can we import getCloudflareContext?
  try {
    const mod = await import('@opennextjs/cloudflare')
    info.has_getCloudflareContext = typeof mod.getCloudflareContext === 'function'

    // Test 2: Can we get the context?
    const { env } = await mod.getCloudflareContext({ async: true })
    info.env_type = typeof env
    info.env_keys_cf = Object.keys(env || {})
    info.has_DB = !!env.DB
    info.DB_type = typeof env.DB

    // Test 3: Can we execute a simple query on D1?
    try {
      const db = env.DB as unknown as { prepare: (sql: string) => { first: () => Promise<unknown> } }
      const result = await db.prepare("SELECT COUNT(*) as cnt FROM Subject").first()
      info.d1_query_result = result
      info.d1_works = true
    } catch (d1Err) {
      info.d1_error = d1Err instanceof Error ? d1Err.message : String(d1Err)
      info.d1_works = false
    }
  } catch (cfErr) {
    info.cf_error = cfErr instanceof Error ? cfErr.message : String(cfErr)
    info.cf_stack = cfErr instanceof Error ? cfErr.stack : undefined
  }

  // Test 4: Can we import Prisma?
  try {
    const { PrismaClient } = await import('@/generated/prisma/client')
    info.has_PrismaClient = typeof PrismaClient === 'function'
  } catch (prismaErr) {
    info.prisma_error = prismaErr instanceof Error ? prismaErr.message : String(prismaErr)
  }

  // Test 5: Can we import PrismaD1?
  try {
    const { PrismaD1 } = await import('@prisma/adapter-d1')
    info.has_PrismaD1 = typeof PrismaD1 === 'function'
  } catch (d1AdapterErr) {
    info.d1_adapter_error = d1AdapterErr instanceof Error ? d1AdapterErr.message : String(d1AdapterErr)
  }

  // Test 6: Full getDb() test
  try {
    const { getDb } = await import('@/lib/db')
    const prisma = await getDb()
    const count = await prisma.question.count()
    info.prisma_query_result = count
    info.prisma_works = true
  } catch (dbErr) {
    info.db_error = dbErr instanceof Error ? dbErr.message : String(dbErr)
    info.db_stack = dbErr instanceof Error ? dbErr.stack : undefined
    info.prisma_works = false
  }

  return NextResponse.json(info, { status: 200 })
}
