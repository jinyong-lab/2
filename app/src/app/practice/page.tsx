import Link from "next/link"
import {
  Shuffle,
  FolderOpen,
  RotateCcw,
  Star,
  TextCursorInput,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { prisma } from "@/lib/db"

async function getPracticeModeData() {
  const totalQuestions = await prisma.question.count()

  const subjects = await prisma.subject.findMany({
    include: { _count: { select: { questions: true } } },
    orderBy: { category: "asc" },
  })

  const wrongAttempts = await prisma.attempt.findMany({
    where: { score: { lte: 2 } },
    select: { questionId: true },
    distinct: ["questionId"],
  })

  const bookmarkCount = await prisma.bookmark.count()

  const blankQuestionCount = await prisma.question.count({
    where: { type: "blank" },
  })

  return {
    totalQuestions,
    subjects,
    wrongCount: wrongAttempts.length,
    bookmarkCount,
    blankQuestionCount,
  }
}

export default async function PracticePage() {
  const data = await getPracticeModeData()

  const practiceCards = [
    {
      title: "전체 랜덤",
      description: "모든 과목에서 랜덤으로 문제를 풀어봅니다",
      icon: Shuffle,
      href: "/practice/quiz?mode=random&count=20",
      count: data.totalQuestions,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50 dark:bg-blue-950/50",
    },
    {
      title: "오답 복습",
      description: "점수가 낮았던 문제를 다시 풀어봅니다",
      icon: RotateCcw,
      href: "/practice/quiz?mode=wrong&count=20",
      count: data.wrongCount,
      color: "text-red-600 dark:text-red-400",
      bg: "bg-red-50 dark:bg-red-950/50",
    },
    {
      title: "즐겨찾기 문제",
      description: "즐겨찾기에 추가한 문제만 풀어봅니다",
      icon: Star,
      href: "/practice/quiz?mode=bookmarked&count=20",
      count: data.bookmarkCount,
      color: "text-yellow-600 dark:text-yellow-400",
      bg: "bg-yellow-50 dark:bg-yellow-950/50",
    },
    {
      title: "빈칸 채우기",
      description: "핵심 개념을 빈칸에 채워넣는 문제입니다",
      icon: TextCursorInput,
      href: "/practice/blank",
      count: data.blankQuestionCount,
      color: "text-purple-600 dark:text-purple-400",
      bg: "bg-purple-50 dark:bg-purple-950/50",
    },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">문제 풀기</h1>
        <p className="mt-2 text-muted-foreground">
          원하는 풀이 모드를 선택하세요
        </p>
      </div>

      {/* Practice mode cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {practiceCards.map((card) => {
          const Icon = card.icon
          return (
            <Link key={card.title} href={card.href}>
              <Card className="h-full transition-colors hover:bg-accent/50">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.bg}`}
                    >
                      <Icon className={`size-5 ${card.color}`} />
                    </div>
                    <Badge variant="secondary">{card.count}문제</Badge>
                  </div>
                  <CardTitle className="text-lg">{card.title}</CardTitle>
                  <CardDescription>{card.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          )
        })}
      </div>

      {/* Subject-based practice */}
      <div>
        <h2 className="mb-4 text-xl font-semibold">과목별 풀기</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.subjects.map((subject) => (
            <Link
              key={subject.id}
              href={`/practice/quiz?subject=${subject.id}&mode=random&count=20`}
            >
              <Card className="transition-colors hover:bg-accent/50">
                <CardContent className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FolderOpen className="size-5 text-primary" />
                    <div>
                      <p className="font-medium">{subject.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {subject.category}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline">
                    {subject._count.questions}문제
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
          {data.subjects.length === 0 && (
            <p className="col-span-full text-sm text-muted-foreground">
              등록된 과목이 없습니다
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
