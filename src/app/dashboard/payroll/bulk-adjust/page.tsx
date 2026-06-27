"use client"

import React, { useEffect, useMemo, useState } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { SelectField, TextField } from "@/components/ui/form-field"
import { Card, CardContent } from "@/components/ui/card"
import { Eye, CheckCircle2 } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import {
  getBulkComponents,
  getBulkJabatanList,
  previewBulkAdjust,
  applyBulkAdjust,
} from "@/actions/bulk-salary"

interface CompOpt { id: number; code: string; name: string; type: string }
interface PreviewRow {
  employee_id: number; nama_karyawan: string; nik: string; jabatan: string
  current_value: number; new_value: number; delta: number
}

export default function BulkAdjustPage() {
  const [components, setComponents] = useState<CompOpt[]>([])
  const [jabatanList, setJabatanList] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const [componentId, setComponentId] = useState("")
  const [scope, setScope] = useState<"ALL" | "JABATAN">("ALL")
  const [jabatan, setJabatan] = useState("")
  const [mode, setMode] = useState<"PERCENT" | "NOMINAL_ADD" | "NOMINAL_SET">("PERCENT")
  const [value, setValue] = useState("")
  const [effectiveDate, setEffectiveDate] = useState(() => {
    const n = new Date()
    return new Date(n.getFullYear(), n.getMonth() + 1, 1).toISOString().slice(0, 10)
  })

  const [preview, setPreview] = useState<{ component: { code: string; name: string }; count: number; rows: PreviewRow[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([getBulkComponents(), getBulkJabatanList()]).then(([comps, jab]) => {
      if (!active) return
      if (comps.success) setComponents(comps.data as CompOpt[])
      if (jab.success) setJabatanList(jab.data as string[])
      setLoading(false)
    })
    return () => { active = false }
  }, [])

  const buildInput = () => ({
    component_id: componentId, scope, jabatan, mode, value, effective_date: effectiveDate,
  })

  const handlePreview = async () => {
    setBusy(true); setError(null); setNotice(null); setPreview(null)
    const res = await previewBulkAdjust(buildInput())
    setBusy(false)
    if (!res.success) { setError(res.error); return }
    setPreview(res.data as unknown as typeof preview)
  }

  const handleApply = async () => {
    if (!preview) return
    if (!confirm(`Terapkan penyesuaian ke ${preview.count} karyawan? Record gaji baru akan dibuat berlaku ${effectiveDate}.`)) return
    setBusy(true); setError(null); setNotice(null)
    const res = await applyBulkAdjust(buildInput())
    setBusy(false)
    if (!res.success) { setError(res.error); return }
    const d = res.data as { applied: number; skipped: number; total: number }
    setNotice(`Selesai: ${d.applied} diterapkan, ${d.skipped} dilewati (tanpa perubahan), total ${d.total}.`)
    setPreview(null)
  }

  const MODE_LABEL: Record<typeof mode, string> = {
    PERCENT: "Naik/turun persen (%)", NOMINAL_ADD: "Tambah nominal (Rp)", NOMINAL_SET: "Set nominal (Rp)",
  }

  const totalDelta = useMemo(() => preview?.rows.reduce((s, r) => s + r.delta, 0) ?? 0, [preview])

  const columns: Column<PreviewRow>[] = [
    { key: "nama_karyawan", header: "Karyawan", cell: (r) => <div><p className="font-medium">{r.nama_karyawan}</p><p className="text-xs" style={{ color: "var(--text-subtle)" }}>{r.jabatan}</p></div> },
    { key: "current_value", header: "Nilai Saat Ini", cell: (r) => <span className="font-mono">{formatCurrency(r.current_value)}</span> },
    { key: "new_value", header: "Nilai Baru", cell: (r) => <span className="font-mono font-semibold" style={{ color: "var(--primary)" }}>{formatCurrency(r.new_value)}</span> },
    { key: "delta", header: "Selisih", cell: (r) => <span className="font-mono" style={{ color: r.delta >= 0 ? "var(--success)" : "var(--danger)" }}>{r.delta >= 0 ? "+" : ""}{formatCurrency(r.delta)}</span> },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Penyesuaian Gaji Massal</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Naikkan/ubah satu komponen gaji (FIXED) untuk banyak karyawan sekaligus. Membuat override per karyawan yang berlaku sejak tanggal dipilih.</p>
      </div>

      {error && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</div>}
      {notice && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--surface-hover)", color: "var(--text-muted)" }}>{notice}</div>}

      <Card><CardContent className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SelectField label="Komponen (FIXED)" value={componentId} onChange={(e) => setComponentId(e.target.value)}
            placeholder={loading ? "Memuat…" : "Pilih komponen…"}
            options={components.map((c) => ({ value: String(c.id), label: `${c.code} — ${c.name} (${c.type === "EARNING" ? "Pendapatan" : "Potongan"})` }))} />
          <TextField label="Tanggal Berlaku Sejak" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SelectField label="Scope" value={scope} onChange={(e) => setScope(e.target.value as "ALL" | "JABATAN")}
            options={[{ value: "ALL", label: "Semua karyawan aktif" }, { value: "JABATAN", label: "Per jabatan" }]} />
          {scope === "JABATAN" ? (
            <SelectField label="Jabatan" value={jabatan} onChange={(e) => setJabatan(e.target.value)}
              placeholder="Pilih jabatan…" options={jabatanList.map((j) => ({ value: j, label: j }))} />
          ) : <div />}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SelectField label="Mode Penyesuaian" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}
            options={[{ value: "PERCENT", label: MODE_LABEL.PERCENT }, { value: "NOMINAL_ADD", label: MODE_LABEL.NOMINAL_ADD }, { value: "NOMINAL_SET", label: MODE_LABEL.NOMINAL_SET }]} />
          <TextField label={mode === "PERCENT" ? "Persen (%)" : "Nominal (Rp)"} type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder={mode === "PERCENT" ? "mis. 10 untuk +10%" : "mis. 500000"} />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePreview} disabled={busy || !componentId || value === ""}><Eye className="h-3.5 w-3.5 mr-1.5" />{busy ? "Memproses…" : "Pratinjau"}</Button>
          {preview && <Button onClick={handleApply} disabled={busy}><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Terapkan ke {preview.count} Karyawan</Button>}
        </div>
      </CardContent></Card>

      {preview && (
        <>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span style={{ color: "var(--text-muted)" }}>Komponen: <b>{preview.component.code}</b></span>
            <span style={{ color: "var(--text-muted)" }}>{preview.count} karyawan</span>
            <span style={{ color: "var(--text-muted)" }}>Total kenaikan: <b className="font-mono" style={{ color: totalDelta >= 0 ? "var(--success)" : "var(--danger)" }}>{totalDelta >= 0 ? "+" : ""}{formatCurrency(totalDelta)}</b>/bulan</span>
          </div>
          <DataTable
            data={preview.rows as unknown as Record<string, unknown>[]}
            columns={columns as unknown as Column<Record<string, unknown>>[]}
            searchKeys={["nama_karyawan", "nik"]}
            emptyMessage="Tidak ada karyawan"
          />
        </>
      )}
    </div>
  )
}
