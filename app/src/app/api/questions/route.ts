import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export async function GET(request: NextRequest) {
  try {
    const prisma = await getDb()
    const { searchParams } = new URL(request.url)
    const subject = searchParams.get("subject")
    const topic = searchParams.get("topic")
    const type = searchParams.get("type")
    const source = searchParams.get("source")
    const difficulty = searchParams.get("difficulty")
    const mode = searchParams.get("mode") || "sequential"
    const count = parseInt(searchParams.get("count") || "20", 10)
    const excludeIds = searchParams.get("excludeIds")

    const where: Record<string, unknown> = {}

    if (subject) where.subjectId = parseInt(subject, 10)
    if (topic) where.topicId = parseInt(topic, 10)
    if (type) where.type = type
    if (source) where.source = source
    if (difficulty) where.difficulty = parseInt(difficulty, 10)
    if (excludeIds) {
      const ids = excludeIds.split(",").map((id) => parseInt(id, 10))
      where.id = { notIn: ids }
    }

    let questions

    if (mode === "random") {
      // For SQLite random ordering
      const allIds = await prisma.question.findMany({
        where,
        select: { id: true },
      })

      // Shuffle and take count
      const shuffled = allIds.sort(() => Math.random() - 0.5).slice(0, count)
      const selectedIds = shuffled.map((q) => q.id)

      questions = await prisma.question.findMany({
        where: { id: { in: selectedIds } },
        include: {
          subject: true,
          topic: true,
          blankItems: { orderBy: { position: "asc" } },
        },
      })

      // Re-shuffle to maintain random order
      questions.sort(() => Math.random() - 0.5)
    } else if (mode === "wrong") {
      // Questions with low scores (score <= 2)
      const wrongAttempts = await prisma.attempt.findMany({
        where: { score: { lte: 2 } },
        select: { questionId: true },
        distinct: ["questionId"],
      })
      const wrongIds = wrongAttempts.map((a) => a.questionId)

      questions = await prisma.question.findMany({
        where: { ...where, id: { in: wrongIds } },
        include: {
          subject: true,
          topic: true,
          blankItems: { orderBy: { position: "asc" } },
        },
        take: count,
      })
    } else if (mode === "bookmarked") {
      const bookmarks = await prisma.bookmark.findMany({
        select: { questionId: true },
      })
      const bookmarkedIds = bookmarks.map((b) => b.questionId)

      questions = await prisma.question.findMany({
        where: { ...where, id: { in: bookmarkedIds } },
        include: {
          subject: true,
          topic: true,
          blankItems: { orderBy: { position: "asc" } },
        },
        take: count,
      })
    } else {
      questions = await prisma.question.findMany({
        where,
        include: {
          subject: true,
          topic: true,
          blankItems: { orderBy: { position: "asc" } },
        },
        take: count,
        orderBy: { id: "asc" },
      })
    }

    return NextResponse.json(questions)
  } catch (error) {
    console.error("Error fetching questions:", error)
    return NextResponse.json(
      { error: "문제를 불러오는데 실패했습니다" },
      { status: 500 }
    )
  }
}
