import { NextRequest, NextResponse } from "next/server"
import { serialize } from "@/lib/prisma"
import { getPendapatanAsetReport } from "@/lib/pendapatan-aset-report"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const year       = parseInt(searchParams.get("year")        ?? String(new Date().getFullYear()))
    const startMonth = parseInt(searchParams.get("start_month") ?? String(new Date().getMonth() + 1))
    const endMonth   = parseInt(searchParams.get("end_month")   ?? String(startMonth))
    const report = await getPendapatanAsetReport({ year, startMonth, endMonth })
    return NextResponse.json(serialize(report))
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Gagal mengambil laporan" }, { status: 500 })
  }
}
