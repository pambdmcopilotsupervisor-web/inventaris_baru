import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/lib/auth"
import { getKaryawanMasaKerjaReportRows } from "@/lib/karyawan-masa-kerja-report"
import { generateKaryawanMasaKerjaReportPdf } from "@/lib/karyawan-masa-kerja-report-pdf"

export const runtime = "nodejs"

function parsePositiveNumber(value: string | null): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function safeFilePart(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80)
}

export async function GET(req: NextRequest) {
  const auth = await requireSession(req)
  if ("error" in auth) return auth.error

  try {
    const karyawanId = parsePositiveNumber(req.nextUrl.searchParams.get("karyawan_id"))
    const divisiId = karyawanId ? undefined : parsePositiveNumber(req.nextUrl.searchParams.get("divisi_id"))
    const rows = await getKaryawanMasaKerjaReportRows({ karyawanId, divisiId })
    const printedBy = auth.user.nama_karyawan?.trim() || auth.user.name?.trim() || auth.user.email?.trim() || "Sistem"

    let filterLabel = "Semua"
    if (karyawanId) filterLabel = rows[0]?.nama_karyawan ? `Karyawan: ${rows[0].nama_karyawan}` : `Karyawan ID: ${karyawanId}`
    if (divisiId) filterLabel = rows[0]?.divisi ? `Divisi: ${rows[0].divisi}` : `Divisi ID: ${divisiId}`

    const pdf = await generateKaryawanMasaKerjaReportPdf(rows, { printedBy, filterLabel })
    const filterFilePart = safeFilePart(filterLabel)
    const filename = `Rekap_Masa_Kerja_Karyawan_${filterFilePart}_${new Date().toISOString().slice(0, 10)}.pdf`

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    console.error("[rekap masa kerja karyawan pdf]", error)
    return NextResponse.json({ error: "Gagal membuat PDF rekap masa kerja karyawan" }, { status: 500 })
  }
}
