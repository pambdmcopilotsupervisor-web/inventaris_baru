"use client"

import React, { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { SelectField } from "@/components/ui/form-field"
import { Modal } from "@/components/ui/modal"
import { Lock, AlertCircle, CheckCircle2, RefreshCw } from "lucide-react"
import { getClosingPreview, createClosingEntry, type ClosingPreview } from "@/actions/keuangan-tutup-buku"
import { rp } from "@/lib/keuangan/format"

export default function TutupBukuPage() {
  const now = new Date()
  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i)
  const [tahun, setTahun] = useState(String(now.getFullYear()))
  const [preview, setPreview] = useState<ClosingPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true); setError(null); setDone(null)
    const res = await getClosingPreview(Number(tahun))
    if (res.success) setPreview(res.data)
    else setError(res.error)
    setLoading(false)
  }

  useEffect(() => { load() }, [tahun])

  async function handleClose() {
    setConfirmOpen(false)
    setSaving(true); setError(null)
    const res = await createClosingEntry(Number(tahun))
    setSaving(false)
    if (res.success) { setDone(res.data.nomor_jurnal); load() }
    else setError(res.error)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5" style={{ color: "var(--primary)" }} />
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-900)" }}>Tutup Buku Tahunan</h1>
        </div>
        <div className="flex gap-2 items-end">
          <SelectField label="Tahun Buku" value={tahun} onChange={(e) => setTahun(e.target.value)}
            options={years.map((y) => ({ value: String(y), label: String(y) }))} className="w-32" />
          <Button variant="ghost" size="sm" onClick={load}><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /></Button>
        </div>
      </div>

      <p className="text-sm" style={{ color: "var(--text-subtle)" }}>
        Tutup buku akan menutup seluruh akun Pendapatan &amp; Beban tahun berjalan ke akun
        <strong> SHU Tahun Berjalan</strong> melalui jurnal penutup (otomatis, POSTED).
      </p>

      {done && (
        <div className="flex items-center gap-2 p-3 rounded-lg text-sm"
          style={{ background: "rgba(5,150,105,0.08)", color: "rgb(5,150,105)", border: "1px solid rgba(5,150,105,0.25)" }}>
          <CheckCircle2 className="h-4 w-4 shrink-0" />Tutup buku berhasil. Jurnal penutup {done} telah dibuat.
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg text-sm" style={{ background: "rgba(220,38,38,0.08)", color: "rgb(220,38,38)" }}>
          <AlertCircle className="h-4 w-4" />{error}
        </div>
      )}
      {preview?.message && !done && (
        <div className="flex items-center gap-2 p-3 rounded-lg text-sm"
          style={{ background: preview.can_close ? "rgba(5,150,105,0.08)" : "rgba(217,119,6,0.08)", color: preview.can_close ? "rgb(5,150,105)" : "rgb(180,83,9)", border: `1px solid ${preview.can_close ? "rgba(5,150,105,0.25)" : "rgba(217,119,6,0.25)"}` }}>
          <AlertCircle className="h-4 w-4 shrink-0" />{preview.message}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: "var(--surface-muted)" }} />)}</div>
      ) : preview && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: "Total Pendapatan", value: preview.pendapatan, color: "rgb(5,150,105)" },
              { label: "Total Beban", value: preview.beban, color: "rgb(220,38,38)" },
              { label: preview.shu >= 0 ? "SHU (Surplus)" : "Defisit", value: preview.shu, color: preview.shu >= 0 ? "rgb(109,40,217)" : "rgb(220,38,38)" },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <p className="text-xs font-medium" style={{ color: "var(--text-subtle)" }}>{label}</p>
                <p className="text-lg font-bold mt-1" style={{ color }}>{rp(value)}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <h3 className="font-semibold text-sm mb-2" style={{ color: "var(--text-900)" }}>Pendapatan yang akan ditutup</h3>
              <table className="w-full text-sm">
                <tbody>
                  {preview.pendapatan_rows.map((r) => (
                    <tr key={r.kode} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                      <td className="py-1.5 font-mono text-xs" style={{ color: "var(--text-subtle)" }}>{r.kode}</td>
                      <td className="py-1.5">{r.nama}</td>
                      <td className="py-1.5 text-right font-medium">{rp(r.saldo)}</td>
                    </tr>
                  ))}
                  {preview.pendapatan_rows.length === 0 && <tr><td className="py-2 text-xs" style={{ color: "var(--text-subtle)" }}>—</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <h3 className="font-semibold text-sm mb-2" style={{ color: "var(--text-900)" }}>Beban yang akan ditutup</h3>
              <table className="w-full text-sm">
                <tbody>
                  {preview.beban_rows.map((r) => (
                    <tr key={r.kode} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                      <td className="py-1.5 font-mono text-xs" style={{ color: "var(--text-subtle)" }}>{r.kode}</td>
                      <td className="py-1.5">{r.nama}</td>
                      <td className="py-1.5 text-right font-medium">{rp(r.saldo)}</td>
                    </tr>
                  ))}
                  {preview.beban_rows.length === 0 && <tr><td className="py-2 text-xs" style={{ color: "var(--text-subtle)" }}>—</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => setConfirmOpen(true)} disabled={!preview.can_close || saving}>
              <Lock className="h-4 w-4 mr-1" />{saving ? "Memproses…" : "Buat Jurnal Penutup"}
            </Button>
          </div>
        </>
      )}

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Konfirmasi Tutup Buku" size="sm">
        <div className="space-y-4">
          <p className="text-sm" style={{ color: "var(--text-900)" }}>
            Buku tahun <strong>{tahun}</strong> akan ditutup dengan SHU sebesar{" "}
            <strong>{rp(preview?.shu ?? 0)}</strong>. Jurnal penutup berstatus POSTED dan tidak dapat dibatalkan. Lanjutkan?
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Batal</Button>
            <Button onClick={handleClose}>Ya, Tutup Buku</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
