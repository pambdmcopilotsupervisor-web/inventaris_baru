import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"

/**
 * GET /api/admin/menu-access?userId=X
 * Ambil daftar menu_href yang diizinkan untuk user tertentu.
 * Return array string. Empty array = semua dibatasi. Null tidak dikembalikan (selalu array).
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin"])
  if ("error" in auth) return auth.error

  const userId = req.nextUrl.searchParams.get("userId")
  if (!userId) {
    return NextResponse.json({ error: "userId wajib diisi" }, { status: 400 })
  }

  const perms = await prisma.user_menu_permissions.findMany({
    where: { user_id: BigInt(userId) },
    select: { menu_href: true },
    orderBy: { menu_href: "asc" },
  })

  return NextResponse.json(perms.map((p) => p.menu_href))
}

/**
 * POST /api/admin/menu-access
 * Body: { userId: number, menuHrefs: string[] }
 * Simpan hak akses menu untuk user. Gantikan semua entri sebelumnya.
 * menuHrefs: [] = semua menu dibatasi (tidak ada yang boleh diakses).
 * Untuk hapus batasan (tampilkan semua), gunakan DELETE.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["admin"])
  if ("error" in auth) return auth.error

  const body = await req.json()
  const userId: number = body.userId
  const menuHrefs: string[] = body.menuHrefs ?? []

  if (!userId) {
    return NextResponse.json({ error: "userId wajib diisi" }, { status: 400 })
  }
  if (!Array.isArray(menuHrefs)) {
    return NextResponse.json({ error: "menuHrefs harus array" }, { status: 400 })
  }

  const now = new Date()

  // Gantikan semua entri sebelumnya dengan transaksi atomik
  await prisma.$transaction(async (tx) => {
    // Hapus semua entri lama untuk user ini
    await tx.user_menu_permissions.deleteMany({ where: { user_id: BigInt(userId) } })

    // Jika ada menu yang dipilih, insert semuanya
    if (menuHrefs.length > 0) {
      await tx.user_menu_permissions.createMany({
        data: menuHrefs.map((href) => ({
          user_id: BigInt(userId),
          menu_href: href,
          created_at: now,
          updated_at: now,
        })),
        skipDuplicates: true,
      })
    }
  })

  return NextResponse.json({ ok: true, saved: menuHrefs.length })
}

/**
 * DELETE /api/admin/menu-access?userId=X
 * Hapus semua batasan menu untuk user ini (user akan melihat semua menu kembali).
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireRole(req, ["admin"])
  if ("error" in auth) return auth.error

  const userId = req.nextUrl.searchParams.get("userId")
  if (!userId) {
    return NextResponse.json({ error: "userId wajib diisi" }, { status: 400 })
  }

  await prisma.user_menu_permissions.deleteMany({ where: { user_id: BigInt(userId) } })

  return NextResponse.json({ ok: true })
}
