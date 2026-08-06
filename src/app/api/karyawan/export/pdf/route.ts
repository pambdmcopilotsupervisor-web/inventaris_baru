import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/lib/auth"
import { getKaryawanReportRows } from "@/lib/karyawan-report"
import { generateKaryawanReportPdf } from "@/lib/karyawan-report-pdf"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const auth = await requireSession(req)
  if ("error" in auth) return auth.error

  try {
    const rows = await getKaryawanReportRows()
    const printedBy = auth.user.nama_karyawan?.trim() || auth.user.name?.trim() || auth.user.email?.trim() || "Sistem"
    const pdf = await generateKaryawanReportPdf(rows, { printedBy })
    const filename = `Data_Karyawan_${new Date().toISOString().slice(0, 10)}.pdf`

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    console.error("[karyawan export pdf]", error)
    return NextResponse.json({ error: "Gagal membuat PDF data karyawan" }, { status: 500 })
  }
}
