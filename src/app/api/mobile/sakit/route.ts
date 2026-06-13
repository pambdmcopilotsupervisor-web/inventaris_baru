import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireMobileAuth } from "@/lib/mobile-auth"
import { STATUS_SAKIT_LABELS, STATUS_SAKIT } from "@/lib/sakit"
import { resolveAtasan, isJabatanAtasan } from "@/lib/leave"
import { checkSakitOverlap, hitungHariSakit, JABATAN_MANAGER } from "@/lib/sakit"

// GET /api/mobile/sakit — list sakit saya
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
    const data = await prisma.pengajuan_sakits.findMany({
      where, orderBy: { created_at: "desc" },
      include: { sakit_approvals: { orderBy: { approval_level: "asc" } } },
    })
    return NextResponse.json(serialize(data.map(p => ({ ...p, status_label: STATUS_SAKIT_LABELS[p.status as keyof typeof STATUS_SAKIT_LABELS] ?? p.status }))))
  } catch { return NextResponse.json({ error: "Server error" }, { status: 500 }) }
}

// POST /api/mobile/sakit — buat pengajuan sakit (lampiran wajib di-upload dulu)
export async function POST(req: NextRequest) {
  const auth = await requireMobileAuth(req)
  if ("error" in auth) return auth.error
  const karyawanId = auth.user.karyawan_id
  if (!karyawanId) return NextResponse.json({ error: "Akun belum terhubung" }, { status: 422 })
  try {
    const body = await req.json()
    const { tanggal_mulai, tanggal_selesai, keterangan_sakit, nama_dokter, nama_fasilitas_kesehatan, nomor_surat_sakit, lampiran_path } = body
    if (!tanggal_mulai)        return NextResponse.json({ error: "Tanggal mulai wajib diisi" }, { status: 400 })
    if (!tanggal_selesai)      return NextResponse.json({ error: "Tanggal selesai wajib diisi" }, { status: 400 })
    if (!lampiran_path?.trim()) return NextResponse.json({ error: "Lampiran surat sakit wajib. Upload foto surat sakit terlebih dahulu." }, { status: 400 })

    const dtMulai = new Date(tanggal_mulai), dtSelesai = new Date(tanggal_selesai)
    if (dtSelesai < dtMulai) return NextResponse.json({ error: "Tanggal selesai tidak boleh sebelum tanggal mulai" }, { status: 400 })

    const karyawan = await prisma.karyawans.findUnique({ where: { id: BigInt(karyawanId) }, select: { status_karyawan: true, nama_karyawan: true, jabatan: true } })
    if (!karyawan || ["Pensiun", "Nonaktif"].includes(karyawan.status_karyawan ?? "")) return NextResponse.json({ error: "Status karyawan tidak aktif" }, { status: 422 })

    const { hasOverlap, message } = await checkSakitOverlap(BigInt(karyawanId), dtMulai, dtSelesai)
    if (hasOverlap) return NextResponse.json({ error: message }, { status: 409 })

    const isManagerKetua = JABATAN_MANAGER.some(j => (karyawan.jabatan ?? "").toLowerCase().includes(j.toLowerCase()))
    const { atasan } = await resolveAtasan(BigInt(karyawanId))
    if (!isManagerKetua && !atasan) return NextResponse.json({ error: "Atasan langsung belum dikonfigurasi" }, { status: 422 })

    const jumlahHari = hitungHariSakit(dtMulai, dtSelesai)
    const now = new Date()
    const data = await prisma.pengajuan_sakits.create({
      data: {
        karyawan_id: BigInt(karyawanId), tanggal_mulai: dtMulai, tanggal_selesai: dtSelesai,
        jumlah_hari: jumlahHari, keterangan_sakit: keterangan_sakit?.trim() || null,
        nama_dokter: nama_dokter?.trim() || null, nama_fasilitas_kesehatan: nama_fasilitas_kesehatan?.trim() || null,
        nomor_surat_sakit: nomor_surat_sakit?.trim() || null, lampiran_path: lampiran_path.trim(),
        status: STATUS_SAKIT.DRAFT, dibuat_oleh: BigInt(auth.user.id), created_at: now, updated_at: now,
      },
    })
    return NextResponse.json(serialize({ success: true, data }), { status: 201 })
  } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal" }, { status: 500 }) }
}
