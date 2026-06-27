import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { buildSlipData } from "@/lib/payroll/slip-data"
import { generateSlipPdf } from "@/lib/payroll/slip-pdf"

export const runtime = "nodejs"

// GET /api/payroll/slip/[id]/pdf → unduh PDF slip gaji
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin", "hrd"])
  if ("error" in auth) return auth.error

  try {
    const { id } = await params
    const slipId = Number(id)
    if (!Number.isInteger(slipId) || slipId <= 0) {
      return NextResponse.json({ error: "ID slip tidak valid" }, { status: 400 })
    }

    const data = await buildSlipData(slipId)
    if (!data) return NextResponse.json({ error: "Slip tidak ditemukan" }, { status: 404 })

    const pdf = await generateSlipPdf(data)
    const safeName = data.employee.nama.replace(/[^a-zA-Z0-9]+/g, "_")
    const filename = `Slip_${safeName}_${data.period.year}_${String(data.period.month).padStart(2, "0")}.pdf`

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (err) {
    console.error("[payroll slip pdf]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal membuat PDF" }, { status: 500 })
  }
}
