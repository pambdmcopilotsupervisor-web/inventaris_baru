import { existsSync } from "fs"
import path from "path"
import PDFDocument from "pdfkit"
import type { AsetReportFilters, AsetReportRow } from "@/lib/aset-report"

const PAGE_W = 841.89
const PAGE_H = 595.28
const MARGIN = 24
const CONTENT_W = PAGE_W - MARGIN * 2
const LOGO_SIZE = 42
const APP_LOGO_PATH = path.join(process.cwd(), "public", "pedami-logo.png")
const HAS_APP_LOGO = existsSync(APP_LOGO_PATH)

interface AsetReportPdfOptions {
  filters: AsetReportFilters
  printedBy?: string | null
}

const columns = [
  { title: "No", width: 24, align: "center" as const },
  { title: "Kode Aset", width: 58, align: "center" as const },
  { title: "Nama Aset", width: 144, align: "left" as const },
  { title: "Kelompok", width: 58, align: "center" as const },
  { title: "Tgl Beli", width: 58, align: "center" as const },
  { title: "Harga Beli", width: 76, align: "right" as const },
  { title: "Lokasi / Ruangan", width: 112, align: "left" as const },
  { title: "Penanggung Jawab", width: 96, align: "left" as const },
  { title: "Pemakai", width: 96, align: "left" as const },
  { title: "Kondisi", width: 70, align: "center" as const },
]

function fmtDate(value: string | Date | null): string {
  if (!value) return "-"
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value))
}

function fmtNumber(value: number | null): string {
  return (Number(value) || 0).toLocaleString("id-ID")
}

function formatGroup(value: string): string {
  return value === "komputer" ? "Komputer" : "Kantor"
}

function buildSubtitle(filters: AsetReportFilters): string {
  const parts: string[] = []
  if (filters.kelompok_asset) parts.push(filters.kelompok_asset === "komputer" ? "Peralatan Komputer" : "Perabotan Kantor")
  if (filters.status_barang) parts.push(`Status: ${filters.status_barang}`)
  return parts.length > 0 ? `Filter: ${parts.join(" | ")}` : "Semua Data"
}

function drawAppLogo(doc: PDFKit.PDFDocument, x: number, y: number, size: number) {
  if (!HAS_APP_LOGO) return

  doc.save()
  doc.roundedRect(x, y, size, size, 6).clip()
  doc.image(APP_LOGO_PATH, x, y, {
    cover: [size, size],
    align: "center",
    valign: "center",
  })
  doc.restore()
}

function drawHeader(doc: PDFKit.PDFDocument, options: AsetReportPdfOptions): number {
  const y = MARGIN
  drawAppLogo(doc, MARGIN, y, LOGO_SIZE)

  const titleX = MARGIN + LOGO_SIZE + 12
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#000000").text("LAPORAN INVENTARIS ASET", titleX, y + 1, {
    width: CONTENT_W - LOGO_SIZE - 12,
  })
  doc.font("Helvetica-Bold").fontSize(11).text("KOPERASI KONSUMEN PEDAMI", titleX, y + 19, {
    width: CONTENT_W - LOGO_SIZE - 12,
  })
  doc.font("Helvetica").fontSize(8).fillColor("#475569").text(buildSubtitle(options.filters), titleX, y + 35, {
    width: CONTENT_W - LOGO_SIZE - 12,
  })

  const metaY = y + LOGO_SIZE + 8
  doc.font("Helvetica").fontSize(8).fillColor("#475569")
  doc.text(`Dicetak pada: ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Makassar" })}`, MARGIN, metaY, {
    width: CONTENT_W / 2,
  })
  doc.text(`Dicetak oleh: ${options.printedBy ?? "Sistem"}`, MARGIN, metaY, {
    width: CONTENT_W,
    align: "right",
  })

  return metaY + 16
}

function drawTableHeader(doc: PDFKit.PDFDocument, y: number): number {
  let x = MARGIN
  doc.font("Helvetica-Bold").fontSize(7).fillColor("#111827")
  columns.forEach((column) => {
    doc.rect(x, y, column.width, 18).fillAndStroke("#e5e7eb", "#111827")
    doc.fillColor("#111827").text(column.title, x + 3, y + 5, {
      width: column.width - 6,
      align: "center",
    })
    x += column.width
  })
  return y + 18
}

function ensureRowPage(doc: PDFKit.PDFDocument, y: number, rowHeight: number, options: AsetReportPdfOptions): number {
  if (y + rowHeight <= PAGE_H - MARGIN) return y
  doc.addPage({ size: "A4", layout: "landscape", margin: MARGIN })
  return drawTableHeader(doc, drawHeader(doc, options))
}

function drawRow(doc: PDFKit.PDFDocument, y: number, cells: string[], bold = false): number {
  doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(7)
  const heights = cells.map((cell, index) => {
    const column = columns[index]
    return doc.heightOfString(cell, { width: column.width - 6, align: column.align }) + 8
  })
  const rowHeight = Math.max(18, ...heights)

  let x = MARGIN
  cells.forEach((cell, index) => {
    const column = columns[index]
    doc.rect(x, y, column.width, rowHeight).strokeColor("#111827").stroke()
    doc.fillColor("#111827").text(cell, x + 3, y + 5, {
      width: column.width - 6,
      align: column.align,
    })
    x += column.width
  })

  return rowHeight
}

export function generateAsetReportPdf(rows: AsetReportRow[], options: AsetReportPdfOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: MARGIN })
    const chunks: Buffer[] = []
    doc.on("data", (chunk: Buffer) => chunks.push(chunk))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    let y = drawTableHeader(doc, drawHeader(doc, options))

    rows.forEach((row) => {
      const cells = [
        String(row.no),
        row.kode_asset,
        row.nama_asset,
        formatGroup(row.kelompok_asset),
        fmtDate(row.tgl_beli),
        `Rp. ${fmtNumber(row.hrg_beli)}`,
        row.nama_ruangan ? `${row.nama_ruangan} - ${row.lokasi ?? ""}` : "-",
        row.nama_pj ?? "-",
        row.nama_pemakai ?? "-",
        row.status_barang,
      ]
      const height = Math.max(18, ...cells.map((cell, index) => {
        const column = columns[index]
        doc.font("Helvetica").fontSize(7)
        return doc.heightOfString(cell, { width: column.width - 6, align: column.align }) + 8
      }))
      y = ensureRowPage(doc, y, height, options)
      y += drawRow(doc, y, cells)
    })

    const total = rows.reduce((sum, row) => sum + (Number(row.hrg_beli) || 0), 0)
    const totalCells = ["", "", "", "", `Total (${rows.length} item):`, `Rp. ${fmtNumber(total)}`, "", "", "", ""]
    y = ensureRowPage(doc, y, 20, options)
    drawRow(doc, y, totalCells, true)

    doc.end()
  })
}

