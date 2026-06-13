import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"
import { isAdminRole, isHrdUser } from "@/lib/approval"

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
  return { dtMulai: new Date(`${y}-${mm}-01`), dtSelesai: new Date(`${y}-${mm}-${lastDay}`) }
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error

  try {
    const role = auth.user.role ?? "user"
    const karyawanIdSession = auth.user.karyawan_id
    const canView = isAdminRole(role) || await isHrdUser(karyawanIdSession)
    if (!canView) return NextResponse.json({ error: "Hanya Admin atau HRD yang dapat melihat laporan karyawan tanpa jadwal" }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const { dtMulai, dtSelesai } = getDateRange(searchParams)
    const divisiId = searchParams.get("divisi_id")
    const includePartial = searchParams.get("include_partial") === "true"

    const hariLiburs = await prisma.hari_liburs.findMany({
      where: { tanggal: { gte: dtMulai, lte: dtSelesai } },
      select: { tanggal: true },
    })
    const liburSet = new Set(hariLiburs.map(item => dateKey(item.tanggal)))
    const targetDates: string[] = []
    const cur = new Date(dtMulai)
    while (cur <= dtSelesai) {
      const key = dateKey(cur)
      if (cur.getDay() !== 0 && !liburSet.has(key)) targetDates.push(key)
      cur.setDate(cur.getDate() + 1)
    }

    const karyawans = await prisma.karyawans.findMany({
      where: {
        status_karyawan: { notIn: ["Pensiun", "Nonaktif"] },
        ...(divisiId ? { divisi_id: Number(divisiId) } : {}),
      },
      orderBy: { nama_karyawan: "asc" },
      select: {
        id: true,
        nik: true,
        nama_karyawan: true,
        jabatan: true,
        status_karyawan: true,
        divisi_id: true,
        jadwal_shifts: {
          where: { tanggal: { gte: dtMulai, lte: dtSelesai } },
          select: { tanggal: true, shift_kerjas: { select: { kode_shift: true, nama_shift: true } } },
        },
      },
    })

    const divisiIds = Array.from(new Set(karyawans.map(k => k.divisi_id).filter((id): id is number => id != null)))
    const divisis = divisiIds.length > 0
      ? await prisma.divisis.findMany({ where: { id: { in: divisiIds.map(id => BigInt(id)) } }, select: { id: true, nama_divisi: true } })
      : []
    const divisiMap = new Map(divisis.map(divisi => [Number(divisi.id), divisi.nama_divisi]))

    const data = karyawans
      .map(karyawan => {
        const scheduledDates = new Set(karyawan.jadwal_shifts.map(jadwal => dateKey(jadwal.tanggal)))
        const missingDates = targetDates.filter(tanggal => !scheduledDates.has(tanggal))
        return {
          id: karyawan.id,
          nik: karyawan.nik,
          nama_karyawan: karyawan.nama_karyawan,
          jabatan: karyawan.jabatan,
          status_karyawan: karyawan.status_karyawan,
          divisi_id: karyawan.divisi_id,
          nama_divisi: karyawan.divisi_id ? divisiMap.get(karyawan.divisi_id) ?? null : null,
          total_hari_target: targetDates.length,
          total_jadwal: scheduledDates.size,
          total_tanpa_jadwal: missingDates.length,
          tanggal_tanpa_jadwal: missingDates,
          status_jadwal: scheduledDates.size === 0 ? "tanpa_jadwal" : missingDates.length > 0 ? "parsial" : "lengkap",
        }
      })
      .filter(row => row.status_jadwal === "tanpa_jadwal" || (includePartial && row.status_jadwal === "parsial"))

    const summary = {
      total: data.length,
      tanpa_jadwal: data.filter(row => row.status_jadwal === "tanpa_jadwal").length,
      parsial: data.filter(row => row.status_jadwal === "parsial").length,
      total_hari_target: targetDates.length,
    }

    return NextResponse.json(serialize({ periode: { tanggal_mulai: dtMulai, tanggal_selesai: dtSelesai }, summary, data }))
  } catch (err) {
    console.error("[karyawan tanpa jadwal]", err)
    return NextResponse.json({ error: "Gagal mengambil laporan karyawan tanpa jadwal" }, { status: 500 })
  }
}
