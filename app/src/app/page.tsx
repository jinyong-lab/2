import {
  FileText,
  CalendarCheck,
  BarChart3,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { getDb } from "@/lib/db"

async function getStats() {
  const prisma = await getDb()
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

  return {
    totalQuestions,
    todayAttempts,
    averageScore: Math.round(averageScore * 10) / 10,
    subjectProgress,
  }
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
  ]

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">임용고시 문제은행</h1>
        <p className="mt-1 text-sm text-muted-foreground">2027 전문상담교사</p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
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

      <div className="grid gap-6 lg:grid-cols-1">
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
                      <span className="truncate min-w-0 flex-1 mr-2 font-medium">{subject.name}</span>
                      <span className="shrink-0 text-muted-foreground">
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
      </div>
    </div>
  )
}
