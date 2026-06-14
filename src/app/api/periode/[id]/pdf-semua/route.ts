import { NextRequest, NextResponse } from "next/server"
import JSZip from "jszip"
import { requireRole } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getPenilaianIdsByPeriode, getPdfPenilaianData } from "@/lib/penilaian-pdf-data"
import { generatePenilaianPdf } from "@/lib/penilaian-pdf-generator"

export const runtime = "nodejs"
export const maxDuration = 60

// GET /api/periode/[id]/pdf-semua  → unduh ZIP semua PDF penilaian dalam 1 periode

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(req, ["admin", "hrd"])
  if ("error" in auth) return auth.error

  try {
    const { id } = await params
    const idPeriode = Number(id)
    if (!Number.isInteger(idPeriode)) {
      return NextResponse.json({ error: "ID periode tidak valid" }, { status: 400 })
    }

    const periodeRows = await prisma.$queryRaw<{ kode_periode: string }[]>`
      SELECT kode_periode FROM periode_penilaian WHERE id = ${BigInt(idPeriode)} LIMIT 1
    `
    if (!periodeRows[0]) return NextResponse.json({ error: "Periode tidak ditemukan" }, { status: 404 })

    const list = await getPenilaianIdsByPeriode(idPeriode)
    if (list.length === 0) {
      return NextResponse.json({ error: "Belum ada penilaian pada periode ini" }, { status: 404 })
    }

    const zip = new JSZip()
    const usedNames = new Set<string>()

    for (const item of list) {
      const data = await getPdfPenilaianData(item.id)
      if (!data) continue
      const pdf = await generatePenilaianPdf(data)
      let baseName = `${item.nama_karyawan.replace(/[^a-zA-Z0-9]+/g, "_")}_${data.periode.kode_periode}`
      let name = `${baseName}.pdf`
      let n = 1
      while (usedNames.has(name)) { name = `${baseName}_${++n}.pdf` }
      usedNames.add(name)
      zip.file(name, pdf)
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })
    const filename = `Penilaian_Kinerja_${periodeRows[0].kode_periode}.zip`

    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (err) {
    console.error("[periode pdf-semua]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal membuat ZIP" }, { status: 500 })
  }
}
