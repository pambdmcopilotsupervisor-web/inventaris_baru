import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireSession } from "@/lib/auth"
import { normalizeKaryawanCreateData } from "@/lib/karyawan-input"

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
    const data = normalizeKaryawanCreateData(body)
    if (!data.nik || !data.nama_karyawan || !data.jabatan || !data.jkel) {
      return NextResponse.json({ error: "Field wajib tidak lengkap" }, { status: 400 })
    }

    const karyawan = await prisma.karyawans.create({ data })
    return NextResponse.json(serialize(karyawan), { status: 201 })
  } catch (err) {
    console.error("[karyawan:create]", err)
    return NextResponse.json({ error: "Gagal menyimpan data karyawan" }, { status: 500 })
  }
}
