"use client"

import React, { useCallback, useEffect, useState } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { TextField, SelectField } from "@/components/ui/form-field"
import { Calendar, Plus, RefreshCw, Lock, Unlock } from "lucide-react"
import {
  getPeriodeFiskal, createPeriodeFiskal, updateStatusPeriode,
  type PeriodeFiskalRow,
} from "@/actions/keuangan-periode"
import { createJurnalPenutup } from "@/actions/keuangan-jurnal"

const MONTHS = [
  "","Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember",
]

const BULAN_OPTIONS = MONTHS.slice(1).map((m, i) => ({ value: String(i + 1), label: m }))

const STATUS_VARIANT: Record<string, string> = {
  BUKA: "success",
  TUTUP: "warning",
  KUNCI: "destructive",
}

const STATUS_NEXT: Record<string, { label: string; next: "TUTUP" | "KUNCI" } | null> = {
  BUKA: { label: "Tutup Periode", next: "TUTUP" },
  TUTUP: { label: "Kunci Periode", next: "KUNCI" },
  KUNCI: null,
}

export default function PeriodeFiskalPage() {
  const now = new Date()
  const [rows, setRows] = useState<PeriodeFiskalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState({ tahun: String(now.getFullYear()), bulan: String(now.getMonth() + 1), catatan: "" })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await getPeriodeFiskal()
    if (res.success) setRows(res.data)
    else setLoadError(res.error)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCreate() {
    setSaving(true)
    setFormError(null)
    const res = await createPeriodeFiskal({ tahun: Number(form.tahun), bulan: Number(form.bulan), catatan: form.catatan || undefined })
    setSaving(false)
    if (res.success) { setFormOpen(false); load() }
    else setFormError(res.error)
  }

  async function handleStatusChange(row: PeriodeFiskalRow, next: "TUTUP" | "KUNCI") {
    if (!confirm(`Yakin ingin mengubah status periode "${row.nama}" menjadi ${next}? Tindakan ini tidak dapat dibatalkan.`)) return
    const res = await updateStatusPeriode(row.id, next)
    if (res.success) load()
    else alert(res.error)
  }

  async function handleCreateClosing(row: PeriodeFiskalRow) {
    if (!confirm(`Buat jurnal penutup untuk periode "${row.nama}"? Jurnal akan dibuat sebagai DRAFT untuk direview sebelum posting.`)) return
    const res = await createJurnalPenutup(row.id)
    if (res.success) alert(`Jurnal penutup berhasil dibuat: ${res.data.nomor_jurnal}`)
    else alert(res.error)
  }

  const columns: Column<PeriodeFiskalRow>[] = [
    { key: "nama", header: "Periode", cell: (r) => <span className="font-medium">{r.nama}</span> },
    {
      key: "tgl_mulai", header: "Tanggal",
      cell: (r) => (
        <span className="text-sm">
          {new Date(r.tgl_mulai).toLocaleDateString("id-ID")} — {new Date(r.tgl_selesai).toLocaleDateString("id-ID")}
        </span>
      ),
    },
    {
      key: "status", header: "Status",
      cell: (r) => <Badge variant={STATUS_VARIANT[r.status] as never}>{r.status}</Badge>,
    },
    { key: "catatan", header: "Catatan", cell: (r) => r.catatan ?? "—" },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5" style={{ color: "var(--primary)" }} />
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-900)" }}>Periode Fiskal</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button onClick={() => { setFormError(null); setFormOpen(true) }}>
            <Plus className="h-4 w-4 mr-1" />Buat Periode
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="p-3 rounded-lg text-sm" style={{ background: "rgba(220,38,38,0.08)", color: "rgb(220,38,38)" }}>
          {loadError}
        </div>
      )}

      <DataTable
        columns={columns as unknown as Column<Record<string, unknown>>[]}
        data={rows as unknown as Record<string, unknown>[]}
        loading={loading}
        emptyMessage="Belum ada periode fiskal"
        searchKeys={["nama"]}
        actions={(row) => {
          const r = row as unknown as PeriodeFiskalRow
          const next = STATUS_NEXT[r.status]
          if (!next) return <span className="text-xs" style={{ color: "var(--text-subtle)" }}>Terkunci</span>
          return (
            <div className="flex gap-1 justify-end">
              {r.status === "BUKA" && (
                <Button size="sm" variant="ghost" onClick={() => handleCreateClosing(r)}>
                  Jurnal Penutup
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => handleStatusChange(r, next.next)}>
                {next.next === "KUNCI" ? <Lock className="h-3.5 w-3.5 mr-1" /> : <Unlock className="h-3.5 w-3.5 mr-1" />}
                {next.label}
              </Button>
            </div>
          )
        }}
      />

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="Buat Periode Fiskal Baru" size="sm">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Tahun *" value={form.tahun} onChange={(e) => setForm({ ...form, tahun: e.target.value })} type="number" />
            <SelectField label="Bulan *" value={form.bulan} onChange={(e) => setForm({ ...form, bulan: e.target.value })} options={BULAN_OPTIONS} />
          </div>
          <TextField label="Catatan" value={form.catatan} onChange={(e) => setForm({ ...form, catatan: e.target.value })} />
          {formError && <p className="text-sm" style={{ color: "rgb(220,38,38)" }}>{formError}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Batal</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? "Membuat…" : "Buat"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
