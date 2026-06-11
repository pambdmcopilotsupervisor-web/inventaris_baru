"use client"

import { useEffect, useState, useRef } from "react"
import { formatCurrency, formatDate } from "@/lib/utils"

interface AssetRow {
  no: number; kode_asset: string; nama_asset: string; kelompok_asset: string
  tgl_beli: string | null; hrg_beli: number | null
  nama_ruangan: string | null; lokasi: string | null
  nama_pj: string | null; nama_pemakai: string | null
  status_barang: string
}

interface FilterParams {
  kelompok_asset?: string
  ruangan_id?: string
  status_barang?: string
}

function buildSubtitle(params: FilterParams) {
  const parts: string[] = []
  if (params.kelompok_asset) parts.push(params.kelompok_asset === "komputer" ? "Peralatan Komputer" : "Perabotan Kantor")
  if (params.status_barang)  parts.push(`Status: ${params.status_barang}`)
  return parts.length > 0 ? `Filter: ${parts.join(" | ")}` : "Semua Data"
}

export default function CetakLaporanAsetPage() {
  const [rows, setRows]       = useState<AssetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [printedAt]           = useState(() => new Date().toLocaleString("id-ID", { timeZone: "Asia/Makassar", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }))
  const [params, setParams]   = useState<FilterParams>({})
  const didPrint              = useRef(false)

  useEffect(() => {
    // Read filter params from sessionStorage
    try {
      const stored = sessionStorage.getItem("cetak-laporan-aset-params")
      const p: FilterParams = stored ? JSON.parse(stored) : {}
      setParams(p)

      const qs = new URLSearchParams()
      if (p.kelompok_asset) qs.set("kelompok_asset", p.kelompok_asset)
      if (p.ruangan_id)     qs.set("ruangan_id",     p.ruangan_id)
      if (p.status_barang)  qs.set("status_barang",  p.status_barang)

      fetch(`/api/laporan/aset?${qs.toString()}`)
        .then(r => r.json())
        .then(d => { setRows(Array.isArray(d) ? d : []); setLoading(false) })
        .catch(() => setLoading(false))
    } catch { setLoading(false) }
  }, [])

  useEffect(() => {
    if (!loading && rows.length > 0 && !didPrint.current) {
      didPrint.current = true
      setTimeout(() => window.print(), 400)
    }
  }, [loading, rows])

  const totalNilai = rows.reduce((s, r) => s + (Number(r.hrg_beli) || 0), 0)

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif", color: "#666" }}>
        Memuat data laporan...
      </div>
    )
  }

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: sans-serif; font-size: 7.5pt; color: #333; background: #fff; }
        .header { text-align: center; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #000; }
        .header h1 { font-size: 13pt; font-weight: bold; color: #000; }
        .header h2 { font-size: 11pt; font-weight: bold; color: #000; margin-top: 4px; }
        .header p  { font-size: 8.5pt; margin-top: 4px; color: #555; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; table-layout: fixed; }
        th, td { border: 1px solid #000; padding: 3px 2px; text-align: left; font-size: 7.5pt; word-wrap: break-word; overflow-wrap: break-word; }
        th { background-color: #E5E7EB; font-weight: bold; text-align: center; }
        .text-center { text-align: center; }
        .text-right  { text-align: right; }
        tfoot td, tfoot th { background-color: #f9fafb; font-weight: bold; }
        .no-print { margin: 20px; display: flex; gap: 10px; }
        @media print {
          .no-print { display: none !important; }
          @page { margin: 8mm; size: A4 landscape; }
        }
      `}</style>

      {/* Print controls (hidden on print) */}
      <div className="no-print">
        <button
          onClick={() => window.print()}
          style={{ padding: "8px 20px", background: "#1E40AF", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}
        >
          🖨️ Cetak / Simpan PDF
        </button>
        <button
          onClick={() => window.close()}
          style={{ padding: "8px 16px", background: "#f1f5f9", color: "#333", border: "1px solid #cbd5e1", borderRadius: "6px", cursor: "pointer", fontSize: "13px" }}
        >
          Tutup
        </button>
      </div>

      <div style={{ padding: "8mm 12mm" }}>
        {/* Header */}
        <div className="header">
          <h1>LAPORAN INVENTARIS ASET</h1>
          <h2>KOPERASI KONSUMEN PEDAMI</h2>
          <p>{buildSubtitle(params)}</p>
          <p>Dicetak pada: {printedAt}</p>
        </div>

        {/* Table */}
        <table>
          <thead>
            <tr>
              <th style={{ width: "3%"  }}>No</th>
              <th style={{ width: "7%"  }}>Kode Aset</th>
              <th style={{ width: "18%" }}>Nama Aset</th>
              <th style={{ width: "7%"  }}>Kelompok</th>
              <th style={{ width: "7%"  }}>Tgl Beli</th>
              <th style={{ width: "10%" }}>Harga Beli</th>
              <th style={{ width: "13%" }}>Lokasi / Ruangan</th>
              <th style={{ width: "12%" }}>Penanggung Jawab</th>
              <th style={{ width: "12%" }}>Pemakai</th>
              <th style={{ width: "7%"  }}>Kondisi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.kode_asset + i}>
                <td className="text-center">{i + 1}</td>
                <td className="text-center">{row.kode_asset}</td>
                <td>{row.nama_asset}</td>
                <td className="text-center">{row.kelompok_asset === "komputer" ? "Komputer" : "Kantor"}</td>
                <td className="text-center">{row.tgl_beli ? formatDate(row.tgl_beli) : "—"}</td>
                <td className="text-right">Rp. {row.hrg_beli ? Number(row.hrg_beli).toLocaleString("id-ID") : "0"}</td>
                <td>{row.nama_ruangan ? `${row.nama_ruangan} — ${row.lokasi ?? ""}` : "—"}</td>
                <td>{row.nama_pj ?? "—"}</td>
                <td>{row.nama_pemakai ?? "—"}</td>
                <td className="text-center">{row.status_barang}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} style={{ textAlign: "right" }}>Total Nilai Aset ({rows.length} item):</td>
              <td colSpan={5}>Rp. {totalNilai.toLocaleString("id-ID")}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  )
}
