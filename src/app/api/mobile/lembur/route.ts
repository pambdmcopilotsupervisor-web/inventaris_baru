import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireMobileAuth } from "@/lib/mobile-auth"
import { STATUS_LEMBUR_LABELS, STATUS_LEMBUR } from "@/lib/lembur"
import { resolveAtasan } from "@/lib/lembur"
import { hitungDurasiLembur, checkLemburOverlap, deteksiTipeHari, getSettingLembur } from "@/lib/lembur"
import { JABATAN_MANAGER } from "@/lib/leave"

// GET /api/mobile/lembur — list lembur saya
export async function GET(req: NextRequest) {
  const auth = await requireMobileAuth(req)
  if ("error" in auth) return auth.error
  const karyawanId = auth.user.karyawan_id
  if (!karyawanId) return NextResponse.json({ error: "Akun belum terhubung" }, { status: 422 })
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status")
    const where: Record<string, unknown> = { karyawan_id: BigInt(karyawanId) }
    if (status) where.status = status
    const data = await prisma.overtime_requests.findMany({
      where, orderBy: { created_at: "desc" },
      include: { overtime_settings: { select: { nama_setting: true, tipe_hari: true } }, overtime_approvals: { orderBy: { approval_level: "asc" } } },
    })
    return NextResponse.json(serialize(data.map(p => ({ ...p, status_label: STATUS_LEMBUR_LABELS[p.status as keyof typeof STATUS_LEMBUR_LABELS] ?? p.status }))))
  } catch { return NextResponse.json({ error: "Server error" }, { status: 500 }) }
}

// POST /api/mobile/lembur — buat pengajuan lembur
export async function POST(req: NextRequest) {
  const auth = await requireMobileAuth(req)
  if ("error" in auth) return auth.error
  const karyawanId = auth.user.karyawan_id
  if (!karyawanId) return NextResponse.json({ error: "Akun belum terhubung" }, { status: 422 })
  try {
    const body = await req.json()
    const { tanggal_lembur, jam_mulai_rencana, jam_selesai_rencana, alasan_lembur, pekerjaan_lembur, is_lintas_hari } = body
    if (!tanggal_lembur)       return NextResponse.json({ error: "Tanggal lembur wajib" }, { status: 400 })
    if (!jam_mulai_rencana)    return NextResponse.json({ error: "Jam mulai wajib" }, { status: 400 })
    if (!jam_selesai_rencana)  return NextResponse.json({ error: "Jam selesai wajib" }, { status: 400 })
    if (!alasan_lembur?.trim()) return NextResponse.json({ error: "Alasan wajib" }, { status: 400 })

    const tglDate = new Date(tanggal_lembur)
    const karyawan = await prisma.karyawans.findUnique({ where: { id: BigInt(karyawanId) }, select: { status_karyawan: true, nama_karyawan: true, jabatan: true } })
    if (!karyawan || ["Pensiun", "Nonaktif"].includes(karyawan.status_karyawan ?? "")) return NextResponse.json({ error: "Status tidak aktif" }, { status: 422 })

    const { hasOverlap, message } = await checkLemburOverlap(BigInt(karyawanId), tglDate)
    if (hasOverlap) return NextResponse.json({ error: message }, { status: 409 })

    const isManagerKetua = JABATAN_MANAGER.some((j: string) => (karyawan.jabatan ?? "").toLowerCase().includes(j.toLowerCase()))
    const { atasan } = await resolveAtasan(BigInt(karyawanId))
    if (!isManagerKetua && !atasan) return NextResponse.json({ error: "Atasan langsung belum dikonfigurasi" }, { status: 422 })

    const lintasHari = !!is_lintas_hari
    const durasiRencana = hitungDurasiLembur(jam_mulai_rencana, jam_selesai_rencana, lintasHari)
    const tipeHari = await deteksiTipeHari(tglDate)
    const setting = await getSettingLembur(tipeHari)
    if (setting && durasiRencana < setting.batas_minimal_menit_lembur) {
      return NextResponse.json({ error: `Durasi lembur minimal ${setting.batas_minimal_menit_lembur} menit` }, { status: 422 })
    }

    const now = new Date()
    const data = await prisma.overtime_requests.create({
      data: {
        karyawan_id: BigInt(karyawanId), tanggal_lembur: tglDate,
        jam_mulai_rencana, jam_selesai_rencana, durasi_rencana_menit: durasiRencana,
        alasan_lembur: alasan_lembur.trim(), pekerjaan_lembur: pekerjaan_lembur?.trim() || null,
        is_lintas_hari: lintasHari, overtime_setting_id: setting?.id ?? null,
        status: STATUS_LEMBUR.DRAFT, dibuat_oleh: BigInt(auth.user.id), created_at: now, updated_at: now,
      },
    })
    return NextResponse.json(serialize({ success: true, data }), { status: 201 })
  } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal" }, { status: 500 }) }
}
