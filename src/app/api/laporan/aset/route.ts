import { NextRequest, NextResponse } from "next/server"
import { getAsetReportRows } from "@/lib/aset-report"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const kelompok_asset = searchParams.get("kelompok_asset") || null
    const ruangan_id     = searchParams.get("ruangan_id")     ? Number(searchParams.get("ruangan_id")) : null
    const status_barang  = searchParams.get("status_barang")  || null

    const rows = await getAsetReportRows({ kelompok_asset, ruangan_id, status_barang })
    return NextResponse.json(rows)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
