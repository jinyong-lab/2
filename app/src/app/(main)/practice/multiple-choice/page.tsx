"use client"

import { useEffect, useState, useCallback } from "react"
import { Loader2, BookOpen, CheckCircle, XCircle, CircleDot } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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

interface ParsedQuestion {
  text: string
  choices: { label: string; text: string }[]
}

function parseQuestion(content: string): ParsedQuestion {
  // Split at first "\nA." to separate question text from choices
  const splitIdx = content.search(/\nA\./i)
  if (splitIdx === -1) {
    return { text: content, choices: [] }
  }

  const text = content.slice(0, splitIdx).trim()
  const choicesPart = content.slice(splitIdx + 1) // skip the \n

  // Parse each choice line: A. text, B. text, etc.
  const choices: { label: string; text: string }[] = []
  const lines = choicesPart.split("\n")

  for (const line of lines) {
    const match = line.match(/^([A-D])\.\s*(.+)$/)
    if (match) {
      choices.push({ label: match[1], text: match[2].trim() })
    }
  }

  return { text, choices }
}

export default function MultipleChoicePage() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)
  const [correct, setCorrect] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    async function fetchQuestions() {
      setLoading(true)
      setError("")
      try {
        const res = await fetch("/api/questions?type=multiple-choice&mode=random&count=20")
        if (!res.ok) throw new Error("Failed")
        const data = await res.json()
        if (!data || data.length === 0) {
          setError("객관식 문제가 없습니다")
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

  const handleCheck = useCallback(() => {
    if (!currentQuestion || !selectedChoice) return
    const result = selectedChoice === currentQuestion.modelAnswer.trim()
    setCorrect(result)
    setChecked(true)

    fetch("/api/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionId: currentQuestion.id,
        userAnswer: selectedChoice,
        score: result ? 5 : 1,
      }),
    }).catch(() => {})
  }, [currentQuestion, selectedChoice])

  const resetState = () => {
    setSelectedChoice(null)
    setChecked(false)
    setCorrect(false)
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

  // Keyboard shortcuts: 1/2/3/4 to select A/B/C/D, Enter to check
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (checked) return
      const keyMap: Record<string, string> = {
        "1": "A",
        "2": "B",
        "3": "C",
        "4": "D",
      }
      if (keyMap[e.key]) {
        setSelectedChoice(keyMap[e.key])
      } else if (e.key === "Enter" && selectedChoice) {
        handleCheck()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [checked, selectedChoice, handleCheck])

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
            {error || "객관식 문제가 없습니다"}
          </p>
          <p className="text-sm text-muted-foreground">
            AI 문제 생성이나 관리자 페이지에서 객관식 문제를 추가해주세요
          </p>
        </div>
      </div>
    )
  }

  const parsed = parseQuestion(currentQuestion.content)
  const modelAnswer = currentQuestion.modelAnswer.trim()

  const getChoiceClassName = (label: string) => {
    const base = "rounded-lg border-2 p-4 cursor-pointer transition-all text-left w-full"
    if (!checked) {
      if (selectedChoice === label) {
        return `${base} border-primary bg-primary/5`
      }
      return `${base} border-muted hover:border-primary/50`
    }
    // After check
    if (label === modelAnswer) {
      return `${base} border-green-500 bg-green-50 dark:bg-green-950/30 cursor-default`
    }
    if (selectedChoice === label && label !== modelAnswer) {
      return `${base} border-red-500 bg-red-50 dark:bg-red-950/30 cursor-default`
    }
    return `${base} border-muted cursor-default opacity-60`
  }

  const getChoiceIcon = (label: string) => {
    if (!checked) return null
    if (label === modelAnswer) {
      return <CheckCircle className="size-5 shrink-0 text-green-600" />
    }
    if (selectedChoice === label && label !== modelAnswer) {
      return <XCircle className="size-5 shrink-0 text-red-600" />
    }
    return null
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">객관식</h1>
        <p className="mt-1 text-muted-foreground">
          보기에서 정답을 선택하세요 (단축키: 1-4 선택, Enter 채점)
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
          {/* Question text */}
          <div className="rounded-lg bg-muted/50 p-4 sm:p-6">
            <p className="text-base leading-relaxed whitespace-pre-wrap">
              {parsed.text}
            </p>
          </div>

          {/* Choices */}
          {parsed.choices.length > 0 ? (
            <div className="space-y-3">
              {parsed.choices.map((choice, idx) => (
                <button
                  key={choice.label}
                  className={getChoiceClassName(choice.label)}
                  onClick={() => {
                    if (!checked) setSelectedChoice(choice.label)
                  }}
                  disabled={checked}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-current font-semibold text-sm">
                      {idx + 1}
                    </div>
                    <span className="flex-1 text-sm leading-relaxed">
                      <span className="font-semibold">{choice.label}.</span>{" "}
                      {choice.text}
                    </span>
                    {getChoiceIcon(choice.label)}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <CircleDot className="size-4" />
              <span className="text-sm">선택지를 파싱할 수 없습니다</span>
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
                    정답:{" "}
                    <span className="font-semibold">
                      {modelAnswer}.{" "}
                      {parsed.choices.find((c) => c.label === modelAnswer)?.text}
                    </span>
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
              disabled={!selectedChoice}
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
