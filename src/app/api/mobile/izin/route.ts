/**
 * API Mobile: Izin
 * Pola sama dengan API Mobile Cuti
 */
import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireMobileAuth } from "@/lib/mobile-auth"
import { STATUS_IZIN_LABELS, STATUS_IZIN } from "@/lib/izin"
import { resolveAtasan, isJabatanAtasan } from "@/lib/leave"
import { hitungDurasiIzin, checkIzinOverlap, JABATAN_MANAGER } from "@/lib/izin"

// GET /api/mobile/izin — list izin saya
export async function GET(req: NextRequest) {
  const auth = await requireMobileAuth(req)
  if ("error" in auth) return auth.error
  const karyawanId = auth.user.karyawan_id
  if (!karyawanId) return NextResponse.json({ error: "Akun belum terhubung ke karyawan" }, { status: 422 })
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status")
    const where: Record<string, unknown> = { karyawan_id: BigInt(karyawanId) }
    if (status) where.status = status
    const data = await prisma.pengajuan_izins.findMany({
      where, orderBy: { created_at: "desc" },
      include: { jenis_izins: { select: { id: true, kode_izin: true, nama_izin: true, satuan: true } }, izin_approvals: { orderBy: { approval_level: "asc" } } },
    })
    return NextResponse.json(serialize(data.map(p => ({ ...p, status_label: STATUS_IZIN_LABELS[p.status as keyof typeof STATUS_IZIN_LABELS] ?? p.status }))))
  } catch { return NextResponse.json({ error: "Server error" }, { status: 500 }) }
}

// POST /api/mobile/izin — buat pengajuan izin
export async function POST(req: NextRequest) {
  const auth = await requireMobileAuth(req)
  if ("error" in auth) return auth.error
  const karyawanId = auth.user.karyawan_id
  if (!karyawanId) return NextResponse.json({ error: "Akun belum terhubung ke karyawan" }, { status: 422 })
  try {
    const body = await req.json()
    const { jenis_izin_id, tanggal_mulai, tanggal_selesai, jam_mulai, jam_selesai, alasan } = body
    if (!jenis_izin_id)   return NextResponse.json({ error: "Jenis izin wajib dipilih" }, { status: 400 })
    if (!tanggal_mulai)   return NextResponse.json({ error: "Tanggal mulai wajib diisi" }, { status: 400 })
    if (!tanggal_selesai) return NextResponse.json({ error: "Tanggal selesai wajib diisi" }, { status: 400 })
    if (!alasan?.trim())  return NextResponse.json({ error: "Alasan wajib diisi" }, { status: 400 })

    const dtMulai = new Date(tanggal_mulai), dtSelesai = new Date(tanggal_selesai)
    if (dtSelesai < dtMulai) return NextResponse.json({ error: "Tanggal selesai tidak boleh sebelum tanggal mulai" }, { status: 400 })

    const karyawan = await prisma.karyawans.findUnique({ where: { id: BigInt(karyawanId) }, select: { status_karyawan: true, nama_karyawan: true, jabatan: true } })
    if (!karyawan || ["Pensiun", "Nonaktif"].includes(karyawan.status_karyawan ?? "")) return NextResponse.json({ error: "Status karyawan tidak aktif" }, { status: 422 })

    const jenisIzin = await prisma.jenis_izins.findUnique({ where: { id: BigInt(jenis_izin_id) } })
    if (!jenisIzin || jenisIzin.status !== "aktif") return NextResponse.json({ error: "Jenis izin tidak tersedia" }, { status: 422 })
    if (jenisIzin.membutuhkan_lampiran) return NextResponse.json({ error: `Jenis izin "${jenisIzin.nama_izin}" memerlukan lampiran. Gunakan aplikasi web.` }, { status: 422 })
    if (jenisIzin.satuan === "jam" && (!jam_mulai || !jam_selesai)) return NextResponse.json({ error: "Jam mulai dan jam selesai wajib untuk izin berbasis jam" }, { status: 400 })

    const { hasOverlap, message } = await checkIzinOverlap(BigInt(karyawanId), dtMulai, dtSelesai)
    if (hasOverlap) return NextResponse.json({ error: message }, { status: 409 })

    const isManagerKetua = JABATAN_MANAGER.some(j => (karyawan.jabatan ?? "").toLowerCase().includes(j.toLowerCase()))
    const { atasan } = await resolveAtasan(BigInt(karyawanId))
    if (!isManagerKetua && !atasan) return NextResponse.json({ error: "Atasan langsung belum dikonfigurasi. Hubungi HRD." }, { status: 422 })

    const durasi = hitungDurasiIzin(dtMulai, dtSelesai, jenisIzin.satuan, jam_mulai, jam_selesai)
    const now = new Date()
    const data = await prisma.pengajuan_izins.create({
      data: {
        karyawan_id: BigInt(karyawanId), jenis_izin_id: BigInt(jenis_izin_id),
        tanggal_mulai: dtMulai, tanggal_selesai: dtSelesai,
        jam_mulai: jam_mulai || null, jam_selesai: jam_selesai || null,
        durasi, satuan_durasi: jenisIzin.satuan,
        alasan: alasan.trim(), status: STATUS_IZIN.DRAFT,
        dibuat_oleh: BigInt(auth.user.id), created_at: now, updated_at: now,
      },
    })
    return NextResponse.json(serialize({ success: true, data }), { status: 201 })
  } catch (err) {
    console.error("[mobile izin POST]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal" }, { status: 500 })
  }
}
