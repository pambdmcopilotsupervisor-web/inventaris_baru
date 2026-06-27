"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { SelectField } from "@/components/ui/form-field"
import { Modal } from "@/components/ui/modal"
import { ArrowLeft, Calculator, RefreshCw, CheckCircle2, RotateCw, Download, FileText, Banknote, Lock, Landmark, ClipboardCheck, AlertTriangle, XCircle, Plus, Trash2, SlidersHorizontal } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import {
  getPayrollPeriodDetail,
  getPayrollPeriodSummary,
  calculatePayrollPeriod,
  validatePayrollPeriod,
  recalculateEmployeePayroll,
  approvePayrollPeriod,
  markPayrollPaid,
  closePayrollPeriod,
} from "@/actions/payroll-run"
import {
  getPeriodAdjustments,
  getAdjustmentEmployees,
  createAdjustment,
  deleteAdjustment,
} from "@/actions/payroll-adjustment"

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]
type Status = "DRAFT" | "CALCULATED" | "APPROVED" | "PAID" | "CLOSED"
const STATUS_VARIANT: Record<Status, string> = { DRAFT: "secondary", CALCULATED: "warning", APPROVED: "success", PAID: "info", CLOSED: "destructive" }
const STATUS_LABEL: Record<Status, string> = { DRAFT: "Draft", CALCULATED: "Terhitung", APPROVED: "Disetujui", PAID: "Dibayar", CLOSED: "Ditutup" }

interface PeriodInfo { id: number; period_month: number; period_year: number; period_start_date: string | null; period_end_date: string | null; status: Status; run_type: "REGULER" | "THR" | "BONUS"; run_label: string | null }
interface SlipRow {
  id: number; employee_id: number; nama: string; nik: string; jabatan: string; department: string
  working_days: number; total_earnings: number; total_deductions: number; net_salary: number
  status: "PENDING" | "REVIEWED" | "APPROVED"
}
interface Summary {
  total_karyawan: number; total_earnings: number; total_deductions: number; total_net: number
  by_department: { department: string; count: number; earnings: number; deductions: number; net: number }[]
  loan_total?: number; loan_count?: number
  adjustment_earning_total?: number; adjustment_deduction_total?: number; adjustment_count?: number
}

export default function PayrollPeriodDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const periodId = Number(params.id)

  const [period, setPeriod] = useState<PeriodInfo | null>(null)
  const [slips, setSlips] = useState<SlipRow[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [processing, setProcessing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [recalcId, setRecalcId] = useState<number | null>(null)

  const [deptFilter, setDeptFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [payModal, setPayModal] = useState(false)
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10))

  type CheckItem = { level: "error" | "warning" | "ok"; message: string; detail?: string }
  type ValidationResult = { employee_count: number; error_count: number; warning_count: number; can_calculate: boolean; checks: CheckItem[] }
  const [validateModal, setValidateModal] = useState(false)
  const [validating, setValidating] = useState(false)
  const [validation, setValidation] = useState<ValidationResult | null>(null)

  // ── Penyesuaian sekali jalan ──
  type AdjRow = { id: number; employee_id: number; nama_karyawan: string; jabatan: string; type: "EARNING" | "DEDUCTION"; label: string; amount: number; is_taxable: boolean; notes: string | null }
  type AdjEmp = { id: number; nik: string; nama_karyawan: string; jabatan: string }
  const [adjModal, setAdjModal] = useState(false)
  const [adjRows, setAdjRows] = useState<AdjRow[]>([])
  const [adjEmps, setAdjEmps] = useState<AdjEmp[]>([])
  const [adjLoading, setAdjLoading] = useState(false)
  const [adjSaving, setAdjSaving] = useState(false)
  const [adjError, setAdjError] = useState<string | null>(null)
  const [adjForm, setAdjForm] = useState<{ employee_id: string; type: "EARNING" | "DEDUCTION"; label: string; amount: string; is_taxable: boolean; notes: string }>({ employee_id: "", type: "EARNING", label: "", amount: "", is_taxable: false, notes: "" })

  const load = useCallback(async () => {
    const [detail, sum] = await Promise.all([getPayrollPeriodDetail(periodId), getPayrollPeriodSummary(periodId)])
    if (detail.success) {
      setPeriod(detail.data.period as unknown as PeriodInfo)
      setSlips(detail.data.slips as SlipRow[])
    } else setLoadError(detail.error)
    if (sum.success) setSummary(sum.data as Summary)
    setLoading(false)
  }, [periodId])

  useEffect(() => {
    let active = true
    Promise.all([getPayrollPeriodDetail(periodId), getPayrollPeriodSummary(periodId)]).then(([detail, sum]) => {
      if (!active) return
      if (detail.success) { setPeriod(detail.data.period as unknown as PeriodInfo); setSlips(detail.data.slips as SlipRow[]) }
      else setLoadError(detail.error)
      if (sum.success) setSummary(sum.data as Summary)
      setLoading(false)
    })
    return () => { active = false }
  }, [periodId])

  const handleValidate = async () => {
    setValidateModal(true); setValidating(true); setValidation(null)
    const res = await validatePayrollPeriod(periodId)
    setValidating(false)
    if (res.success) setValidation(res.data as unknown as ValidationResult)
    else setValidation({ employee_count: 0, error_count: 1, warning_count: 0, can_calculate: false, checks: [{ level: "error", message: res.error }] })
  }

  const handleCalculateFromModal = async () => {
    setValidateModal(false)
    await handleCalculate()
  }

  const openAdjustments = async () => {
    setAdjModal(true); setAdjLoading(true); setAdjError(null)
    setAdjForm({ employee_id: "", type: "EARNING", label: "", amount: "", is_taxable: false, notes: "" })
    const [adj, emps] = await Promise.all([getPeriodAdjustments(periodId), getAdjustmentEmployees()])
    if (adj.success) setAdjRows(adj.data as AdjRow[])
    if (emps.success) setAdjEmps(emps.data as AdjEmp[])
    setAdjLoading(false)
  }

  const reloadAdjustments = async () => {
    const adj = await getPeriodAdjustments(periodId)
    if (adj.success) setAdjRows(adj.data as AdjRow[])
  }

  const handleAddAdjustment = async () => {
    setAdjSaving(true); setAdjError(null)
    const res = await createAdjustment({ payroll_period_id: periodId, employee_id: adjForm.employee_id, type: adjForm.type, label: adjForm.label, amount: adjForm.amount, is_taxable: adjForm.is_taxable, notes: adjForm.notes })
    setAdjSaving(false)
    if (!res.success) { setAdjError(res.error); return }
    setAdjForm({ employee_id: "", type: "EARNING", label: "", amount: "", is_taxable: false, notes: "" })
    reloadAdjustments()
  }

  const handleDeleteAdjustment = async (id: number) => {
    const res = await deleteAdjustment(id)
    if (!res.success) { alert(res.error); return }
    reloadAdjustments()
  }

  const handleCalculate = async () => {
    setProcessing(true); setNotice(null)
    const res = await calculatePayrollPeriod(periodId)
    setProcessing(false)
    if (!res.success) { setNotice(res.error); return }
    const d = res.data as { success_count: number; failed_count: number; errors: { nama: string; error: string }[]; warnings: { nama: string; warning: string }[] }
    let msg = `Selesai: ${d.success_count} berhasil, ${d.failed_count} gagal`
    if (d.failed_count) msg += " — gagal: " + d.errors.map((e) => e.nama).join(", ")
    if (d.warnings?.length) msg += ` • ${d.warnings.length} peringatan: ` + d.warnings.slice(0, 5).map((w) => `${w.nama} (${w.warning})`).join("; ") + (d.warnings.length > 5 ? "…" : "")
    setNotice(msg)
    load()
  }

  const handleRecalc = async (row: SlipRow) => {
    setRecalcId(row.employee_id)
    const res = await recalculateEmployeePayroll(periodId, row.employee_id)
    setRecalcId(null)
    if (!res.success) { alert(res.error); return }
    load()
  }

  const handleApprove = async () => {
    if (!confirm("Approve periode ini? Setelah disetujui, slip tidak dapat dihitung ulang.")) return
    setProcessing(true)
    const res = await approvePayrollPeriod(periodId)
    setProcessing(false)
    if (!res.success) { setNotice(res.error); return }
    load()
  }

  const handleMarkPaid = async () => {
    setProcessing(true)
    const res = await markPayrollPaid(periodId, payDate)
    setProcessing(false)
    if (!res.success) { setNotice(res.error); return }
    setPayModal(false); load()
  }

  const handleClose = async () => {
    if (!confirm("Tutup periode ini secara permanen? Periode tidak dapat diubah lagi.")) return
    setProcessing(true)
    const res = await closePayrollPeriod(periodId)
    setProcessing(false)
    if (!res.success) { setNotice(res.error); return }
    load()
  }

  const exportExcel = () => window.open(`/api/payroll/period/${periodId}/export`, "_blank")
  const exportBank = () => window.open(`/api/payroll/period/${periodId}/bank-transfer`, "_blank")

  const departments = useMemo(() => Array.from(new Set(slips.map((s) => s.department))).filter(Boolean), [slips])
  const filtered = useMemo(() => slips.filter((s) => {
    if (deptFilter && s.department !== deptFilter) return false
    if (statusFilter && s.status !== statusFilter) return false
    return true
  }), [slips, deptFilter, statusFilter])

  const columns: Column<SlipRow>[] = [
    { key: "nama", header: "Nama", cell: (r) => <div><p className="font-medium">{r.nama}</p><p className="text-xs" style={{ color: "var(--text-subtle)" }}>{r.jabatan}</p></div> },
    { key: "department", header: "Departemen", cell: (r) => r.department },
    { key: "total_earnings", header: "Pendapatan", cell: (r) => <span className="font-mono" style={{ color: "var(--success)" }}>{formatCurrency(r.total_earnings)}</span> },
    { key: "total_deductions", header: "Potongan", cell: (r) => <span className="font-mono" style={{ color: "var(--danger)" }}>{formatCurrency(r.total_deductions)}</span> },
    { key: "net_salary", header: "Gaji Bersih", cell: (r) => <span className="font-mono font-semibold">{formatCurrency(r.net_salary)}</span> },
    { key: "status", header: "Status", cell: (r) => <Badge variant={r.status === "APPROVED" ? "success" : r.status === "REVIEWED" ? "info" : "secondary"}>{r.status}</Badge> },
  ]

  const status = period?.status

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => router.push("/dashboard/payroll/run")}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: "var(--text-900)" }}>
              {period ? `${MONTHS[period.period_month - 1]} ${period.period_year}` : "Periode"}
              {period && period.run_type !== "REGULER" && <Badge variant="warning">{period.run_type}</Badge>}
              {status && <Badge variant={STATUS_VARIANT[status] as never}>{STATUS_LABEL[status]}</Badge>}
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
              {period?.period_start_date && period?.period_end_date
                ? `Rentang: ${new Date(period.period_start_date).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })} – ${new Date(period.period_end_date).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}`
                : (period?.run_label ?? "Detail periode payroll & kalkulasi per karyawan")}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button>
          {status === "DRAFT" && (
            <>
              <Button variant="outline" size="sm" onClick={openAdjustments} disabled={processing}><SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />Penyesuaian</Button>
              <Button variant="outline" size="sm" onClick={handleValidate} disabled={processing}><ClipboardCheck className="h-3.5 w-3.5 mr-1.5" />Validasi</Button>
              <Button size="sm" onClick={handleCalculate} disabled={processing}><Calculator className="h-3.5 w-3.5 mr-1.5" />{processing ? "Menghitung..." : "Hitung Semua"}</Button>
            </>
          )}
          {status === "CALCULATED" && (
            <>
              <Button variant="outline" size="sm" onClick={openAdjustments} disabled={processing}><SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />Penyesuaian</Button>
              <Button variant="outline" size="sm" onClick={handleValidate} disabled={processing}><ClipboardCheck className="h-3.5 w-3.5 mr-1.5" />Validasi</Button>
              <Button variant="outline" size="sm" onClick={handleCalculate} disabled={processing}><RotateCw className="h-3.5 w-3.5 mr-1.5" />{processing ? "Menghitung..." : "Hitung Ulang"}</Button>
              <Button variant="outline" size="sm" onClick={exportExcel}><Download className="h-3.5 w-3.5 mr-1.5" />Export</Button>
              <Button size="sm" onClick={handleApprove} disabled={processing}><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Approve</Button>
            </>
          )}
          {status === "APPROVED" && (
            <>
              <Button variant="outline" size="sm" onClick={exportBank}><Landmark className="h-3.5 w-3.5 mr-1.5" />Transfer Bank</Button>
              <Button variant="outline" size="sm" onClick={exportExcel}><Download className="h-3.5 w-3.5 mr-1.5" />Export Excel</Button>
              <Button size="sm" onClick={() => setPayModal(true)} disabled={processing}><Banknote className="h-3.5 w-3.5 mr-1.5" />Tandai Dibayar</Button>
            </>
          )}
          {status === "PAID" && (
            <>
              <Button variant="outline" size="sm" onClick={exportBank}><Landmark className="h-3.5 w-3.5 mr-1.5" />Transfer Bank</Button>
              <Button variant="outline" size="sm" onClick={exportExcel}><Download className="h-3.5 w-3.5 mr-1.5" />Export Excel</Button>
              <Button size="sm" onClick={handleClose} disabled={processing}><Lock className="h-3.5 w-3.5 mr-1.5" />Tutup Periode</Button>
            </>
          )}
          {status === "CLOSED" && (
            <>
              <Button variant="outline" size="sm" onClick={exportBank}><Landmark className="h-3.5 w-3.5 mr-1.5" />Transfer Bank</Button>
              <Button variant="outline" size="sm" onClick={exportExcel}><Download className="h-3.5 w-3.5 mr-1.5" />Export Excel</Button>
            </>
          )}
        </div>
      </div>

      {loadError && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{loadError}</div>}
      {notice && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--surface-hover)", color: "var(--text-muted)" }}>{notice}</div>}

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><p className="text-xs" style={{ color: "var(--text-subtle)" }}>Total Karyawan</p><p className="text-2xl font-bold font-mono mt-0.5" style={{ color: "var(--primary)" }}>{loading ? "…" : summary?.total_karyawan ?? 0}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs" style={{ color: "var(--text-subtle)" }}>Total Pendapatan</p><p className="text-xl font-bold font-mono mt-0.5" style={{ color: "var(--success)" }}>{loading ? "…" : formatCurrency(summary?.total_earnings ?? 0)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs" style={{ color: "var(--text-subtle)" }}>Total Potongan</p><p className="text-xl font-bold font-mono mt-0.5" style={{ color: "var(--danger)" }}>{loading ? "…" : formatCurrency(summary?.total_deductions ?? 0)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs" style={{ color: "var(--text-subtle)" }}>Total Gaji Bersih</p><p className="text-xl font-bold font-mono mt-0.5" style={{ color: "var(--text-900)" }}>{loading ? "…" : formatCurrency(summary?.total_net ?? 0)}</p></CardContent></Card>
      </div>

      {/* Ringkasan cicilan & penyesuaian */}
      {!loading && summary && ((summary.loan_total ?? 0) > 0 || (summary.adjustment_count ?? 0) > 0) && (
        <div className="flex flex-wrap gap-3 text-sm">
          {(summary.loan_total ?? 0) > 0 && (
            <div className="rounded-lg px-4 py-2.5" style={{ background: "var(--surface-hover)", border: "1px solid var(--border)" }}>
              <span style={{ color: "var(--text-subtle)" }}>Total potongan cicilan ({summary.loan_count}×): </span>
              <span className="font-mono font-semibold" style={{ color: "var(--danger)" }}>{formatCurrency(summary.loan_total ?? 0)}</span>
            </div>
          )}
          {(summary.adjustment_earning_total ?? 0) > 0 && (
            <div className="rounded-lg px-4 py-2.5" style={{ background: "var(--surface-hover)", border: "1px solid var(--border)" }}>
              <span style={{ color: "var(--text-subtle)" }}>Penyesuaian pendapatan: </span>
              <span className="font-mono font-semibold" style={{ color: "var(--success)" }}>{formatCurrency(summary.adjustment_earning_total ?? 0)}</span>
            </div>
          )}
          {(summary.adjustment_deduction_total ?? 0) > 0 && (
            <div className="rounded-lg px-4 py-2.5" style={{ background: "var(--surface-hover)", border: "1px solid var(--border)" }}>
              <span style={{ color: "var(--text-subtle)" }}>Penyesuaian potongan: </span>
              <span className="font-mono font-semibold" style={{ color: "var(--danger)" }}>{formatCurrency(summary.adjustment_deduction_total ?? 0)}</span>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <SelectField label="Filter Departemen" className="w-56" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}
          options={[{ value: "", label: "Semua Departemen" }, ...departments.map((d) => ({ value: d, label: d }))]} />
        <SelectField label="Filter Status" className="w-48" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          options={[{ value: "", label: "Semua Status" }, { value: "PENDING", label: "Pending" }, { value: "REVIEWED", label: "Reviewed" }, { value: "APPROVED", label: "Approved" }]} />
      </div>

      <DataTable
        data={filtered as unknown as Record<string, unknown>[]}
        columns={columns as unknown as Column<Record<string, unknown>>[]}
        searchKeys={["nama", "nik"]}
        loading={loading}
        emptyMessage={status === "DRAFT" ? "Belum dihitung. Klik 'Hitung Semua'." : "Tidak ada slip"}
        actions={(row: Record<string, unknown>) => {
          const r = row as unknown as SlipRow
          return (
            <div className="flex items-center justify-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => router.push(`/dashboard/payroll/slip/${r.id}`)}>
                <FileText className="h-3.5 w-3.5 mr-1" />Slip
              </Button>
              {status === "CALCULATED" && (
                <Button variant="ghost" size="sm" disabled={recalcId === r.employee_id} onClick={() => handleRecalc(r)}>
                  <RotateCw className={`h-3.5 w-3.5 mr-1 ${recalcId === r.employee_id ? "animate-spin" : ""}`} />Hitung Ulang
                </Button>
              )}
            </div>
          )
        }}
      />

      <Modal open={payModal} onClose={() => setPayModal(false)} title="Tandai Periode Dibayar" size="sm"
        footer={<><Button variant="outline" onClick={() => setPayModal(false)} disabled={processing}>Batal</Button><Button onClick={handleMarkPaid} disabled={processing}>{processing ? "Memproses..." : "Tandai Dibayar"}</Button></>}>
        <div className="space-y-3">
          <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Tanggal Pembayaran</label>
          <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)}
            className="flex h-9 w-full rounded-lg px-3 text-sm" style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }} />
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Unduh file Transfer Bank untuk disbursement ke rekening karyawan.</p>
        </div>
      </Modal>

      <Modal open={validateModal} onClose={() => setValidateModal(false)} title="Validasi Pra-Kalkulasi" size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setValidateModal(false)}>Tutup</Button>
            {validation && (status === "DRAFT" || status === "CALCULATED") && (
              <Button onClick={handleCalculateFromModal} disabled={validating || !validation.can_calculate}>
                {validation.can_calculate ? "Lanjut Hitung" : "Perbaiki Error Dulu"}
              </Button>
            )}
          </>
        }>
        {validating ? (
          <p className="text-sm py-6 text-center" style={{ color: "var(--text-subtle)" }}>Memeriksa…</p>
        ) : validation ? (
          <div className="space-y-3">
            <div className="flex gap-4 text-sm">
              <span style={{ color: "var(--text-muted)" }}>{validation.employee_count} karyawan akan diproses</span>
              <span style={{ color: "var(--danger)" }}>{validation.error_count} error</span>
              <span style={{ color: "var(--warning)" }}>{validation.warning_count} peringatan</span>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {validation.checks.map((c, i) => (
                <div key={i} className="flex items-start gap-2.5 rounded-lg px-3 py-2.5"
                  style={{ background: c.level === "error" ? "var(--danger-bg)" : c.level === "warning" ? "var(--surface-hover)" : "var(--success-bg, var(--surface-hover))" }}>
                  <span className="mt-0.5 shrink-0">
                    {c.level === "error" ? <XCircle className="h-4 w-4" style={{ color: "var(--danger)" }} />
                      : c.level === "warning" ? <AlertTriangle className="h-4 w-4" style={{ color: "var(--warning)" }} />
                      : <CheckCircle2 className="h-4 w-4" style={{ color: "var(--success)" }} />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium" style={{ color: "var(--text-900)" }}>{c.message}</p>
                    {c.detail && <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>{c.detail}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm py-6 text-center" style={{ color: "var(--text-subtle)" }}>Tidak ada hasil</p>
        )}
      </Modal>

      <Modal open={adjModal} onClose={() => setAdjModal(false)} title="Penyesuaian Sekali Jalan" size="lg"
        description="Tambah pendapatan/potongan ad-hoc khusus periode ini. Jalankan Hitung Ulang setelah menambah/menghapus."
        footer={<Button variant="outline" onClick={() => setAdjModal(false)}>Tutup</Button>}>
        <div className="space-y-4">
          {/* Form tambah */}
          <div className="rounded-lg p-3 space-y-3" style={{ border: "1px solid var(--border)", background: "var(--surface-hover)" }}>
            {adjError && <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{adjError}</div>}
            <div className="grid grid-cols-2 gap-3">
              <SelectField label="Karyawan" value={adjForm.employee_id} onChange={(e) => setAdjForm({ ...adjForm, employee_id: e.target.value })}
                options={[{ value: "", label: "Pilih karyawan…" }, ...adjEmps.map((e) => ({ value: String(e.id), label: `${e.nama_karyawan} — ${e.jabatan}` }))]} />
              <SelectField label="Jenis" value={adjForm.type} onChange={(e) => setAdjForm({ ...adjForm, type: e.target.value as "EARNING" | "DEDUCTION" })}
                options={[{ value: "EARNING", label: "Pendapatan" }, { value: "DEDUCTION", label: "Potongan" }]} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Keterangan</label>
                <input value={adjForm.label} onChange={(e) => setAdjForm({ ...adjForm, label: e.target.value })} placeholder="mis. Uang transport proyek"
                  className="flex h-9 w-full rounded-lg px-3 text-sm" style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }} />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Nominal (Rp)</label>
                <input type="number" min={0} value={adjForm.amount} onChange={(e) => setAdjForm({ ...adjForm, amount: e.target.value })} placeholder="0"
                  className="flex h-9 w-full rounded-lg px-3 text-sm" style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }} />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              {adjForm.type === "EARNING" ? (
                <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--text-muted)" }}>
                  <input type="checkbox" className="h-4 w-4" checked={adjForm.is_taxable} onChange={(e) => setAdjForm({ ...adjForm, is_taxable: e.target.checked })} /> Kena pajak (PPh21)
                </label>
              ) : <span />}
              <Button size="sm" onClick={handleAddAdjustment} disabled={adjSaving || !adjForm.employee_id || !adjForm.label || !adjForm.amount}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />{adjSaving ? "Menyimpan..." : "Tambah"}
              </Button>
            </div>
          </div>

          {/* Daftar */}
          {adjLoading ? (
            <p className="text-sm py-4 text-center" style={{ color: "var(--text-subtle)" }}>Memuat…</p>
          ) : adjRows.length === 0 ? (
            <p className="text-sm py-4 text-center" style={{ color: "var(--text-subtle)" }}>Belum ada penyesuaian untuk periode ini</p>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {adjRows.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ border: "1px solid var(--border)" }}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium" style={{ color: "var(--text-900)" }}>{a.nama_karyawan} <span className="text-xs" style={{ color: "var(--text-subtle)" }}>· {a.label}</span></p>
                    <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{a.jabatan}{a.type === "EARNING" && a.is_taxable ? " · kena pajak" : ""}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge variant={a.type === "EARNING" ? "success" : "destructive"}>{a.type === "EARNING" ? "Pendapatan" : "Potongan"}</Badge>
                    <span className="font-mono text-sm" style={{ color: a.type === "EARNING" ? "var(--success)" : "var(--danger)" }}>{formatCurrency(a.amount)}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }} onClick={() => handleDeleteAdjustment(a.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
