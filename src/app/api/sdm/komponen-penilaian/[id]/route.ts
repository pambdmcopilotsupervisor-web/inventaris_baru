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

// PUT /api/sdm/komponen-penilaian/[id] — ubah komponen
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(req, ["admin", "hrd"])
  if ("error" in auth) return auth.error
  try {
    const { id } = await params
    const idNum = Number(id)
    if (!Number.isInteger(idNum)) return NextResponse.json({ error: "ID tidak valid" }, { status: 400 })

    const existing = await prisma.$queryRaw<KomponenRow[]>`SELECT * FROM komponen_penilaian WHERE id = ${BigInt(idNum)} LIMIT 1`
    if (!existing[0]) return NextResponse.json({ error: "Komponen tidak ditemukan" }, { status: 404 })

    const body = await req.json()
    const nama = String(body.nama_komponen ?? existing[0].nama_komponen).trim()
    const deskripsi = body.deskripsi !== undefined ? (body.deskripsi ? String(body.deskripsi).trim() : null) : existing[0].deskripsi
    const bobot = body.default_bobot_percent !== undefined ? Number(body.default_bobot_percent) : Number(existing[0].default_bobot_percent)
    const urutan = body.urutan !== undefined ? Number(body.urutan) : existing[0].urutan
    const aktif = body.aktif !== undefined ? (body.aktif ? 1 : 0) : existing[0].aktif

    if (!nama) return NextResponse.json({ error: "Nama komponen wajib diisi" }, { status: 400 })
    if (bobot < 0 || bobot > 100) return NextResponse.json({ error: "Bobot harus antara 0 dan 100" }, { status: 400 })

    await prisma.$executeRaw`
      UPDATE komponen_penilaian
      SET nama_komponen = ${nama}, deskripsi = ${deskripsi}, default_bobot_percent = ${bobot},
          urutan = ${urutan}, aktif = ${aktif}, updated_at = NOW()
      WHERE id = ${BigInt(idNum)}
    `
    const updated = await prisma.$queryRaw<KomponenRow[]>`SELECT * FROM komponen_penilaian WHERE id = ${BigInt(idNum)} LIMIT 1`
    await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "komponen_penilaian", modelId: idNum, dataLama: serialize(existing[0]), dataBaru: serialize(updated[0]), ip: getClientIp(req) })
    return NextResponse.json(serialize(updated[0]))
  } catch {
    return NextResponse.json({ error: "Gagal memperbarui komponen" }, { status: 500 })
  }
}

// DELETE /api/sdm/komponen-penilaian/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(req, ["admin", "hrd"])
  if ("error" in auth) return auth.error
  try {
    const { id } = await params
    const idNum = Number(id)
    if (!Number.isInteger(idNum)) return NextResponse.json({ error: "ID tidak valid" }, { status: 400 })

    const existing = await prisma.$queryRaw<KomponenRow[]>`SELECT * FROM komponen_penilaian WHERE id = ${BigInt(idNum)} LIMIT 1`
    if (!existing[0]) return NextResponse.json({ error: "Komponen tidak ditemukan" }, { status: 404 })

    // Cek apakah dipakai di periode_komponen_penilaian
    const used = await prisma.$queryRaw<{ c: bigint }[]>`SELECT COUNT(*) AS c FROM periode_komponen_penilaian WHERE id_komponen = ${BigInt(idNum)}`
    if (Number(used[0]?.c ?? 0) > 0) {
      return NextResponse.json({ error: "Komponen sudah dipakai di periode penilaian, tidak dapat dihapus. Nonaktifkan saja." }, { status: 409 })
    }

    await prisma.$executeRaw`DELETE FROM komponen_penilaian WHERE id = ${BigInt(idNum)}`
    await writeAuditLog({ user: auth.user, action: "DELETE", modelType: "komponen_penilaian", modelId: idNum, dataLama: serialize(existing[0]), ip: getClientIp(req) })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Gagal menghapus komponen" }, { status: 500 })
  }
}
