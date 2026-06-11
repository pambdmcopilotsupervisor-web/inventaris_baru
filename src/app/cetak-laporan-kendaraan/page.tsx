"use client"

import { useEffect, useState, useRef } from "react"
import { formatDate } from "@/lib/utils"

interface KendaraanRow {
  kode_brg: string; jns_brg: string; plat: string; nm_brg: string
  thn: number | null; pajak: string | null; stnk: string | null
  pemegang: string | null; departemen: string | null
  stat: string | null; hrg_sewa: number | null
}

interface FilterParams {
  jns_brg?: string
  stat?: string
}

function buildSubtitle(params: FilterParams) {
  const parts: string[] = []
  if (params.jns_brg) parts.push(`Jenis: ${params.jns_brg}`)
  if (params.stat)    parts.push(`Status: ${params.stat}`)
  return parts.length > 0 ? `Filter: ${parts.join(" | ")}` : "Semua Data"
}

export default function CetakLaporanKendaraanPage() {
  const [rows, setRows]       = useState<KendaraanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [printedAt]           = useState(() => new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Makassar", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }))
  const [params, setParams] = useState<FilterParams>({})
  const didPrint            = useRef(false)

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("cetak-laporan-kendaraan-params")
      const p: FilterParams = stored ? JSON.parse(stored) : {}
      setParams(p)

      const qs = new URLSearchParams()
      if (p.jns_brg) qs.set("jns_brg", p.jns_brg)
      if (p.stat)    qs.set("stat",    p.stat)

      fetch(`/api/laporan/kendaraan?${qs.toString()}`)
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

  const totalSewa = rows.reduce((s, r) => s + (Number(r.hrg_sewa) || 0), 0)

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif", color: "#666" }}>
        Memuat data laporan kendaraan...
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
        tfoot td { background-color: #f9fafb; font-weight: bold; }
        .no-print { margin: 20px; display: flex; gap: 10px; }
        @media print {
          .no-print { display: none !important; }
          @page { margin: 8mm; size: A4 landscape; }
        }
      `}</style>

      {/* Kontrol cetak (disembunyikan saat print) */}
      <div className="no-print">
        <button onClick={() => window.print()}
          style={{ padding: "8px 20px", background: "#1E40AF", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}>
          🖨️ Cetak / Simpan PDF
        </button>
        <button onClick={() => window.close()}
          style={{ padding: "8px 16px", background: "#f1f5f9", color: "#333", border: "1px solid #cbd5e1", borderRadius: "6px", cursor: "pointer", fontSize: "13px" }}>
          Tutup
        </button>
      </div>

      <div style={{ padding: "8mm 12mm" }}>
        {/* Header */}
        <div className="header">
          <h1>LAPORAN PENDATAAN KENDARAAN (R2 &amp; R4)</h1>
          <h2>KOPERASI KONSUMEN PEDAMI</h2>
          <p>{buildSubtitle(params)}</p>
          <p>Dicetak pada: {printedAt}</p>
        </div>

        {/* Tabel */}
        <table>
          <thead>
            <tr>
              <th style={{ width: "3%"  }}>No</th>
              <th style={{ width: "7%"  }}>Kode</th>
              <th style={{ width: "8%"  }}>Jenis</th>
              <th style={{ width: "8%"  }}>Plat</th>
              <th style={{ width: "16%" }}>Nama Barang</th>
              <th style={{ width: "4%"  }}>Tahun</th>
              <th style={{ width: "7%"  }}>Pajak</th>
              <th style={{ width: "7%"  }}>STNK</th>
              <th style={{ width: "12%" }}>Pemegang</th>
              <th style={{ width: "10%" }}>Departemen</th>
              <th style={{ width: "9%"  }}>Status</th>
              <th style={{ width: "9%"  }}>Harga Sewa</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.kode_brg + i}>
                <td className="text-center">{i + 1}</td>
                <td className="text-center">{row.kode_brg}</td>
                <td className="text-center">{row.jns_brg}</td>
                <td className="text-center"><strong>{row.plat}</strong></td>
                <td>{row.nm_brg}</td>
                <td className="text-center">{row.thn ?? "—"}</td>
                <td className="text-center">{row.pajak ? formatDate(row.pajak) : "—"}</td>
                <td className="text-center">{row.stnk ? formatDate(row.stnk) : "—"}</td>
                <td>{row.pemegang ?? "—"}</td>
                <td>{row.departemen ?? "—"}</td>
                <td className="text-center">{row.stat ?? "—"}</td>
                <td className="text-right">Rp. {row.hrg_sewa ? Number(row.hrg_sewa).toLocaleString("id-ID") : "0"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={11} style={{ textAlign: "right" }}>Total Nilai Kendaraan ({rows.length} unit):</td>
              <td className="text-right">Rp. {totalSewa.toLocaleString("id-ID")}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  )
}
