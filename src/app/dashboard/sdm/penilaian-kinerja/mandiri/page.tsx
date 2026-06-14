"use client"

import React, { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { TextareaField } from "@/components/ui/form-field"
import { useApi } from "@/hooks/useApi"
import { CheckCircle, Clock, RefreshCw, Save, Send, Plus } from "lucide-react"

type Aspek = "integritas" | "kerjasama" | "inisiatif" | "orientasi_layanan" | "kedisiplinan"

type PenilaianMandiriData = {
  periode: { id: number; nama_periode: string; tanggal_tutup: string; tanggal_mulai: string; tanggal_selesai: string }
  identitas: { nik: string; nama_karyawan: string; jabatan: string; nama_divisi: string | null; nama_atasan: string | null }
  kehadiran: { total_hari_kerja: number; jumlah_hadir: number; jumlah_izin: number; jumlah_sakit: number; jumlah_cuti_sah: number; jumlah_alpha: number; jumlah_terlambat: number; persentase_hadir: number; nilai_kehadiran: number }
  penilaian: { id: number; status: "draft" | "diajukan" | "diverifikasi" | "disetujui" | "final"; pengembangan: PengembanganInput; catatan_atasan: string | null }
  targets: TargetItem[]
  perilaku: { aspek: Aspek; nilai: number; catatan: string | null }[]
}

type TargetItem = {
  id: number
  uraian_tugas: string
  satuan: string
  target_nilai: number | string
  realisasi_nilai: number | string | null
  bobot_dalam_capaian: number | string
  catatan: string | null
  catatan_pegawai: string | null
  catatan_atasan: string | null
}

type TargetInput = { id: number; realisasi_nilai: number; keterangan_kendala: string }
type PerilakuInput = { aspek: Aspek; nilai: number; catatan: string }
type PengembanganInput = { pelatihan: string[]; rencana_pengembangan: string; pencapaian_terbaik: string; saran_pimpinan: string }

const aspekLabels: Record<Aspek, string> = {
  integritas: "Integritas",
  kerjasama: "Kerjasama",
  inisiatif: "Inisiatif & Kreativitas",
  orientasi_layanan: "Orientasi Layanan",
  kedisiplinan: "Kedisiplinan",
}

const scoreHints = [
  "1 = Sangat kurang / sering tidak memenuhi ekspektasi",
  "2 = Kurang / perlu banyak perbaikan",
  "3 = Cukup / memenuhi standar minimum",
  "4 = Baik / konsisten memenuhi ekspektasi",
  "5 = Sangat baik / menjadi teladan",
]

function hitungCapaian(realisasi: number, target: number): number {
  if (!target) return 0
  return Math.min(120, Math.max(0, (realisasi / target) * 100))
}

function daysLeft(date: string): number {
  const end = new Date(`${date.slice(0, 10)}T23:59:59`).getTime()
  return Math.ceil((end - Date.now()) / 86400000)
}

export default function PenilaianMandiriPage() {
  const { data, loading, refetch } = useApi<PenilaianMandiriData>("/api/penilaian-mandiri")
  const [targets, setTargets] = useState<TargetInput[]>([])
  const [perilaku, setPerilaku] = useState<PerilakuInput[]>([])
  const [pengembangan, setPengembangan] = useState<PengembanganInput>({ pelatihan: [""], rencana_pengembangan: "", pencapaian_terbaik: "", saran_pimpinan: "" })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (!data) return
    const timeoutId = window.setTimeout(() => {
      setTargets(data.targets.map(target => ({ id: target.id, realisasi_nilai: Number(target.realisasi_nilai ?? 0), keterangan_kendala: target.catatan_pegawai ?? "" })))
      const existing = new Map(data.perilaku.map(item => [item.aspek, item]))
      setPerilaku((Object.keys(aspekLabels) as Aspek[]).map(aspek => ({ aspek, nilai: existing.get(aspek)?.nilai ?? 3, catatan: existing.get(aspek)?.catatan ?? "" })))
      setPengembangan({ ...data.penilaian.pengembangan, pelatihan: data.penilaian.pengembangan.pelatihan.length ? data.penilaian.pengembangan.pelatihan : [""] })
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [data])

  const readonly = data?.penilaian.status !== "draft"
  const left = data ? daysLeft(data.periode.tanggal_tutup) : 0
  // Penilaian dikembalikan: status draft tapi ada catatan_atasan
  const isDikembalikan = data?.penilaian.status === "draft" && !!data.penilaian.catatan_atasan

  const completionChecks = [
    !!data,
    targets.length > 0 && targets.every(target => Number.isFinite(target.realisasi_nilai) && Number(target.realisasi_nilai) >= 0),
    targets.every(target => {
      const base = data?.targets.find(t => t.id === target.id)
      const capaian = hitungCapaian(Number(target.realisasi_nilai), Number(base?.target_nilai ?? 0))
      return capaian >= 80 || target.keterangan_kendala.trim().length > 0
    }),
    perilaku.length === 5 && perilaku.every(item => item.nilai >= 1 && item.nilai <= 5),
    pengembangan.rencana_pengembangan.trim().length > 0,
    pengembangan.pencapaian_terbaik.trim().length > 0,
  ]
  const progress = Math.round((completionChecks.filter(Boolean).length / completionChecks.length) * 100)

  const validate = () => {
    const e: Record<string, string> = {}
    if (!data) e._ = "Data belum tersedia"
    targets.forEach(target => {
      const base = data?.targets.find(t => t.id === target.id)
      const capaian = hitungCapaian(Number(target.realisasi_nilai), Number(base?.target_nilai ?? 0))
      if (capaian < 80 && !target.keterangan_kendala.trim()) e[`kendala_${target.id}`] = "Wajib diisi jika capaian < 80%"
    })
    if (!pengembangan.rencana_pengembangan.trim()) e.rencana = "Rencana pengembangan wajib diisi"
    if (!pengembangan.pencapaian_terbaik.trim()) e.pencapaian = "Pencapaian terbaik wajib diisi"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = async (isSubmit: boolean) => {
    if (isSubmit && !validate()) return
    if (!data) return
    setSaving(true)
    setMessage("")
    try {
      const res = await fetch("/api/penilaian-mandiri", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_periode: data.periode.id, targets, perilaku, pengembangan, submit: isSubmit }),
      })
      const json = await res.json()
      if (!res.ok) { setErrors({ _: json.error ?? "Gagal menyimpan" }); return }
      setMessage(json.message ?? "Berhasil disimpan")
      refetch()
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-6 text-sm" style={{ color: "var(--text-subtle)" }}>Memuat form penilaian mandiri...</div>
  if (!data) return <div className="p-6 text-sm" style={{ color: "var(--danger)" }}>Data penilaian mandiri belum tersedia.</div>

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Penilaian Mandiri</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>{data.periode.nama_periode}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={left < 0 ? "destructive" : left <= 3 ? "warning" : "secondary"}>
            <Clock className="h-3 w-3 mr-1" />{left < 0 ? "Lewat batas" : left <= 3 ? `${left} hari lagi` : `Batas: ${data.periode.tanggal_tutup.slice(0, 10)}`}
          </Badge>
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      <div className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>Progress Kelengkapan</span>
          <span className="text-sm font-mono font-bold" style={{ color: "var(--primary)" }}>{progress}%</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-muted)" }}>
          <div className="h-full rounded-full" style={{ width: `${progress}%`, background: "var(--primary)" }} />
        </div>
      </div>

      {isDikembalikan && data.penilaian.catatan_atasan && (
        <div className="rounded-xl p-4 flex gap-3" style={{ background: "#fef2f2", border: "1px solid #dc2626" }}>
          <span className="text-xl shrink-0">⚠️</span>
          <div>
            <p className="font-bold text-sm" style={{ color: "#dc2626" }}>Penilaian Anda Dikembalikan oleh Atasan</p>
            <p className="text-sm mt-1" style={{ color: "#7f1d1d" }}><strong>Catatan:</strong> {data.penilaian.catatan_atasan}</p>
            <p className="text-xs mt-2" style={{ color: "#991b1b" }}>Silakan perbaiki dan submit ulang penilaian Anda.</p>
          </div>
        </div>
      )}

      {errors._ && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{errors._}</div>}
      {message && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--success-bg)", color: "var(--success)" }}>{message}</div>}

      <section className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <h2 className="font-bold mb-3" style={{ color: "var(--text-900)" }}>Bagian 1 - Identitas</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          {[['Nama', data.identitas.nama_karyawan], ['NIP/NIK', data.identitas.nik], ['Jabatan', data.identitas.jabatan], ['Unit/Divisi', data.identitas.nama_divisi ?? '-'], ['Atasan Langsung', data.identitas.nama_atasan ?? '-'], ['Periode', data.periode.nama_periode]].map(([label, value]) => (
            <div key={label} className="rounded-lg p-3" style={{ background: "var(--surface-muted)" }}><p className="text-xs" style={{ color: "var(--text-subtle)" }}>{label}</p><p className="font-semibold" style={{ color: "var(--text-900)" }}>{value}</p></div>
          ))}
        </div>
      </section>

      <section className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <h2 className="font-bold mb-3" style={{ color: "var(--text-900)" }}>Bagian 2 - Rekap Kehadiran</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
            ['Hari Kerja', data.kehadiran.total_hari_kerja], ['Hadir', data.kehadiran.jumlah_hadir], ['Izin/Sakit', data.kehadiran.jumlah_izin + data.kehadiran.jumlah_sakit + data.kehadiran.jumlah_cuti_sah], ['Alpha', data.kehadiran.jumlah_alpha], ['Terlambat', data.kehadiran.jumlah_terlambat], ['Kehadiran', `${data.kehadiran.persentase_hadir}%`], ['Nilai', data.kehadiran.nilai_kehadiran], ['Status', data.penilaian.status]
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg p-3" style={{ background: "var(--surface-muted)" }}><p className="text-xs" style={{ color: "var(--text-subtle)" }}>{label}</p><p className="font-bold font-mono" style={{ color: "var(--text-900)" }}>{value}</p></div>
          ))}
        </div>
      </section>

      <section className="rounded-xl p-4 space-y-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <h2 className="font-bold" style={{ color: "var(--text-900)" }}>Bagian 3 - Capaian Sasaran Kerja</h2>
        {data.targets.length === 0 ? <p className="text-sm" style={{ color: "var(--danger)" }}>Target kerja awal periode belum disetujui/tersedia.</p> : data.targets.map(target => {
          const input = targets.find(item => item.id === target.id)
          const capaian = hitungCapaian(Number(input?.realisasi_nilai ?? 0), Number(target.target_nilai))
          return (
            <div key={target.id} className="rounded-xl p-3 space-y-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_120px_120px_120px] gap-3 text-sm">
                <div><p className="text-xs" style={{ color: "var(--text-subtle)" }}>Uraian</p><p className="font-semibold" style={{ color: "var(--text-900)" }}>{target.uraian_tugas}</p></div>
                <div><p className="text-xs" style={{ color: "var(--text-subtle)" }}>Satuan</p><p>{target.satuan}</p></div>
                <div><p className="text-xs" style={{ color: "var(--text-subtle)" }}>Target</p><p className="font-mono">{target.target_nilai}</p></div>
                <div><p className="text-xs" style={{ color: "var(--text-subtle)" }}>Capaian</p><p className="font-mono font-bold">{capaian.toFixed(1)}%</p></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-3">
                <label className="space-y-1"><span className="text-xs font-semibold uppercase" style={{ color: "var(--text-subtle)" }}>Realisasi</span><input disabled={readonly} type="number" value={input?.realisasi_nilai ?? 0} onChange={e => setTargets(t => t.map(row => row.id === target.id ? { ...row, realisasi_nilai: Number(e.target.value) } : row))} className="h-9 w-full rounded-lg px-3 text-sm" style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }} /></label>
                <TextareaField label={`Keterangan/Kendala${capaian < 80 ? ' (wajib)' : ''}`} error={errors[`kendala_${target.id}`]} disabled={readonly} value={input?.keterangan_kendala ?? ''} onChange={e => setTargets(t => t.map(row => row.id === target.id ? { ...row, keterangan_kendala: e.target.value } : row))} />
              </div>
            </div>
          )
        })}
      </section>

      <section className="rounded-xl p-4 space-y-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <h2 className="font-bold" style={{ color: "var(--text-900)" }}>Bagian 4 - Penilaian Perilaku Kerja Mandiri</h2>
        <div className="rounded-lg p-3 text-xs" style={{ background: "var(--surface-muted)", color: "var(--text-subtle)" }}>{scoreHints.join(' | ')}</div>
        {perilaku.map(item => (
          <div key={item.aspek} className="rounded-lg p-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="font-semibold" style={{ color: "var(--text-900)" }}>{aspekLabels[item.aspek]}</p>
              <div className="flex gap-2">{[1,2,3,4,5].map(score => <button disabled={readonly} key={score} title={scoreHints[score - 1]} onClick={() => setPerilaku(p => p.map(row => row.aspek === item.aspek ? { ...row, nilai: score } : row))} className="h-8 w-8 rounded-full text-sm font-bold" style={{ background: item.nilai === score ? "var(--primary)" : "var(--surface)", color: item.nilai === score ? "#fff" : "var(--text-900)", border: "1px solid var(--border)" }}>{score}</button>)}</div>
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-xl p-4 space-y-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <h2 className="font-bold" style={{ color: "var(--text-900)" }}>Bagian 5 - Pengembangan Kompetensi & Catatan</h2>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase" style={{ color: "var(--text-subtle)" }}>Pelatihan yang diikuti</p>
          {pengembangan.pelatihan.map((row, index) => <input key={index} disabled={readonly} value={row} onChange={e => setPengembangan(p => ({ ...p, pelatihan: p.pelatihan.map((v, i) => i === index ? e.target.value : v) }))} className="h-9 w-full rounded-lg px-3 text-sm" style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }} />)}
          <Button variant="secondary" size="sm" disabled={readonly} onClick={() => setPengembangan(p => ({ ...p, pelatihan: [...p.pelatihan, ""] }))}><Plus className="h-3.5 w-3.5" />Tambah Pelatihan</Button>
        </div>
        <TextareaField label="Rencana Pengembangan Diri" required error={errors.rencana} disabled={readonly} value={pengembangan.rencana_pengembangan} onChange={e => setPengembangan(p => ({ ...p, rencana_pengembangan: e.target.value }))} />
        <TextareaField label="Pencapaian Terbaik Semester Ini" required error={errors.pencapaian} disabled={readonly} value={pengembangan.pencapaian_terbaik} onChange={e => setPengembangan(p => ({ ...p, pencapaian_terbaik: e.target.value }))} />
        <TextareaField label="Saran untuk Pimpinan" disabled={readonly} value={pengembangan.saran_pimpinan} onChange={e => setPengembangan(p => ({ ...p, saran_pimpinan: e.target.value }))} />
      </section>

      <div className="sticky bottom-0 rounded-xl p-3 flex justify-end gap-2" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "0 -8px 30px rgba(15,23,42,0.08)" }}>
        <Button variant="outline" onClick={() => submit(false)} disabled={readonly || saving}><Save className="h-3.5 w-3.5" />{saving ? "Menyimpan..." : "Simpan Draft"}</Button>
        <Button onClick={() => submit(true)} disabled={readonly || saving || progress < 100}><Send className="h-3.5 w-3.5" />Kirim ke Atasan</Button>
        {readonly && <Badge variant="success"><CheckCircle className="h-3 w-3 mr-1" />Sudah dikirim</Badge>}
      </div>
    </div>
  )
}
