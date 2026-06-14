import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { createPenilaianDraftForEmployees, isAdminLike } from "@/lib/penilaian-target"
import { getBawahanPenilaianMultiLevelIds } from "@/lib/penilaian-scope"

type CreatedPeriodeRow = { id: bigint }

const STATUS_PERIODE = new Set(["draft", "aktif", "tutup"])

function validatePeriodePayload(body: Record<string, unknown>) {
  const kodePeriode = String(body.kode_periode ?? "").trim()
  const namaPeriode = String(body.nama_periode ?? "").trim()
  const tanggalMulai = String(body.tanggal_mulai ?? "")
  const tanggalSelesai = String(body.tanggal_selesai ?? "")
  const tanggalBuka = String(body.tanggal_buka ?? "")
  const tanggalTutup = String(body.tanggal_tutup ?? "")
  const status = String(body.status ?? "aktif")
  const keterangan = String(body.keterangan ?? "").trim() || null

  if (!kodePeriode) return { error: "Kode periode wajib diisi" }
  if (!namaPeriode) return { error: "Nama periode wajib diisi" }
  if (!tanggalMulai || !tanggalSelesai || !tanggalBuka || !tanggalTutup) return { error: "Tanggal periode wajib lengkap" }
  if (!STATUS_PERIODE.has(status)) return { error: "Status periode tidak valid" }
  if (tanggalSelesai < tanggalMulai) return { error: "Tanggal selesai tidak boleh lebih kecil dari tanggal mulai" }
  if (tanggalTutup < tanggalBuka) return { error: "Tanggal tutup tidak boleh lebih kecil dari tanggal buka" }

  return {
    data: {
      kode_periode: kodePeriode,
      nama_periode: namaPeriode,
      tanggal_mulai: new Date(tanggalMulai),
      tanggal_selesai: new Date(tanggalSelesai),
      tanggal_buka: new Date(tanggalBuka),
      tanggal_tutup: new Date(tanggalTutup),
      status,
      keterangan,
    },
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error

  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status")
    const whereStatus = status ? `WHERE status = ?` : ""
    const orderBy = `ORDER BY
      CASE
        WHEN status = 'aktif' AND CURRENT_DATE() BETWEEN tanggal_buka AND tanggal_tutup THEN 0
        WHEN status = 'aktif' THEN 1
        ELSE 2
      END,
      tanggal_buka DESC,
      tanggal_mulai DESC,
      id DESC`
    const rows = status
      ? await prisma.$queryRawUnsafe(`SELECT * FROM periode_penilaian ${whereStatus} ${orderBy}`, status)
      : await prisma.$queryRawUnsafe(`SELECT * FROM periode_penilaian ${orderBy}`)
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
    const validation = validatePeriodePayload(body)
    if ("error" in validation) return NextResponse.json({ error: validation.error }, { status: 400 })
    const periode = validation.data

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
      targetEmployeeIds = await getBawahanPenilaianMultiLevelIds(auth.user.karyawan_id)
    }

    const result = await prisma.$transaction(async tx => {
      await tx.$executeRaw`
        INSERT INTO periode_penilaian
          (kode_periode, nama_periode, tanggal_mulai, tanggal_selesai, tanggal_buka, tanggal_tutup, status, keterangan, created_at, updated_at)
        VALUES
          (${periode.kode_periode}, ${periode.nama_periode}, ${periode.tanggal_mulai}, ${periode.tanggal_selesai}, ${periode.tanggal_buka}, ${periode.tanggal_tutup}, ${periode.status}, ${periode.keterangan}, NOW(), NOW())
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
      dataBaru: { kode_periode: periode.kode_periode, nama_periode: periode.nama_periode, jumlah_form_target: targetEmployeeIds.length },
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

export async function PUT(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan"])
  if ("error" in auth) return auth.error

  try {
    const body = await req.json()
    const id = Number(body.id)
    if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "ID periode tidak valid" }, { status: 400 })

    const validation = validatePeriodePayload(body)
    if ("error" in validation) return NextResponse.json({ error: validation.error }, { status: 400 })
    const periode = validation.data

    const existing = await prisma.$queryRaw<{ id: bigint }[]>`
      SELECT id
      FROM periode_penilaian
      WHERE id = ${BigInt(id)}
      LIMIT 1
    `
    if (!existing[0]) return NextResponse.json({ error: "Periode penilaian tidak ditemukan" }, { status: 404 })

    const duplicate = await prisma.$queryRaw<{ id: bigint }[]>`
      SELECT id
      FROM periode_penilaian
      WHERE kode_periode = ${periode.kode_periode}
        AND id != ${BigInt(id)}
      LIMIT 1
    `
    if (duplicate[0]) return NextResponse.json({ error: "Kode periode sudah digunakan" }, { status: 409 })

    await prisma.$executeRaw`
      UPDATE periode_penilaian
      SET kode_periode = ${periode.kode_periode},
          nama_periode = ${periode.nama_periode},
          tanggal_mulai = ${periode.tanggal_mulai},
          tanggal_selesai = ${periode.tanggal_selesai},
          tanggal_buka = ${periode.tanggal_buka},
          tanggal_tutup = ${periode.tanggal_tutup},
          status = ${periode.status},
          keterangan = ${periode.keterangan},
          updated_at = NOW()
      WHERE id = ${BigInt(id)}
    `

    await writeAuditLog({
      user: auth.user,
      action: "UPDATE",
      modelType: "periode_penilaian",
      modelId: id,
      dataBaru: { ...periode, id },
      ip: getClientIp(req),
    })

    return NextResponse.json({ success: true, message: "Periode penilaian berhasil diperbarui" })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal memperbarui periode penilaian" }, { status: 500 })
  }
}
