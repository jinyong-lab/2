"use client"

import { useEffect, useState } from "react"
import {
  FileText,
  Loader2,
  Save,
  AlertTriangle,
  Eye,
  EyeOff,
  Sparkles,
  CheckCircle,
  XCircle,
  Star,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface Subject {
  id: number
  name: string
  category: string
  total: number
  attempted: number
}

interface BlankItem {
  position: number
  answer: string
  context: string
}

interface ExamQuestion {
  content: string
  modelAnswer: string
  type: "fill-in" | "essay"
  points: number
  blanks?: BlankItem[]
  subQuestions?: string[]
}

export default function ExamStylePracticePage() {
  const [allSubjects, setAllSubjects] = useState<Subject[]>([])
  const [examSession, setExamSession] = useState<string>("전공A")
  const [selectedSubject, setSelectedSubject] = useState<string>("")
  const [examType, setExamType] = useState<"fill-in" | "essay" | "mixed">("mixed")
  const [difficulty, setDifficulty] = useState<string>("3")
  const [questionCount, setQuestionCount] = useState<string>("5")
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [hasApiKey, setHasApiKey] = useState(false)
  const [questions, setQuestions] = useState<ExamQuestion[]>([])
  const [userAnswers, setUserAnswers] = useState<Record<number, string | Record<number, string>>>({})
  const [showAnswers, setShowAnswers] = useState<Record<number, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [scores, setScores] = useState<Record<number, number>>({}) // index → earned points
  const [graded, setGraded] = useState<Record<number, boolean>>({}) // index → graded?
  const [essayScores, setEssayScores] = useState<Record<number, number>>({}) // index → 1-5 score

  const sessionSubjects = allSubjects.filter((s) => s.category === examSession)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        const [statsRes, settingsRes] = await Promise.all([
          fetch("/api/stats"),
          fetch("/api/settings"),
        ])

        if (statsRes.ok) {
          const data = await statsRes.json()
          setAllSubjects(data.subjectProgress || [])
        }

        if (settingsRes.ok) {
          const settings = await settingsRes.json()
          setHasApiKey(!!settings.openai_api_key)
        }
      } catch (error) {
        console.error("Failed to fetch data:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const handleGenerate = async () => {
    if (!selectedSubject || !hasApiKey) return

    setGenerating(true)
    try {
      const res = await fetch("/api/generate-exam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId: parseInt(selectedSubject),
          examType,
          questionCount: parseInt(questionCount),
          difficulty: parseInt(difficulty),
        }),
      })

      if (!res.ok) throw new Error("Failed to generate")

      const data = await res.json()
      setQuestions(data.questions || [])
      setUserAnswers({})
      setShowAnswers({})
      setSaved(false)
    } catch (error) {
      console.error("Generation failed:", error)
      alert("문제 생성에 실패했습니다. 다시 시도해주세요.")
    } finally {
      setGenerating(false)
    }
  }

  const handleSave = async () => {
    if (questions.length === 0 || !selectedSubject) return

    setSaving(true)
    try {
      const res = await fetch("/api/questions/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questions,
          subjectId: selectedSubject,
          difficulty: parseInt(difficulty),
          source: "exam-style",
        }),
      })

      if (!res.ok) throw new Error("Save failed")
      setSaved(true)
    } catch (error) {
      console.error("Save failed:", error)
      alert("저장에 실패했습니다.")
    } finally {
      setSaving(false)
    }
  }

  const toggleAnswer = (index: number) => {
    setShowAnswers((prev) => ({ ...prev, [index]: !prev[index] }))
  }

  const gradeFillIn = (qIndex: number, question: ExamQuestion) => {
    if (question.type !== "fill-in" || !question.blanks) return

    let correctBlanks = 0
    const totalBlanks = question.blanks.length
    const userBlankAnswers = userAnswers[qIndex] as Record<number, string> || {}

    question.blanks.forEach((blank, blankIdx) => {
      const userAnswer = (userBlankAnswers[blankIdx] || "").trim().toLowerCase()
      const correctAnswer = blank.answer.trim().toLowerCase()
      if (userAnswer === correctAnswer) {
        correctBlanks++
      }
    })

    const earnedPoints = (correctBlanks / totalBlanks) * question.points
    setScores((prev) => ({ ...prev, [qIndex]: earnedPoints }))
    setGraded((prev) => ({ ...prev, [qIndex]: true }))
  }

  const gradeAllFillIn = () => {
    questions.forEach((q, idx) => {
      if (q.type === "fill-in" && !graded[idx]) {
        gradeFillIn(idx, q)
        if (!showAnswers[idx]) {
          setShowAnswers((prev) => ({ ...prev, [idx]: true }))
        }
      }
    })
  }

  const handleEssayScore = (qIndex: number, question: ExamQuestion, score: number) => {
    const earnedPoints = (score / 5) * question.points
    setEssayScores((prev) => ({ ...prev, [qIndex]: score }))
    setScores((prev) => ({ ...prev, [qIndex]: earnedPoints }))
    setGraded((prev) => ({ ...prev, [qIndex]: true }))
  }

  const totalEarnedPoints = Object.values(scores).reduce((sum, pts) => sum + pts, 0)
  const gradedCount = Object.keys(graded).length

  const totalPoints = questions.reduce((sum, q) => sum + q.points, 0)
  const fillInCount = questions.filter((q) => q.type === "fill-in").length
  const essayCount = questions.filter((q) => q.type === "essay").length

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-muted-foreground">데이터를 불러오는 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 p-2.5 shadow-lg">
            <FileText className="size-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">기출유형 연습</h1>
            <p className="mt-1 text-base text-muted-foreground">
              실제 임용시험과 동일한 형식의 문제를 AI가 생성합니다
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
        >
          <AlertTriangle className="mr-1.5 size-3.5" />
          AI 생성 문제 · 실제 기출과 동일하지 않음
        </Badge>
      </div>

      {/* Options Card */}
      <Card className="border-2 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-amber-600" />
            문제 생성 옵션
          </CardTitle>
          <CardDescription>원하는 유형과 난이도를 선택하세요</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          {!hasApiKey && (
            <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                OpenAI API 키가 설정되지 않았습니다. 설정 페이지에서 API 키를
                등록해주세요.
              </p>
            </div>
          )}

          {/* Exam Session (교시) */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">시험 교시 선택</Label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { key: "교육학", label: "1교시", sub: "교육학", desc: "서술형 1문 · 20점" },
                { key: "전공A", label: "2교시", sub: "전공A", desc: "기입2+서술2 · 40점" },
                { key: "전공B", label: "3교시", sub: "전공B", desc: "기입2+서술2 · 40점" },
              ].map((session) => (
                <button
                  key={session.key}
                  onClick={() => {
                    setExamSession(session.key)
                    setSelectedSubject("")
                    if (session.key === "교육학") setExamType("essay")
                    else setExamType("mixed")
                  }}
                  className={cn(
                    "group relative rounded-xl border-2 p-4 text-center transition-all hover:shadow-md",
                    examSession === session.key
                      ? "border-amber-500 bg-amber-50 shadow-md dark:bg-amber-950/50"
                      : "border-slate-200 hover:border-slate-300 dark:border-slate-700"
                  )}
                >
                  <div className="mb-0.5 text-lg font-bold">{session.label}</div>
                  <div className="text-sm font-medium">{session.sub}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{session.desc}</div>
                  {examSession === session.key && (
                    <div className="absolute -right-1 -top-1 rounded-full bg-amber-500 p-1">
                      <CheckCircle className="size-3.5 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Exam Type */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">문제 유형 선택</Label>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setExamType("fill-in")}
                className={cn(
                  "group relative rounded-xl border-2 p-4 text-center transition-all hover:shadow-md",
                  examType === "fill-in"
                    ? "border-amber-500 bg-amber-50 shadow-md dark:bg-amber-950/50"
                    : "border-slate-200 hover:border-slate-300 dark:border-slate-700"
                )}
              >
                <div className="mb-1.5 text-lg font-bold">기입형</div>
                <div className="text-xs text-muted-foreground">2점 배점</div>
                {examType === "fill-in" && (
                  <div className="absolute -right-1 -top-1 rounded-full bg-amber-500 p-1">
                    <CheckCircle className="size-3.5 text-white" />
                  </div>
                )}
              </button>
              <button
                onClick={() => setExamType("essay")}
                className={cn(
                  "group relative rounded-xl border-2 p-4 text-center transition-all hover:shadow-md",
                  examType === "essay"
                    ? "border-amber-500 bg-amber-50 shadow-md dark:bg-amber-950/50"
                    : "border-slate-200 hover:border-slate-300 dark:border-slate-700"
                )}
              >
                <div className="mb-1.5 text-lg font-bold">서술형</div>
                <div className="text-xs text-muted-foreground">4점 배점</div>
                {examType === "essay" && (
                  <div className="absolute -right-1 -top-1 rounded-full bg-amber-500 p-1">
                    <CheckCircle className="size-3.5 text-white" />
                  </div>
                )}
              </button>
              <button
                onClick={() => setExamType("mixed")}
                className={cn(
                  "group relative rounded-xl border-2 p-4 text-center transition-all hover:shadow-md",
                  examType === "mixed"
                    ? "border-amber-500 bg-amber-50 shadow-md dark:bg-amber-950/50"
                    : "border-slate-200 hover:border-slate-300 dark:border-slate-700"
                )}
              >
                <div className="mb-1.5 text-lg font-bold">혼합형</div>
                <div className="text-xs text-muted-foreground">기입+서술</div>
                {examType === "mixed" && (
                  <div className="absolute -right-1 -top-1 rounded-full bg-amber-500 p-1">
                    <CheckCircle className="size-3.5 text-white" />
                  </div>
                )}
              </button>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {/* Subject - filtered by exam session */}
            <div className="space-y-2">
              <Label htmlFor="subject">과목 선택</Label>
              <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                <SelectTrigger id="subject">
                  <SelectValue placeholder="과목을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {sessionSubjects.map((subject) => (
                    <SelectItem key={subject.id} value={subject.id.toString()}>
                      {subject.name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({subject.total}문제)
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Difficulty */}
            <div className="space-y-2">
              <Label htmlFor="difficulty">난이도</Label>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger id="difficulty">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((level) => (
                    <SelectItem key={level} value={level.toString()}>
                      {"⭐".repeat(level)} {level}단계
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Question Count */}
            <div className="space-y-2">
              <Label htmlFor="count">문제 수</Label>
              <Select value={questionCount} onValueChange={setQuestionCount}>
                <SelectTrigger id="count">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 5, 8, 10].map((count) => (
                    <SelectItem key={count} value={count.toString()}>
                      {count}문제
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!selectedSubject || !hasApiKey || generating}
            size="lg"
            className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-lg font-semibold shadow-lg hover:from-amber-600 hover:to-orange-700"
          >
            {generating ? (
              <>
                <Loader2 className="mr-2 size-5 animate-spin" />
                AI가 문제를 생성하는 중...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 size-5" />
                기출유형 문제 생성
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Generated Questions */}
      {questions.length > 0 && (
        <div className="space-y-6">
          {/* Summary Bar */}
          <Card className="border-2 border-amber-500/50 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30">
            <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-amber-700 dark:text-amber-400">
                    {totalPoints}점
                  </div>
                  <div className="text-xs text-muted-foreground">만점</div>
                </div>
                {gradedCount > 0 && (
                  <>
                    <div className="h-12 w-px bg-border" />
                    <div className="text-center">
                      <div className="text-3xl font-bold text-green-700 dark:text-green-400">
                        {totalEarnedPoints.toFixed(1)}점
                      </div>
                      <div className="text-xs text-muted-foreground">
                        득점 ({((totalEarnedPoints / totalPoints) * 100).toFixed(0)}%)
                      </div>
                    </div>
                  </>
                )}
                <div className="h-12 w-px bg-border" />
                <div className="space-y-1 text-sm">
                  {fillInCount > 0 && (
                    <div className="text-muted-foreground">
                      기입형 {fillInCount}문 × 2점 = {fillInCount * 2}점
                    </div>
                  )}
                  {essayCount > 0 && (
                    <div className="text-muted-foreground">
                      서술형 {essayCount}문 × 4점 = {essayCount * 4}점
                    </div>
                  )}
                  {gradedCount > 0 && (
                    <div className="font-medium text-amber-700 dark:text-amber-400">
                      {gradedCount} / {questions.length}문제 채점 완료
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={gradeAllFillIn}
                  variant="default"
                  size="lg"
                  className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                >
                  <CheckCircle className="mr-2 size-4" />
                  전체 채점
                </Button>
                {!saved ? (
                  <Button onClick={handleSave} variant="outline" size="lg" disabled={saving}>
                    {saving ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 size-4" />
                    )}
                    {saving ? "저장 중..." : "문제 저장"}
                  </Button>
                ) : (
                  <Badge className="bg-green-600 px-4 py-2 text-sm">저장 완료</Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Questions */}
          <div className="space-y-8">
            {questions.map((question, index) => (
              <Card
                key={index}
                className="overflow-hidden border-2 shadow-xl"
                style={{
                  background:
                    "linear-gradient(to bottom right, hsl(var(--card)) 0%, hsl(var(--muted) / 0.3) 100%)",
                }}
              >
                {/* Exam-style header */}
                <div className="border-b-2 border-dashed border-border bg-slate-100 dark:bg-slate-900">
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <Badge
                        variant="outline"
                        className="border-2 border-slate-700 bg-white px-3 py-1.5 text-base font-bold dark:bg-slate-800"
                      >
                        {index + 1}번
                      </Badge>
                      <Badge
                        className={cn(
                          "px-3 py-1.5 text-sm font-bold",
                          question.type === "fill-in"
                            ? "bg-blue-600 hover:bg-blue-700"
                            : "bg-purple-600 hover:bg-purple-700"
                        )}
                      >
                        {question.type === "fill-in" ? "기입형" : "서술형"} (
                        {question.points}점)
                      </Badge>
                      {graded[index] && scores[index] !== undefined && (
                        <Badge className="bg-green-600 px-3 py-1.5 text-sm font-bold">
                          득점: {scores[index].toFixed(1)}점
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {question.type === "fill-in" && !graded[index] && (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => {
                            gradeFillIn(index, question)
                            if (!showAnswers[index]) {
                              setShowAnswers((prev) => ({ ...prev, [index]: true }))
                            }
                          }}
                          className="gap-2 bg-green-600 hover:bg-green-700"
                        >
                          <CheckCircle className="size-4" />
                          채점하기
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleAnswer(index)}
                        className="gap-2"
                      >
                        {showAnswers[index] ? (
                          <>
                            <EyeOff className="size-4" />
                            답안 숨기기
                          </>
                        ) : (
                          <>
                            <Eye className="size-4" />
                            {question.type === "fill-in" ? "정답" : "모범답안"}{" "}
                            보기
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                <CardContent className="space-y-6 p-6">
                  {/* Question Content */}
                  <div
                    className="min-h-[120px] rounded-lg bg-amber-50/50 p-5 dark:bg-amber-950/20"
                    style={{
                      fontFamily: "Georgia, serif",
                      lineHeight: "1.8",
                    }}
                  >
                    <p className="whitespace-pre-wrap text-base leading-relaxed">
                      {question.content}
                    </p>
                  </div>

                  {/* Fill-in Type */}
                  {question.type === "fill-in" && question.blanks && (
                    <div className="space-y-4">
                      <div className="text-sm font-semibold text-muted-foreground">
                        빈칸을 채워주세요
                      </div>
                      {question.blanks.map((blank, blankIdx) => (
                        <div key={blankIdx} className="space-y-2">
                          {blank.context && (
                            <div className="text-sm text-muted-foreground">
                              ({blankIdx + 1}) {blank.context}
                            </div>
                          )}
                          <div className="flex items-center gap-3">
                            <Badge
                              variant="outline"
                              className="shrink-0 border-2 px-2.5 py-1 font-mono"
                            >
                              {blankIdx + 1}
                            </Badge>
                            <Input
                              value={
                                typeof userAnswers[index] === "object"
                                  ? (userAnswers[index] as Record<number, string>)[
                                      blankIdx
                                    ] || ""
                                  : ""
                              }
                              onChange={(e) =>
                                setUserAnswers((prev) => {
                                  const current =
                                    typeof prev[index] === "object"
                                      ? (prev[index] as Record<number, string>)
                                      : {}
                                  return {
                                    ...prev,
                                    [index]: { ...current, [blankIdx]: e.target.value },
                                  }
                                })
                              }
                              placeholder="답을 입력하세요"
                              className="flex-1 border-2 font-medium"
                              disabled={showAnswers[index]}
                            />
                          </div>
                          {showAnswers[index] && (
                            <div className="ml-12 space-y-1">
                              {graded[index] && (() => {
                                const userAnswer = (
                                  typeof userAnswers[index] === "object"
                                    ? (userAnswers[index] as Record<number, string>)[blankIdx] || ""
                                    : ""
                                ).trim().toLowerCase()
                                const correctAnswer = blank.answer.trim().toLowerCase()
                                const isCorrect = userAnswer === correctAnswer
                                return (
                                  <div className={cn(
                                    "rounded-md px-3 py-2",
                                    isCorrect ? "bg-green-50 dark:bg-green-950/30" : "bg-red-50 dark:bg-red-950/30"
                                  )}>
                                    <div className={cn(
                                      "flex items-center gap-2 text-sm font-medium",
                                      isCorrect ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
                                    )}>
                                      {isCorrect ? (
                                        <CheckCircle className="size-4" />
                                      ) : (
                                        <XCircle className="size-4" />
                                      )}
                                      {isCorrect ? "정답" : "오답"}
                                    </div>
                                  </div>
                                )
                              })()}
                              <div className="rounded-md bg-blue-50 px-3 py-2 dark:bg-blue-950/30">
                                <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-400">
                                  <Eye className="size-4" />
                                  정답: {blank.answer}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Essay Type */}
                  {question.type === "essay" && (
                    <div className="space-y-4">
                      <div className="text-sm font-semibold text-muted-foreground">
                        답안 작성란
                      </div>
                      <Textarea
                        value={(userAnswers[index] as string) || ""}
                        onChange={(e) =>
                          setUserAnswers((prev) => ({
                            ...prev,
                            [index]: e.target.value,
                          }))
                        }
                        placeholder="답안을 작성하세요..."
                        className="min-h-[200px] resize-y border-2 font-serif text-base leading-relaxed"
                        disabled={showAnswers[index]}
                      />
                      {showAnswers[index] && (
                        <div className="space-y-4">
                          <div className="space-y-3 rounded-lg border-2 border-blue-500 bg-blue-50 p-4 dark:bg-blue-950/30">
                            <div className="flex items-center gap-2 font-semibold text-blue-700 dark:text-blue-400">
                              <Eye className="size-5" />
                              모범 답안
                            </div>
                            <div
                              className="whitespace-pre-wrap rounded-md bg-white p-4 font-serif leading-relaxed text-slate-900 dark:bg-slate-900 dark:text-slate-100"
                              style={{ lineHeight: "1.8" }}
                            >
                              {question.modelAnswer}
                            </div>
                          </div>

                          {!graded[index] ? (
                            <div className="space-y-3 rounded-lg border-2 border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/30">
                              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                                자기 평가를 선택하세요 (1-5점)
                              </p>
                              <div className="grid grid-cols-5 gap-2">
                                {[
                                  { score: 1, label: "전혀 모름", color: "red" },
                                  { score: 2, label: "부분 이해", color: "orange" },
                                  { score: 3, label: "보통", color: "yellow" },
                                  { score: 4, label: "거의 완벽", color: "lime" },
                                  { score: 5, label: "완벽", color: "green" },
                                ].map(({ score, label, color }) => (
                                  <Button
                                    key={score}
                                    variant="outline"
                                    className={cn(
                                      "flex h-auto flex-col gap-1.5 px-2 py-3 hover:shadow-md",
                                      `hover:border-${color}-500 hover:bg-${color}-50 dark:hover:bg-${color}-950/20`
                                    )}
                                    onClick={() => handleEssayScore(index, question, score)}
                                  >
                                    <div className="flex gap-0.5">
                                      {Array.from({ length: score }).map((_, i) => (
                                        <Star
                                          key={i}
                                          className="size-3.5 fill-yellow-400 text-yellow-400"
                                        />
                                      ))}
                                    </div>
                                    <span className="text-xs font-medium">{score}점</span>
                                    <span className="text-xs text-muted-foreground">
                                      {label}
                                    </span>
                                  </Button>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-lg border-2 border-green-500 bg-green-50 p-4 dark:bg-green-950/30">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 font-semibold text-green-700 dark:text-green-400">
                                  <CheckCircle className="size-5" />
                                  채점 완료
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="flex gap-0.5">
                                    {[1, 2, 3, 4, 5].map((s) => (
                                      <Star
                                        key={s}
                                        className={cn(
                                          "size-4",
                                          s <= (essayScores[index] || 0)
                                            ? "fill-yellow-400 text-yellow-400"
                                            : "text-muted-foreground/30"
                                        )}
                                      />
                                    ))}
                                  </div>
                                  <span className="text-sm font-bold">
                                    {essayScores[index]}/5점 → {scores[index].toFixed(1)}/{question.points}점
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
