"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { SelectField, TextField } from "@/components/ui/form-field"
import { Plus, RefreshCw, ArrowRight } from "lucide-react"
import { getPayrollPeriods, createPayrollPeriod } from "@/actions/payroll-run"

interface Period {
  id: number
  period_month: number
  period_year: number
  period_start_date: string | null
  period_end_date: string | null
  run_type: "REGULER" | "THR" | "BONUS"
  run_label: string | null
  status: "DRAFT" | "CALCULATED" | "APPROVED" | "PAID" | "CLOSED"
  created_at: string | null
  _count?: { payroll_slips: number }
}

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]
const STATUS_VARIANT: Record<Period["status"], string> = {
  DRAFT: "secondary", CALCULATED: "warning", APPROVED: "success", PAID: "info", CLOSED: "destructive",
}
const STATUS_LABEL: Record<Period["status"], string> = {
  DRAFT: "Draft", CALCULATED: "Terhitung", APPROVED: "Disetujui", PAID: "Dibayar", CLOSED: "Ditutup",
}

const now = new Date()
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 2 + i).map((y) => ({ value: String(y), label: String(y) }))
const MONTH_OPTIONS = MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))
const RUN_TYPE_OPTIONS = [
  { value: "REGULER", label: "Gaji Reguler" },
  { value: "THR", label: "THR (Tunjangan Hari Raya)" },
  { value: "BONUS", label: "Bonus" },
]
const RUN_TYPE_VARIANT: Record<string, string> = { REGULER: "secondary", THR: "warning", BONUS: "info" }

export default function PayrollRunPage() {
  const router = useRouter()
  const [periods, setPeriods] = useState<Period[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [month, setMonth] = useState(String(now.getMonth() + 1))
  const [year, setYear] = useState(String(now.getFullYear()))
  const [runType, setRunType] = useState("REGULER")
  const [thrMin, setThrMin] = useState("12")
  const [bonusMult, setBonusMult] = useState("1")
  const [runLabel, setRunLabel] = useState("")
  const [customDates, setCustomDates] = useState(false)
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Rentang default 1..akhir bulan untuk bulan/tahun terpilih.
  const defaultRange = useMemo(() => {
    const m = Number(month), y = Number(year)
    const pad = (n: number) => String(n).padStart(2, "0")
    const last = new Date(y, m, 0).getDate()
    return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(last)}` }
  }, [month, year])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const res = await getPayrollPeriods()
    if (res.success) setPeriods(res.data as unknown as Period[])
    else setLoadError(res.error)
    setLoading(false)
  }, [])

  useEffect(() => {
    let active = true
    getPayrollPeriods().then((res) => {
      if (!active) return
      if (res.success) setPeriods(res.data as unknown as Period[])
      else setLoadError(res.error)
      setLoading(false)
    })
    return () => { active = false }
  }, [])

  const handleCreate = async () => {
    setSaving(true); setFormError(null)
    const useCustom = customDates
    const res = await createPayrollPeriod(Number(month), Number(year), {
      run_type: runType as "REGULER" | "THR" | "BONUS",
      thr_min_masa_bulan: Number(thrMin),
      bonus_multiplier: Number(bonusMult),
      run_label: runLabel || null,
      start_date: useCustom ? (startDate || defaultRange.start) : null,
      end_date: useCustom ? (endDate || defaultRange.end) : null,
    })
    setSaving(false)
    if (!res.success) { setFormError(res.error); return }
    setModalOpen(false)
    load()
    router.push(`/dashboard/payroll/run/${(res.data as unknown as { id: number }).id}`)
  }

  const openCreate = () => {
    setFormError(null)
    setCustomDates(false)
    setStartDate(defaultRange.start)
    setEndDate(defaultRange.end)
    setModalOpen(true)
  }

  const columns: Column<Period>[] = [
    { key: "period", header: "Periode", cell: (r) => {
      const isCustom = (() => {
        if (!r.period_start_date || !r.period_end_date) return false
        const s = new Date(r.period_start_date), e = new Date(r.period_end_date)
        const defStart = 1, defEnd = new Date(r.period_year, r.period_month, 0).getDate()
        return !(s.getDate() === defStart && s.getMonth() === r.period_month - 1 && e.getDate() === defEnd && e.getMonth() === r.period_month - 1)
      })()
      const fmt = (iso: string) => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}` }
      return (
        <div>
          <span className="font-semibold">{MONTHS[r.period_month - 1]} {r.period_year}</span>
          {isCustom && r.period_start_date && r.period_end_date && (
            <p className="text-[11px]" style={{ color: "var(--cta, var(--primary))" }}>{fmt(r.period_start_date)} – {fmt(r.period_end_date)}</p>
          )}
          {r.run_label && <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{r.run_label}</p>}
        </div>
      )
    } },
    { key: "run_type", header: "Tipe", cell: (r) => <Badge variant={RUN_TYPE_VARIANT[r.run_type] as never}>{r.run_type === "REGULER" ? "Reguler" : r.run_type}</Badge> },
    { key: "slips", header: "Jumlah Slip", cell: (r) => <span className="font-mono">{r._count?.payroll_slips ?? 0}</span> },
    { key: "status", header: "Status", cell: (r) => <Badge variant={STATUS_VARIANT[r.status] as never}>{STATUS_LABEL[r.status]}</Badge> },
    { key: "created_at", header: "Dibuat", cell: (r) => (r.created_at ? new Date(r.created_at).toLocaleDateString("id-ID") : "—") },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Payroll Run</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Kelola periode penggajian bulanan & jalankan kalkulasi</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button size="sm" onClick={openCreate}><Plus className="h-3.5 w-3.5 mr-1.5" />Buat Periode Baru</Button>
        </div>
      </div>

      {loadError && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{loadError}</div>}

      <DataTable
        data={periods as unknown as Record<string, unknown>[]}
        columns={columns as unknown as Column<Record<string, unknown>>[]}
        searchable={false}
        loading={loading}
        emptyMessage="Belum ada periode payroll"
        actions={(row: Record<string, unknown>) => {
          const r = row as unknown as Period
          return (
            <div className="flex items-center justify-center">
              <Button variant="ghost" size="sm" onClick={() => router.push(`/dashboard/payroll/run/${r.id}`)}>
                Detail <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          )
        }}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Buat Periode Payroll Baru"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Batal</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? "Membuat..." : "Buat"}</Button>
          </>
        }
      >
        {formError && <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{formError}</div>}
        <div className="space-y-4">
          <SelectField label="Tipe Run" options={RUN_TYPE_OPTIONS} value={runType} onChange={(e) => setRunType(e.target.value)} />
          <div className="grid grid-cols-2 gap-4">
            <SelectField label="Bulan" options={MONTH_OPTIONS} value={month} onChange={(e) => setMonth(e.target.value)} />
            <SelectField label="Tahun" options={YEAR_OPTIONS} value={year} onChange={(e) => setYear(e.target.value)} />
          </div>

          {/* Rentang tanggal kustom */}
          <div className="rounded-lg p-3 space-y-3" style={{ border: "1px solid var(--border)", background: "var(--surface-hover)" }}>
            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--text-muted)" }}>
              <input type="checkbox" className="h-4 w-4" checked={customDates}
                onChange={(e) => { setCustomDates(e.target.checked); if (e.target.checked) { setStartDate(defaultRange.start); setEndDate(defaultRange.end) } }} />
              Gunakan rentang tanggal kustom
            </label>
            {customDates ? (
              <div className="grid grid-cols-2 gap-4">
                <TextField label="Tanggal Mulai" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                <TextField label="Tanggal Akhir" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            ) : (
              <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Default: {defaultRange.start} s.d. {defaultRange.end} (1 s.d. akhir bulan).</p>
            )}
          </div>
          {runType !== "REGULER" && (
            <TextField label="Label (opsional)" placeholder={runType === "THR" ? "THR Idul Fitri 2026" : "Bonus Akhir Tahun"} value={runLabel} onChange={(e) => setRunLabel(e.target.value)} />
          )}
          {runType === "THR" && (
            <TextField label="Min. Masa Kerja untuk THR Penuh (bulan)" type="number" min={1} value={thrMin} onChange={(e) => setThrMin(e.target.value)} />
          )}
          {runType === "BONUS" && (
            <TextField label="Pengali Bonus (× basis gaji)" type="number" step="0.01" min={0} value={bonusMult} onChange={(e) => setBonusMult(e.target.value)} />
          )}
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
            {runType === "REGULER" ? "Gaji bulanan; komponen prorata otomatis untuk karyawan baru." : runType === "THR" ? "THR = basis (gaji + tunjangan ber-flag) × prorata masa kerja." : "Bonus = basis × pengali."}
          </p>
        </div>
      </Modal>
    </div>
  )
}
