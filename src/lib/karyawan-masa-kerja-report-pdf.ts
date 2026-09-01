import { existsSync } from "fs"
import path from "path"
import PDFDocument from "pdfkit"
import type { KaryawanMasaKerjaReportRow } from "@/lib/karyawan-masa-kerja-report"

const PAGE_W = 841.89
const PAGE_H = 595.28
const MARGIN = 18
const CONTENT_W = PAGE_W - MARGIN * 2
const LOGO_SIZE = 38
const APP_LOGO_PATH = path.join(process.cwd(), "public", "pedami-logo.png")
const HAS_APP_LOGO = existsSync(APP_LOGO_PATH)
const GRID_COLOR = "#cbd5e1"
const HEADER_GRID_COLOR = "#94a3b8"
const HEADER_BG = "#e8edf3"
const GROUP_BG = "#f1f5f9"
const ODD_ROW_BG = "#ffffff"
const EVEN_ROW_BG = "#f8fafc"

interface KaryawanMasaKerjaReportPdfOptions {
  printedBy?: string | null
  filterLabel?: string | null
}

interface PdfColumn {
  title: string
  width: number
  align?: "left" | "center" | "right"
  render: (row: KaryawanMasaKerjaReportRow) => string
}

const columns: PdfColumn[] = [
  { title: "No", width: 26, align: "center", render: (row) => String(row.no) },
  { title: "NIK", width: 62, render: (row) => row.nik },
  { title: "Nama Karyawan", width: 120, render: (row) => row.nama_karyawan },
  { title: "Status", width: 50, align: "center", render: (row) => text(row.status_karyawan) },
  { title: "Jabatan", width: 82, render: (row) => text(row.jabatan) },
  { title: "Divisi", width: 105, render: (row) => text(row.divisi) },
  { title: "Sub Divisi", width: 104, render: (row) => text(row.subdivisi) },
  { title: "Mulai", width: 58, align: "center", render: (row) => fmtDate(row.tanggal_mulai) },
  { title: "Sampai", width: 58, align: "center", render: (row) => row.sampai_label || fmtDate(row.tanggal_sampai) },
  { title: "Masa Kerja", width: 100, render: (row) => row.masa_kerja },
  { title: "Posisi", width: 40, align: "center", render: (row) => row.aktif ? "Saat Ini" : "-" },
]

function fmtDate(value: string | Date | null | undefined): string {
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

function drawHeader(
  doc: PDFKit.PDFDocument,
  rows: KaryawanMasaKerjaReportRow[],
  options: KaryawanMasaKerjaReportPdfOptions
): number {
  const y = MARGIN
  const uniqueEmployees = new Set(rows.map((row) => row.karyawan_id)).size
  const totalDivisi = new Set(rows.map((row) => row.divisi ?? "Tanpa Divisi")).size

  drawAppLogo(doc, MARGIN, y, LOGO_SIZE)

  const titleX = MARGIN + LOGO_SIZE + 12
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#000000").text("REKAP MASA KERJA KARYAWAN PER DIVISI", titleX, y, {
    width: CONTENT_W - LOGO_SIZE - 12,
  })
  doc.font("Helvetica-Bold").fontSize(11).text("KOPERASI KONSUMEN PEDAMI", titleX, y + 18, {
    width: CONTENT_W - LOGO_SIZE - 12,
  })
  doc.font("Helvetica").fontSize(8).fillColor("#475569").text(
    `Filter: ${options.filterLabel ?? "Semua"} | ${uniqueEmployees} karyawan, ${rows.length} penempatan, ${totalDivisi} divisi`,
    titleX,
    y + 34,
    { width: CONTENT_W - LOGO_SIZE - 12 }
  )

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
  const rowHeight = 18
  let x = MARGIN
  doc.save()
  doc.lineWidth(0.45)
  doc.rect(MARGIN, y, CONTENT_W, rowHeight).fill(HEADER_BG)
  doc.strokeColor(HEADER_GRID_COLOR)
  doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y).stroke()
  doc.moveTo(MARGIN, y + rowHeight).lineTo(MARGIN + CONTENT_W, y + rowHeight).stroke()
  doc.moveTo(MARGIN, y).lineTo(MARGIN, y + rowHeight).stroke()
  doc.font("Helvetica-Bold").fontSize(6.5).fillColor("#111827")
  columns.forEach((column) => {
    doc.fillColor("#111827").text(column.title, x + 3, y + 5, {
      width: column.width - 6,
      align: "center",
    })
    x += column.width
    doc.strokeColor(HEADER_GRID_COLOR).moveTo(x, y).lineTo(x, y + rowHeight).stroke()
  })
  doc.restore()
  return y + rowHeight
}

function ensurePage(
  doc: PDFKit.PDFDocument,
  y: number,
  rowHeight: number,
  rows: KaryawanMasaKerjaReportRow[],
  options: KaryawanMasaKerjaReportPdfOptions
): number {
  if (y + rowHeight <= PAGE_H - MARGIN) return y
  doc.addPage({ size: "A4", layout: "landscape", margin: MARGIN })
  return drawTableHeader(doc, drawHeader(doc, rows, options))
}

function drawGroupRow(doc: PDFKit.PDFDocument, y: number, title: string, count: number): number {
  const rowHeight = 17
  doc.save()
  doc.lineWidth(0.4)
  doc.rect(MARGIN, y, CONTENT_W, rowHeight).fill(GROUP_BG)
  doc.strokeColor(HEADER_GRID_COLOR)
  doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y).stroke()
  doc.moveTo(MARGIN, y + rowHeight).lineTo(MARGIN + CONTENT_W, y + rowHeight).stroke()
  doc.font("Helvetica-Bold").fontSize(7).fillColor("#111827").text(
    `${title} (${count} penempatan)`,
    MARGIN + 4,
    y + 5,
    { width: CONTENT_W - 8 }
  )
  doc.restore()
  return rowHeight
}

function drawEmptyRow(doc: PDFKit.PDFDocument, y: number): number {
  const rowHeight = 24
  doc.save()
  doc.lineWidth(0.4)
  doc.rect(MARGIN, y, CONTENT_W, rowHeight).strokeColor(GRID_COLOR).stroke()
  doc.font("Helvetica").fontSize(8).fillColor("#475569").text("Tidak ada data sesuai pilihan cetak.", MARGIN + 4, y + 8, {
    width: CONTENT_W - 8,
    align: "center",
  })
  doc.restore()
  return rowHeight
}

function getDataRowHeight(doc: PDFKit.PDFDocument, row: KaryawanMasaKerjaReportRow): number {
  doc.font("Helvetica").fontSize(6.5)
  const heights = columns.map((column) => {
    return doc.heightOfString(column.render(row), { width: column.width - 6, align: column.align ?? "left" }) + 8
  })
  return Math.max(18, ...heights)
}

function drawDataRow(doc: PDFKit.PDFDocument, y: number, row: KaryawanMasaKerjaReportRow, rowIndex: number): number {
  const cells = columns.map((column) => column.render(row))
  const rowHeight = getDataRowHeight(doc, row)

  let x = MARGIN
  doc.save()
  doc.lineWidth(0.35)
  doc.rect(MARGIN, y, CONTENT_W, rowHeight).fill(rowIndex % 2 === 0 ? ODD_ROW_BG : EVEN_ROW_BG)
  doc.strokeColor(GRID_COLOR)
  doc.moveTo(MARGIN, y + rowHeight).lineTo(MARGIN + CONTENT_W, y + rowHeight).stroke()
  doc.moveTo(MARGIN, y).lineTo(MARGIN, y + rowHeight).stroke()
  cells.forEach((cell, cellIndex) => {
    const column = columns[cellIndex]
    doc.font("Helvetica").fontSize(6.5).fillColor(row.aktif && cellIndex === columns.length - 1 ? "#047857" : "#111827")
    doc.text(cell, x + 3, y + 5, {
      width: column.width - 6,
      align: column.align ?? "left",
    })
    x += column.width
    doc.strokeColor(GRID_COLOR).moveTo(x, y).lineTo(x, y + rowHeight).stroke()
  })
  doc.restore()

  return rowHeight
}

export function generateKaryawanMasaKerjaReportPdf(
  rows: KaryawanMasaKerjaReportRow[],
  options: KaryawanMasaKerjaReportPdfOptions = {}
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: MARGIN })
    const chunks: Buffer[] = []
    doc.on("data", (chunk: Buffer) => chunks.push(chunk))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    let y = drawTableHeader(doc, drawHeader(doc, rows, options))

    if (rows.length === 0) {
      drawEmptyRow(doc, y)
      doc.end()
      return
    }

    const grouped = new Map<string, KaryawanMasaKerjaReportRow[]>()
    rows.forEach((row) => {
      const key = row.divisi ?? "Tanpa Divisi"
      const group = grouped.get(key) ?? []
      group.push(row)
      grouped.set(key, group)
    })

    grouped.forEach((groupRows, divisi) => {
      y = ensurePage(doc, y, 17, rows, options)
      y += drawGroupRow(doc, y, divisi, groupRows.length)

      groupRows.forEach((row, rowIndex) => {
        const rowHeight = getDataRowHeight(doc, row)
        y = ensurePage(doc, y, rowHeight, rows, options)
        y += drawDataRow(doc, y, row, rowIndex)
      })
    })

    doc.end()
  })
}
