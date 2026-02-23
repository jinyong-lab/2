"use client"

import { useEffect, useState } from "react"
import {
  Sparkles,
  Loader2,
  Save,
  AlertTriangle,
  Eye,
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
import { cn } from "@/lib/utils"

interface Subject {
  id: number
  name: string
  category: string
  topics: { id: number; name: string }[]
}

interface GeneratedQuestion {
  content: string
  modelAnswer: string
}

export default function GeneratePage() {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [selectedSubject, setSelectedSubject] = useState("")
  const [selectedTopic, setSelectedTopic] = useState("")
  const [questionCount, setQuestionCount] = useState("3")
  const [difficulty, setDifficulty] = useState("3")
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([])
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null)
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({})
  const [showAnswers, setShowAnswers] = useState<Record<number, boolean>>({})
  const [scores, setScores] = useState<Record<number, number>>({}) // 1-5

  // Fetch subjects
  useEffect(() => {
    async function fetchSubjects() {
      try {
        const statsRes = await fetch("/api/stats")
        if (statsRes.ok) {
          const data = await statsRes.json()
          if (data.subjectProgress) {
            // Convert to subjects with topics
            const subjectIds = data.subjectProgress.map(
              (s: { id: number }) => s.id
            )
            const subjectDetails: Subject[] = []

            for (const sp of data.subjectProgress) {
              subjectDetails.push({
                id: sp.id,
                name: sp.name,
                category: sp.category,
                topics: [],
              })
            }
            setSubjects(subjectDetails)
          }
        }
      } catch {
        // ignore
      }
    }

    async function checkApiKey() {
      try {
        const res = await fetch("/api/settings")
        if (res.ok) {
          const settings = await res.json()
          setHasApiKey(!!settings.openai_api_key)
        }
      } catch {
        setHasApiKey(false)
      }
    }

    fetchSubjects()
    checkApiKey()
  }, [])

  const handleGenerate = async () => {
    if (!selectedSubject) {
      setError("과목을 선택해주세요")
      return
    }

    setGenerating(true)
    setError("")
    setQuestions([])
    setSaved(false)
    setUserAnswers({})
    setShowAnswers({})
    setScores({})

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId: selectedSubject,
          topicId: selectedTopic || undefined,
          count: parseInt(questionCount, 10),
          difficulty: parseInt(difficulty, 10),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "문제 생성에 실패했습니다")
        return
      }

      setQuestions(data.questions || [])
    } catch {
      setError("문제 생성에 실패했습니다")
    } finally {
      setGenerating(false)
    }
  }

  const handleSave = async () => {
    if (!selectedSubject || questions.length === 0) return

    setSaving(true)
    setError("")

    try {
      const res = await fetch("/api/questions/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questions,
          subjectId: selectedSubject,
          topicId: selectedTopic || undefined,
          difficulty: parseInt(difficulty, 10),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || "저장에 실패했습니다")
        return
      }

      setSaved(true)
    } catch {
      setError("저장에 실패했습니다")
    } finally {
      setSaving(false)
    }
  }

  const currentSubject = subjects.find(
    (s) => s.id.toString() === selectedSubject
  )

  const difficultyLabels: Record<string, string> = {
    "1": "매우 쉬움",
    "2": "쉬움",
    "3": "보통",
    "4": "어려움",
    "5": "매우 어려움",
  }

  const scoreLabels = [
    "전혀 모름",
    "부분 이해",
    "보통",
    "거의 완벽",
    "완벽",
  ]

  const handleScore = (idx: number, score: number) => {
    setScores((prev) => ({ ...prev, [idx]: score }))
  }

  const scoredCount = Object.keys(scores).length
  const avgScore = scoredCount > 0
    ? Object.values(scores).reduce((sum, s) => sum + s, 0) / scoredCount
    : 0

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI 문제 생성</h1>
        <p className="mt-2 text-muted-foreground">
          GPT-4o를 활용하여 임용시험 문제를 자동으로 생성합니다
        </p>
      </div>

      {hasApiKey === false && (
        <Card className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20">
          <CardContent className="flex items-start gap-3 pt-6">
            <AlertTriangle className="size-5 shrink-0 text-yellow-600" />
            <div>
              <p className="font-medium text-yellow-800 dark:text-yellow-200">
                OpenAI API 키가 설정되지 않았습니다
              </p>
              <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-300">
                설정 페이지에서 API 키를 입력해야 AI 문제 생성을 사용할 수
                있습니다.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => (window.location.href = "/settings")}
              >
                설정으로 이동
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Options */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">생성 옵션</CardTitle>
          <CardDescription>
            과목, 난이도, 문제 수를 설정하세요
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>과목 선택</Label>
              <Select
                value={selectedSubject}
                onValueChange={setSelectedSubject}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="과목을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id.toString()}>
                      {s.name} ({s.category})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>난이도</Label>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["1", "2", "3", "4", "5"].map((d) => (
                    <SelectItem key={d} value={d}>
                      {d} - {difficultyLabels[d]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>문제 수</Label>
              <Select value={questionCount} onValueChange={setQuestionCount}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["1", "2", "3", "5", "7", "10"].map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}문제
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={generating || !selectedSubject}
            className="w-full"
            size="lg"
          >
            {generating ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                생성 중...
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                문제 생성
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Card className="border-red-500/50">
          <CardContent className="pt-6">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Generated Questions */}
      {questions.length > 0 && (
        <div className="space-y-4">
          {/* Score Summary */}
          {scoredCount > 0 && (
            <Card className="border-2 border-primary/50 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30">
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-primary">
                      {scoredCount} / {questions.length}
                    </div>
                    <div className="text-xs text-muted-foreground">문제 채점 완료</div>
                  </div>
                  <div className="h-12 w-px bg-border" />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={cn(
                              "size-5",
                              s <= Math.round(avgScore)
                                ? "fill-yellow-400 text-yellow-400"
                                : "text-muted-foreground/30"
                            )}
                          />
                        ))}
                      </div>
                      <span className="text-lg font-semibold">
                        평균 {avgScore.toFixed(1)}점
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {scoreLabels[Math.round(avgScore) - 1]}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-semibold">
              생성된 문제 ({questions.length}개)
            </h2>
            {!saved ? (
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                DB에 저장
              </Button>
            ) : (
              <Badge className="bg-green-600">저장 완료</Badge>
            )}
          </div>

          {questions.map((q, idx) => (
            <Card key={idx}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">문제 {idx + 1}</Badge>
                  {currentSubject && (
                    <Badge variant="secondary">
                      {currentSubject.name}
                    </Badge>
                  )}
                  <Badge variant="secondary">
                    난이도 {difficulty}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Question Content */}
                <div className="rounded-lg bg-muted/50 p-4">
                  <p className="whitespace-pre-wrap text-base leading-relaxed">
                    {q.content}
                  </p>
                </div>

                {/* User Answer Textarea */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">
                    답안 작성
                  </Label>
                  <Textarea
                    value={userAnswers[idx] || ""}
                    onChange={(e) =>
                      setUserAnswers((prev) => ({ ...prev, [idx]: e.target.value }))
                    }
                    placeholder="답안을 작성하세요..."
                    className="min-h-[120px] resize-y text-base"
                    disabled={showAnswers[idx]}
                  />
                </div>

                {/* Show Answer Button */}
                {!showAnswers[idx] ? (
                  <Button
                    onClick={() => setShowAnswers((prev) => ({ ...prev, [idx]: true }))}
                    variant="outline"
                    className="w-full gap-2"
                  >
                    <Eye className="size-4" />
                    모범 답안 보기
                  </Button>
                ) : (
                  <div className="space-y-4">
                    {/* Model Answer */}
                    <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-4">
                      <p className="mb-2 text-sm font-semibold text-primary">
                        모범 답안
                      </p>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">
                        {q.modelAnswer}
                      </p>
                    </div>

                    {/* Self-Scoring */}
                    {scores[idx] === undefined ? (
                      <div className="space-y-3 rounded-lg border-2 border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/30">
                        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                          자기 평가를 선택하세요 (1-5)
                        </p>
                        <div className="grid grid-cols-5 gap-2">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Button
                              key={s}
                              variant="outline"
                              className="flex h-auto flex-col gap-1.5 px-2 py-3 hover:shadow-md"
                              onClick={() => handleScore(idx, s)}
                            >
                              <div className="flex gap-0.5">
                                {Array.from({ length: s }).map((_, i) => (
                                  <Star
                                    key={i}
                                    className="size-3.5 fill-yellow-400 text-yellow-400"
                                  />
                                ))}
                              </div>
                              <span className="text-xs font-medium">{s}점</span>
                              <span className="text-xs text-muted-foreground">
                                {scoreLabels[s - 1]}
                              </span>
                            </Button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2 rounded-lg bg-green-50 p-4 dark:bg-green-950/30">
                        <span className="text-sm font-medium text-green-700 dark:text-green-400">
                          평가:
                        </span>
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className={cn(
                                "size-4",
                                s <= scores[idx]
                                  ? "fill-yellow-400 text-yellow-400"
                                  : "text-muted-foreground/30"
                              )}
                            />
                          ))}
                        </div>
                        <span className="text-sm font-semibold">
                          {scores[idx]}/5 - {scoreLabels[scores[idx] - 1]}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
