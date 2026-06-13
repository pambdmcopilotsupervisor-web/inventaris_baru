import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin", "hrd"])
  if ("error" in auth) return auth.error
  try {
    const { id } = await params
    const body = await req.json()
    const existing = await prisma.jenis_cutis.findUnique({ where: { id: BigInt(id) } })
    if (!existing) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })
    const data = await prisma.jenis_cutis.update({
      where: { id: BigInt(id) },
      data: {
        kode_cuti:            body.kode_cuti?.trim().toUpperCase() ?? existing.kode_cuti,
        nama_cuti:            body.nama_cuti?.trim() ?? existing.nama_cuti,
        jatah_hari_default:   body.jatah_hari_default !== undefined ? Number(body.jatah_hari_default) : existing.jatah_hari_default,
        membutuhkan_lampiran: body.membutuhkan_lampiran !== undefined ? !!body.membutuhkan_lampiran : existing.membutuhkan_lampiran,
        potong_saldo_cuti:    body.potong_saldo_cuti !== undefined ? !!body.potong_saldo_cuti : existing.potong_saldo_cuti,
        status:               body.status ?? existing.status,
        keterangan:           body.keterangan?.trim() || null,
        updated_at:           new Date(),
      },
    })
    await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "jenis_cutis", modelId: BigInt(id), dataLama: serialize(existing), dataBaru: serialize(data), ip: getClientIp(req) })
    return NextResponse.json(serialize(data))
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "Kode cuti sudah digunakan" }, { status: 409 })
    }
    return NextResponse.json({ error: "Gagal memperbarui" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin", "hrd"])
  if ("error" in auth) return auth.error
  try {
    const { id } = await params
    const existing = await prisma.jenis_cutis.findUnique({ where: { id: BigInt(id) } })
    if (!existing) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })
    const inUse = await prisma.pengajuan_cutis.count({ where: { jenis_cuti_id: BigInt(id) } })
    if (inUse > 0) return NextResponse.json({ error: "Jenis cuti masih digunakan. Nonaktifkan saja." }, { status: 409 })
    await prisma.jenis_cutis.delete({ where: { id: BigInt(id) } })
    await writeAuditLog({ user: auth.user, action: "DELETE", modelType: "jenis_cutis", modelId: BigInt(id), dataLama: serialize(existing), ip: getClientIp(req) })
    return NextResponse.json({ success: true })
  } catch { return NextResponse.json({ error: "Gagal menghapus" }, { status: 500 }) }
}
