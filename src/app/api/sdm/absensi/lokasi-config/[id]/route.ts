import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin"])
  if ("error" in auth) return auth.error
  try {
    const { id } = await params
    const body = await req.json()
    const existing = await prisma.absensi_lokasi_configs.findUnique({ where: { id: BigInt(id) } })
    if (!existing) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })
    const data = await prisma.absensi_lokasi_configs.update({
      where: { id: BigInt(id) },
      data: {
        nama_lokasi:  body.nama_lokasi?.trim() ?? existing.nama_lokasi,
        latitude:     body.latitude != null ? Number(body.latitude) : existing.latitude,
        longitude:    body.longitude != null ? Number(body.longitude) : existing.longitude,
        radius_meter: body.radius_meter != null ? Number(body.radius_meter) : existing.radius_meter,
        aktif:        body.aktif !== undefined ? !!body.aktif : existing.aktif,
        keterangan:   body.keterangan?.trim() || null,
        updated_at:   new Date(),
      },
    })
    await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "absensi_lokasi_configs", modelId: BigInt(id), dataLama: serialize(existing), dataBaru: serialize(data), ip: req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown" })
    return NextResponse.json(serialize(data))
  } catch { return NextResponse.json({ error: "Gagal memperbarui" }, { status: 500 }) }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin"])
  if ("error" in auth) return auth.error
  try {
    const { id } = await params
    const existing = await prisma.absensi_lokasi_configs.findUnique({ where: { id: BigInt(id) } })
    if (!existing) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })
    await prisma.absensi_lokasi_configs.delete({ where: { id: BigInt(id) } })
    return NextResponse.json({ success: true })
  } catch { return NextResponse.json({ error: "Gagal menghapus" }, { status: 500 }) }
}
