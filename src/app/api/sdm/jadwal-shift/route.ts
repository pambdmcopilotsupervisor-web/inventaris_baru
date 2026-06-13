import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

// GET  /api/sdm/jadwal-shift          — list jadwal (filter karyawan, tanggal, divisi)
// POST /api/sdm/jadwal-shift          — buat jadwal single

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user"])
  if ("error" in auth) return auth.error

  try {
    const { searchParams } = new URL(req.url)
    const karyawanId = searchParams.get("karyawan_id")
    const tglMulai   = searchParams.get("tgl_mulai")
    const tglSelesai = searchParams.get("tgl_selesai")
    const divisiId   = searchParams.get("divisi_id")

    const where: Record<string, unknown> = {}

    if (karyawanId) where.karyawan_id = BigInt(karyawanId)
    if (tglMulai && tglSelesai) {
      where.tanggal = { gte: new Date(tglMulai), lte: new Date(tglSelesai) }
    } else if (tglMulai) {
      where.tanggal = { gte: new Date(tglMulai) }
    }

    const jadwals = await prisma.jadwal_shifts.findMany({
      where,
      orderBy: [{ tanggal: "asc" }, { karyawan_id: "asc" }],
      include: {
        karyawans:    { select: { id: true, nik: true, nama_karyawan: true, jabatan: true, divisi_id: true, subdivisi_id: true } },
        shift_kerjas: { select: { id: true, kode_shift: true, nama_shift: true, jam_masuk: true, jam_pulang: true, is_lintas_hari: true } },
      },
    })

    // Filter divisi post-query — juga tangani karyawan dengan divisi_id NULL yang subdivisi-nya milik divisi tsb
    let filtered = jadwals
    if (divisiId) {
      const targetDivisi = Number(divisiId)
      // Ambil subdivisi yang milik divisi ini untuk cek karyawan dengan divisi_id NULL
      const subDivisisDivisi = await prisma.subdivisis.findMany({
        where: { divisi_id: targetDivisi },
        select: { id: true },
      })
      const subIds = new Set(subDivisisDivisi.map(s => Number(s.id)))

      filtered = jadwals.filter(j => {
        const k = j.karyawans
        if (!k) return false
        if (k.divisi_id === targetDivisi) return true
        if (k.divisi_id === null && k.subdivisi_id !== null && subIds.has(Number(k.subdivisi_id))) return true
        return false
      })
    }

    return NextResponse.json(serialize(filtered))
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd"])
  if ("error" in auth) return auth.error

  try {
    const body = await req.json()
    const { karyawan_id, shift_id, tanggal, keterangan } = body

    // Validasi input
    if (!karyawan_id) return NextResponse.json({ error: "Karyawan wajib dipilih" }, { status: 400 })
    if (!shift_id)    return NextResponse.json({ error: "Shift wajib dipilih" }, { status: 400 })
    if (!tanggal)     return NextResponse.json({ error: "Tanggal wajib diisi" }, { status: 400 })

    // Cek karyawan aktif
    const karyawan = await prisma.karyawans.findUnique({
      where: { id: BigInt(karyawan_id) },
      select: { status_karyawan: true, nama_karyawan: true },
    })
    if (!karyawan) return NextResponse.json({ error: "Karyawan tidak ditemukan" }, { status: 404 })
    if (karyawan.status_karyawan === "Pensiun" || karyawan.status_karyawan === "Nonaktif") {
      return NextResponse.json(
        { error: `Karyawan ${karyawan.nama_karyawan} berstatus ${karyawan.status_karyawan}, tidak dapat dibuatkan jadwal` },
        { status: 422 },
      )
    }

    // Cek shift aktif
    const shift = await prisma.shift_kerjas.findUnique({ where: { id: BigInt(shift_id) } })
    if (!shift)                return NextResponse.json({ error: "Shift tidak ditemukan" }, { status: 404 })
    if (shift.status !== "aktif") return NextResponse.json({ error: "Shift sudah tidak aktif" }, { status: 422 })

    const data = await prisma.jadwal_shifts.create({
      data: {
        karyawan_id: BigInt(karyawan_id),
        shift_id:    BigInt(shift_id),
        tanggal:     new Date(tanggal),
        keterangan:  keterangan?.trim() || null,
        created_at:  new Date(),
        updated_at:  new Date(),
      },
    })

    await writeAuditLog({
      user: auth.user, action: "CREATE", modelType: "jadwal_shifts",
      modelId: data.id, dataBaru: serialize(data), ip: getClientIp(req),
    })

    return NextResponse.json(serialize(data), { status: 201 })
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "Jadwal untuk karyawan dan tanggal tersebut sudah ada" }, { status: 409 })
    }
    return NextResponse.json({ error: "Gagal menyimpan jadwal" }, { status: 500 })
  }
}
