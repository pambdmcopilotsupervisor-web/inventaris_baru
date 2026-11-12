import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/lib/auth"
import { getKendaraanReportRecords } from "@/lib/kendaraan-report"
import { generateKendaraanReportPdf } from "@/lib/kendaraan-report-pdf"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const auth = await requireSession(req)
  if ("error" in auth) return auth.error

  try {
    const filters = {
      jns_brg: req.nextUrl.searchParams.get("jns_brg") || null,
      stat: req.nextUrl.searchParams.get("stat") || null,
    }
    const rows = await getKendaraanReportRecords(filters)
    const pdf = await generateKendaraanReportPdf(rows, filters)
    const filename = `Laporan_Kendaraan_R2R4_${new Date().toISOString().slice(0, 10)}.pdf`

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    console.error("[laporan kendaraan pdf]", error)
    return NextResponse.json({ error: "Gagal membuat PDF laporan kendaraan" }, { status: 500 })
  }
}
