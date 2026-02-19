import Link from "next/link"
import { FolderOpen } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { prisma } from "@/lib/db"

async function getSubjectsData() {
  const subjects = await prisma.subject.findMany({
    include: {
      _count: { select: { questions: true } },
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  })

  const subjectProgress = await Promise.all(
    subjects.map(async (subject) => {
      const attempted = await prisma.attempt.findMany({
        where: { question: { subjectId: subject.id } },
        select: { questionId: true },
        distinct: ["questionId"],
      })
      return {
        ...subject,
        attempted: attempted.length,
      }
    })
  )

  // Group by category
  const grouped: Record<
    string,
    typeof subjectProgress
  > = {}
  for (const s of subjectProgress) {
    if (!grouped[s.category]) grouped[s.category] = []
    grouped[s.category].push(s)
  }

  return grouped
}

export default async function SubjectsPage() {
  const grouped = await getSubjectsData()
  const categories = Object.keys(grouped)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">과목별 학습</h1>
        <p className="mt-2 text-muted-foreground">
          과목을 선택하여 집중적으로 학습하세요
        </p>
      </div>

      {categories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FolderOpen className="size-12 text-muted-foreground/40 mb-3" />
          <p className="text-lg font-medium">등록된 과목이 없습니다</p>
          <p className="text-sm text-muted-foreground mt-1">
            문제를 추가하면 과목이 자동으로 생성됩니다
          </p>
        </div>
      ) : (
        categories.map((category) => (
          <div key={category}>
            <h2 className="mb-4 text-lg font-semibold flex items-center gap-2">
              <Badge variant="secondary" className="text-sm">
                {category}
              </Badge>
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {grouped[category].map((subject) => {
                const total = subject._count.questions
                const progress =
                  total > 0
                    ? Math.round((subject.attempted / total) * 100)
                    : 0

                return (
                  <Link key={subject.id} href={`/subjects/${subject.id}`}>
                    <Card className="h-full transition-colors hover:bg-accent/50">
                      <CardHeader>
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                            <FolderOpen className="size-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-base">
                              {subject.name}
                            </CardTitle>
                            <CardDescription>
                              {total}문제
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">진도율</span>
                            <span className="font-medium">{progress}%</span>
                          </div>
                          <Progress value={progress} className="h-2" />
                          <p className="text-xs text-muted-foreground">
                            {subject.attempted} / {total} 문제 풀이 완료
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
