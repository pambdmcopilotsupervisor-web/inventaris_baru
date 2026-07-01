"use client"

import React, { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { TextField } from "@/components/ui/form-field"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { DataTable, Column } from "@/components/ui/data-table"
import { Wallet, Plus, RefreshCw, CreditCard } from "lucide-react"
import { getAnggota, type AnggotaRow } from "@/actions/keuangan-anggota"
import { createPembayaranPinjaman, createPinjamanAnggota, getPinjamanAnggota, type PinjamanAnggotaRow } from "@/actions/keuangan-pinjaman"
import { formatThousand, parseThousand, rp } from "@/lib/keuangan/format"

const STATUS_VARIANT: Record<string, string> = { AKTIF: "warning", LUNAS: "success", BATAL: "destructive" }

export default function PinjamanAnggotaPage() {
  const now = new Date()
  const [rows, setRows] = useState<PinjamanAnggotaRow[]>([])
  const [anggota, setAnggota] = useState<AnggotaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [target, setTarget] = useState<PinjamanAnggotaRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ anggota_id: "", tanggal: now.toISOString().split("T")[0], pokok: "", jasa: "", tenor_bulan: "12", angsuran_pokok: "", angsuran_jasa: "", keterangan: "" })
  const [pay, setPay] = useState({ tanggal: now.toISOString().split("T")[0], pokok: "", jasa: "", keterangan: "" })

  async function load() {
    setLoading(true); setError(null)
    const [p, a] = await Promise.all([getPinjamanAnggota(), getAnggota({ status: "AKTIF" })])
    if (p.success) setRows(p.data); else setError(p.error)
    if (a.success) setAnggota(a.data)
    setLoading(false)
  }

  useEffect(() => { void Promise.resolve().then(load) }, [])

  const anggotaOptions = useMemo(() => anggota.map((a) => ({ value: String(a.id), label: `${a.no_anggota} — ${a.nama}`, description: a.no_hp ?? undefined })), [anggota])
  const totals = rows.reduce((s, r) => ({ pokok: s.pokok + r.pokok, sisa: s.sisa + r.sisa_pokok }), { pokok: 0, sisa: 0 })

  function openCreate() {
    setForm({ anggota_id: "", tanggal: now.toISOString().split("T")[0], pokok: "", jasa: "", tenor_bulan: "12", angsuran_pokok: "", angsuran_jasa: "", keterangan: "" })
    setError(null); setDone(null); setFormOpen(true)
  }

  function openPayment(row: PinjamanAnggotaRow) {
    setTarget(row)
    setPay({ tanggal: now.toISOString().split("T")[0], pokok: formatThousand(Math.min(row.angsuran_pokok || row.sisa_pokok, row.sisa_pokok)), jasa: formatThousand(row.angsuran_jasa), keterangan: "" })
    setError(null); setDone(null); setPayOpen(true)
  }

  async function handleCreate() {
    setSaving(true); setError(null)
    const res = await createPinjamanAnggota({
      anggota_id: Number(form.anggota_id), tanggal: form.tanggal, pokok: parseThousand(form.pokok), jasa: parseThousand(form.jasa),
      tenor_bulan: Number(form.tenor_bulan) || 1, angsuran_pokok: parseThousand(form.angsuran_pokok), angsuran_jasa: parseThousand(form.angsuran_jasa),
      keterangan: form.keterangan || undefined,
    })
    setSaving(false)
    if (!res.success) { setError(res.error); return }
    setDone(`Pinjaman ${res.data.nomor_pinjaman} tersimpan dan dijurnal (${res.data.nomor_jurnal})`)
    setFormOpen(false); load()
  }

  async function handlePay() {
    if (!target) return
    setSaving(true); setError(null)
    const res = await createPembayaranPinjaman({ pinjaman_id: target.id, tanggal: pay.tanggal, pokok: parseThousand(pay.pokok), jasa: parseThousand(pay.jasa), keterangan: pay.keterangan || undefined })
    setSaving(false)
    if (!res.success) { setError(res.error); return }
    setDone(`Pembayaran tersimpan dan dijurnal (${res.data.nomor_jurnal})`)
    setPayOpen(false); setTarget(null); load()
  }

  const cols: Column<PinjamanAnggotaRow>[] = [
    { key: "nomor_pinjaman", header: "Nomor", cell: (r) => <span className="font-mono text-xs">{r.nomor_pinjaman}</span> },
    { key: "nama", header: "Anggota", cell: (r) => <div><p className="font-medium">{r.nama}</p><p className="text-xs" style={{ color: "var(--text-subtle)" }}>{r.no_anggota}</p></div> },
    { key: "tanggal", header: "Tanggal", cell: (r) => new Date(r.tanggal).toLocaleDateString("id-ID") },
    { key: "pokok", header: "Pokok", cell: (r) => <span className="text-right block">{rp(r.pokok)}</span> },
    { key: "paid_pokok", header: "Terbayar", cell: (r) => <span className="text-right block text-green-700">{rp(r.paid_pokok)}</span> },
    { key: "sisa_pokok", header: "Sisa", cell: (r) => <span className="text-right block font-semibold text-amber-700">{rp(r.sisa_pokok)}</span> },
    { key: "status", header: "Status", cell: (r) => <Badge variant={STATUS_VARIANT[r.status] as never}>{r.status}</Badge> },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5" style={{ color: "var(--primary)" }} />
          <div><h1 className="text-xl font-semibold" style={{ color: "var(--text-900)" }}>Pinjaman / Piutang Anggota</h1><p className="text-xs" style={{ color: "var(--text-subtle)" }}>Pencairan dan pembayaran otomatis membuat jurnal POSTED.</p></div>
        </div>
        <div className="flex gap-2"><Button variant="ghost" size="sm" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button><Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Tambah Pinjaman</Button></div>
      </div>

      {done && <div className="p-3 rounded-lg text-sm" style={{ background: "rgba(5,150,105,0.08)", color: "rgb(5,150,105)", border: "1px solid rgba(5,150,105,0.25)" }}>{done}</div>}
      {error && <div className="p-3 rounded-lg text-sm" style={{ background: "rgba(220,38,38,0.08)", color: "rgb(220,38,38)" }}>{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}><p className="text-xs" style={{ color: "var(--text-subtle)" }}>Total Pencairan</p><p className="text-lg font-bold">{rp(totals.pokok)}</p></div>
        <div className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}><p className="text-xs" style={{ color: "var(--text-subtle)" }}>Sisa Piutang Aktif</p><p className="text-lg font-bold text-amber-700">{rp(totals.sisa)}</p></div>
      </div>

      <DataTable columns={cols as unknown as Column<Record<string, unknown>>[]} data={rows as unknown as Record<string, unknown>[]} loading={loading} searchKeys={["nomor_pinjaman", "nama", "no_anggota"]} emptyMessage="Belum ada pinjaman anggota" actions={(row) => {
        const r = row as unknown as PinjamanAnggotaRow
        return r.status === "AKTIF" ? <Button size="sm" variant="ghost" onClick={() => openPayment(r)}><CreditCard className="h-3.5 w-3.5 mr-1" />Bayar</Button> : null
      }} />

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="Tambah Pinjaman Anggota" size="md">
        <div className="space-y-3">
          <SearchableSelect label="Anggota *" value={form.anggota_id} onChange={(v) => setForm({ ...form, anggota_id: v })} options={anggotaOptions} placeholder="Pilih anggota" />
          <div className="grid grid-cols-2 gap-3"><TextField label="Tanggal *" type="date" value={form.tanggal} onChange={(e) => setForm({ ...form, tanggal: e.target.value })} /><TextField label="Tenor (bulan) *" type="number" value={form.tenor_bulan} onChange={(e) => setForm({ ...form, tenor_bulan: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3"><TextField label="Pokok (Rp) *" inputMode="numeric" value={form.pokok} onChange={(e) => setForm({ ...form, pokok: formatThousand(e.target.value) })} /><TextField label="Total Jasa (Rp)" inputMode="numeric" value={form.jasa} onChange={(e) => setForm({ ...form, jasa: formatThousand(e.target.value) })} /></div>
          <div className="grid grid-cols-2 gap-3"><TextField label="Angsuran Pokok/bln" inputMode="numeric" value={form.angsuran_pokok} onChange={(e) => setForm({ ...form, angsuran_pokok: formatThousand(e.target.value) })} /><TextField label="Angsuran Jasa/bln" inputMode="numeric" value={form.angsuran_jasa} onChange={(e) => setForm({ ...form, angsuran_jasa: formatThousand(e.target.value) })} /></div>
          <TextField label="Keterangan" value={form.keterangan} onChange={(e) => setForm({ ...form, keterangan: e.target.value })} />
          <div className="flex justify-end gap-2 pt-2"><Button variant="ghost" onClick={() => setFormOpen(false)}>Batal</Button><Button onClick={handleCreate} disabled={saving}>{saving ? "Menyimpan..." : "Simpan & Jurnal"}</Button></div>
        </div>
      </Modal>

      <Modal open={payOpen} onClose={() => setPayOpen(false)} title={target ? `Pembayaran ${target.nomor_pinjaman}` : "Pembayaran Pinjaman"} size="sm">
        <div className="space-y-3">
          {target && <p className="text-sm" style={{ color: "var(--text-subtle)" }}>Sisa pokok: <strong>{rp(target.sisa_pokok)}</strong></p>}
          <TextField label="Tanggal *" type="date" value={pay.tanggal} onChange={(e) => setPay({ ...pay, tanggal: e.target.value })} />
          <TextField label="Pokok (Rp) *" inputMode="numeric" value={pay.pokok} onChange={(e) => setPay({ ...pay, pokok: formatThousand(e.target.value) })} />
          <TextField label="Jasa (Rp)" inputMode="numeric" value={pay.jasa} onChange={(e) => setPay({ ...pay, jasa: formatThousand(e.target.value) })} />
          <TextField label="Keterangan" value={pay.keterangan} onChange={(e) => setPay({ ...pay, keterangan: e.target.value })} />
          <div className="flex justify-end gap-2 pt-2"><Button variant="ghost" onClick={() => setPayOpen(false)}>Batal</Button><Button onClick={handlePay} disabled={saving}>{saving ? "Menyimpan..." : "Simpan Pembayaran"}</Button></div>
        </div>
      </Modal>
    </div>
  )
}
