import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireSession } from "@/lib/auth"

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
  } catch {
    return NextResponse.json({ error: "Gagal mengambil data karyawan" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSession(req)
    if ("error" in auth) return auth.error
    if ((auth.user.role ?? "user").toLowerCase() === "user") {
      return NextResponse.json({ error: "Role user tidak boleh menambah data karyawan" }, { status: 403 })
    }

    const body = await req.json()
    // Normalisasi field tanggal: string kosong → null (hindari error Prisma @db.Date)
    for (const k of ["tanggal_masuk_kerja", "tanggal_keluar", "tanggal_lahir"]) {
      if (k in body && (body[k] === "" || body[k] === undefined)) body[k] = null
    }
    const karyawan = await prisma.karyawans.create({ data: body })
    return NextResponse.json(serialize(karyawan), { status: 201 })
  } catch {
    return NextResponse.json({ error: "Gagal menyimpan data karyawan" }, { status: 500 })
  }
}
