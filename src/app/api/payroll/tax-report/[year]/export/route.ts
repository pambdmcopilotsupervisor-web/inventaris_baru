import { NextRequest, NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { requireRole } from "@/lib/auth"
import { getAnnualTaxRecap } from "@/actions/payroll-tax-report"

export const runtime = "nodejs"
const RP_FMT = '"Rp"#,##0'

// GET /api/payroll/tax-report/[year]/export → rekap PPh21 tahunan (Excel)
export async function GET(req: NextRequest, { params }: { params: Promise<{ year: string }> }) {
  const auth = await requireRole(req, ["admin", "hrd"])
  if ("error" in auth) return auth.error

  try {
    const { year } = await params
    const y = Number(year)
    if (!Number.isInteger(y) || y < 2000) return NextResponse.json({ error: "Tahun tidak valid" }, { status: 400 })

    const res = await getAnnualTaxRecap(y)
    if (!res.success) return NextResponse.json({ error: res.error }, { status: 400 })
    const data = res.data as unknown as {
      rows: { nik: string; nama: string; jabatan: string; status_ptkp: string; punya_npwp: boolean; bruto_year: number; pph_terutang: number; pph_dipotong: number; selisih: number }[]
      totals: { bruto: number; terutang: number; dipotong: number }
    }

    const aoa: (string | number)[][] = [
      [`Rekap PPh21 Tahunan ${y}`],
      ["No", "NIK", "Nama", "Jabatan", "Status PTKP", "NPWP", "Bruto Setahun", "PPh21 Terutang", "PPh21 Dipotong", "Selisih (Kurang+/Lebih-)"],
    ]
    data.rows.forEach((r, i) => {
      aoa.push([i + 1, r.nik, r.nama, r.jabatan, r.status_ptkp, r.punya_npwp ? "Ya" : "Tidak", r.bruto_year, r.pph_terutang, r.pph_dipotong, r.selisih])
    })
    aoa.push([])
    aoa.push(["", "", "TOTAL", "", "", "", data.totals.bruto, data.totals.terutang, data.totals.dipotong, data.totals.terutang - data.totals.dipotong])

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws["!cols"] = [{ wch: 5 }, { wch: 16 }, { wch: 28 }, { wch: 18 }, { wch: 12 }, { wch: 8 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 20 }]
    // Format Rp pada kolom numerik (index 6..9), mulai baris data (row 2).
    for (let rIdx = 2; rIdx < aoa.length; rIdx++) {
      for (const c of [6, 7, 8, 9]) {
        const addr = XLSX.utils.encode_cell({ r: rIdx, c })
        const cell = ws[addr]
        if (cell && typeof cell.v === "number") cell.z = RP_FMT
      }
    }

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `PPh21 ${y}`)
    const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Rekap_PPh21_${y}.xlsx"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (err) {
    console.error("[tax-report export]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal membuat Excel" }, { status: 500 })
  }
}
