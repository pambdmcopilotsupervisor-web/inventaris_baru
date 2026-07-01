"use client"

import React, { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { SelectField, TextField } from "@/components/ui/form-field"
import { Modal } from "@/components/ui/modal"
import { Users, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react"
import {
  getMassalPreview, createSimpananMassal, type MassalPreviewRow,
} from "@/actions/keuangan-simpanan-massal"
import { getPeriodeFiskal, type PeriodeFiskalRow } from "@/actions/keuangan-periode"
import { rp, formatThousand, parseThousand } from "@/lib/keuangan/format"

const JENIS_OPTIONS = [
  { value: "WAJIB", label: "Simpanan Wajib" },
  { value: "POKOK", label: "Simpanan Pokok" },
  { value: "SUKARELA", label: "Simpanan Sukarela" },
]

export default function SimpananMassalPage() {
  const now = new Date()
  const [rows, setRows] = useState<MassalPreviewRow[]>([])
  const [periods, setPeriods] = useState<PeriodeFiskalRow[]>([])
  const [jenis, setJenis] = useState<"WAJIB" | "POKOK" | "SUKARELA">("WAJIB")
  const [tanggal, setTanggal] = useState(now.toISOString().split("T")[0])
  const [defaultJumlah, setDefaultJumlah] = useState("")
  const [amounts, setAmounts] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ sukses: number; total: number; nomor_jurnal: string } | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const load = async () => {
    setLoading(true)
    const [previewRes, periodeRes] = await Promise.all([
      getMassalPreview(jenis),
      getPeriodeFiskal(),
    ])
    if (previewRes.success) {
      setRows(previewRes.data)
      setAmounts({})
    }
    if (periodeRes.success) setPeriods(periodeRes.data)
    setLoading(false)
  }

  useEffect(() => { load() }, [jenis])

  // Saat default jumlah diisi, terapkan ke semua yang kosong
  function applyDefault(val: string) {
    setDefaultJumlah(val)
    const jumlah = parseThousand(val)
    if (jumlah <= 0) return
    setAmounts((prev) => {
      const next = { ...prev }
      rows.forEach((r) => {
        if (!next[r.id] || parseThousand(next[r.id]) === 0) {
          next[r.id] = formatThousand(val)
        }
      })
      return next
    })
  }

  function setAllSame() {
    const jumlah = parseThousand(defaultJumlah)
    if (jumlah <= 0) return
    const next: Record<number, string> = {}
    rows.forEach((r) => { next[r.id] = formatThousand(defaultJumlah) })
    setAmounts(next)
  }

  const totalBayar = rows.reduce((s, r) => s + parseThousand(amounts[r.id] ?? ""), 0)
  const countBayar = rows.filter((r) => parseThousand(amounts[r.id] ?? "") > 0).length

  async function handleSubmit() {
    setConfirmOpen(false)
    setSaving(true); setError(null)
    const items = rows.map((r) => ({ anggota_id: r.id, jumlah: parseThousand(amounts[r.id] ?? "") }))
    const res = await createSimpananMassal({ jenis, tanggal, items })
    setSaving(false)
    if (res.success) {
      setDone(res.data)
      setAmounts({})
    } else setError(res.error)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5" style={{ color: "var(--primary)" }} />
        <h1 className="text-xl font-semibold" style={{ color: "var(--text-900)" }}>Setoran Simpanan Massal</h1>
      </div>

      <p className="text-sm" style={{ color: "var(--text-subtle)" }}>
        Input setoran simpanan untuk banyak anggota sekaligus. Satu jurnal gabungan dibuat otomatis (POSTED).
      </p>

      {done && (
        <div className="flex items-center gap-2 p-3 rounded-lg text-sm" style={{ background: "rgba(5,150,105,0.08)", color: "rgb(5,150,105)", border: "1px solid rgba(5,150,105,0.25)" }}>
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Berhasil! {done.sukses} anggota • Total {rp(done.total)} • Jurnal: {done.nomor_jurnal}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg text-sm" style={{ background: "rgba(220,38,38,0.08)", color: "rgb(220,38,38)" }}>
          <AlertCircle className="h-4 w-4" />{error}
        </div>
      )}

      {/* Konfigurasi batch */}
      <div className="flex flex-wrap gap-3 items-end p-4 rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <SelectField label="Jenis Simpanan" value={jenis} onChange={(e) => setJenis(e.target.value as "WAJIB" | "POKOK" | "SUKARELA")} options={JENIS_OPTIONS} className="w-44" />
        <TextField label="Tanggal Setoran" value={tanggal} onChange={(e) => setTanggal(e.target.value)} type="date" className="w-44" />
        <div className="flex gap-2 items-end">
          <TextField label="Jumlah Default (Rp)" value={defaultJumlah} onChange={(e) => setDefaultJumlah(formatThousand(e.target.value))} inputMode="numeric" placeholder="mis: 50.000" className="w-40" />
          <Button variant="outline" size="sm" onClick={setAllSame}>Terapkan Semua</Button>
        </div>
        <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button>
      </div>

      {/* Tabel anggota */}
      {loading ? (
        <div className="space-y-2">{[1,2,3,4,5].map((i) => <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: "var(--surface-muted)" }} />)}</div>
      ) : (
        <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--surface-muted)" }}>
                <th className="text-left p-2.5 text-xs font-semibold">No.</th>
                <th className="text-left p-2.5 text-xs font-semibold">Nama Anggota</th>
                <th className="text-right p-2.5 text-xs font-semibold">Saldo Wajib</th>
                <th className="text-right p-2.5 text-xs font-semibold">Saldo Pokok</th>
                <th className="text-right p-2.5 text-xs font-semibold w-44">Jumlah Setoran (Rp)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="p-2 font-mono text-xs" style={{ color: "var(--text-subtle)" }}>{r.no_anggota}</td>
                  <td className="p-2 font-medium">{r.nama}</td>
                  <td className="p-2 text-right text-xs">{rp(r.saldo_wajib)}</td>
                  <td className="p-2 text-right text-xs">{rp(r.saldo_pokok)}</td>
                  <td className="p-1.5">
                    <input
                      inputMode="numeric"
                      value={amounts[r.id] ?? ""}
                      onChange={(e) => setAmounts((prev) => ({ ...prev, [r.id]: formatThousand(e.target.value) }))}
                      className="w-full text-xs rounded px-2 py-1.5 border text-right"
                      style={{ borderColor: parseThousand(amounts[r.id] ?? "") > 0 ? "var(--primary)" : "var(--border)", background: "var(--surface)", color: "var(--text-900)" }}
                      placeholder="0"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t font-bold" style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}>
                <td colSpan={4} className="p-2.5 text-right text-sm">Total ({countBayar} anggota)</td>
                <td className="p-2.5 text-right text-sm" style={{ color: "rgb(5,150,105)" }}>{rp(totalBayar)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="flex justify-end sticky bottom-0 py-3" style={{ background: "var(--bg)" }}>
        <Button onClick={() => setConfirmOpen(true)} disabled={countBayar === 0 || saving}>
          {saving ? "Memproses…" : `Simpan & Jurnal (${countBayar} anggota • ${rp(totalBayar)})`}
        </Button>
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Konfirmasi Setoran Massal" size="sm">
        <div className="space-y-4">
          <p className="text-sm" style={{ color: "var(--text-900)" }}>
            Setoran <strong>{jenis}</strong> untuk <strong>{countBayar} anggota</strong> senilai{" "}
            <strong>{rp(totalBayar)}</strong> akan diproses dan jurnal otomatis dibuat (POSTED). Lanjutkan?
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Batal</Button>
            <Button onClick={handleSubmit}>Ya, Proses</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
