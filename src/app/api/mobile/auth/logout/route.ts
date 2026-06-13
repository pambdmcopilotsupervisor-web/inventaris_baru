import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireMobileAuth } from "@/lib/mobile-auth"
import { createHash } from "crypto"

// POST /api/mobile/auth/logout
// Hapus token dari database

export async function POST(req: NextRequest) {
  const auth = await requireMobileAuth(req)
  if ("error" in auth) return auth.error

  try {
    const authHeader = req.headers.get("Authorization") ?? ""
    const rawToken = authHeader.slice(7).trim()
    const hashedToken = createHash("sha256").update(rawToken).digest("hex")
    await prisma.mobile_sessions.deleteMany({ where: { token: hashedToken } })
    return NextResponse.json({ success: true, message: "Logout berhasil" })
  } catch {
    return NextResponse.json({ error: "Logout gagal" }, { status: 500 })
  }
}
