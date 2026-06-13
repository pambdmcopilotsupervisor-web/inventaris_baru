import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireMobileAuth } from "@/lib/mobile-auth"
import { STATUS_CUTI_LABELS, STATUS_CUTI } from "@/lib/leave"

// GET /api/mobile/cuti
// List pengajuan cuti pegawai yang login
// Query: status, bulan, tahun

export async function GET(req: NextRequest) {
  const auth = await requireMobileAuth(req)
  if ("error" in auth) return auth.error

  const karyawanId = auth.user.karyawan_id
  if (!karyawanId) return NextResponse.json({ error: "Akun belum terhubung ke karyawan" }, { status: 422 })

  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status")
    const bulan  = searchParams.get("bulan")
    const tahun  = searchParams.get("tahun")

    const where: Record<string, unknown> = { karyawan_id: BigInt(karyawanId) }
    if (status) where.status = status
    if (bulan && tahun) {
      const y = parseInt(tahun), m = parseInt(bulan)
      const mm = String(m).padStart(2, "0")
      const lastDay = new Date(y, m, 0).getDate()
      where.tanggal_mulai = { gte: new Date(`${y}-${mm}-01`), lte: new Date(`${y}-${mm}-${lastDay}`) }
    }

    const data = await prisma.pengajuan_cutis.findMany({
      where,
      orderBy: { created_at: "desc" },
      include: {
        jenis_cutis: { select: { id: true, kode_cuti: true, nama_cuti: true, potong_saldo_cuti: true } },
        approvals:   { orderBy: { approval_level: "asc" } },
      },
    })

    // Saldo cuti tahun ini
    const tahunIni = new Date().getFullYear()
    const saldos = await prisma.saldo_cutis.findMany({
      where: { karyawan_id: BigInt(karyawanId), tahun: tahunIni },
      include: { jenis_cutis: { select: { kode_cuti: true, nama_cuti: true } } },
    })

    return NextResponse.json(serialize({
      pengajuan: data.map(p => ({
        ...p,
        status_label: STATUS_CUTI_LABELS[p.status as keyof typeof STATUS_CUTI_LABELS] ?? p.status,
      })),
      saldo_cuti: saldos.map(s => ({
        ...s,
        saldo_sisa: s.saldo_awal + s.saldo_penyesuaian - s.saldo_terpakai,
      })),
    }))
  } catch { return NextResponse.json({ error: "Server error" }, { status: 500 }) }
}
