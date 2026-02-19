import Link from "next/link"
import {
  BookOpen,
  Sparkles,
  TextCursorInput,
  FileText,
  CalendarCheck,
  BarChart3,
  Star,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { prisma } from "@/lib/db"

async function getStats() {
  const totalQuestions = await prisma.question.count()

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayAttempts = await prisma.attempt.count({
    where: { createdAt: { gte: todayStart } },
  })

  const avgResult = await prisma.attempt.aggregate({
    _avg: { score: true },
  })
  const averageScore = avgResult._avg.score || 0

  const bookmarkCount = await prisma.bookmark.count()

  const subjects = await prisma.subject.findMany({
    include: { _count: { select: { questions: true } } },
    orderBy: { category: "asc" },
  })

  const subjectProgress = await Promise.all(
    subjects.map(async (subject) => {
      const attemptedQuestions = await prisma.attempt.findMany({
        where: { question: { subjectId: subject.id } },
        select: { questionId: true },
        distinct: ["questionId"],
      })
      return {
        id: subject.id,
        name: subject.name,
        category: subject.category,
        total: subject._count.questions,
        attempted: attemptedQuestions.length,
      }
    })
  )

  const recentAttempts = await prisma.attempt.findMany({
    include: {
      question: { include: { subject: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  })

  return {
    totalQuestions,
    todayAttempts,
    averageScore: Math.round(averageScore * 10) / 10,
    bookmarkCount,
    subjectProgress,
    recentAttempts,
  }
}

function ScoreStars({ score }: { score: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`size-3.5 ${
            s <= score
              ? "fill-yellow-400 text-yellow-400"
              : "text-muted-foreground/30"
          }`}
        />
      ))}
    </div>
  )
}

export default async function HomePage() {
  const stats = await getStats()

  const statCards = [
    {
      title: "총 문제 수",
      value: stats.totalQuestions.toLocaleString(),
      icon: FileText,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50 dark:bg-blue-950/50",
    },
    {
      title: "오늘 풀이 수",
      value: stats.todayAttempts.toLocaleString(),
      icon: CalendarCheck,
      color: "text-green-600 dark:text-green-400",
      bg: "bg-green-50 dark:bg-green-950/50",
    },
    {
      title: "평균 점수",
      value: `${stats.averageScore} / 5`,
      icon: BarChart3,
      color: "text-orange-600 dark:text-orange-400",
      bg: "bg-orange-50 dark:bg-orange-950/50",
    },
    {
      title: "즐겨찾기",
      value: stats.bookmarkCount.toLocaleString(),
      icon: Star,
      color: "text-purple-600 dark:text-purple-400",
      bg: "bg-purple-50 dark:bg-purple-950/50",
    },
  ]

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          2027 전문상담교사 임용시험 준비
        </h1>
        <p className="mt-2 text-muted-foreground">
          오늘도 꾸준히 학습하세요. 합격의 그 날까지 함께합니다.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.title}>
              <CardContent className="flex items-center gap-4">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-xl ${stat.bg}`}
                >
                  <Icon className={`size-6 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link href="/practice">
            <BookOpen className="size-4" />
            문제 풀기
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/generate">
            <Sparkles className="size-4" />
            AI 문제 생성
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/practice/blank">
            <TextCursorInput className="size-4" />
            빈칸 채우기
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Subject Progress */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">과목별 진도</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {stats.subjectProgress.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                등록된 과목이 없습니다
              </p>
            ) : (
              stats.subjectProgress.map((subject) => {
                const progress =
                  subject.total > 0
                    ? Math.round((subject.attempted / subject.total) * 100)
                    : 0
                return (
                  <div key={subject.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{subject.name}</span>
                        <Badge variant="secondary" className="text-xs">
                          {subject.category}
                        </Badge>
                      </div>
                      <span className="text-muted-foreground">
                        {subject.attempted}/{subject.total}
                      </span>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>

        {/* Recent Attempts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">최근 풀이</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.recentAttempts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <BookOpen className="size-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  아직 풀이한 문제가 없습니다
                </p>
                <Button asChild variant="link" className="mt-2">
                  <Link href="/practice">첫 문제 풀러 가기</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {stats.recentAttempts.map((attempt) => (
                  <div
                    key={attempt.id}
                    className="flex items-start justify-between gap-3 rounded-lg border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {attempt.question.content.slice(0, 60)}...
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {attempt.question.subject.name}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(attempt.createdAt).toLocaleDateString("ko-KR")}
                        </span>
                      </div>
                    </div>
                    <ScoreStars score={attempt.score} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
