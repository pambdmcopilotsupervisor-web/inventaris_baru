import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"
import { isAdminRole, isHrdUser } from "@/lib/approval"

const ANOMALY_TYPES = [
  "terlambat",
  "pulang_cepat",
  "tidak_absen_masuk",
  "tidak_absen_pulang",
  "di_luar_jam_absen",
  "alpha",
] as const

type AnomalyType = typeof ANOMALY_TYPES[number]

function getDateRange(searchParams: URLSearchParams) {
  const tglMulai = searchParams.get("tgl_mulai")
  const tglSelesai = searchParams.get("tgl_selesai")
  if (tglMulai && tglSelesai) return { dtMulai: new Date(tglMulai), dtSelesai: new Date(tglSelesai) }

  const bulan = searchParams.get("bulan")
  const tahun = searchParams.get("tahun")
  const y = tahun ? parseInt(tahun) : new Date().getFullYear()
  const m = bulan ? parseInt(bulan) : new Date().getMonth() + 1
  const mm = String(m).padStart(2, "0")
  const lastDay = new Date(y, m, 0).getDate()
  // Gunakan string ISO agar di-parse sebagai UTC midnight (konsisten dengan @db.Date)
  return { dtMulai: new Date(`${y}-${mm}-01`), dtSelesai: new Date(`${y}-${mm}-${lastDay}`) }
}

function getAnomalyTypes(row: {
  status_absensi: string
  is_terlambat: boolean | null
  is_pulang_cepat: boolean | null
  is_tidak_absen_masuk: boolean | null
  is_tidak_absen_pulang: boolean | null
}): AnomalyType[] {
  const types = new Set<AnomalyType>()
  if (ANOMALY_TYPES.includes(row.status_absensi as AnomalyType)) types.add(row.status_absensi as AnomalyType)
  if (row.is_terlambat) types.add("terlambat")
  if (row.is_pulang_cepat) types.add("pulang_cepat")
  if (row.is_tidak_absen_masuk) types.add("tidak_absen_masuk")
  if (row.is_tidak_absen_pulang) types.add("tidak_absen_pulang")
  return Array.from(types)
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error

  try {
    const role = auth.user.role ?? "user"
    const karyawanIdSession = auth.user.karyawan_id
    const canView = isAdminRole(role) || await isHrdUser(karyawanIdSession)
    if (!canView) return NextResponse.json({ error: "Hanya Admin atau HRD yang dapat melihat laporan anomali absensi" }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const { dtMulai, dtSelesai } = getDateRange(searchParams)
    const karyawanId = searchParams.get("karyawan_id")
    const divisiId = searchParams.get("divisi_id")
    const selectedTypes = searchParams.get("types")
      ?.split(",")
      .map(type => type.trim())
      .filter((type): type is AnomalyType => ANOMALY_TYPES.includes(type as AnomalyType)) ?? []

    const rows = await prisma.absensi.findMany({
      where: {
        tanggal_absensi: { gte: dtMulai, lte: dtSelesai },
        ...(karyawanId ? { karyawan_id: BigInt(karyawanId) } : {}),
        ...(divisiId ? { karyawans: { divisi_id: Number(divisiId) } } : {}),
        OR: [
          { status_absensi: { in: [...ANOMALY_TYPES] } },
          { is_terlambat: true },
          { is_pulang_cepat: true },
          { is_tidak_absen_masuk: true },
          { is_tidak_absen_pulang: true },
        ],
      },
      orderBy: [{ tanggal_absensi: "desc" }, { karyawans: { nama_karyawan: "asc" } }],
      include: {
        karyawans: { select: { id: true, nik: true, nama_karyawan: true, jabatan: true, divisi_id: true } },
        jadwal_shifts: { include: { shift_kerjas: { select: { kode_shift: true, nama_shift: true, jam_masuk: true, jam_pulang: true } } } },
      },
    })

    const divisiIds = Array.from(new Set(rows.map(row => row.karyawans.divisi_id).filter((id): id is number => id != null)))
    const divisis = divisiIds.length > 0
      ? await prisma.divisis.findMany({ where: { id: { in: divisiIds.map(id => BigInt(id)) } }, select: { id: true, nama_divisi: true } })
      : []
    const divisiMap = new Map(divisis.map(divisi => [Number(divisi.id), { nama_divisi: divisi.nama_divisi }]))

    const summary: Record<AnomalyType | "total", number> = {
      total: 0,
      terlambat: 0,
      pulang_cepat: 0,
      tidak_absen_masuk: 0,
      tidak_absen_pulang: 0,
      di_luar_jam_absen: 0,
      alpha: 0,
    }

    const data = rows
      .map(row => ({
        ...row,
        karyawans: { ...row.karyawans, divisis: row.karyawans.divisi_id ? divisiMap.get(row.karyawans.divisi_id) ?? null : null },
        anomaly_types: getAnomalyTypes(row),
      }))
      .filter(row => selectedTypes.length === 0 || row.anomaly_types.some(type => selectedTypes.includes(type)))

    for (const row of data) {
      summary.total++
      for (const type of row.anomaly_types) summary[type]++
    }

    return NextResponse.json(serialize({ periode: { tanggal_mulai: dtMulai, tanggal_selesai: dtSelesai }, summary, data }))
  } catch (err) {
    console.error("[absensi anomali]", err)
    return NextResponse.json({ error: "Gagal mengambil laporan anomali absensi" }, { status: 500 })
  }
}
