import { existsSync } from "fs"
import path from "path"
import PDFDocument from "pdfkit"
import QRCode from "qrcode"

export interface BarcodePdfAsset {
  id: number
  kode_asset: string
  nama_asset: string
  kelompok_asset: string
  divisi_pj: string | null
  status_barang: string
  nama_ruangan?: string | null
  lokasi?: string | null
}

export interface BarcodePdfMeta {
  ruangan?: string | null
  kondisi?: string | null
  lokasi?: string | null
  total?: number
}

const PAGE_HEIGHT = 841.89
const PAGE_MARGIN = 28
const STICKER_GAP = 10
const STICKER_WIDTH = 172
const STICKER_HEIGHT = 68
const STICKER_RADIUS = 6
const STICKERS_PER_ROW = 3
const STICKER_BODY_X = 8
const STICKER_BODY_Y = 17
const LOGO_BOX_SIZE = 26
const LOGO_GAP = 6
const QR_BOX_SIZE = 34
const QR_INNER_SIZE = 28
const HEADER_HEIGHT = 13
const FOOTER_HEIGHT = 9
const APP_LOGO_PATH = path.join(process.cwd(), "public", "pedami-logo.png")
const HAS_APP_LOGO = existsSync(APP_LOGO_PATH)

function truncateText(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...` : value
}

function parseSvgAttributes(svgMarkup: string): { viewBoxSize: number; darkPath: string; drawMode: "fill" | "stroke" } {
  const viewBoxMatch = svgMarkup.match(/viewBox="0 0 ([0-9.]+) ([0-9.]+)"/)
  const pathMatches = [...svgMarkup.matchAll(/<path fill="([^"]+)" d="([^"]+)"/g)]
  const strokeMatch = svgMarkup.match(/<path stroke="([^"]+)" d="([^"]+)"\/?>/)
  const darkPathFromFill = pathMatches.find((match) => match[1].toLowerCase() !== "#ffffff")?.[2]
  const darkPath = darkPathFromFill ?? strokeMatch?.[2]
  const drawMode = darkPathFromFill ? "fill" : strokeMatch ? "stroke" : null

  if (!viewBoxMatch || !darkPath || !drawMode) {
    throw new Error("Gagal memproses SVG QR Code")
  }

  return {
    viewBoxSize: Number(viewBoxMatch[1]),
    darkPath,
    drawMode,
  }
}

async function drawQrCode(doc: PDFKit.PDFDocument, value: string, x: number, y: number, size: number) {
  const markup = await QRCode.toString(value, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 0,
    color: {
      dark: "#0f172a",
      light: "#ffffff",
    },
  })

  const { viewBoxSize, darkPath, drawMode } = parseSvgAttributes(markup)
  const scale = size / viewBoxSize

  doc.save()
  doc.rect(x, y, size, size).fill("#ffffff")
  doc.translate(x, y)
  doc.scale(scale)
  if (drawMode === "stroke") {
    doc.path(darkPath).lineWidth(1).stroke("#0f172a")
  } else {
    doc.path(darkPath).fill("#0f172a")
  }
  doc.restore()
}

function drawAppLogo(doc: PDFKit.PDFDocument, x: number, y: number, size: number) {
  if (!HAS_APP_LOGO) return

  doc.roundedRect(x, y, size, size, 4).fillColor("#ffffff").fill()
  doc.save()
  doc.roundedRect(x, y, size, size, 4).clip()
  doc.image(APP_LOGO_PATH, x, y, {
    cover: [size, size],
    align: "center",
    valign: "center",
  })
  doc.restore()
  doc.roundedRect(x, y, size, size, 4).strokeColor("#e2e8f0").lineWidth(0.6).stroke()
}

function fitDivisiFontSize(doc: PDFKit.PDFDocument, text: string, width: number, maxHeight: number): number {
  for (let size = 6.7; size >= 4.5; size -= 0.2) {
    doc.font("Helvetica-Bold").fontSize(size)
    if (doc.heightOfString(text, { width }) <= maxHeight) return size
  }

  return 4.5
}

async function drawSticker(doc: PDFKit.PDFDocument, asset: BarcodePdfAsset, x: number, y: number, origin: string) {
  doc.roundedRect(x, y, STICKER_WIDTH, STICKER_HEIGHT, STICKER_RADIUS).fillColor("#ffffff").fill()

  doc.save()
  doc.roundedRect(x, y, STICKER_WIDTH, STICKER_HEIGHT, STICKER_RADIUS).clip()
  doc.rect(x, y, STICKER_WIDTH, HEADER_HEIGHT).fill("#1e293b")
  doc.restore()
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(6.3).text("INVENTARIS KOPERASI KONSUMEN PEDAMI", x, y + 4, {
    width: STICKER_WIDTH,
    align: "center",
  })

  const infoX = x + STICKER_BODY_X
  const infoY = y + STICKER_BODY_Y
  const qrOuterX = x + STICKER_WIDTH - STICKER_BODY_X - QR_BOX_SIZE
  const qrOuterY = y + STICKER_BODY_Y + 1
  const qrPadding = (QR_BOX_SIZE - QR_INNER_SIZE) / 2
  const logoX = infoX
  const logoY = infoY + 5
  const textX = logoX + LOGO_BOX_SIZE + LOGO_GAP
  const textWidth = qrOuterX - textX - LOGO_GAP

  drawAppLogo(doc, logoX, logoY, LOGO_BOX_SIZE)

  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(10).text(truncateText(asset.kode_asset, 18), textX, infoY, {
    width: textWidth,
  })
  doc.fillColor("#475569").font("Helvetica-Bold").fontSize(7.2).text(truncateText(asset.nama_asset, 20), textX, infoY + 12, {
    width: textWidth,
  })

  const badgeText = asset.divisi_pj ?? "Tanpa Divisi"
  const badgeX = textX
  const badgeY = infoY + 26
  const badgeWidth = textWidth
  const badgeHeight = 17
  const badgePaddingX = 4
  const badgeTextWidth = badgeWidth - badgePaddingX * 2
  const badgeFontSize = fitDivisiFontSize(doc, badgeText, badgeTextWidth, badgeHeight - 4)
  doc.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 4).fillColor("#f1f5f9").fill()
  doc.fillColor("#64748b").font("Helvetica-Bold").fontSize(badgeFontSize).text(badgeText, badgeX + badgePaddingX, badgeY + 2.5, {
    width: badgeTextWidth,
    height: badgeHeight - 4,
    lineGap: -0.5,
  })

  doc.roundedRect(qrOuterX, qrOuterY, QR_BOX_SIZE, QR_BOX_SIZE, 4).fillColor("#ffffff").fill().strokeColor("#e2e8f0").lineWidth(1).stroke()
  await drawQrCode(doc, `${origin}/info-asset/${asset.id}`, qrOuterX + qrPadding, qrOuterY + qrPadding, QR_INNER_SIZE)

  doc.moveTo(x, y + STICKER_HEIGHT - FOOTER_HEIGHT).lineTo(x + STICKER_WIDTH, y + STICKER_HEIGHT - FOOTER_HEIGHT).dash(3, { space: 2 }).strokeColor("#cbd5e1").lineWidth(1).stroke().undash()
  doc.fillColor("#ef4444").font("Helvetica-Oblique").fontSize(5.8).text("Dilarang mencabut/melepas stiker ini!", x, y + STICKER_HEIGHT - 7, {
    width: STICKER_WIDTH,
    align: "center",
  })
  doc.roundedRect(x, y, STICKER_WIDTH, STICKER_HEIGHT, STICKER_RADIUS).strokeColor("#1e293b").lineWidth(1.2).stroke()
}

export function generateAsetBarcodePdf(assets: BarcodePdfAsset[], meta: BarcodePdfMeta, origin: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true })
    const chunks: Buffer[] = []
    doc.on("data", (chunk: Buffer) => chunks.push(chunk))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    ;(async () => {
      void meta

      const startY = PAGE_MARGIN
      const availableHeight = PAGE_HEIGHT - PAGE_MARGIN - startY
      const maxRowsPerPage = Math.max(1, Math.floor((availableHeight + STICKER_GAP) / (STICKER_HEIGHT + STICKER_GAP)))

      for (const [index, asset] of assets.entries()) {
        const perPage = maxRowsPerPage * STICKERS_PER_ROW
        if (index > 0 && index % perPage === 0) {
          doc.addPage()
        }

        const indexInPage = index % perPage
        const row = Math.floor(indexInPage / STICKERS_PER_ROW)
        const col = indexInPage % STICKERS_PER_ROW
        const x = PAGE_MARGIN + col * (STICKER_WIDTH + STICKER_GAP)
        const y = startY + row * (STICKER_HEIGHT + STICKER_GAP)

        await drawSticker(doc, asset, x, y, origin)
      }

      doc.end()
    })().catch(reject)
  })
}
