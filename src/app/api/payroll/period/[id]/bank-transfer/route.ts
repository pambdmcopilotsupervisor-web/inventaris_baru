import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]

/** Escape nilai untuk CSV (RFC 4180). */
function csv(value: string | number): string {
  const s = String(value ?? "")
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// GET /api/payroll/period/[id]/bank-transfer → file CSV disbursement transfer bank
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin", "hrd"])
  if ("error" in auth) return auth.error

  try {
    const { id } = await params
    const periodId = Number(id)
    if (!Number.isInteger(periodId) || periodId <= 0) {
      return NextResponse.json({ error: "ID periode tidak valid" }, { status: 400 })
    }

    const period = await prisma.payroll_periods.findUnique({ where: { id: BigInt(periodId) } })
    if (!period) return NextResponse.json({ error: "Periode tidak ditemukan" }, { status: 404 })
    if (!["APPROVED", "PAID", "CLOSED"].includes(period.status)) {
      return NextResponse.json({ error: "File transfer hanya tersedia setelah periode disetujui" }, { status: 422 })
    }

    const slips = await prisma.payroll_slips.findMany({
      where: { payroll_period_id: BigInt(periodId) },
      include: { karyawans: { select: { nik: true, nama_karyawan: true, nama_bank: true, no_rekening: true } } },
      orderBy: { id: "asc" },
    })

    const header = ["No", "NIK", "Nama", "Bank", "No Rekening", "Nominal", "Keterangan"]
    const lines = [header.map(csv).join(",")]
    let total = 0
    slips.forEach((s, i) => {
      const net = Math.round(Number(s.net_salary))
      total += net
      lines.push([
        i + 1,
        s.karyawans.nik,
        s.karyawans.nama_karyawan,
        s.karyawans.nama_bank ?? "",
        s.karyawans.no_rekening ?? "",
        net,
        `Gaji ${MONTHS[period.period_month - 1]} ${period.period_year}`,
      ].map(csv).join(","))
    })
    lines.push(["", "", "TOTAL", "", "", total, ""].map(csv).join(","))

    // BOM agar Excel mengenali UTF-8.
    const body = "\uFEFF" + lines.join("\r\n")
    const filename = `Transfer_Bank_${period.period_year}_${String(period.period_month).padStart(2, "0")}.csv`

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (err) {
    console.error("[payroll bank-transfer]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal membuat file transfer" }, { status: 500 })
  }
}
