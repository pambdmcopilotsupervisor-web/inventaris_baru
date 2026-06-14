import { NextRequest, NextResponse } from "next/server"
import { serialize } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/penilaian/riwayat-saya
// Riwayat penilaian kinerja milik user yang login untuk semua periode

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error

  const karyawanId = auth.user.karyawan_id
  if (!karyawanId) return NextResponse.json({ error: "Akun belum terhubung ke data karyawan" }, { status: 422 })

  try {
    type Row = {
      id: bigint
      id_periode: bigint
      kode_periode: string
      nama_periode: string
      tanggal_mulai: Date
      tanggal_selesai: Date
      status: string
      nilai_kehadiran: string | number | null
      nilai_capaian_sasaran: string | number | null
      nilai_perilaku: string | number | null
      nilai_pengembangan: string | number | null
      nilai_akhir: string | number | null
      tanggal_diajukan: Date | null
      tanggal_final: Date | null
      catatan_atasan: string | null
    }

    const rows = await prisma.$queryRaw<Row[]>`
      SELECT
        pk.id,
        pk.id_periode,
        pp.kode_periode,
        pp.nama_periode,
        pp.tanggal_mulai,
        pp.tanggal_selesai,
        pk.status,
        pk.nilai_kehadiran,
        pk.nilai_capaian_sasaran,
        pk.nilai_perilaku,
        pk.nilai_pengembangan,
        pk.nilai_akhir,
        pk.tanggal_diajukan,
        pk.tanggal_final,
        pk.catatan_atasan
      FROM penilaian_kinerja pk
      JOIN periode_penilaian pp ON pp.id = pk.id_periode
      WHERE pk.id_pegawai = ${BigInt(karyawanId)}
      ORDER BY pp.tanggal_mulai DESC, pk.id DESC
    `

    return NextResponse.json(serialize(rows))
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 })
  }
}
