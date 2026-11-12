import { NextRequest, NextResponse } from "next/server"
import { serialize } from "@/lib/prisma"
import { getKendaraanReportRecords } from "@/lib/kendaraan-report"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const jns_brg = searchParams.get("jns_brg") || null
    const stat    = searchParams.get("stat")    || null

    const records = await getKendaraanReportRecords({ jns_brg, stat })

    return NextResponse.json(serialize(records))
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
