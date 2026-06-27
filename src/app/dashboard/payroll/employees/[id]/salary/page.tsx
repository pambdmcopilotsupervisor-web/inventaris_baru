"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { SelectField } from "@/components/ui/form-field"
import { ConfirmDelete } from "@/components/ui/confirm-delete"
import { Plus, Pencil, CalendarX, RefreshCw, ArrowLeft, Receipt } from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils"
import {
  getEmployeeSalaryComponents,
  getEmployeeSalaryHistory,
  getEmployeeBasic,
  endSalaryComponent,
} from "@/actions/employee-salary"
import { getSalaryComponents } from "@/actions/salary-component"
import { getEmployeeTaxProfile, updateEmployeeTaxProfile, getPtkpOptions } from "@/actions/payroll-tax"
import { Modal } from "@/components/ui/modal"
import { AssignComponentForm } from "@/components/payroll/AssignComponentForm"
import type { SalaryComponentRow } from "@/components/payroll/SalaryComponentForm"

interface EnrichedRow {
  id: number
  source: "employee" | "jabatan"
  component_id: number
  value: number
  effective_date: string
  end_date: string | null
  code: string
  name: string
  type: "EARNING" | "DEDUCTION"
  calc_method: "FIXED" | "PERCENT" | "FORMULA"
  formula_expression: string | null
  basis_component_id: number | null
  basis_code: string | null
  basis_name: string | null
  calc_order: number
  amount: number | null
}

interface EmployeeBasic {
  id: number; nik: string; nama_karyawan: string; jabatan: string
  status_karyawan: string | null; nama_divisi: string | null; nama_subdivisi: string | null
}

const METHOD_LABEL: Record<EnrichedRow["calc_method"], string> = {
  FIXED: "Nominal Tetap", PERCENT: "Persentase", FORMULA: "Formula",
}

export default function EmployeeSalaryPage() {
  const params = useParams<{ id: string }>()
  const employeeId = Number(params.id)

  const [tab, setTab] = useState<"active" | "history">("active")
  const [employee, setEmployee] = useState<EmployeeBasic | null>(null)
  const [rows, setRows] = useState<EnrichedRow[]>([])
  const [totals, setTotals] = useState({ earnings: 0, deductions: 0 })
  const [allComponents, setAllComponents] = useState<SalaryComponentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editLocked, setEditLocked] = useState<SalaryComponentRow | null>(null)
  const [editValue, setEditValue] = useState<number>(0)

  const [endTarget, setEndTarget] = useState<EnrichedRow | null>(null)
  const [ending, setEnding] = useState(false)

  const [taxProfile, setTaxProfile] = useState<{ status_ptkp: string; punya_npwp: boolean } | null>(null)
  const [ptkpOptions, setPtkpOptions] = useState<{ kode: string; nama: string }[]>([])
  const [taxModal, setTaxModal] = useState(false)
  const [taxForm, setTaxForm] = useState<{ status_ptkp: string; punya_npwp: boolean }>({ status_ptkp: "TK/0", punya_npwp: true })
  const [savingTax, setSavingTax] = useState(false)

  const loadComponents = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const res = await getEmployeeSalaryComponents(employeeId)
    if (res.success) {
      setRows(res.data.rows as EnrichedRow[])
      setTotals({ earnings: res.data.totalEarnings, deductions: res.data.totalDeductions })
    } else {
      setLoadError(res.error)
    }
    setLoading(false)
  }, [employeeId])

  useEffect(() => {
    let active = true
    Promise.all([
      getEmployeeBasic(employeeId),
      getEmployeeSalaryComponents(employeeId),
      getSalaryComponents(),
      getEmployeeTaxProfile(employeeId),
      getPtkpOptions(),
    ]).then(([emp, comps, all, tax, ptkp]) => {
      if (!active) return
      if (emp.success) setEmployee(emp.data)
      if (comps.success) {
        setRows(comps.data.rows as EnrichedRow[])
        setTotals({ earnings: comps.data.totalEarnings, deductions: comps.data.totalDeductions })
      } else setLoadError(comps.error)
      if (all.success) setAllComponents(all.data as unknown as SalaryComponentRow[])
      if (tax.success) { setTaxProfile(tax.data); setTaxForm(tax.data) }
      if (ptkp.success) setPtkpOptions(ptkp.data as { kode: string; nama: string }[])
      setLoading(false)
    })
    return () => { active = false }
  }, [employeeId])

  // Peta nilai FIXED untuk resolve preview PERCENT.
  const basisValues = useMemo(() => {
    const map: Record<number, number> = {}
    for (const r of rows) if (r.calc_method === "FIXED") map[r.component_id] = r.value
    return map
  }, [rows])

  // Semua komponen aktif dapat dipilih (termasuk yang sudah di-set, untuk
  // menjadwalkan nilai/periode berikutnya atau meng-override default jabatan).
  const availableComponents = useMemo(() => {
    return allComponents.filter((c) => c.is_active)
  }, [allComponents])

  // Peta komponen → setting efektif saat ini (untuk konteks di form).
  const existingByComponent = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const map: Record<number, { value: number; effective_date: string; end_date: string | null; status: "active" | "upcoming" | "ended"; calc_method: string; source: "employee" | "jabatan" }> = {}
    for (const r of rows) {
      const eff = new Date(r.effective_date); eff.setHours(0, 0, 0, 0)
      const end = r.end_date ? new Date(r.end_date) : null
      if (end) end.setHours(0, 0, 0, 0)
      const status: "active" | "upcoming" | "ended" = end && end < today ? "ended" : eff > today ? "upcoming" : "active"
      map[r.component_id] = { value: r.value, effective_date: r.effective_date, end_date: r.end_date, status, calc_method: r.calc_method, source: r.source }
    }
    return map
  }, [rows])

  const openAdd = () => { setEditLocked(null); setEditValue(0); setFormOpen(true) }
  const openEdit = (row: EnrichedRow) => {
    const full = allComponents.find((c) => c.id === row.component_id) ?? ({
      id: row.component_id, code: row.code, name: row.name, type: row.type,
      calc_method: row.calc_method, formula_expression: row.formula_expression,
      basis_component_id: row.basis_component_id, calc_order: row.calc_order,
      is_taxable: false, is_active: true,
      basis_component: row.basis_name ? { id: row.basis_component_id ?? 0, code: row.basis_code ?? "", name: row.basis_name } : null,
    } as SalaryComponentRow)
    setEditLocked(full); setEditValue(row.value); setFormOpen(true)
  }

  const handleEnd = async () => {
    if (!endTarget) return
    setEnding(true)
    const today = new Date().toISOString().slice(0, 10)
    const res = await endSalaryComponent(endTarget.id, today)
    setEnding(false)
    setEndTarget(null)
    if (!res.success) { alert(res.error); return }
    loadComponents()
  }

  const saveTaxProfile = async () => {
    setSavingTax(true)
    const res = await updateEmployeeTaxProfile({ employee_id: employeeId, ...taxForm })
    setSavingTax(false)
    if (!res.success) { alert(res.error); return }
    setTaxProfile(res.data); setTaxModal(false)
  }

  const renderValue = (r: EnrichedRow) => {
    if (r.calc_method === "FIXED") return <span className="font-mono">{formatCurrency(r.value)}</span>
    if (r.calc_method === "PERCENT") {
      return (
        <span className="font-mono text-xs">
          {r.value}% × {r.basis_code ?? "-"}
          {r.amount != null && <span className="ml-1" style={{ color: "var(--text-subtle)" }}>= {formatCurrency(r.amount)}</span>}
        </span>
      )
    }
    return <code className="text-xs">{r.formula_expression}</code>
  }

  const columns: Column<EnrichedRow>[] = [
    { key: "name", header: "Komponen", cell: (r) => (
      <div><p className="font-medium">{r.name}</p><p className="text-xs font-mono" style={{ color: "var(--text-subtle)" }}>{r.code}</p></div>
    )},
    { key: "type", header: "Tipe", cell: (r) => (
      <Badge variant={r.type === "EARNING" ? "success" : "destructive"}>{r.type === "EARNING" ? "Pendapatan" : "Potongan"}</Badge>
    )},
    { key: "calc_method", header: "Metode Kalkulasi", cell: (r) => METHOD_LABEL[r.calc_method] },
    { key: "value", header: "Nilai", cell: renderValue },
    { key: "source", header: "Sumber", cell: (r) => (
      <Badge variant={r.source === "jabatan" ? "info" : "secondary"}>{r.source === "jabatan" ? "Jabatan" : "Individu"}</Badge>
    )},
    { key: "effective_date", header: "Berlaku Sejak", cell: (r) => formatDate(r.effective_date) },
  ]

  return (
    <div className="space-y-5">
      {/* Header karyawan */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => history.back()}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>{employee?.nama_karyawan ?? "Karyawan"}</h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
              {employee?.jabatan}{employee?.nama_divisi ? ` • ${employee.nama_divisi}` : ""}{employee?.nama_subdivisi ? ` • ${employee.nama_subdivisi}` : ""}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadComponents}><RefreshCw className="h-3.5 w-3.5" /></Button>
          {tab === "active" && <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1.5" />Atur Komponen</Button>}
        </div>
      </div>

      {loadError && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{loadError}</div>}

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Total Pendapatan</p>
          <p className="text-2xl font-bold font-mono mt-0.5" style={{ color: "var(--success)" }}>{loading ? "…" : formatCurrency(totals.earnings)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Total Potongan</p>
          <p className="text-2xl font-bold font-mono mt-0.5" style={{ color: "var(--danger)" }}>{loading ? "…" : formatCurrency(totals.deductions)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Estimasi Gaji Bersih</p>
          <p className="text-2xl font-bold font-mono mt-0.5" style={{ color: "var(--primary)" }}>{loading ? "…" : formatCurrency(totals.earnings - totals.deductions)}</p>
        </CardContent></Card>
      </div>

      {/* Profil Pajak */}
      <Card><CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Receipt className="h-5 w-5" style={{ color: "var(--primary)" }} />
          <div>
            <span className="text-xs" style={{ color: "var(--text-subtle)" }}>Profil Pajak (PPh21)</span>
            <div className="flex items-center gap-2 mt-0.5 text-sm font-semibold flex-wrap">
              <span>Status PTKP: <span className="font-mono">{taxProfile?.status_ptkp ?? "—"}</span></span>
              <span style={{ color: "var(--border-strong)" }}>•</span>
              <span className="flex items-center gap-1">
                NPWP: {taxProfile ? (taxProfile.punya_npwp ? <Badge variant="success">Ada</Badge> : <Badge variant="warning">Tidak (+20%)</Badge>) : "—"}
              </span>
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => { if (taxProfile) setTaxForm(taxProfile); setTaxModal(true) }}><Pencil className="h-3.5 w-3.5 mr-1.5" />Ubah Profil Pajak</Button>
      </CardContent></Card>

      {/* Tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: "var(--border)" }}>
        {([["active", "Komponen Aktif"], ["history", "Riwayat Perubahan"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors"
            style={{
              borderColor: tab === key ? "var(--primary)" : "transparent",
              color: tab === key ? "var(--primary)" : "var(--text-subtle)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "active" ? (
        <DataTable
          data={rows as unknown as Record<string, unknown>[]}
          columns={columns as unknown as Column<Record<string, unknown>>[]}
          searchKeys={["code", "name"]}
          loading={loading}
          emptyMessage="Belum ada komponen gaji yang di-assign"
          actions={(row: Record<string, unknown>) => {
            const r = row as unknown as EnrichedRow
            if (r.source === "jabatan") {
              return (
                <div className="flex items-center justify-center gap-1">
                  <Button variant="ghost" size="sm" style={{ color: "var(--primary)" }} title="Override nilai khusus karyawan ini" onClick={() => openEdit(r)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" />Override
                  </Button>
                </div>
              )
            }
            return (
              <div className="flex items-center justify-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--warning)" }} title="Ubah nilai" onClick={() => openEdit(r)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }} title="Akhiri komponen" onClick={() => setEndTarget(r)}>
                  <CalendarX className="h-3.5 w-3.5" />
                </Button>
              </div>
            )
          }}
        />
      ) : (
        <HistoryTab employeeId={employeeId} components={allComponents} />
      )}

      <AssignComponentForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        employeeId={employeeId}
        components={availableComponents}
        existingByComponent={existingByComponent}
        basisValues={basisValues}
        lockedComponent={editLocked}
        initialValue={editValue}
        onSaved={loadComponents}
      />

      <ConfirmDelete
        open={!!endTarget}
        onClose={() => setEndTarget(null)}
        onConfirm={handleEnd}
        loading={ending}
        title="Akhiri Komponen Gaji"
        description={endTarget ? `Akhiri komponen "${endTarget.name}" per hari ini? Komponen tidak lagi dihitung pada periode berikutnya.` : ""}
      />

      <Modal open={taxModal} onClose={() => setTaxModal(false)} title="Profil Pajak Karyawan" size="sm"
        footer={<><Button variant="outline" onClick={() => setTaxModal(false)} disabled={savingTax}>Batal</Button><Button onClick={saveTaxProfile} disabled={savingTax}>{savingTax ? "Menyimpan..." : "Simpan"}</Button></>}>
        <div className="space-y-4">
          <SelectField label="Status PTKP" value={taxForm.status_ptkp} onChange={(e) => setTaxForm({ ...taxForm, status_ptkp: e.target.value })}
            options={ptkpOptions.map((p) => ({ value: p.kode, label: `${p.kode} — ${p.nama}` }))} />
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--text-muted)" }}>
            <input type="checkbox" className="h-4 w-4" checked={taxForm.punya_npwp} onChange={(e) => setTaxForm({ ...taxForm, punya_npwp: e.target.checked })} /> Memiliki NPWP
          </label>
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Tanpa NPWP dikenakan tarif PPh21 lebih tinggi (+20%).</p>
        </div>
      </Modal>
    </div>
  )
}

// ─── Tab Riwayat ─────────────────────────────────────────────────
interface HistoryRow {
  id: number; value: number; effective_date: string; end_date: string | null
  salary_components: { code: string; name: string }
}

function HistoryTab({ employeeId, components }: { employeeId: number; components: SalaryComponentRow[] }) {
  const [componentId, setComponentId] = useState("")
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!componentId) return
    let active = true
    getEmployeeSalaryHistory(employeeId, Number(componentId)).then((res) => {
      if (!active) return
      setHistory(res.success ? (res.data as unknown as HistoryRow[]) : [])
      setLoading(false)
    })
    return () => { active = false }
  }, [componentId, employeeId])

  const options = components.map((c) => ({ value: String(c.id), label: `${c.code} — ${c.name}` }))

  const columns: Column<HistoryRow>[] = [
    { key: "value", header: "Nilai", cell: (r) => <span className="font-mono">{formatCurrency(r.value)}</span> },
    { key: "effective_date", header: "Berlaku Sejak", cell: (r) => formatDate(r.effective_date) },
    { key: "end_date", header: "Berakhir", cell: (r) => {
      if (r.end_date) return formatDate(r.end_date)
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const eff = new Date(r.effective_date); eff.setHours(0, 0, 0, 0)
      return eff > today ? <Badge variant="warning">Mendatang</Badge> : <Badge variant="success">Aktif</Badge>
    } },
  ]

  return (
    <div className="space-y-3">
      <SelectField label="Pilih Komponen" placeholder="Pilih komponen untuk lihat riwayat…" options={options} value={componentId} onChange={(e) => { setLoading(true); setComponentId(e.target.value) }} className="w-72" />
      {componentId && (
        <DataTable
          data={history as unknown as Record<string, unknown>[]}
          columns={columns as unknown as Column<Record<string, unknown>>[]}
          searchable={false}
          loading={loading}
          emptyMessage="Belum ada riwayat untuk komponen ini"
        />
      )}
    </div>
  )
}
