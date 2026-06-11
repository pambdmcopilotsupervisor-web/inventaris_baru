import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const jns_brg = searchParams.get("jns_brg") || null
    const stat    = searchParams.get("stat")    || null

    const records = await prisma.data_r2r4s.findMany({
      where: {
        ...(jns_brg ? { jns_brg } : {}),
        ...(stat    ? { stat }    : {}),
      },
      orderBy: { kode_brg: "asc" },
    })

    return NextResponse.json(serialize(records))
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
