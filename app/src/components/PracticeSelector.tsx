"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

interface Subject {
  id: number
  name: string
  category: string
  _count: { questions: number }
}

interface PracticeSelectorProps {
  subjects: Subject[]
}

const CATEGORY_TABS = [
  { key: "all", label: "전체" },
  { key: "교육학", label: "교육학", desc: "1교시" },
  { key: "전공A", label: "전공A", desc: "2교시" },
  { key: "전공B", label: "전공B", desc: "3교시" },
]

const COUNT_OPTIONS = [
  { label: "10문제", value: "10" },
  { label: "20문제", value: "20" },
  { label: "50문제", value: "50" },
  { label: "전체", value: "all" },
]

export default function PracticeSelector({ subjects }: PracticeSelectorProps) {
  const router = useRouter()
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [selectedSubject, setSelectedSubject] = useState<string>("all")
  const [selectedCount, setSelectedCount] = useState<string>("20")

  const filteredSubjects =
    selectedCategory === "all"
      ? subjects
      : subjects.filter((s) => s.category === selectedCategory)

  function handleCategoryChange(cat: string) {
    setSelectedCategory(cat)
    setSelectedSubject("all")
  }

  function handleStart() {
    const params = new URLSearchParams()
    params.set("mode", "random")
    if (selectedSubject !== "all") {
      params.set("subject", selectedSubject)
    } else if (selectedCategory !== "all") {
      const ids = filteredSubjects.map((s) => s.id).join(",")
      params.set("subjects", ids)
    }
    if (selectedCount !== "all") {
      params.set("count", selectedCount)
    } else {
      params.set("count", "9999")
    }
    router.push(`/practice/quiz?${params.toString()}`)
  }

  return (
    <div className="space-y-8">
      {/* Category tabs */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">시험 교시</p>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleCategoryChange(tab.key)}
              className={`rounded-lg border-2 px-5 py-2.5 text-sm font-semibold transition-all ${
                selectedCategory === tab.key
                  ? "border-primary bg-primary text-primary-foreground shadow-md"
                  : "border-border bg-background hover:border-primary/50 hover:bg-accent"
              }`}
            >
              {tab.label}
              {tab.desc && (
                <span className="ml-1.5 text-xs opacity-70">{tab.desc}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Subject selection */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">과목 선택</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedSubject("all")}
            className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
              selectedSubject === "all"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background hover:bg-accent"
            }`}
          >
            {selectedCategory === "all" ? "전체" : `${selectedCategory} 전체`}
          </button>
          {filteredSubjects.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedSubject(String(s.id))}
              className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                selectedSubject === String(s.id)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-accent"
              }`}
            >
              {s.name}
              <span className="ml-1.5 text-xs opacity-60">
                {s._count.questions}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Count selection */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">문제 수</p>
        <div className="flex flex-wrap gap-2">
          {COUNT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSelectedCount(opt.value)}
              className={`rounded-lg border px-4 py-2 text-sm transition-colors ${
                selectedCount === opt.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-accent"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Start button */}
      <Button size="lg" className="w-full sm:w-auto" onClick={handleStart}>
        시작
      </Button>
    </div>
  )
}
