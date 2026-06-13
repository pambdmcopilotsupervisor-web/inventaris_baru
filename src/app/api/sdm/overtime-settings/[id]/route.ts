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
    const existing = await prisma.overtime_settings.findUnique({ where: { id: BigInt(id) } })
    if (!existing) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })
    const data = await prisma.overtime_settings.update({
      where: { id: BigInt(id) },
      data: {
        nama_setting:                body.nama_setting?.trim() ?? existing.nama_setting,
        tipe_hari:                   body.tipe_hari ?? existing.tipe_hari,
        metode_perhitungan:          body.metode_perhitungan ?? existing.metode_perhitungan,
        tarif_flat:                  body.tarif_flat !== undefined ? Number(body.tarif_flat) : existing.tarif_flat,
        tarif_per_jam:               body.tarif_per_jam !== undefined ? Number(body.tarif_per_jam) : existing.tarif_per_jam,
        multiplier_jam_pertama:      body.multiplier_jam_pertama !== undefined ? Number(body.multiplier_jam_pertama) : existing.multiplier_jam_pertama,
        multiplier_jam_berikutnya:   body.multiplier_jam_berikutnya !== undefined ? Number(body.multiplier_jam_berikutnya) : existing.multiplier_jam_berikutnya,
        batas_minimal_menit_lembur:  body.batas_minimal_menit_lembur !== undefined ? Number(body.batas_minimal_menit_lembur) : existing.batas_minimal_menit_lembur,
        pembulatan_menit:            body.pembulatan_menit !== undefined ? Number(body.pembulatan_menit) : existing.pembulatan_menit,
        status:                      body.status ?? existing.status,
        keterangan:                  body.keterangan?.trim() || null,
        updated_at:                  new Date(),
      },
    })
    await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "overtime_settings", modelId: BigInt(id), dataLama: serialize(existing), dataBaru: serialize(data), ip: getClientIp(req) })
    return NextResponse.json(serialize(data))
  } catch { return NextResponse.json({ error: "Gagal memperbarui" }, { status: 500 }) }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin"])
  if ("error" in auth) return auth.error
  try {
    const { id } = await params
    const existing = await prisma.overtime_settings.findUnique({ where: { id: BigInt(id) } })
    if (!existing) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })
    const inUse = await prisma.overtime_requests.count({ where: { overtime_setting_id: BigInt(id) } })
    if (inUse > 0) return NextResponse.json({ error: "Setting masih digunakan. Nonaktifkan saja." }, { status: 409 })
    await prisma.overtime_settings.delete({ where: { id: BigInt(id) } })
    return NextResponse.json({ success: true })
  } catch { return NextResponse.json({ error: "Gagal menghapus" }, { status: 500 }) }
}
