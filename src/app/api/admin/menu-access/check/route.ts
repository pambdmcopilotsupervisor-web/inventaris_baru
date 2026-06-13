import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"
import type { NextRequest } from "next/server"

/**
 * GET /api/admin/menu-access/check
 * Cek apakah tabel user_menu_permissions sudah ada di database.
 * Hanya untuk admin — digunakan untuk troubleshooting.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin"])
  if ("error" in auth) return auth.error

  try {
    const count = await prisma.user_menu_permissions.count()
    return NextResponse.json({ tabel_ada: true, jumlah_record: count })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({
      tabel_ada: false,
      pesan: "Tabel user_menu_permissions belum ada. Jalankan migration SQL terlebih dahulu.",
      error: msg.substring(0, 200),
    }, { status: 200 })
  }
}
