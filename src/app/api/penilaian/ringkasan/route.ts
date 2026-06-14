import { NextRequest, NextResponse } from "next/server"
import { serialize } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getBawahanIds } from "@/lib/penilaian-target"

// GET /api/penilaian/ringkasan?id_periode=...
// Ringkasan penilaian per divisi atau per bawahan untuk manager/admin/hrd

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan"])
  if ("error" in auth) return auth.error

  const karyawanId = auth.user.karyawan_id
  if (!karyawanId) return NextResponse.json({ error: "Akun belum terhubung ke data karyawan" }, { status: 422 })

  try {
    const { searchParams } = new URL(req.url)
    const idPeriode = searchParams.get("id_periode")

    // Tentukan periode
    type PeriodeRow = { id: bigint; nama_periode: string }
    let periodeId: bigint
    if (idPeriode) {
      periodeId = BigInt(idPeriode)
    } else {
      const rows = await prisma.$queryRaw<PeriodeRow[]>`
        SELECT id, nama_periode FROM periode_penilaian
        ORDER BY CASE WHEN status = 'aktif' THEN 0 ELSE 1 END, tanggal_mulai DESC, id DESC
        LIMIT 1
      `
      if (!rows[0]) return NextResponse.json({ error: "Periode belum tersedia" }, { status: 404 })
      periodeId = rows[0].id
    }

    const periodeRows = await prisma.$queryRaw<PeriodeRow[]>`
      SELECT id, nama_periode FROM periode_penilaian WHERE id = ${periodeId} LIMIT 1
    `

    // Scope pegawai
    let bawahanIds: bigint[]
    if (auth.user.role === "admin" || auth.user.role === "hrd") {
      const rows = await prisma.$queryRaw<{ id: bigint }[]>`SELECT id FROM karyawans WHERE status_karyawan NOT IN ('Pensiun','Nonaktif')`
      bawahanIds = rows.map(r => r.id)
    } else {
      bawahanIds = await getBawahanIds(karyawanId, true)
    }

    if (bawahanIds.length === 0) return NextResponse.json({ periode: periodeRows[0], divisi: [] })

    const idList = bawahanIds.map(id => `${id}`).join(",")

    // Aggregasi per divisi
    type DivisiRow = {
      divisi_id: bigint | null
      nama_divisi: string | null
      total: bigint
      draft: bigint
      diajukan: bigint
      diverifikasi: bigint
      disetujui: bigint
      final: bigint
      rata_nilai_akhir: string | number | null
    }

    const divisi = await prisma.$queryRawUnsafe<DivisiRow[]>(`
      SELECT
        COALESCE(k.divisi_id, sub.divisi_id)                        AS divisi_id,
        COALESCE(d.nama_divisi, sub_d.nama_divisi, sub.nama_sub)    AS nama_divisi,
        COUNT(k.id) AS total,
        SUM(CASE WHEN COALESCE(pk.status, 'draft') = 'draft' THEN 1 ELSE 0 END) AS draft,
        SUM(CASE WHEN pk.status = 'diajukan' THEN 1 ELSE 0 END) AS diajukan,
        SUM(CASE WHEN pk.status = 'diverifikasi' THEN 1 ELSE 0 END) AS diverifikasi,
        SUM(CASE WHEN pk.status = 'disetujui' THEN 1 ELSE 0 END) AS disetujui,
        SUM(CASE WHEN pk.status = 'final' THEN 1 ELSE 0 END) AS final,
        ROUND(AVG(pk.nilai_akhir), 2) AS rata_nilai_akhir
      FROM karyawans k
      LEFT JOIN divisis d ON d.id = k.divisi_id
      LEFT JOIN subdivisis sub ON sub.id = k.subdivisi_id
      LEFT JOIN divisis sub_d ON sub_d.id = sub.divisi_id
      LEFT JOIN penilaian_kinerja pk ON pk.id_pegawai = k.id AND pk.id_periode = ${periodeId}
      WHERE k.id IN (${idList})
      GROUP BY COALESCE(k.divisi_id, sub.divisi_id), COALESCE(d.nama_divisi, sub_d.nama_divisi, sub.nama_sub)
      ORDER BY COALESCE(d.nama_divisi, sub_d.nama_divisi, sub.nama_sub) ASC
    `)

    // Total keseluruhan
    type TotalRow = { total: bigint; draft: bigint; diajukan: bigint; diverifikasi: bigint; disetujui: bigint; final: bigint; rata_nilai_akhir: string | number | null }
    const total = await prisma.$queryRawUnsafe<TotalRow[]>(`
      SELECT
        COUNT(k.id) AS total,
        SUM(CASE WHEN COALESCE(pk.status, 'draft') = 'draft' THEN 1 ELSE 0 END) AS draft,
        SUM(CASE WHEN pk.status = 'diajukan' THEN 1 ELSE 0 END) AS diajukan,
        SUM(CASE WHEN pk.status = 'diverifikasi' THEN 1 ELSE 0 END) AS diverifikasi,
        SUM(CASE WHEN pk.status = 'disetujui' THEN 1 ELSE 0 END) AS disetujui,
        SUM(CASE WHEN pk.status = 'final' THEN 1 ELSE 0 END) AS final,
        ROUND(AVG(pk.nilai_akhir), 2) AS rata_nilai_akhir
      FROM karyawans k
      LEFT JOIN penilaian_kinerja pk ON pk.id_pegawai = k.id AND pk.id_periode = ${periodeId}
      WHERE k.id IN (${idList})
    `)

    return NextResponse.json(serialize({ periode: periodeRows[0], divisi, total: total[0] }))
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 })
  }
}
