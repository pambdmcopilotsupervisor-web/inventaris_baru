import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canAccessBawahanPenilaian } from "@/lib/penilaian-atasan"
import { getPdfPenilaianData } from "@/lib/penilaian-pdf-data"
import { generatePenilaianPdf } from "@/lib/penilaian-pdf-generator"

export const runtime = "nodejs"

// GET /api/penilaian/[id]/pdf  → unduh dokumen PDF penilaian kinerja

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error

  try {
    const { id } = await params
    const idPenilaian = Number(id)
    if (!Number.isInteger(idPenilaian)) {
      return NextResponse.json({ error: "ID penilaian tidak valid" }, { status: 400 })
    }

    // Validasi akses: pemilik penilaian, atasan dalam scope, atau admin/hrd
    const rows = await prisma.$queryRaw<{ id_pegawai: bigint }[]>`
      SELECT id_pegawai FROM penilaian_kinerja WHERE id = ${BigInt(idPenilaian)} LIMIT 1
    `
    if (!rows[0]) return NextResponse.json({ error: "Data penilaian tidak ditemukan" }, { status: 404 })

    const idPegawai = Number(rows[0].id_pegawai)
    const isOwner = auth.user.karyawan_id === idPegawai
    const canAccess = isOwner || await canAccessBawahanPenilaian(auth.user, idPegawai)
    if (!canAccess) {
      return NextResponse.json({ error: "Tidak diizinkan mengakses dokumen ini" }, { status: 403 })
    }

    const data = await getPdfPenilaianData(idPenilaian)
    if (!data) return NextResponse.json({ error: "Data tidak ditemukan" }, { status: 404 })

    const pdf = await generatePenilaianPdf(data)
    const safeName = data.identitas.nama_karyawan.replace(/[^a-zA-Z0-9]+/g, "_")
    const filename = `Penilaian_${safeName}_${data.periode.kode_periode}.pdf`

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (err) {
    console.error("[penilaian pdf]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal membuat PDF" }, { status: 500 })
  }
}
