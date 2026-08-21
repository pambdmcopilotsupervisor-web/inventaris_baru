import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/lib/auth"
import { generatePensiunKaryawanExcel, getPensiunKaryawanExportRows, xlsxHeaders } from "@/lib/karyawan-status-export"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const auth = await requireSession(req)
  if ("error" in auth) return auth.error

  try {
    const rows = await getPensiunKaryawanExportRows()
    const workbook = generatePensiunKaryawanExcel(rows)
    const filename = `Pensiun_Karyawan_${new Date().toISOString().slice(0, 10)}.xlsx`

    return new NextResponse(new Uint8Array(workbook), {
      status: 200,
      headers: xlsxHeaders(filename),
    })
  } catch (error) {
    console.error("[pensiun karyawan export excel]", error)
    return NextResponse.json({ error: "Gagal membuat Excel pensiun karyawan" }, { status: 500 })
  }
}
