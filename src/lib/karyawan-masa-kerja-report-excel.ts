import * as XLSX from "xlsx"
import type { KaryawanMasaKerjaReportRow } from "@/lib/karyawan-masa-kerja-report"

interface KaryawanMasaKerjaReportExcelOptions {
  printedBy?: string | null
  filterLabel?: string | null
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

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

export function generateKaryawanMasaKerjaReportExcel(
  rows: KaryawanMasaKerjaReportRow[],
  options: KaryawanMasaKerjaReportExcelOptions = {}
): Buffer {
  const uniqueEmployees = new Set(rows.map((row) => row.karyawan_id)).size
  const totalDivisi = new Set(rows.map((row) => row.divisi ?? "Tanpa Divisi")).size
  const aoa: (string | number)[][] = [
    ["REKAP MASA KERJA KARYAWAN PER DIVISI"],
    ["KOPERASI KONSUMEN PEDAMI"],
    [`Filter: ${options.filterLabel ?? "Semua"}`],
    [`Dicetak pada: ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Makassar" })}`],
    [`Dicetak oleh: ${options.printedBy ?? "Sistem"}`],
    [`Total: ${uniqueEmployees} karyawan, ${rows.length} penempatan, ${totalDivisi} divisi`],
    [],
    ["No", "NIK", "Nama Karyawan", "Status", "Jabatan", "Divisi", "Sub Divisi", "Mulai", "Sampai", "Masa Kerja", "Posisi"],
  ]

  if (rows.length === 0) {
    aoa.push(["", "", "Tidak ada data sesuai pilihan cetak.", "", "", "", "", "", "", "", ""])
  } else {
    const grouped = new Map<string, KaryawanMasaKerjaReportRow[]>()
    rows.forEach((row) => {
      const key = row.divisi ?? "Tanpa Divisi"
      const group = grouped.get(key) ?? []
      group.push(row)
      grouped.set(key, group)
    })

    grouped.forEach((groupRows, divisi) => {
      aoa.push([`${divisi} (${groupRows.length} penempatan)`, "", "", "", "", "", "", "", "", "", ""])
      groupRows.forEach((row) => {
        aoa.push([
          row.no,
          row.nik,
          row.nama_karyawan,
          text(row.status_karyawan),
          text(row.jabatan),
          text(row.divisi),
          text(row.subdivisi),
          fmtDate(row.tanggal_mulai),
          row.sampai_label || fmtDate(row.tanggal_sampai),
          row.masa_kerja,
          row.aktif ? "Saat Ini" : "-",
        ])
      })
    })
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 10 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 10 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 10 } },
    { s: { r: 4, c: 0 }, e: { r: 4, c: 10 } },
    { s: { r: 5, c: 0 }, e: { r: 5, c: 10 } },
  ]
  ws["!cols"] = [
    { wch: 5 },
    { wch: 16 },
    { wch: 30 },
    { wch: 14 },
    { wch: 22 },
    { wch: 28 },
    { wch: 28 },
    { wch: 13 },
    { wch: 13 },
    { wch: 24 },
    { wch: 12 },
  ]

  const merges = ws["!merges"] ?? []
  aoa.forEach((row, rowIndex) => {
    const firstCell = row[0]
    const isGroupRow = rowIndex > 7 && typeof firstCell === "string" && firstCell.includes("penempatan)")
    if (isGroupRow) merges.push({ s: { r: rowIndex, c: 0 }, e: { r: rowIndex, c: 10 } })
  })
  ws["!merges"] = merges
  ws["!freeze"] = { xSplit: 0, ySplit: 8 }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName("Rekap Masa Kerja"))
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
}

export function karyawanMasaKerjaExcelHeaders(filename: string) {
  return {
    "Content-Type": XLSX_MIME,
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  }
}
