import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/lib/auth"
import { generatePendapatanAsetPdf } from "@/lib/pendapatan-aset-pdf"
import { getPendapatanAsetReport } from "@/lib/pendapatan-aset-report"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const auth = await requireSession(req)
  if ("error" in auth) return auth.error

  try {
    const { searchParams } = new URL(req.url)
    const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()))
    const startMonth = parseInt(searchParams.get("start_month") ?? String(new Date().getMonth() + 1))
    const endMonth = parseInt(searchParams.get("end_month") ?? String(startMonth))

    const report = await getPendapatanAsetReport({ year, startMonth, endMonth })
    const printedBy = auth.user.nama_karyawan?.trim() || auth.user.name?.trim() || auth.user.email?.trim() || "Sistem"
    const pdf = await generatePendapatanAsetPdf(report, { printedBy })
    const filename = `Laporan_Pendapatan_Aset_${year}_${String(startMonth).padStart(2, "0")}-${String(endMonth).padStart(2, "0")}.pdf`

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    console.error("[laporan pendapatan aset pdf]", error)
    return NextResponse.json({ error: "Gagal membuat PDF laporan pendapatan aset" }, { status: 500 })
  }
}