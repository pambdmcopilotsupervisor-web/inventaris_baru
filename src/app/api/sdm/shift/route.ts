import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

// GET  /api/sdm/shift       — list semua shift
// POST /api/sdm/shift       — buat shift baru
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user"])
  if ("error" in auth) return auth.error

  try {
    const data = await prisma.shift_kerjas.findMany({ orderBy: { kode_shift: "asc" } })
    return NextResponse.json(serialize(data))
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd"])
  if ("error" in auth) return auth.error

  try {
    const body = await req.json()
    const {
      kode_shift, nama_shift, jam_masuk, jam_pulang,
      toleransi_terlambat_menit, batas_absen_masuk_mulai,
      batas_absen_masuk_selesai, batas_absen_pulang_mulai,
      batas_absen_pulang_selesai, is_lintas_hari,
      durasi_kerja_menit, status, keterangan,
    } = body

    // Validasi wajib
    if (!kode_shift?.trim()) return NextResponse.json({ error: "Kode shift wajib diisi" }, { status: 400 })
    if (!nama_shift?.trim()) return NextResponse.json({ error: "Nama shift wajib diisi" }, { status: 400 })
    if (!jam_masuk)          return NextResponse.json({ error: "Jam masuk wajib diisi" }, { status: 400 })
    if (!jam_pulang)         return NextResponse.json({ error: "Jam pulang wajib diisi" }, { status: 400 })

    // Hitung durasi otomatis jika tidak di-input manual
    let durasi = durasi_kerja_menit ? Number(durasi_kerja_menit) : null
    if (!durasi) {
      durasi = hitungDurasi(jam_masuk, jam_pulang, !!is_lintas_hari)
    }

    const data = await prisma.shift_kerjas.create({
      data: {
        kode_shift:                 kode_shift.trim().toUpperCase(),
        nama_shift:                 nama_shift.trim(),
        jam_masuk,
        jam_pulang,
        toleransi_terlambat_menit:  toleransi_terlambat_menit ? Number(toleransi_terlambat_menit) : 15,
        batas_absen_masuk_mulai:    batas_absen_masuk_mulai    || null,
        batas_absen_masuk_selesai:  batas_absen_masuk_selesai  || null,
        batas_absen_pulang_mulai:   batas_absen_pulang_mulai   || null,
        batas_absen_pulang_selesai: batas_absen_pulang_selesai || null,
        is_lintas_hari:             !!is_lintas_hari,
        durasi_kerja_menit:         durasi,
        status:                     status ?? "aktif",
        keterangan:                 keterangan?.trim() || null,
        created_at:                 new Date(),
        updated_at:                 new Date(),
      },
    })

    await writeAuditLog({
      user: auth.user, action: "CREATE", modelType: "shift_kerjas",
      modelId: data.id, dataBaru: serialize(data), ip: getClientIp(req),
    })

    return NextResponse.json(serialize(data), { status: 201 })
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "Kode shift sudah digunakan" }, { status: 409 })
    }
    return NextResponse.json({ error: "Gagal menyimpan shift" }, { status: 500 })
  }
}

/** Hitung durasi kerja dalam menit */
function hitungDurasi(jamMasuk: string, jamPulang: string, lintasHari: boolean): number {
  const [hm, mm] = jamMasuk.split(":").map(Number)
  const [hp, mp] = jamPulang.split(":").map(Number)
  let menitMasuk  = hm * 60 + mm
  let menitPulang = hp * 60 + mp
  if (lintasHari && menitPulang <= menitMasuk) menitPulang += 24 * 60
  return menitPulang - menitMasuk
}
