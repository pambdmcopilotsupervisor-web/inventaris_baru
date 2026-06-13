import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

// GET  /api/sdm/saldo-cuti  — list saldo cuti (filter karyawan_id, tahun)
// POST /api/sdm/saldo-cuti  — buat/set saldo manual

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user"])
  if ("error" in auth) return auth.error
  try {
    const { searchParams } = new URL(req.url)
    const karyawanId = searchParams.get("karyawan_id")
    const tahun      = searchParams.get("tahun") ?? String(new Date().getFullYear())

    const where: Record<string, unknown> = { tahun: Number(tahun) }
    if (karyawanId) where.karyawan_id = BigInt(karyawanId)

    const data = await prisma.saldo_cutis.findMany({
      where,
      include: {
        karyawans:   { select: { id: true, nik: true, nama_karyawan: true, jabatan: true, divisi_id: true } },
        jenis_cutis: { select: { id: true, kode_cuti: true, nama_cuti: true, potong_saldo_cuti: true } },
      },
      orderBy: [{ karyawan_id: "asc" }, { jenis_cuti_id: "asc" }],
    })

    const enriched = data.map(s => ({
      ...s,
      saldo_sisa: s.saldo_awal + s.saldo_penyesuaian - s.saldo_terpakai,
    }))

    return NextResponse.json(serialize(enriched))
  } catch { return NextResponse.json({ error: "Server error" }, { status: 500 }) }
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd"])
  if ("error" in auth) return auth.error
  try {
    const body = await req.json()
    const { karyawan_id, jenis_cuti_id, tahun, saldo_awal, saldo_penyesuaian, keterangan_penyesuaian } = body

    if (!karyawan_id)    return NextResponse.json({ error: "Karyawan wajib dipilih" }, { status: 400 })
    if (!jenis_cuti_id)  return NextResponse.json({ error: "Jenis cuti wajib dipilih" }, { status: 400 })
    if (!tahun)          return NextResponse.json({ error: "Tahun wajib diisi" }, { status: 400 })

    const data = await prisma.saldo_cutis.upsert({
      where: {
        karyawan_id_jenis_cuti_id_tahun: {
          karyawan_id:   BigInt(karyawan_id),
          jenis_cuti_id: BigInt(jenis_cuti_id),
          tahun:         Number(tahun),
        },
      },
      update: {
        saldo_awal:             Number(saldo_awal ?? 0),
        saldo_penyesuaian:      Number(saldo_penyesuaian ?? 0),
        keterangan_penyesuaian: keterangan_penyesuaian?.trim() || null,
        updated_at:             new Date(),
      },
      create: {
        karyawan_id:            BigInt(karyawan_id),
        jenis_cuti_id:          BigInt(jenis_cuti_id),
        tahun:                  Number(tahun),
        saldo_awal:             Number(saldo_awal ?? 0),
        saldo_terpakai:         0,
        saldo_penyesuaian:      Number(saldo_penyesuaian ?? 0),
        keterangan_penyesuaian: keterangan_penyesuaian?.trim() || null,
        created_at:             new Date(),
        updated_at:             new Date(),
      },
    })
    await writeAuditLog({ user: auth.user, action: "CREATE", modelType: "saldo_cutis", modelId: data.id, dataBaru: serialize(data), ip: getClientIp(req) })
    return NextResponse.json(serialize({ ...data, saldo_sisa: data.saldo_awal + data.saldo_penyesuaian - data.saldo_terpakai }), { status: 201 })
  } catch { return NextResponse.json({ error: "Gagal menyimpan saldo cuti" }, { status: 500 }) }
}
