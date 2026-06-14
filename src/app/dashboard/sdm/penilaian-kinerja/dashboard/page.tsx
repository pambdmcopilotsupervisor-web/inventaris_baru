"use client"

import React, { useState } from "react"
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  RadialLinearScale,
  Filler,
  Tooltip,
  Legend,
} from "chart.js"
import { Line, Bar, Radar } from "react-chartjs-2"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useApi } from "@/hooks/useApi"
import { Activity, Award, BarChart3, ChevronDown, ChevronUp, RefreshCw, TrendingUp, Users } from "lucide-react"

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, RadialLinearScale, Filler, Tooltip, Legend)

type Periode = { id: number; nama_periode: string; kode_periode?: string; status?: string }
type Divisi = { id: number; nama_divisi: string }
type Summary = {
  rata_nilai: number | null
  total_pegawai: number
  total_final: number
  completion_percent: number
  predikat_counts: { label: string; count: number }[]
  prev_rata_nilai: number | null
  delta: number | null
}
type RankingRow = {
  id: number
  peringkat: number
  nama_karyawan: string
  jabatan: string
  nama_divisi: string | null
  nilai_akhir: number | null
  predikat: string | null
  delta: number | null
  komponen: { kehadiran: number; capaian: number; perilaku: number; kompetensi: number }
}
type DashboardResponse = {
  periode: Periode
  divisis: Divisi[]
  scope: { can_see_all: boolean; enforced_divisi_id: number | null }
  summary: Summary
  trend: { labels: string[]; datasets: { label: string; data: (number | null)[]; borderColor: string; backgroundColor: string }[] }
  distribution: { labels: string[]; counts: number[] }
  ranking: RankingRow[]
}

type SortKey = "peringkat" | "nama_karyawan" | "jabatan" | "nama_divisi" | "nilai_akhir" | "predikat" | "delta"

function fmt(value: number | null | undefined, digits = 2): string {
  return value == null ? "-" : value.toFixed(digits)
}

function predikatVariant(predikat: string | null): "default" | "secondary" | "warning" | "success" | "destructive" | "outline" {
  if (predikat === "Istimewa" || predikat === "Sangat Baik") return "success"
  if (predikat === "Baik") return "default"
  if (predikat === "Cukup") return "warning"
  if (predikat === "Kurang") return "destructive"
  return "outline"
}

function compareValue(row: RankingRow, key: SortKey): string | number {
  const value = row[key]
  if (typeof value === "number") return value
  return String(value ?? "")
}

export default function DashboardKinerjaPage() {
  const { data: periodeList } = useApi<Periode[]>("/api/periode")
  const [selectedPeriode, setSelectedPeriode] = useState("")
  const [selectedDivisi, setSelectedDivisi] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("peringkat")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null)
  const [rankingPage, setRankingPage] = useState(1)
  const [rankingPerPage, setRankingPerPage] = useState(10)

  const query = [
    selectedPeriode ? `id_periode=${selectedPeriode}` : "",
    selectedDivisi ? `divisi_id=${selectedDivisi}` : "",
  ].filter(Boolean).join("&")
  const { data, loading, refetch } = useApi<DashboardResponse>(`/api/penilaian/dashboard${query ? `?${query}` : ""}`, [selectedPeriode, selectedDivisi])

  const ranking = [...(data?.ranking ?? [])].sort((a, b) => {
    const av = compareValue(a, sortKey)
    const bv = compareValue(b, sortKey)
    const result = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv))
    return sortDir === "asc" ? result : -result
  })
  const totalRankingPages = Math.max(1, Math.ceil(ranking.length / rankingPerPage))
  const activeRankingPage = Math.min(rankingPage, totalRankingPages)
  const paginatedRanking = ranking.slice((activeRankingPage - 1) * rankingPerPage, activeRankingPage * rankingPerPage)
  const rankingStart = ranking.length === 0 ? 0 : (activeRankingPage - 1) * rankingPerPage + 1
  const rankingEnd = Math.min(activeRankingPage * rankingPerPage, ranking.length)
  const selectedEmployee = ranking.find(row => row.id === selectedEmployeeId) ?? ranking[0] ?? null

  const changeSort = (key: SortKey) => {
    setRankingPage(1)
    if (sortKey === key) setSortDir(dir => dir === "asc" ? "desc" : "asc")
    else { setSortKey(key); setSortDir(key === "nilai_akhir" || key === "delta" ? "desc" : "asc") }
  }

  const sortIcon = (key: SortKey) => sortKey === key ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null

  const lineData = {
    labels: data?.trend.labels ?? [],
    datasets: (data?.trend.datasets ?? []).map(dataset => ({
      ...dataset,
      tension: 0.35,
      borderWidth: 2,
      pointRadius: 3,
      spanGaps: true,
    })),
  }
  const barData = {
    labels: data?.distribution.labels ?? [],
    datasets: [{ label: "Pegawai", data: data?.distribution.counts ?? [], backgroundColor: ["#16a34a", "#22c55e", "#2563eb", "#f59e0b", "#dc2626"], borderRadius: 8 }],
  }
  const radarData = {
    labels: ["Kehadiran", "Capaian", "Perilaku", "Kompetensi"],
    datasets: [{
      label: selectedEmployee?.nama_karyawan ?? "Pegawai",
      data: selectedEmployee ? [selectedEmployee.komponen.kehadiran, selectedEmployee.komponen.capaian, selectedEmployee.komponen.perilaku, selectedEmployee.komponen.kompetensi] : [0, 0, 0, 0],
      backgroundColor: "rgba(37, 99, 235, 0.18)",
      borderColor: "#2563eb",
      borderWidth: 2,
      pointBackgroundColor: "#2563eb",
    }],
  }

  const chartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" as const } }, scales: { y: { min: 0, max: 100 } } }
  const horizontalBarOptions = { responsive: true, maintainAspectRatio: false, indexAxis: "y" as const, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } }
  const radarOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { r: { min: 0, max: 120, ticks: { stepSize: 20 } } } }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Dashboard Kinerja Organisasi</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>{data?.periode.nama_periode ?? "Periode aktif"}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={selectedPeriode} onChange={e => { setSelectedPeriode(e.target.value); setRankingPage(1); setSelectedEmployeeId(null) }} className="h-8 rounded-lg px-3 text-sm" style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }}>
            <option value="">Periode aktif</option>
            {(periodeList ?? []).map(p => <option key={p.id} value={p.id}>{p.nama_periode}</option>)}
          </select>
          <select value={selectedDivisi} onChange={e => { setSelectedDivisi(e.target.value); setRankingPage(1); setSelectedEmployeeId(null) }} disabled={!data?.scope.can_see_all} className="h-8 rounded-lg px-3 text-sm" style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }}>
            <option value="">{data?.scope.can_see_all ? "Semua divisi" : "Divisi saya"}</option>
            {(data?.divisis ?? []).map(d => <option key={d.id} value={d.id}>{d.nama_divisi}</option>)}
          </select>
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      {loading && <div className="rounded-xl p-4 text-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-subtle)" }}>Memuat dashboard kinerja...</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <SummaryCard icon={<Award className="h-4 w-4" />} label="Rata-rata Nilai Akhir" value={fmt(data?.summary.rata_nilai)} sub={`${data?.summary.total_pegawai ?? 0} pegawai dalam scope`} />
        <SummaryCard icon={<Users className="h-4 w-4" />} label="Distribusi Predikat" value={`${data?.summary.predikat_counts.reduce((sum, item) => sum + item.count, 0) ?? 0} dinilai`} sub={(data?.summary.predikat_counts ?? []).map(item => `${item.label}: ${item.count}`).join(" | ")} />
        <SummaryCard icon={<Activity className="h-4 w-4" />} label="Penyelesaian Final" value={`${fmt(data?.summary.completion_percent, 1)}%`} sub={`${data?.summary.total_final ?? 0} final dari ${data?.summary.total_pegawai ?? 0}`} />
        <SummaryCard icon={<TrendingUp className="h-4 w-4" />} label="Vs Periode Sebelumnya" value={data?.summary.delta == null ? "-" : `${data.summary.delta >= 0 ? "+" : ""}${fmt(data.summary.delta)}`} sub={`Rata-rata lalu: ${fmt(data?.summary.prev_rata_nilai)}`} tone={(data?.summary.delta ?? 0) >= 0 ? "up" : "down"} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.8fr)] gap-5">
        <section className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2 mb-3"><BarChart3 className="h-4 w-4" style={{ color: "var(--primary)" }} /><h2 className="font-bold" style={{ color: "var(--text-900)" }}>Grafik Tren Nilai</h2></div>
          <div className="h-[320px]"><Line data={lineData} options={chartOptions} /></div>
        </section>
        <section className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <h2 className="font-bold mb-3" style={{ color: "var(--text-900)" }}>Distribusi Nilai</h2>
          <div className="h-[320px]"><Bar data={barData} options={horizontalBarOptions} /></div>
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,0.75fr)] gap-5">
        <section className="rounded-xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="px-4 py-3 flex items-center justify-between gap-2" style={{ borderBottom: "1px solid var(--border)" }}>
            <div><h2 className="font-bold" style={{ color: "var(--text-900)" }}>Tabel Peringkat Pegawai</h2><p className="text-xs" style={{ color: "var(--text-subtle)" }}>Klik nama untuk melihat radar komponen nilai.</p></div>
            <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-subtle)" }}>
              <span>Per halaman</span>
              <select value={rankingPerPage} onChange={e => { setRankingPerPage(Number(e.target.value)); setRankingPage(1) }} className="h-7 rounded-md px-2 text-xs" style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }}>
                {[10, 25, 50].map(size => <option key={size} value={size}>{size}</option>)}
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr style={{ background: "var(--surface-muted)", borderBottom: "1px solid var(--border)" }}>
                {([
                  ["peringkat", "Peringkat"], ["nama_karyawan", "Nama"], ["jabatan", "Jabatan"], ["nama_divisi", "Divisi"], ["nilai_akhir", "Nilai Akhir"], ["predikat", "Predikat"], ["delta", "Delta"]
                ] as [SortKey, string][]).map(([key, label]) => <th key={key} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide"><button className="inline-flex items-center gap-1" onClick={() => changeSort(key)} style={{ color: "var(--text-subtle)" }}>{label}{sortIcon(key)}</button></th>)}
              </tr></thead>
              <tbody>
                {ranking.length === 0 ? <tr><td colSpan={7} className="px-4 py-10 text-center text-sm" style={{ color: "var(--text-subtle)" }}>Belum ada nilai akhir pada periode ini.</td></tr> : paginatedRanking.map(row => (
                  <tr key={row.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-4 py-3 font-mono font-bold" style={{ color: "var(--primary)" }}>#{row.peringkat}</td>
                    <td className="px-4 py-3"><button onClick={() => setSelectedEmployeeId(row.id)} className="font-semibold text-left hover:underline" style={{ color: "var(--text-900)" }}>{row.nama_karyawan}</button></td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--text-700)" }}>{row.jabatan}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--text-700)" }}>{row.nama_divisi ?? "-"}</td>
                    <td className="px-4 py-3 font-mono font-bold">{fmt(row.nilai_akhir)}</td>
                    <td className="px-4 py-3"><Badge variant={predikatVariant(row.predikat)}>{row.predikat ?? "Belum Dinilai"}</Badge></td>
                    <td className="px-4 py-3 font-mono" style={{ color: row.delta == null ? "var(--text-subtle)" : row.delta >= 0 ? "var(--success, #16a34a)" : "var(--danger, #dc2626)" }}>{row.delta == null ? "-" : `${row.delta >= 0 ? "+" : ""}${fmt(row.delta)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ranking.length > 0 && (
            <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ borderTop: "1px solid var(--border)" }}>
              <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
                Menampilkan {rankingStart}-{rankingEnd} dari {ranking.length} pegawai
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => setRankingPage(1)} disabled={activeRankingPage <= 1}>Awal</Button>
                <Button variant="outline" size="sm" onClick={() => setRankingPage(page => Math.max(1, page - 1))} disabled={activeRankingPage <= 1}>Sebelumnya</Button>
                <span className="px-3 text-xs font-semibold" style={{ color: "var(--text-700)" }}>{activeRankingPage} / {totalRankingPages}</span>
                <Button variant="outline" size="sm" onClick={() => setRankingPage(page => Math.min(totalRankingPages, page + 1))} disabled={activeRankingPage >= totalRankingPages}>Berikutnya</Button>
                <Button variant="outline" size="sm" onClick={() => setRankingPage(totalRankingPages)} disabled={activeRankingPage >= totalRankingPages}>Akhir</Button>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <h2 className="font-bold" style={{ color: "var(--text-900)" }}>Radar Komponen Pegawai</h2>
          <p className="text-xs mt-0.5 mb-3" style={{ color: "var(--text-subtle)" }}>{selectedEmployee?.nama_karyawan ?? "Pilih pegawai dari tabel"}</p>
          <div className="h-[320px]"><Radar data={radarData} options={radarOptions} /></div>
        </section>
      </div>
    </div>
  )
}

function SummaryCard({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide" style={{ color: tone === "down" ? "var(--danger, #dc2626)" : "var(--primary)" }}>{icon}{label}</div>
      <p className="text-2xl font-bold font-mono mt-2" style={{ color: "var(--text-900)" }}>{value}</p>
      <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--text-subtle)" }}>{sub}</p>
    </div>
  )
}
