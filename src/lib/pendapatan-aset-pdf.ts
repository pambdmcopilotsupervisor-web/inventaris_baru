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
const MONTH_SHORT: Record<number, string> = {
  1: "Jan", 2: "Feb", 3: "Mar", 4: "Apr", 5: "Mei", 6: "Jun",
  7: "Jul", 8: "Agu", 9: "Sep", 10: "Okt", 11: "Nov", 12: "Des",
}
const SPARKLINE_COLORS: Record<string, string> = {
  "Tagihan sewa kendaraan Roda Dua (R2)": "#0ea5e9",
  "Tagihan sewa kendaraan Roda Empat (R4)": "#1E40AF",
  "Penjualan Kendaraan": "#f59e0b",
  "Unit Roda Dua (R2)": "#f59e0b",
  "Unit Roda Empat (R4)": "#7c3aed",
  "TOTAL PENDAPATAN": "#16a34a",
  "TOTAL JUMLAH UNIT": "#7c3aed",
}

interface PendapatanAsetPdfOptions {
  printedBy?: string | null
}

const rupiahAccountingFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  currencyDisplay: "symbol",
  currencySign: "accounting",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

function fmtRupiahAccounting(value: number): string {
  return rupiahAccountingFormatter.format(Number(value) || 0).replace(/\u00A0/g, " ")
}

function fmtTableAmount(value: number): string {
  if (!value) return "-"
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(value)
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
        `${label} mengalami ${status} sebesar ${fmtRupiahAccounting(Math.abs(delta))} dari ${(monthLabels[prevMonth!] ?? "").toUpperCase()} ke ${(monthLabels[month] ?? "").toUpperCase()}`
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
  rightAlignColumns: number[] = [],
): number {
  let y = ensurePage(doc, yStart, 40)
  const dense = headers.length > 10
  const headerH = dense ? 16 : 18
  const rowH = dense ? 16 : 18
  const headerFontSize = dense ? 6.2 : 7.5
  const bodyFontSize = dense ? 6.2 : 7.5

  doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f172a").text(title, MARGIN, y)
  y += 16

  let x = MARGIN
  doc.font("Helvetica-Bold").fontSize(headerFontSize).fillColor("#334155")
  headers.forEach((header, index) => {
    doc.rect(x, y, colWidths[index], headerH).fillAndStroke("#e5e7eb", "#94a3b8")
    doc.fillColor("#334155").text(header, x + 2, y + 4, { width: colWidths[index] - 4, align: "center" })
    x += colWidths[index]
  })
  y += headerH

  for (const row of rows) {
    y = ensurePage(doc, y, rowH + 2)
    x = MARGIN
    row.forEach((cell, index) => {
      doc.rect(x, y, colWidths[index], rowH).strokeColor("#cbd5e1").stroke()
      const isNumber = typeof cell === "number"
      const alignRight = isNumber || rightAlignColumns.includes(index)
      doc.font("Helvetica").fontSize(bodyFontSize).fillColor("#0f172a").text(String(cell), x + 2, y + 4, {
        width: colWidths[index] - 4,
        align: alignRight ? "right" : index === 0 ? "center" : "left",
      })
      x += colWidths[index]
    })
    y += rowH
  }

  return y + 12
}

function buildSparklinePoints(values: number[], x: number, y: number, width: number, height: number): Array<[number, number]> {
  if (values.length === 0) return []

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min

  if (values.length === 1) return [[x, y + height / 2]]

  return values.map((value, index) => {
    const pointX = x + (index / Math.max(values.length - 1, 1)) * width
    const pointY = range === 0
      ? y + height / 2
      : y + height - (((value - min) / range) * (height - 6)) - 3
    return [pointX, pointY]
  })
}

function drawSparkline(
  doc: PDFKit.PDFDocument,
  values: number[],
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
) {
  const points = buildSparklinePoints(values, x, y, width, height)
  if (points.length === 0) return

  doc.save()
  doc.roundedRect(x, y, width, height, 3).fillColor("#f8fafc").fill()
  doc.moveTo(x, y + height - 2).lineTo(x + width, y + height - 2).strokeColor("#e2e8f0").lineWidth(0.4).stroke()
  doc.strokeColor(color).lineWidth(1.7)
  points.forEach(([pointX, pointY], index) => {
    if (index === 0) doc.moveTo(pointX, pointY)
    else doc.lineTo(pointX, pointY)
  })
  doc.stroke()

  points.forEach(([pointX, pointY]) => {
    doc.circle(pointX, pointY, 1.4).fillColor("#ffffff").fillAndStroke("#ffffff", color)
  })
  doc.restore()
}

function drawSparklineCard(
  doc: PDFKit.PDFDocument,
  title: string,
  rows: Array<{ label: string; values: number[]; total: string; color: string }>,
  labels: string[],
  x: number,
  y: number,
  width: number,
): number {
  const pad = 8
  const headerH = 18
  const rowH = 31
  const labelW = width * 0.34
  const totalW = width * 0.2
  const sparkW = width - pad * 2 - labelW - totalW - 14
  const boxH = headerH + rows.length * rowH + 24

  doc.roundedRect(x, y, width, boxH, 4).strokeColor("#cbd5e1").lineWidth(0.7).stroke()
  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(8.5).text(title, x + pad, y + 8, { width: width - pad * 2 })

  let rowY = y + headerH + 6
  rows.forEach((row, index) => {
    if (index > 0) {
      doc.moveTo(x + pad, rowY - 4).lineTo(x + width - pad, rowY - 4).strokeColor("#e2e8f0").lineWidth(0.4).stroke()
    }
    doc.fillColor(row.color).font("Helvetica-Bold").fontSize(6.7).text(row.label, x + pad, rowY + 4, { width: labelW })
    drawSparkline(doc, row.values, x + pad + labelW + 8, rowY, sparkW, 20, row.color)
    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(6.7).text(row.total, x + width - pad - totalW, rowY + 5, { width: totalW, align: "right" })
    rowY += rowH
  })

  doc.fillColor("#64748b").font("Helvetica").fontSize(5.5)
  labels.forEach((label, index) => {
    const labelX = x + pad + labelW + 8 + (index / Math.max(labels.length - 1, 1)) * sparkW
    doc.text(label, labelX - 9, y + boxH - 12, { width: 18, align: "center" })
  })

  return boxH
}

function drawChartSection(doc: PDFKit.PDFDocument, yStart: number, data: PendapatanAsetReportData): number {
  const incomeTotals = data.months.map((month) => data.incomeTotalsByMonth[month] ?? 0)
  const unitTotals = data.months.map((month) => data.unitRows.reduce((sum, row) => sum + (row.months[month] ?? 0), 0))
  const labels = data.months.map((month) => MONTH_SHORT[month] ?? data.monthLabels[month] ?? String(month))
  const boxW = (CONTENT_W - 12) / 2
  const incomeRows = [
    ...data.incomeRows.map((row) => ({
      label: row.label,
      values: data.months.map((month) => row.months[month] ?? 0),
      total: fmtTableAmount(row.total),
      color: SPARKLINE_COLORS[row.label] ?? "#0ea5e9",
    })),
    {
      label: "TOTAL PENDAPATAN",
      values: incomeTotals,
      total: fmtTableAmount(data.grandTotal),
      color: SPARKLINE_COLORS["TOTAL PENDAPATAN"],
    },
  ]
  const unitRows = [
    ...data.unitRows.map((row) => ({
      label: row.label,
      values: data.months.map((month) => row.months[month] ?? 0),
      total: fmtTableAmount(row.total),
      color: SPARKLINE_COLORS[row.label] ?? "#f59e0b",
    })),
    {
      label: "TOTAL JUMLAH UNIT",
      values: unitTotals,
      total: fmtTableAmount(unitTotals.reduce((sum, value) => sum + value, 0)),
      color: SPARKLINE_COLORS["TOTAL JUMLAH UNIT"],
    },
  ]
  const sectionH = 16 + Math.max(18 + incomeRows.length * 31 + 24, 18 + unitRows.length * 31 + 24) + 14
  let y = ensurePage(doc, yStart, sectionH)

  doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f172a").text("Grafik Sparkline", MARGIN, y)
  y += 16
  const incomeH = drawSparklineCard(
    doc,
    "Pendapatan",
    incomeRows,
    labels,
    MARGIN,
    y,
    boxW,
  )
  const unitH = drawSparklineCard(
    doc,
    "Jumlah Unit Aktif",
    unitRows,
    labels,
    MARGIN + boxW + 12,
    y,
    boxW,
  )

  return y + Math.max(incomeH, unitH) + 14
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

    const monthHeaders = data.months.map((month) => data.months.length > 6 ? MONTH_SHORT[month] : data.monthLabels[month])
    const noW = 24
    const labelW = data.months.length > 6 ? 132 : 190
    const totalW = data.months.length > 6 ? 82 : 90
    const monthW = (CONTENT_W - noW - labelW - totalW) / Math.max(data.months.length, 1)
    const tableWidths = [noW, labelW, ...data.months.map(() => monthW), totalW]

    const incomeHeaders = ["No", "Jenis Pendapatan", ...monthHeaders, "Total"]
    const incomeRows = data.incomeRows.map((row, index) => ([
      index + 1,
      row.label,
      ...data.months.map((month) => fmtTableAmount(row.months[month] ?? 0)),
      fmtTableAmount(row.total),
    ]))
    incomeRows.push([
      "",
      "TOTAL PENDAPATAN",
      ...data.months.map((month) => fmtTableAmount(data.incomeTotalsByMonth[month] ?? 0)),
      fmtTableAmount(data.grandTotal),
    ])
    y = drawSimpleTable(
      doc,
      y,
      "Tabel Pendapatan",
      incomeHeaders,
      incomeRows,
      tableWidths,
      Array.from({ length: data.months.length + 1 }, (_, index) => index + 2),
    )

    const unitHeaders = ["No", "Jumlah Unit Aktif", ...monthHeaders, "Total"]
    const unitRows = data.unitRows.map((row, index) => ([
      index + 1,
      row.label,
      ...data.months.map((month) => row.months[month] ?? 0),
      row.total,
    ]))
    y = drawSimpleTable(doc, y, "Jumlah Unit Aktif Tagihan", unitHeaders, unitRows, tableWidths)

    y = drawChartSection(doc, y, data)

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
