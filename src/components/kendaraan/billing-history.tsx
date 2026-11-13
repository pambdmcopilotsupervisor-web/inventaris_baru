"use client"

import { useEffect, useId, useState } from "react"
import { RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getCurrentBillingPeriod, type VehicleBillingHistory } from "@/lib/kendaraan-billing"
import { formatDate } from "@/lib/utils"

function formatPeriod(period: string | null): string {
  return period ? new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${period}-01T00:00:00Z`)) : "—"
}

const PAGE_SIZE = 12

export function BillingHistory({ kendaraanId }: { kendaraanId: number }) {
  const periodId = useId()
  const currentPeriod = getCurrentBillingPeriod()
  const [period, setPeriod] = useState(currentPeriod)
  const [draftPeriod, setDraftPeriod] = useState(currentPeriod)
  const [attempt, setAttempt] = useState(0)
  const [page, setPage] = useState(1)
  const requestKey = `${kendaraanId}:${period}:${attempt}`
  const [result, setResult] = useState<{
    key: string; data?: VehicleBillingHistory; error?: string
  } | null>(null)
  const loading = result?.key !== requestKey
  const data = !loading ? result?.data : undefined
  const error = !loading ? result?.error : undefined

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch(`/api/kendaraan/${kendaraanId}/tagihan?periode=${period}`, { signal: controller.signal })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error ?? "Gagal mengambil riwayat tagihan")
        if (!controller.signal.aborted) setResult({ key: requestKey, data: body })
      } catch (err) {
        if (!controller.signal.aborted) setResult({ key: requestKey, error: err instanceof Error ? err.message : "Gagal mengambil riwayat tagihan" })
      }
    }
    void load()
    return () => controller.abort()
  }, [kendaraanId, period, requestKey])

  const rows = data?.riwayat ?? []
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-900)" }}>Rincian Penagihan Sewa</h3>
        <p className="text-xs mt-1" style={{ color: "var(--text-subtle)" }}>
          Perhitungan berdasarkan kontrak, penjualan, dan stop tagihan. Riwayat ini bukan bukti invoice atau pembayaran sewa.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3" onSubmit={event => {
        event.preventDefault()
        if (!draftPeriod || draftPeriod > currentPeriod) return
        setPeriod(draftPeriod)
        setPage(1)
        setAttempt(value => value + 1)
      }}>
        <div>
          <label htmlFor={periodId} className="block text-xs font-medium mb-1">Hitung sampai periode</label>
          <input id={periodId} type="month" required min="1000-01" max={currentPeriod} value={draftPeriod}
            onChange={event => setDraftPeriod(event.target.value)}
            className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface)" }} />
        </div>
        <Button type="submit" size="sm" disabled={loading || !draftPeriod}>
          {loading ? "Memuat..." : "Tampilkan"}
        </Button>
      </form>

      {loading && <div role="status" className="flex items-center gap-2 py-8 text-sm" style={{ color: "var(--text-subtle)" }}>
        <RefreshCw className="h-4 w-4 animate-spin" /> Memuat riwayat tagihan...
      </div>}
      {error && <div role="alert" className="rounded-lg p-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</div>}

      {data && <>
        <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Perhitungan sampai {formatPeriod(data.periode)}, termasuk bulan tersebut.</p>
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            ["Awal kontrak pertama", data.tgl_awal_kontrak ? formatDate(data.tgl_awal_kontrak) : "—"],
            ["Periode tagihan pertama", formatPeriod(data.periode_pertama)],
            ["Periode tagihan terakhir", formatPeriod(data.periode_terakhir)],
            ["Total periode tagihan", `${data.total_bulan} bulan`],
            ["Jeda antartagihan", `${data.bulan_jeda} bulan`],
            ["Tagihan periode pilihan", rows[0]?.ditagihkan ? "Masuk perhitungan" : "Tidak ditagihkan"],
          ].map(([label, value]) => <div key={label} className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
            <dt className="text-xs" style={{ color: "var(--text-subtle)" }}>{label}</dt>
            <dd className="text-sm font-semibold mt-1" style={{ color: "var(--text-900)" }}>{value}</dd>
          </div>)}
        </dl>
        <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
          Mulai kontrak tanggal 1–19 masuk tagihan bulan itu; mulai tanggal 20 atau setelahnya masuk bulan berikutnya.
          Kontrak berakhir, penjualan, atau stop tanggal 1–19 tidak ditagihkan pada bulan itu.
          Total menghitung bulan yang memenuhi syarat sekali per kendaraan. Jeda hanya dihitung di antara dua periode tagihan.
          Perubahan data kontrak atau tanggal stop akan memperbarui hasil perhitungan.
        </p>

        {rows.length === 0 ? <p className="py-6 text-center text-sm" style={{ color: "var(--text-subtle)" }}>
          {data.tgl_awal_kontrak ? "Kontrak kendaraan belum mulai pada periode pilihan." : "Belum ada kontrak sewa yang terhubung dengan kendaraan ini."}
        </p> : <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Periode</TableHead><TableHead>No. Kontrak</TableHead>
                <TableHead>Tanggal Kontrak</TableHead><TableHead>Status</TableHead><TableHead>Keterangan</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(row => <TableRow key={row.periode}>
                  <TableCell className="text-xs whitespace-nowrap">{formatPeriod(row.periode)}</TableCell>
                  <TableCell className="font-mono text-xs">{row.no_kontrak ?? "—"}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{row.tgl_awal && row.tgl_akhir ? <>{formatDate(row.tgl_awal)}<br />s.d. {formatDate(row.tgl_akhir)}</> : "—"}</TableCell>
                  <TableCell><Badge variant={row.ditagihkan ? "success" : "secondary"} className="whitespace-nowrap">{row.ditagihkan ? "Diperhitungkan" : "Tidak ditagihkan"}</Badge></TableCell>
                  <TableCell className="text-xs min-w-40">{row.keterangan}</TableCell>
                </TableRow>)}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs" style={{ color: "var(--text-subtle)" }}>
            <span>{rows.length} periode · Halaman {page} dari {pages}</span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Sebelumnya</Button>
              <Button type="button" variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(value => value + 1)}>Berikutnya</Button>
            </div>
          </div>
        </>}
      </>}
    </div>
  )
}
