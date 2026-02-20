import { getDb } from "@/lib/db"
import PracticeSelector from "@/components/PracticeSelector"

async function getSubjects() {
  const prisma = await getDb()
  return prisma.subject.findMany({
    include: { _count: { select: { questions: true } } },
    orderBy: { category: "asc" },
  })
}

export default async function PracticePage() {
  const subjects = await getSubjects()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">문제 풀기</h1>
        <p className="mt-2 text-muted-foreground">
          과목과 문제 수를 선택하고 시작하세요
        </p>
      </div>

      <PracticeSelector subjects={subjects} />
    </div>
  )
}
