"use client"

import React, { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Printer, FileDown } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { getPayrollSlip } from "@/actions/payroll-slip"
import type { SlipData } from "@/lib/payroll/slip-data"

export default function PayrollSlipPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const slipId = Number(params.id)

  const [slip, setSlip] = useState<SlipData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    getPayrollSlip(slipId).then((res) => {
      if (!active) return
      if (res.success) setSlip(res.data)
      else setError(res.error)
      setLoading(false)
    })
    return () => { active = false }
  }, [slipId])

  if (loading) return <div className="p-8 text-sm" style={{ color: "var(--text-subtle)" }}>Memuat slip…</div>
  if (error || !slip) return <div className="p-8 text-sm" style={{ color: "var(--danger)" }}>{error ?? "Slip tidak ditemukan"}</div>

  return (
    <div className="space-y-4">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #slip-print, #slip-print * { visibility: visible !important; }
          #slip-print { position: absolute; left: 0; top: 0; width: 100%; padding: 0; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Action bar */}
      <div className="flex items-center justify-between flex-wrap gap-3 no-print">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" /></Button>
          <h1 className="text-lg font-bold" style={{ color: "var(--text-900)" }}>Slip Gaji — {slip.employee.nama}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-3.5 w-3.5 mr-1.5" />Cetak PDF</Button>
          <Button size="sm" onClick={() => window.open(`/api/payroll/slip/${slip.slip_id}/pdf`, "_blank")}><FileDown className="h-3.5 w-3.5 mr-1.5" />Unduh PDF</Button>
        </div>
      </div>

      {/* Slip */}
      <div id="slip-print" className="mx-auto max-w-3xl rounded-xl p-8" style={{ background: "#fff", border: "1px solid var(--border)", color: "#0f172a" }}>
        {/* Header */}
        <div className="flex items-start justify-between pb-4 mb-4" style={{ borderBottom: "2px solid #166534" }}>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg font-bold text-white" style={{ background: "#166534" }}>PDM</div>
            <div>
              <h2 className="text-xl font-extrabold">SLIP GAJI</h2>
              <p className="text-xs text-slate-500">Koperasi Konsumen Pedami</p>
              <p className="text-xs text-slate-500">Periode: {slip.period.label}</p>
              <p className="text-xs text-slate-500">{slip.period.range_label}</p>
            </div>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p>No: <span className="font-mono">{slip.slip_number}</span></p>
            <p className="mt-1">Status: <Badge variant={slip.status === "APPROVED" ? "success" : "secondary"}>{slip.status}</Badge></p>
          </div>
        </div>

        {/* Karyawan */}
        <div className="grid grid-cols-2 gap-y-1 gap-x-6 text-sm mb-5">
          {[["Nama", slip.employee.nama], ["NIP / NIK", slip.employee.nik], ["Jabatan", slip.employee.jabatan], ["Departemen", slip.employee.department]].map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="text-slate-500 w-24 shrink-0">{k}</span>
              <span className="font-semibold">{v}</span>
            </div>
          ))}
        </div>

        {/* Catatan meta: jenis run, metode pajak, prorata */}
        {slip.meta && (slip.meta.tax_method || slip.meta.prorata_note || slip.meta.run_type !== "REGULER") && (
          <div className="flex flex-wrap gap-2 mb-5 text-[11px]">
            {slip.meta.run_type !== "REGULER" && (
              <span className="rounded-full px-2.5 py-0.5" style={{ background: "#fef3c7", color: "#92400e" }}>Jenis: {slip.meta.run_type}</span>
            )}
            {slip.meta.tax_method && (
              <span className="rounded-full px-2.5 py-0.5" style={{ background: "#e0e7ff", color: "#3730a3" }}>Metode PPh21: {slip.meta.tax_method}</span>
            )}
            {slip.meta.prorata_note && (
              <span className="rounded-full px-2.5 py-0.5" style={{ background: "#fee2e2", color: "#991b1b" }}>{slip.meta.prorata_note}</span>
            )}
          </div>
        )}

        {/* Pendapatan & Potongan */}
        <div className="grid md:grid-cols-2 gap-5 mb-5">
          <SlipTable title="PENDAPATAN" accent="#166534" lines={slip.earnings} total={slip.total_earnings} totalLabel="TOTAL PENDAPATAN" />
          <SlipTable title="POTONGAN" accent="#b91c1c" lines={slip.deductions} total={slip.total_deductions} totalLabel="TOTAL POTONGAN" />
        </div>

        {/* Kehadiran */}
        <div className="mb-5">
          <p className="text-sm font-bold mb-2">KEHADIRAN</p>
          <div className="grid grid-cols-6 gap-2 text-center">
            {[["Hari Kerja", slip.attendance.working_days], ["Hadir", slip.attendance.hadir], ["Alfa", slip.attendance.alfa], ["Terlambat", slip.attendance.terlambat], ["Ijin", slip.attendance.ijin], ["Sakit", slip.attendance.sakit]].map(([k, v]) => (
              <div key={k as string} className="rounded-lg py-2" style={{ border: "1px solid #e2e8f0" }}>
                <p className="text-[10px] text-slate-500">{k}</p>
                <p className="text-lg font-bold">{v}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Rincian Pajak & BPJS */}
        {slip.tax_detail && (slip.tax_detail.pph21 || slip.tax_detail.bpjs) && (
          <div className="mb-5 rounded-lg p-4" style={{ border: "1px solid #e2e8f0", background: "#f8fafc" }}>
            <p className="text-sm font-bold mb-2">RINCIAN PAJAK &amp; BPJS</p>
            <div className="grid md:grid-cols-2 gap-x-6 gap-y-1 text-xs">
              {slip.tax_detail.pph21 && (
                <>
                  <Row label="Penghasilan bruto / bln" value={formatCurrency(slip.tax_detail.pph21.bruto_month)} />
                  <Row label="Biaya jabatan / bln" value={formatCurrency(slip.tax_detail.pph21.biaya_jabatan_month)} />
                  <Row label="Penghasilan neto / bln" value={formatCurrency(slip.tax_detail.pph21.netto_month)} />
                  <Row label="PKP setahun" value={formatCurrency(slip.tax_detail.pph21.pkp_year)} />
                  <Row label="PPh21 setahun" value={formatCurrency(slip.tax_detail.pph21.pph_year)} />
                  <Row label="PPh21 / bln" value={formatCurrency(slip.tax_detail.pph21.pph_month)} />
                </>
              )}
              {slip.tax_detail.bpjs && (
                <>
                  <Row label="BPJS porsi karyawan" value={formatCurrency(slip.tax_detail.bpjs.total_employee)} />
                  <Row label="BPJS porsi perusahaan" value={formatCurrency(slip.tax_detail.bpjs.total_employer)} />
                </>
              )}
            </div>
          </div>
        )}

        {/* Gaji Bersih */}
        <div className="rounded-lg px-5 py-4 flex items-center justify-between" style={{ background: "#166534", color: "#fff" }}>
          <div>
            <p className="text-xs" style={{ color: "#bbf7d0" }}>GAJI BERSIH</p>
            <p className="text-[11px] italic mt-1" style={{ color: "#dcfce7" }}>Terbilang: {slip.net_salary_terbilang}</p>
          </div>
          <p className="text-2xl font-extrabold font-mono">{formatCurrency(slip.net_salary)}</p>
        </div>

        {/* Tanda tangan */}
        <div className="grid grid-cols-2 gap-6 mt-8 text-center text-sm">
          <div>
            <p className="text-slate-500">Diterima oleh,</p>
            <div className="h-12" />
            <p className="font-semibold border-t pt-1" style={{ borderColor: "#cbd5e1" }}>( {slip.employee.nama} )</p>
          </div>
          <div>
            <p className="text-slate-500">Disetujui oleh,</p>
            <div className="h-12" />
            <p className="font-semibold border-t pt-1" style={{ borderColor: "#cbd5e1" }}>( Bagian Keuangan )</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-slate-500">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  )
}

function SlipTable({ title, accent, lines, total, totalLabel }: { title: string; accent: string; lines: SlipData["earnings"]; total: number; totalLabel: string }) {
  return (
    <div>
      <p className="text-sm font-bold mb-2" style={{ color: accent }}>{title}</p>
      <table className="w-full text-sm">
        <tbody>
          {lines.length === 0 && (
            <tr><td className="py-1 text-slate-400" colSpan={2}>—</td></tr>
          )}
          {lines.map((l) => (
            <tr key={l.no}>
              <td className="py-1 pr-2 align-top">
                <span className="text-slate-400 mr-1">{l.no}.</span>{l.component_name}
                {l.category === "ATTENDANCE_DEDUCTION" && l.notes && (
                  <span className="block text-[10px] text-slate-400">{l.notes}</span>
                )}
              </td>
              <td className="py-1 text-right font-mono whitespace-nowrap align-top">{formatCurrency(l.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: "1px solid #e2e8f0" }}>
            <td className="pt-2 font-bold" style={{ color: accent }}>{totalLabel}</td>
            <td className="pt-2 text-right font-bold font-mono" style={{ color: accent }}>{formatCurrency(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
