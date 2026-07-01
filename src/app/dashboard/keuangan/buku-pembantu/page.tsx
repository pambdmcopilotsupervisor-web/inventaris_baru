"use client"

import React, { useEffect, useMemo, useState } from "react"
import { BookOpen, RefreshCw, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { getAnggota, type AnggotaRow } from "@/actions/keuangan-anggota"
import { getBukuPembantuAnggota, type BukuPembantuData } from "@/actions/keuangan-buku-pembantu"
import { rp } from "@/lib/keuangan/format"
import { printToPdf } from "@/lib/keuangan/client-export"

const BADGE: Record<string, string> = { SIMPANAN: "success", PINJAMAN: "warning", SHU: "info" }

export default function BukuPembantuAnggotaPage() {
  const [anggota, setAnggota] = useState<AnggotaRow[]>([])
  const [anggotaId, setAnggotaId] = useState("")
  const [data, setData] = useState<BukuPembantuData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getAnggota().then((r) => { if (r.success) setAnggota(r.data) })
  }, [])

  const options = useMemo(() => anggota.map((a) => ({ value: String(a.id), label: `${a.no_anggota} — ${a.nama}`, description: a.status })), [anggota])

  async function load(id = anggotaId) {
    if (!id) return
    setLoading(true); setError(null)
    const res = await getBukuPembantuAnggota(Number(id))
    if (res.success) setData(res.data)
    else setError(res.error)
    setLoading(false)
  }

  useEffect(() => {
    if (anggotaId) void Promise.resolve().then(() => load(anggotaId))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anggotaId])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" style={{ color: "var(--primary)" }} />
          <div>
            <h1 className="text-xl font-semibold" style={{ color: "var(--text-900)" }}>Buku Pembantu Anggota</h1>
            <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Mutasi simpanan, pinjaman, dan SHU dalam satu kartu anggota.</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap items-end">
          <div className="w-72"><SearchableSelect label="Anggota" value={anggotaId} onChange={setAnggotaId} options={options} placeholder="Pilih anggota" /></div>
          <Button variant="ghost" size="sm" onClick={() => load()}><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /></Button>
          <Button variant="ghost" size="sm" onClick={() => printToPdf("Buku Pembantu Anggota")} disabled={!data}><Printer className="h-3.5 w-3.5 mr-1" />PDF</Button>
        </div>
      </div>

      {error && <div className="p-3 rounded-lg text-sm" style={{ background: "rgba(220,38,38,0.08)", color: "rgb(220,38,38)" }}>{error}</div>}

      {data && (
        <>
          <div className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Anggota</p>
                <h2 className="text-lg font-bold" style={{ color: "var(--text-900)" }}>{data.anggota.no_anggota} — {data.anggota.nama}</h2>
                <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Status: {data.anggota.status}</p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-right">
                <div><p className="text-xs" style={{ color: "var(--text-subtle)" }}>Simpanan</p><p className="font-bold text-green-700">{rp(data.ringkasan.simpanan)}</p></div>
                <div><p className="text-xs" style={{ color: "var(--text-subtle)" }}>Piutang</p><p className="font-bold text-amber-700">{rp(data.ringkasan.pinjaman)}</p></div>
                <div><p className="text-xs" style={{ color: "var(--text-subtle)" }}>SHU</p><p className="font-bold text-purple-700">{rp(data.ringkasan.shu)}</p></div>
              </div>
            </div>
          </div>

          <div className="rounded-xl overflow-hidden overflow-x-auto" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <table className="w-full text-sm">
              <thead style={{ background: "var(--surface-muted)" }}>
                <tr>
                  <th className="p-2 text-left">Tanggal</th><th className="p-2 text-left">Kelompok</th><th className="p-2 text-left">Referensi</th><th className="p-2 text-left">Keterangan</th><th className="p-2 text-right">Masuk</th><th className="p-2 text-right">Keluar</th><th className="p-2 text-right">Saldo Simpanan</th><th className="p-2 text-right">Sisa Piutang</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={`${r.ref}-${i}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="p-2">{new Date(r.tanggal).toLocaleDateString("id-ID")}</td>
                    <td className="p-2"><Badge variant={BADGE[r.kelompok] as never}>{r.kelompok}</Badge></td>
                    <td className="p-2 font-mono text-xs">{r.ref}</td>
                    <td className="p-2">{r.keterangan}</td>
                    <td className="p-2 text-right text-green-700">{r.masuk ? rp(r.masuk) : "-"}</td>
                    <td className="p-2 text-right text-amber-700">{r.keluar ? rp(r.keluar) : "-"}</td>
                    <td className="p-2 text-right font-medium">{rp(r.saldo_simpanan)}</td>
                    <td className="p-2 text-right font-medium">{rp(r.saldo_pinjaman)}</td>
                  </tr>
                ))}
                {data.rows.length === 0 && <tr><td colSpan={8} className="p-4 text-center" style={{ color: "var(--text-subtle)" }}>Belum ada mutasi anggota</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
