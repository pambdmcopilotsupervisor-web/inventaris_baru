import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

// GET  /api/sdm/absensi/lokasi-config  — list semua lokasi
// POST /api/sdm/absensi/lokasi-config  — tambah lokasi baru

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error
  try {
    const data = await prisma.absensi_lokasi_configs.findMany({ orderBy: { id: "asc" } })
    return NextResponse.json(serialize(data))
  } catch { return NextResponse.json({ error: "Server error" }, { status: 500 }) }
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["admin"])
  if ("error" in auth) return auth.error
  try {
    const body = await req.json()
    const { nama_lokasi, latitude, longitude, radius_meter, aktif, keterangan } = body
    if (!nama_lokasi?.trim()) return NextResponse.json({ error: "Nama lokasi wajib diisi" }, { status: 400 })
    if (latitude == null || longitude == null) return NextResponse.json({ error: "Koordinat wajib diisi" }, { status: 400 })

    const data = await prisma.absensi_lokasi_configs.create({
      data: {
        nama_lokasi:  nama_lokasi.trim(),
        latitude:     Number(latitude),
        longitude:    Number(longitude),
        radius_meter: Number(radius_meter ?? 100),
        aktif:        aktif !== false,
        keterangan:   keterangan?.trim() || null,
        created_at:   new Date(), updated_at: new Date(),
      },
    })
    await writeAuditLog({ user: auth.user, action: "CREATE", modelType: "absensi_lokasi_configs", modelId: data.id, dataBaru: serialize(data), ip: req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown" })
    return NextResponse.json(serialize(data), { status: 201 })
  } catch { return NextResponse.json({ error: "Gagal menyimpan" }, { status: 500 }) }
}
