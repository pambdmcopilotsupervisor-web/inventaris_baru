import { existsSync } from "fs"
import path from "path"
import PDFDocument from "pdfkit"
import { readServiceBuktiFile } from "@/lib/service-bukti-file"

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 44
const CONTENT_W = PAGE_W - MARGIN * 2
const LOGO_SIZE = 44
const APP_LOGO_PATH = path.join(process.cwd(), "public", "pedami-logo.png")
const HAS_APP_LOGO = existsSync(APP_LOGO_PATH)

export interface DisposalPdfData {
  id: number
  nomor: string | null
  tgl_pengajuan: Date | string
  kondisi: string | null
  keterangan: string | null
  gambar: string | null
  dibuat_oleh_nm: string | null
  manager_nm: string | null
  bendahara_nm: string | null
  ketua_nm: string | null
  tgl_verif_manager: Date | string | null
  tgl_verif_bendahara: Date | string | null
  tgl_verif_ketua: Date | string | null
  verif_manager: number | null
  verif_bendahara: number | null
  verif_ketua: number | null
  asset: {
    id: number
    kode_asset: string
    nama_asset: string
    kelompok_asset: string
    status_barang: string
    gambar: string | null
    hrg_beli: number | null
    tgl_beli: Date | string | null
    nama_ruangan: string | null
    lokasi: string | null
    nama_pj: string | null
    nama_pemakai: string | null
  }
}

export interface DisposalPdfOptions {
  printedBy?: string | null
}

function fmtDate(value: Date | string | null | undefined): string {
  if (!value) return "-"
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Makassar",
  }).format(new Date(value))
}

function fmtDateTime(value: Date | string | null | undefined): string {
  if (!value) return "-"
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Makassar",
  }).format(new Date(value))
}

function fmtCurrency(value: number | null | undefined): string {
  if (value == null) return "-"
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(value)
}

function statusText(data: DisposalPdfData): string {
  if (data.verif_ketua === 1 || data.verif_bendahara === 1) return "Disetujui"
  if (data.verif_manager === 1) return "Menunggu Pengurus"
  return "Menunggu Manager"
}

function drawLogo(doc: PDFKit.PDFDocument, x: number, y: number) {
  if (!HAS_APP_LOGO) {
    doc.roundedRect(x, y, LOGO_SIZE, LOGO_SIZE, 6).fillColor("#166534").fill()
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(13).text("PDM", x, y + 15, { width: LOGO_SIZE, align: "center" })
    return
  }

  doc.save()
  doc.roundedRect(x, y, LOGO_SIZE, LOGO_SIZE, 6).clip()
  doc.image(APP_LOGO_PATH, x, y, { cover: [LOGO_SIZE, LOGO_SIZE], align: "center", valign: "center" })
  doc.restore()
}

function drawHeader(doc: PDFKit.PDFDocument, data: DisposalPdfData, options: DisposalPdfOptions): number {
  const y = MARGIN
  drawLogo(doc, MARGIN, y)

  const textX = MARGIN + LOGO_SIZE + 12
  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(15).text("PERMOHONAN DISPOSAL ASET", textX, y + 1, { width: CONTENT_W - LOGO_SIZE - 12 })
  doc.fontSize(11).text("KOPERASI KONSUMEN PEDAMI", textX, y + 20, { width: CONTENT_W - LOGO_SIZE - 12 })
  doc.font("Helvetica").fontSize(8).fillColor("#475569").text(`No. Surat: ${data.nomor ?? "-"}`, textX, y + 37, { width: CONTENT_W - LOGO_SIZE - 12 })

  const metaY = y + LOGO_SIZE + 10
  doc.font("Helvetica").fontSize(8).fillColor("#64748b")
  doc.text(`Dicetak pada: ${fmtDateTime(new Date())}`, MARGIN, metaY, { width: CONTENT_W / 2 })
  doc.text(`Dicetak oleh: ${options.printedBy ?? "Sistem"}`, MARGIN, metaY, { width: CONTENT_W, align: "right" })
  doc.moveTo(MARGIN, metaY + 16).lineTo(PAGE_W - MARGIN, metaY + 16).strokeColor("#cbd5e1").lineWidth(0.8).stroke()
  return metaY + 28
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string, y: number): number {
  doc.fillColor("#166534").font("Helvetica-Bold").fontSize(10).text(title, MARGIN, y)
  doc.moveTo(MARGIN, y + 14).lineTo(PAGE_W - MARGIN, y + 14).strokeColor("#bbf7d0").lineWidth(0.8).stroke()
  return y + 22
}

function drawInfoGrid(doc: PDFKit.PDFDocument, y: number, rows: Array<[string, string]>): number {
  const colW = (CONTENT_W - 12) / 2
  const rowH = 34

  rows.forEach(([label, value], index) => {
    const col = index % 2
    const row = Math.floor(index / 2)
    const x = MARGIN + col * (colW + 12)
    const yy = y + row * rowH
    doc.roundedRect(x, yy, colW, rowH - 6, 4).fillColor("#f8fafc").fill()
    doc.fillColor("#64748b").font("Helvetica-Bold").fontSize(7).text(label.toUpperCase(), x + 8, yy + 6, { width: colW - 16 })
    doc.fillColor("#0f172a").font("Helvetica").fontSize(9).text(value || "-", x + 8, yy + 17, { width: colW - 16 })
  })

  return y + Math.ceil(rows.length / 2) * rowH + 2
}

function drawParagraphBox(doc: PDFKit.PDFDocument, label: string, value: string | null, y: number): number {
  const text = value?.trim() || "-"
  doc.font("Helvetica").fontSize(9)
  const textH = doc.heightOfString(text, { width: CONTENT_W - 20 })
  const boxH = Math.max(52, textH + 30)
  doc.roundedRect(MARGIN, y, CONTENT_W, boxH, 4).fillColor("#f8fafc").fill()
  doc.fillColor("#64748b").font("Helvetica-Bold").fontSize(7).text(label.toUpperCase(), MARGIN + 10, y + 8, { width: CONTENT_W - 20 })
  doc.fillColor("#0f172a").font("Helvetica").fontSize(9).text(text, MARGIN + 10, y + 21, { width: CONTENT_W - 20 })
  return y + boxH + 14
}

async function loadPrintableImage(storedValue: string | null): Promise<Buffer | null> {
  if (!storedValue) return null
  if (storedValue.toLowerCase().endsWith(".pdf") || storedValue.toLowerCase().endsWith(".webp")) return null

  try {
    const { buffer, contentType } = await readServiceBuktiFile(storedValue)
    if (!contentType.includes("jpeg") && !contentType.includes("jpg") && !contentType.includes("png")) return null
    return buffer
  } catch {
    return null
  }
}

function drawImagePanel(doc: PDFKit.PDFDocument, title: string, image: Buffer | null, note: string, x: number, y: number, w: number, h: number) {
  doc.roundedRect(x, y, w, h, 4).strokeColor("#cbd5e1").lineWidth(0.7).stroke()
  doc.fillColor("#64748b").font("Helvetica-Bold").fontSize(7).text(title.toUpperCase(), x + 8, y + 8, { width: w - 16 })
  if (image) {
    try {
      doc.image(image, x + 8, y + 22, { fit: [w - 16, h - 30], align: "center", valign: "center" })
      return
    } catch {
      // Fall through to note text if PDFKit cannot decode the image.
    }
  }

  doc.fillColor("#94a3b8").font("Helvetica").fontSize(8).text(note, x + 10, y + h / 2 - 5, { width: w - 20, align: "center" })
}

function drawSignatures(doc: PDFKit.PDFDocument, data: DisposalPdfData, y: number): number {
  const signW = CONTENT_W / 3
  const names = [
    ["Diajukan oleh", data.dibuat_oleh_nm ?? "-"],
    ["Verifikasi Manager", data.manager_nm ?? "-"],
    [data.verif_ketua === 1 ? "Verifikasi Ketua" : "Verif Pengurus", data.verif_ketua === 1 ? data.ketua_nm ?? "-" : data.bendahara_nm ?? "-"],
  ]

  names.forEach(([role, name], index) => {
    const x = MARGIN + index * signW
    doc.fillColor("#64748b").font("Helvetica").fontSize(8).text(role, x, y, { width: signW, align: "center" })
    doc.moveTo(x + 26, y + 56).lineTo(x + signW - 26, y + 56).strokeColor("#94a3b8").lineWidth(0.5).stroke()
    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(8).text(name, x + 8, y + 62, { width: signW - 16, align: "center" })
  })

  return y + 84
}

export async function generateDisposalPdf(data: DisposalPdfData, options: DisposalPdfOptions): Promise<Buffer> {
  const [assetImage, disposalImage] = await Promise.all([
    loadPrintableImage(data.asset.gambar),
    loadPrintableImage(data.gambar),
  ])

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true })
    const chunks: Buffer[] = []
    doc.on("data", (chunk: Buffer) => chunks.push(chunk))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    let y = drawHeader(doc, data, options)
    y = sectionTitle(doc, "Informasi Permohonan", y)
    y = drawInfoGrid(doc, y, [
      ["Tanggal Pengajuan", fmtDate(data.tgl_pengajuan)],
      ["Status Permohonan", statusText(data)],
      ["Diajukan Oleh", data.dibuat_oleh_nm ?? "-"],
      ["Kondisi Diajukan", data.kondisi ?? "-"],
      ["Verifikasi Manager", data.verif_manager === 1 ? `Sudah - ${fmtDate(data.tgl_verif_manager)}` : "Belum"],
      ["Verifikasi Akhir", (data.verif_ketua === 1 || data.verif_bendahara === 1) ? `Sudah - ${fmtDate(data.tgl_verif_ketua ?? data.tgl_verif_bendahara)}` : "Belum"],
    ])

    y = sectionTitle(doc, "Informasi Aset", y + 4)
    y = drawInfoGrid(doc, y, [
      ["Kode Aset", data.asset.kode_asset],
      ["Nama Aset", data.asset.nama_asset],
      ["Kelompok", data.asset.kelompok_asset],
      ["Harga Beli", fmtCurrency(data.asset.hrg_beli)],
      ["Tanggal Beli", fmtDate(data.asset.tgl_beli)],
      ["Lokasi Aset", data.asset.nama_ruangan ? `${data.asset.nama_ruangan}${data.asset.lokasi ? ` - ${data.asset.lokasi}` : ""}` : "-"],
      ["Penanggung Jawab", data.asset.nama_pj ?? "-"],
      ["Pemakai", data.asset.nama_pemakai ?? "-"],
    ])

    y = drawParagraphBox(doc, "Keterangan / Alasan Disposal", data.keterangan, y + 4)

    const panelW = (CONTENT_W - 12) / 2
    drawImagePanel(doc, "Foto Aset", assetImage, data.asset.gambar ? "Foto tidak dapat disisipkan ke PDF" : "Belum ada foto aset", MARGIN, y, panelW, 128)
    drawImagePanel(doc, "Foto Kondisi Terakhir", disposalImage, data.gambar ? "Foto tidak dapat disisipkan ke PDF" : "Belum ada foto kondisi terakhir", MARGIN + panelW + 12, y, panelW, 128)
    y += 148

    if (y > PAGE_H - 140) {
      doc.addPage()
      y = MARGIN
    }
    drawSignatures(doc, data, y)

    doc.end()
  })
}
