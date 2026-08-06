import { existsSync } from "fs"
import path from "path"
import PDFDocument from "pdfkit"
import type { KaryawanReportRow } from "@/lib/karyawan-report"

const PAGE_W = 841.89
const PAGE_H = 595.28
const MARGIN = 24
const CONTENT_W = PAGE_W - MARGIN * 2
const LOGO_SIZE = 42
const APP_LOGO_PATH = path.join(process.cwd(), "public", "pedami-logo.png")
const HAS_APP_LOGO = existsSync(APP_LOGO_PATH)

interface KaryawanReportPdfOptions {
  printedBy?: string | null
}

const columns = [
  { title: "No", width: 28, align: "center" as const },
  { title: "NIK", width: 78, align: "left" as const },
  { title: "Nama", width: 135, align: "left" as const },
  { title: "Jabatan", width: 88, align: "left" as const },
  { title: "Divisi", width: 95, align: "left" as const },
  { title: "Sub Divisi", width: 95, align: "left" as const },
  { title: "JK", width: 50, align: "center" as const },
  { title: "Status", width: 64, align: "center" as const },
  { title: "Tgl Masuk", width: 68, align: "center" as const },
  { title: "No HP", width: 92, align: "left" as const },
]

function fmtDate(value: string | Date | null): string {
  if (!value) return "-"
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value))
}

function text(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "-"
  return String(value)
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

function drawHeader(doc: PDFKit.PDFDocument, rows: KaryawanReportRow[], options: KaryawanReportPdfOptions): number {
  const y = MARGIN
  drawAppLogo(doc, MARGIN, y, LOGO_SIZE)

  const titleX = MARGIN + LOGO_SIZE + 12
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#000000").text("LAPORAN DATA KARYAWAN", titleX, y + 1, {
    width: CONTENT_W - LOGO_SIZE - 12,
  })
  doc.font("Helvetica-Bold").fontSize(11).text("KOPERASI KONSUMEN PEDAMI", titleX, y + 19, {
    width: CONTENT_W - LOGO_SIZE - 12,
  })
  doc.font("Helvetica").fontSize(8).fillColor("#475569").text(`Total data: ${rows.length} karyawan`, titleX, y + 35, {
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

function ensureRowPage(
  doc: PDFKit.PDFDocument,
  y: number,
  rowHeight: number,
  rows: KaryawanReportRow[],
  options: KaryawanReportPdfOptions
): number {
  if (y + rowHeight <= PAGE_H - MARGIN) return y
  doc.addPage({ size: "A4", layout: "landscape", margin: MARGIN })
  return drawTableHeader(doc, drawHeader(doc, rows, options))
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

export function generateKaryawanReportPdf(rows: KaryawanReportRow[], options: KaryawanReportPdfOptions = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: MARGIN })
    const chunks: Buffer[] = []
    doc.on("data", (chunk: Buffer) => chunks.push(chunk))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    let y = drawTableHeader(doc, drawHeader(doc, rows, options))

    rows.forEach((row) => {
      const cells = [
        String(row.no),
        text(row.nik),
        text(row.nama_karyawan),
        text(row.jabatan),
        text(row.nama_divisi),
        text(row.nama_subdivisi),
        row.jkel === "Laki-Laki" ? "L" : row.jkel === "Perempuan" ? "P" : text(row.jkel),
        text(row.status_karyawan),
        fmtDate(row.tanggal_masuk_kerja),
        text(row.no_hp),
      ]
      const height = Math.max(
        18,
        ...cells.map((cell, index) => {
          const column = columns[index]
          doc.font("Helvetica").fontSize(7)
          return doc.heightOfString(cell, { width: column.width - 6, align: column.align }) + 8
        })
      )
      y = ensureRowPage(doc, y, height, rows, options)
      y += drawRow(doc, y, cells)
    })

    y = ensureRowPage(doc, y, 20, rows, options)
    drawRow(doc, y, ["", "", `Total: ${rows.length} karyawan`, "", "", "", "", "", "", ""], true)

    doc.end()
  })
}
