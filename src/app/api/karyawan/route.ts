import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get("search") ?? ""
    const status = searchParams.get("status") ?? ""

    const karyawan = await prisma.karyawans.findMany({
      where: {
        AND: [
          search
            ? {
                OR: [
                  { nik: { contains: search } },
                  { nama_karyawan: { contains: search } },
                  { jabatan: { contains: search } },
                ],
              }
            : {},
          status ? { status_karyawan: status } : {},
        ],
      },
      orderBy: { nama_karyawan: "asc" },
    })

    return NextResponse.json(serialize(karyawan))
  } catch (err) {
    return NextResponse.json({ error: "Gagal mengambil data karyawan" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const karyawan = await prisma.karyawans.create({ data: body })
    return NextResponse.json(serialize(karyawan), { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: "Gagal menyimpan data karyawan" }, { status: 500 })
  }
}
