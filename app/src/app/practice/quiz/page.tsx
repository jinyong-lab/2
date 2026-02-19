"use client"

import { useEffect, useState, useCallback, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Star,
  Timer,
  Loader2,
  BookOpen,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"

interface Question {
  id: number
  content: string
  modelAnswer: string
  type: string
  source: string
  difficulty: number
  pageRef: string | null
  subjectId: number
  topicId: number | null
  subject: { id: number; name: string; category: string }
  topic: { id: number; name: string } | null
}

function QuizContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const subject = searchParams.get("subject")
  const mode = searchParams.get("mode") || "random"
  const count = parseInt(searchParams.get("count") || "20", 10)

  const [questions, setQuestions] = useState<Question[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [userAnswer, setUserAnswer] = useState("")
  const [showAnswer, setShowAnswer] = useState(false)
  const [score, setScore] = useState<number | null>(null)
  const [bookmarked, setBookmarked] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [timerEnabled, setTimerEnabled] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [scores, setScores] = useState<Record<number, number>>({})
  const [answers, setAnswers] = useState<Record<number, string>>({})

  // Fetch questions
  useEffect(() => {
    async function fetchQuestions() {
      setLoading(true)
      setError("")
      try {
        const params = new URLSearchParams()
        if (subject) params.set("subject", subject)
        params.set("mode", mode)
        params.set("count", count.toString())

        const res = await fetch(`/api/questions?${params}`)
        if (!res.ok) throw new Error("Failed to fetch")
        const data = await res.json()
        if (data.length === 0) {
          setError("해당 조건의 문제가 없습니다")
        }
        setQuestions(data)
      } catch {
        setError("문제를 불러오는데 실패했습니다")
      } finally {
        setLoading(false)
      }
    }

    fetchQuestions()
  }, [subject, mode, count])

  // Fetch bookmarks
  useEffect(() => {
    async function fetchBookmarks() {
      try {
        const res = await fetch("/api/bookmarks")
        if (res.ok) {
          const data = await res.json()
          const ids = new Set<number>(
            data.map((b: { questionId: number }) => b.questionId)
          )
          setBookmarked(ids)
        }
      } catch {
        // ignore
      }
    }
    fetchBookmarks()
  }, [])

  // Timer
  useEffect(() => {
    if (!timerEnabled) return
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(interval)
  }, [timerEnabled])

  const currentQuestion = questions[currentIndex]

  const handleShowAnswer = useCallback(() => {
    setShowAnswer(true)
  }, [])

  const handleScore = useCallback(
    async (s: number) => {
      if (!currentQuestion) return
      setScore(s)
      setScores((prev) => ({ ...prev, [currentQuestion.id]: s }))
      setAnswers((prev) => ({ ...prev, [currentQuestion.id]: userAnswer }))

      try {
        await fetch("/api/attempts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionId: currentQuestion.id,
            userAnswer,
            score: s,
          }),
        })
      } catch {
        // ignore save error
      }
    },
    [currentQuestion, userAnswer]
  )

  const handleNext = useCallback(() => {
    if (currentIndex < questions.length - 1) {
      const nextIdx = currentIndex + 1
      setCurrentIndex(nextIdx)
      const nextQ = questions[nextIdx]
      setUserAnswer(answers[nextQ.id] || "")
      setShowAnswer(scores[nextQ.id] !== undefined)
      setScore(scores[nextQ.id] ?? null)
    }
  }, [currentIndex, questions, answers, scores])

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      const prevIdx = currentIndex - 1
      setCurrentIndex(prevIdx)
      const prevQ = questions[prevIdx]
      setUserAnswer(answers[prevQ.id] || "")
      setShowAnswer(scores[prevQ.id] !== undefined)
      setScore(scores[prevQ.id] ?? null)
    }
  }, [currentIndex, questions, answers, scores])

  const toggleBookmark = useCallback(async () => {
    if (!currentQuestion) return
    const qId = currentQuestion.id

    if (bookmarked.has(qId)) {
      try {
        await fetch(`/api/bookmarks?questionId=${qId}`, { method: "DELETE" })
        setBookmarked((prev) => {
          const next = new Set(prev)
          next.delete(qId)
          return next
        })
      } catch {
        // ignore
      }
    } else {
      try {
        await fetch("/api/bookmarks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionId: qId }),
        })
        setBookmarked((prev) => new Set(prev).add(qId))
      } catch {
        // ignore
      }
    }
  }, [currentQuestion, bookmarked])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLTextAreaElement) return

      if (e.key === "Enter" && !showAnswer) {
        e.preventDefault()
        handleShowAnswer()
      } else if (
        showAnswer &&
        ["1", "2", "3", "4", "5"].includes(e.key) &&
        score === null
      ) {
        handleScore(parseInt(e.key, 10))
      } else if (e.key === "ArrowRight") {
        handleNext()
      } else if (e.key === "ArrowLeft") {
        handlePrev()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [showAnswer, score, handleShowAnswer, handleScore, handleNext, handlePrev])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  }

  const completedCount = Object.keys(scores).length

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
            {error || "문제가 없습니다"}
          </p>
          <Button variant="outline" onClick={() => router.push("/practice")}>
            돌아가기
          </Button>
        </div>
      </div>
    )
  }

  const scoreLabels = [
    "전혀모름",
    "부분이해",
    "보통",
    "거의완벽",
    "완벽",
  ]

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-sm">
            {currentIndex + 1} / {questions.length}
          </Badge>
          <Badge variant="secondary">
            {completedCount}문제 완료
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {timerEnabled && (
            <Badge variant="secondary" className="font-mono">
              {formatTime(elapsed)}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTimerEnabled(!timerEnabled)}
          >
            <Timer
              className={`size-4 ${timerEnabled ? "text-primary" : "text-muted-foreground"}`}
            />
          </Button>
          <Button variant="ghost" size="sm" onClick={toggleBookmark}>
            <Star
              className={`size-4 ${
                currentQuestion && bookmarked.has(currentQuestion.id)
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-muted-foreground"
              }`}
            />
          </Button>
        </div>
      </div>

      {/* Progress */}
      <Progress
        value={((currentIndex + 1) / questions.length) * 100}
        className="h-1.5"
      />

      {/* Question Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{currentQuestion.subject.name}</Badge>
            {currentQuestion.topic && (
              <Badge variant="outline">{currentQuestion.topic.name}</Badge>
            )}
            {currentQuestion.pageRef && (
              <Badge variant="secondary" className="text-xs">
                p.{currentQuestion.pageRef}
              </Badge>
            )}
            <Badge variant="outline" className="text-xs">
              난이도 {currentQuestion.difficulty}/5
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Question content */}
          <div className="rounded-lg bg-muted/50 p-4 sm:p-6">
            <p className="whitespace-pre-wrap text-base leading-relaxed sm:text-lg">
              {currentQuestion.content}
            </p>
          </div>

          {/* User answer */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              내 답안 작성
            </label>
            <Textarea
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              placeholder="여기에 답안을 작성하세요..."
              className="min-h-[120px] text-base"
              disabled={showAnswer}
            />
          </div>

          {/* Show answer button */}
          {!showAnswer && (
            <Button
              onClick={handleShowAnswer}
              className="w-full"
              size="lg"
            >
              <Eye className="size-4" />
              정답 보기
              <span className="text-xs opacity-70 ml-2">(Enter)</span>
            </Button>
          )}

          {/* Model Answer */}
          {showAnswer && (
            <div className="animate-in slide-in-from-top-2 space-y-4 duration-300">
              <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-4 sm:p-6">
                <p className="mb-2 text-sm font-semibold text-primary">
                  모범 답안
                </p>
                <p className="whitespace-pre-wrap text-base leading-relaxed">
                  {currentQuestion.modelAnswer}
                </p>
              </div>

              {/* Self-scoring */}
              {score === null ? (
                <div className="space-y-3">
                  <p className="text-center text-sm font-medium">
                    자기 평가를 선택하세요 (1-5)
                  </p>
                  <div className="flex justify-center gap-2">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Button
                        key={s}
                        variant="outline"
                        className="flex h-auto flex-col gap-1 px-4 py-3"
                        onClick={() => handleScore(s)}
                      >
                        <div className="flex gap-0.5">
                          {Array.from({ length: s }).map((_, i) => (
                            <Star
                              key={i}
                              className="size-4 fill-yellow-400 text-yellow-400"
                            />
                          ))}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {scoreLabels[s - 1]}
                        </span>
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 rounded-lg bg-muted p-3">
                  <span className="text-sm text-muted-foreground">평가:</span>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`size-4 ${
                          s <= score
                            ? "fill-yellow-400 text-yellow-400"
                            : "text-muted-foreground/30"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-sm font-medium">
                    {scoreLabels[score - 1]}
                  </span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={handlePrev}
          disabled={currentIndex === 0}
        >
          <ChevronLeft className="size-4" />
          이전
        </Button>

        <Button
          variant="outline"
          onClick={() => router.push("/practice")}
        >
          목록
        </Button>

        <Button
          variant="outline"
          onClick={handleNext}
          disabled={currentIndex === questions.length - 1}
        >
          다음
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* Keyboard hints */}
      <p className="text-center text-xs text-muted-foreground">
        단축키: Enter(정답보기) | 1-5(평가) | 좌우 화살표(이동)
      </p>
    </div>
  )
}

export default function QuizPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      }
    >
      <QuizContent />
    </Suspense>
  )
}
