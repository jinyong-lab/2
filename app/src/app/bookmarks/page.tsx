"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Loader2,
  Star,
  Trash2,
  BookOpen,
  ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface Bookmark {
  id: number
  questionId: number
  note: string | null
  createdAt: string
  question: {
    id: number
    content: string
    modelAnswer: string
    type: string
    difficulty: number
    subject: { id: number; name: string; category: string }
    topic: { id: number; name: string } | null
  }
}

export default function BookmarksPage() {
  const router = useRouter()
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [loading, setLoading] = useState(true)
  const [subjectFilter, setSubjectFilter] = useState<string>("all")
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    async function fetchBookmarks() {
      setLoading(true)
      try {
        const res = await fetch("/api/bookmarks")
        if (res.ok) {
          const data = await res.json()
          setBookmarks(data)
        }
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    fetchBookmarks()
  }, [])

  const handleRemove = async (questionId: number) => {
    try {
      const res = await fetch(`/api/bookmarks?questionId=${questionId}`, {
        method: "DELETE",
      })
      if (res.ok) {
        setBookmarks((prev) => prev.filter((b) => b.questionId !== questionId))
      }
    } catch {
      // ignore
    }
  }

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Get unique subjects for filter
  const subjects = Array.from(
    new Map(
      bookmarks.map((b) => [
        b.question.subject.id,
        b.question.subject,
      ])
    ).values()
  )

  const filtered =
    subjectFilter === "all"
      ? bookmarks
      : bookmarks.filter(
          (b) => b.question.subject.id.toString() === subjectFilter
        )

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">즐겨찾기</h1>
          <p className="mt-1 text-muted-foreground">
            중요한 문제를 모아놓은 목록입니다 ({bookmarks.length}개)
          </p>
        </div>
        {bookmarks.length > 0 && (
          <Button
            onClick={() =>
              router.push("/practice/quiz?mode=bookmarked&count=20")
            }
          >
            <BookOpen className="size-4" />
            모두 풀기
          </Button>
        )}
      </div>

      {/* Subject filter */}
      {subjects.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant={subjectFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setSubjectFilter("all")}
          >
            전체
          </Button>
          {subjects.map((s) => (
            <Button
              key={s.id}
              variant={
                subjectFilter === s.id.toString() ? "default" : "outline"
              }
              size="sm"
              onClick={() => setSubjectFilter(s.id.toString())}
            >
              {s.name}
            </Button>
          ))}
        </div>
      )}

      {/* Bookmark list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Star className="size-12 text-muted-foreground/40 mb-3" />
          <p className="text-lg font-medium">즐겨찾기가 비어있습니다</p>
          <p className="mt-1 text-sm text-muted-foreground">
            문제를 풀면서 별 아이콘을 눌러 즐겨찾기에 추가해보세요
          </p>
          <Button
            asChild
            variant="outline"
            className="mt-4"
          >
            <a href="/practice">문제 풀러 가기</a>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((bookmark) => (
            <Card key={bookmark.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-3">
                  <div
                    className="min-w-0 flex-1 cursor-pointer"
                    onClick={() => toggleExpand(bookmark.id)}
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Badge>{bookmark.question.subject.name}</Badge>
                      {bookmark.question.topic && (
                        <Badge variant="outline">
                          {bookmark.question.topic.name}
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-xs">
                        난이도 {bookmark.question.difficulty}
                      </Badge>
                    </div>
                    <p className="text-sm leading-relaxed">
                      {expandedIds.has(bookmark.id)
                        ? bookmark.question.content
                        : bookmark.question.content.slice(0, 100) +
                          (bookmark.question.content.length > 100 ? "..." : "")}
                    </p>
                    {bookmark.note && (
                      <p className="mt-2 text-xs text-muted-foreground italic">
                        메모: {bookmark.note}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => toggleExpand(bookmark.id)}
                    >
                      <ChevronDown
                        className={`size-4 transition-transform ${
                          expandedIds.has(bookmark.id) ? "rotate-180" : ""
                        }`}
                      />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleRemove(bookmark.questionId)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>

                {/* Expanded model answer */}
                {expandedIds.has(bookmark.id) && (
                  <div className="mt-4 rounded-lg border-2 border-primary/20 bg-primary/5 p-4">
                    <p className="mb-1 text-sm font-semibold text-primary">
                      모범 답안
                    </p>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {bookmark.question.modelAnswer}
                    </p>
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
