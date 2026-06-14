import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { createPenilaianDraftForEmployees, getBawahanIds, isAdminLike } from "@/lib/penilaian-target"

type CreatedPeriodeRow = { id: bigint }

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error

  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status")
    const whereStatus = status ? `WHERE status = ?` : ""
    const rows = status
      ? await prisma.$queryRawUnsafe(`SELECT * FROM periode_penilaian ${whereStatus} ORDER BY tanggal_mulai DESC, id DESC`, status)
      : await prisma.$queryRawUnsafe("SELECT * FROM periode_penilaian ORDER BY tanggal_mulai DESC, id DESC")
    return NextResponse.json(serialize(rows))
  } catch {
    return NextResponse.json({ error: "Gagal mengambil periode penilaian" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan"])
  if ("error" in auth) return auth.error

  try {
    const body = await req.json()
    const { kode_periode, nama_periode, tanggal_mulai, tanggal_selesai, tanggal_buka, tanggal_tutup, status = "aktif", keterangan } = body

    if (!kode_periode?.trim()) return NextResponse.json({ error: "Kode periode wajib diisi" }, { status: 400 })
    if (!nama_periode?.trim()) return NextResponse.json({ error: "Nama periode wajib diisi" }, { status: 400 })
    if (!tanggal_mulai || !tanggal_selesai || !tanggal_buka || !tanggal_tutup) return NextResponse.json({ error: "Tanggal periode wajib lengkap" }, { status: 400 })
    if (!["draft", "aktif", "tutup"].includes(status)) return NextResponse.json({ error: "Status periode tidak valid" }, { status: 400 })
    if (tanggal_selesai < tanggal_mulai) return NextResponse.json({ error: "Tanggal selesai tidak boleh lebih kecil dari tanggal mulai" }, { status: 400 })
    if (tanggal_tutup < tanggal_buka) return NextResponse.json({ error: "Tanggal tutup tidak boleh lebih kecil dari tanggal buka" }, { status: 400 })

    let targetEmployeeIds: bigint[] = []
    if (isAdminLike(auth.user)) {
      const karyawans = await prisma.karyawans.findMany({
        where: {
          OR: [
            { status_karyawan: null },
            { status_karyawan: { notIn: ["Pensiun", "Nonaktif"] } },
          ],
        },
        select: { id: true },
      })
      targetEmployeeIds = karyawans.map(k => k.id)
    } else {
      if (!auth.user.karyawan_id) return NextResponse.json({ error: "Akun belum terhubung ke data karyawan" }, { status: 422 })
      targetEmployeeIds = await getBawahanIds(auth.user.karyawan_id, true)
    }

    const result = await prisma.$transaction(async tx => {
      await tx.$executeRaw`
        INSERT INTO periode_penilaian
          (kode_periode, nama_periode, tanggal_mulai, tanggal_selesai, tanggal_buka, tanggal_tutup, status, keterangan, created_at, updated_at)
        VALUES
          (${kode_periode.trim()}, ${nama_periode.trim()}, ${new Date(tanggal_mulai)}, ${new Date(tanggal_selesai)}, ${new Date(tanggal_buka)}, ${new Date(tanggal_tutup)}, ${status}, ${keterangan?.trim() || null}, NOW(), NOW())
      `
      const created = await tx.$queryRaw<CreatedPeriodeRow[]>`SELECT LAST_INSERT_ID() AS id`
      const idPeriode = created[0].id

      await tx.$executeRaw`
        INSERT INTO periode_komponen_penilaian
          (id_periode, id_komponen, bobot_percent, aktif, created_at, updated_at)
        SELECT ${idPeriode}, id, default_bobot_percent, aktif, NOW(), NOW()
        FROM komponen_penilaian
        WHERE aktif = 1
      `

      return { id: idPeriode }
    })

    await createPenilaianDraftForEmployees(result.id, targetEmployeeIds)

    await writeAuditLog({
      user: auth.user,
      action: "CREATE",
      modelType: "periode_penilaian",
      modelId: result.id,
      dataBaru: { kode_periode, nama_periode, jumlah_form_target: targetEmployeeIds.length },
      ip: getClientIp(req),
    })

    return NextResponse.json(serialize({ id: result.id, jumlah_form_target: targetEmployeeIds.length }), { status: 201 })
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "Kode periode sudah digunakan" }, { status: 409 })
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal membuat periode penilaian" }, { status: 500 })
  }
}
