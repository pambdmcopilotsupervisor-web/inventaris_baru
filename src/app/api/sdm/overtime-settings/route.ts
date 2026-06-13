import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error
  try {
    const data = await prisma.overtime_settings.findMany({ orderBy: [{ tipe_hari: "asc" }, { id: "asc" }] })
    return NextResponse.json(serialize(data))
  } catch { return NextResponse.json({ error: "Server error" }, { status: 500 }) }
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["admin"])
  if ("error" in auth) return auth.error
  try {
    const body = await req.json()
    const { nama_setting, tipe_hari, metode_perhitungan, tarif_flat, tarif_per_jam, multiplier_jam_pertama, multiplier_jam_berikutnya, batas_minimal_menit_lembur, pembulatan_menit, status, keterangan } = body
    if (!nama_setting?.trim()) return NextResponse.json({ error: "Nama setting wajib diisi" }, { status: 400 })

    const data = await prisma.overtime_settings.create({
      data: {
        nama_setting: nama_setting.trim(),
        tipe_hari: tipe_hari ?? "hari_kerja",
        metode_perhitungan: metode_perhitungan ?? "per_jam",
        tarif_flat: Number(tarif_flat ?? 0),
        tarif_per_jam: Number(tarif_per_jam ?? 0),
        multiplier_jam_pertama: Number(multiplier_jam_pertama ?? 1.5),
        multiplier_jam_berikutnya: Number(multiplier_jam_berikutnya ?? 2.0),
        batas_minimal_menit_lembur: Number(batas_minimal_menit_lembur ?? 30),
        pembulatan_menit: Number(pembulatan_menit ?? 30),
        status: status ?? "aktif",
        keterangan: keterangan?.trim() || null,
        created_at: new Date(), updated_at: new Date(),
      },
    })
    await writeAuditLog({ user: auth.user, action: "CREATE", modelType: "overtime_settings", modelId: data.id, dataBaru: serialize(data), ip: getClientIp(req) })
    return NextResponse.json(serialize(data), { status: 201 })
  } catch { return NextResponse.json({ error: "Gagal menyimpan" }, { status: 500 }) }
}
