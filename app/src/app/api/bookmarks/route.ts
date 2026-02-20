import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export async function GET() {
  try {
    const prisma = await getDb()
    const bookmarks = await prisma.bookmark.findMany({
      include: {
        question: {
          include: {
            subject: true,
            topic: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json(bookmarks)
  } catch (error) {
    console.error("Error fetching bookmarks:", error)
    return NextResponse.json(
      { error: "즐겨찾기를 불러오는데 실패했습니다" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const prisma = await getDb()
    const body = await request.json()
    const { questionId, note } = body

    if (!questionId) {
      return NextResponse.json(
        { error: "문제 ID가 필요합니다" },
        { status: 400 }
      )
    }

    // Check if already bookmarked
    const existing = await prisma.bookmark.findFirst({
      where: { questionId: parseInt(questionId, 10) },
    })

    if (existing) {
      return NextResponse.json(
        { error: "이미 즐겨찾기에 추가된 문제입니다", bookmark: existing },
        { status: 409 }
      )
    }

    const bookmark = await prisma.bookmark.create({
      data: {
        questionId: parseInt(questionId, 10),
        note: note || null,
      },
    })

    return NextResponse.json(bookmark)
  } catch (error) {
    console.error("Error creating bookmark:", error)
    return NextResponse.json(
      { error: "즐겨찾기 추가에 실패했습니다" },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const prisma = await getDb()
    const { searchParams } = new URL(request.url)
    const questionId = searchParams.get("questionId")

    if (!questionId) {
      return NextResponse.json(
        { error: "문제 ID가 필요합니다" },
        { status: 400 }
      )
    }

    const bookmark = await prisma.bookmark.findFirst({
      where: { questionId: parseInt(questionId, 10) },
    })

    if (!bookmark) {
      return NextResponse.json(
        { error: "즐겨찾기를 찾을 수 없습니다" },
        { status: 404 }
      )
    }

    await prisma.bookmark.delete({
      where: { id: bookmark.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting bookmark:", error)
    return NextResponse.json(
      { error: "즐겨찾기 삭제에 실패했습니다" },
      { status: 500 }
    )
  }
}
