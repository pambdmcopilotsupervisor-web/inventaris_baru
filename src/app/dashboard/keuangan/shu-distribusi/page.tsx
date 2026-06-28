"use client"

import React, { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { SelectField } from "@/components/ui/form-field"
import { Modal } from "@/components/ui/modal"
import { PieChart, RefreshCw, AlertCircle, CheckCircle2, Save } from "lucide-react"
import { getShuConfig, createShuDistribution, type ShuConfig, type ShuPos } from "@/actions/keuangan-shu"
import { rp, formatThousand, parseThousand } from "@/lib/keuangan/format"

export default function ShuDistribusiPage() {
  const now = new Date()
  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i)
  const [tahun, setTahun] = useState(String(now.getFullYear()))
  const [cfg, setCfg] = useState<ShuConfig | null>(null)
  const [pos, setPos] = useState<(ShuPos & { jumlahStr: string })[]>([])
  const [tanggal, setTanggal] = useState(`${now.getFullYear()}-12-31`)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const load = async () => {
    setLoading(true); setError(null); setDone(null)
    const res = await getShuConfig(Number(tahun))
    if (res.success) {
      setCfg(res.data)
      setPos(res.data.pos.map((p) => ({ ...p, jumlahStr: formatThousand(p.jumlah) })))
      setTanggal(`${tahun}-12-31`)
    } else setError(res.error)
    setLoading(false)
  }

  useEffect(() => { load() }, [tahun])

  function setPersen(idx: number, persenStr: string) {
    const persen = parseFloat(persenStr) || 0
    setPos((prev) => prev.map((p, i) => {
      if (i !== idx) return p
      const jumlah = Math.round((cfg?.total_shu ?? 0) * persen / 100)
      return { ...p, persen, jumlah, jumlahStr: formatThousand(jumlah) }
    }))
  }

  function setJumlah(idx: number, val: string) {
    const jumlah = parseThousand(val)
    setPos((prev) => prev.map((p, i) => {
      if (i !== idx) return p
      const persen = cfg?.total_shu ? Math.round((jumlah / cfg.total_shu) * 10000) / 100 : 0
      return { ...p, jumlah, jumlahStr: formatThousand(val), persen }
    }))
  }

  const totalPersen = pos.reduce((s, p) => s + p.persen, 0)
  const totalAlokasi = pos.reduce((s, p) => s + parseThousand(p.jumlahStr), 0)
  const balanced = cfg && Math.abs(totalAlokasi - cfg.total_shu) <= 1 && cfg.total_shu > 0

  async function handleSubmit() {
    setConfirmOpen(false)
    if (!cfg) return
    setSaving(true); setError(null)
    const res = await createShuDistribution({
      tahun: Number(tahun), tanggal,
      pos: pos.map((p) => ({ nama_pos: p.nama_pos, akun_id: p.akun_id, persen: p.persen, jumlah: parseThousand(p.jumlahStr) })),
    })
    setSaving(false)
    if (res.success) { setDone(res.data.nomor_jurnal); load() }
    else setError(res.error)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <PieChart className="h-5 w-5" style={{ color: "var(--primary)" }} />
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-900)" }}>Distribusi SHU</h1>
        </div>
        <div className="flex gap-2 items-end">
          <SelectField label="Tahun Buku" value={tahun} onChange={(e) => setTahun(e.target.value)} options={years.map((y) => ({ value: String(y), label: String(y) }))} className="w-32" />
          <Button variant="ghost" size="sm" onClick={load}><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /></Button>
        </div>
      </div>

      <p className="text-sm" style={{ color: "var(--text-subtle)" }}>
        Alokasikan SHU tahun berjalan ke pos-pos pembagian sesuai AD/ART. Persentase dapat disesuaikan;
        total alokasi harus sama dengan total SHU. Distribusi membuat jurnal otomatis (POSTED).
      </p>

      {done && (
        <div className="flex items-center gap-2 p-3 rounded-lg text-sm" style={{ background: "rgba(5,150,105,0.08)", color: "rgb(5,150,105)", border: "1px solid rgba(5,150,105,0.25)" }}>
          <CheckCircle2 className="h-4 w-4" />Distribusi SHU berhasil. Jurnal {done} telah dibuat.
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg text-sm" style={{ background: "rgba(220,38,38,0.08)", color: "rgb(220,38,38)" }}>
          <AlertCircle className="h-4 w-4" />{error}
        </div>
      )}
      {cfg?.already_distributed && !done && (
        <div className="flex items-center gap-2 p-3 rounded-lg text-sm" style={{ background: "rgba(217,119,6,0.08)", color: "rgb(180,83,9)", border: "1px solid rgba(217,119,6,0.25)" }}>
          <AlertCircle className="h-4 w-4" />SHU tahun {tahun} sudah didistribusikan ({cfg.jurnal_nomor}).
        </div>
      )}

      {cfg && (
        <div className="rounded-xl p-4 flex items-center justify-between" style={{ background: "rgba(109,40,217,0.06)", border: "1px solid rgba(109,40,217,0.25)" }}>
          <span className="text-sm font-semibold" style={{ color: "var(--text-subtle)" }}>Total SHU Tersedia ({tahun})</span>
          <span className="text-xl font-bold" style={{ color: "rgb(109,40,217)" }}>{rp(cfg.total_shu)}</span>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: "var(--surface-muted)" }} />)}</div>
      ) : cfg && (
        <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--surface-muted)" }}>
                <th className="text-left p-2.5 text-xs font-semibold">Pos Pembagian</th>
                <th className="text-left p-2.5 text-xs font-semibold">Akun</th>
                <th className="text-right p-2.5 text-xs font-semibold w-28">Persen (%)</th>
                <th className="text-right p-2.5 text-xs font-semibold w-44">Jumlah (Rp)</th>
              </tr>
            </thead>
            <tbody>
              {pos.map((p, i) => (
                <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="p-2.5">{p.nama_pos}</td>
                  <td className="p-2.5 font-mono text-xs" style={{ color: "var(--text-subtle)" }}>{p.kode} — {p.nama_akun}</td>
                  <td className="p-1.5">
                    <input type="number" step="0.01" value={p.persen} disabled={cfg.already_distributed}
                      onChange={(e) => setPersen(i, e.target.value)}
                      className="w-full text-xs rounded px-2 py-1.5 border text-right disabled:opacity-60"
                      style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-900)" }} />
                  </td>
                  <td className="p-1.5">
                    <input inputMode="numeric" value={p.jumlahStr} disabled={cfg.already_distributed}
                      onChange={(e) => setJumlah(i, e.target.value)}
                      className="w-full text-xs rounded px-2 py-1.5 border text-right disabled:opacity-60"
                      style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-900)" }} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t font-bold" style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}>
                <td colSpan={2} className="p-2.5 text-right">Total</td>
                <td className="p-2.5 text-right" style={{ color: Math.abs(totalPersen - 100) < 0.01 ? "rgb(5,150,105)" : "rgb(220,38,38)" }}>{totalPersen.toFixed(2)}%</td>
                <td className="p-2.5 text-right" style={{ color: balanced ? "rgb(5,150,105)" : "rgb(220,38,38)" }}>{rp(totalAlokasi)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {cfg && !cfg.already_distributed && (
        <div className="flex items-center justify-between">
          <span className="text-sm">
            {cfg.total_shu > 0 && (balanced
              ? <span style={{ color: "rgb(5,150,105)" }}>✓ Alokasi seimbang</span>
              : <span style={{ color: "rgb(220,38,38)" }}>Selisih: {rp(Math.abs(totalAlokasi - cfg.total_shu))}</span>)}
          </span>
          <Button onClick={() => setConfirmOpen(true)} disabled={!balanced || saving}>
            <Save className="h-4 w-4 mr-1" />{saving ? "Memproses…" : "Distribusikan SHU"}
          </Button>
        </div>
      )}

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Konfirmasi Distribusi SHU" size="sm">
        <div className="space-y-4">
          <p className="text-sm" style={{ color: "var(--text-900)" }}>
            SHU tahun <strong>{tahun}</strong> sebesar <strong>{rp(cfg?.total_shu ?? 0)}</strong> akan
            didistribusikan ke {pos.length} pos melalui jurnal POSTED. Tindakan ini tidak dapat dibatalkan. Lanjutkan?
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Batal</Button>
            <Button onClick={handleSubmit}>Ya, Distribusikan</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
