import type { Metadata } from "next"
import { Providers } from "@/components/Providers"
import { Sidebar } from "@/components/Sidebar"
import "./globals.css"

export const metadata: Metadata = {
  title: "임용고시 문제은행 | 전문상담교사 2027",
  description: "2027학년도 전문상담교사 임용시험 준비를 위한 문제은행 및 학습 도우미",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="antialiased min-h-screen">
        <Providers>
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 min-h-screen pt-14 lg:pt-0 lg:pl-64">
              <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
                {children}
              </div>
            </main>
          </div>
        </Providers>
      </body>
    </html>
  )
}
