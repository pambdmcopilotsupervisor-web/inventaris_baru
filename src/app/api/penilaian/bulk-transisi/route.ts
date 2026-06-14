import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { doTransition, isStatusPenilaian } from "@/lib/penilaian-workflow"
import type { StatusPenilaian } from "@/lib/penilaian-workflow"
import { prisma } from "@/lib/prisma"
import { getBawahanPenilaianMultiLevelIds } from "@/lib/penilaian-scope"

// POST /api/penilaian/bulk-transisi
// Body: { ids: number[], ke: StatusPenilaian, catatan?: string }
// Digunakan untuk bulk approve (manager) dan "kunci semua" (admin/hrd)

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error

  const karyawanId = auth.user.karyawan_id
  if (!karyawanId) return NextResponse.json({ error: "Akun belum terhubung ke data karyawan" }, { status: 422 })

  try {
    const body = await req.json()
    const rawIds: unknown[] = Array.isArray(body.ids) ? body.ids : []
    const ids: number[] = Array.from(new Set(rawIds.map((id: unknown) => Number(id))))
    const ke      = body.ke
    const catatan = (body.catatan as string | undefined) ?? ""

    if (!isStatusPenilaian(ke)) return NextResponse.json({ error: "Status tujuan tidak valid" }, { status: 400 })
    if (!ids.length)    return NextResponse.json({ error: "Pilih minimal 1 penilaian" }, { status: 400 })
    if (ids.length > 100) return NextResponse.json({ error: "Maksimum 100 penilaian sekaligus" }, { status: 400 })
    if (ids.some(id => !Number.isSafeInteger(id) || id <= 0)) {
      return NextResponse.json({ error: "Semua ID penilaian harus berupa integer positif" }, { status: 400 })
    }

    // Validasi semua IDs dalam scope user
    type PenRow = { id: bigint; status: StatusPenilaian; id_pegawai: bigint }
    const rows = await prisma.$queryRaw<PenRow[]>`
      SELECT id, status, id_pegawai
      FROM penilaian_kinerja
      WHERE id IN (${Prisma.join(ids.map(id => BigInt(id)))})
    `
    const rowsById = new Map(rows.map(row => [Number(row.id), row]))

    let bawahanIds: bigint[] = []
    if (auth.user.role !== "admin" && auth.user.role !== "hrd") {
      bawahanIds = await getBawahanPenilaianMultiLevelIds(karyawanId)
    }

    const results: { id: number; success: boolean; message: string }[] = []

    for (const id of ids) {
      const row = rowsById.get(id)
      if (!row) { results.push({ id, success: false, message: "Data penilaian tidak ditemukan" }); continue }

      // Cek scope
      if (auth.user.role !== "admin" && auth.user.role !== "hrd") {
        const inScope = bawahanIds.some(bid => BigInt(bid) === row.id_pegawai)
        if (!inScope) { results.push({ id, success: false, message: "Tidak dalam scope" }); continue }
      }

      try {
        const result = await doTransition({
          idPenilaian: id,
          ke,
          karyawanId,
          role: auth.user.role ?? "hrd",
          catatan,
        })
        results.push({ id, success: true, message: result.message })
      } catch (err) {
        results.push({ id, success: false, message: err instanceof Error ? err.message : "Gagal" })
      }
    }

    const berhasil = results.filter(r => r.success).length
    const gagal    = results.filter(r => !r.success).length

    await writeAuditLog({
      user: auth.user,
      action: "UPDATE",
      modelType: "penilaian_kinerja",
      dataBaru: { bulk: true, ke, berhasil, gagal, ids },
      ip: getClientIp(req),
    })

    return NextResponse.json(serialize({ berhasil, gagal, results, message: `${berhasil} penilaian berhasil, ${gagal} gagal.` }))
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal" }, { status: 400 })
  }
}
