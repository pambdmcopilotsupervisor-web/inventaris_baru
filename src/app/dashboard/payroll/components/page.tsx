"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SelectField } from "@/components/ui/form-field"
import { Plus, Pencil, RefreshCw, Power } from "lucide-react"
import {
  getSalaryComponents,
  toggleSalaryComponent,
} from "@/actions/salary-component"
import { SalaryComponentForm, type SalaryComponentRow } from "@/components/payroll/SalaryComponentForm"

const METHOD_LABEL: Record<SalaryComponentRow["calc_method"], string> = {
  FIXED: "Nominal Tetap",
  PERCENT: "Persentase",
  FORMULA: "Formula",
}

const TYPE_FILTER = [
  { value: "", label: "Semua Tipe" },
  { value: "EARNING", label: "Pendapatan" },
  { value: "DEDUCTION", label: "Potongan" },
]
const STATUS_FILTER = [
  { value: "", label: "Semua Status" },
  { value: "active", label: "Aktif" },
  { value: "inactive", label: "Nonaktif" },
]

export default function SalaryComponentsPage() {
  const [rows, setRows] = useState<SalaryComponentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [typeFilter, setTypeFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("")

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<SalaryComponentRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const res = await getSalaryComponents()
    if (res.success) setRows(res.data as unknown as SalaryComponentRow[])
    else setLoadError(res.error)
    setLoading(false)
  }, [])

  useEffect(() => {
    let active = true
    getSalaryComponents().then((res) => {
      if (!active) return
      if (res.success) setRows(res.data as unknown as SalaryComponentRow[])
      else setLoadError(res.error)
      setLoading(false)
    })
    return () => { active = false }
  }, [])

  const openAdd = () => { setEditing(null); setFormOpen(true) }
  const openEdit = (row: SalaryComponentRow) => { setEditing(row); setFormOpen(true) }

  const handleToggle = async (row: SalaryComponentRow) => {
    // Optimistic update
    const prev = rows
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, is_active: !r.is_active } : r)))
    const res = await toggleSalaryComponent(row.id)
    if (!res.success) {
      setRows(prev) // revert
      alert(res.error)
    }
  }

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (typeFilter && r.type !== typeFilter) return false
      if (statusFilter === "active" && !r.is_active) return false
      if (statusFilter === "inactive" && r.is_active) return false
      return true
    })
  }, [rows, typeFilter, statusFilter])

  const renderValue = (r: SalaryComponentRow) => {
    if (r.calc_method === "FIXED") return <span style={{ color: "var(--text-subtle)" }}>Per karyawan</span>
    if (r.calc_method === "PERCENT") {
      return (
        <span className="font-mono text-xs">
          {r.default_rate ?? r.formula_expression ?? "0"}%{r.basis_component ? ` × ${r.basis_component.code}` : ""}
        </span>
      )
    }
    return <code className="text-xs">{r.formula_expression}</code>
  }

  const columns: Column<SalaryComponentRow>[] = [
    { key: "code", header: "Kode", cell: (r) => <span className="font-mono font-semibold">{r.code}</span> },
    { key: "name", header: "Nama", cell: (r) => <span className="font-medium">{r.name}</span> },
    {
      key: "type", header: "Tipe",
      cell: (r) => (
        <Badge variant={r.type === "EARNING" ? "success" : "destructive"}>
          {r.type === "EARNING" ? "Pendapatan" : "Potongan"}
        </Badge>
      ),
    },
    { key: "calc_method", header: "Metode", cell: (r) => METHOD_LABEL[r.calc_method] },
    { key: "formula_expression", header: "Nilai / Formula", cell: renderValue },
    { key: "calc_order", header: "Urutan", cell: (r) => <span className="font-mono">{r.calc_order}</span> },
    {
      key: "is_active", header: "Status",
      cell: (r) => (
        <Badge variant={r.is_active ? "success" : "secondary"}>{r.is_active ? "Aktif" : "Nonaktif"}</Badge>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Komponen Gaji</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
            Konfigurasi jenis komponen gaji (pendapatan & potongan) yang tersedia di sistem payroll
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1.5" />Tambah Komponen</Button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{loadError}</div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <SelectField label="Filter Tipe" options={TYPE_FILTER} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-48" />
        <SelectField label="Filter Status" options={STATUS_FILTER} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-48" />
      </div>

      <DataTable
        data={filtered as unknown as Record<string, unknown>[]}
        columns={columns as unknown as Column<Record<string, unknown>>[]}
        searchKeys={["code", "name"]}
        loading={loading}
        actions={(row: Record<string, unknown>) => {
          const r = row as unknown as SalaryComponentRow
          return (
            <div className="flex items-center justify-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--warning)" }} onClick={() => openEdit(r)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost" size="icon" className="h-7 w-7"
                style={{ color: r.is_active ? "var(--danger)" : "var(--success)" }}
                title={r.is_active ? "Nonaktifkan" : "Aktifkan"}
                onClick={() => handleToggle(r)}
              >
                <Power className="h-3.5 w-3.5" />
              </Button>
            </div>
          )
        }}
      />

      <SalaryComponentForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        component={editing}
        components={rows}
        onSaved={load}
      />
    </div>
  )
}
