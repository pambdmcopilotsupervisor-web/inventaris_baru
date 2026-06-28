"use client"

import React, { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { SelectField, TextField } from "@/components/ui/form-field"
import { Modal } from "@/components/ui/modal"
import { Wallet, Save, AlertCircle, CheckCircle2 } from "lucide-react"
import { getAkun, type AkunRow } from "@/actions/keuangan-akun"
import { getPeriodeFiskal, type PeriodeFiskalRow } from "@/actions/keuangan-periode"
import { createSaldoAwal, getSaldoAwalStatus } from "@/actions/keuangan-saldo-awal"
import { rp, formatThousand, parseThousand } from "@/lib/keuangan/format"

const JENIS_LABEL: Record<string, string> = {
  ASET: "Aset", KEWAJIBAN: "Kewajiban", EKUITAS: "Ekuitas",
  PENDAPATAN: "Pendapatan", BEBAN: "Beban",
}
const JENIS_ORDER = ["ASET", "KEWAJIBAN", "EKUITAS", "PENDAPATAN", "BEBAN"]

export default function SaldoAwalPage() {
  const now = new Date()
  const [akuns, setAkuns] = useState<AkunRow[]>([])
  const [periode, setPeriode] = useState<PeriodeFiskalRow[]>([])
  const [periodeId, setPeriodeId] = useState("")
  const [tanggal, setTanggal] = useState(now.toISOString().split("T")[0])
  // map akun_id -> { debit, kredit } (string berformat ribuan)
  const [values, setValues] = useState<Record<string, { debit: string; kredit: string }>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [existing, setExisting] = useState<{ exists: boolean; nomor_jurnal: string | null } | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      getAkun({ is_detail: true, is_active: true }),
      getPeriodeFiskal(),
      getSaldoAwalStatus(),
    ]).then(([a, p, s]) => {
      if (a.success) setAkuns(a.data)
      if (p.success) {
        setPeriode(p.data)
        const first = [...p.data].sort((x, y) => x.tahun - y.tahun || x.bulan - y.bulan)[0]
        if (first) { setPeriodeId(String(first.id)); setTanggal(new Date(first.tgl_mulai).toISOString().split("T")[0]) }
      }
      if (s.success) setExisting(s.data)
      setLoading(false)
    })
  }, [])

  const periodeOptions = useMemo(() =>
    periode.filter((p) => p.status !== "KUNCI").map((p) => ({ value: String(p.id), label: p.nama })),
    [periode]
  )

  const grouped = useMemo(() => {
    const g: Record<string, AkunRow[]> = {}
    for (const a of akuns) (g[a.jenis] ??= []).push(a)
    for (const k of Object.keys(g)) g[k].sort((x, y) => x.kode.localeCompare(y.kode))
    return g
  }, [akuns])

  const totalDebit = Object.values(values).reduce((s, v) => s + parseThousand(v.debit), 0)
  const totalKredit = Object.values(values).reduce((s, v) => s + parseThousand(v.kredit), 0)
  const isBalance = Math.abs(totalDebit - totalKredit) < 0.01 && totalDebit > 0

  function setVal(akunId: number, field: "debit" | "kredit", val: string) {
    setValues((prev) => ({
      ...prev,
      [akunId]: { debit: field === "debit" ? formatThousand(val) : prev[akunId]?.debit ?? "", kredit: field === "kredit" ? formatThousand(val) : prev[akunId]?.kredit ?? "" },
    }))
  }

  async function handleSubmit() {
    setConfirmOpen(false)
    if (!periodeId) { setError("Pilih periode fiskal"); return }
    if (!isBalance) { setError("Total debit harus sama dengan total kredit"); return }
    const lines = Object.entries(values).map(([akun_id, v]) => ({
      akun_id: Number(akun_id),
      debit: parseThousand(v.debit),
      kredit: parseThousand(v.kredit),
    }))
    setSaving(true)
    setError(null)
    const res = await createSaldoAwal({ periode_id: Number(periodeId), tanggal, lines })
    setSaving(false)
    if (res.success) {
      setDone(res.data.nomor_jurnal)
      setExisting({ exists: true, nomor_jurnal: res.data.nomor_jurnal })
    } else {
      setError(res.error)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Wallet className="h-5 w-5" style={{ color: "var(--primary)" }} />
        <h1 className="text-xl font-semibold" style={{ color: "var(--text-900)" }}>Saldo Awal / Neraca Pembukaan</h1>
      </div>

      <p className="text-sm" style={{ color: "var(--text-subtle)" }}>
        Masukkan saldo awal tiap akun untuk memulai pembukuan. Akun Aset diisi di kolom Debit;
        Kewajiban &amp; Ekuitas di kolom Kredit. Total debit harus seimbang dengan total kredit.
      </p>

      {existing?.exists && !done && (
        <div className="flex items-center gap-2 p-3 rounded-lg text-sm"
          style={{ background: "rgba(217,119,6,0.08)", color: "rgb(180,83,9)", border: "1px solid rgba(217,119,6,0.25)" }}>
          <AlertCircle className="h-4 w-4 shrink-0" />
          Saldo awal sudah pernah dibuat ({existing.nomor_jurnal}). Membuat lagi akan menambah jurnal pembukaan baru.
        </div>
      )}

      {done && (
        <div className="flex items-center gap-2 p-3 rounded-lg text-sm"
          style={{ background: "rgba(5,150,105,0.08)", color: "rgb(5,150,105)", border: "1px solid rgba(5,150,105,0.25)" }}>
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Saldo awal berhasil disimpan & diposting sebagai jurnal {done}.
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg text-sm"
          style={{ background: "rgba(220,38,38,0.08)", color: "rgb(220,38,38)" }}>
          <AlertCircle className="h-4 w-4" />{error}
        </div>
      )}

      <div className="flex gap-3 flex-wrap items-end">
        <SelectField label="Periode Fiskal" value={periodeId} onChange={(e) => {
          setPeriodeId(e.target.value)
          const p = periode.find((x) => String(x.id) === e.target.value)
          if (p) setTanggal(new Date(p.tgl_mulai).toISOString().split("T")[0])
        }} options={[{ value: "", label: "— Pilih —" }, ...periodeOptions]} className="w-52" />
        <TextField label="Tanggal Pembukaan" value={tanggal} onChange={(e) => setTanggal(e.target.value)} type="date" className="w-44" />
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3,4].map((i) => <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: "var(--surface-muted)" }} />)}</div>
      ) : (
        <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--surface-muted)" }}>
                <th className="text-left p-2.5 text-xs font-semibold">Kode</th>
                <th className="text-left p-2.5 text-xs font-semibold">Nama Akun</th>
                <th className="text-right p-2.5 text-xs font-semibold w-40">Debit (Rp)</th>
                <th className="text-right p-2.5 text-xs font-semibold w-40">Kredit (Rp)</th>
              </tr>
            </thead>
            <tbody>
              {JENIS_ORDER.filter((j) => grouped[j]?.length).map((jenis) => (
                <React.Fragment key={jenis}>
                  <tr><td colSpan={4} className="px-2.5 py-1.5 text-xs font-bold uppercase tracking-wider"
                    style={{ background: "var(--surface-muted)", color: "var(--text-subtle)" }}>{JENIS_LABEL[jenis]}</td></tr>
                  {grouped[jenis].map((a) => (
                    <tr key={a.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="p-1.5 font-mono text-xs" style={{ color: "var(--text-subtle)" }}>{a.kode}</td>
                      <td className="p-1.5">{a.nama}</td>
                      <td className="p-1.5">
                        <input inputMode="numeric" value={values[a.id]?.debit ?? ""} onChange={(e) => setVal(a.id, "debit", e.target.value)}
                          className="w-full text-xs rounded px-2 py-1.5 border text-right"
                          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-900)" }} placeholder="0" />
                      </td>
                      <td className="p-1.5">
                        <input inputMode="numeric" value={values[a.id]?.kredit ?? ""} onChange={(e) => setVal(a.id, "kredit", e.target.value)}
                          className="w-full text-xs rounded px-2 py-1.5 border text-right"
                          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-900)" }} placeholder="0" />
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t font-bold" style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}>
                <td colSpan={2} className="p-2.5 text-right">Total</td>
                <td className="p-2.5 text-right">{rp(totalDebit)}</td>
                <td className="p-2.5 text-right">{rp(totalKredit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between sticky bottom-0 py-3" style={{ background: "var(--bg)" }}>
        <span className="text-sm">
          {totalDebit > 0 && (isBalance
            ? <span style={{ color: "rgb(5,150,105)" }}>✓ Seimbang</span>
            : <span style={{ color: "rgb(220,38,38)" }}>Selisih: {rp(Math.abs(totalDebit - totalKredit))}</span>)}
        </span>
        <Button onClick={() => setConfirmOpen(true)} disabled={!isBalance || saving || !periodeId}>
          <Save className="h-4 w-4 mr-1" />{saving ? "Menyimpan…" : "Simpan Saldo Awal"}
        </Button>
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Konfirmasi Saldo Awal" size="sm">
        <div className="space-y-4">
          <p className="text-sm" style={{ color: "var(--text-900)" }}>
            Saldo awal akan disimpan sebagai jurnal pembukaan berstatus <strong>POSTED</strong> dan langsung mempengaruhi laporan.
            Total: <strong>{rp(totalDebit)}</strong>. Lanjutkan?
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Batal</Button>
            <Button onClick={handleSubmit}>Ya, Simpan</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
