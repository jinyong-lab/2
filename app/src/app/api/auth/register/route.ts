import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { hashPassword, createToken, AUTH_COOKIE_NAME } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, password, name } = body

    if (!username || !password) {
      return NextResponse.json(
        { error: "아이디와 비밀번호를 입력해주세요" },
        { status: 400 }
      )
    }

    if (username.length < 2 || username.length > 20) {
      return NextResponse.json(
        { error: "아이디는 2~20자여야 합니다" },
        { status: 400 }
      )
    }

    if (password.length < 4) {
      return NextResponse.json(
        { error: "비밀번호는 4자 이상이어야 합니다" },
        { status: 400 }
      )
    }

    const prisma = await getDb()

    const existing = await prisma.user.findUnique({
      where: { username },
    })

    if (existing) {
      return NextResponse.json(
        { error: "이미 사용 중인 아이디입니다" },
        { status: 409 }
      )
    }

    const hashedPassword = await hashPassword(password)

    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        name: name || null,
      },
    })

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
    console.error("Registration error:", error)
    return NextResponse.json(
      { error: "회원가입에 실패했습니다" },
      { status: 500 }
    )
  }
}
