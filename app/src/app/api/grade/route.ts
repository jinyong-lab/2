import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import OpenAI from "openai"

interface GradeResult {
  score: number
  feedback: string
  correctPoints: string[]
  missingPoints: string[]
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { questionId, userAnswer } = body

    if (!questionId || !userAnswer?.trim()) {
      return NextResponse.json(
        { error: "문제 ID와 답안이 필요합니다" },
        { status: 400 }
      )
    }

    // Fetch question with model answer
    const question = await prisma.question.findUnique({
      where: { id: parseInt(questionId, 10) },
      include: { subject: true, topic: true },
    })

    if (!question) {
      return NextResponse.json(
        { error: "문제를 찾을 수 없습니다" },
        { status: 404 }
      )
    }

    // Get API key: DB setting takes priority, then fall back to env
    const apiKeySetting = await prisma.setting.findUnique({
      where: { key: "openai_api_key" },
    })

    const apiKey = apiKeySetting?.value || process.env.OPENAI_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        {
          error: "OpenAI API 키가 설정되지 않았습니다. 설정 페이지에서 API 키를 입력하거나 .env 파일에 OPENAI_API_KEY를 설정해주세요.",
          fallbackToSelf: true,
        },
        { status: 400 }
      )
    }

    const openai = new OpenAI({ apiKey })

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `당신은 한국 임용시험(교원임용경쟁시험) 채점 전문가입니다. 수험생의 서술형 답안을 모범답안과 비교하여 공정하고 상세하게 평가해주세요.

평가 기준:
1점 (매우 부족): 핵심 개념을 전혀 이해하지 못하거나 완전히 틀린 답안
2점 (부족): 일부 관련 내용이 있으나 핵심 키워드와 논리가 크게 부족
3점 (보통): 핵심 개념은 파악했으나 구체적 설명이나 키워드가 일부 누락
4점 (우수): 대부분의 핵심 내용을 정확히 서술했으나 사소한 보완 필요
5점 (매우 우수): 모범답안 수준으로 핵심 키워드, 논리 구조, 구체적 설명 모두 포함

반드시 다음 JSON 형식으로만 응답하세요:
{
  "score": 1~5 사이의 정수,
  "feedback": "전체적인 평가 코멘트 (2-3문장)",
  "correctPoints": ["잘 작성된 부분 1", "잘 작성된 부분 2"],
  "missingPoints": ["부족하거나 누락된 부분 1", "부족하거나 누락된 부분 2"]
}`,
        },
        {
          role: "user",
          content: `[과목] ${question.subject.name}${question.topic ? ` - ${question.topic.name}` : ""}

[문제]
${question.content}

[모범답안]
${question.modelAnswer}

[수험생 답안]
${userAnswer}

위 수험생 답안을 모범답안과 비교하여 채점해주세요.`,
        },
      ],
      temperature: 0.3,
      max_tokens: 1500,
    })

    const content = response.choices[0]?.message?.content || "{}"

    // Parse JSON from response
    let gradeResult: GradeResult
    try {
      const cleaned = content
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim()
      gradeResult = JSON.parse(cleaned)
    } catch {
      return NextResponse.json(
        { error: "AI 채점 결과를 파싱하는데 실패했습니다", fallbackToSelf: true },
        { status: 500 }
      )
    }

    // Validate score range
    const score = Math.max(1, Math.min(5, Math.round(gradeResult.score)))

    // Save attempt
    const attempt = await prisma.attempt.create({
      data: {
        questionId: parseInt(questionId, 10),
        userAnswer: userAnswer,
        score,
      },
    })

    return NextResponse.json({
      ...gradeResult,
      score,
      attemptId: attempt.id,
    })
  } catch (error) {
    console.error("Error grading answer:", error)
    const message =
      error instanceof Error ? error.message : "AI 채점에 실패했습니다"
    return NextResponse.json(
      { error: message, fallbackToSelf: true },
      { status: 500 }
    )
  }
}
