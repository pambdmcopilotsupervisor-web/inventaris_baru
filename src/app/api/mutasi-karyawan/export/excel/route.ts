import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/lib/auth"
import { generateMutasiKaryawanExcel, getMutasiKaryawanExportRows, xlsxHeaders } from "@/lib/karyawan-status-export"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const auth = await requireSession(req)
  if ("error" in auth) return auth.error

  try {
    const rows = await getMutasiKaryawanExportRows()
    const workbook = generateMutasiKaryawanExcel(rows)
    const filename = `Mutasi_Karyawan_${new Date().toISOString().slice(0, 10)}.xlsx`

    return new NextResponse(new Uint8Array(workbook), {
      status: 200,
      headers: xlsxHeaders(filename),
    })
  } catch (error) {
    console.error("[mutasi karyawan export excel]", error)
    return NextResponse.json({ error: "Gagal membuat Excel mutasi karyawan" }, { status: 500 })
  }
}
