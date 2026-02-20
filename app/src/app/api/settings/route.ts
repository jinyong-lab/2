import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export async function GET() {
  try {
    const prisma = await getDb()
    const settings = await prisma.setting.findMany()
    const settingsMap: Record<string, string> = {}
    for (const s of settings) {
      settingsMap[s.key] = s.value
    }

    // If no DB key, surface env key (masked) so frontend knows it's available
    if (!settingsMap.openai_api_key && process.env.OPENAI_API_KEY) {
      const raw = process.env.OPENAI_API_KEY
      settingsMap.openai_api_key = `sk-...${raw.slice(-4)}`
      settingsMap.openai_api_key_source = "env"
    } else if (settingsMap.openai_api_key) {
      settingsMap.openai_api_key_source = "db"
    }

    return NextResponse.json(settingsMap)
  } catch (error) {
    console.error("Error fetching settings:", error)
    return NextResponse.json(
      { error: "설정을 불러오는데 실패했습니다" },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const prisma = await getDb()
    const body = await request.json()

    // body is { key: value, key: value, ... }
    const updates = Object.entries(body)

    for (const [key, value] of updates) {
      await prisma.setting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error updating settings:", error)
    return NextResponse.json(
      { error: "설정 저장에 실패했습니다" },
      { status: 500 }
    )
  }
}
