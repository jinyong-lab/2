import type { Metadata, Viewport } from "next"
import { Providers } from "@/components/Providers"
import "./globals.css"

export const viewport: Viewport = {
  themeColor: "#6366f1",
}

export const metadata: Metadata = {
  title: "임용고시 문제은행 | 전문상담교사 2027",
  description: "2027학년도 전문상담교사 임용시험 준비를 위한 문제은행 및 학습 도우미",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "임용문제은행",
  },
  icons: {
    apple: "/icons/icon-192.svg",
  },
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
          {children}
        </Providers>
      </body>
    </html>
  )
}
