import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

// GET    /api/sdm/shift/[id]
// PUT    /api/sdm/shift/[id]
// DELETE /api/sdm/shift/[id]

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user"])
  if ("error" in auth) return auth.error

  try {
    const { id } = await params
    const data = await prisma.shift_kerjas.findUnique({ where: { id: BigInt(id) } })
    if (!data) return NextResponse.json({ error: "Shift tidak ditemukan" }, { status: 404 })
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
      kode_shift, nama_shift, jam_masuk, jam_pulang,
      toleransi_terlambat_menit, batas_absen_masuk_mulai,
      batas_absen_masuk_selesai, batas_absen_pulang_mulai,
      batas_absen_pulang_selesai, is_lintas_hari,
      durasi_kerja_menit, status, keterangan,
    } = body

    if (!kode_shift?.trim()) return NextResponse.json({ error: "Kode shift wajib diisi" }, { status: 400 })
    if (!nama_shift?.trim()) return NextResponse.json({ error: "Nama shift wajib diisi" }, { status: 400 })
    if (!jam_masuk)          return NextResponse.json({ error: "Jam masuk wajib diisi" }, { status: 400 })
    if (!jam_pulang)         return NextResponse.json({ error: "Jam pulang wajib diisi" }, { status: 400 })

    const existing = await prisma.shift_kerjas.findUnique({ where: { id: BigInt(id) } })
    if (!existing) return NextResponse.json({ error: "Shift tidak ditemukan" }, { status: 404 })

    let durasi = durasi_kerja_menit ? Number(durasi_kerja_menit) : null
    if (!durasi) {
      const [hm, mm] = jam_masuk.split(":").map(Number)
      const [hp, mp] = jam_pulang.split(":").map(Number)
      let menitM = hm * 60 + mm, menitP = hp * 60 + mp
      if (is_lintas_hari && menitP <= menitM) menitP += 24 * 60
      durasi = menitP - menitM
    }

    const data = await prisma.shift_kerjas.update({
      where: { id: BigInt(id) },
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
        updated_at:                 new Date(),
      },
    })

    await writeAuditLog({
      user: auth.user, action: "UPDATE", modelType: "shift_kerjas",
      modelId: BigInt(id), dataLama: serialize(existing), dataBaru: serialize(data),
      ip: getClientIp(req),
    })

    return NextResponse.json(serialize(data))
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "Kode shift sudah digunakan" }, { status: 409 })
    }
    return NextResponse.json({ error: "Gagal memperbarui shift" }, { status: 500 })
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
    const existing = await prisma.shift_kerjas.findUnique({ where: { id: BigInt(id) } })
    if (!existing) return NextResponse.json({ error: "Shift tidak ditemukan" }, { status: 404 })

    // Cek apakah shift masih dipakai di jadwal
    const jadwalCount = await prisma.jadwal_shifts.count({ where: { shift_id: BigInt(id) } })
    if (jadwalCount > 0) {
      return NextResponse.json(
        { error: `Shift tidak dapat dihapus karena masih digunakan oleh ${jadwalCount} jadwal. Nonaktifkan saja.` },
        { status: 409 },
      )
    }

    await prisma.shift_kerjas.delete({ where: { id: BigInt(id) } })

    await writeAuditLog({
      user: auth.user, action: "DELETE", modelType: "shift_kerjas",
      modelId: BigInt(id), dataLama: serialize(existing), ip: getClientIp(req),
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Gagal menghapus shift" }, { status: 500 })
  }
}
