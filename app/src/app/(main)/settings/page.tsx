"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Loader2, Save, Eye, EyeOff, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()

  const [apiKey, setApiKey] = useState("")
  const [apiKeySource, setApiKeySource] = useState<"db" | "env" | null>(null)
  const [apiKeyPlaceholder, setApiKeyPlaceholder] = useState("sk-...")
  const [showApiKey, setShowApiKey] = useState(false)
  const [timerDefault, setTimerDefault] = useState("off")
  const [questionsPerSession, setQuestionsPerSession] = useState("20")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    async function fetchSettings() {
      setLoading(true)
      try {
        const res = await fetch("/api/settings")
        if (res.ok) {
          const data = await res.json()
          if (data.openai_api_key_source === "env") {
            // Key comes from .env — show masked as placeholder, leave input empty
            setApiKeySource("env")
            setApiKeyPlaceholder(data.openai_api_key)
          } else if (data.openai_api_key) {
            setApiKey(data.openai_api_key)
            setApiKeySource("db")
          }
          if (data.timer_default) setTimerDefault(data.timer_default)
          if (data.questions_per_session)
            setQuestionsPerSession(data.questions_per_session)
        }
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    fetchSettings()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      const payload: Record<string, string> = {
        timer_default: timerDefault,
        questions_per_session: questionsPerSession,
      }
      // Only save api key to DB if user explicitly typed one
      if (apiKey) payload.openai_api_key = apiKey
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">설정</h1>
        <p className="mt-2 text-muted-foreground">
          앱 환경을 설정하세요
        </p>
      </div>

      {/* API Key */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">OpenAI API 키</CardTitle>
          <CardDescription>
            AI 문제 생성을 위한 OpenAI API 키를 입력하세요.
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-1 text-primary hover:underline"
            >
              API 키 발급
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {apiKeySource === "env" && (
            <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              환경변수(.env)에서 API 키를 사용 중입니다. 새 키를 입력하면 DB에 저장되어 우선 적용됩니다.
            </p>
          )}
          <div className="relative">
            <Input
              type={showApiKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={apiKeyPlaceholder}
              className="pr-10"
            />
            <Button
              variant="ghost"
              size="icon-xs"
              className="absolute right-2 top-1/2 -translate-y-1/2"
              onClick={() => setShowApiKey(!showApiKey)}
            >
              {showApiKey ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {apiKeySource === "env"
              ? "새 키를 입력하지 않으면 환경변수의 키가 계속 사용됩니다"
              : "API 키는 로컬 데이터베이스에 저장됩니다"}
          </p>
        </CardContent>
      </Card>

      {/* Theme */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">테마</CardTitle>
          <CardDescription>앱의 외관을 설정합니다</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>테마 선택</Label>
            {mounted && (
              <Select value={theme || "system"} onValueChange={setTheme}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">라이트 모드</SelectItem>
                  <SelectItem value="dark">다크 모드</SelectItem>
                  <SelectItem value="system">시스템 설정</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Study settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">학습 설정</CardTitle>
          <CardDescription>기본 학습 환경을 설정합니다</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>타이머 기본값</Label>
            <Select value={timerDefault} onValueChange={setTimerDefault}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="on">켜기</SelectItem>
                <SelectItem value="off">끄기</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>세션당 문제 수</Label>
            <Select
              value={questionsPerSession}
              onValueChange={setQuestionsPerSession}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10문제</SelectItem>
                <SelectItem value="20">20문제</SelectItem>
                <SelectItem value="30">30문제</SelectItem>
                <SelectItem value="50">50문제</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          설정 저장
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-green-600">
            <CheckCircle className="size-4" />
            저장되었습니다
          </span>
        )}
      </div>
    </div>
  )
}
