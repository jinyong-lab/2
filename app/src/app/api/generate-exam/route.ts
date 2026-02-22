import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import OpenAI from "openai"

type ExamType = "fill-in" | "essay" | "mixed"

interface BlankInfo {
  position: number
  answer: string
  context: string
}

interface GeneratedQuestion {
  content: string
  modelAnswer: string
  type: "fill-in" | "essay"
  points: 2 | 4
  blanks?: BlankInfo[]
}

export async function POST(request: NextRequest) {
  try {
    const prisma = await getDb()
    const body = await request.json()
    const {
      subjectId,
      topicId,
      examType = "mixed",
      questionCount = 3,
      difficulty = 3,
      save = false,
    } = body

    // Validate inputs
    if (!subjectId) {
      return NextResponse.json(
        { error: "과목 ID가 필요합니다" },
        { status: 400 }
      )
    }

    if (questionCount < 1 || questionCount > 10) {
      return NextResponse.json(
        { error: "문제 수는 1~10개 사이여야 합니다" },
        { status: 400 }
      )
    }

    if (!["fill-in", "essay", "mixed"].includes(examType)) {
      return NextResponse.json(
        { error: "examType은 fill-in, essay, mixed 중 하나여야 합니다" },
        { status: 400 }
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
          error:
            "OpenAI API 키가 설정되지 않았습니다. 설정 페이지에서 API 키를 입력하거나 .env 파일에 OPENAI_API_KEY를 설정해주세요.",
        },
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

    const openai = new OpenAI({ apiKey })

    const difficultyLabels = ["매우 쉬움", "쉬움", "보통", "어려움", "매우 어려움"]
    const diffLabel = difficultyLabels[difficulty - 1] || "보통"

    const topicInstruction = topicName ? `주제: ${topicName}\n` : ""

    // Generate system prompts based on exam type
    const systemPrompts = {
      "fill-in": `당신은 전문상담교사 임용시험 출제 전문가입니다.
실제 시험의 '기입형' 문제와 동일한 형식으로 새로운 문제를 출제해주세요.

기입형 문제 특징:
- 배점: 2점
- 이론 모형, 개념 정의, 학자의 주장 등에서 핵심 용어를 빈칸으로 제시
- 답: 1~3단어의 전문 용어
- 문제 형식: "다음 [이론/모형/개념]에서 ( )에 해당하는 용어를 쓰시오."

중요: 실제 기출문제를 그대로 복사하지 말고, 같은 유형과 형식의 새로운 문제를 만드세요.
반드시 JSON 배열 형식으로만 응답하세요.`,

      essay: `당신은 전문상담교사 임용시험 출제 전문가입니다.
실제 시험의 '서술형' 문제와 동일한 형식으로 새로운 문제를 출제해주세요.

서술형 문제 특징:
- 배점: 4점
- 사례 제시 후 이론 적용, 분석, 비교, 설명을 요구
- 하위 질문 2~3개로 구성
- 답: 4~5문장의 구조화된 서술
- 문제 형식 예시:
  "다음 사례를 읽고, [이론]의 관점에서 [내담자]의 문제를 분석하고, 적절한 [상담기법]을 제시하시오."
  "1) [개념]을 정의하시오. (1점)"
  "2) [사례]에서 나타나는 [현상]을 설명하시오. (1점)"
  "3) [기법]의 적용 방법을 서술하시오. (2점)"

중요: 실제 기출문제를 그대로 복사하지 말고, 같은 유형과 형식의 새로운 문제를 만드세요.
반드시 JSON 배열 형식으로만 응답하세요.`,

      mixed: `당신은 전문상담교사 임용시험 출제 전문가입니다.
실제 시험의 '기입형'과 '서술형' 문제를 혼합하여 출제해주세요.

기입형 문제 (2점):
- 이론 모형, 개념 정의, 학자의 주장 등에서 핵심 용어를 빈칸으로 제시
- 답: 1~3단어의 전문 용어
- 문제 형식: "다음 [이론/모형/개념]에서 ( )에 해당하는 용어를 쓰시오."

서술형 문제 (4점):
- 사례 제시 후 이론 적용, 분석, 비교, 설명을 요구
- 하위 질문 2~3개로 구성
- 답: 4~5문장의 구조화된 서술

중요: 실제 기출문제를 그대로 복사하지 말고, 같은 유형과 형식의 새로운 문제를 만드세요.
기입형과 서술형을 적절히 섞어서 출제하세요.
반드시 JSON 배열 형식으로만 응답하세요.`,
    }

    const userPrompts = {
      "fill-in": `다음 조건에 맞는 기입형 문제를 ${questionCount}개 생성해주세요.

과목: ${subject.name} (${subject.category})
${topicInstruction}난이도: ${diffLabel} (${difficulty}/5)

JSON 배열 형식으로 응답해주세요:
[
  {
    "content": "문제 내용 (빈칸은 ( )로 표시)",
    "modelAnswer": "정답 용어",
    "type": "fill-in",
    "points": 2,
    "blanks": [
      {
        "position": 1,
        "answer": "정답 용어",
        "context": "빈칸 주변 맥락"
      }
    ]
  }
]

각 문제는 실제 임용시험의 기입형 문제처럼 이론, 모형, 개념을 다루되, 기출문제를 복사하지 말고 새로운 문제를 만드세요.`,

      essay: `다음 조건에 맞는 서술형 문제를 ${questionCount}개 생성해주세요.

과목: ${subject.name} (${subject.category})
${topicInstruction}난이도: ${diffLabel} (${difficulty}/5)

JSON 배열 형식으로 응답해주세요:
[
  {
    "content": "문제 내용 (사례 제시 + 하위 질문)",
    "modelAnswer": "모범 답안 (구조화된 서술, 4-5문장)",
    "type": "essay",
    "points": 4
  }
]

각 문제는 실제 임용시험의 서술형 문제처럼 상담 사례를 제시하고 이론 적용을 요구하되, 기출문제를 복사하지 말고 새로운 문제를 만드세요.`,

      mixed: `다음 조건에 맞는 기입형/서술형 혼합 문제를 ${questionCount}개 생성해주세요.

과목: ${subject.name} (${subject.category})
${topicInstruction}난이도: ${diffLabel} (${difficulty}/5)

JSON 배열 형식으로 응답해주세요:
[
  {
    "content": "문제 내용",
    "modelAnswer": "모범 답안",
    "type": "fill-in" | "essay",
    "points": 2 | 4,
    "blanks": [...] // fill-in type인 경우에만
  }
]

기입형과 서술형을 적절히 섞어서 출제하세요. 각 문제는 실제 임용시험 형식을 따르되, 기출문제를 복사하지 말고 새로운 문제를 만드세요.`,
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: systemPrompts[examType as ExamType],
        },
        {
          role: "user",
          content: userPrompts[examType as ExamType],
        },
      ],
      temperature: 0.8,
      max_tokens: 4000,
    })

    const content = response.choices[0]?.message?.content || "[]"

    // Parse JSON from response (handle markdown code blocks)
    let questions: GeneratedQuestion[]
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

    // Validate question format
    if (!Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json(
        { error: "유효한 문제가 생성되지 않았습니다" },
        { status: 500 }
      )
    }

    // Calculate total points
    const totalPoints = questions.reduce((sum, q) => sum + q.points, 0)

    // Save to DB if requested
    if (save) {
      const savedQuestions = []
      for (const q of questions) {
        const saved = await prisma.question.create({
          data: {
            content: q.content,
            modelAnswer: q.modelAnswer,
            type: q.type,
            source: "exam-style",
            difficulty,
            subjectId: parseInt(subjectId, 10),
            topicId: topicId ? parseInt(topicId, 10) : null,
          },
        })

        // Save blank items if fill-in type
        if (q.type === "fill-in" && q.blanks && Array.isArray(q.blanks)) {
          for (const blank of q.blanks) {
            await prisma.blankItem.create({
              data: {
                position: blank.position,
                answer: blank.answer,
                context: blank.context,
                questionId: saved.id,
              },
            })
          }
        }

        savedQuestions.push(saved)
      }

      return NextResponse.json({
        questions: savedQuestions,
        examType,
        totalPoints,
        saved: true,
      })
    }

    return NextResponse.json({
      questions,
      examType,
      totalPoints,
      saved: false,
    })
  } catch (error) {
    console.error("Error generating exam questions:", error)
    const message =
      error instanceof Error ? error.message : "문제 생성에 실패했습니다"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
