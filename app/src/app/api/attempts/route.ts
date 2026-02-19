import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const subject = searchParams.get("subject")
    const from = searchParams.get("from")
    const to = searchParams.get("to")
    const limit = parseInt(searchParams.get("limit") || "50", 10)

    const where: Record<string, unknown> = {}

    if (subject) {
      where.question = { subjectId: parseInt(subject, 10) }
    }

    if (from || to) {
      const dateFilter: Record<string, Date> = {}
      if (from) dateFilter.gte = new Date(from)
      if (to) dateFilter.lte = new Date(to)
      where.createdAt = dateFilter
    }

    const attempts = await prisma.attempt.findMany({
      where,
      include: {
        question: {
          include: {
            subject: true,
            topic: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    })

    // Calculate stats
    const totalAttempts = await prisma.attempt.count({ where })
    const avgResult = await prisma.attempt.aggregate({
      where,
      _avg: { score: true },
    })

    return NextResponse.json({
      attempts,
      stats: {
        total: totalAttempts,
        averageScore: avgResult._avg.score || 0,
      },
    })
  } catch (error) {
    console.error("Error fetching attempts:", error)
    return NextResponse.json(
      { error: "풀이 기록을 불러오는데 실패했습니다" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { questionId, userAnswer, score } = body

    if (!questionId || score === undefined) {
      return NextResponse.json(
        { error: "필수 항목이 누락되었습니다" },
        { status: 400 }
      )
    }

    const attempt = await prisma.attempt.create({
      data: {
        questionId: parseInt(questionId, 10),
        userAnswer: userAnswer || "",
        score: parseInt(score, 10),
      },
    })

    return NextResponse.json(attempt)
  } catch (error) {
    console.error("Error creating attempt:", error)
    return NextResponse.json(
      { error: "풀이 기록 저장에 실패했습니다" },
      { status: 500 }
    )
  }
}
