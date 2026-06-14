import PDFDocument from "pdfkit"
import type { PdfPenilaianData } from "@/lib/penilaian-pdf-data"
import { getPredikat } from "@/lib/penilaian-pdf-data"

// A4 portrait dalam points
const PAGE_W = 595.28
const MARGIN = 40
const CONTENT_W = PAGE_W - MARGIN * 2

const KOMPONEN = [
  { key: "nilai_kehadiran" as const,       label: "Kehadiran",              bobot: 20 },
  { key: "nilai_capaian_sasaran" as const, label: "Capaian Sasaran Kerja",  bobot: 40 },
  { key: "nilai_perilaku" as const,        label: "Perilaku Kerja",         bobot: 30 },
  { key: "nilai_pengembangan" as const,    label: "Pengembangan Kompetensi", bobot: 10 },
]

function fmtTanggal(d: Date | null): string {
  if (!d) return "-"
  return new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })
}
function fmtTanggalJam(d: Date | null): string {
  if (!d) return "-"
  const dt = new Date(d)
  return dt.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) +
    " " + dt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
}
function fmtNum(v: number | null, dec = 2): string {
  if (v === null || v === undefined) return "-"
  return Number(v).toFixed(dec)
}
function capaianPct(realisasi: number | null, target: number): number {
  if (!target) return 0
  return Math.min(120, Math.max(0, ((realisasi ?? 0) / target) * 100))
}

/**
 * Generate dokumen PDF penilaian kinerja individual. A4 portrait.
 */
export function generatePenilaianPdf(data: PdfPenilaianData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true })
    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    const isFinal = data.penilaian.status === "final"

    // ─── Header ──────────────────────────────────────────────────
    let y = MARGIN
    // Logo teks (PEDAMI)
    doc.roundedRect(MARGIN, y, 46, 46, 6).fillColor("#1e40af").fill()
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(14).text("PDM", MARGIN, y + 16, { width: 46, align: "center" })

    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(15)
      .text("PENILAIAN KINERJA PEGAWAI", MARGIN + 58, y + 4, { width: CONTENT_W - 58 })
    doc.fillColor("#334155").font("Helvetica").fontSize(9)
      .text("Koperasi Konsumen Pedami", MARGIN + 58, y + 24, { width: CONTENT_W - 58 })
    doc.fillColor("#64748b").fontSize(8)
      .text(`Periode: ${data.periode.nama_periode}`, MARGIN + 58, y + 37, { width: CONTENT_W - 58 })

    // Nomor dokumen (kanan)
    const nomorDok = `No: ${data.periode.kode_periode}/PK-${String(data.penilaian.id).padStart(4, "0")}`
    doc.fillColor("#64748b").fontSize(8).text(nomorDok, MARGIN, y + 4, { width: CONTENT_W, align: "right" })
    doc.text(isFinal ? "Status: FINAL" : `Status: ${data.penilaian.status.toUpperCase()}`, MARGIN, y + 16, { width: CONTENT_W, align: "right" })

    y += 56
    doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor("#1e40af").lineWidth(1.5).stroke()
    y += 12

    // ─── Bagian 1: Identitas ─────────────────────────────────────
    y = sectionTitle(doc, "I. Identitas Pegawai", y)
    const idRows: [string, string][] = [
      ["Nama", data.identitas.nama_karyawan],
      ["NIP / NIK", data.identitas.nik],
      ["Jabatan", data.identitas.jabatan],
      ["Unit / Divisi", data.identitas.nama_divisi ?? "-"],
      ["Atasan Langsung", data.identitas.nama_atasan ?? "-"],
      ["Periode Penilaian", `${fmtTanggal(data.periode.tanggal_mulai)} s/d ${fmtTanggal(data.periode.tanggal_selesai)}`],
    ]
    doc.font("Helvetica").fontSize(9).fillColor("#0f172a")
    const colW = CONTENT_W / 2
    idRows.forEach((row, i) => {
      const col = i % 2
      const rowIdx = Math.floor(i / 2)
      const x = MARGIN + col * colW
      const ry = y + rowIdx * 16
      doc.fillColor("#64748b").font("Helvetica").text(`${row[0]}`, x, ry, { width: 90, continued: false })
      doc.fillColor("#0f172a").font("Helvetica-Bold").text(`: ${row[1]}`, x + 92, ry, { width: colW - 96 })
    })
    y += Math.ceil(idRows.length / 2) * 16 + 8

    // ─── Bagian 2: Capaian Sasaran Kerja ─────────────────────────
    y = sectionTitle(doc, "II. Capaian Sasaran Kerja", y)
    const tCols = [
      { label: "Uraian Tugas", w: 0.40, align: "left" as const },
      { label: "Satuan", w: 0.12, align: "center" as const },
      { label: "Target", w: 0.12, align: "right" as const },
      { label: "Realisasi", w: 0.13, align: "right" as const },
      { label: "% Capaian", w: 0.13, align: "right" as const },
      { label: "Bobot", w: 0.10, align: "right" as const },
    ]
    y = drawTableHeader(doc, tCols, y)
    doc.font("Helvetica").fontSize(8.5)
    if (data.targets.length === 0) {
      y = drawTableRow(doc, tCols, ["Belum ada target kerja", "-", "-", "-", "-", "-"], y, false)
    } else {
      data.targets.forEach((t, i) => {
        const pct = capaianPct(t.realisasi_nilai, t.target_nilai)
        y = drawTableRow(doc, tCols, [
          t.uraian_tugas,
          t.satuan,
          fmtNum(t.target_nilai, 0),
          fmtNum(t.realisasi_nilai, 0),
          `${pct.toFixed(1)}%`,
          `${fmtNum(t.bobot_dalam_capaian, 0)}%`,
        ], y, i % 2 === 1)
      })
    }
    y += 8

    // ─── Bagian 3: Penilaian Perilaku Kerja ──────────────────────
    y = pageBreakIfNeeded(doc, y, 140)
    y = sectionTitle(doc, "III. Penilaian Perilaku Kerja", y)
    const pCols = [
      { label: "Aspek Perilaku", w: 0.46, align: "left" as const },
      { label: "Mandiri (30%)", w: 0.18, align: "center" as const },
      { label: "Atasan (70%)", w: 0.18, align: "center" as const },
      { label: "Gabungan", w: 0.18, align: "center" as const },
    ]
    y = drawTableHeader(doc, pCols, y)
    doc.font("Helvetica").fontSize(8.5)
    data.perilaku.forEach((p, i) => {
      const m = p.nilai_mandiri ?? 0
      const a = p.nilai_atasan ?? 0
      const gab = ((m * 0.3 + a * 0.7) / 5 * 100)
      y = drawTableRow(doc, pCols, [
        p.aspek,
        p.nilai_mandiri != null ? `${p.nilai_mandiri} / 5` : "-",
        p.nilai_atasan != null ? `${p.nilai_atasan} / 5` : "-",
        gab.toFixed(1),
      ], y, i % 2 === 1)
    })
    y += 8

    // ─── Bagian 4: Rekap Nilai per Komponen ──────────────────────
    y = pageBreakIfNeeded(doc, y, 160)
    y = sectionTitle(doc, "IV. Rekap Nilai & Nilai Akhir", y)
    const kCols = [
      { label: "Komponen Penilaian", w: 0.45, align: "left" as const },
      { label: "Nilai (0-100)", w: 0.20, align: "right" as const },
      { label: "Bobot", w: 0.15, align: "right" as const },
      { label: "Nilai Tertimbang", w: 0.20, align: "right" as const },
    ]
    y = drawTableHeader(doc, kCols, y)
    doc.font("Helvetica").fontSize(8.5)
    KOMPONEN.forEach((k, i) => {
      const nilai = data.penilaian[k.key]
      const tertimbang = nilai != null ? (nilai * k.bobot) / 100 : null
      y = drawTableRow(doc, kCols, [
        k.label,
        fmtNum(nilai),
        `${k.bobot}%`,
        fmtNum(tertimbang),
      ], y, i % 2 === 1)
    })
    // Baris nilai akhir
    const naLabelW = CONTENT_W * 0.80
    doc.rect(MARGIN, y, CONTENT_W, 20).fillColor("#1e40af").fill()
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(9.5)
      .text("NILAI AKHIR", MARGIN + 6, y + 6, { width: naLabelW - 12, align: "left" })
    doc.text(fmtNum(data.penilaian.nilai_akhir), MARGIN + naLabelW, y + 6, { width: CONTENT_W * 0.20 - 6, align: "right" })
    y += 28

    // ─── Predikat ────────────────────────────────────────────────
    const predikat = getPredikat(data.penilaian.nilai_akhir)
    const [pr, pg, pb] = predikat.color
    doc.roundedRect(MARGIN, y, CONTENT_W, 30, 4).fillColor(`#${toHex(pr)}${toHex(pg)}${toHex(pb)}`).fill()
    doc.fillColor("#ffffff").font("Helvetica").fontSize(9).text("Predikat Kinerja:", MARGIN + 12, y + 7)
    doc.font("Helvetica-Bold").fontSize(14).text(predikat.label, MARGIN, y + 6, { width: CONTENT_W - 14, align: "right" })
    y += 40

    // ─── Bagian 5: Catatan Atasan ────────────────────────────────
    y = pageBreakIfNeeded(doc, y, 90)
    y = sectionTitle(doc, "V. Catatan Atasan", y)
    doc.font("Helvetica").fontSize(9).fillColor("#334155")
    const catatan = data.penilaian.catatan_atasan?.trim() || "Tidak ada catatan."
    const catH = doc.heightOfString(catatan, { width: CONTENT_W - 16 }) + 12
    doc.roundedRect(MARGIN, y, CONTENT_W, catH, 4).fillColor("#f1f5f9").fill()
    doc.fillColor("#334155").text(catatan, MARGIN + 8, y + 6, { width: CONTENT_W - 16 })
    y += catH + 10

    // ─── Bagian 6: Riwayat Approval ──────────────────────────────
    y = pageBreakIfNeeded(doc, y, 120)
    y = sectionTitle(doc, "VI. Riwayat Persetujuan", y)
    const aCols = [
      { label: "Tanggal", w: 0.22, align: "left" as const },
      { label: "Nama Penilai", w: 0.28, align: "left" as const },
      { label: "Jabatan", w: 0.22, align: "left" as const },
      { label: "Aksi", w: 0.28, align: "left" as const },
    ]
    y = drawTableHeader(doc, aCols, y)
    doc.font("Helvetica").fontSize(8)
    if (data.approval.length === 0) {
      y = drawTableRow(doc, aCols, ["-", "Belum ada riwayat", "-", "-"], y, false)
    } else {
      data.approval.forEach((a, i) => {
        y = drawTableRow(doc, aCols, [
          fmtTanggalJam(a.created_at),
          a.actor_nama ?? "-",
          a.actor_jabatan ?? "-",
          aksiLabel(a.aksi, a.status_ke),
        ], y, i % 2 === 1)
      })
    }
    y += 14

    // ─── Bagian 7: Tanda Tangan ──────────────────────────────────
    y = pageBreakIfNeeded(doc, y, 130)
    y = sectionTitle(doc, "VII. Pengesahan", y)
    const signW = CONTENT_W / 3
    const signs = [
      { role: "Pegawai", nama: data.identitas.nama_karyawan },
      { role: "Kepala Divisi", nama: data.identitas.nama_atasan ?? "....................." },
      { role: "Manager", nama: "....................." },
    ]
    doc.font("Helvetica").fontSize(9).fillColor("#0f172a")
    signs.forEach((s, i) => {
      const x = MARGIN + i * signW
      doc.fillColor("#64748b").text(s.role, x, y, { width: signW, align: "center" })
      doc.fillColor("#0f172a").font("Helvetica-Bold").text(s.nama, x, y + 56, { width: signW, align: "center" })
      doc.font("Helvetica").moveTo(x + 20, y + 52).lineTo(x + signW - 20, y + 52).strokeColor("#94a3b8").lineWidth(0.5).stroke()
    })
    y += 80

    // ─── Footer + Watermark di semua halaman ─────────────────────
    const range = doc.bufferedPageRange()
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i)
      // Watermark
      drawWatermark(doc, isFinal ? "DOKUMEN FINAL" : "DRAFT", isFinal)
      // Footer
      const fy = 810
      doc.fillColor("#94a3b8").font("Helvetica").fontSize(7)
        .text(`Dicetak: ${new Date().toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`,
          MARGIN, fy, { width: CONTENT_W / 2, align: "left" })
      doc.text(`Halaman ${i + 1} dari ${range.count}`, MARGIN + CONTENT_W / 2, fy, { width: CONTENT_W / 2, align: "right" })
    }

    doc.end()
  })
}

// ─── Helpers ───────────────────────────────────────────────────────

function toHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string, y: number): number {
  doc.fillColor("#1e40af").font("Helvetica-Bold").fontSize(11).text(title, MARGIN, y)
  return y + 18
}

type Col = { label: string; w: number; align: "left" | "center" | "right" }

function drawTableHeader(doc: PDFKit.PDFDocument, cols: Col[], y: number): number {
  const h = 20
  doc.rect(MARGIN, y, CONTENT_W, h).fillColor("#e2e8f0").fill()
  doc.fillColor("#1e293b").font("Helvetica-Bold").fontSize(8)
  let x = MARGIN
  cols.forEach(c => {
    const w = c.w * CONTENT_W
    doc.text(c.label, x + 4, y + 6, { width: w - 8, align: c.align })
    x += w
  })
  return y + h
}

function drawTableRow(doc: PDFKit.PDFDocument, cols: Col[], cells: string[], y: number, stripe: boolean): number {
  // Hitung tinggi baris berdasarkan kolom pertama (yang biasanya panjang)
  let maxH = 14
  cols.forEach((c, i) => {
    const w = c.w * CONTENT_W
    const h = doc.heightOfString(cells[i] ?? "", { width: w - 8 })
    if (h + 8 > maxH) maxH = h + 8
  })
  if (stripe) {
    doc.rect(MARGIN, y, CONTENT_W, maxH).fillColor("#f8fafc").fill()
  }
  doc.fillColor("#334155")
  let x = MARGIN
  cols.forEach((c, i) => {
    const w = c.w * CONTENT_W
    doc.text(cells[i] ?? "", x + 4, y + 4, { width: w - 8, align: c.align })
    x += w
  })
  // garis bawah
  doc.moveTo(MARGIN, y + maxH).lineTo(PAGE_W - MARGIN, y + maxH).strokeColor("#e2e8f0").lineWidth(0.5).stroke()
  return y + maxH
}

function pageBreakIfNeeded(doc: PDFKit.PDFDocument, y: number, needed: number): number {
  if (y + needed > 800) {
    doc.addPage()
    return MARGIN
  }
  return y
}

function drawWatermark(doc: PDFKit.PDFDocument, text: string, isFinal: boolean): void {
  doc.save()
  doc.rotate(-45, { origin: [PAGE_W / 2, 421] })
  doc.fillColor(isFinal ? "#16a34a" : "#dc2626").opacity(0.08)
    .font("Helvetica-Bold").fontSize(70)
    .text(text, 0, 380, { width: PAGE_W, align: "center" })
  doc.opacity(1).restore()
}

function aksiLabel(aksi: string, statusKe: string | null): string {
  const map: Record<string, string> = {
    submit_mandiri: "Pengajuan penilaian mandiri",
    verifikasi_atasan: "Verifikasi atasan",
  }
  if (map[aksi]) return map[aksi]
  if (aksi.startsWith("transisi_")) {
    const labels: Record<string, string> = {
      diajukan: "Diajukan", diverifikasi: "Diverifikasi", disetujui: "Disetujui", final: "Difinalisasi", draft: "Dikembalikan",
    }
    return statusKe ? (labels[statusKe] ?? statusKe) : aksi
  }
  return aksi
}
