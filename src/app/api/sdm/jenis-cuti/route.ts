import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user"])
  if ("error" in auth) return auth.error
  try {
    const data = await prisma.jenis_cutis.findMany({ orderBy: { kode_cuti: "asc" } })
    return NextResponse.json(serialize(data))
  } catch { return NextResponse.json({ error: "Server error" }, { status: 500 }) }
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd"])
  if ("error" in auth) return auth.error
  try {
    const body = await req.json()
    const { kode_cuti, nama_cuti, jatah_hari_default, membutuhkan_lampiran, potong_saldo_cuti, status, keterangan } = body
    if (!kode_cuti?.trim()) return NextResponse.json({ error: "Kode cuti wajib diisi" }, { status: 400 })
    if (!nama_cuti?.trim()) return NextResponse.json({ error: "Nama cuti wajib diisi" }, { status: 400 })

    const data = await prisma.jenis_cutis.create({
      data: {
        kode_cuti:            kode_cuti.trim().toUpperCase(),
        nama_cuti:            nama_cuti.trim(),
        jatah_hari_default:   Number(jatah_hari_default ?? 0),
        membutuhkan_lampiran: !!membutuhkan_lampiran,
        potong_saldo_cuti:    potong_saldo_cuti !== false,
        status:               status ?? "aktif",
        keterangan:           keterangan?.trim() || null,
        created_at: new Date(), updated_at: new Date(),
      },
    })
    await writeAuditLog({ user: auth.user, action: "CREATE", modelType: "jenis_cutis", modelId: data.id, dataBaru: serialize(data), ip: getClientIp(req) })
    return NextResponse.json(serialize(data), { status: 201 })
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "Kode cuti sudah digunakan" }, { status: 409 })
    }
    return NextResponse.json({ error: "Gagal menyimpan jenis cuti" }, { status: 500 })
  }
}
