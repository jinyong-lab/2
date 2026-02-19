import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import OpenAI from "openai"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { subjectId, topicId, count = 3, difficulty = 3, save = false } = body

    // Get API key from settings
    const apiKeySetting = await prisma.setting.findUnique({
      where: { key: "openai_api_key" },
    })

    if (!apiKeySetting?.value) {
      return NextResponse.json(
        { error: "OpenAI API 키가 설정되지 않았습니다. 설정 페이지에서 API 키를 입력해주세요." },
        { status: 400 }
      )
    }

    // Get subject and topic info
    const subject = await prisma.subject.findUnique({
      where: { id: parseInt(subjectId, 10) },
    })

    if (!subject) {
      return NextResponse.json(
        { error: "과목을 찾을 수 없습니다" },
        { status: 404 }
      )
    }

    let topicName = ""
    if (topicId) {
      const topic = await prisma.topic.findUnique({
        where: { id: parseInt(topicId, 10) },
      })
      if (topic) topicName = topic.name
    }

    const openai = new OpenAI({ apiKey: apiKeySetting.value })

    const difficultyLabels = ["매우 쉬움", "쉬움", "보통", "어려움", "매우 어려움"]
    const diffLabel = difficultyLabels[difficulty - 1] || "보통"

    const topicInstruction = topicName
      ? `주제: ${topicName}\n`
      : ""

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "당신은 전문상담교사 임용시험 출제 전문가입니다. 2027학년도 시험을 기준으로 서술형 문제를 출제해주세요. 반드시 JSON 배열 형식으로만 응답하세요.",
        },
        {
          role: "user",
          content: `다음 조건에 맞는 임용시험 문제를 ${count}개 생성해주세요.

과목: ${subject.name} (${subject.category})
${topicInstruction}난이도: ${diffLabel} (${difficulty}/5)

JSON 배열 형식으로 응답해주세요:
[
  {
    "content": "문제 내용 (서술형)",
    "modelAnswer": "모범 답안 (핵심 키워드와 논술 포함)"
  }
]

각 문제는 실제 임용시험 수준의 전문적인 문제여야 합니다.`,
        },
      ],
      temperature: 0.8,
      max_tokens: 4000,
    })

    const content = response.choices[0]?.message?.content || "[]"

    // Parse JSON from response (handle markdown code blocks)
    let questions
    try {
      const cleaned = content
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim()
      questions = JSON.parse(cleaned)
    } catch {
      return NextResponse.json(
        { error: "AI 응답을 파싱하는데 실패했습니다", raw: content },
        { status: 500 }
      )
    }

    // Save to DB if requested
    if (save && Array.isArray(questions)) {
      const savedQuestions = []
      for (const q of questions) {
        const saved = await prisma.question.create({
          data: {
            content: q.content,
            modelAnswer: q.modelAnswer,
            type: "essay",
            source: "ai-generated",
            difficulty,
            subjectId: parseInt(subjectId, 10),
            topicId: topicId ? parseInt(topicId, 10) : null,
          },
        })
        savedQuestions.push(saved)
      }
      return NextResponse.json({ questions: savedQuestions, saved: true })
    }

    return NextResponse.json({ questions, saved: false })
  } catch (error) {
    console.error("Error generating questions:", error)
    const message =
      error instanceof Error ? error.message : "문제 생성에 실패했습니다"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
