import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

// GET  /api/sdm/hari-libur          — list hari libur (filter by tahun, bulan)
// POST /api/sdm/hari-libur          — tambah hari libur

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user"])
  if ("error" in auth) return auth.error

  try {
    const { searchParams } = new URL(req.url)
    const tahun = searchParams.get("tahun")
    const bulan = searchParams.get("bulan") // "01".."12" atau kosong = semua

    let gte: Date | undefined
    let lte: Date | undefined

    if (tahun && bulan) {
      const y = tahun; const m = bulan.padStart(2, "0")
      const lastDay = new Date(Number(y), Number(m), 0).getDate()
      gte = new Date(`${y}-${m}-01`)
      lte = new Date(`${y}-${m}-${lastDay}`)
    } else if (tahun) {
      gte = new Date(`${tahun}-01-01`)
      lte = new Date(`${tahun}-12-31`)
    }

    const where = gte ? { tanggal: { gte, lte } } : undefined

    const data = await prisma.hari_liburs.findMany({
      where,
      orderBy: { tanggal: "asc" },
    })
    return NextResponse.json(serialize(data))
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd"])
  if ("error" in auth) return auth.error

  try {
    const body = await req.json()
    const { tanggal, nama_libur, tipe_libur, keterangan } = body

    if (!tanggal)              return NextResponse.json({ error: "Tanggal wajib diisi" }, { status: 400 })
    if (!nama_libur?.trim())   return NextResponse.json({ error: "Nama libur wajib diisi" }, { status: 400 })

    const data = await prisma.hari_liburs.create({
      data: {
        tanggal:    new Date(tanggal),
        nama_libur: nama_libur.trim(),
        tipe_libur: tipe_libur ?? "Nasional",
        keterangan: keterangan?.trim() || null,
        created_at: new Date(),
        updated_at: new Date(),
      },
    })

    await writeAuditLog({
      user: auth.user, action: "CREATE", modelType: "hari_liburs",
      modelId: data.id, dataBaru: serialize(data), ip: getClientIp(req),
    })

    return NextResponse.json(serialize(data), { status: 201 })
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "Tanggal tersebut sudah terdaftar sebagai hari libur" }, { status: 409 })
    }
    return NextResponse.json({ error: "Gagal menyimpan hari libur" }, { status: 500 })
  }
}
