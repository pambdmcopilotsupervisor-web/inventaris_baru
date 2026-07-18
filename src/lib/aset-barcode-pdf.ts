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

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const PAGE_MARGIN = 28
const STICKER_GAP = 10
const STICKER_WIDTH = 172
const STICKER_HEIGHT = 68
const STICKERS_PER_ROW = 3
const STICKER_BODY_X = 8
const STICKER_BODY_Y = 17
const QR_BOX_SIZE = 34
const QR_INNER_SIZE = 28
const HEADER_HEIGHT = 13
const FOOTER_HEIGHT = 9
const SUMMARY_HEIGHT = 58

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

function drawSummaryBox(doc: PDFKit.PDFDocument, x: number, y: number, w: number, label: string, value: string) {
  doc.roundedRect(x, y, w, 28, 6).fillColor("#f8fafc").fill().strokeColor("#e2e8f0").lineWidth(1).stroke()
  doc.fillColor("#64748b").font("Helvetica-Bold").fontSize(7).text(label.toUpperCase(), x + 8, y + 5, { width: w - 16 })
  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(9).text(value, x + 8, y + 14, { width: w - 16 })
}

function drawSummary(doc: PDFKit.PDFDocument, meta: BarcodePdfMeta, itemCount: number) {
  const startX = PAGE_MARGIN
  const boxY = PAGE_MARGIN + 18
  const totalWidth = PAGE_WIDTH - PAGE_MARGIN * 2
  const boxGap = 8
  const boxWidth = (totalWidth - boxGap * 3) / 4

  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(13).text("RINGKASAN UNDUH BARCODE PDF", PAGE_MARGIN, PAGE_MARGIN)
  drawSummaryBox(doc, startX, boxY, boxWidth, "Total Aset", String(meta.total ?? itemCount))
  drawSummaryBox(doc, startX + (boxWidth + boxGap), boxY, boxWidth, "Ruangan", meta.ruangan ?? "Semua Ruangan")
  drawSummaryBox(doc, startX + (boxWidth + boxGap) * 2, boxY, boxWidth, "Kondisi", meta.kondisi ?? "Semua Kondisi")
  drawSummaryBox(doc, startX + (boxWidth + boxGap) * 3, boxY, boxWidth, "Lokasi", meta.lokasi ?? "Semua Lokasi")
}

function fitBadgeWidth(doc: PDFKit.PDFDocument, text: string): number {
  return Math.min(Math.max(doc.widthOfString(text) + 8, 50), 90)
}

async function drawSticker(doc: PDFKit.PDFDocument, asset: BarcodePdfAsset, x: number, y: number, origin: string) {
  doc.roundedRect(x, y, STICKER_WIDTH, STICKER_HEIGHT, 6).fillColor("#ffffff").fill().strokeColor("#1e293b").lineWidth(2).stroke()

  doc.rect(x, y, STICKER_WIDTH, HEADER_HEIGHT).fill("#1e293b")
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(6.3).text("INVENTARIS KOPERASI KONSUMEN PEDAMI", x, y + 4, {
    width: STICKER_WIDTH,
    align: "center",
  })

  const infoX = x + STICKER_BODY_X
  const infoY = y + STICKER_BODY_Y
  const qrOuterX = x + STICKER_WIDTH - STICKER_BODY_X - QR_BOX_SIZE
  const qrOuterY = y + STICKER_BODY_Y + 1
  const qrPadding = (QR_BOX_SIZE - QR_INNER_SIZE) / 2
  const textWidth = STICKER_WIDTH - QR_BOX_SIZE - STICKER_BODY_X * 3

  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(11).text(asset.kode_asset, infoX, infoY)
  doc.fillColor("#475569").font("Helvetica-Bold").fontSize(7.2).text(truncateText(asset.nama_asset, 22), infoX, infoY + 12, {
    width: textWidth,
  })

  const badgeText = asset.divisi_pj ?? "Tanpa Divisi"
  const badgeWidth = Math.min(fitBadgeWidth(doc, badgeText), textWidth)
  doc.roundedRect(infoX, infoY + 27, badgeWidth, 12, 4).fillColor("#f1f5f9").fill()
  doc.fillColor("#64748b").font("Helvetica-Bold").fontSize(6.7).text(truncateText(badgeText, 18), infoX + 4, infoY + 30.5, { width: badgeWidth - 8 })

  doc.roundedRect(qrOuterX, qrOuterY, QR_BOX_SIZE, QR_BOX_SIZE, 4).fillColor("#ffffff").fill().strokeColor("#e2e8f0").lineWidth(1).stroke()
  await drawQrCode(doc, `${origin}/info-asset/${asset.id}`, qrOuterX + qrPadding, qrOuterY + qrPadding, QR_INNER_SIZE)

  doc.moveTo(x, y + STICKER_HEIGHT - FOOTER_HEIGHT).lineTo(x + STICKER_WIDTH, y + STICKER_HEIGHT - FOOTER_HEIGHT).dash(3, { space: 2 }).strokeColor("#cbd5e1").lineWidth(1).stroke().undash()
  doc.fillColor("#ef4444").font("Helvetica-Oblique").fontSize(5.8).text("Dilarang mencabut/melepas stiker ini!", x, y + STICKER_HEIGHT - 7, {
    width: STICKER_WIDTH,
    align: "center",
  })
}

export function generateAsetBarcodePdf(assets: BarcodePdfAsset[], meta: BarcodePdfMeta, origin: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true })
    const chunks: Buffer[] = []
    doc.on("data", (chunk: Buffer) => chunks.push(chunk))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    ;(async () => {
      drawSummary(doc, meta, assets.length)

      const startY = PAGE_MARGIN + SUMMARY_HEIGHT
      const availableHeight = PAGE_HEIGHT - PAGE_MARGIN - startY
      const maxRowsPerPage = Math.max(1, Math.floor((availableHeight + STICKER_GAP) / (STICKER_HEIGHT + STICKER_GAP)))

      for (const [index, asset] of assets.entries()) {
        const perPage = maxRowsPerPage * STICKERS_PER_ROW
        if (index > 0 && index % perPage === 0) {
          doc.addPage()
          drawSummary(doc, meta, assets.length)
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