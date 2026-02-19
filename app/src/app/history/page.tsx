"use client"

import { useEffect, useState } from "react"
import {
  Loader2,
  Calendar,
  BarChart3,
  TrendingUp,
  Star,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts"

interface Attempt {
  id: number
  questionId: number
  userAnswer: string
  score: number
  createdAt: string
  question: {
    content: string
    subject: { id: number; name: string; category: string }
    topic: { id: number; name: string } | null
  }
}

type DateFilter = "today" | "week" | "month" | "all"

export default function HistoryPage() {
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState<DateFilter>("all")
  const [totalCount, setTotalCount] = useState(0)
  const [averageScore, setAverageScore] = useState(0)

  useEffect(() => {
    async function fetchHistory() {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        params.set("limit", "200")

        const now = new Date()
        if (dateFilter === "today") {
          const start = new Date(now)
          start.setHours(0, 0, 0, 0)
          params.set("from", start.toISOString())
        } else if (dateFilter === "week") {
          const start = new Date(now)
          start.setDate(start.getDate() - 7)
          params.set("from", start.toISOString())
        } else if (dateFilter === "month") {
          const start = new Date(now)
          start.setMonth(start.getMonth() - 1)
          params.set("from", start.toISOString())
        }

        const res = await fetch(`/api/attempts?${params}`)
        if (res.ok) {
          const data = await res.json()
          setAttempts(data.attempts || [])
          setTotalCount(data.stats?.total || 0)
          setAverageScore(data.stats?.averageScore || 0)
        }
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    fetchHistory()
  }, [dateFilter])

  // Daily study count chart data
  const dailyData = (() => {
    const map: Record<string, number> = {}
    for (const a of attempts) {
      const date = new Date(a.createdAt).toLocaleDateString("ko-KR", {
        month: "short",
        day: "numeric",
      })
      map[date] = (map[date] || 0) + 1
    }
    return Object.entries(map)
      .map(([date, count]) => ({ date, count }))
      .reverse()
      .slice(-14)
  })()

  // Score distribution
  const scoreDistribution = (() => {
    const labels = ["전혀모름", "부분이해", "보통", "거의완벽", "완벽"]
    const counts = [0, 0, 0, 0, 0]
    for (const a of attempts) {
      if (a.score >= 1 && a.score <= 5) {
        counts[a.score - 1]++
      }
    }
    return labels.map((name, i) => ({
      name,
      value: counts[i],
    }))
  })()

  // Subject performance
  const subjectPerformance = (() => {
    const map: Record<
      string,
      { name: string; totalScore: number; count: number }
    > = {}
    for (const a of attempts) {
      const name = a.question.subject.name
      if (!map[name]) map[name] = { name, totalScore: 0, count: 0 }
      map[name].totalScore += a.score
      map[name].count++
    }
    return Object.values(map).map((s) => ({
      ...s,
      avg: Math.round((s.totalScore / s.count) * 10) / 10,
    }))
  })()

  const COLORS = [
    "hsl(0, 70%, 55%)",
    "hsl(30, 80%, 55%)",
    "hsl(50, 80%, 50%)",
    "hsl(140, 60%, 45%)",
    "hsl(210, 70%, 50%)",
  ]

  // Streak calculation
  const streakDays = (() => {
    const dateSet = new Set<string>()
    for (const a of attempts) {
      dateSet.add(new Date(a.createdAt).toDateString())
    }

    let streak = 0
    const today = new Date()
    for (let i = 0; i < 365; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      if (dateSet.has(d.toDateString())) {
        streak++
      } else if (i > 0) {
        break
      }
    }
    return streak
  })()

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">학습 기록</h1>
        <p className="mt-2 text-muted-foreground">
          그동안의 학습 현황을 한눈에 확인하세요
        </p>
      </div>

      {/* Date filter */}
      <div className="flex gap-2">
        {(
          [
            ["today", "오늘"],
            ["week", "이번 주"],
            ["month", "이번 달"],
            ["all", "전체"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            variant={dateFilter === value ? "default" : "outline"}
            size="sm"
            onClick={() => setDateFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* Stats summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/50">
              <BarChart3 className="size-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">총 풀이 수</p>
              <p className="text-2xl font-bold">{totalCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 dark:bg-green-950/50">
              <TrendingUp className="size-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">평균 점수</p>
              <p className="text-2xl font-bold">
                {Math.round(averageScore * 10) / 10}
                <span className="text-sm font-normal text-muted-foreground">
                  /5
                </span>
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 dark:bg-orange-950/50">
              <Calendar className="size-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">연속 학습일</p>
              <p className="text-2xl font-bold">
                {streakDays}
                <span className="text-sm font-normal text-muted-foreground">
                  일
                </span>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="daily">
        <TabsList>
          <TabsTrigger value="daily">일별 풀이</TabsTrigger>
          <TabsTrigger value="score">점수 분포</TabsTrigger>
          <TabsTrigger value="subject">과목별 성과</TabsTrigger>
        </TabsList>

        <TabsContent value="daily">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">일별 풀이 현황</CardTitle>
            </CardHeader>
            <CardContent>
              {dailyData.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">
                  풀이 데이터가 없습니다
                </p>
              ) : (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyData}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="date" fontSize={12} />
                      <YAxis fontSize={12} />
                      <Tooltip
                        labelFormatter={(label) => `${label}`}
                        formatter={(value) => [
                          `${value}문제`,
                          "풀이 수",
                        ]}
                      />
                      <Bar
                        dataKey="count"
                        fill="#4f46e5"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="score">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">점수 분포</CardTitle>
            </CardHeader>
            <CardContent>
              {attempts.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">
                  풀이 데이터가 없습니다
                </p>
              ) : (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={scoreDistribution.filter((d) => d.value > 0)}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={
                          (({ name, percent }: { name: string; percent: number }) =>
                            `${name} ${(percent * 100).toFixed(0)}%`) as any
                        }
                      >
                        {scoreDistribution
                          .filter((d) => d.value > 0)
                          .map((_, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={COLORS[index % COLORS.length]}
                            />
                          ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => [
                          `${value}문제`,
                          "풀이 수",
                        ]}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subject">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">과목별 성과</CardTitle>
            </CardHeader>
            <CardContent>
              {subjectPerformance.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">
                  풀이 데이터가 없습니다
                </p>
              ) : (
                <div className="space-y-3">
                  {subjectPerformance
                    .sort((a, b) => b.count - a.count)
                    .map((s) => (
                      <div
                        key={s.name}
                        className="flex items-center justify-between rounded-lg border p-3"
                      >
                        <div>
                          <p className="font-medium">{s.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {s.count}문제 풀이
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">
                            평균 {s.avg}
                            <span className="text-sm font-normal text-muted-foreground">
                              /5
                            </span>
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Recent attempts list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">풀이 내역</CardTitle>
        </CardHeader>
        <CardContent>
          {attempts.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              풀이 기록이 없습니다
            </p>
          ) : (
            <div className="space-y-3">
              {attempts.slice(0, 20).map((attempt) => (
                <div
                  key={attempt.id}
                  className="flex items-start justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {attempt.question.content.slice(0, 60)}...
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {attempt.question.subject.name}
                      </Badge>
                      {attempt.question.topic && (
                        <Badge variant="secondary" className="text-xs">
                          {attempt.question.topic.name}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(attempt.createdAt).toLocaleString("ko-KR", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-0.5 shrink-0">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`size-3.5 ${
                          s <= attempt.score
                            ? "fill-yellow-400 text-yellow-400"
                            : "text-muted-foreground/30"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
