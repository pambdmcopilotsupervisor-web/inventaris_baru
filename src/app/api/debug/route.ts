import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// ⚠️ ENDPOINT DIAGNOSTIK SEMENTARA — HAPUS SETELAH SELESAI DEBUG
export async function GET(req: NextRequest) {
  const debugKey = req.nextUrl.searchParams.get("key")
  if (debugKey !== "pedami-debug-2026") {
    return NextResponse.json({ error: "Forbidden — tambahkan ?key=pedami-debug-2026" }, { status: 403 })
  }

  try {
    await prisma.$queryRaw`SELECT 1`

    const totalUsers = await prisma.users.count()
    const usersPreview = await prisma.users.findMany({
      select: { id: true, name: true, email: true, role: true },
      take: 10,
    })

    // Konversi BigInt ke string agar bisa di-serialize JSON
    const serialize = (obj: any): any => JSON.parse(JSON.stringify(obj, (_, v) =>
      typeof v === "bigint" ? v.toString() : v
    ))

    return NextResponse.json(serialize({
      status: "ok",
      database: "connected",
      totalUsers,
      usersPreview,
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
        databaseUrlHost: process.env.DATABASE_URL?.match(/@([^:\/]+)/)?.[1] ?? "unknown",
        databaseUrlDbName: process.env.DATABASE_URL?.match(/\/([^?/]+)(\?|$)/)?.[1] ?? "unknown",
      },
    }, { status: 500 })
  }
}
