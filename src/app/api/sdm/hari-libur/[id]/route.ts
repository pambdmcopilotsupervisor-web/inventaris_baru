import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user"])
  if ("error" in auth) return auth.error

  try {
    const { id } = await params
    const data = await prisma.hari_liburs.findUnique({ where: { id: BigInt(id) } })
    if (!data) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })
    return NextResponse.json(serialize(data))
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(req, ["admin", "hrd"])
  if ("error" in auth) return auth.error

  try {
    const { id } = await params
    const body = await req.json()
    const { tanggal, nama_libur, tipe_libur, keterangan } = body

    if (!tanggal)            return NextResponse.json({ error: "Tanggal wajib diisi" }, { status: 400 })
    if (!nama_libur?.trim()) return NextResponse.json({ error: "Nama libur wajib diisi" }, { status: 400 })

    const existing = await prisma.hari_liburs.findUnique({ where: { id: BigInt(id) } })
    if (!existing) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })

    const data = await prisma.hari_liburs.update({
      where: { id: BigInt(id) },
      data: {
        tanggal:    new Date(tanggal),
        nama_libur: nama_libur.trim(),
        tipe_libur: tipe_libur ?? "Nasional",
        keterangan: keterangan?.trim() || null,
        updated_at: new Date(),
      },
    })

    await writeAuditLog({
      user: auth.user, action: "UPDATE", modelType: "hari_liburs",
      modelId: BigInt(id), dataLama: serialize(existing), dataBaru: serialize(data),
      ip: getClientIp(req),
    })

    return NextResponse.json(serialize(data))
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "Tanggal tersebut sudah terdaftar sebagai hari libur" }, { status: 409 })
    }
    return NextResponse.json({ error: "Gagal memperbarui" }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(req, ["admin", "hrd"])
  if ("error" in auth) return auth.error

  try {
    const { id } = await params
    const existing = await prisma.hari_liburs.findUnique({ where: { id: BigInt(id) } })
    if (!existing) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })

    await prisma.hari_liburs.delete({ where: { id: BigInt(id) } })

    await writeAuditLog({
      user: auth.user, action: "DELETE", modelType: "hari_liburs",
      modelId: BigInt(id), dataLama: serialize(existing), ip: getClientIp(req),
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Gagal menghapus" }, { status: 500 })
  }
}
