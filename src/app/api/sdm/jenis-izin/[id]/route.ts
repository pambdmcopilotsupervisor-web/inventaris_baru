import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin"])
  if ("error" in auth) return auth.error
  try {
    const { id } = await params
    const body = await req.json()
    const existing = await prisma.jenis_izins.findUnique({ where: { id: BigInt(id) } })
    if (!existing) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })
    const data = await prisma.jenis_izins.update({
      where: { id: BigInt(id) },
      data: {
        kode_izin:            body.kode_izin?.trim().toUpperCase() ?? existing.kode_izin,
        nama_izin:            body.nama_izin?.trim() ?? existing.nama_izin,
        satuan:               body.satuan ?? existing.satuan,
        maksimal_durasi:      body.maksimal_durasi !== undefined ? Number(body.maksimal_durasi) : existing.maksimal_durasi,
        membutuhkan_lampiran: body.membutuhkan_lampiran !== undefined ? !!body.membutuhkan_lampiran : existing.membutuhkan_lampiran,
        memotong_absensi:     body.memotong_absensi !== undefined ? !!body.memotong_absensi : existing.memotong_absensi,
        status:               body.status ?? existing.status,
        keterangan:           body.keterangan?.trim() || null,
        updated_at:           new Date(),
      },
    })
    await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "jenis_izins", modelId: BigInt(id), dataLama: serialize(existing), dataBaru: serialize(data), ip: getClientIp(req) })
    return NextResponse.json(serialize(data))
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "Kode izin sudah digunakan" }, { status: 409 })
    }
    return NextResponse.json({ error: "Gagal memperbarui" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin"])
  if ("error" in auth) return auth.error
  try {
    const { id } = await params
    const existing = await prisma.jenis_izins.findUnique({ where: { id: BigInt(id) } })
    if (!existing) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })
    const inUse = await prisma.pengajuan_izins.count({ where: { jenis_izin_id: BigInt(id) } })
    if (inUse > 0) return NextResponse.json({ error: "Jenis izin masih digunakan. Nonaktifkan saja." }, { status: 409 })
    await prisma.jenis_izins.delete({ where: { id: BigInt(id) } })
    await writeAuditLog({ user: auth.user, action: "DELETE", modelType: "jenis_izins", modelId: BigInt(id), dataLama: serialize(existing), ip: getClientIp(req) })
    return NextResponse.json({ success: true })
  } catch { return NextResponse.json({ error: "Gagal menghapus" }, { status: 500 }) }
}
