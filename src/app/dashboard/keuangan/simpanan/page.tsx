"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { SelectField, TextField } from "@/components/ui/form-field"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { PiggyBank, Plus, RefreshCw, ArrowDownCircle, ArrowUpCircle } from "lucide-react"
import { getSimpanan, getSimpananSaldo, createSimpanan, type SimpananRow, type SimpananSaldo } from "@/actions/keuangan-simpanan"
import { getAnggota, type AnggotaRow } from "@/actions/keuangan-anggota"
import { rp, formatThousand, parseThousand } from "@/lib/keuangan/format"

const JENIS_OPTIONS = [
  { value: "POKOK", label: "Simpanan Pokok" },
  { value: "WAJIB", label: "Simpanan Wajib" },
  { value: "SUKARELA", label: "Simpanan Sukarela" },
]
const JENIS_FILTER = [{ value: "", label: "Semua Jenis" }, ...JENIS_OPTIONS]
const TIPE_VARIANT: Record<string, string> = { SETOR: "success", TARIK: "warning" }

export default function SimpananPage() {
  const now = new Date()
  const [tab, setTab] = useState<"saldo" | "transaksi">("saldo")
  const [saldo, setSaldo] = useState<SimpananSaldo[]>([])
  const [trx, setTrx] = useState<SimpananRow[]>([])
  const [anggota, setAnggota] = useState<AnggotaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [jenisFilter, setJenisFilter] = useState("")

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState({
    anggota_id: "", jenis: "WAJIB", tipe: "SETOR" as "SETOR" | "TARIK",
    tanggal: now.toISOString().split("T")[0], jumlah: "", keterangan: "",
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const loadSaldo = useCallback(async () => {
    setLoading(true)
    const res = await getSimpananSaldo()
    if (res.success) setSaldo(res.data)
    setLoading(false)
  }, [])

  const loadTrx = useCallback(async () => {
    setLoading(true)
    const res = await getSimpanan(jenisFilter ? { jenis: jenisFilter } : undefined)
    if (res.success) setTrx(res.data)
    setLoading(false)
  }, [jenisFilter])

  useEffect(() => {
    getAnggota({ status: "AKTIF" }).then((r) => { if (r.success) setAnggota(r.data) })
  }, [])

  useEffect(() => {
    if (tab === "saldo") loadSaldo()
    else loadTrx()
  }, [tab, loadSaldo, loadTrx])

  const anggotaOptions = useMemo(() =>
    anggota.map((a) => ({ value: String(a.id), label: `${a.no_anggota} — ${a.nama}`, description: a.no_hp ?? undefined })),
    [anggota]
  )

  function openForm(tipe: "SETOR" | "TARIK") {
    setForm({ anggota_id: "", jenis: "WAJIB", tipe, tanggal: now.toISOString().split("T")[0], jumlah: "", keterangan: "" })
    setError(null); setDone(null); setFormOpen(true)
  }

  async function handleSave() {
    if (!form.anggota_id) { setError("Pilih anggota"); return }
    const jumlah = parseThousand(form.jumlah)
    if (jumlah <= 0) { setError("Jumlah harus lebih dari nol"); return }
    setSaving(true); setError(null)
    const res = await createSimpanan({
      anggota_id: Number(form.anggota_id), jenis: form.jenis as "POKOK" | "WAJIB" | "SUKARELA",
      tipe: form.tipe, tanggal: form.tanggal, jumlah, keterangan: form.keterangan || undefined,
    })
    setSaving(false)
    if (res.success) {
      setDone(`Transaksi tersimpan & dijurnal (${res.data.nomor_jurnal})`)
      setFormOpen(false)
      if (tab === "saldo") loadSaldo(); else loadTrx()
    } else setError(res.error)
  }

  const saldoColumns: Column<SimpananSaldo>[] = [
    { key: "no_anggota", header: "No.", cell: (r) => <span className="font-mono text-xs">{r.no_anggota}</span> },
    { key: "nama", header: "Nama", cell: (r) => <span className="font-medium">{r.nama}</span> },
    { key: "pokok", header: "Pokok", cell: (r) => <span className="text-right block text-sm">{rp(r.pokok)}</span> },
    { key: "wajib", header: "Wajib", cell: (r) => <span className="text-right block text-sm">{rp(r.wajib)}</span> },
    { key: "sukarela", header: "Sukarela", cell: (r) => <span className="text-right block text-sm">{rp(r.sukarela)}</span> },
    { key: "total", header: "Total", cell: (r) => <span className="text-right block text-sm font-bold" style={{ color: "rgb(5,150,105)" }}>{rp(r.total)}</span> },
  ]

  const trxColumns: Column<SimpananRow>[] = [
    { key: "tanggal", header: "Tanggal", cell: (r) => new Date(r.tanggal).toLocaleDateString("id-ID") },
    { key: "anggota", header: "Anggota", cell: (r) => <span className="text-sm">{r.anggota?.no_anggota} — {r.anggota?.nama}</span> },
    { key: "jenis", header: "Jenis", cell: (r) => <Badge variant="outline" className="text-xs">{r.jenis}</Badge> },
    { key: "tipe", header: "Tipe", cell: (r) => <Badge variant={TIPE_VARIANT[r.tipe] as never}>{r.tipe}</Badge> },
    { key: "jumlah", header: "Jumlah", cell: (r) => <span className="text-right block text-sm font-medium" style={{ color: r.tipe === "SETOR" ? "rgb(5,150,105)" : "rgb(217,119,6)" }}>{rp(r.jumlah)}</span> },
    { key: "jurnal", header: "Jurnal", cell: (r) => <span className="font-mono text-xs" style={{ color: "var(--text-subtle)" }}>{r.jurnal?.nomor_jurnal ?? "—"}</span> },
  ]

  const totalSaldo = saldo.reduce((s, r) => s + r.total, 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <PiggyBank className="h-5 w-5" style={{ color: "var(--primary)" }} />
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-900)" }}>Simpanan Anggota</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => openForm("SETOR")}><ArrowDownCircle className="h-4 w-4 mr-1 text-green-600" />Setor</Button>
          <Button variant="outline" size="sm" onClick={() => openForm("TARIK")}><ArrowUpCircle className="h-4 w-4 mr-1 text-amber-600" />Tarik</Button>
        </div>
      </div>

      {done && (
        <div className="p-3 rounded-lg text-sm" style={{ background: "rgba(5,150,105,0.08)", color: "rgb(5,150,105)", border: "1px solid rgba(5,150,105,0.25)" }}>{done}</div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: "var(--surface-muted)" }}>
        {([["saldo", "Saldo per Anggota"], ["transaksi", "Riwayat Transaksi"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
            style={tab === key ? { background: "var(--surface)", color: "var(--text-900)", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" } : { color: "var(--text-subtle)" }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "saldo" ? (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm" style={{ color: "var(--text-subtle)" }}>Total simpanan koperasi: <strong style={{ color: "rgb(5,150,105)" }}>{rp(totalSaldo)}</strong></p>
            <Button variant="ghost" size="sm" onClick={loadSaldo}><RefreshCw className="h-3.5 w-3.5" /></Button>
          </div>
          <DataTable
            columns={saldoColumns as unknown as Column<Record<string, unknown>>[]}
            data={saldo as unknown as Record<string, unknown>[]}
            loading={loading} emptyMessage="Belum ada data simpanan" searchKeys={["no_anggota", "nama"]}
          />
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <SelectField label="Filter Jenis" value={jenisFilter} onChange={(e) => setJenisFilter(e.target.value)} options={JENIS_FILTER} className="w-44" />
            <Button variant="ghost" size="sm" onClick={loadTrx}><RefreshCw className="h-3.5 w-3.5" /></Button>
          </div>
          <DataTable
            columns={trxColumns as unknown as Column<Record<string, unknown>>[]}
            data={trx as unknown as Record<string, unknown>[]}
            loading={loading} emptyMessage="Belum ada transaksi" searchKeys={["jenis"]}
          />
        </>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={form.tipe === "SETOR" ? "Setoran Simpanan" : "Penarikan Simpanan"} size="md">
        <div className="space-y-3">
          <SearchableSelect label="Anggota *" value={form.anggota_id} onChange={(v) => setForm({ ...form, anggota_id: v })} options={anggotaOptions} placeholder="— Pilih Anggota —" />
          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Jenis Simpanan *" value={form.jenis} onChange={(e) => setForm({ ...form, jenis: e.target.value })} options={JENIS_OPTIONS} />
            <TextField label="Tanggal *" value={form.tanggal} onChange={(e) => setForm({ ...form, tanggal: e.target.value })} type="date" />
          </div>
          <TextField label="Jumlah (Rp) *" value={form.jumlah} onChange={(e) => setForm({ ...form, jumlah: formatThousand(e.target.value) })} inputMode="numeric" placeholder="0" />
          <TextField label="Keterangan" value={form.keterangan} onChange={(e) => setForm({ ...form, keterangan: e.target.value })} />
          {error && <p className="text-sm" style={{ color: "rgb(220,38,38)" }}>{error}</p>}
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
            Transaksi otomatis membuat jurnal akuntansi (POSTED): {form.tipe === "SETOR" ? "Debit Kas, Kredit akun simpanan" : "Debit akun simpanan, Kredit Kas"}.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Menyimpan…" : "Simpan & Jurnal"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
