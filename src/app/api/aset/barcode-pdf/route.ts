import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/lib/auth"
import { generateAsetBarcodePdf, type BarcodePdfAsset, type BarcodePdfMeta } from "@/lib/aset-barcode-pdf"

export const runtime = "nodejs"

interface BarcodePdfRequestBody {
  assets?: BarcodePdfAsset[]
  meta?: BarcodePdfMeta
}

function isValidAsset(asset: BarcodePdfAsset): boolean {
  return Number.isInteger(asset.id)
    && asset.id > 0
    && typeof asset.kode_asset === "string"
    && typeof asset.nama_asset === "string"
    && typeof asset.kelompok_asset === "string"
    && typeof asset.status_barang === "string"
}

export async function POST(req: NextRequest) {
  const auth = await requireSession(req)
  if ("error" in auth) return auth.error

  try {
    const body = await req.json() as BarcodePdfRequestBody
    const assets = Array.isArray(body.assets) ? body.assets.filter(isValidAsset) : []
    const meta = body.meta ?? {}

    if (assets.length === 0) {
      return NextResponse.json({ error: "Tidak ada aset untuk diunduh" }, { status: 400 })
    }

    const origin = new URL(req.url).origin
    const pdf = await generateAsetBarcodePdf(assets, meta, origin)
    const filename = `Barcode_Aset_${new Date().toISOString().slice(0, 10)}.pdf`

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    console.error("[aset barcode pdf]", error)
    return NextResponse.json({ error: "Gagal membuat PDF barcode" }, { status: 500 })
  }
}