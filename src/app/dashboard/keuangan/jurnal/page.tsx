"use client"

import React, { useEffect, useMemo, useState } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { TextField, SelectField } from "@/components/ui/form-field"
import { BookOpen, Plus, RefreshCw, Send, Trash2, Pencil, Eye, RotateCcw } from "lucide-react"
import {
  getJurnals, getJurnalById, createJurnal, updateJurnal, deleteJurnal, postJurnal, reverseJurnal,
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

const TEMPLATE_OPTIONS = [
  { value: "", label: "Pilih Template" },
  { value: "biaya_operasional", label: "Biaya Operasional" },
  { value: "pendapatan_jasa", label: "Pendapatan Jasa" },
  { value: "transfer_kas_bank", label: "Transfer Kas ke Bank" },
  { value: "penyusutan_aset", label: "Penyusutan Aset" },
]

const JOURNAL_TEMPLATES: Record<string, {
  keterangan: string
  lines: { kode: string; keterangan: string; side: "debit" | "kredit" }[]
}> = {
  biaya_operasional: {
    keterangan: "Pembayaran biaya operasional",
    lines: [
      { kode: "5.2.4", keterangan: "Beban pemeliharaan/operasional", side: "debit" },
      { kode: "1.1.1", keterangan: "Pembayaran kas", side: "kredit" },
    ],
  },
  pendapatan_jasa: {
    keterangan: "Penerimaan pendapatan jasa",
    lines: [
      { kode: "1.1.1", keterangan: "Penerimaan kas", side: "debit" },
      { kode: "4.1.2", keterangan: "Pendapatan jasa", side: "kredit" },
    ],
  },
  transfer_kas_bank: {
    keterangan: "Transfer kas ke bank",
    lines: [
      { kode: "1.1.2", keterangan: "Setoran ke bank", side: "debit" },
      { kode: "1.1.1", keterangan: "Kas keluar", side: "kredit" },
    ],
  },
  penyusutan_aset: {
    keterangan: "Pencatatan penyusutan aset tetap",
    lines: [
      { kode: "5.3.1", keterangan: "Beban penyusutan aset tetap", side: "debit" },
      { kode: "1.2.2", keterangan: "Akumulasi penyusutan aset tetap", side: "kredit" },
    ],
  },
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
  const [templateKey, setTemplateKey] = useState("")
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null)

  const [viewJurnal, setViewJurnal] = useState<JurnalRow | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ type: "POST" | "DELETE"; row: JurnalRow } | null>(null)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [reverseTarget, setReverseTarget] = useState<JurnalRow | null>(null)
  const [reverseDate, setReverseDate] = useState(new Date().toISOString().split("T")[0])
  const [reverseSaving, setReverseSaving] = useState(false)

  // Pre-load
  useEffect(() => {
    getPeriodeFiskal().then((r) => {
      if (r.success) setPeriode(r.data)
    })
    getAkun({ is_detail: true, is_active: true }).then((r) => {
      if (r.success) setAkuns(r.data)
    })
  }, [])

  async function load() {
    setLoading(true)
    setLoadError(null)
    const res = await getJurnals({
      periode_id: filterPeriode ? Number(filterPeriode) : undefined,
      status: filterStatus || undefined,
      jenis: filterJenis || undefined,
    })
    if (res.success) { setRows(res.data.rows); setTotal(res.data.total) }
    else setLoadError(res.error)
    setLoading(false)
  }

  useEffect(() => {
    void Promise.resolve().then(() => load())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterPeriode, filterStatus, filterJenis])

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
    setLines((prev) => prev.map((l, i) => {
      if (i !== idx) return l
      if (field === "debit" && parseThousand(val) > 0) return { ...l, debit: val, kredit: "" }
      if (field === "kredit" && parseThousand(val) > 0) return { ...l, kredit: val, debit: "" }
      return { ...l, [field]: val }
    }))
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
    setTemplateKey("")
    setFormError(null)
    setFormOpen(true)
  }

  async function openEdit(row: JurnalRow) {
    const res = await getJurnalById(row.id)
    if (!res.success) { setNotice({ type: "error", message: res.error }); return }
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
    setTemplateKey("")
    setFormError(null)
    setFormOpen(true)
  }

  function applyTemplate() {
    const template = JOURNAL_TEMPLATES[templateKey]
    if (!template) return
    const mapped = template.lines.map((line) => {
      const akun = akuns.find((a) => a.kode === line.kode)
      if (!akun) return null
      return {
        akun_id: String(akun.id),
        keterangan: `${line.keterangan} (${line.side === "debit" ? "Debit" : "Kredit"})`,
        debit: "",
        kredit: "",
      }
    })
    if (mapped.some((line) => line === null)) {
      setFormError("Sebagian akun template tidak ditemukan di bagan akun")
      return
    }
    setForm((prev) => ({ ...prev, jenis: "UMUM", keterangan: prev.keterangan || template.keterangan }))
    setLines(mapped as DetailLine[])
    setFormError(null)
  }

  function copyMemoToEmptyLines() {
    if (!form.keterangan.trim()) { setFormError("Isi keterangan/memo terlebih dahulu"); return }
    setLines((prev) => prev.map((l) => ({ ...l, keterangan: l.keterangan || form.keterangan })))
    setFormError(null)
  }

  function addBalancingLine() {
    const diff = totalDebit - totalKredit
    if (Math.abs(diff) < 0.01) return
    const targetSide: "debit" | "kredit" = diff < 0 ? "debit" : "kredit"
    const amount = formatThousand(Math.abs(diff))
    const emptyIdx = lines.findIndex((l) => parseThousand(l.debit) === 0 && parseThousand(l.kredit) === 0)
    if (emptyIdx >= 0) {
      setLines((prev) => prev.map((l, i) => i === emptyIdx ? { ...l, [targetSide]: amount, keterangan: l.keterangan || form.keterangan || "Baris penyeimbang" } : l))
      if (!lines[emptyIdx].akun_id) setFormError("Pilih akun untuk baris penyeimbang")
      return
    }
    setLines((prev) => [...prev, {
      akun_id: "",
      keterangan: form.keterangan || "Baris penyeimbang",
      debit: targetSide === "debit" ? amount : "",
      kredit: targetSide === "kredit" ? amount : "",
    }])
    setFormError("Pilih akun untuk baris penyeimbang yang baru ditambahkan")
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
      setNotice({ type: "success", message: editingId ? "Draft jurnal berhasil diperbarui" : "Draft jurnal berhasil dibuat" })
      load()
    } else {
      setFormError(res.error)
    }
  }

  async function handlePost(row: JurnalRow) {
    const res = await postJurnal(row.id)
    if (res.success) {
      setNotice({ type: "success", message: `Jurnal ${row.nomor_jurnal} berhasil diposting` })
      load()
    } else setNotice({ type: "error", message: res.error })
  }

  async function handleDelete(row: JurnalRow) {
    const res = await deleteJurnal(row.id)
    if (res.success) {
      setNotice({ type: "success", message: `Jurnal ${row.nomor_jurnal} berhasil dihapus` })
      load()
    } else setNotice({ type: "error", message: res.error })
  }

  async function handleReverseSubmit() {
    if (!reverseTarget) return
    setReverseSaving(true)
    const res = await reverseJurnal(reverseTarget.id, { tanggal: reverseDate })
    setReverseSaving(false)
    if (res.success) {
      setReverseTarget(null)
      setNotice({ type: "success", message: `Draft jurnal pembalik berhasil dibuat: ${res.data.nomor_jurnal}` })
      load()
    } else setNotice({ type: "error", message: res.error })
  }

  async function handleView(row: JurnalRow) {
    const res = await getJurnalById(row.id)
    if (res.success) setViewJurnal(res.data)
    else setNotice({ type: "error", message: res.error })
  }

  async function handleConfirmAction() {
    if (!confirmAction) return
    setConfirmLoading(true)
    if (confirmAction.type === "POST") await handlePost(confirmAction.row)
    else await handleDelete(confirmAction.row)
    setConfirmLoading(false)
    setConfirmAction(null)
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
      {notice && (
        <div
          className="p-3 rounded-lg text-sm"
          style={{
            background: notice.type === "success" ? "rgba(5,150,105,0.08)" : "rgba(220,38,38,0.08)",
            color: notice.type === "success" ? "rgb(5,150,105)" : "rgb(220,38,38)",
            border: `1px solid ${notice.type === "success" ? "rgba(5,150,105,0.25)" : "rgba(220,38,38,0.25)"}`,
          }}
        >
          {notice.message}
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
                  {!r.source_modul && (
                    <Button size="sm" variant="ghost" onClick={() => openEdit(r)} title="Edit">
                      <Pencil className="h-3.5 w-3.5 text-amber-600" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setConfirmAction({ type: "POST", row: r })} title="Posting">
                    <Send className="h-3.5 w-3.5 text-green-600" />
                  </Button>
                  {!r.source_modul && (
                    <Button size="sm" variant="ghost" onClick={() => setConfirmAction({ type: "DELETE", row: r })} title="Hapus">
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  )}
                </>
              )}
              {r.status === "POSTED" && r.source_modul !== "reversal" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setReverseDate(new Date().toISOString().split("T")[0])
                    setReverseTarget(r)
                  }}
                  title="Buat jurnal pembalik"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-blue-600" />
                </Button>
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

          {!editingId && (
            <div className="rounded-lg p-3 flex flex-col md:flex-row md:items-end gap-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
              <SelectField label="Template Jurnal" value={templateKey} onChange={(e) => setTemplateKey(e.target.value)} options={TEMPLATE_OPTIONS} className="w-full md:w-64" />
              <Button variant="outline" size="sm" onClick={applyTemplate} disabled={!templateKey}>Terapkan Template</Button>
              <p className="text-xs md:flex-1" style={{ color: "var(--text-subtle)" }}>
                Template mengisi akun dan keterangan awal. Nominal tetap diisi manual sesuai bukti transaksi.
              </p>
            </div>
          )}

          {/* Baris Jurnal */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>Baris Jurnal</p>
              <div className="flex gap-2 flex-wrap justify-end">
                <Button variant="ghost" size="sm" onClick={copyMemoToEmptyLines}>Salin Memo</Button>
                <Button variant="ghost" size="sm" onClick={addBalancingLine} disabled={isBalance || (totalDebit === 0 && totalKredit === 0)}>Tambah Penyeimbang</Button>
              </div>
            </div>
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
                <Button onClick={() => { setConfirmAction({ type: "POST", row: viewJurnal }); setViewJurnal(null) }} className="bg-green-600 hover:bg-green-700">
                  <Send className="h-4 w-4 mr-1" />Posting
                </Button>
              )}
              {viewJurnal.status === "POSTED" && viewJurnal.source_modul !== "reversal" && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setReverseDate(new Date().toISOString().split("T")[0])
                    setReverseTarget(viewJurnal)
                    setViewJurnal(null)
                  }}
                >
                  <RotateCcw className="h-4 w-4 mr-1" />Buat Pembalik
                </Button>
              )}
              <Button variant="ghost" onClick={() => setViewJurnal(null)}>Tutup</Button>
            </div>
          </div>
        </Modal>
      )}

      <Modal
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        title={confirmAction?.type === "POST" ? "Konfirmasi Posting" : "Konfirmasi Hapus"}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm" style={{ color: "var(--text-900)" }}>
            {confirmAction?.type === "POST"
              ? `Posting jurnal ${confirmAction.row.nomor_jurnal}? Setelah diposting jurnal tidak dapat diubah.`
              : `Hapus jurnal ${confirmAction?.row.nomor_jurnal}? Tindakan ini tidak dapat dibatalkan.`}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmAction(null)} disabled={confirmLoading}>Batal</Button>
            <Button onClick={handleConfirmAction} disabled={confirmLoading}>
              {confirmLoading ? "Memproses..." : confirmAction?.type === "POST" ? "Ya, Posting" : "Ya, Hapus"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!reverseTarget}
        onClose={() => setReverseTarget(null)}
        title="Buat Jurnal Pembalik"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm" style={{ color: "var(--text-subtle)" }}>
            Jurnal sumber: <span style={{ color: "var(--text-900)", fontWeight: 600 }}>{reverseTarget?.nomor_jurnal}</span>
          </p>
          <TextField label="Tanggal Jurnal Pembalik" type="date" value={reverseDate} onChange={(e) => setReverseDate(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setReverseTarget(null)} disabled={reverseSaving}>Batal</Button>
            <Button onClick={handleReverseSubmit} disabled={reverseSaving}>{reverseSaving ? "Membuat..." : "Buat Draft Pembalik"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
