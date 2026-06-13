import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { STATUS_LEMBUR, getSettingLembur, deteksiTipeHari, hitungUangLembur, validateLemburEligibility } from "@/lib/lembur"

// POST /api/sdm/overtime-requests/[id]/realize
// Input realisasi lembur oleh HRD/Admin
// Body: { jam_mulai_aktual, jam_selesai_aktual, catatan_realisasi, durasi_disetujui_menit? }

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin", "hrd"])
  if ("error" in auth) return auth.error
  try {
    const { id } = await params
    const body = await req.json()
    const overtime = await prisma.overtime_requests.findUnique({
      where: { id: BigInt(id) },
      include: { karyawans: { select: { tarif_lembur_per_jam: true } } },
    })
    if (!overtime) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })
    if (overtime.status !== STATUS_LEMBUR.APPROVED_HRD) {
      return NextResponse.json({ error: "Hanya lembur yang sudah disetujui HRD yang bisa direalisasikan" }, { status: 422 })
    }

    const { jam_mulai_aktual, jam_selesai_aktual, catatan_realisasi, durasi_disetujui_menit } = body

    const actualMulai = jam_mulai_aktual || overtime.jam_mulai_aktual
    const actualSelesai = jam_selesai_aktual || overtime.jam_selesai_aktual
    if (!actualMulai || !actualSelesai) {
      return NextResponse.json({ error: "Jam mulai aktual dan jam selesai aktual wajib diisi untuk realisasi lembur" }, { status: 400 })
    }

    const lemburValidation = await validateLemburEligibility({
      karyawanId: overtime.karyawan_id,
      tanggal: overtime.tanggal_lembur,
      jamMulai: actualMulai,
      jamSelesai: actualSelesai,
      isLintasHari: overtime.is_lintas_hari,
      mode: "aktual",
    })
    if (!lemburValidation.valid) {
      return NextResponse.json({ error: lemburValidation.errors.join(" "), errors: lemburValidation.errors }, { status: 422 })
    }

    const durasiAktual = lemburValidation.durasiMenit
    const durasiDisetujui = durasi_disetujui_menit !== undefined ? Number(durasi_disetujui_menit) : durasiAktual
    if (durasiDisetujui <= 0) return NextResponse.json({ error: "Durasi disetujui harus lebih dari 0 menit" }, { status: 422 })
    if (durasiDisetujui > durasiAktual) return NextResponse.json({ error: "Durasi disetujui tidak boleh melebihi durasi aktual" }, { status: 422 })

    // Hitung ulang uang lembur berdasarkan durasi disetujui
    const tipeHari = await deteksiTipeHari(overtime.tanggal_lembur)
    const setting  = await getSettingLembur(tipeHari)
    let totalUang = Number(overtime.total_uang_lembur ?? 0)
    let calculationDetail: object = overtime.calculation_detail as object ?? {}

    if (setting) {
      const tarifPegawai = overtime.karyawans.tarif_lembur_per_jam ? Number(overtime.karyawans.tarif_lembur_per_jam) : null
      const hasil = hitungUangLembur({ durasiMenit: durasiDisetujui, setting, tarifPerJamPegawai: tarifPegawai })
      totalUang = hasil.totalUang
      calculationDetail = hasil.detail
    }

    const now = new Date()
    await prisma.overtime_requests.update({
      where: { id: BigInt(id) },
      data: {
        jam_mulai_aktual:       actualMulai,
        jam_selesai_aktual:     actualSelesai,
        durasi_aktual_menit:    durasiAktual,
        durasi_disetujui_menit: durasiDisetujui,
        catatan_realisasi:      catatan_realisasi?.trim() || overtime.catatan_realisasi,
        total_uang_lembur:      totalUang,
        calculation_detail:     calculationDetail,
        status:                 STATUS_LEMBUR.REALIZED,
        realized_at:            now,
        updated_at:             now,
      },
    })

    await writeAuditLog({
      user: auth.user, action: "UPDATE", modelType: "overtime_requests",
      modelId: BigInt(id), dataBaru: { status: "realized", durasi_disetujui_menit: durasiDisetujui, total_uang_lembur: totalUang },
      ip: getClientIp(req),
    })
    return NextResponse.json({ success: true, total_uang_lembur: totalUang, calculation_detail: calculationDetail })
  } catch (err) {
    console.error("[realize overtime]", err)
    return NextResponse.json({ error: "Gagal input realisasi" }, { status: 500 })
  }
}
