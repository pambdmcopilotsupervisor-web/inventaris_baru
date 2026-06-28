"use client"

import React, { useEffect, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Printer } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { terbilangRupiah } from "@/lib/payroll/terbilang"
import { getEmployee1721A1 } from "@/actions/payroll-tax-report"

interface Data {
  year: number
  employee: { id: number; nik: string; npwp: string | null; nama: string; jabatan: string; alamat: string; status_ptkp: string; punya_npwp: boolean; jkel: string }
  months: number
  rincian: {
    gaji_tunjangan_teratur: number; bonus_thr_tidak_teratur: number; bruto_year: number
    biaya_jabatan: number; iuran_pensiun_bpjs: number; netto_year: number
    ptkp: number; pkp_year: number; pph_terutang: number; pph_dipotong: number; selisih: number; npwp_surcharge: boolean
  }
}

function Line({ no, label, value, bold }: { no?: string; label: string; value: number; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-1.5" style={{ borderBottom: "1px solid #e2e8f0" }}>
      <span className={bold ? "font-semibold text-sm" : "text-sm"}>{no ? <span className="text-slate-400 mr-2">{no}</span> : null}{label}</span>
      <span className={`font-mono ${bold ? "font-bold" : ""}`}>{formatCurrency(value)}</span>
    </div>
  )
}

export default function BuktiPotong1721A1Page() {
  const params = useParams<{ id: string }>()
  const search = useSearchParams()
  const router = useRouter()
  const employeeId = Number(params.id)
  const year = Number(search.get("year")) || new Date().getFullYear()

  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    getEmployee1721A1(employeeId, year).then((res) => {
      if (!active) return
      if (res.success) setData(res.data as unknown as Data)
      else setError(res.error)
      setLoading(false)
    })
    return () => { active = false }
  }, [employeeId, year])

  if (loading) return <div className="p-8 text-sm" style={{ color: "var(--text-subtle)" }}>Memuat bukti potong…</div>
  if (error || !data) return <div className="p-8 text-sm" style={{ color: "var(--danger)" }}>{error ?? "Data tidak ditemukan"}</div>

  const r = data.rincian

  return (
    <div className="space-y-4">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #bp-print, #bp-print * { visibility: visible !important; }
          #bp-print { position: absolute; left: 0; top: 0; width: 100%; padding: 0; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="flex items-center justify-between flex-wrap gap-3 no-print">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => router.push("/dashboard/payroll/tax-report")}><ArrowLeft className="h-4 w-4" /></Button>
          <h1 className="text-lg font-bold" style={{ color: "var(--text-900)" }}>Bukti Potong 1721-A1 — {data.employee.nama}</h1>
        </div>
        <Button size="sm" onClick={() => window.print()}><Printer className="h-3.5 w-3.5 mr-1.5" />Cetak</Button>
      </div>

      <div id="bp-print" className="mx-auto max-w-3xl rounded-xl p-8" style={{ background: "#fff", border: "1px solid var(--border)", color: "#0f172a" }}>
        <div className="text-center pb-3 mb-4" style={{ borderBottom: "2px solid #166534" }}>
          <h2 className="text-lg font-extrabold">BUKTI PEMOTONGAN PAJAK PENGHASILAN PASAL 21</h2>
          <p className="text-sm font-semibold">(FORMULIR 1721-A1)</p>
          <p className="text-xs text-slate-500 mt-1">Bagi Pegawai Tetap — Masa Pajak Januari s.d. Desember {data.year}</p>
        </div>

        {/* Identitas */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm mb-4">
          {[
            ["Nama", data.employee.nama],
            ["NPWP", data.employee.punya_npwp ? (data.employee.npwp ?? "-") : "TIDAK BER-NPWP"],
            ["NIK / NIP", data.employee.nik],
            ["Jabatan", data.employee.jabatan],
            ["Status PTKP", data.employee.status_ptkp],
            ["Jenis Kelamin", data.employee.jkel],
            ["Alamat", data.employee.alamat],
            ["Masa Perolehan", `${data.months} bulan`],
          ].map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="text-slate-500 w-28 shrink-0">{k}</span>
              <span className="font-semibold">: {v}</span>
            </div>
          ))}
        </div>

        {/* Rincian penghasilan & PPh */}
        <div className="rounded-lg overflow-hidden mb-4" style={{ border: "1px solid #e2e8f0" }}>
          <div className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide" style={{ background: "#166534", color: "#fff" }}>A. Penghasilan Bruto</div>
          <Line no="1." label="Gaji & tunjangan (teratur)" value={r.gaji_tunjangan_teratur} />
          <Line no="2." label="Bonus, THR, gratifikasi (tidak teratur)" value={r.bonus_thr_tidak_teratur} />
          <Line no="3." label="Jumlah Penghasilan Bruto" value={r.bruto_year} bold />

          <div className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide" style={{ background: "#166534", color: "#fff" }}>B. Pengurangan</div>
          <Line no="4." label="Biaya jabatan" value={r.biaya_jabatan} />
          <Line no="5." label="Iuran pensiun / JHT / BPJS (karyawan)" value={r.iuran_pensiun_bpjs} />

          <div className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide" style={{ background: "#166534", color: "#fff" }}>C. Penghitungan PPh Pasal 21</div>
          <Line no="6." label="Jumlah penghasilan neto setahun" value={r.netto_year} bold />
          <Line no="7." label="Penghasilan Tidak Kena Pajak (PTKP)" value={r.ptkp} />
          <Line no="8." label="Penghasilan Kena Pajak (PKP)" value={r.pkp_year} bold />
          <Line no="9." label="PPh Pasal 21 terutang setahun" value={r.pph_terutang} bold />
          <Line no="10." label="PPh Pasal 21 yang telah dipotong" value={r.pph_dipotong} />
        </div>

        {/* Selisih */}
        <div className="rounded-lg px-5 py-4 flex items-center justify-between mb-4" style={{ background: r.selisih > 0 ? "#fef2f2" : r.selisih < 0 ? "#eff6ff" : "#f0fdf4" }}>
          <div>
            <p className="text-xs" style={{ color: "#64748b" }}>
              {r.selisih > 0 ? "PPh Pasal 21 KURANG dipotong" : r.selisih < 0 ? "PPh Pasal 21 LEBIH dipotong" : "PPh Pasal 21 telah dipotong sesuai"}
            </p>
            <p className="text-[11px] italic mt-1" style={{ color: "#64748b" }}>Terbilang: {terbilangRupiah(Math.abs(r.selisih))}</p>
          </div>
          <p className="text-2xl font-extrabold font-mono" style={{ color: r.selisih > 0 ? "#b91c1c" : r.selisih < 0 ? "#1d4ed8" : "#166534" }}>
            {formatCurrency(Math.abs(r.selisih))}
          </p>
        </div>

        {r.npwp_surcharge && (
          <p className="text-xs mb-4" style={{ color: "#b91c1c" }}>* Tarif PPh21 dinaikkan 20% karena karyawan tidak memiliki NPWP.</p>
        )}

        {/* Tanda tangan */}
        <div className="flex justify-end mt-8 text-center text-sm">
          <div className="w-64">
            <p className="text-slate-500">Pemotong Pajak,</p>
            <div className="h-16" />
            <p className="font-semibold border-t pt-1" style={{ borderColor: "#cbd5e1" }}>( Bagian Keuangan / HRD )</p>
          </div>
        </div>

        <p className="text-[10px] mt-6 text-slate-400">Dokumen ini dihasilkan otomatis dari sistem penggajian berdasarkan akumulasi pemotongan PPh21 sepanjang tahun {data.year}. Angka mengacu pada penghasilan bruto kena pajak.</p>
      </div>
    </div>
  )
}
