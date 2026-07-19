import { existsSync } from "fs"
import path from "path"
import PDFDocument from "pdfkit"
import type { ActiveVehicleEntry, PendapatanAsetReportData, VehicleTrendChange } from "@/lib/pendapatan-aset-report"

const PAGE_W = 841.89
const PAGE_H = 595.28
const MARGIN = 28
const CONTENT_W = PAGE_W - MARGIN * 2
const LOGO_SIZE = 42
const APP_LOGO_PATH = path.join(process.cwd(), "public", "pedami-logo.png")
const HAS_APP_LOGO = existsSync(APP_LOGO_PATH)

interface PendapatanAsetPdfOptions {
  printedBy?: string | null
}

function fmtNumber(value: number): string {
  return value.toLocaleString("id-ID")
}

function buildNotes(
  label: string,
  months: Record<number, number>,
  monthLabels: Record<number, string>,
  vehicleTrend: Record<number, VehicleTrendChange>,
  periodLabel: string,
): string[] {
  const notes: string[] = []
  const monthNums = Object.keys(months).map(Number)
  let prevValue: number | null = null
  let prevMonth: number | null = null

  for (const month of monthNums) {
    const value = months[month] ?? 0
    if (prevValue !== null && value !== prevValue) {
      const delta = value - prevValue
      const status = delta > 0 ? "kenaikan" : "penurunan"
      const trend = vehicleTrend[month] ?? { added: [], removed: [] }
      const detail: string[] = []

      if (status === "kenaikan" && trend.added.length > 0) {
        detail.push(`kendaraan bertambah: ${trend.added.map(formatVehicle).join("; ")}`)
      }
      if (status === "penurunan" && trend.removed.length > 0) {
        detail.push(`kendaraan berkurang: ${trend.removed.map(formatVehicle).join("; ")}`)
      }

      notes.push(
        `${label} mengalami ${status} sebesar Rp ${fmtNumber(Math.abs(delta))} dari ${(monthLabels[prevMonth!] ?? "").toUpperCase()} ke ${(monthLabels[month] ?? "").toUpperCase()}`
        + (detail.length > 0 ? ` dengan ${detail.join(" | ")}` : "")
        + ".",
      )
    }

    prevValue = value
    prevMonth = month
  }

  if (notes.length === 0) notes.push(`${label} cenderung stabil pada periode ${periodLabel}.`)
  return notes
}

function formatVehicle(vehicle: ActiveVehicleEntry): string {
  return `${vehicle.kode ?? "-"} / ${vehicle.plat ?? "-"} / ${vehicle.nama ?? "-"} / ${vehicle.pemegang ?? "-"} / ${vehicle.departemen ?? "-"}`
}

function ensurePage(doc: PDFKit.PDFDocument, y: number, needed = 24): number {
  if (y + needed <= PAGE_H - MARGIN) return y
  doc.addPage({ size: "A4", layout: "landscape", margin: MARGIN })
  return MARGIN
}

function drawAppLogo(doc: PDFKit.PDFDocument, x: number, y: number, size: number) {
  if (!HAS_APP_LOGO) return

  doc.roundedRect(x, y, size, size, 6).fillColor("#ffffff").fill()
  doc.save()
  doc.roundedRect(x, y, size, size, 6).clip()
  doc.image(APP_LOGO_PATH, x, y, {
    cover: [size, size],
    align: "center",
    valign: "center",
  })
  doc.restore()
  doc.roundedRect(x, y, size, size, 6).strokeColor("#cbd5e1").lineWidth(0.8).stroke()
}

function drawSimpleTable(
  doc: PDFKit.PDFDocument,
  yStart: number,
  title: string,
  headers: string[],
  rows: Array<Array<string | number>>,
  colWidths: number[],
): number {
  let y = ensurePage(doc, yStart, 40)
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f172a").text(title, MARGIN, y)
  y += 16

  let x = MARGIN
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#334155")
  headers.forEach((header, index) => {
    doc.rect(x, y, colWidths[index], 18).fillAndStroke("#e5e7eb", "#94a3b8")
    doc.fillColor("#334155").text(header, x + 3, y + 5, { width: colWidths[index] - 6, align: "center" })
    x += colWidths[index]
  })
  y += 18

  for (const row of rows) {
    y = ensurePage(doc, y, 20)
    x = MARGIN
    row.forEach((cell, index) => {
      doc.rect(x, y, colWidths[index], 18).strokeColor("#cbd5e1").stroke()
      const isNumber = typeof cell === "number"
      doc.font("Helvetica").fontSize(7.5).fillColor("#0f172a").text(String(cell), x + 3, y + 5, {
        width: colWidths[index] - 6,
        align: isNumber ? "right" : index === 0 ? "center" : "left",
      })
      x += colWidths[index]
    })
    y += 18
  }

  return y + 12
}

function measureNoteGroup(doc: PDFKit.PDFDocument, title: string, notes: string[], width: number): number {
  doc.font("Helvetica-Bold").fontSize(8)
  const titleH = Math.max(10, doc.heightOfString(title, { width }))

  doc.font("Helvetica").fontSize(7.5)
  const notesH = notes.reduce((height, note) => {
    return height + doc.heightOfString(`• ${note}`, { width }) + 2
  }, 0)

  return titleH + notesH
}

function drawNoteGroup(
  doc: PDFKit.PDFDocument,
  title: string,
  notes: string[],
  x: number,
  y: number,
  width: number,
): number {
  doc.fillColor("#92400e").font("Helvetica-Bold").fontSize(8).text(title, x, y, { width })
  y += Math.max(10, doc.heightOfString(title, { width }))

  doc.font("Helvetica").fontSize(7.5)
  notes.forEach((note) => {
    doc.fillColor("#92400e").text(`• ${note}`, x + 4, y, { width: width - 4 })
    y = doc.y + 2
  })

  return y
}

export function generatePendapatanAsetPdf(data: PendapatanAsetReportData, options: PendapatanAsetPdfOptions = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: MARGIN })
    const chunks: Buffer[] = []
    doc.on("data", (chunk: Buffer) => chunks.push(chunk))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    let y = MARGIN
    drawAppLogo(doc, MARGIN, y, LOGO_SIZE)
    const titleX = MARGIN + LOGO_SIZE + 12
    const titleWidth = CONTENT_W - LOGO_SIZE - 12
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#0f172a").text("LAPORAN PENDAPATAN ASET", titleX, y + 2, { width: titleWidth })
    doc.font("Helvetica-Bold").fontSize(11).text("KOPERASI KONSUMEN PEDAMI", titleX, y + 20, { width: titleWidth })
    doc.font("Helvetica").fontSize(8).fillColor("#475569").text(`Periode: ${data.periodLabel}`, titleX, y + 36, { width: titleWidth })
    y += LOGO_SIZE + 8
    doc.font("Helvetica").fontSize(8).fillColor("#475569")
    doc.text(`Dicetak pada: ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Makassar" })}`, MARGIN, y, { width: CONTENT_W, align: "left" })
    doc.text(`Dicetak oleh: ${options.printedBy ?? "Sistem"}`, MARGIN, y, { width: CONTENT_W, align: "right" })
    y += 16

    const incomeHeaders = ["No", "Jenis Pendapatan", ...data.months.map((month) => data.monthLabels[month]), "Total"]
    const incomeRows = data.incomeRows.map((row, index) => ([
      index + 1,
      row.label,
      ...data.months.map((month) => row.months[month] ?? 0),
      row.total,
    ]))
    incomeRows.push([
      "",
      "TOTAL PENDAPATAN",
      ...data.months.map((month) => data.incomeTotalsByMonth[month] ?? 0),
      data.grandTotal,
    ])
    y = drawSimpleTable(doc, y, "Tabel Pendapatan", incomeHeaders, incomeRows, [28, 190, ...data.months.map(() => 72), 90])

    const unitHeaders = ["No", "Jumlah Unit Aktif", ...data.months.map((month) => data.monthLabels[month]), "Total"]
    const unitRows = data.unitRows.map((row, index) => ([
      index + 1,
      row.label,
      ...data.months.map((month) => row.months[month] ?? 0),
      row.total,
    ]))
    y = drawSimpleTable(doc, y, "Jumlah Unit Aktif Tagihan", unitHeaders, unitRows, [28, 190, ...data.months.map(() => 72), 90])

    const roda2Notes = buildNotes("Pendapatan kendaraan roda dua", data.incomeRows[0]?.months ?? {}, data.monthLabels, data.vehicleTrendDetails.r2, data.periodLabel)
    const roda4Notes = buildNotes("Pendapatan kendaraan roda empat", data.incomeRows[1]?.months ?? {}, data.monthLabels, data.vehicleTrendDetails.r4, data.periodLabel)

    const noteContentX = MARGIN + 10
    const noteContentW = CONTENT_W - 20
    const noteTitleH = 12
    const noteBoxH = 10
      + noteTitleH
      + 6
      + measureNoteGroup(doc, "Roda Dua (R2)", roda2Notes, noteContentW)
      + 6
      + measureNoteGroup(doc, "Roda Empat (R4)", roda4Notes, noteContentW)
      + 10

    y = ensurePage(doc, y, noteBoxH)
    doc.roundedRect(MARGIN, y, CONTENT_W, noteBoxH, 8).fillAndStroke("#fffbeb", "#f59e0b")
    doc.fillColor("#92400e").font("Helvetica-Bold").fontSize(10).text("Catatan", noteContentX, y + 10, { width: noteContentW })

    let noteY = y + 10 + noteTitleH + 6
    noteY = drawNoteGroup(doc, "Roda Dua (R2)", roda2Notes, noteContentX, noteY, noteContentW)
    noteY += 6
    drawNoteGroup(doc, "Roda Empat (R4)", roda4Notes, noteContentX, noteY, noteContentW)

    doc.end()
  })
}
