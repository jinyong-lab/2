import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const questionId = parseInt(id, 10)

    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: {
        subject: true,
        topic: true,
        attempts: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
        bookmarks: true,
        blankItems: {
          orderBy: { position: "asc" },
        },
      },
    })

    if (!question) {
      return NextResponse.json(
        { error: "문제를 찾을 수 없습니다" },
        { status: 404 }
      )
    }

    return NextResponse.json(question)
  } catch (error) {
    console.error("Error fetching question:", error)
    return NextResponse.json(
      { error: "문제를 불러오는데 실패했습니다" },
      { status: 500 }
    )
  }
}
