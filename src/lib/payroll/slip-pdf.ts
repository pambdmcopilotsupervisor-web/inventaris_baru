import PDFDocument from "pdfkit"
import type { SlipData, SlipDetailLine } from "@/lib/payroll/slip-data"

const PAGE_W = 595.28
const MARGIN = 40
const CONTENT_W = PAGE_W - MARGIN * 2

function fmtRp(n: number): string {
  return "Rp " + Math.round(n).toLocaleString("id-ID")
}

/** Generate PDF slip gaji (A4 portrait) dari snapshot. */
export function generateSlipPdf(data: SlipData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true })
    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    let y = MARGIN

    // ── Header ──
    doc.roundedRect(MARGIN, y, 46, 46, 6).fillColor("#166534").fill()
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(13).text("PDM", MARGIN, y + 16, { width: 46, align: "center" })

    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(16).text("SLIP GAJI", MARGIN + 58, y + 4, { width: CONTENT_W - 58 })
    doc.fillColor("#334155").font("Helvetica").fontSize(9).text("Koperasi Konsumen Pedami", MARGIN + 58, y + 25, { width: CONTENT_W - 58 })
    doc.fillColor("#64748b").fontSize(8).text(`Periode: ${data.period.label}`, MARGIN + 58, y + 38, { width: CONTENT_W - 58 })

    doc.fillColor("#64748b").fontSize(8).text(`No: ${data.slip_number}`, MARGIN, y + 4, { width: CONTENT_W, align: "right" })
    doc.text(`Status: ${data.status}`, MARGIN, y + 16, { width: CONTENT_W, align: "right" })
    doc.text(data.period.range_label, MARGIN, y + 28, { width: CONTENT_W, align: "right" })

    y += 56
    doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor("#166534").lineWidth(1.5).stroke()
    y += 12

    // ── Section Karyawan ──
    const infoPairs: [string, string][] = [
      ["Nama", data.employee.nama],
      ["NIP / NIK", data.employee.nik],
      ["Jabatan", data.employee.jabatan],
      ["Departemen", data.employee.department],
    ]
    const colW = CONTENT_W / 2
    infoPairs.forEach((pair, i) => {
      const col = i % 2
      const row = Math.floor(i / 2)
      const px = MARGIN + col * colW
      const py = y + row * 16
      doc.font("Helvetica").fontSize(8).fillColor("#64748b").text(pair[0], px, py, { width: 70, continued: false })
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#0f172a").text(pair[1], px + 74, py, { width: colW - 78 })
    })
    y += 16 * Math.ceil(infoPairs.length / 2) + 10

    // ── Tabel helper ──
    const drawSectionTable = (title: string, lines: SlipDetailLine[], totalLabel: string, total: number, accent: string) => {
      doc.font("Helvetica-Bold").fontSize(10).fillColor(accent).text(title, MARGIN, y)
      y += 16
      // header row
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#475569")
      doc.text("No", MARGIN + 4, y, { width: 24 })
      doc.text("Komponen", MARGIN + 32, y, { width: CONTENT_W - 32 - 110 })
      doc.text("Jumlah", MARGIN, y, { width: CONTENT_W - 6, align: "right" })
      y += 12
      doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor("#e2e8f0").lineWidth(0.5).stroke()
      y += 4

      doc.font("Helvetica").fontSize(9).fillColor("#0f172a")
      if (lines.length === 0) {
        doc.fillColor("#94a3b8").text("—", MARGIN + 32, y)
        y += 14
      }
      for (const l of lines) {
        if (y > 760) { doc.addPage(); y = MARGIN }
        const label = l.notes && l.category === "ATTENDANCE_DEDUCTION" ? `${l.component_name}` : l.component_name
        doc.fillColor("#0f172a").font("Helvetica").fontSize(9)
        doc.text(String(l.no), MARGIN + 4, y, { width: 24 })
        doc.text(label, MARGIN + 32, y, { width: CONTENT_W - 32 - 110 })
        doc.text(fmtRp(l.amount), MARGIN, y, { width: CONTENT_W - 6, align: "right" })
        y += 14
      }
      doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor("#e2e8f0").lineWidth(0.5).stroke()
      y += 4
      doc.font("Helvetica-Bold").fontSize(9).fillColor(accent)
      doc.text(totalLabel, MARGIN + 32, y, { width: CONTENT_W - 32 - 110 })
      doc.text(fmtRp(total), MARGIN, y, { width: CONTENT_W - 6, align: "right" })
      y += 20
    }

    drawSectionTable("PENDAPATAN", data.earnings, "TOTAL PENDAPATAN", data.total_earnings, "#166534")
    drawSectionTable("POTONGAN", data.deductions, "TOTAL POTONGAN", data.total_deductions, "#b91c1c")

    // ── Section Kehadiran ──
    if (y > 700) { doc.addPage(); y = MARGIN }
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f172a").text("KEHADIRAN", MARGIN, y)
    y += 16
    const att = data.attendance
    const attCols: [string, number][] = [
      ["Hari Kerja", att.working_days], ["Hadir", att.hadir], ["Alfa", att.alfa],
      ["Terlambat", att.terlambat], ["Ijin", att.ijin], ["Sakit", att.sakit],
    ]
    const cw = CONTENT_W / attCols.length
    attCols.forEach((c, i) => {
      const px = MARGIN + i * cw
      doc.rect(px, y, cw, 36).strokeColor("#e2e8f0").lineWidth(0.5).stroke()
      doc.font("Helvetica").fontSize(7.5).fillColor("#64748b").text(c[0], px, y + 6, { width: cw, align: "center" })
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#0f172a").text(String(c[1]), px, y + 18, { width: cw, align: "center" })
    })
    y += 50

    // ── Footer: Gaji Bersih ──
    doc.rect(MARGIN, y, CONTENT_W, 40).fillColor("#166534").fill()
    doc.fillColor("#bbf7d0").font("Helvetica").fontSize(9).text("GAJI BERSIH", MARGIN + 12, y + 8)
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(16).text(fmtRp(data.net_salary), MARGIN, y + 6, { width: CONTENT_W - 12, align: "right" })
    doc.fillColor("#dcfce7").font("Helvetica-Oblique").fontSize(8).text(`Terbilang: ${data.net_salary_terbilang}`, MARGIN + 12, y + 26, { width: CONTENT_W - 24 })
    y += 56

    // ── Catatan: metode pajak & prorata ──
    const notes: string[] = []
    if (data.meta?.run_type && data.meta.run_type !== "REGULER") notes.push(`Jenis: ${data.meta.run_type}`)
    if (data.meta?.tax_method) notes.push(`Metode PPh21: ${data.meta.tax_method}`)
    if (data.meta?.prorata_note) notes.push(data.meta.prorata_note)
    if (notes.length > 0) {
      doc.fillColor("#64748b").font("Helvetica-Oblique").fontSize(7.5).text(notes.join("  •  "), MARGIN, y, { width: CONTENT_W })
      y += 16
    }

    // ── Tanda tangan ──
    const sigW = CONTENT_W / 2
    doc.font("Helvetica").fontSize(8).fillColor("#64748b")
    doc.text("Diterima oleh,", MARGIN, y, { width: sigW, align: "center" })
    doc.text("Disetujui oleh,", MARGIN + sigW, y, { width: sigW, align: "center" })
    y += 50
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#0f172a")
    doc.text(`( ${data.employee.nama} )`, MARGIN, y, { width: sigW, align: "center" })
    doc.text("( Bagian Keuangan )", MARGIN + sigW, y, { width: sigW, align: "center" })

    doc.end()
  })
}
