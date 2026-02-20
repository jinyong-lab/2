import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export async function GET() {
  try {
    const prisma = await getDb()
    // Total questions
    const totalQuestions = await prisma.question.count()

    // Today's attempts
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayAttempts = await prisma.attempt.count({
      where: { createdAt: { gte: todayStart } },
    })

    // Average score
    const avgResult = await prisma.attempt.aggregate({
      _avg: { score: true },
    })
    const averageScore = avgResult._avg.score || 0

    // Bookmark count
    const bookmarkCount = await prisma.bookmark.count()

    // Subject-wise progress
    const subjects = await prisma.subject.findMany({
      include: {
        _count: { select: { questions: true } },
      },
      orderBy: { category: "asc" },
    })

    const subjectProgress = await Promise.all(
      subjects.map(async (subject) => {
        const attemptedQuestions = await prisma.attempt.findMany({
          where: { question: { subjectId: subject.id } },
          select: { questionId: true },
          distinct: ["questionId"],
        })

        return {
          id: subject.id,
          name: subject.name,
          category: subject.category,
          total: subject._count.questions,
          attempted: attemptedQuestions.length,
        }
      })
    )

    // Recent attempts
    const recentAttempts = await prisma.attempt.findMany({
      include: {
        question: {
          include: {
            subject: true,
            topic: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    })

    return NextResponse.json({
      totalQuestions,
      todayAttempts,
      averageScore: Math.round(averageScore * 10) / 10,
      bookmarkCount,
      subjectProgress,
      recentAttempts,
    })
  } catch (error) {
    console.error("Error fetching stats:", error)
    return NextResponse.json(
      { error: "통계를 불러오는데 실패했습니다", detail: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined },
      { status: 500 }
    )
  }
}
