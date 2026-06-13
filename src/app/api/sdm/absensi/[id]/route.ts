import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { hitungAbsensi, resolveLeaveStatus } from "@/lib/attendance"

// GET    /api/sdm/absensi/[id]  — detail
// PUT    /api/sdm/absensi/[id]  — koreksi
// DELETE /api/sdm/absensi/[id]  — hapus

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user"])
  if ("error" in auth) return auth.error

  try {
    const { id } = await params
    const data = await prisma.absensi.findUnique({
      where: { id: BigInt(id) },
      include: {
        karyawans:     { select: { id: true, nik: true, nama_karyawan: true, jabatan: true, divisi_id: true, subdivisi_id: true } },
        jadwal_shifts: { include: { shift_kerjas: true } },
      },
    })
    if (!data) return NextResponse.json({ error: "Data absensi tidak ditemukan" }, { status: 404 })
    return NextResponse.json(serialize(data))
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(req, ["admin", "hrd"])
  if ("error" in auth) return auth.error

  try {
    const { id } = await params
    const body = await req.json()
    const {
      jam_masuk, jam_pulang, status_absensi: statusOverride,
      alasan_manual, catatan_manual,
    } = body

    if (!alasan_manual?.trim()) {
      return NextResponse.json({ error: "Alasan koreksi wajib diisi" }, { status: 400 })
    }

    const existing = await prisma.absensi.findUnique({
      where: { id: BigInt(id) },
      include: { jadwal_shifts: { include: { shift_kerjas: true } } },
    })
    if (!existing) return NextResponse.json({ error: "Data absensi tidak ditemukan" }, { status: 404 })

    const tglDate = existing.tanggal_absensi

    // Ambil data shift dari jadwal yang terkait
    const shift = existing.jadwal_shifts?.shift_kerjas ?? null

    // Cek hari libur
    const hariLibur = await prisma.hari_liburs.findFirst({ where: { tanggal: tglDate } })

    // Resolve leave
    const { has_cuti, has_izin, has_sakit } = await resolveLeaveStatus(existing.karyawan_id, tglDate)

    const jamMasukFinal  = jam_masuk  !== undefined ? (jam_masuk  || null) : existing.jam_masuk
    const jamPulangFinal = jam_pulang !== undefined ? (jam_pulang || null) : existing.jam_pulang

    let { status_absensi, is_terlambat, is_pulang_cepat, is_tidak_absen_masuk, is_tidak_absen_pulang, menit_terlambat, menit_pulang_cepat, total_jam_kerja_menit } =
      hitungAbsensi({ jam_masuk: jamMasukFinal, jam_pulang: jamPulangFinal, shift, is_hari_libur: !!hariLibur, has_cuti, has_izin, has_sakit })

    if (statusOverride) status_absensi = statusOverride

    const now    = new Date()
    const userId = BigInt(auth.user.id)

    const data = await prisma.absensi.update({
      where: { id: BigInt(id) },
      data: {
        jam_masuk:             jamMasukFinal,
        jam_pulang:            jamPulangFinal,
        status_absensi,
        is_terlambat,
        is_pulang_cepat,
        is_tidak_absen_masuk,
        is_tidak_absen_pulang,
        menit_terlambat,
        menit_pulang_cepat,
        total_jam_kerja_menit,
        is_manual:             true,
        alasan_manual:         alasan_manual.trim(),
        catatan_manual:        catatan_manual?.trim() || null,
        updated_by:            userId,
        updated_at:            now,
      },
    })

    await writeAuditLog({
      user: auth.user, action: "UPDATE", modelType: "absensi",
      modelId: BigInt(id), dataLama: serialize(existing), dataBaru: serialize(data),
      ip: getClientIp(req),
    })

    return NextResponse.json(serialize(data))
  } catch {
    return NextResponse.json({ error: "Gagal memperbarui absensi" }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(req, ["admin", "hrd"])
  if ("error" in auth) return auth.error

  try {
    const { id } = await params
    const existing = await prisma.absensi.findUnique({ where: { id: BigInt(id) } })
    if (!existing) return NextResponse.json({ error: "Data absensi tidak ditemukan" }, { status: 404 })

    await prisma.absensi.delete({ where: { id: BigInt(id) } })

    await writeAuditLog({
      user: auth.user, action: "DELETE", modelType: "absensi",
      modelId: BigInt(id), dataLama: serialize(existing), ip: getClientIp(req),
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Gagal menghapus data absensi" }, { status: 500 })
  }
}
