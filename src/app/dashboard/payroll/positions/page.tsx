"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SelectField } from "@/components/ui/form-field"
import { ConfirmDelete } from "@/components/ui/confirm-delete"
import { Plus, Pencil, CalendarX, RefreshCw, Trash2 } from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils"
import {
  getJabatanList,
  getJabatanSalaryComponents,
  endJabatanComponent,
  deleteJabatanComponent,
} from "@/actions/jabatan-salary"
import { getSalaryComponents } from "@/actions/salary-component"
import { JabatanComponentForm } from "@/components/payroll/JabatanComponentForm"
import type { SalaryComponentRow } from "@/components/payroll/SalaryComponentForm"

interface JabatanRow {
  id: number
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
  status: "active" | "upcoming" | "ended"
}

const METHOD_LABEL: Record<JabatanRow["calc_method"], string> = {
  FIXED: "Nominal Tetap", PERCENT: "Persentase", FORMULA: "Formula",
}

export default function JabatanSalaryPage() {
  const [jabatanList, setJabatanList] = useState<string[]>([])
  const [jabatan, setJabatan] = useState("")
  const [rows, setRows] = useState<JabatanRow[]>([])
  const [allComponents, setAllComponents] = useState<SalaryComponentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [rowsLoading, setRowsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editLocked, setEditLocked] = useState<SalaryComponentRow | null>(null)
  const [editValue, setEditValue] = useState(0)
  const [endTarget, setEndTarget] = useState<JabatanRow | null>(null)
  const [ending, setEnding] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<JabatanRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([getJabatanList(), getSalaryComponents()]).then(([jl, comps]) => {
      if (!active) return
      if (jl.success) {
        setJabatanList(jl.data as string[])
        if ((jl.data as string[]).length > 0) setJabatan((jl.data as string[])[0])
      } else setLoadError(jl.error)
      if (comps.success) setAllComponents(comps.data as unknown as SalaryComponentRow[])
      setLoading(false)
    })
    return () => { active = false }
  }, [])

  const loadRows = useCallback(async (jab: string) => {
    if (!jab) { setRows([]); return }
    setRowsLoading(true)
    const res = await getJabatanSalaryComponents(jab)
    if (res.success) setRows(res.data as JabatanRow[])
    else setLoadError(res.error)
    setRowsLoading(false)
  }, [])

  useEffect(() => {
    if (!jabatan) return
    let active = true
    getJabatanSalaryComponents(jabatan).then((res) => {
      if (!active) return
      if (res.success) setRows(res.data as JabatanRow[])
      else setLoadError(res.error)
      setRowsLoading(false)
    })
    return () => { active = false }
  }, [jabatan])

  const availableComponents = useMemo(() => {
    // Semua komponen aktif dapat dipilih — termasuk yang sudah di-set
    // (untuk menjadwalkan nilai/periode berikutnya).
    return allComponents.filter((c) => c.is_active)
  }, [allComponents])

  // Peta komponen → setting terkini (aktif/mendatang) untuk konteks di form.
  const existingByComponent = useMemo(() => {
    const map: Record<number, { value: number; effective_date: string; end_date: string | null; status: "active" | "upcoming" | "ended"; calc_method: string }> = {}
    for (const r of rows) {
      if (r.status === "ended") continue
      const cur = map[r.component_id]
      // Pilih record aktif/mendatang dengan effective_date terbaru.
      if (!cur || new Date(r.effective_date) > new Date(cur.effective_date)) {
        map[r.component_id] = { value: r.value, effective_date: r.effective_date, end_date: r.end_date, status: r.status, calc_method: r.calc_method }
      }
    }
    return map
  }, [rows])

  const openAdd = () => { setEditLocked(null); setEditValue(0); setFormOpen(true) }
  const openEdit = (row: JabatanRow) => {
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
    const res = await endJabatanComponent(endTarget.id, today)
    setEnding(false); setEndTarget(null)
    if (!res.success) { alert(res.error); return }
    loadRows(jabatan)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const res = await deleteJabatanComponent(deleteTarget.id)
    setDeleting(false); setDeleteTarget(null)
    if (!res.success) { alert(res.error); return }
    loadRows(jabatan)
  }

  const renderValue = (r: JabatanRow) => {
    if (r.calc_method === "FIXED") return <span className="font-mono">{formatCurrency(r.value)}</span>
    if (r.calc_method === "PERCENT") return <span className="font-mono text-xs">{r.value}% × {r.basis_code ?? "-"}</span>
    return <code className="text-xs">{r.formula_expression}</code>
  }

  const columns: Column<JabatanRow>[] = [
    { key: "name", header: "Komponen", cell: (r) => <div><p className="font-medium">{r.name}</p><p className="text-xs font-mono" style={{ color: "var(--text-subtle)" }}>{r.code}</p></div> },
    { key: "type", header: "Tipe", cell: (r) => <Badge variant={r.type === "EARNING" ? "success" : "destructive"}>{r.type === "EARNING" ? "Pendapatan" : "Potongan"}</Badge> },
    { key: "calc_method", header: "Metode", cell: (r) => METHOD_LABEL[r.calc_method] },
    { key: "value", header: "Nilai", cell: renderValue },
    { key: "effective_date", header: "Berlaku Sejak", cell: (r) => formatDate(r.effective_date) },
    { key: "end_date", header: "Sampai", cell: (r) => r.end_date ? formatDate(r.end_date) : <span style={{ color: "var(--text-subtle)" }}>—</span> },
    { key: "status", header: "Status", cell: (r) => {
      if (r.status === "active") return <Badge variant="success">Aktif</Badge>
      if (r.status === "upcoming") return <Badge variant="warning">Mendatang</Badge>
      return <Badge variant="secondary">Berakhir</Badge>
    } },
  ]

  const jabatanOptions = jabatanList.map((j) => ({ value: j, label: j }))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Komponen Gaji per Jabatan</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Set komponen (mis. Tunjangan Jabatan, Tunjangan Makan) berdasarkan jabatan. Nilai per individu tetap menang sebagai override.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => loadRows(jabatan)} disabled={!jabatan}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button size="sm" onClick={openAdd} disabled={!jabatan}><Plus className="h-3.5 w-3.5 mr-1.5" />Atur Komponen</Button>
        </div>
      </div>

      {loadError && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{loadError}</div>}

      <div className="flex flex-wrap items-end gap-3">
        <SelectField label="Jabatan" className="w-64" value={jabatan} onChange={(e) => { setRowsLoading(true); setJabatan(e.target.value) }}
          placeholder={loading ? "Memuat…" : "Pilih jabatan…"} options={jabatanOptions} />
      </div>

      {jabatan && (
        <DataTable
          data={rows as unknown as Record<string, unknown>[]}
          columns={columns as unknown as Column<Record<string, unknown>>[]}
          searchKeys={["code", "name"]}
          loading={rowsLoading}
          emptyMessage="Belum ada komponen untuk jabatan ini"
          actions={(row: Record<string, unknown>) => {
            const r = row as unknown as JabatanRow
            if (r.status === "ended") return <span className="text-xs" style={{ color: "var(--text-subtle)" }}>—</span>
            return (
              <div className="flex items-center justify-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--warning)" }} title="Ubah nilai" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                {r.status === "upcoming" ? (
                  <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }} title="Hapus record mendatang" onClick={() => setDeleteTarget(r)}><Trash2 className="h-3.5 w-3.5" /></Button>
                ) : (
                  <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--danger)" }} title="Akhiri komponen" onClick={() => setEndTarget(r)}><CalendarX className="h-3.5 w-3.5" /></Button>
                )}
              </div>
            )
          }}
        />
      )}

      <JabatanComponentForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        jabatan={jabatan}
        components={availableComponents}
        existingByComponent={existingByComponent}
        lockedComponent={editLocked}
        initialValue={editValue}
        onSaved={() => loadRows(jabatan)}
      />

      <ConfirmDelete
        open={!!endTarget}
        onClose={() => setEndTarget(null)}
        onConfirm={handleEnd}
        loading={ending}
        title="Akhiri Komponen Jabatan"
        description={endTarget ? `Akhiri komponen "${endTarget.name}" untuk jabatan "${jabatan}" per hari ini?` : ""}
      />

      <ConfirmDelete
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Hapus Record Mendatang"
        description={deleteTarget ? `Hapus komponen "${deleteTarget.name}" untuk jabatan "${jabatan}" yang belum berlaku (${formatDate(deleteTarget.effective_date)})?` : ""}
      />
    </div>
  )
}
