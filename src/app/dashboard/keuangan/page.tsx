"use client"

import React, { useEffect, useState } from "react"
import Link from "next/link"
import {
  BookOpen, Calendar, LayoutDashboard, TrendingUp, Wallet,
  ArrowRight, AlertCircle, RefreshCw, Users, PiggyBank, Lock, PieChart, CheckCircle2, Clock,
} from "lucide-react"
import { getPeriodeFiskal, type PeriodeFiskalRow } from "@/actions/keuangan-periode"
import { getJurnals } from "@/actions/keuangan-jurnal"

const rp = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n)

interface Summary {
  aset: number
  kewajiban: number
  ekuitas: number
  pendapatan: number
  beban: number
  shu: number
  simpanan_pokok: number
  simpanan_wajib: number
}

interface OperationalStatus {
  currentPeriod: PeriodeFiskalRow | null
  draftCount: number
}

const NAV_CARDS = [
  {
    href: "/dashboard/keuangan/bagan-akun",
    icon: <BookOpen className="h-5 w-5" />,
    label: "Bagan Akun",
    desc: "Chart of Accounts — akun PSAK 27",
    color: "rgba(37,99,235,0.1)",
    border: "rgba(37,99,235,0.3)",
    text: "rgb(37,99,235)",
  },
  {
    href: "/dashboard/keuangan/periode-fiskal",
    icon: <Calendar className="h-5 w-5" />,
    label: "Periode Fiskal",
    desc: "Kelola periode akuntansi",
    color: "rgba(5,150,105,0.1)",
    border: "rgba(5,150,105,0.3)",
    text: "rgb(5,150,105)",
  },
  {
    href: "/dashboard/keuangan/jurnal",
    icon: <BookOpen className="h-5 w-5" />,
    label: "Jurnal Umum",
    desc: "Input & kelola entri jurnal",
    color: "rgba(217,119,6,0.1)",
    border: "rgba(217,119,6,0.3)",
    text: "rgb(217,119,6)",
  },
  {
    href: "/dashboard/keuangan/laporan/buku-besar",
    icon: <BookOpen className="h-5 w-5" />,
    label: "Buku Besar",
    desc: "Mutasi dan saldo per akun",
    color: "rgba(14,165,233,0.1)",
    border: "rgba(14,165,233,0.3)",
    text: "rgb(14,116,144)",
  },
  {
    href: "/dashboard/keuangan/laporan/neraca-saldo",
    icon: <LayoutDashboard className="h-5 w-5" />,
    label: "Neraca Saldo",
    desc: "Trial balance debit kredit",
    color: "rgba(30,64,175,0.1)",
    border: "rgba(30,64,175,0.3)",
    text: "rgb(30,64,175)",
  },
  {
    href: "/dashboard/keuangan/laporan/neraca",
    icon: <Wallet className="h-5 w-5" />,
    label: "Neraca",
    desc: "Laporan posisi keuangan",
    color: "rgba(109,40,217,0.1)",
    border: "rgba(109,40,217,0.3)",
    text: "rgb(109,40,217)",
  },
  {
    href: "/dashboard/keuangan/laporan/shu",
    icon: <TrendingUp className="h-5 w-5" />,
    label: "Laporan SHU",
    desc: "Sisa Hasil Usaha periode berjalan",
    color: "rgba(220,38,38,0.1)",
    border: "rgba(220,38,38,0.3)",
    text: "rgb(220,38,38)",
  },
  {
    href: "/dashboard/keuangan/laporan/arus-kas",
    icon: <Wallet className="h-5 w-5" />,
    label: "Arus Kas",
    desc: "Penerimaan dan pengeluaran kas",
    color: "rgba(5,150,105,0.1)",
    border: "rgba(5,150,105,0.3)",
    text: "rgb(5,150,105)",
  },
  {
    href: "/dashboard/keuangan/laporan/perubahan-ekuitas",
    icon: <TrendingUp className="h-5 w-5" />,
    label: "Perubahan Ekuitas",
    desc: "Mutasi ekuitas koperasi",
    color: "rgba(124,58,237,0.1)",
    border: "rgba(124,58,237,0.3)",
    text: "rgb(124,58,237)",
  },
  {
    href: "/dashboard/keuangan/anggota",
    icon: <Users className="h-5 w-5" />,
    label: "Anggota Koperasi",
    desc: "Data anggota koperasi",
    color: "rgba(37,99,235,0.1)",
    border: "rgba(37,99,235,0.3)",
    text: "rgb(37,99,235)",
  },
  {
    href: "/dashboard/keuangan/simpanan",
    icon: <PiggyBank className="h-5 w-5" />,
    label: "Simpanan Anggota",
    desc: "Setoran & penarikan simpanan",
    color: "rgba(5,150,105,0.1)",
    border: "rgba(5,150,105,0.3)",
    text: "rgb(5,150,105)",
  },
  {
    href: "/dashboard/keuangan/buku-pembantu",
    icon: <BookOpen className="h-5 w-5" />,
    label: "Buku Pembantu",
    desc: "Kartu anggota: simpanan, pinjaman, SHU",
    color: "rgba(14,165,233,0.1)",
    border: "rgba(14,165,233,0.3)",
    text: "rgb(14,116,144)",
  },
  {
    href: "/dashboard/keuangan/pinjaman",
    icon: <Wallet className="h-5 w-5" />,
    label: "Pinjaman Anggota",
    desc: "Piutang & angsuran anggota",
    color: "rgba(217,119,6,0.1)",
    border: "rgba(217,119,6,0.3)",
    text: "rgb(217,119,6)",
  },
  {
    href: "/dashboard/keuangan/saldo-awal",
    icon: <Wallet className="h-5 w-5" />,
    label: "Saldo Awal",
    desc: "Neraca pembukaan / saldo awal",
    color: "rgba(14,165,233,0.1)",
    border: "rgba(14,165,233,0.3)",
    text: "rgb(14,116,144)",
  },
  {
    href: "/dashboard/keuangan/tutup-buku",
    icon: <Lock className="h-5 w-5" />,
    label: "Tutup Buku",
    desc: "Jurnal penutup akhir tahun",
    color: "rgba(217,119,6,0.1)",
    border: "rgba(217,119,6,0.3)",
    text: "rgb(217,119,6)",
  },
  {
    href: "/dashboard/keuangan/shu-distribusi",
    icon: <PieChart className="h-5 w-5" />,
    label: "Distribusi SHU",
    desc: "Pembagian SHU sesuai AD/ART",
    color: "rgba(220,38,38,0.1)",
    border: "rgba(220,38,38,0.3)",
    text: "rgb(220,38,38)",
  },
  {
    href: "/dashboard/keuangan/shu-anggota",
    icon: <Users className="h-5 w-5" />,
    label: "SHU per Anggota",
    desc: "Alokasi SHU bagian anggota",
    color: "rgba(124,58,237,0.1)",
    border: "rgba(124,58,237,0.3)",
    text: "rgb(124,58,237)",
  },
]

export default function KeuanganDashboardPage() {
  const now = new Date()
  const tahun = now.getFullYear()
  const bulan = now.getMonth() + 1

  const [summary, setSummary] = useState<Summary | null>(null)
  const [status, setStatus] = useState<OperationalStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [neracaRes, shuRes, periodeRes, draftRes] = await Promise.all([
        fetch(`/api/keuangan/summary?type=neraca&tahun=${tahun}&bulan=${bulan}`),
        fetch(`/api/keuangan/summary?type=shu&tahun=${tahun}&bulan=${bulan}`),
        getPeriodeFiskal(),
        getJurnals({ status: "DRAFT", limit: 1 }),
      ])
      if (!neracaRes.ok || !shuRes.ok) throw new Error("Gagal memuat ringkasan keuangan")
      const neraca = await neracaRes.json()
      const shu = await shuRes.json()
      setSummary({
        aset: neraca.aset ?? 0,
        kewajiban: neraca.kewajiban ?? 0,
        ekuitas: neraca.ekuitas ?? 0,
        pendapatan: shu.pendapatan ?? 0,
        beban: shu.beban ?? 0,
        shu: shu.shu ?? 0,
        simpanan_pokok: neraca.simpanan_pokok ?? 0,
        simpanan_wajib: neraca.simpanan_wajib ?? 0,
      })
      setStatus({
        currentPeriod: periodeRes.success
          ? periodeRes.data.find((p) => p.tahun === tahun && p.bulan === bulan) ?? null
          : null,
        draftCount: draftRes.success ? draftRes.data.total : 0,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void Promise.resolve().then(() => load())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const MONTHS = ["","Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"]
  const balanceDiff = summary ? summary.aset - (summary.kewajiban + summary.ekuitas) : 0
  const isAccountingBalance = Math.abs(balanceDiff) < 1
  const checklist = [
    {
      label: "Periode bulan ini",
      value: status?.currentPeriod ? status.currentPeriod.status : "Belum dibuat",
      ok: !!status?.currentPeriod && status.currentPeriod.status === "BUKA",
      desc: status?.currentPeriod ? status.currentPeriod.nama : "Buat periode agar transaksi bulan ini bisa dicatat.",
      href: "/dashboard/keuangan/periode-fiskal",
    },
    {
      label: "Jurnal draft",
      value: `${status?.draftCount ?? 0} entri`,
      ok: (status?.draftCount ?? 0) === 0,
      desc: (status?.draftCount ?? 0) === 0 ? "Tidak ada draft yang menunggu posting." : "Review dan posting jurnal agar laporan final.",
      href: "/dashboard/keuangan/jurnal",
    },
    {
      label: "Persamaan akuntansi",
      value: isAccountingBalance ? "Balance" : `Selisih ${rp(Math.abs(balanceDiff))}`,
      ok: isAccountingBalance,
      desc: "Aset harus sama dengan kewajiban ditambah ekuitas.",
      href: "/dashboard/keuangan/laporan/neraca",
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ background: "var(--primary-light)" }}>
            <LayoutDashboard className="h-5 w-5" style={{ color: "var(--primary)" }} />
          </div>
          <div>
            <h1 className="text-xl font-semibold" style={{ color: "var(--text-900)" }}>
              Keuangan
            </h1>
            <p className="text-sm" style={{ color: "var(--text-subtle)" }}>
              {MONTHS[bulan]} {tahun} — Koperasi Pedami
            </p>
          </div>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors"
          style={{ background: "var(--surface-muted)", color: "var(--text-subtle)" }}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Muat Ulang
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg text-sm"
          style={{ background: "rgba(220,38,38,0.08)", color: "rgb(220,38,38)", border: "1px solid rgba(220,38,38,0.2)" }}>
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: "Total Aset", value: summary?.aset, color: "#1d4ed8" },
          { label: "Kewajiban", value: summary?.kewajiban, color: "#b45309" },
          { label: "Ekuitas", value: summary?.ekuitas, color: "#065f46" },
          { label: "Pendapatan", value: summary?.pendapatan, color: "#059669" },
          { label: "Beban", value: summary?.beban, color: "#dc2626" },
          { label: "SHU", value: summary?.shu, color: summary?.shu && summary.shu >= 0 ? "#7c3aed" : "#dc2626" },
        ].map(({ label, value, color }) => (
          <div key={label}
            className="rounded-xl p-4 space-y-1"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <p className="text-xs font-medium" style={{ color: "var(--text-subtle)" }}>{label}</p>
            {loading ? (
              <div className="h-6 w-24 rounded animate-pulse" style={{ background: "var(--surface-muted)" }} />
            ) : (
              <p className="text-base font-bold leading-tight" style={{ color }}>
                {rp(value ?? 0)}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Khas Koperasi: Simpanan */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { label: "Simpanan Pokok", value: summary?.simpanan_pokok, desc: "Modal anggota — tidak dapat ditarik" },
          { label: "Simpanan Wajib", value: summary?.simpanan_wajib, desc: "Iuran bulanan wajib anggota" },
        ].map(({ label, value, desc }) => (
          <div key={label}
            className="rounded-xl p-4 flex items-center gap-4"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="p-3 rounded-lg" style={{ background: "rgba(5,150,105,0.1)" }}>
              <Wallet className="h-5 w-5" style={{ color: "rgb(5,150,105)" }} />
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--text-900)" }}>{label}</p>
              <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{desc}</p>
              {loading ? (
                <div className="h-5 w-28 mt-1 rounded animate-pulse" style={{ background: "var(--surface-muted)" }} />
              ) : (
                <p className="text-base font-bold mt-0.5" style={{ color: "rgb(5,150,105)" }}>
                  {rp(value ?? 0)}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Status operasional bulanan */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h2 className="text-sm font-semibold" style={{ color: "var(--text-900)" }}>Status Bulan Berjalan</h2>
              <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Checklist cepat sebelum laporan dipakai untuk keputusan.</p>
            </div>
            <Clock className="h-4 w-4" style={{ color: "var(--text-subtle)" }} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {checklist.map((item) => (
              <Link key={item.label} href={item.href} className="rounded-lg p-3 transition-colors"
                style={{ background: item.ok ? "rgba(5,150,105,0.07)" : "rgba(217,119,6,0.08)", border: `1px solid ${item.ok ? "rgba(5,150,105,0.22)" : "rgba(217,119,6,0.24)"}` }}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold" style={{ color: item.ok ? "rgb(5,150,105)" : "rgb(180,83,9)" }}>{item.label}</p>
                  {item.ok ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <AlertCircle className="h-4 w-4 text-amber-600" />}
                </div>
                <p className="text-sm font-bold mt-1" style={{ color: "var(--text-900)" }}>{item.value}</p>
                <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--text-subtle)" }}>{item.desc}</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, rgba(37,99,235,0.10), rgba(5,150,105,0.08))", border: "1px solid rgba(37,99,235,0.18)" }}>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-900)" }}>Langkah Cepat</h2>
          <p className="text-xs mt-1" style={{ color: "var(--text-subtle)" }}>Aksi yang paling sering dipakai operator keuangan.</p>
          <div className="grid grid-cols-2 gap-2 mt-3">
            {[
              { label: "Buat Jurnal", href: "/dashboard/keuangan/jurnal" },
              { label: "Setor Simpanan", href: "/dashboard/keuangan/simpanan" },
              { label: "Buku Besar", href: "/dashboard/keuangan/laporan/buku-besar" },
              { label: "Neraca", href: "/dashboard/keuangan/laporan/neraca" },
            ].map((item) => (
              <Link key={item.label} href={item.href} className="rounded-lg px-3 py-2 text-xs font-semibold text-center transition-colors"
                style={{ background: "var(--surface)", color: "var(--text-900)", border: "1px solid var(--border)" }}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Menu Navigasi */}
      <div>
        <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text-subtle)" }}>
          MENU KEUANGAN
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {NAV_CARDS.map((card) => (
            <Link key={card.href} href={card.href}
              className="group flex items-center gap-3 rounded-xl p-4 transition-all"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = card.border }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)" }}
            >
              <div className="p-2.5 rounded-lg shrink-0" style={{ background: card.color }}>
                <span style={{ color: card.text }}>{card.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: "var(--text-900)" }}>{card.label}</p>
                <p className="text-xs truncate" style={{ color: "var(--text-subtle)" }}>{card.desc}</p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: card.text }} />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
