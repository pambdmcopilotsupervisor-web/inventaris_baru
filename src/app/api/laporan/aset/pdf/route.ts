import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/lib/auth"
import { getAsetReportRows } from "@/lib/aset-report"
import { generateAsetReportPdf } from "@/lib/aset-report-pdf"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const auth = await requireSession(req)
  if ("error" in auth) return auth.error

  try {
    const { searchParams } = req.nextUrl
    const kelompok_asset = searchParams.get("kelompok_asset") || null
    const ruangan_id = searchParams.get("ruangan_id") ? Number(searchParams.get("ruangan_id")) : null
    const status_barang = searchParams.get("status_barang") || null
    const filters = { kelompok_asset, ruangan_id, status_barang }

    const rows = await getAsetReportRows(filters)
    const printedBy = auth.user.nama_karyawan?.trim() || auth.user.name?.trim() || auth.user.email?.trim() || "Sistem"
    const pdf = await generateAsetReportPdf(rows, { filters, printedBy })
    const filename = `Laporan_Inventaris_Aset_${new Date().toISOString().slice(0, 10)}.pdf`

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    console.error("[laporan aset pdf]", error)
    return NextResponse.json({ error: "Gagal membuat PDF laporan aset" }, { status: 500 })
  }
}

