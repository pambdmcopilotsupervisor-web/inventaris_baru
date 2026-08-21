import { existsSync } from "fs"
import path from "path"
import PDFDocument from "pdfkit"
import * as XLSX from "xlsx"
import { prisma, serialize } from "@/lib/prisma"
import { formatCurrency } from "@/lib/utils"

const PAGE_W = 841.89
const PAGE_H = 595.28
const MARGIN = 18
const CONTENT_W = PAGE_W - MARGIN * 2
const LOGO_SIZE = 38
const APP_LOGO_PATH = path.join(process.cwd(), "public", "pedami-logo.png")
const HAS_APP_LOGO = existsSync(APP_LOGO_PATH)
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

export interface MutasiKaryawanExportRow {
  no: number
  tgl_mutasi: string | Date
  nik: string
  nama_karyawan: string
  no_sk: string | null
  jabatan_asal: string | null
  divisi_asal: string | null
  subdivisi_asal: string | null
  jabatan_tujuan: string | null
  divisi_tujuan: string | null
  subdivisi_tujuan: string | null
  alasan: string | null
}

export interface PensiunKaryawanExportRow {
  no: number
  tgl_pensiun: string | Date
  nik: string
  nama_karyawan: string
  jenis_pensiun: string
  no_sk: string | null
  jabatan_terakhir: string | null
  divisi_terakhir: string | null
  subdivisi_terakhir: string | null
  pesangon: number
  keterangan: string | null
}

interface PdfOptions {
  printedBy?: string | null
}

interface PdfColumn<T> {
  title: string
  width: number
  align?: "left" | "center" | "right"
  render: (row: T) => string
}

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

function sheetName(name: string): string {
  return name.slice(0, 31)
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

function drawHeader<T>(doc: PDFKit.PDFDocument, title: string, rows: T[], options: PdfOptions): number {
  const y = MARGIN
  drawAppLogo(doc, MARGIN, y, LOGO_SIZE)

  const titleX = MARGIN + LOGO_SIZE + 12
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#000000").text(title, titleX, y, {
    width: CONTENT_W - LOGO_SIZE - 12,
  })
  doc.font("Helvetica-Bold").fontSize(11).text("KOPERASI KONSUMEN PEDAMI", titleX, y + 18, {
    width: CONTENT_W - LOGO_SIZE - 12,
  })
  doc.font("Helvetica").fontSize(8).fillColor("#475569").text(`Total data: ${rows.length}`, titleX, y + 34, {
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

function drawTableHeader<T>(doc: PDFKit.PDFDocument, y: number, columns: PdfColumn<T>[]): number {
  let x = MARGIN
  doc.font("Helvetica-Bold").fontSize(6.5).fillColor("#111827")
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

function ensureRowPage<T>(
  doc: PDFKit.PDFDocument,
  y: number,
  rowHeight: number,
  title: string,
  rows: T[],
  columns: PdfColumn<T>[],
  options: PdfOptions
): number {
  if (y + rowHeight <= PAGE_H - MARGIN) return y
  doc.addPage({ size: "A4", layout: "landscape", margin: MARGIN })
  return drawTableHeader(doc, drawHeader(doc, title, rows, options), columns)
}

function drawRow<T>(doc: PDFKit.PDFDocument, y: number, columns: PdfColumn<T>[], cells: string[], bold = false): number {
  doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(6.5)
  const heights = cells.map((cell, index) => {
    const column = columns[index]
    return doc.heightOfString(cell, { width: column.width - 6, align: column.align ?? "left" }) + 8
  })
  const rowHeight = Math.max(18, ...heights)

  let x = MARGIN
  cells.forEach((cell, index) => {
    const column = columns[index]
    doc.rect(x, y, column.width, rowHeight).strokeColor("#111827").stroke()
    doc.fillColor("#111827").text(cell, x + 3, y + 5, {
      width: column.width - 6,
      align: column.align ?? "left",
    })
    x += column.width
  })

  return rowHeight
}

function generateTablePdf<T>(title: string, rows: T[], columns: PdfColumn<T>[], options: PdfOptions = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: MARGIN })
    const chunks: Buffer[] = []
    doc.on("data", (chunk: Buffer) => chunks.push(chunk))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    let y = drawTableHeader(doc, drawHeader(doc, title, rows, options), columns)
    rows.forEach((row) => {
      const cells = columns.map((column) => column.render(row))
      const height = Math.max(
        18,
        ...cells.map((cell, index) => {
          const column = columns[index]
          doc.font("Helvetica").fontSize(6.5)
          return doc.heightOfString(cell, { width: column.width - 6, align: column.align ?? "left" }) + 8
        })
      )
      y = ensureRowPage(doc, y, height, title, rows, columns, options)
      y += drawRow(doc, y, columns, cells)
    })

    y = ensureRowPage(doc, y, 18, title, rows, columns, options)
    drawRow(doc, y, columns, columns.map((column, index) => (index === 2 ? `Total: ${rows.length} data` : "")), true)

    doc.end()
  })
}

export async function getMutasiKaryawanExportRows(): Promise<MutasiKaryawanExportRow[]> {
  const [mutasiList, karyawans, divisis, subdivisis] = await Promise.all([
    prisma.mutasi_karyawans.findMany({ orderBy: { tgl_mutasi: "desc" } }),
    prisma.karyawans.findMany({ select: { id: true, nik: true, nama_karyawan: true } }),
    prisma.divisis.findMany({ select: { id: true, nama_divisi: true } }),
    prisma.subdivisis.findMany({ select: { id: true, nama_sub: true } }),
  ])

  const kMap = new Map(karyawans.map((k) => [k.id.toString(), k]))
  const dMap = new Map(divisis.map((d) => [d.id.toString(), d.nama_divisi]))
  const sMap = new Map(subdivisis.map((s) => [s.id.toString(), s.nama_sub]))

  return serialize(
    mutasiList.map((mutasi, index) => {
      const karyawan = kMap.get(mutasi.karyawan_id.toString())
      return {
        no: index + 1,
        tgl_mutasi: mutasi.tgl_mutasi,
        nik: karyawan?.nik ?? "-",
        nama_karyawan: karyawan?.nama_karyawan ?? "-",
        no_sk: mutasi.no_sk,
        jabatan_asal: mutasi.jabatan_asal,
        divisi_asal: mutasi.divisi_asal_id ? dMap.get(mutasi.divisi_asal_id.toString()) ?? null : null,
        subdivisi_asal: mutasi.subdivisi_asal_id ? sMap.get(mutasi.subdivisi_asal_id.toString()) ?? null : null,
        jabatan_tujuan: mutasi.jabatan_tujuan,
        divisi_tujuan: mutasi.divisi_tujuan_id ? dMap.get(mutasi.divisi_tujuan_id.toString()) ?? null : null,
        subdivisi_tujuan: mutasi.subdivisi_tujuan_id ? sMap.get(mutasi.subdivisi_tujuan_id.toString()) ?? null : null,
        alasan: mutasi.alasan,
      }
    })
  )
}

export async function getPensiunKaryawanExportRows(): Promise<PensiunKaryawanExportRow[]> {
  const [pensiunList, karyawans, divisis, subdivisis] = await Promise.all([
    prisma.pensiun_karyawans.findMany({ orderBy: { tgl_pensiun: "desc" } }),
    prisma.karyawans.findMany({ select: { id: true, nik: true, nama_karyawan: true } }),
    prisma.divisis.findMany({ select: { id: true, nama_divisi: true } }),
    prisma.subdivisis.findMany({ select: { id: true, nama_sub: true } }),
  ])

  const kMap = new Map(karyawans.map((k) => [k.id.toString(), k]))
  const dMap = new Map(divisis.map((d) => [d.id.toString(), d.nama_divisi]))
  const sMap = new Map(subdivisis.map((s) => [s.id.toString(), s.nama_sub]))

  return serialize(
    pensiunList.map((pensiun, index) => {
      const karyawan = kMap.get(pensiun.karyawan_id.toString())
      return {
        no: index + 1,
        tgl_pensiun: pensiun.tgl_pensiun,
        nik: karyawan?.nik ?? "-",
        nama_karyawan: karyawan?.nama_karyawan ?? "-",
        jenis_pensiun: pensiun.jenis_pensiun,
        no_sk: pensiun.no_sk,
        jabatan_terakhir: pensiun.jabatan_terakhir,
        divisi_terakhir: pensiun.divisi_terakhir_id ? dMap.get(pensiun.divisi_terakhir_id.toString()) ?? null : null,
        subdivisi_terakhir: pensiun.subdivisi_terakhir_id ? sMap.get(pensiun.subdivisi_terakhir_id.toString()) ?? null : null,
        pesangon: Number(pensiun.pesangon),
        keterangan: pensiun.keterangan,
      }
    })
  )
}

export function generateMutasiKaryawanExcel(rows: MutasiKaryawanExportRow[]): Buffer {
  const aoa: (string | number)[][] = [
    ["LAPORAN MUTASI KARYAWAN"],
    ["No", "Tanggal Mutasi", "NIK", "Nama Karyawan", "No SK", "Jabatan Asal", "Divisi Asal", "Sub Divisi Asal", "Jabatan Baru", "Divisi Baru", "Sub Divisi Baru", "Alasan"],
    ...rows.map((row) => [
      row.no,
      fmtDate(row.tgl_mutasi),
      row.nik,
      row.nama_karyawan,
      text(row.no_sk),
      text(row.jabatan_asal),
      text(row.divisi_asal),
      text(row.subdivisi_asal),
      text(row.jabatan_tujuan),
      text(row.divisi_tujuan),
      text(row.subdivisi_tujuan),
      text(row.alasan),
    ]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 11 } }]
  ws["!cols"] = [
    { wch: 5 }, { wch: 16 }, { wch: 18 }, { wch: 30 }, { wch: 20 }, { wch: 22 },
    { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 36 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName("Mutasi Karyawan"))
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
}

export function generatePensiunKaryawanExcel(rows: PensiunKaryawanExportRow[]): Buffer {
  const aoa: (string | number)[][] = [
    ["LAPORAN PENSIUN KARYAWAN"],
    ["No", "Tanggal Pensiun", "NIK", "Nama Karyawan", "Jenis Pensiun", "No SK", "Jabatan Terakhir", "Divisi Terakhir", "Sub Divisi Terakhir", "Pesangon", "Keterangan"],
    ...rows.map((row) => [
      row.no,
      fmtDate(row.tgl_pensiun),
      row.nik,
      row.nama_karyawan,
      row.jenis_pensiun,
      text(row.no_sk),
      text(row.jabatan_terakhir),
      text(row.divisi_terakhir),
      text(row.subdivisi_terakhir),
      row.pesangon,
      text(row.keterangan),
    ]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 10 } }]
  ws["!cols"] = [
    { wch: 5 }, { wch: 16 }, { wch: 18 }, { wch: 30 }, { wch: 20 }, { wch: 20 },
    { wch: 24 }, { wch: 22 }, { wch: 22 }, { wch: 18 }, { wch: 40 },
  ]
  rows.forEach((_row, index) => {
    const cell = ws[XLSX.utils.encode_cell({ r: index + 2, c: 9 })]
    if (cell && typeof cell.v === "number") cell.z = '"Rp"#,##0'
  })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName("Pensiun Karyawan"))
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
}

export function generateMutasiKaryawanPdf(rows: MutasiKaryawanExportRow[], options: PdfOptions = {}): Promise<Buffer> {
  return generateTablePdf("LAPORAN MUTASI KARYAWAN", rows, [
    { title: "No", width: 28, align: "center", render: (row) => String(row.no) },
    { title: "Tanggal", width: 58, align: "center", render: (row) => fmtDate(row.tgl_mutasi) },
    { title: "NIK", width: 68, render: (row) => row.nik },
    { title: "Nama", width: 112, render: (row) => row.nama_karyawan },
    { title: "No SK", width: 68, render: (row) => text(row.no_sk) },
    { title: "Jabatan Asal", width: 78, render: (row) => text(row.jabatan_asal) },
    { title: "Divisi Asal", width: 74, render: (row) => text(row.divisi_asal) },
    { title: "Jabatan Baru", width: 78, render: (row) => text(row.jabatan_tujuan) },
    { title: "Divisi Baru", width: 74, render: (row) => text(row.divisi_tujuan) },
    { title: "Alasan", width: 167, render: (row) => text(row.alasan) },
  ], options)
}

export function generatePensiunKaryawanPdf(rows: PensiunKaryawanExportRow[], options: PdfOptions = {}): Promise<Buffer> {
  return generateTablePdf("LAPORAN PENSIUN KARYAWAN", rows, [
    { title: "No", width: 28, align: "center", render: (row) => String(row.no) },
    { title: "Tanggal", width: 60, align: "center", render: (row) => fmtDate(row.tgl_pensiun) },
    { title: "NIK", width: 70, render: (row) => row.nik },
    { title: "Nama", width: 120, render: (row) => row.nama_karyawan },
    { title: "Jenis", width: 70, render: (row) => row.jenis_pensiun },
    { title: "Jabatan", width: 90, render: (row) => text(row.jabatan_terakhir) },
    { title: "Divisi", width: 90, render: (row) => text(row.divisi_terakhir) },
    { title: "No SK", width: 70, render: (row) => text(row.no_sk) },
    { title: "Pesangon", width: 85, align: "right", render: (row) => formatCurrency(row.pesangon) },
    { title: "Keterangan", width: 122, render: (row) => text(row.keterangan) },
  ], options)
}

export function xlsxHeaders(filename: string) {
  return {
    "Content-Type": XLSX_MIME,
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  }
}

export function pdfHeaders(filename: string) {
  return {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  }
}
