import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"
import { STATUS_LEMBUR, deteksiTipeHari, getSettingLembur, hitungUangLembur } from "@/lib/lembur"

// POST /api/sdm/overtime-requests/[id]/recalculate
// Hitung ulang uang lembur berdasarkan setting saat ini (tanpa ubah status)

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin", "hrd"])
  if ("error" in auth) return auth.error
  try {
    const { id } = await params
    const overtime = await prisma.overtime_requests.findUnique({
      where: { id: BigInt(id) },
      include: { karyawans: { select: { tarif_lembur_per_jam: true } } },
    })
    if (!overtime) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })

    if (![STATUS_LEMBUR.APPROVED_HRD, STATUS_LEMBUR.REALIZED].includes(overtime.status as never)) {
      return NextResponse.json({ error: "Hitung ulang hanya bisa dilakukan pada lembur yang sudah disetujui HRD" }, { status: 422 })
    }

    const durasiHitung = overtime.durasi_disetujui_menit ?? overtime.durasi_rencana_menit
    const tipeHari = await deteksiTipeHari(overtime.tanggal_lembur)
    const setting  = await getSettingLembur(tipeHari)

    if (!setting) {
      return NextResponse.json({ error: "Setting lembur tidak ditemukan untuk tipe hari ini" }, { status: 404 })
    }

    const tarifPegawai = overtime.karyawans.tarif_lembur_per_jam ? Number(overtime.karyawans.tarif_lembur_per_jam) : null
    const hasil = hitungUangLembur({ durasiMenit: durasiHitung, setting, tarifPerJamPegawai: tarifPegawai })

    const data = await prisma.overtime_requests.update({
      where: { id: BigInt(id) },
      data: {
        total_uang_lembur:  hasil.totalUang,
        calculation_detail: hasil.detail,
        updated_at:         new Date(),
      },
    })

    return NextResponse.json(serialize({
      ...data,
      total_uang_lembur: hasil.totalUang,
      calculation_detail: hasil.detail,
      setting_used: setting,
      message: `Berhasil dihitung ulang. Uang lembur: Rp ${hasil.totalUang.toLocaleString("id-ID")}`,
    }))
  } catch (err) {
    console.error("[recalculate overtime]", err)
    return NextResponse.json({ error: "Gagal menghitung ulang" }, { status: 500 })
  }
}
