import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/lib/auth"
import { generateMutasiKaryawanPdf, getMutasiKaryawanExportRows, pdfHeaders } from "@/lib/karyawan-status-export"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const auth = await requireSession(req)
  if ("error" in auth) return auth.error

  try {
    const rows = await getMutasiKaryawanExportRows()
    const printedBy = auth.user.nama_karyawan?.trim() || auth.user.name?.trim() || auth.user.email?.trim() || "Sistem"
    const pdf = await generateMutasiKaryawanPdf(rows, { printedBy })
    const filename = `Mutasi_Karyawan_${new Date().toISOString().slice(0, 10)}.pdf`

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: pdfHeaders(filename),
    })
  } catch (error) {
    console.error("[mutasi karyawan export pdf]", error)
    return NextResponse.json({ error: "Gagal membuat PDF mutasi karyawan" }, { status: 500 })
  }
}
