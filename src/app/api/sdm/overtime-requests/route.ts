import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { STATUS_LEMBUR, resolveAtasan, checkLemburOverlap, deteksiTipeHari, getSettingLembur, validateLemburEligibility } from "@/lib/lembur"
import { isJabatanAtasan, JABATAN_MANAGER } from "@/lib/leave"
import { checkSdmConflicts } from "@/lib/sdm-validation"

const INCLUDE = {
  karyawans:          { select: { id: true, nik: true, nama_karyawan: true, jabatan: true, divisi_id: true, tarif_lembur_per_jam: true } },
  overtime_settings:  { select: { id: true, nama_setting: true, tipe_hari: true, metode_perhitungan: true } },
  overtime_approvals: { orderBy: { approval_level: "asc" as const } },
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error
  try {
    const { searchParams } = new URL(req.url)
    const karyawanId = searchParams.get("karyawan_id")
    const status     = searchParams.get("status")
    const tglMulai   = searchParams.get("tgl_mulai")
    const tglSelesai = searchParams.get("tgl_selesai")

    const where: Record<string, unknown> = {}
    if (karyawanId) where.karyawan_id = BigInt(karyawanId)
    if (status)     where.status = status
    if (tglMulai && tglSelesai) where.tanggal_lembur = { gte: new Date(tglMulai), lte: new Date(tglSelesai) }

    // Akses data: admin → semua, Kepala Divisi → divisinya, lainnya → milik sendiri
    const role = (auth.user.role ?? "user").toLowerCase()

    if (role === "admin") {
      // tidak ada filter tambahan
    } else if (auth.user.karyawan_id) {
      const loggedInK = await prisma.karyawans.findUnique({
        where: { id: BigInt(auth.user.karyawan_id) },
        select: { jabatan: true, divisi_id: true },
      })
      const isKepala = loggedInK?.jabatan?.toLowerCase().includes("kepala divisi")

      if (isKepala && loggedInK?.divisi_id) {
        const subDivisis = await prisma.subdivisis.findMany({ where: { divisi_id: loggedInK.divisi_id }, select: { id: true } })
        const subIds = subDivisis.map(s => Number(s.id))
        const karyawanDivisi = await prisma.karyawans.findMany({
          where: { OR: [{ divisi_id: loggedInK.divisi_id }, { divisi_id: null, subdivisi_id: { in: subIds } }] },
          select: { id: true },
        })
        where.karyawan_id = { in: karyawanDivisi.map(k => k.id) }
      } else {
        where.karyawan_id = BigInt(auth.user.karyawan_id)
      }
    } else {
      return NextResponse.json([])
    }

    const data = await prisma.overtime_requests.findMany({ where, orderBy: { created_at: "desc" }, include: INCLUDE })
    return NextResponse.json(serialize(data))
  } catch { return NextResponse.json({ error: "Server error" }, { status: 500 }) }
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error
  try {
    const body = await req.json()
    const { karyawan_id, tanggal_lembur, jam_mulai_rencana, jam_selesai_rencana, alasan_lembur, pekerjaan_lembur, lampiran, is_lintas_hari } = body

    let targetKaryawanId: bigint
    const role = (auth.user.role ?? "user").toLowerCase()
    if (role === "admin") {
      if (!karyawan_id) return NextResponse.json({ error: "Karyawan wajib dipilih" }, { status: 400 })
      targetKaryawanId = BigInt(karyawan_id)
    } else {
      if (!auth.user.karyawan_id) return NextResponse.json({ error: "Akun belum terhubung ke data karyawan" }, { status: 422 })
      targetKaryawanId = BigInt(auth.user.karyawan_id)
    }

    if (!tanggal_lembur)       return NextResponse.json({ error: "Tanggal lembur wajib diisi" }, { status: 400 })
    if (!jam_mulai_rencana)    return NextResponse.json({ error: "Jam mulai wajib diisi" }, { status: 400 })
    if (!jam_selesai_rencana)  return NextResponse.json({ error: "Jam selesai wajib diisi" }, { status: 400 })
    if (!alasan_lembur?.trim()) return NextResponse.json({ error: "Alasan lembur wajib diisi" }, { status: 400 })

    const tglDate = new Date(tanggal_lembur)

    // Cek karyawan aktif
    const karyawan = await prisma.karyawans.findUnique({ where: { id: targetKaryawanId }, select: { status_karyawan: true, nama_karyawan: true, jabatan: true, tarif_lembur_per_jam: true } })
    if (!karyawan) return NextResponse.json({ error: "Karyawan tidak ditemukan" }, { status: 404 })
    if (karyawan.status_karyawan === "Pensiun" || karyawan.status_karyawan === "Nonaktif") {
      return NextResponse.json({ error: `Karyawan ${karyawan.nama_karyawan} sudah ${karyawan.status_karyawan}` }, { status: 422 })
    }

    // Cek overlap
    const { hasOverlap, message } = await checkLemburOverlap(targetKaryawanId, tglDate)
    if (hasOverlap) return NextResponse.json({ error: message }, { status: 409 })

    const crossModuleConflict = await checkSdmConflicts({
      karyawanId: targetKaryawanId,
      tanggalMulai: tglDate,
      modules: ["cuti", "izin", "sakit"],
      includeIzinJam: false,
    })
    if (crossModuleConflict.hasConflict) {
      return NextResponse.json({ error: crossModuleConflict.message, conflicts: crossModuleConflict.conflicts }, { status: 409 })
    }

    // Validasi atasan
    const jabatanKaryawan = karyawan.jabatan ?? ""
    const isManagerKetua = JABATAN_MANAGER.some((j: string) => jabatanKaryawan.toLowerCase().includes(j.toLowerCase()))
    const { atasan } = await resolveAtasan(targetKaryawanId)
    if (!isManagerKetua && !atasan) {
      return NextResponse.json({ error: `Atasan langsung untuk ${karyawan.nama_karyawan} belum dikonfigurasi.` }, { status: 422 })
    }

    const lintasHari = !!is_lintas_hari
    const lemburValidation = await validateLemburEligibility({
      karyawanId: targetKaryawanId,
      tanggal: tglDate,
      jamMulai: jam_mulai_rencana,
      jamSelesai: jam_selesai_rencana,
      isLintasHari: lintasHari,
      mode: "rencana",
    })
    if (!lemburValidation.valid) {
      return NextResponse.json({ error: lemburValidation.errors.join(" "), errors: lemburValidation.errors }, { status: 422 })
    }
    const durasiRencana = lemburValidation.durasiMenit

    // Ambil setting lembur
    const tipeHari = await deteksiTipeHari(tglDate)
    const setting  = await getSettingLembur(tipeHari)

    // Validasi minimal durasi
    if (setting && durasiRencana < setting.batas_minimal_menit_lembur) {
      return NextResponse.json({ error: `Durasi lembur minimal ${setting.batas_minimal_menit_lembur} menit.` }, { status: 422 })
    }

    const now = new Date()
    const data = await prisma.overtime_requests.create({
      data: {
        karyawan_id:          targetKaryawanId,
        tanggal_lembur:       tglDate,
        jam_mulai_rencana,
        jam_selesai_rencana,
        durasi_rencana_menit: durasiRencana,
        alasan_lembur:        alasan_lembur.trim(),
        pekerjaan_lembur:     pekerjaan_lembur?.trim() || null,
        lampiran:             lampiran || null,
        is_lintas_hari:       lintasHari,
        overtime_setting_id:  setting?.id ?? null,
        status:               STATUS_LEMBUR.DRAFT,
        dibuat_oleh:          BigInt(auth.user.id),
        created_at:           now, updated_at: now,
      },
    })
    await writeAuditLog({ user: auth.user, action: "CREATE", modelType: "overtime_requests", modelId: data.id, dataBaru: serialize(data), ip: getClientIp(req) })
    return NextResponse.json(serialize(data), { status: 201 })
  } catch (err) {
    console.error("[overtime POST]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal menyimpan" }, { status: 500 })
  }
}
