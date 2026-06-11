import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

// ⚠️ ENDPOINT DIAGNOSTIK SEMENTARA — HAPUS SETELAH SELESAI DEBUG
export async function GET(req: NextRequest) {
  const debugKey = req.nextUrl.searchParams.get("key")
  if (debugKey !== "pedami-debug-2026") {
    return NextResponse.json({ error: "Forbidden — tambahkan ?key=pedami-debug-2026" }, { status: 403 })
  }

  const testEmail    = req.nextUrl.searchParams.get("email")
  const testPassword = req.nextUrl.searchParams.get("pw")

  try {
    await prisma.$queryRaw`SELECT 1`

    const totalUsers = await prisma.users.count()
    const usersPreview = await prisma.users.findMany({
      select: { id: true, name: true, email: true, role: true },
      take: 10,
    })

    const serialize = (obj: any): any => JSON.parse(JSON.stringify(obj, (_, v) =>
      typeof v === "bigint" ? v.toString() : v
    ))

    // Test login jika email dan password diberikan
    let loginTest: object | null = null
    if (testEmail && testPassword) {
      const found = await prisma.$queryRaw<{ id: bigint; email: string | null; password: string }[]>`
        SELECT id, email, password FROM users WHERE LOWER(email) = LOWER(${testEmail}) LIMIT 1
      `
      if (found.length === 0) {
        loginTest = { found: false, reason: "User tidak ditemukan" }
      } else {
        const user = found[0]
        const hashPrefix = user.password.substring(0, 7)
        const isValid = await bcrypt.compare(testPassword, user.password)
        loginTest = {
          found: true,
          emailInDb: user.email,
          hashPrefix,     // misal: $2y$12$ atau $2b$12$
          passwordMatch: isValid,
        }
      }
    }

    return NextResponse.json(serialize({
      status: "ok",
      database: "connected",
      totalUsers,
      usersPreview,
      loginTest,
      hint: loginTest === null ? "Tambahkan ?email=xxx&pw=xxx untuk test login" : null,
      env: {
        NODE_ENV: process.env.NODE_ENV,
        hasSessionSecret: !!process.env.SESSION_SECRET,
        sessionSecretLength: process.env.SESSION_SECRET?.length ?? 0,
        hasDatabaseUrl: !!process.env.DATABASE_URL,
        databaseUrlHost: process.env.DATABASE_URL?.match(/@([^:\/]+)/)?.[1] ?? "unknown",
        databaseUrlDbName: process.env.DATABASE_URL?.match(/\/([^?/]+)(\?|$)/)?.[1] ?? "unknown",
      },
    }))
  } catch (error: any) {
    return NextResponse.json({
      status: "error",
      message: error?.message ?? "Unknown error",
      env: {
        hasSessionSecret: !!process.env.SESSION_SECRET,
        hasDatabaseUrl: !!process.env.DATABASE_URL,
      },
    }, { status: 500 })
  }
}
