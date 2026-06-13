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
    const data = await prisma.jadwal_shifts.findUnique({
      where: { id: BigInt(id) },
      include: {
        karyawans:    { select: { id: true, nik: true, nama_karyawan: true, jabatan: true } },
        shift_kerjas: true,
      },
    })
    if (!data) return NextResponse.json({ error: "Jadwal tidak ditemukan" }, { status: 404 })
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
    const { shift_id, tanggal, keterangan } = body

    if (!shift_id) return NextResponse.json({ error: "Shift wajib dipilih" }, { status: 400 })
    if (!tanggal)  return NextResponse.json({ error: "Tanggal wajib diisi" }, { status: 400 })

    const existing = await prisma.jadwal_shifts.findUnique({ where: { id: BigInt(id) } })
    if (!existing) return NextResponse.json({ error: "Jadwal tidak ditemukan" }, { status: 404 })

    // Cek shift aktif
    const shift = await prisma.shift_kerjas.findUnique({ where: { id: BigInt(shift_id) } })
    if (!shift)                return NextResponse.json({ error: "Shift tidak ditemukan" }, { status: 404 })
    if (shift.status !== "aktif") return NextResponse.json({ error: "Shift sudah tidak aktif" }, { status: 422 })

    const data = await prisma.jadwal_shifts.update({
      where: { id: BigInt(id) },
      data: {
        shift_id:   BigInt(shift_id),
        tanggal:    new Date(tanggal),
        keterangan: keterangan?.trim() || null,
        updated_at: new Date(),
      },
    })

    await writeAuditLog({
      user: auth.user, action: "UPDATE", modelType: "jadwal_shifts",
      modelId: BigInt(id), dataLama: serialize(existing), dataBaru: serialize(data),
      ip: getClientIp(req),
    })

    return NextResponse.json(serialize(data))
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "Jadwal untuk karyawan dan tanggal tersebut sudah ada" }, { status: 409 })
    }
    return NextResponse.json({ error: "Gagal memperbarui jadwal" }, { status: 500 })
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
    const existing = await prisma.jadwal_shifts.findUnique({ where: { id: BigInt(id) } })
    if (!existing) return NextResponse.json({ error: "Jadwal tidak ditemukan" }, { status: 404 })

    await prisma.jadwal_shifts.delete({ where: { id: BigInt(id) } })

    await writeAuditLog({
      user: auth.user, action: "DELETE", modelType: "jadwal_shifts",
      modelId: BigInt(id), dataLama: serialize(existing), ip: getClientIp(req),
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Gagal menghapus jadwal" }, { status: 500 })
  }
}
