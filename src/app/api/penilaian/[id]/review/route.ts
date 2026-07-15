import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { prisma, serialize } from "@/lib/prisma"
import { getBawahanPenilaianMultiLevelIds } from "@/lib/penilaian-scope"
import { getNextActions } from "@/lib/penilaian-workflow"

// GET /api/penilaian/[id]/review
// Ringkasan penilaian + timeline approval + aksi tersedia untuk drawer review
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error

  const karyawanId = auth.user.karyawan_id
  if (!karyawanId) return NextResponse.json({ error: "Akun belum terhubung ke data karyawan" }, { status: 422 })

  try {
    const { id } = await params
    const penilaianId = Number(id)
    if (!Number.isInteger(penilaianId) || penilaianId <= 0) {
      return NextResponse.json({ error: "ID penilaian tidak valid" }, { status: 400 })
    }

    type HeaderRow = {
      id: bigint
      id_pegawai: bigint
      status: string
      nilai_akhir: number | null
      tanggal_diajukan: Date | null
      tanggal_diverifikasi: Date | null
      tanggal_disetujui: Date | null
      tanggal_final: Date | null
      catatan_pegawai: string | null
      catatan_atasan: string | null
      nama_karyawan: string
      jabatan: string
      nama_divisi: string | null
      nama_periode: string
    }

    const rows = await prisma.$queryRaw<HeaderRow[]>`
      SELECT
        pk.id,
        pk.id_pegawai,
        pk.status,
        pk.nilai_akhir,
        pk.tanggal_diajukan,
        pk.tanggal_diverifikasi,
        pk.tanggal_disetujui,
        pk.tanggal_final,
        pk.catatan_pegawai,
        pk.catatan_atasan,
        k.nama_karyawan,
        k.jabatan,
        d.nama_divisi,
        p.nama_periode
      FROM penilaian_kinerja pk
      JOIN karyawans k ON k.id = pk.id_pegawai
      LEFT JOIN divisis d ON d.id = k.divisi_id
      JOIN periode_penilaian p ON p.id = pk.id_periode
      WHERE pk.id = ${BigInt(penilaianId)}
      LIMIT 1
    `

    const header = rows[0]
    if (!header) return NextResponse.json({ error: "Data penilaian tidak ditemukan" }, { status: 404 })

    const role = auth.user.role ?? "user"
    let canAccess = role === "admin" || role === "hrd"
    if (!canAccess) {
      if (Number(header.id_pegawai) === karyawanId) {
        canAccess = true
      } else {
        const bawahan = await getBawahanPenilaianMultiLevelIds(karyawanId)
        canAccess = bawahan.some((bid) => Number(bid) === Number(header.id_pegawai))
      }
    }
    if (!canAccess) return NextResponse.json({ error: "Tidak diizinkan melihat detail penilaian ini" }, { status: 403 })

    type TimelineRow = {
      id: bigint
      aksi: string
      status_dari: string | null
      status_ke: string | null
      catatan: string | null
      created_at: Date
      actor_nama: string | null
      actor_jabatan: string | null
    }

    const timelineRows = await prisma.$queryRaw<TimelineRow[]>`
      SELECT
        al.id,
        al.aksi,
        al.status_dari,
        al.status_ke,
        al.catatan,
        al.created_at,
        ka.nama_karyawan AS actor_nama,
        ka.jabatan AS actor_jabatan
      FROM approval_log al
      LEFT JOIN karyawans ka ON ka.id = al.actor_karyawan_id
      WHERE al.id_penilaian = ${BigInt(penilaianId)}
      ORDER BY al.created_at DESC
    `

    const actions = await getNextActions(penilaianId, karyawanId, role)

    return NextResponse.json(serialize({
      penilaian: {
        id: Number(header.id),
        id_pegawai: Number(header.id_pegawai),
        status: header.status,
        nilai_akhir: header.nilai_akhir,
        tanggal_diajukan: header.tanggal_diajukan,
        tanggal_diverifikasi: header.tanggal_diverifikasi,
        tanggal_disetujui: header.tanggal_disetujui,
        tanggal_final: header.tanggal_final,
        catatan_pegawai: header.catatan_pegawai,
        catatan_atasan: header.catatan_atasan,
        nama_karyawan: header.nama_karyawan,
        jabatan: header.jabatan,
        nama_divisi: header.nama_divisi,
        nama_periode: header.nama_periode,
      },
      timeline: timelineRows.map((t) => ({
        id: Number(t.id),
        aksi: t.aksi,
        status_dari: t.status_dari,
        status_ke: t.status_ke,
        catatan: t.catatan,
        created_at: t.created_at,
        actor_nama: t.actor_nama,
        actor_jabatan: t.actor_jabatan,
      })),
      actions,
    }))
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 })
  }
}
