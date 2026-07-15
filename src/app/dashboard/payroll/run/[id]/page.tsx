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
  getPayrollCalcTargets,
  calculatePayrollChunk,
  finalizePayrollCalculation,
  validatePayrollPeriod,
  recalculateEmployeePayroll,
  reviewPayrollSlip,
  reviewAllPayrollSlips,
  approvePayrollPeriod,
  createPayrollAccountingJournal,
  cancelPayrollApproval,
  markPayrollPaid,
  closePayrollPeriod,
  deletePayrollPeriod,
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
  detail_count: number
}
interface Summary {
  total_karyawan: number; total_earnings: number; total_deductions: number; total_net: number
  by_department: { department: string; count: number; earnings: number; deductions: number; net: number }[]
  loan_total?: number; loan_count?: number
  adjustment_earning_total?: number; adjustment_deduction_total?: number; adjustment_count?: number
}
interface RunLog { id: number; employee_id: number | null; level: "ERROR" | "WARNING" | "INFO"; message: string; context: { nama?: string } | null; created_at: string | null }
interface RecalcDiffLine {
  code: string
  name: string
  type: "EARNING" | "DEDUCTION"
  before: number
  after: number
  delta: number
}
interface RecalcDiffPayload {
  employee_id: number
  employee_name: string
  before: { total_earnings: number; total_deductions: number; net_salary: number } | null
  after: { total_earnings: number; total_deductions: number; net_salary: number } | null
  delta: { total_earnings: number; total_deductions: number; net_salary: number }
  line_diffs: RecalcDiffLine[]
  changed_line_count: number
}

export default function PayrollPeriodDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const periodId = Number(params.id)

  const [period, setPeriod] = useState<PeriodInfo | null>(null)
  const [slips, setSlips] = useState<SlipRow[]>([])
  const [logs, setLogs] = useState<RunLog[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [processing, setProcessing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [recalcId, setRecalcId] = useState<number | null>(null)
  const [reviewId, setReviewId] = useState<number | null>(null)
  const [reviewingAll, setReviewingAll] = useState(false)

  // Progress kalkulasi bertahap
  const [calcProgress, setCalcProgress] = useState<{ done: number; total: number; failed: number } | null>(null)

  // Hapus periode
  const [deleteModal, setDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [deptFilter, setDeptFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [issueFilter, setIssueFilter] = useState<"" | "EMPTY" | "NEGATIVE" | "UNREVIEWED">("")
  const [payModal, setPayModal] = useState(false)
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [recalcDiffModal, setRecalcDiffModal] = useState(false)
  const [recalcDiff, setRecalcDiff] = useState<RecalcDiffPayload | null>(null)

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
  const [adjEmpSearch, setAdjEmpSearch] = useState("")
  const [adjEmpOpen, setAdjEmpOpen] = useState(false)

  const load = useCallback(async () => {
    const [detail, sum] = await Promise.all([getPayrollPeriodDetail(periodId), getPayrollPeriodSummary(periodId)])
    if (detail.success) {
      setPeriod(detail.data.period as unknown as PeriodInfo)
      setSlips(detail.data.slips as SlipRow[])
      setLogs((detail.data.logs ?? []) as unknown as RunLog[])
    } else setLoadError(detail.error)
    if (sum.success) setSummary(sum.data as Summary)
    setLoading(false)
  }, [periodId])

  useEffect(() => {
    let active = true
    Promise.all([getPayrollPeriodDetail(periodId), getPayrollPeriodSummary(periodId)]).then(([detail, sum]) => {
      if (!active) return
      if (detail.success) { setPeriod(detail.data.period as unknown as PeriodInfo); setSlips(detail.data.slips as SlipRow[]); setLogs((detail.data.logs ?? []) as unknown as RunLog[]) }
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
    setAdjEmpSearch(""); setAdjEmpOpen(false)
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
    // 1) Ambil daftar karyawan yang akan dihitung
    const tg = await getPayrollCalcTargets(periodId)
    if (!tg.success) { setProcessing(false); setNotice(tg.error); return }
    const targets = (tg.data as { targets: { id: number; nama: string }[] }).targets
    const total = targets.length
    setCalcProgress({ done: 0, total, failed: 0 })

    // 2) Proses bertahap per chunk + update progress
    const CHUNK = 10
    let successCount = 0
    let failedCount = 0
    const errors: { nama: string; error: string }[] = []
    const warnings: { nama: string; warning: string }[] = []
    try {
      for (let i = 0; i < targets.length; i += CHUNK) {
        const ids = targets.slice(i, i + CHUNK).map((t) => t.id)
        const res = await calculatePayrollChunk(periodId, ids)
        if (!res.success) {
          setProcessing(false); setCalcProgress(null); setNotice(res.error); return
        }
        const d = res.data as { processed: number; success_count: number; errors: { nama: string; error: string }[]; warnings: { nama: string; warning: string }[] }
        successCount += d.success_count
        failedCount += d.errors.length
        errors.push(...d.errors)
        warnings.push(...d.warnings)
        setCalcProgress({ done: Math.min(i + ids.length, total), total, failed: failedCount })
      }

      // 3) Finalisasi (set status + nomor slip)
      await finalizePayrollCalculation(periodId, failedCount > 0, successCount, failedCount)
    } finally {
      setProcessing(false)
      setCalcProgress(null)
    }

    let msg = `Selesai: ${successCount} berhasil, ${failedCount} gagal`
    if (failedCount) msg += " — gagal: " + errors.map((e) => e.nama).join(", ")
    if (warnings.length) msg += ` • ${warnings.length} peringatan: ` + warnings.slice(0, 5).map((w) => `${w.nama} (${w.warning})`).join("; ") + (warnings.length > 5 ? "…" : "")
    setNotice(msg)
    load()
  }

  const handleRecalc = async (row: SlipRow) => {
    setRecalcId(row.employee_id)
    const res = await recalculateEmployeePayroll(periodId, row.employee_id)
    setRecalcId(null)
    if (!res.success) { alert(res.error); return }
    const diff = res.data as unknown as RecalcDiffPayload
    setRecalcDiff(diff)
    setRecalcDiffModal(true)
    setNotice(`Hitung ulang selesai: ${diff.employee_name}. ${diff.changed_line_count} komponen berubah.`)
    load()
  }

  const handleReview = async (row: SlipRow) => {
    setReviewId(row.id)
    const res = await reviewPayrollSlip(row.id)
    setReviewId(null)
    if (!res.success) { setNotice(res.error); return }
    load()
  }

  const handleReviewAll = async () => {
    const pendingCount = slips.filter((s) => s.status !== "REVIEWED").length
    if (pendingCount === 0) return
    if (!confirm(`Review semua ${pendingCount} slip yang belum direview?`)) return
    setReviewingAll(true)
    const res = await reviewAllPayrollSlips(periodId)
    setReviewingAll(false)
    if (!res.success) { setNotice(res.error); return }
    setNotice(`${res.data.count} slip berhasil direview`)
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

  const handleCancelApproval = async () => {
    if (!confirm("Batalkan approve periode ini? Status akan kembali ke Terhitung dan semua slip kembali ke Reviewed.")) return
    setProcessing(true)
    const res = await cancelPayrollApproval(periodId)
    setProcessing(false)
    if (!res.success) { setNotice(res.error); return }
    setNotice("Approve periode berhasil dibatalkan")
    load()
  }

  const handleMarkPaid = async () => {
    setProcessing(true)
    const res = await markPayrollPaid(periodId, payDate)
    setProcessing(false)
    if (!res.success) { setNotice(res.error); return }
    setPayModal(false); load()
  }

  const handleCreateJournal = async () => {
    if (!confirm("Buat draft jurnal payroll untuk periode ini? Jurnal tetap perlu direview dan diposting di modul keuangan.")) return
    setProcessing(true)
    const res = await createPayrollAccountingJournal(periodId)
    setProcessing(false)
    if (!res.success) { setNotice(res.error); return }
    setNotice(`Draft jurnal payroll berhasil dibuat: ${res.data.nomor_jurnal}`)
  }

  const handleClose = async () => {
    if (!confirm("Tutup periode ini secara permanen? Periode tidak dapat diubah lagi.")) return
    setProcessing(true)
    const res = await closePayrollPeriod(periodId)
    setProcessing(false)
    if (!res.success) { setNotice(res.error); return }
    load()
  }

  const handleDelete = async () => {
    setDeleting(true)
    const res = await deletePayrollPeriod(periodId)
    setDeleting(false)
    if (!res.success) { setDeleteModal(false); setNotice(res.error); return }
    router.replace("/dashboard/payroll/run")
  }

  const exportExcel = () => window.open(`/api/payroll/period/${periodId}/export`, "_blank")
  const exportBank = () => window.open(`/api/payroll/period/${periodId}/bank-transfer`, "_blank")

  const departments = useMemo(() => Array.from(new Set(slips.map((s) => s.department))).filter(Boolean), [slips])
  const emptySlipRows = useMemo(() => slips.filter((s) => s.detail_count === 0 || (s.total_earnings === 0 && s.total_deductions === 0 && s.net_salary === 0)), [slips])
  const negativeSlipRows = useMemo(() => slips.filter((s) => s.net_salary < 0), [slips])
  const unreviewedSlipRows = useMemo(() => slips.filter((s) => s.status !== "REVIEWED"), [slips])
  const filtered = useMemo(() => slips.filter((s) => {
    if (deptFilter && s.department !== deptFilter) return false
    if (statusFilter && s.status !== statusFilter) return false
    if (issueFilter === "EMPTY" && !(s.detail_count === 0 || (s.total_earnings === 0 && s.total_deductions === 0 && s.net_salary === 0))) return false
    if (issueFilter === "NEGATIVE" && s.net_salary >= 0) return false
    if (issueFilter === "UNREVIEWED" && s.status === "REVIEWED") return false
    return true
  }), [slips, deptFilter, statusFilter, issueFilter])

  const columns: Column<SlipRow>[] = [
    { key: "nama", header: "Nama", cell: (r) => <div><p className="font-medium">{r.nama}</p><p className="text-xs" style={{ color: "var(--text-subtle)" }}>{r.jabatan}</p></div> },
    { key: "department", header: "Departemen", cell: (r) => r.department },
    { key: "total_earnings", header: "Pendapatan", cell: (r) => <span className="font-mono" style={{ color: "var(--success)" }}>{formatCurrency(r.total_earnings)}</span> },
    { key: "total_deductions", header: "Potongan", cell: (r) => <span className="font-mono" style={{ color: "var(--danger)" }}>{formatCurrency(r.total_deductions)}</span> },
    { key: "net_salary", header: "Gaji Bersih", cell: (r) => <span className="font-mono font-semibold">{formatCurrency(r.net_salary)}</span> },
    { key: "status", header: "Status", cell: (r) => <Badge variant={r.status === "APPROVED" ? "success" : r.status === "REVIEWED" ? "info" : "secondary"}>{r.status}</Badge> },
  ]

  const status = period?.status
  const workflowSteps = useMemo(() => {
    const reviewedDone = unreviewedSlipRows.length === 0
    return [
      { key: "DRAFT", label: "Draft" },
      { key: "CALCULATE", label: "Kalkulasi" },
      { key: "REVIEW", label: "Review" },
      { key: "APPROVE", label: "Approve" },
      { key: "PAID", label: "Dibayar" },
      { key: "CLOSED", label: "Ditutup" },
    ].map((s, idx) => {
      let state: "done" | "current" | "todo" = "todo"
      if (status === "DRAFT") {
        state = idx === 0 ? "current" : "todo"
      } else if (status === "CALCULATED") {
        if (idx <= 1) state = "done"
        else if (idx === 2) state = reviewedDone ? "done" : "current"
        else if (idx === 3) state = reviewedDone ? "current" : "todo"
      } else if (status === "APPROVED") {
        if (idx <= 3) state = "done"
        else if (idx === 4) state = "current"
      } else if (status === "PAID") {
        if (idx <= 4) state = "done"
        else if (idx === 5) state = "current"
      } else if (status === "CLOSED") {
        state = "done"
      }
      return { ...s, state }
    })
  }, [status, unreviewedSlipRows.length])

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
              <Button variant="outline" size="sm" onClick={() => setDeleteModal(true)} disabled={processing} style={{ color: "var(--danger)", borderColor: "var(--danger)" }}><Trash2 className="h-3.5 w-3.5 mr-1.5" />Hapus Periode</Button>
              <Button size="sm" onClick={handleCalculate} disabled={processing}><Calculator className="h-3.5 w-3.5 mr-1.5" />{calcProgress ? `Menghitung ${calcProgress.total > 0 ? Math.round((calcProgress.done / calcProgress.total) * 100) : 0}%` : (processing ? "Menghitung..." : "Hitung Semua")}</Button>
            </>
          )}
          {status === "CALCULATED" && (
            <>
              <Button variant="outline" size="sm" onClick={openAdjustments} disabled={processing}><SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />Penyesuaian</Button>
              <Button variant="outline" size="sm" onClick={handleValidate} disabled={processing}><ClipboardCheck className="h-3.5 w-3.5 mr-1.5" />Validasi</Button>
              <Button variant="outline" size="sm" onClick={() => setDeleteModal(true)} disabled={processing} style={{ color: "var(--danger)", borderColor: "var(--danger)" }}><Trash2 className="h-3.5 w-3.5 mr-1.5" />Hapus Periode</Button>
              <Button variant="outline" size="sm" onClick={handleCalculate} disabled={processing}><RotateCw className="h-3.5 w-3.5 mr-1.5" />{calcProgress ? `Menghitung ${calcProgress.total > 0 ? Math.round((calcProgress.done / calcProgress.total) * 100) : 0}%` : (processing ? "Menghitung..." : "Hitung Ulang")}</Button>
              <Button variant="outline" size="sm" onClick={handleReviewAll} disabled={reviewingAll || slips.length === 0 || slips.every((s) => s.status === "REVIEWED")}><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />{reviewingAll ? "Reviewing..." : "Review Semua"}</Button>
              <Button variant="outline" size="sm" onClick={exportExcel}><Download className="h-3.5 w-3.5 mr-1.5" />Export</Button>
              <Button size="sm" onClick={handleApprove} disabled={processing}><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Approve</Button>
            </>
          )}
          {status === "APPROVED" && (
            <>
              <Button variant="outline" size="sm" onClick={exportBank}><Landmark className="h-3.5 w-3.5 mr-1.5" />Transfer Bank</Button>
              <Button variant="outline" size="sm" onClick={exportExcel}><Download className="h-3.5 w-3.5 mr-1.5" />Export Excel</Button>
              <Button variant="outline" size="sm" onClick={handleCreateJournal} disabled={processing}><FileText className="h-3.5 w-3.5 mr-1.5" />Buat Jurnal</Button>
              <Button variant="outline" size="sm" onClick={handleCancelApproval} disabled={processing} style={{ color: "var(--danger)", borderColor: "var(--danger)" }}><XCircle className="h-3.5 w-3.5 mr-1.5" />Batalkan Approve</Button>
              <Button size="sm" onClick={() => setPayModal(true)} disabled={processing}><Banknote className="h-3.5 w-3.5 mr-1.5" />Tandai Dibayar</Button>
            </>
          )}
          {status === "PAID" && (
            <>
              <Button variant="outline" size="sm" onClick={exportBank}><Landmark className="h-3.5 w-3.5 mr-1.5" />Transfer Bank</Button>
              <Button variant="outline" size="sm" onClick={exportExcel}><Download className="h-3.5 w-3.5 mr-1.5" />Export Excel</Button>
              <Button variant="outline" size="sm" onClick={handleCreateJournal} disabled={processing}><FileText className="h-3.5 w-3.5 mr-1.5" />Buat Jurnal</Button>
              <Button size="sm" onClick={handleClose} disabled={processing}><Lock className="h-3.5 w-3.5 mr-1.5" />Tutup Periode</Button>
            </>
          )}
          {status === "CLOSED" && (
            <>
              <Button variant="outline" size="sm" onClick={exportBank}><Landmark className="h-3.5 w-3.5 mr-1.5" />Transfer Bank</Button>
              <Button variant="outline" size="sm" onClick={exportExcel}><Download className="h-3.5 w-3.5 mr-1.5" />Export Excel</Button>
              <Button variant="outline" size="sm" onClick={handleCreateJournal} disabled={processing}><FileText className="h-3.5 w-3.5 mr-1.5" />Buat Jurnal</Button>
            </>
          )}
        </div>
      </div>

      {loadError && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{loadError}</div>}
      {notice && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--surface-hover)", color: "var(--text-muted)" }}>{notice}</div>}

      <div className="rounded-lg px-4 py-3" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
        <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-muted)" }}>Workflow Periode</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          {workflowSteps.map((step) => (
            <div key={step.key} className="rounded-lg px-3 py-2 text-xs" style={{
              border: "1px solid var(--border)",
              background: step.state === "done" ? "var(--success-bg, #ecfdf5)" : step.state === "current" ? "var(--surface-hover)" : "var(--surface)",
            }}>
              <div className="flex items-center gap-1.5">
                {step.state === "done"
                  ? <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "var(--success)" }} />
                  : step.state === "current"
                    ? <RotateCw className="h-3.5 w-3.5" style={{ color: "var(--primary)" }} />
                    : <div className="h-3.5 w-3.5 rounded-full" style={{ background: "var(--border)" }} />}
                <span className="font-medium" style={{ color: "var(--text-900)" }}>{step.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {status === "CALCULATED" && (emptySlipRows.length > 0 || negativeSlipRows.length > 0 || unreviewedSlipRows.length > 0) && (
        <div className="rounded-lg px-4 py-3 space-y-2" style={{ background: "var(--danger-bg)", border: "1px solid var(--danger)", color: "var(--text-900)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--danger)" }}>Perlu diperbaiki sebelum approve</p>
          <div className="flex flex-wrap gap-2">
            {emptySlipRows.length > 0 && (
              <button
                type="button"
                onClick={() => setIssueFilter("EMPTY")}
                className="rounded-full px-3 py-1 text-xs font-semibold"
                style={{ border: "1px solid var(--danger)", color: "var(--danger)", background: issueFilter === "EMPTY" ? "var(--danger-bg)" : "var(--surface)" }}
              >
                {emptySlipRows.length} slip kosong
              </button>
            )}
            {negativeSlipRows.length > 0 && (
              <button
                type="button"
                onClick={() => setIssueFilter("NEGATIVE")}
                className="rounded-full px-3 py-1 text-xs font-semibold"
                style={{ border: "1px solid var(--danger)", color: "var(--danger)", background: issueFilter === "NEGATIVE" ? "var(--danger-bg)" : "var(--surface)" }}
              >
                {negativeSlipRows.length} net negatif
              </button>
            )}
            {unreviewedSlipRows.length > 0 && (
              <button
                type="button"
                onClick={() => setIssueFilter("UNREVIEWED")}
                className="rounded-full px-3 py-1 text-xs font-semibold"
                style={{ border: "1px solid var(--danger)", color: "var(--danger)", background: issueFilter === "UNREVIEWED" ? "var(--danger-bg)" : "var(--surface)" }}
              >
                {unreviewedSlipRows.length} belum direview
              </button>
            )}
            {issueFilter && (
              <button
                type="button"
                onClick={() => setIssueFilter("")}
                className="rounded-full px-3 py-1 text-xs"
                style={{ border: "1px solid var(--border)", color: "var(--text-muted)", background: "var(--surface)" }}
              >
                Reset filter isu
              </button>
            )}
          </div>
        </div>
      )}

      {logs.length > 0 && (
        <div className="rounded-lg px-4 py-3 space-y-2" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold" style={{ color: "var(--text-900)" }}>Log kalkulasi payroll</p>
            <Badge variant={logs.some((l) => l.level === "ERROR") ? "destructive" : "warning"}>{logs.length} catatan</Badge>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {logs.slice(0, 20).map((l) => (
              <div key={l.id} className="flex items-start gap-2 text-xs">
                <span className="mt-0.5 shrink-0" style={{ color: l.level === "ERROR" ? "var(--danger)" : "var(--warning)" }}>{l.level}</span>
                <span style={{ color: "var(--text-muted)" }}>{l.context?.nama ? `${l.context.nama}: ` : ""}{l.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Progress bar kalkulasi */}
      {calcProgress && (
        <div className="rounded-lg px-4 py-3.5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-medium" style={{ color: "var(--text-900)" }}>
              Menghitung gaji… {calcProgress.done} / {calcProgress.total} karyawan
              {calcProgress.failed > 0 && <span style={{ color: "var(--danger)" }}> · {calcProgress.failed} gagal</span>}
            </span>
            <span className="font-mono font-semibold" style={{ color: "var(--primary)" }}>
              {calcProgress.total > 0 ? Math.round((calcProgress.done / calcProgress.total) * 100) : 0}%
            </span>
          </div>
          <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "var(--surface-hover)" }}>
            <div className="h-full rounded-full transition-all duration-300"
              style={{ width: `${calcProgress.total > 0 ? (calcProgress.done / calcProgress.total) * 100 : 0}%`, background: "var(--primary)" }} />
          </div>
        </div>
      )}

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
        {issueFilter && (
          <div className="rounded-lg px-3 py-2 text-xs" style={{ border: "1px solid var(--border)", background: "var(--surface-hover)", color: "var(--text-muted)" }}>
            Filter isu aktif: <span className="font-semibold" style={{ color: "var(--text-900)" }}>{issueFilter}</span>
          </div>
        )}
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
                <>
                  <Button variant="ghost" size="sm" disabled={reviewId === r.id || r.status === "REVIEWED"} onClick={() => handleReview(r)}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />{r.status === "REVIEWED" ? "Reviewed" : "Review"}
                  </Button>
                  <Button variant="ghost" size="sm" disabled={recalcId === r.employee_id} onClick={() => handleRecalc(r)}>
                    <RotateCw className={`h-3.5 w-3.5 mr-1 ${recalcId === r.employee_id ? "animate-spin" : ""}`} />Hitung Ulang
                  </Button>
                </>
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
              {/* Combobox karyawan dengan pencarian */}
              <div className="space-y-1.5 relative">
                <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Karyawan</label>
                <input
                  value={adjEmpOpen
                    ? adjEmpSearch
                    : (adjEmps.find((e) => String(e.id) === adjForm.employee_id)?.nama_karyawan ?? "")
                  }
                  onFocus={() => { setAdjEmpOpen(true); setAdjEmpSearch("") }}
                  onChange={(e) => { setAdjEmpSearch(e.target.value); setAdjEmpOpen(true) }}
                  onBlur={() => setTimeout(() => setAdjEmpOpen(false), 150)}
                  placeholder="Cari nama atau jabatan…"
                  autoComplete="off"
                  className="flex h-9 w-full rounded-lg px-3 text-sm"
                  style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }}
                />
                {adjEmpOpen && (
                  <div className="absolute z-50 w-full mt-1 rounded-lg shadow-xl overflow-hidden overflow-y-auto max-h-52 scrollbar-thin"
                    style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
                    {adjEmps
                      .filter((e) => {
                        const q = adjEmpSearch.toLowerCase()
                        return !q || e.nama_karyawan.toLowerCase().includes(q) || e.jabatan.toLowerCase().includes(q) || e.nik.toLowerCase().includes(q)
                      })
                      .slice(0, 50)
                      .map((e) => (
                        <button key={e.id} type="button"
                          className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--surface-hover)] transition-colors"
                          style={{ color: "var(--text-900)" }}
                          onMouseDown={(ev) => { ev.preventDefault(); setAdjForm({ ...adjForm, employee_id: String(e.id) }); setAdjEmpSearch(""); setAdjEmpOpen(false) }}>
                          <div className="min-w-0">
                            <p className="font-medium truncate">{e.nama_karyawan}</p>
                            <p className="text-xs truncate" style={{ color: "var(--text-subtle)" }}>{e.jabatan}{e.nik ? ` · ${e.nik}` : ""}</p>
                          </div>
                        </button>
                      ))
                    }
                    {adjEmps.filter((e) => { const q = adjEmpSearch.toLowerCase(); return !q || e.nama_karyawan.toLowerCase().includes(q) || e.jabatan.toLowerCase().includes(q) || e.nik.toLowerCase().includes(q) }).length === 0 && (
                      <p className="px-3 py-2 text-sm" style={{ color: "var(--text-subtle)" }}>Tidak ditemukan</p>
                    )}
                  </div>
                )}
              </div>
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

      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Hapus Periode Payroll" size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteModal(false)} disabled={deleting}>Batal</Button>
            <Button onClick={handleDelete} disabled={deleting} style={{ background: "var(--danger)", color: "#fff" }}>
              {deleting ? "Menghapus..." : "Ya, Hapus Periode"}
            </Button>
          </>
        }>
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-lg p-3" style={{ background: "var(--danger-bg)" }}>
            <Trash2 className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "var(--danger)" }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--danger)" }}>Tindakan ini tidak dapat dibatalkan</p>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                Semua slip gaji, detail komponen, penyesuaian, dan catatan cicilan pinjaman dalam periode ini akan ikut terhapus.
              </p>
            </div>
          </div>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Yakin ingin menghapus periode <span className="font-semibold" style={{ color: "var(--text-900)" }}>
              {period ? `${["", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"][period.period_month]} ${period.period_year}` : "ini"}
              {period?.run_type !== "REGULER" ? ` (${period?.run_type})` : ""}
            </span>?
          </p>
        </div>
      </Modal>

      <Modal
        open={recalcDiffModal}
        onClose={() => setRecalcDiffModal(false)}
        title="Audit Diff Hitung Ulang"
        size="lg"
        footer={<Button variant="outline" onClick={() => setRecalcDiffModal(false)}>Tutup</Button>}
      >
        {!recalcDiff ? (
          <p className="text-sm" style={{ color: "var(--text-subtle)" }}>Tidak ada data diff</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Karyawan: <span className="font-semibold" style={{ color: "var(--text-900)" }}>{recalcDiff.employee_name}</span>
            </p>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg p-3" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
                <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Delta Pendapatan</p>
                <p className="font-mono font-semibold" style={{ color: recalcDiff.delta.total_earnings >= 0 ? "var(--success)" : "var(--danger)" }}>
                  {recalcDiff.delta.total_earnings >= 0 ? "+" : ""}{formatCurrency(recalcDiff.delta.total_earnings)}
                </p>
              </div>
              <div className="rounded-lg p-3" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
                <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Delta Potongan</p>
                <p className="font-mono font-semibold" style={{ color: recalcDiff.delta.total_deductions >= 0 ? "var(--danger)" : "var(--success)" }}>
                  {recalcDiff.delta.total_deductions >= 0 ? "+" : ""}{formatCurrency(recalcDiff.delta.total_deductions)}
                </p>
              </div>
              <div className="rounded-lg p-3" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
                <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Delta Gaji Bersih</p>
                <p className="font-mono font-semibold" style={{ color: recalcDiff.delta.net_salary >= 0 ? "var(--success)" : "var(--danger)" }}>
                  {recalcDiff.delta.net_salary >= 0 ? "+" : ""}{formatCurrency(recalcDiff.delta.net_salary)}
                </p>
              </div>
            </div>

            <div className="rounded-lg" style={{ border: "1px solid var(--border)" }}>
              <div className="px-3 py-2 text-xs font-semibold" style={{ background: "var(--surface-hover)", color: "var(--text-muted)" }}>
                Perubahan Komponen ({recalcDiff.changed_line_count})
              </div>
              <div className="max-h-72 overflow-y-auto">
                {recalcDiff.line_diffs.length === 0 ? (
                  <p className="px-3 py-3 text-sm" style={{ color: "var(--text-subtle)" }}>Tidak ada perubahan komponen</p>
                ) : recalcDiff.line_diffs.map((line, idx) => (
                  <div key={`${line.type}-${line.code}-${idx}`} className="px-3 py-2 grid grid-cols-12 gap-2 text-xs" style={{ borderTop: "1px solid var(--border)" }}>
                    <div className="col-span-5">
                      <p className="font-medium" style={{ color: "var(--text-900)" }}>{line.name}</p>
                      <p style={{ color: "var(--text-subtle)" }}>{line.code} · {line.type}</p>
                    </div>
                    <div className="col-span-2 font-mono text-right" style={{ color: "var(--text-muted)" }}>{formatCurrency(line.before)}</div>
                    <div className="col-span-2 font-mono text-right" style={{ color: "var(--text-muted)" }}>{formatCurrency(line.after)}</div>
                    <div className="col-span-3 font-mono text-right font-semibold" style={{ color: line.delta >= 0 ? "var(--success)" : "var(--danger)" }}>
                      {line.delta >= 0 ? "+" : ""}{formatCurrency(line.delta)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
