"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { TextField, SelectField } from "@/components/ui/form-field"
import { BookOpen, Plus, RefreshCw, Send, Trash2, Pencil, Eye } from "lucide-react"
import {
  getJurnals, getJurnalById, createJurnal, updateJurnal, deleteJurnal, postJurnal,
  type JurnalRow, type JurnalDetailInput,
} from "@/actions/keuangan-jurnal"
import { getPeriodeFiskal, type PeriodeFiskalRow } from "@/actions/keuangan-periode"
import { getAkun, type AkunRow } from "@/actions/keuangan-akun"
import { AkunCombobox, type AkunOption } from "@/components/keuangan/AkunCombobox"
import { rp, formatThousand, parseThousand } from "@/lib/keuangan/format"

const JENIS_OPTIONS = [
  { value: "", label: "Semua Jenis" },
  { value: "UMUM", label: "Jurnal Umum" },
  { value: "PENYESUAIAN", label: "Penyesuaian" },
  { value: "PENUTUP", label: "Penutup" },
  { value: "BALIK", label: "Balik" },
  { value: "KHUSUS", label: "Khusus" },
]

const JENIS_FORM = JENIS_OPTIONS.slice(1)

const STATUS_VARIANT: Record<string, string> = {
  DRAFT: "secondary",
  POSTED: "success",
}

type DetailLine = {
  akun_id: string
  keterangan: string
  debit: string
  kredit: string
}

const emptyLine = (): DetailLine => ({ akun_id: "", keterangan: "", debit: "", kredit: "" })

export default function JurnalPage() {
  const now = new Date()
  const [rows, setRows] = useState<JurnalRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [periode, setPeriode] = useState<PeriodeFiskalRow[]>([])
  const [akuns, setAkuns] = useState<AkunRow[]>([])

  const [filterPeriode, setFilterPeriode] = useState("")
  const [filterStatus, setFilterStatus] = useState("")
  const [filterJenis, setFilterJenis] = useState("")

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState({
    tanggal: now.toISOString().split("T")[0],
    keterangan: "",
    jenis: "UMUM",
    periode_id: "",
  })
  const [lines, setLines] = useState<DetailLine[]>([emptyLine(), emptyLine()])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)

  const [viewJurnal, setViewJurnal] = useState<JurnalRow | null>(null)

  // Pre-load
  useEffect(() => {
    getPeriodeFiskal().then((r) => {
      if (r.success) setPeriode(r.data)
    })
    getAkun({ is_detail: true, is_active: true }).then((r) => {
      if (r.success) setAkuns(r.data)
    })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const res = await getJurnals({
      periode_id: filterPeriode ? Number(filterPeriode) : undefined,
      status: filterStatus || undefined,
      jenis: filterJenis || undefined,
    })
    if (res.success) { setRows(res.data.rows); setTotal(res.data.total) }
    else setLoadError(res.error)
    setLoading(false)
  }, [filterPeriode, filterStatus, filterJenis])

  useEffect(() => { load() }, [load])

  const periodeOptions = useMemo(() => [
    { value: "", label: "Semua Periode" },
    ...periode.map((p) => ({ value: String(p.id), label: p.nama })),
  ], [periode])

  const akunOptions = useMemo<AkunOption[]>(() =>
    akuns.map((a) => ({ id: a.id, kode: a.kode, nama: a.nama, jenis: a.jenis })),
    [akuns]
  )

  const periodeFormOptions = useMemo(() =>
    periode.filter((p) => p.status !== "KUNCI").map((p) => ({ value: String(p.id), label: p.nama })),
    [periode]
  )

  // Balance check
  const totalDebit = lines.reduce((s, l) => s + parseThousand(l.debit), 0)
  const totalKredit = lines.reduce((s, l) => s + parseThousand(l.kredit), 0)
  const isBalance = Math.abs(totalDebit - totalKredit) < 0.01

  function updateLine(idx: number, field: keyof DetailLine, val: string) {
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, [field]: val } : l))
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()])
  }

  function removeLine(idx: number) {
    if (lines.length <= 2) return
    setLines((prev) => prev.filter((_, i) => i !== idx))
  }

  function openCreate() {
    setEditingId(null)
    setForm({ tanggal: now.toISOString().split("T")[0], keterangan: "", jenis: "UMUM", periode_id: "" })
    setLines([emptyLine(), emptyLine()])
    setFormError(null)
    setFormOpen(true)
  }

  async function openEdit(row: JurnalRow) {
    const res = await getJurnalById(row.id)
    if (!res.success) { alert(res.error); return }
    const j = res.data
    setEditingId(j.id)
    setForm({
      tanggal: new Date(j.tanggal).toISOString().split("T")[0],
      keterangan: j.keterangan,
      jenis: j.jenis,
      periode_id: String(j.periode_id),
    })
    setLines(
      (j.details ?? []).map((d) => ({
        akun_id: String(d.akun_id),
        keterangan: d.keterangan ?? "",
        debit: d.debit ? formatThousand(d.debit) : "",
        kredit: d.kredit ? formatThousand(d.kredit) : "",
      }))
    )
    setFormError(null)
    setFormOpen(true)
  }

  async function handleSave() {
    if (!form.tanggal || !form.keterangan || !form.periode_id) {
      setFormError("Lengkapi tanggal, keterangan, dan periode"); return
    }
    if (!isBalance) {
      setFormError(`Jurnal tidak balance: Debit ${rp(totalDebit)} ≠ Kredit ${rp(totalKredit)}`); return
    }
    const details: JurnalDetailInput[] = lines
      .filter((l) => l.akun_id && (parseThousand(l.debit) > 0 || parseThousand(l.kredit) > 0))
      .map((l, i) => ({
        akun_id: Number(l.akun_id),
        keterangan: l.keterangan || undefined,
        debit: parseThousand(l.debit),
        kredit: parseThousand(l.kredit),
        urutan: i,
      }))
    if (details.length < 2) { setFormError("Minimal 2 baris jurnal"); return }

    setSaving(true)
    setFormError(null)
    const res = editingId
      ? await updateJurnal(editingId, { tanggal: form.tanggal, keterangan: form.keterangan, details })
      : await createJurnal({ ...form, periode_id: Number(form.periode_id), details })
    setSaving(false)
    if (res.success) {
      setFormOpen(false)
      setEditingId(null)
      setLines([emptyLine(), emptyLine()])
      load()
    } else {
      setFormError(res.error)
    }
  }

  async function handlePost(row: JurnalRow) {
    if (!confirm(`Posting jurnal ${row.nomor_jurnal}? Setelah diposting tidak dapat diubah.`)) return
    const res = await postJurnal(row.id)
    if (res.success) load()
    else alert(res.error)
  }

  async function handleDelete(row: JurnalRow) {
    if (!confirm(`Hapus jurnal ${row.nomor_jurnal}?`)) return
    const res = await deleteJurnal(row.id)
    if (res.success) load()
    else alert(res.error)
  }

  async function handleView(row: JurnalRow) {
    const res = await getJurnalById(row.id)
    if (res.success) setViewJurnal(res.data)
    else alert(res.error)
  }

  const columns: Column<JurnalRow>[] = [
    { key: "nomor_jurnal", header: "Nomor", cell: (r) => <span className="font-mono text-xs">{r.nomor_jurnal}</span> },
    { key: "tanggal", header: "Tanggal", cell: (r) => new Date(r.tanggal).toLocaleDateString("id-ID") },
    { key: "keterangan", header: "Keterangan", cell: (r) => <span className="text-sm">{r.keterangan}</span> },
    {
      key: "jenis", header: "Jenis",
      cell: (r) => <Badge variant="outline" className="text-xs">{r.jenis}</Badge>,
    },
    {
      key: "total_debit", header: "Debit",
      cell: (r) => <span className="text-right block text-sm">{rp(r.total_debit)}</span>,
    },
    {
      key: "status", header: "Status",
      cell: (r) => <Badge variant={STATUS_VARIANT[r.status] as never}>{r.status}</Badge>,
    },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" style={{ color: "var(--primary)" }} />
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-900)" }}>Jurnal Umum</h1>
          <span className="text-sm" style={{ color: "var(--text-subtle)" }}>({total} entri)</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          <SelectField label="Filter Periode" value={filterPeriode} onChange={(e) => setFilterPeriode(e.target.value)} options={periodeOptions} className="w-40" />
          <SelectField label="Filter Status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} options={[{ value: "", label: "Semua Status" }, { value: "DRAFT", label: "Draft" }, { value: "POSTED", label: "Posted" }]} className="w-36" />
          <SelectField label="Filter Jenis" value={filterJenis} onChange={(e) => setFilterJenis(e.target.value)} options={JENIS_OPTIONS} className="w-40" />
          <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />Buat Jurnal
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
        emptyMessage="Belum ada jurnal"
        searchKeys={["nomor_jurnal", "keterangan"]}
        actions={(row) => {
          const r = row as unknown as JurnalRow
          return (
            <div className="flex gap-1 justify-end">
              <Button size="sm" variant="ghost" onClick={() => handleView(r)} title="Detail">
                <Eye className="h-3.5 w-3.5" />
              </Button>
              {r.status === "DRAFT" && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(r)} title="Edit">
                    <Pencil className="h-3.5 w-3.5 text-amber-600" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handlePost(r)} title="Posting">
                    <Send className="h-3.5 w-3.5 text-green-600" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(r)} title="Hapus">
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </Button>
                </>
              )}
            </div>
          )
        }}
      />

      {/* Form Buat Jurnal */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editingId ? "Edit Jurnal (Draft)" : "Buat Jurnal Baru"} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <TextField label="Tanggal *" value={form.tanggal} onChange={(e) => setForm({ ...form, tanggal: e.target.value })} type="date" />
            <SelectField label="Jenis" value={form.jenis} onChange={(e) => setForm({ ...form, jenis: e.target.value })} options={JENIS_FORM} disabled={!!editingId} />
            <SelectField label="Periode Fiskal *" value={form.periode_id} onChange={(e) => setForm({ ...form, periode_id: e.target.value })} options={[{ value: "", label: "— Pilih —" }, ...periodeFormOptions]} disabled={!!editingId} />
          </div>
          <TextField label="Keterangan / Memo *" value={form.keterangan} onChange={(e) => setForm({ ...form, keterangan: e.target.value })} />

          {/* Baris Jurnal */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-subtle)" }}>Baris Jurnal</p>
            <div className="rounded-lg overflow-hidden border" style={{ borderColor: "var(--border)" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "var(--surface-muted)" }}>
                    <th className="text-left p-2 text-xs font-semibold">Akun</th>
                    <th className="text-left p-2 text-xs font-semibold">Keterangan</th>
                    <th className="text-right p-2 text-xs font-semibold w-32">Debit (Rp)</th>
                    <th className="text-right p-2 text-xs font-semibold w-32">Kredit (Rp)</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="p-1.5">
                        <AkunCombobox
                          value={line.akun_id}
                          options={akunOptions}
                          onChange={(id) => updateLine(i, "akun_id", id)}
                        />
                      </td>
                      <td className="p-1.5">
                        <input
                          value={line.keterangan}
                          onChange={(e) => updateLine(i, "keterangan", e.target.value)}
                          className="w-full text-xs rounded px-2 py-1.5 border"
                          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-900)" }}
                          placeholder="Keterangan baris"
                        />
                      </td>
                      <td className="p-1.5">
                        <input
                          inputMode="numeric"
                          value={line.debit}
                          onChange={(e) => updateLine(i, "debit", formatThousand(e.target.value))}
                          className="w-full text-xs rounded px-2 py-1.5 border text-right"
                          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-900)" }}
                          placeholder="0"
                        />
                      </td>
                      <td className="p-1.5">
                        <input
                          inputMode="numeric"
                          value={line.kredit}
                          onChange={(e) => updateLine(i, "kredit", formatThousand(e.target.value))}
                          className="w-full text-xs rounded px-2 py-1.5 border text-right"
                          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-900)" }}
                          placeholder="0"
                        />
                      </td>
                      <td className="p-1.5 text-center">
                        <button onClick={() => removeLine(i)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t font-semibold text-sm" style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}>
                    <td colSpan={2} className="p-2 text-right">Total</td>
                    <td className="p-2 text-right">{rp(totalDebit)}</td>
                    <td className="p-2 text-right">{rp(totalKredit)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="flex items-center justify-between mt-2">
              <Button variant="ghost" size="sm" onClick={addLine}><Plus className="h-3.5 w-3.5 mr-1" />Tambah Baris</Button>
              {!isBalance && totalDebit > 0 && (
                <span className="text-xs" style={{ color: "rgb(220,38,38)" }}>
                  Selisih: {rp(Math.abs(totalDebit - totalKredit))}
                </span>
              )}
              {isBalance && totalDebit > 0 && (
                <span className="text-xs" style={{ color: "rgb(5,150,105)" }}>✓ Balance</span>
              )}
            </div>
          </div>

          {formError && <p className="text-sm" style={{ color: "rgb(220,38,38)" }}>{formError}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={saving || !isBalance}>{saving ? "Menyimpan…" : "Simpan Draft"}</Button>
          </div>
        </div>
      </Modal>

      {/* Modal Detail Jurnal */}
      {viewJurnal && (
        <Modal open={!!viewJurnal} onClose={() => setViewJurnal(null)} title={`Jurnal — ${viewJurnal.nomor_jurnal}`} size="lg">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span style={{ color: "var(--text-subtle)" }}>Tanggal: </span>{new Date(viewJurnal.tanggal).toLocaleDateString("id-ID")}</div>
              <div><span style={{ color: "var(--text-subtle)" }}>Jenis: </span>{viewJurnal.jenis}</div>
              <div className="col-span-2"><span style={{ color: "var(--text-subtle)" }}>Keterangan: </span>{viewJurnal.keterangan}</div>
              <div>
                <span style={{ color: "var(--text-subtle)" }}>Status: </span>
                <Badge variant={STATUS_VARIANT[viewJurnal.status] as never}>{viewJurnal.status}</Badge>
              </div>
            </div>
            {viewJurnal.details && (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr style={{ background: "var(--surface-muted)" }}>
                    <th className="text-left p-2 text-xs">Akun</th>
                    <th className="text-left p-2 text-xs">Keterangan</th>
                    <th className="text-right p-2 text-xs">Debit</th>
                    <th className="text-right p-2 text-xs">Kredit</th>
                  </tr>
                </thead>
                <tbody>
                  {viewJurnal.details.map((d) => (
                    <tr key={d.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="p-2 font-mono text-xs">{d.akun?.kode} — {d.akun?.nama}</td>
                      <td className="p-2 text-xs">{d.keterangan ?? "—"}</td>
                      <td className="p-2 text-right text-xs">{d.debit > 0 ? rp(d.debit) : "—"}</td>
                      <td className="p-2 text-right text-xs">{d.kredit > 0 ? rp(d.kredit) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t font-bold text-sm" style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}>
                    <td colSpan={2} className="p-2 text-right">Total</td>
                    <td className="p-2 text-right">{rp(viewJurnal.total_debit)}</td>
                    <td className="p-2 text-right">{rp(viewJurnal.total_kredit)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
            <div className="flex justify-end gap-2 pt-1">
              {viewJurnal.status === "DRAFT" && (
                <Button onClick={() => { handlePost(viewJurnal); setViewJurnal(null) }} className="bg-green-600 hover:bg-green-700">
                  <Send className="h-4 w-4 mr-1" />Posting
                </Button>
              )}
              <Button variant="ghost" onClick={() => setViewJurnal(null)}>Tutup</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
