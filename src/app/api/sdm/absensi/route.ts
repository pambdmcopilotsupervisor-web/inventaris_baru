import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { hitungAbsensi, resolveLeaveStatus } from "@/lib/attendance"

// GET  /api/sdm/absensi  — list absensi dengan filter
// POST /api/sdm/absensi  — input absensi manual

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user"])
  if ("error" in auth) return auth.error

  try {
    const { searchParams } = new URL(req.url)
    const tanggal    = searchParams.get("tanggal")
    const tglMulai   = searchParams.get("tgl_mulai")
    const tglSelesai = searchParams.get("tgl_selesai")
    const karyawanId = searchParams.get("karyawan_id")
    const divisiId   = searchParams.get("divisi_id")
    const subdivisiId = searchParams.get("subdivisi_id")
    const status     = searchParams.get("status")
    const search     = searchParams.get("search") ?? ""

    const where: Record<string, unknown> = {}

    // Filter tanggal
    if (tanggal) {
      where.tanggal_absensi = new Date(tanggal)
    } else if (tglMulai && tglSelesai) {
      where.tanggal_absensi = { gte: new Date(tglMulai), lte: new Date(tglSelesai) }
    }

    if (karyawanId) where.karyawan_id = BigInt(karyawanId)
    if (status)     where.status_absensi = status

    let data = await prisma.absensi.findMany({
      where,
      orderBy: [{ tanggal_absensi: "desc" }, { karyawan_id: "asc" }],
      include: {
        karyawans: {
          select: {
            id: true, nik: true, nama_karyawan: true, jabatan: true,
            divisi_id: true, subdivisi_id: true,
          },
        },
        jadwal_shifts: {
          include: {
            shift_kerjas: {
              select: {
                id: true, kode_shift: true, nama_shift: true,
                jam_masuk: true, jam_pulang: true,
                toleransi_terlambat_menit: true, is_lintas_hari: true,
              },
            },
          },
        },
      },
    })

    // Filter divisi/subdivisi post-query
    if (divisiId) {
      data = data.filter(a => String(a.karyawans?.divisi_id) === divisiId)
    }
    if (subdivisiId) {
      data = data.filter(a => String(a.karyawans?.subdivisi_id) === subdivisiId)
    }
    // Search nama/NIK
    if (search) {
      const q = search.toLowerCase()
      data = data.filter(a =>
        a.karyawans?.nama_karyawan.toLowerCase().includes(q) ||
        a.karyawans?.nik.toLowerCase().includes(q)
      )
    }

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
      karyawan_id, tanggal_absensi, jadwal_shift_id,
      jam_masuk, jam_pulang, status_absensi: statusOverride,
      alasan_manual, catatan_manual,
    } = body

    // ── Validasi wajib ──────────────────────────────────────────
    if (!karyawan_id)     return NextResponse.json({ error: "Karyawan wajib dipilih" }, { status: 400 })
    if (!tanggal_absensi) return NextResponse.json({ error: "Tanggal absensi wajib diisi" }, { status: 400 })
    if (!jam_masuk && !jam_pulang && !statusOverride) {
      return NextResponse.json({ error: "Jam masuk, jam pulang, atau status wajib diisi" }, { status: 400 })
    }
    if (!alasan_manual?.trim()) {
      return NextResponse.json({ error: "Alasan manual wajib diisi untuk input manual" }, { status: 400 })
    }

    // ── Cek karyawan aktif ──────────────────────────────────────
    const karyawan = await prisma.karyawans.findUnique({
      where: { id: BigInt(karyawan_id) },
      select: { status_karyawan: true, nama_karyawan: true },
    })
    if (!karyawan) return NextResponse.json({ error: "Karyawan tidak ditemukan" }, { status: 404 })
    if (karyawan.status_karyawan === "Pensiun" || karyawan.status_karyawan === "Nonaktif") {
      return NextResponse.json(
        { error: `Karyawan ${karyawan.nama_karyawan} berstatus ${karyawan.status_karyawan}` },
        { status: 422 },
      )
    }

    // ── Ambil jadwal shift di tanggal tsb ───────────────────────
    const tglDate = new Date(tanggal_absensi)
    let shift = null
    let resolvedJadwalShiftId: bigint | null = jadwal_shift_id ? BigInt(jadwal_shift_id) : null

    if (!resolvedJadwalShiftId) {
      const jadwal = await prisma.jadwal_shifts.findFirst({
        where: { karyawan_id: BigInt(karyawan_id), tanggal: tglDate },
        include: { shift_kerjas: true },
      })
      if (jadwal) {
        resolvedJadwalShiftId = jadwal.id
        shift = jadwal.shift_kerjas
      }
    } else {
      const jadwal = await prisma.jadwal_shifts.findUnique({
        where: { id: resolvedJadwalShiftId },
        include: { shift_kerjas: true },
      })
      shift = jadwal?.shift_kerjas ?? null
    }

    // ── Cek hari libur ──────────────────────────────────────────
    const hariLibur = await prisma.hari_liburs.findFirst({
      where: { tanggal: tglDate },
    })

    // ── Resolve leave status (placeholder) ─────────────────────
    const { has_cuti, has_izin, has_sakit } = await resolveLeaveStatus(BigInt(karyawan_id), tglDate)

    // ── Hitung status absensi ───────────────────────────────────
    let { status_absensi, is_terlambat, is_pulang_cepat, is_tidak_absen_masuk, is_tidak_absen_pulang, menit_terlambat, menit_pulang_cepat, total_jam_kerja_menit } =
      hitungAbsensi({ jam_masuk, jam_pulang, shift, is_hari_libur: !!hariLibur, has_cuti, has_izin, has_sakit })

    // Admin/HRD bisa override status
    if (statusOverride) status_absensi = statusOverride

    const now = new Date()
    const userId = BigInt(auth.user.id)

    const data = await prisma.absensi.create({
      data: {
        karyawan_id:           BigInt(karyawan_id),
        jadwal_shift_id:       resolvedJadwalShiftId,
        tanggal_absensi:       tglDate,
        jam_masuk:             jam_masuk   || null,
        jam_pulang:            jam_pulang  || null,
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
        created_by:            userId,
        updated_by:            userId,
        created_at:            now,
        updated_at:            now,
      },
    })

    await writeAuditLog({
      user: auth.user, action: "CREATE", modelType: "absensi",
      modelId: data.id, dataBaru: serialize(data), ip: getClientIp(req),
    })

    return NextResponse.json(serialize(data), { status: 201 })
  } catch (err: unknown) {
    console.error("[API absensi POST]", err)
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "Absensi untuk karyawan dan tanggal ini sudah ada. Gunakan edit untuk koreksi." }, { status: 409 })
    }
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Gagal menyimpan absensi: ${msg}` }, { status: 500 })
  }
}
