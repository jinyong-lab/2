"use client"

import { useEffect, useState } from "react"
import { Loader2, BookOpen, Lightbulb, CheckCircle, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"

interface Question {
  id: number
  content: string
  modelAnswer: string
  type: string
  difficulty: number
  subjectId: number
  subject: { id: number; name: string; category: string }
  topic: { id: number; name: string } | null
}

/** Split content around the first ( ) occurrence */
function splitContent(content: string): { before: string; after: string } {
  const idx = content.indexOf("( )")
  if (idx === -1) {
    return { before: content, after: "" }
  }
  return {
    before: content.slice(0, idx),
    after: content.slice(idx + 3),
  }
}

/**
 * Check if user answer matches modelAnswer.
 * Handles cases like "신경증(neurosis)" where the user may type either
 * the Korean part or the full string.
 */
function isCorrect(userAnswer: string, modelAnswer: string): boolean {
  const user = userAnswer.trim()
  const model = modelAnswer.trim()
  if (user === model) return true

  // Extract text before the first "(" in modelAnswer if present
  // e.g. "신경증(neurosis)" -> primary = "신경증"
  const parenIdx = model.indexOf("(")
  if (parenIdx !== -1) {
    const primary = model.slice(0, parenIdx).trim()
    if (user === primary) return true
  }

  return false
}

export default function BlankPracticePage() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [userAnswer, setUserAnswer] = useState("")
  const [checked, setChecked] = useState(false)
  const [correct, setCorrect] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    async function fetchQuestions() {
      setLoading(true)
      setError("")
      try {
        const res = await fetch("/api/questions?type=fill-in&mode=random&count=20")
        if (!res.ok) throw new Error("Failed")
        const data = await res.json()
        if (!data || data.length === 0) {
          setError("빈칸 채우기 문제가 없습니다")
        }
        setQuestions(data)
      } catch {
        setError("문제를 불러오는데 실패했습니다")
      } finally {
        setLoading(false)
      }
    }
    fetchQuestions()
  }, [])

  const currentQuestion = questions[currentIndex]

  const handleCheck = () => {
    if (!currentQuestion) return
    const result = isCorrect(userAnswer, currentQuestion.modelAnswer)
    setCorrect(result)
    setChecked(true)

    fetch("/api/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionId: currentQuestion.id,
        userAnswer,
        score: result ? 5 : 1,
      }),
    }).catch(() => {})
  }

  const resetState = () => {
    setUserAnswer("")
    setChecked(false)
    setCorrect(false)
    setShowHint(false)
  }

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1)
      resetState()
    }
  }

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
      resetState()
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-muted-foreground">문제를 불러오는 중...</p>
        </div>
      </div>
    )
  }

  if (error || questions.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center">
          <BookOpen className="size-12 text-muted-foreground/40" />
          <p className="text-lg font-medium">
            {error || "빈칸 채우기 문제가 없습니다"}
          </p>
          <p className="text-sm text-muted-foreground">
            AI 문제 생성이나 관리자 페이지에서 빈칸 문제를 추가해주세요
          </p>
        </div>
      </div>
    )
  }

  const { before, after } = splitContent(currentQuestion.content)
  const modelAnswer = currentQuestion.modelAnswer.trim()
  const hintText = `${modelAnswer.charAt(0)}... (${modelAnswer.length}글자)`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">빈칸 채우기</h1>
        <p className="mt-1 text-muted-foreground">
          핵심 개념을 빈칸에 채워넣으세요
        </p>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-3">
        <Badge variant="outline">
          {currentIndex + 1} / {questions.length}
        </Badge>
        <Progress
          value={((currentIndex + 1) / questions.length) * 100}
          className="h-1.5 flex-1"
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-lg">문제 {currentIndex + 1}</CardTitle>
            <Badge>{currentQuestion.subject.name}</Badge>
            {currentQuestion.topic && (
              <Badge variant="outline">{currentQuestion.topic.name}</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Question text with inline blank */}
          <div className="rounded-lg bg-muted/50 p-4 sm:p-6">
            <p className="text-base leading-relaxed">
              <span className="whitespace-pre-wrap">{before}</span>
              <Input
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !checked) handleCheck()
                }}
                placeholder="　"
                disabled={checked}
                className={[
                  "mx-1 inline-block h-8 w-32 border-b-2 border-t-0 border-l-0 border-r-0 rounded-none bg-transparent px-1 text-center align-baseline",
                  checked
                    ? correct
                      ? "border-green-500 text-green-700 dark:text-green-400"
                      : "border-red-500 text-red-700 dark:text-red-400"
                    : "border-primary",
                ].join(" ")}
              />
              <span className="whitespace-pre-wrap">{after}</span>
            </p>
          </div>

          {/* Hint */}
          {!checked && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowHint((v) => !v)}
              >
                <Lightbulb
                  className={`mr-1 size-4 ${showHint ? "text-yellow-500" : "text-muted-foreground"}`}
                />
                힌트
              </Button>
              {showHint && (
                <span className="text-sm text-yellow-600 dark:text-yellow-400">
                  {hintText}
                </span>
              )}
            </div>
          )}

          {/* Feedback after check */}
          {checked && (
            <div
              className={`flex items-center gap-3 rounded-lg p-4 ${
                correct
                  ? "bg-green-50 dark:bg-green-950/30"
                  : "bg-red-50 dark:bg-red-950/30"
              }`}
            >
              {correct ? (
                <CheckCircle className="size-5 shrink-0 text-green-600" />
              ) : (
                <XCircle className="size-5 shrink-0 text-red-600" />
              )}
              <div>
                <p
                  className={`font-medium ${correct ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}
                >
                  {correct ? "정답입니다!" : "틀렸습니다"}
                </p>
                {!correct && (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    정답: <span className="font-semibold">{modelAnswer}</span>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Check button */}
          {!checked && (
            <Button
              onClick={handleCheck}
              className="w-full"
              size="lg"
              disabled={!userAnswer.trim()}
            >
              채점하기
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={handlePrev}
          disabled={currentIndex === 0}
        >
          이전
        </Button>
        <Button
          variant="outline"
          onClick={handleNext}
          disabled={currentIndex === questions.length - 1}
        >
          다음
        </Button>
      </div>
    </div>
  )
}
