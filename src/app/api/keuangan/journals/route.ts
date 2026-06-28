import { NextRequest, NextResponse } from "next/server"
import { requireRole, type AppRole } from "@/lib/auth"
import { prisma, serialize } from "@/lib/prisma"
import { validateJurnalInput } from "@/lib/keuangan/jurnal"
import { writeAuditLog } from "@/lib/audit"

export const runtime = "nodejs"

const ALLOWED: AppRole[] = ["admin", "keuangan"]

/** Generate nomor jurnal: PREFIX-YYYYMM-NNNN */
async function generateNomor(tanggal: Date, jenis: string): Promise<string> {
  const prefix: Record<string, string> = {
    UMUM: "JU", PENYESUAIAN: "JP", PENUTUP: "JT", BALIK: "JB", KHUSUS: "JK",
  }
  const p = prefix[jenis] ?? "JU"
  const ym = `${tanggal.getFullYear()}${String(tanggal.getMonth() + 1).padStart(2, "0")}`
  const last = await prisma.keu_jurnal.findFirst({
    where: { nomor_jurnal: { startsWith: `${p}-${ym}-` } },
    orderBy: { nomor_jurnal: "desc" },
    select: { nomor_jurnal: true },
  })
  let seq = 1
  if (last) {
    const parts = last.nomor_jurnal.split("-")
    seq = (parseInt(parts[parts.length - 1], 10) || 0) + 1
  }
  return `${p}-${ym}-${String(seq).padStart(4, "0")}`
}

// GET /api/keuangan/journals
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ALLOWED)
  if ("error" in auth) return auth.error

  const { searchParams } = new URL(req.url)
  const periode_id = searchParams.get("periode_id")
  const status = searchParams.get("status") ?? undefined
  const jenis = searchParams.get("jenis") ?? undefined
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "30", 10)))
  const skip = (page - 1) * limit

  const where = {
    ...(periode_id ? { periode_id: BigInt(periode_id) } : {}),
    ...(status ? { status } : {}),
    ...(jenis ? { jenis } : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.keu_jurnal.findMany({
      where,
      orderBy: [{ tanggal: "desc" }, { nomor_jurnal: "desc" }],
      skip,
      take: limit,
      include: { periode: { select: { nama: true } } },
    }),
    prisma.keu_jurnal.count({ where }),
  ])

  return NextResponse.json({ rows: serialize(rows), total, page, limit })
}

// POST /api/keuangan/journals
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ALLOWED)
  if ("error" in auth) return auth.error

  const body = await req.json()
  const { tanggal, keterangan, jenis = "UMUM", periode_id, source_modul, source_ref_id, details } = body

  if (!tanggal || !keterangan || !periode_id || !Array.isArray(details) || details.length < 2) {
    return NextResponse.json({ error: "Field wajib: tanggal, keterangan, periode_id, details (min 2 baris)" }, { status: 400 })
  }

  let validated
  try {
    validated = await validateJurnalInput({ tanggal, periode_id: BigInt(periode_id), jenis, details })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Jurnal tidak valid" }, { status: 422 })
  }

  const nomor_jurnal = await generateNomor(validated.tanggal, jenis)

  const row = await prisma.keu_jurnal.create({
    data: {
      nomor_jurnal,
      tanggal: validated.tanggal,
      keterangan,
      jenis,
      status: "DRAFT",
      periode_id: BigInt(periode_id),
      source_modul: source_modul ?? null,
      source_ref_id: source_ref_id ?? null,
      total_debit: validated.totalDebit,
      total_kredit: validated.totalKredit,
      dibuat_oleh: BigInt(auth.user.id),
      created_at: new Date(),
      updated_at: new Date(),
      details: {
        create: validated.details,
      },
    },
    include: { details: { include: { akun: { select: { kode: true, nama: true } } } } },
  })
  await writeAuditLog({ user: auth.user, action: "CREATE", modelType: "keu_jurnal", modelId: row.id, dataBaru: { nomor: row.nomor_jurnal } })

  return NextResponse.json(serialize(row), { status: 201 })
}
