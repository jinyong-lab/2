import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { verifyPassword, createToken, AUTH_COOKIE_NAME } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, password } = body

    if (!username || !password) {
      return NextResponse.json(
        { error: "아이디와 비밀번호를 입력해주세요" },
        { status: 400 }
      )
    }

    const prisma = await getDb()

    const user = await prisma.user.findUnique({
      where: { username },
    })

    if (!user) {
      return NextResponse.json(
        { error: "아이디 또는 비밀번호가 올바르지 않습니다" },
        { status: 401 }
      )
    }

    const valid = await verifyPassword(password, user.password)

    if (!valid) {
      return NextResponse.json(
        { error: "아이디 또는 비밀번호가 올바르지 않습니다" },
        { status: 401 }
      )
    }

    const token = await createToken(user.id, user.username)

    const response = NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
      },
    })

    response.cookies.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    })

    return response
  } catch (error) {
    console.error("Login error:", error)
    return NextResponse.json(
      { error: "로그인에 실패했습니다" },
      { status: 500 }
    )
  }
}
