import Link from "next/link"
import { notFound } from "next/navigation"
import { BookOpen, Star } from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { prisma } from "@/lib/db"

interface PageProps {
  params: Promise<{ id: string }>
}

async function getSubjectDetail(id: number) {
  const subject = await prisma.subject.findUnique({
    where: { id },
    include: {
      topics: {
        include: {
          _count: { select: { questions: true } },
        },
        orderBy: { name: "asc" },
      },
      _count: { select: { questions: true } },
    },
  })

  if (!subject) return null

  const attempted = await prisma.attempt.findMany({
    where: { question: { subjectId: id } },
    select: { questionId: true },
    distinct: ["questionId"],
  })

  const avgScore = await prisma.attempt.aggregate({
    where: { question: { subjectId: id } },
    _avg: { score: true },
  })

  const recentAttempts = await prisma.attempt.findMany({
    where: { question: { subjectId: id } },
    include: {
      question: {
        include: { topic: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  })

  // Topic progress
  const topicProgress = await Promise.all(
    subject.topics.map(async (topic) => {
      const topicAttempted = await prisma.attempt.findMany({
        where: { question: { topicId: topic.id } },
        select: { questionId: true },
        distinct: ["questionId"],
      })
      return {
        ...topic,
        attempted: topicAttempted.length,
      }
    })
  )

  return {
    subject,
    attempted: attempted.length,
    averageScore: avgScore._avg.score || 0,
    recentAttempts,
    topicProgress,
  }
}

export default async function SubjectDetailPage({ params }: PageProps) {
  const { id } = await params
  const subjectId = parseInt(id, 10)
  const data = await getSubjectDetail(subjectId)

  if (!data) notFound()

  const { subject, attempted, averageScore, recentAttempts, topicProgress } = data
  const total = subject._count.questions
  const progress = total > 0 ? Math.round((attempted / total) * 100) : 0

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge variant="secondary" className="mb-2">
            {subject.category}
          </Badge>
          <h1 className="text-2xl font-bold tracking-tight">{subject.name}</h1>
          <p className="mt-1 text-muted-foreground">
            총 {total}문제 | {attempted}문제 풀이 완료 | 평균{" "}
            {Math.round(averageScore * 10) / 10}점
          </p>
        </div>
        <Button asChild size="lg">
          <Link href={`/practice/quiz?subject=${subject.id}&mode=random&count=20`}>
            <BookOpen className="size-4" />
            이 과목 풀기
          </Link>
        </Button>
      </div>

      {/* Overall progress */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>전체 진도율</span>
              <span className="font-medium">{progress}%</span>
            </div>
            <Progress value={progress} className="h-3" />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Topics */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">주제별 현황</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topicProgress.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                주제가 등록되지 않았습니다
              </p>
            ) : (
              topicProgress.map((topic) => {
                const topicTotal = topic._count.questions
                const topicProg =
                  topicTotal > 0
                    ? Math.round((topic.attempted / topicTotal) * 100)
                    : 0
                return (
                  <Link
                    key={topic.id}
                    href={`/practice/quiz?subject=${subject.id}&topic=${topic.id}&mode=random&count=20`}
                    className="block"
                  >
                    <div className="rounded-lg border p-3 transition-colors hover:bg-accent/50">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium">
                          {topic.name}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {topic.attempted}/{topicTotal}
                        </Badge>
                      </div>
                      <Progress value={topicProg} className="h-1.5" />
                    </div>
                  </Link>
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
            {recentAttempts.length === 0 ? (
              <div className="flex flex-col items-center py-6 text-center">
                <BookOpen className="size-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">
                  아직 풀이 기록이 없습니다
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentAttempts.map((attempt) => (
                  <div
                    key={attempt.id}
                    className="flex items-start justify-between gap-3 rounded-lg border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        {attempt.question.content.slice(0, 50)}...
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        {attempt.question.topic && (
                          <Badge variant="outline" className="text-xs">
                            {attempt.question.topic.name}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {new Date(attempt.createdAt).toLocaleDateString("ko-KR")}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-0.5 shrink-0">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`size-3 ${
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
    </div>
  )
}
