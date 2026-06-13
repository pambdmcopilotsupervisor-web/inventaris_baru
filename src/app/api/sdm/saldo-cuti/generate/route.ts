import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

// POST /api/sdm/saldo-cuti/generate
// Generate saldo cuti tahunan untuk semua karyawan aktif
// Body: { tahun, jenis_cuti_id, skip_existing?: boolean }

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd"])
  if ("error" in auth) return auth.error
  try {
    const body = await req.json()
    const { tahun, jenis_cuti_id, skip_existing = true } = body

    if (!tahun)         return NextResponse.json({ error: "Tahun wajib diisi" }, { status: 400 })
    if (!jenis_cuti_id) return NextResponse.json({ error: "Jenis cuti wajib dipilih" }, { status: 400 })

    const jenisCuti = await prisma.jenis_cutis.findUnique({ where: { id: BigInt(jenis_cuti_id) } })
    if (!jenisCuti) return NextResponse.json({ error: "Jenis cuti tidak ditemukan" }, { status: 404 })

    const karyawans = await prisma.karyawans.findMany({
      where: { status_karyawan: { notIn: ["Pensiun", "Nonaktif"] } },
      select: { id: true },
    })

    let dibuat = 0, dilewati = 0, diperbarui = 0
    const now = new Date()

    for (const k of karyawans) {
      const existing = await prisma.saldo_cutis.findFirst({
        where: { karyawan_id: k.id, jenis_cuti_id: BigInt(jenis_cuti_id), tahun: Number(tahun) },
      })
      if (existing && skip_existing) { dilewati++; continue }

      if (existing) {
        await prisma.saldo_cutis.update({
          where: { id: existing.id },
          data: { saldo_awal: jenisCuti.jatah_hari_default, updated_at: now },
        })
        diperbarui++
      } else {
        await prisma.saldo_cutis.create({
          data: {
            karyawan_id: k.id, jenis_cuti_id: BigInt(jenis_cuti_id),
            tahun: Number(tahun), saldo_awal: jenisCuti.jatah_hari_default,
            saldo_terpakai: 0, saldo_penyesuaian: 0,
            created_at: now, updated_at: now,
          },
        })
        dibuat++
      }
    }

    await writeAuditLog({
      user: auth.user, action: "CREATE", modelType: "saldo_cutis_generate",
      dataBaru: { tahun, jenis_cuti_id, dibuat, diperbarui, dilewati }, ip: getClientIp(req),
    })

    return NextResponse.json({ success: true, dibuat, diperbarui, dilewati, jumlah_karyawan: karyawans.length,
      message: `${dibuat} saldo baru dibuat, ${diperbarui} diperbarui, ${dilewati} dilewati.` })
  } catch { return NextResponse.json({ error: "Gagal generate saldo cuti" }, { status: 500 }) }
}
