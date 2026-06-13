import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error
  try {
    const data = await prisma.jenis_izins.findMany({ orderBy: { kode_izin: "asc" } })
    return NextResponse.json(serialize(data))
  } catch { return NextResponse.json({ error: "Server error" }, { status: 500 }) }
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["admin"])
  if ("error" in auth) return auth.error
  try {
    const body = await req.json()
    const { kode_izin, nama_izin, satuan, maksimal_durasi, membutuhkan_lampiran, memotong_absensi, status, keterangan } = body
    if (!kode_izin?.trim()) return NextResponse.json({ error: "Kode izin wajib diisi" }, { status: 400 })
    if (!nama_izin?.trim()) return NextResponse.json({ error: "Nama izin wajib diisi" }, { status: 400 })

    const data = await prisma.jenis_izins.create({
      data: {
        kode_izin:            kode_izin.trim().toUpperCase(),
        nama_izin:            nama_izin.trim(),
        satuan:               satuan ?? "hari",
        maksimal_durasi:      Number(maksimal_durasi ?? 1),
        membutuhkan_lampiran: !!membutuhkan_lampiran,
        memotong_absensi:     memotong_absensi !== false,
        status:               status ?? "aktif",
        keterangan:           keterangan?.trim() || null,
        created_at: new Date(), updated_at: new Date(),
      },
    })
    await writeAuditLog({ user: auth.user, action: "CREATE", modelType: "jenis_izins", modelId: data.id, dataBaru: serialize(data), ip: getClientIp(req) })
    return NextResponse.json(serialize(data), { status: 201 })
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "Kode izin sudah digunakan" }, { status: 409 })
    }
    return NextResponse.json({ error: "Gagal menyimpan jenis izin" }, { status: 500 })
  }
}
