import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// ⚠️ ENDPOINT DIAGNOSTIK SEMENTARA — HAPUS SETELAH SELESAI DEBUG
// Hanya aktif di development atau dengan query param ?debug=1
export async function GET(req: NextRequest) {
  // Batasi akses — hanya boleh dari localhost atau dengan secret key
  const debugKey = req.nextUrl.searchParams.get("key")
  const expectedKey = process.env.SESSION_SECRET?.slice(0, 8)
  if (debugKey !== expectedKey) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    // Test koneksi database
    await prisma.$queryRaw`SELECT 1`

    // Hitung users
    const totalUsers = await prisma.users.count()
    const usersPreview = await prisma.users.findMany({
      select: { id: true, name: true, email: true, role: true },
      take: 5,
    })

    return NextResponse.json({
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
      },
    })
  } catch (error: any) {
    return NextResponse.json({
      status: "error",
      message: error?.message ?? "Unknown error",
      env: {
        hasSessionSecret: !!process.env.SESSION_SECRET,
        hasDatabaseUrl: !!process.env.DATABASE_URL,
        databaseUrlHost: process.env.DATABASE_URL?.match(/@([^:\/]+)/)?.[1] ?? "unknown",
      },
    }, { status: 500 })
  }
}
