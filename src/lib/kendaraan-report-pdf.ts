import PDFDocument from "pdfkit"
import type { data_r2r4s } from "@prisma/client"
import type { KendaraanReportFilters } from "@/lib/kendaraan-report"

type KendaraanReportRow = Pick<data_r2r4s,
  "kode_brg" | "jns_brg" | "plat" | "nm_brg" | "thn" | "pajak" | "stnk" |
  "pemegang" | "departemen" | "stat" | "hrg_sewa"
>

const MARGIN = 24
const FONT_SIZE = 7
const PADDING = 4
const columns = [
  { title: "No", width: 24, align: "center" },
  { title: "Kode", width: 52, align: "center" },
  { title: "Jenis", width: 64, align: "center" },
  { title: "Plat", width: 62, align: "center" },
  { title: "Nama Barang", width: 118, align: "left" },
  { title: "Tahun", width: 32, align: "center" },
  { title: "Pajak", width: 56, align: "center" },
  { title: "STNK", width: 56, align: "center" },
  { title: "Pemegang", width: 90, align: "left" },
  { title: "Departemen", width: 80, align: "left" },
  { title: "Status", width: 84, align: "center" },
  { title: "Harga Sewa", width: 76, align: "right" },
] as const
const CONTENT_WIDTH = columns.reduce((sum, column) => sum + column.width, 0)

function formatDate(value: Date | null): string {
  if (!value) return "-"
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Makassar",
  }).format(value)
}

export function generateKendaraanReportPdf(
  rows: KendaraanReportRow[],
  filters: KendaraanReportFilters,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: MARGIN })
    const chunks: Buffer[] = []
    doc.on("data", (chunk: Buffer) => chunks.push(chunk))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    const filterParts = [
      filters.jns_brg ? `Jenis: ${filters.jns_brg}` : "",
      filters.stat ? `Status: ${filters.stat}` : "",
    ].filter(Boolean)
    const printedAt = new Date().toLocaleString("id-ID", { timeZone: "Asia/Makassar" })

    const drawCells = (cells: string[], y: number, height: number, bold = false) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(FONT_SIZE)
      let x = MARGIN
      columns.forEach((column, index) => {
        doc.rect(x, y, column.width, height).lineWidth(0.5)
        if (bold) doc.fillAndStroke("#e5e7eb", "#111827")
        else doc.stroke("#111827")
        doc.fillColor("#111827").text(cells[index], x + PADDING, y + PADDING, {
          width: column.width - PADDING * 2,
          height: height - PADDING * 2,
          align: bold ? "center" : column.align,
        })
        x += column.width
      })
    }

    const drawHeader = () => {
      let y = MARGIN
      doc.font("Helvetica-Bold").fontSize(13).fillColor("#111827")
      doc.text("LAPORAN PENDATAAN KENDARAAN (R2 & R4)", MARGIN, y, { width: CONTENT_WIDTH, align: "center" })
      y += 20
      doc.fontSize(11).text("KOPERASI KONSUMEN PEDAMI", MARGIN, y, { width: CONTENT_WIDTH, align: "center" })
      y += 18
      doc.font("Helvetica").fontSize(8)
      doc.text(filterParts.length ? `Filter: ${filterParts.join(" | ")}` : "Semua Data", MARGIN, y, { width: CONTENT_WIDTH, align: "center" })
      y = doc.y + 4
      doc.text(`Dicetak pada: ${printedAt}`, MARGIN, y, { width: CONTENT_WIDTH, align: "center" })
      y = doc.y + 10
      drawCells(columns.map(column => column.title), y, 22, true)
      return y + 22
    }

    let y = drawHeader()
    const ensureSpace = (height: number) => {
      if (y + height > doc.page.height - MARGIN) {
        doc.addPage()
        y = drawHeader()
      }
    }

    rows.forEach((row, index) => {
      const cells = [
        String(index + 1), row.kode_brg, row.jns_brg, row.plat, row.nm_brg,
        String(row.thn ?? "-"), formatDate(row.pajak), formatDate(row.stnk),
        row.pemegang ?? "-", row.departemen ?? "-", row.stat ?? "-",
        `Rp. ${(row.hrg_sewa ?? 0).toLocaleString("id-ID")}`,
      ]
      doc.font("Helvetica").fontSize(FONT_SIZE)
      const height = Math.max(22, ...cells.map((cell, i) => doc.heightOfString(cell, {
        width: columns[i].width - PADDING * 2,
      }) + PADDING * 2))
      ensureSpace(height)
      drawCells(cells, y, height)
      y += height
    })

    ensureSpace(26)
    const total = rows.reduce((sum, row) => sum + (row.hrg_sewa ?? 0), 0)
    const totalWidth = CONTENT_WIDTH - columns[columns.length - 1].width
    doc.rect(MARGIN, y, totalWidth, 26).fillAndStroke("#e5e7eb", "#111827")
    doc.font("Helvetica-Bold").fontSize(FONT_SIZE).fillColor("#111827")
    doc.text(`Total Nilai Kendaraan (${rows.length} unit):`, MARGIN + PADDING, y + 8, { width: totalWidth - PADDING * 2, align: "right" })
    doc.rect(MARGIN + totalWidth, y, CONTENT_WIDTH - totalWidth, 26).fillAndStroke("#e5e7eb", "#111827")
    doc.fillColor("#111827").text(`Rp. ${total.toLocaleString("id-ID")}`, MARGIN + totalWidth + PADDING, y + 8, {
      width: CONTENT_WIDTH - totalWidth - PADDING * 2, align: "right",
    })
    doc.end()
  })
}
