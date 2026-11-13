"use client"

import { useEffect, useId, useState } from "react"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getCurrentBillingPeriod } from "@/lib/kendaraan-billing"
import type { VehicleRentalProfit } from "@/lib/kendaraan-profit"
import { formatCurrency } from "@/lib/utils"

const PAGE_SIZE = 12
const money = (value: number | null) => value === null ? "Belum dapat dihitung" : formatCurrency(value)
const periodLabel = (period: string) => new Intl.DateTimeFormat("id-ID", {
  month: "long", year: "numeric", timeZone: "UTC",
}).format(new Date(`${period}-01T00:00:00Z`))

export function RentalProfit({ kendaraanId }: { kendaraanId: number }) {
  const inputId = useId()
  const currentPeriod = getCurrentBillingPeriod()
  const [draftStart, setDraftStart] = useState("")
  const [draftEnd, setDraftEnd] = useState(currentPeriod)
  const [range, setRange] = useState({ start: "", end: currentPeriod, attempt: 0 })
  const [page, setPage] = useState(1)
  const key = `${kendaraanId}:${range.start}:${range.end}:${range.attempt}`
  const [result, setResult] = useState<{ key: string; data?: VehicleRentalProfit; error?: string } | null>(null)
  const loading = result?.key !== key
  const data = !loading ? result?.data : undefined
  const error = !loading ? result?.error : undefined

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const query = new URLSearchParams({ sampai: range.end })
        if (range.start) query.set("mulai", range.start)
        const response = await fetch(`/api/kendaraan/${kendaraanId}/keuntungan?${query}`, { signal: controller.signal })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error ?? "Gagal mengambil keuntungan sewa")
        if (!controller.signal.aborted) setResult({ key, data: body })
      } catch (err) {
        if (!controller.signal.aborted) setResult({ key, error: err instanceof Error ? err.message : "Gagal mengambil keuntungan sewa" })
      }
    }
    void load()
    return () => controller.abort()
  }, [kendaraanId, range.start, range.end, key])

  const pages = Math.max(1, Math.ceil((data?.riwayat.length ?? 0) / PAGE_SIZE))
  const profitColor = data?.keuntungan === null || data?.keuntungan === undefined ? "var(--text-subtle)" : data.keuntungan < 0 ? "var(--danger)" : "var(--success)"

  return <div className="space-y-4">
    <div>
      <h3 className="text-sm font-semibold" style={{ color: "var(--text-900)" }}>Estimasi Keuntungan Sewa</h3>
      <p className="text-xs mt-1" style={{ color: "var(--text-subtle)" }}>
        Estimasi laba operasional = tagihan sewa − biaya servis − pajak − STNK − KIR yang tercatat dalam rentang pilihan.
      </p>
    </div>

    <form className="flex flex-wrap items-end gap-3" onSubmit={event => {
      event.preventDefault()
      if (!draftEnd || draftEnd > currentPeriod || (draftStart && draftStart > draftEnd)) return
      setRange(previous => ({ start: draftStart, end: draftEnd, attempt: previous.attempt + 1 }))
      setPage(1)
    }}>
      <div>
        <label htmlFor={`${inputId}-start`} className="block text-xs font-medium mb-1">Dari bulan (kosong = awal kontrak)</label>
        <input id={`${inputId}-start`} type="month" min="1000-01" max={draftEnd || currentPeriod} value={draftStart}
          onChange={event => setDraftStart(event.target.value)} className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }} />
      </div>
      <div>
        <label htmlFor={`${inputId}-end`} className="block text-xs font-medium mb-1">Sampai bulan</label>
        <input id={`${inputId}-end`} type="month" required min={draftStart || "1000-01"} max={currentPeriod} value={draftEnd}
          onChange={event => setDraftEnd(event.target.value)} className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }} />
      </div>
      <Button type="submit" size="sm" disabled={loading || !draftEnd}>{loading ? "Memuat..." : "Tampilkan"}</Button>
    </form>

    {loading && <div role="status" className="flex items-center gap-2 py-8 text-sm" style={{ color: "var(--text-subtle)" }}>
      <RefreshCw className="h-4 w-4 animate-spin" /> Menghitung keuntungan sewa...
    </div>}
    {error && <div role="alert" className="rounded-lg p-3 text-sm" style={{ color: "var(--danger)", background: "var(--danger-bg)" }}>{error}</div>}

    {data && <>
      <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{periodLabel(data.periode_mulai)} – {periodLabel(data.periode_sampai)} · {data.bulan_tagihan} bulan masuk perhitungan tagihan</p>
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Estimasi pendapatan sewa", value: money(data.pendapatan) },
          { label: "Biaya tercatat", value: money(data.total_biaya) },
          { label: "Estimasi laba / rugi operasional", value: money(data.keuntungan), color: profitColor },
          { label: "Margin estimasi", value: data.margin_persen === null ? "—" : `${data.margin_persen.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%` },
        ].map(item => <div key={item.label} className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
          <dt className="text-xs" style={{ color: "var(--text-subtle)" }}>{item.label}</dt>
          <dd className="text-sm font-semibold mt-1" style={{ color: item.color ?? "var(--text-900)" }}>{item.value}</dd>
        </div>)}
      </dl>
      <div className="rounded-lg p-3 text-xs space-y-1" style={{ background: "var(--surface-muted)", color: "var(--text-subtle)" }}>
        <p>Tarif per bulan: <strong>{data.harga_sewa === null ? "belum diisi" : formatCurrency(data.harga_sewa)}</strong>. Harga sewa saat ini diterapkan ke seluruh bulan yang memenuhi aturan penagihan, termasuk perpanjangan.</p>
        <p>Pendapatan merupakan estimasi tagihan, belum menunjukkan uang sewa yang diterima. Harga beli, penyusutan, dan biaya lain di luar catatan servis/Pajak/STNK/KIR belum dikurangkan.</p>
        <p>Biaya mengikuti tanggal transaksi, termasuk pada bulan jeda atau setelah sewa berhenti. Biaya sebelum rentang pilihan tidak disertakan.</p>
      </div>
      {data.harga_sewa === null && data.bulan_tagihan > 0 && <p role="status" className="text-sm" style={{ color: "var(--warning)" }}>Isi Harga Sewa pada data kendaraan agar pendapatan dan keuntungan dapat dihitung.</p>}
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        {[["Servis", data.servis], ["Pajak", data.pajak], ["STNK", data.stnk], ["KIR", data.kir]].map(([label, value]) => <div key={label}>
          <dt style={{ color: "var(--text-subtle)" }}>{label}</dt><dd className="font-medium mt-1">{formatCurrency(Number(value))}</dd>
        </div>)}
      </dl>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Periode</TableHead><TableHead>Kontrak</TableHead>
            <TableHead className="text-right">Estimasi Sewa</TableHead><TableHead className="text-right">Servis</TableHead>
            <TableHead className="text-right">Pajak / STNK / KIR</TableHead><TableHead className="text-right">Laba / Rugi</TableHead>
          </TableRow></TableHeader>
          <TableBody>{data.riwayat.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(row => <TableRow key={row.periode}>
            <TableCell className="text-xs whitespace-nowrap">{periodLabel(row.periode)}</TableCell>
            <TableCell className="text-xs">{row.no_kontrak ?? "—"}{!row.ditagihkan && <span className="block" style={{ color: "var(--text-subtle)" }}>Tidak ditagihkan</span>}</TableCell>
            <TableCell className="text-right text-xs whitespace-nowrap">{money(row.pendapatan)}</TableCell>
            <TableCell className="text-right text-xs whitespace-nowrap">{money(row.servis)}</TableCell>
            <TableCell className="text-right text-xs whitespace-nowrap">{money(row.pajak + row.stnk + row.kir)}</TableCell>
            <TableCell className="text-right text-xs font-semibold whitespace-nowrap" style={{ color: row.keuntungan === null ? "var(--text-subtle)" : row.keuntungan < 0 ? "var(--danger)" : "var(--success)" }}>{money(row.keuntungan)}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs" style={{ color: "var(--text-subtle)" }}>
        <span>{data.riwayat.length} periode · Halaman {page} dari {pages}</span>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Sebelumnya</Button>
          <Button type="button" size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(value => value + 1)}>Berikutnya</Button>
        </div>
      </div>
    </>}
  </div>
}
