import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/session"

/**
 * POST /api/auth/refresh-menus
 * Refresh allowed_menus di session tanpa perlu logout-login.
 * Dipanggil otomatis oleh AuthContext setiap kali user membuka halaman.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session.user) {
      return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 })
    }

    let allowed_menus: string[] | null = null
    if (session.user.role !== "admin") {
      try {
        const perms = await prisma.user_menu_permissions.findMany({
          where: { user_id: BigInt(session.user.id) },
          select: { menu_href: true },
        })
        if (perms.length > 0) {
          allowed_menus = perms.map((p) => p.menu_href)
        }
      } catch {
        // Tabel belum ada — tampilkan semua menu
      }
    }

    // Update session dengan allowed_menus terbaru
    session.user.allowed_menus = allowed_menus
    await session.save()

    return NextResponse.json({ allowed_menus })
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
