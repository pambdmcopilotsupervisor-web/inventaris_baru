import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { recalculateAbsensi } from "@/lib/attendance"

const MAX_RANGE_DAYS = 31

function daysBetween(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
}

async function resolveTargetKaryawanIds(body: {
  karyawan_id?: string | number
  karyawan_ids?: Array<string | number>
  divisi_id?: string | number
  subdivisi_id?: string | number
}): Promise<bigint[]> {
  if (body.karyawan_ids && Array.isArray(body.karyawan_ids) && body.karyawan_ids.length > 0) {
    return body.karyawan_ids.map(id => BigInt(id))
  }

  if (body.karyawan_id) return [BigInt(body.karyawan_id)]

  if (body.subdivisi_id) {
    const karyawans = await prisma.karyawans.findMany({
      where: {
        status_karyawan: { notIn: ["Pensiun", "Nonaktif"] },
        subdivisi_id: Number(body.subdivisi_id),
      },
      select: { id: true },
    })
    return karyawans.map(k => k.id)
  }

  if (body.divisi_id) {
    const rows = await prisma.$queryRaw<{ id: bigint }[]>`
      SELECT k.id
      FROM karyawans k
      LEFT JOIN subdivisis s ON s.id = k.subdivisi_id
      WHERE k.status_karyawan NOT IN ('Pensiun', 'Nonaktif')
        AND (
          k.divisi_id = ${Number(body.divisi_id)}
          OR (k.divisi_id IS NULL AND s.divisi_id = ${Number(body.divisi_id)})
        )
    `
    return rows.map(r => BigInt(r.id))
  }

  const karyawans = await prisma.karyawans.findMany({
    where: { status_karyawan: { notIn: ["Pensiun", "Nonaktif"] } },
    select: { id: true },
  })
  return karyawans.map(k => k.id)
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd"])
  if ("error" in auth) return auth.error

  try {
    const body = await req.json()
    const tanggalMulaiRaw = body.tgl_mulai ?? body.tanggal
    const tanggalSelesaiRaw = body.tgl_selesai ?? body.tanggal ?? body.tgl_mulai

    if (!tanggalMulaiRaw) return NextResponse.json({ error: "Tanggal mulai wajib diisi" }, { status: 400 })
    if (!tanggalSelesaiRaw) return NextResponse.json({ error: "Tanggal selesai wajib diisi" }, { status: 400 })

    const tanggalMulai = new Date(tanggalMulaiRaw)
    const tanggalSelesai = new Date(tanggalSelesaiRaw)
    if (Number.isNaN(tanggalMulai.getTime()) || Number.isNaN(tanggalSelesai.getTime())) {
      return NextResponse.json({ error: "Format tanggal tidak valid" }, { status: 400 })
    }
    if (tanggalSelesai < tanggalMulai) {
      return NextResponse.json({ error: "Tanggal selesai tidak boleh sebelum tanggal mulai" }, { status: 400 })
    }

    const rangeDays = daysBetween(tanggalMulai, tanggalSelesai)
    if (rangeDays > MAX_RANGE_DAYS) {
      return NextResponse.json({ error: `Rentang tanggal maksimal ${MAX_RANGE_DAYS} hari per proses` }, { status: 422 })
    }

    const karyawanIds = await resolveTargetKaryawanIds(body)
    if (karyawanIds.length === 0) return NextResponse.json({ error: "Tidak ada karyawan aktif yang memenuhi target" }, { status: 422 })

    const result = await recalculateAbsensi({
      karyawanIds,
      tanggalMulai,
      tanggalSelesai,
      userId: BigInt(auth.user.id),
      forceManual: body.force_manual === true,
      createMissing: body.create_missing !== false,
      includeTanpaJadwal: body.include_tanpa_jadwal === true,
    })

    await writeAuditLog({
      user: auth.user,
      action: "UPDATE",
      modelType: "absensi_recalculate",
      dataBaru: {
        tanggal_mulai: tanggalMulaiRaw,
        tanggal_selesai: tanggalSelesaiRaw,
        karyawan_id: body.karyawan_id ?? null,
        divisi_id: body.divisi_id ?? null,
        subdivisi_id: body.subdivisi_id ?? null,
        force_manual: body.force_manual === true,
        create_missing: body.create_missing !== false,
        include_tanpa_jadwal: body.include_tanpa_jadwal === true,
        ...result,
      },
      ip: getClientIp(req),
    })

    return NextResponse.json({
      success: true,
      ...result,
      message: `${result.dibuat} absensi dibuat, ${result.diperbarui} diperbarui, ${result.dilewati} dilewati.`,
    })
  } catch (err) {
    console.error("[absensi recalculate]", err)
    return NextResponse.json({ error: "Gagal menghitung ulang absensi" }, { status: 500 })
  }
}
