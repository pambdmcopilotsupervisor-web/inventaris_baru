"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { TextField, SelectField, TextareaField } from "@/components/ui/form-field"
import { ConfirmDelete } from "@/components/ui/confirm-delete"
import { Plus, Pencil, Ban, RefreshCw, Eye } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import {
  getEmployeeLoans,
  getLoanEmployees,
  createLoan,
  updateLoan,
  cancelLoan,
} from "@/actions/employee-loan"

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]

interface LoanRow {
  id: number
  employee_id: number
  nama_karyawan: string
  nik: string
  jabatan: string
  loan_number: string | null
  title: string
  principal_amount: number
  installment_amount: number
  tenor_months: number
  start_month: number
  start_year: number
  status: "ACTIVE" | "COMPLETED" | "CANCELLED"
  paid_amount: number
  remaining_amount: number
  payment_count: number
  notes: string | null
}

interface EmpOption { id: number; nik: string; nama_karyawan: string; jabatan: string }

const STATUS: Record<LoanRow["status"], { label: string; variant: string }> = {
  ACTIVE: { label: "Berjalan", variant: "success" },
  COMPLETED: { label: "Lunas", variant: "info" },
  CANCELLED: { label: "Dibatalkan", variant: "secondary" },
}

export default function EmployeeLoansPage() {
  const router = useRouter()
  const now = new Date()
  const [rows, setRows] = useState<LoanRow[]>([])
  const [employees, setEmployees] = useState<EmpOption[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<LoanRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = useState<LoanRow | null>(null)
  const [cancelling, setCancelling] = useState(false)

  // form fields
  const [employeeId, setEmployeeId] = useState("")
  const [title, setTitle] = useState("")
  const [loanNumber, setLoanNumber] = useState("")
  const [principal, setPrincipal] = useState("")
  const [installment, setInstallment] = useState("")
  const [startMonth, setStartMonth] = useState(String(now.getMonth() + 1))
  const [startYear, setStartYear] = useState(String(now.getFullYear()))
  const [notes, setNotes] = useState("")

  const load = async () => {
    setLoading(true)
    const res = await getEmployeeLoans()
    if (res.success) setRows(res.data as LoanRow[])
    else setLoadError(res.error)
    setLoading(false)
  }

  useEffect(() => {
    let active = true
    Promise.all([getEmployeeLoans(), getLoanEmployees()]).then(([loans, emps]) => {
      if (!active) return
      if (loans.success) setRows(loans.data as LoanRow[])
      else setLoadError(loans.error)
      if (emps.success) setEmployees(emps.data as EmpOption[])
      setLoading(false)
    })
    return () => { active = false }
  }, [])

  const tenorPreview = useMemo(() => {
    const p = Number(principal), c = Number(installment)
    if (p > 0 && c > 0) return Math.ceil(p / c)
    return 0
  }, [principal, installment])

  const openAdd = () => {
    setEditTarget(null); setFormError(null)
    setEmployeeId(""); setTitle(""); setLoanNumber(""); setPrincipal(""); setInstallment("")
    setStartMonth(String(now.getMonth() + 1)); setStartYear(String(now.getFullYear())); setNotes("")
    setFormOpen(true)
  }

  const openEdit = (r: LoanRow) => {
    setEditTarget(r); setFormError(null)
    setEmployeeId(String(r.employee_id)); setTitle(r.title); setLoanNumber(r.loan_number ?? "")
    setPrincipal(String(r.principal_amount)); setInstallment(String(r.installment_amount))
    setStartMonth(String(r.start_month)); setStartYear(String(r.start_year)); setNotes(r.notes ?? "")
    setFormOpen(true)
  }

  const handleSave = async () => {
    setSaving(true); setFormError(null)
    const res = editTarget
      ? await updateLoan({ id: editTarget.id, title, loan_number: loanNumber, installment_amount: installment, notes })
      : await createLoan({ employee_id: employeeId, title, loan_number: loanNumber, principal_amount: principal, installment_amount: installment, start_month: startMonth, start_year: startYear, notes })
    setSaving(false)
    if (!res.success) { setFormError(res.error); return }
    setFormOpen(false); load()
  }

  const handleCancel = async () => {
    if (!cancelTarget) return
    setCancelling(true)
    const res = await cancelLoan(cancelTarget.id)
    setCancelling(false); setCancelTarget(null)
    if (!res.success) { alert(res.error); return }
    load()
  }

  const columns: Column<LoanRow>[] = [
    { key: "nama_karyawan", header: "Karyawan", cell: (r) => <div><p className="font-medium">{r.nama_karyawan}</p><p className="text-xs" style={{ color: "var(--text-subtle)" }}>{r.jabatan}</p></div> },
    { key: "title", header: "Pinjaman", cell: (r) => <div><p className="font-medium">{r.title}</p>{r.loan_number && <p className="text-xs font-mono" style={{ color: "var(--text-subtle)" }}>{r.loan_number}</p>}</div> },
    { key: "principal_amount", header: "Pokok", cell: (r) => <span className="font-mono">{formatCurrency(r.principal_amount)}</span> },
    { key: "installment_amount", header: "Cicilan/bln", cell: (r) => <span className="font-mono">{formatCurrency(r.installment_amount)}</span> },
    { key: "paid_amount", header: "Terbayar", cell: (r) => <span className="font-mono" style={{ color: "var(--success)" }}>{formatCurrency(r.paid_amount)}</span> },
    { key: "remaining_amount", header: "Sisa", cell: (r) => <span className="font-mono" style={{ color: r.remaining_amount > 0 ? "var(--danger)" : "var(--text-subtle)" }}>{formatCurrency(r.remaining_amount)}</span> },
    { key: "start", header: "Mulai", cell: (r) => <span className="text-xs">{MONTHS[r.start_month - 1]} {r.start_year}</span> },
    { key: "status", header: "Status", cell: (r) => <Badge variant={STATUS[r.status].variant as never}>{STATUS[r.status].label}</Badge> },
  ]

  const empOptions = employees.map((e) => ({ value: String(e.id), label: `${e.nama_karyawan} — ${e.jabatan}` }))
  const yearOptions = Array.from({ length: 7 }, (_, i) => now.getFullYear() - 2 + i).map((y) => ({ value: String(y), label: String(y) }))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Pinjaman & Cicilan Karyawan</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Cicilan dipotong otomatis tiap payroll bulanan (REGULER) sampai pokok lunas.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1.5" />Tambah Pinjaman</Button>
        </div>
      </div>

      {loadError && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{loadError}</div>}

      <DataTable
        data={rows as unknown as Record<string, unknown>[]}
        columns={columns as unknown as Column<Record<string, unknown>>[]}
        searchKeys={["nama_karyawan", "nik", "title"]}
        loading={loading}
        emptyMessage="Belum ada data pinjaman"
        actions={(row: Record<string, unknown>) => {
          const r = row as unknown as LoanRow
          return (
            <div className="flex items-center justify-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" title="Detail & jadwal" onClick={() => router.push(`/dashboard/payroll/loans/${r.id}`)}><Eye className="h-3.5 w-3.5" /></Button>
              {r.status === "ACTIVE" && (
                <>
                  <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--warning)" }} title="Ubah" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }} title="Batalkan pinjaman" onClick={() => setCancelTarget(r)}><Ban className="h-3.5 w-3.5" /></Button>
                </>
              )}
            </div>
          )
        }}
      />

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editTarget ? "Ubah Pinjaman" : "Tambah Pinjaman"}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Batal</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </>
        }
      >
        {formError && <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{formError}</div>}

        <div className="space-y-4">
          <SelectField label="Karyawan" required disabled={!!editTarget}
            value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}
            placeholder="Pilih karyawan…" options={empOptions} />

          <TextField label="Judul/Keterangan Pinjaman" required placeholder="mis. Pinjaman Kendaraan"
            value={title} onChange={(e) => setTitle(e.target.value)} />

          <TextField label="No. Pinjaman (opsional)" placeholder="mis. PJM/2026/001"
            value={loanNumber} onChange={(e) => setLoanNumber(e.target.value)} />

          <div className="grid grid-cols-2 gap-4">
            <TextField label="Pokok Pinjaman (Rp)" type="number" min={0} required disabled={!!editTarget}
              value={principal} onChange={(e) => setPrincipal(e.target.value)} />
            <TextField label="Cicilan per Bulan (Rp)" type="number" min={0} required
              value={installment} onChange={(e) => setInstallment(e.target.value)} />
          </div>

          {tenorPreview > 0 && (
            <div className="rounded-lg px-4 py-2.5 text-sm" style={{ background: "var(--surface-hover)", color: "var(--text-muted)" }}>
              Estimasi tenor: <span className="font-semibold">{tenorPreview} bulan</span>
            </div>
          )}

          {!editTarget && (
            <div className="grid grid-cols-2 gap-4">
              <SelectField label="Mulai Potong Bulan" required
                value={startMonth} onChange={(e) => setStartMonth(e.target.value)}
                options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} />
              <SelectField label="Tahun" required
                value={startYear} onChange={(e) => setStartYear(e.target.value)}
                options={yearOptions} />
            </div>
          )}

          <TextareaField label="Catatan (opsional)"
            value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </Modal>

      <ConfirmDelete
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleCancel}
        loading={cancelling}
        title="Batalkan Pinjaman"
        description={cancelTarget ? `Batalkan pinjaman "${cancelTarget.title}" milik ${cancelTarget.nama_karyawan}? Potongan cicilan akan dihentikan.` : ""}
      />
    </div>
  )
}
