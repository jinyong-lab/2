"use client"

import { useEffect, useState } from "react"
import { Loader2, BookOpen, Lightbulb, CheckCircle, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"

interface BlankItem {
  id: number
  position: number
  answer: string
  context: string
  questionId: number
}

interface Question {
  id: number
  content: string
  modelAnswer: string
  type: string
  difficulty: number
  subjectId: number
  subject: { id: number; name: string; category: string }
  topic: { id: number; name: string } | null
  blankItems: BlankItem[]
}

export default function BlankPracticePage() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({})
  const [checked, setChecked] = useState(false)
  const [results, setResults] = useState<Record<number, boolean>>({})
  const [hints, setHints] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    async function fetchBlankQuestions() {
      setLoading(true)
      setError("")
      try {
        const res = await fetch("/api/questions?type=blank&mode=random&count=20")
        if (!res.ok) throw new Error("Failed")
        const data = await res.json()
        const valid = data.filter(
          (q: Question) => q.blankItems && q.blankItems.length > 0
        )
        if (valid.length === 0) {
          setError("빈칸 채우기 문제가 없습니다")
        }
        setQuestions(valid)
      } catch {
        setError("문제를 불러오는데 실패했습니다")
      } finally {
        setLoading(false)
      }
    }
    fetchBlankQuestions()
  }, [])

  const currentQuestion = questions[currentIndex]

  const handleCheck = () => {
    if (!currentQuestion) return

    const newResults: Record<number, boolean> = {}
    let correctCount = 0

    for (const blank of currentQuestion.blankItems) {
      const userAns = (userAnswers[blank.id] || "").trim()
      const correct = userAns === blank.answer.trim()
      newResults[blank.id] = correct
      if (correct) correctCount++
    }

    setResults(newResults)
    setChecked(true)

    // Save attempt with score based on correct ratio
    const total = currentQuestion.blankItems.length
    const scoreVal = total > 0 ? Math.round((correctCount / total) * 5) : 0

    fetch("/api/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionId: currentQuestion.id,
        userAnswer: JSON.stringify(userAnswers),
        score: Math.max(1, scoreVal),
      }),
    }).catch(() => {})
  }

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setUserAnswers({})
      setChecked(false)
      setResults({})
      setHints(new Set())
    }
  }

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
      setUserAnswers({})
      setChecked(false)
      setResults({})
      setHints(new Set())
    }
  }

  const toggleHint = (blankId: number) => {
    setHints((prev) => {
      const next = new Set(prev)
      if (next.has(blankId)) {
        next.delete(blankId)
      } else {
        next.add(blankId)
      }
      return next
    })
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

  const correctCount = checked
    ? Object.values(results).filter(Boolean).length
    : 0
  const totalBlanks = currentQuestion?.blankItems.length || 0

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
          {/* Context and blanks */}
          <div className="rounded-lg bg-muted/50 p-4 sm:p-6">
            <p className="whitespace-pre-wrap text-base leading-relaxed">
              {currentQuestion.content}
            </p>
          </div>

          {/* Blank inputs */}
          <div className="space-y-4">
            <p className="text-sm font-medium text-muted-foreground">
              빈칸을 채워주세요
            </p>
            {currentQuestion.blankItems.map((blank, idx) => (
              <div key={blank.id} className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="shrink-0">
                    {idx + 1}
                  </Badge>
                  {blank.context && (
                    <span className="text-sm text-muted-foreground">
                      {blank.context}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Input
                      value={userAnswers[blank.id] || ""}
                      onChange={(e) =>
                        setUserAnswers((prev) => ({
                          ...prev,
                          [blank.id]: e.target.value,
                        }))
                      }
                      placeholder="답을 입력하세요"
                      disabled={checked}
                      className={
                        checked
                          ? results[blank.id]
                            ? "border-green-500 bg-green-50 dark:bg-green-950/30"
                            : "border-red-500 bg-red-50 dark:bg-red-950/30"
                          : ""
                      }
                    />
                    {checked && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {results[blank.id] ? (
                          <CheckCircle className="size-4 text-green-600" />
                        ) : (
                          <XCircle className="size-4 text-red-600" />
                        )}
                      </div>
                    )}
                  </div>
                  {!checked && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleHint(blank.id)}
                      title="힌트 보기"
                    >
                      <Lightbulb
                        className={`size-4 ${
                          hints.has(blank.id)
                            ? "text-yellow-500"
                            : "text-muted-foreground"
                        }`}
                      />
                    </Button>
                  )}
                </div>
                {hints.has(blank.id) && !checked && (
                  <p className="text-sm text-yellow-600 dark:text-yellow-400">
                    힌트: {blank.answer.charAt(0)}...
                    ({blank.answer.length}글자)
                  </p>
                )}
                {checked && !results[blank.id] && (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    정답: {blank.answer}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Check / Result */}
          {!checked ? (
            <Button onClick={handleCheck} className="w-full" size="lg">
              채점하기
            </Button>
          ) : (
            <div className="rounded-lg bg-muted p-4 text-center">
              <p className="text-2xl font-bold">
                {correctCount} / {totalBlanks}{" "}
                <span className="text-lg font-normal text-muted-foreground">
                  정답
                </span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {correctCount === totalBlanks
                  ? "완벽합니다!"
                  : correctCount >= totalBlanks / 2
                    ? "잘했습니다! 틀린 부분을 복습해보세요."
                    : "더 열심히 공부해봅시다!"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={handlePrev} disabled={currentIndex === 0}>
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
