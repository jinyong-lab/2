import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export async function POST(request: NextRequest) {
  try {
    const prisma = await getDb()
    const body = await request.json()
    const { questions, subjectId, topicId, difficulty, source } = body

    if (!Array.isArray(questions) || questions.length === 0 || !subjectId) {
      return NextResponse.json(
        { error: "유효하지 않은 요청입니다" },
        { status: 400 }
      )
    }

    const savedQuestions = []
    for (const q of questions) {
      const saved = await prisma.question.create({
        data: {
          content: q.content,
          modelAnswer: q.modelAnswer,
          type: q.type || "essay",
          source: source || q.source || "ai-generated",
          difficulty: difficulty || 3,
          subjectId: parseInt(subjectId, 10),
          topicId: topicId ? parseInt(topicId, 10) : null,
        },
      })

      // Save blank items for fill-in type questions
      if (q.type === "fill-in" && Array.isArray(q.blanks)) {
        for (const blank of q.blanks) {
          await prisma.blankItem.create({
            data: {
              position: blank.position,
              answer: blank.answer,
              context: blank.context || "",
              questionId: saved.id,
            },
          })
        }
      }

      savedQuestions.push(saved)
    }

    return NextResponse.json({ questions: savedQuestions, saved: true })
  } catch (error) {
    console.error("Error saving questions:", error)
    return NextResponse.json(
      { error: "문제 저장에 실패했습니다" },
      { status: 500 }
    )
  }
}
