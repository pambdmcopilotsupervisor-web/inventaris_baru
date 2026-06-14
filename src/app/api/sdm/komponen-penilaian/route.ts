import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

type KomponenRow = {
  id: bigint
  kode_komponen: string
  nama_komponen: string
  deskripsi: string | null
  default_bobot_percent: string | number
  urutan: number
  aktif: number
}

// GET /api/sdm/komponen-penilaian — daftar komponen penilaian
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user"])
  if ("error" in auth) return auth.error
  try {
    const rows = await prisma.$queryRaw<KomponenRow[]>`
      SELECT id, kode_komponen, nama_komponen, deskripsi, default_bobot_percent, urutan, aktif
      FROM komponen_penilaian
      ORDER BY urutan ASC, id ASC
    `
    return NextResponse.json(serialize(rows))
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

// POST /api/sdm/komponen-penilaian — buat komponen baru
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd"])
  if ("error" in auth) return auth.error
  try {
    const body = await req.json()
    const kode = String(body.kode_komponen ?? "").trim().toUpperCase().replace(/\s+/g, "_")
    const nama = String(body.nama_komponen ?? "").trim()
    const deskripsi = body.deskripsi ? String(body.deskripsi).trim() : null
    const bobot = Number(body.default_bobot_percent ?? 0)
    const urutan = Number(body.urutan ?? 0)
    const aktif = body.aktif === false ? 0 : 1

    if (!kode)  return NextResponse.json({ error: "Kode komponen wajib diisi" }, { status: 400 })
    if (!nama)  return NextResponse.json({ error: "Nama komponen wajib diisi" }, { status: 400 })
    if (bobot < 0 || bobot > 100) return NextResponse.json({ error: "Bobot harus antara 0 dan 100" }, { status: 400 })

    const dup = await prisma.$queryRaw<{ c: bigint }[]>`SELECT COUNT(*) AS c FROM komponen_penilaian WHERE kode_komponen = ${kode}`
    if (Number(dup[0]?.c ?? 0) > 0) return NextResponse.json({ error: "Kode komponen sudah digunakan" }, { status: 409 })

    await prisma.$executeRaw`
      INSERT INTO komponen_penilaian
        (kode_komponen, nama_komponen, deskripsi, default_bobot_percent, urutan, aktif, created_at, updated_at)
      VALUES (${kode}, ${nama}, ${deskripsi}, ${bobot}, ${urutan}, ${aktif}, NOW(), NOW())
    `
    const created = await prisma.$queryRaw<KomponenRow[]>`SELECT * FROM komponen_penilaian WHERE kode_komponen = ${kode} LIMIT 1`
    await writeAuditLog({ user: auth.user, action: "CREATE", modelType: "komponen_penilaian", modelId: created[0] ? Number(created[0].id) : null, dataBaru: serialize(created[0]), ip: getClientIp(req) })
    return NextResponse.json(serialize(created[0]), { status: 201 })
  } catch {
    return NextResponse.json({ error: "Gagal menyimpan komponen" }, { status: 500 })
  }
}
