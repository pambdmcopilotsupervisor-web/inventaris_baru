import { NextRequest, NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { requireRole } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]
const RP_FMT = '"Rp"#,##0'

interface EmployeeSnapshot {
  nik?: string
  nama?: string
  department?: string
}

async function resolveDepartments(employeeIds: bigint[]): Promise<Map<string, string>> {
  if (employeeIds.length === 0) return new Map()
  const karyawans = await prisma.karyawans.findMany({
    where: { id: { in: employeeIds } },
    select: { id: true, divisi_id: true, subdivisi_id: true },
  })
  const subIds = karyawans.map((k) => k.subdivisi_id).filter((x): x is number => x != null)
  const divIds = karyawans.map((k) => k.divisi_id).filter((x): x is number => x != null)
  const [subs, divs] = await Promise.all([
    subIds.length ? prisma.subdivisis.findMany({ where: { id: { in: subIds.map((i) => BigInt(i)) } }, select: { id: true, nama_sub: true, divisi_id: true } }) : Promise.resolve([]),
    divIds.length ? prisma.divisis.findMany({ where: { id: { in: divIds.map((i) => BigInt(i)) } }, select: { id: true, nama_divisi: true } }) : Promise.resolve([]),
  ])
  const subMap = new Map(subs.map((s) => [s.id.toString(), s]))
  const divMap = new Map(divs.map((d) => [d.id.toString(), d.nama_divisi]))
  const out = new Map<string, string>()
  for (const k of karyawans) {
    let dept = "—"
    if (k.subdivisi_id) {
      const sub = subMap.get(String(k.subdivisi_id))
      if (sub) dept = divMap.get(String(sub.divisi_id)) ?? sub.nama_sub
    } else if (k.divisi_id) dept = divMap.get(String(k.divisi_id)) ?? "—"
    out.set(k.id.toString(), dept)
  }
  return out
}

/** Terapkan format Rp pada kolom numerik tertentu. */
function applyRpFormat(ws: XLSX.WorkSheet, colIdxs: number[], firstDataRow: number, rowCount: number) {
  for (let r = firstDataRow; r < firstDataRow + rowCount; r++) {
    for (const c of colIdxs) {
      const addr = XLSX.utils.encode_cell({ r, c })
      const cell = ws[addr]
      if (cell && typeof cell.v === "number") cell.z = RP_FMT
    }
  }
}

// GET /api/payroll/period/[id]/export → rekap Excel periode
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

    const slips = await prisma.payroll_slips.findMany({
      where: { payroll_period_id: BigInt(periodId) },
      include: {
        karyawans: { select: { id: true, nik: true, nama_karyawan: true } },
        details: { orderBy: { sort_order: "asc" } },
      },
      orderBy: { id: "asc" },
    })

    const deptMap = await resolveDepartments(slips.map((s) => s.employee_id))

    // Rentang tanggal aktual periode (fallback 1..akhir bulan).
    const periodStart = period.period_start_date ? new Date(period.period_start_date) : new Date(period.period_year, period.period_month - 1, 1)
    const periodEnd = period.period_end_date ? new Date(period.period_end_date) : new Date(period.period_year, period.period_month, 0)
    const fmtD = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`
    const periodTitle = `Periode ${MONTHS[period.period_month - 1]} ${period.period_year} (${fmtD(periodStart)} – ${fmtD(periodEnd)})`

    // ── Sheet 1: Rekapitulasi ──
    const aoa1: (string | number)[][] = [
      [periodTitle],
      ["No", "NIK", "Nama", "Departemen", "Hari Kerja", "Total Pendapatan", "Total Potongan", "Gaji Bersih"],
    ]
    slips.forEach((s, i) => {
      const emp = (s.employee_snapshot as EmployeeSnapshot | null) ?? null
      aoa1.push([
        i + 1,
        emp?.nik ?? s.karyawans.nik,
        emp?.nama ?? s.karyawans.nama_karyawan,
        emp?.department ?? deptMap.get(s.employee_id.toString()) ?? "—",
        s.working_days,
        Number(s.total_earnings),
        Number(s.total_deductions),
        Number(s.net_salary),
      ])
    })
    aoa1.push([])
    aoa1.push([
      "", "", "TOTAL", "", "",
      slips.reduce((a, s) => a + Number(s.total_earnings), 0),
      slips.reduce((a, s) => a + Number(s.total_deductions), 0),
      slips.reduce((a, s) => a + Number(s.net_salary), 0),
    ])
    const ws1 = XLSX.utils.aoa_to_sheet(aoa1)
    ws1["!cols"] = [{ wch: 5 }, { wch: 16 }, { wch: 28 }, { wch: 20 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 16 }]
    applyRpFormat(ws1, [5, 6, 7], 2, slips.length)
    applyRpFormat(ws1, [5, 6, 7], aoa1.length - 1, 1)

    // ── Sheet 2: Detail Komponen (pivot) ──
    // Union komponen: EARNING dulu lalu DEDUCTION, urut kemunculan.
    const compOrder: { code: string; name: string; type: string }[] = []
    const seen = new Set<string>()
    for (const s of slips) {
      for (const d of s.details) {
        if (!seen.has(d.component_code)) {
          seen.add(d.component_code)
          compOrder.push({ code: d.component_code, name: d.component_name, type: d.type })
        }
      }
    }
    compOrder.sort((a, b) => (a.type === b.type ? 0 : a.type === "EARNING" ? -1 : 1))

    const header2 = ["No", "NIK", "Nama", "Departemen", ...compOrder.map((c) => c.name), "Total Pendapatan", "Total Potongan", "Gaji Bersih"]
    const aoa2: (string | number)[][] = [header2]
    slips.forEach((s, i) => {
      const emp = (s.employee_snapshot as EmployeeSnapshot | null) ?? null
      const amountByCode = new Map<string, number>()
      for (const d of s.details) amountByCode.set(d.component_code, (amountByCode.get(d.component_code) ?? 0) + Number(d.amount))
      const row: (string | number)[] = [
        i + 1, emp?.nik ?? s.karyawans.nik, emp?.nama ?? s.karyawans.nama_karyawan, emp?.department ?? deptMap.get(s.employee_id.toString()) ?? "—",
      ]
      for (const c of compOrder) row.push(amountByCode.get(c.code) ?? 0)
      row.push(Number(s.total_earnings), Number(s.total_deductions), Number(s.net_salary))
      aoa2.push(row)
    })
    const ws2 = XLSX.utils.aoa_to_sheet(aoa2)
    ws2["!cols"] = [{ wch: 5 }, { wch: 16 }, { wch: 28 }, { wch: 20 }, ...compOrder.map(() => ({ wch: 15 })), { wch: 16 }, { wch: 16 }, { wch: 16 }]
    // Format Rp pada kolom komponen + 3 kolom total.
    const numCols2 = Array.from({ length: compOrder.length + 3 }, (_, k) => 4 + k)
    applyRpFormat(ws2, numCols2, 1, slips.length)

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws1, "Rekapitulasi")
    XLSX.utils.book_append_sheet(wb, ws2, "Detail Komponen")

    const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
    const filename = `Rekap_Payroll_${period.period_year}_${String(period.period_month).padStart(2, "0")}.xlsx`

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (err) {
    console.error("[payroll period export]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal membuat Excel" }, { status: 500 })
  }
}
