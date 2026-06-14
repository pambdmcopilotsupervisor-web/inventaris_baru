"use client"

import React, { useState } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { TextField, SelectField, TextareaField } from "@/components/ui/form-field"
import { useApi } from "@/hooks/useApi"
import { useAuth } from "@/contexts/AuthContext"
import { Plus, RefreshCw, Save, CheckSquare, ClipboardList } from "lucide-react"

type Periode = {
  id: number
  kode_periode: string
  nama_periode: string
  tanggal_mulai: string
  tanggal_selesai: string
  tanggal_buka: string
  tanggal_tutup: string
  status: "draft" | "aktif" | "tutup"
}

type TargetKerja = {
  id?: number
  uraian_tugas: string
  satuan: "dokumen" | "kegiatan" | "laporan" | "persentase" | "lainnya"
  target_nilai: number
  bobot_dalam_capaian: number
  catatan: string
  status?: string
}

type MonitoringRow = {
  id_pegawai: number
  nik: string
  nama_karyawan: string
  jabatan: string
  jumlah_target: number
  total_bobot: number | string | null
  status_target: "belum_mengisi" | "diajukan" | "disetujui" | "draft" | "ditolak" | null
}

const EMPTY_TARGET: TargetKerja = {
  uraian_tugas: "",
  satuan: "dokumen",
  target_nilai: 0,
  bobot_dalam_capaian: 0,
  catatan: "",
}

const satuanOptions = [
  { value: "dokumen", label: "Dokumen" },
  { value: "kegiatan", label: "Kegiatan" },
  { value: "laporan", label: "Laporan" },
  { value: "persentase", label: "Persentase" },
  { value: "lainnya", label: "Lainnya" },
]

function statusBadge(status: MonitoringRow["status_target"]): "secondary" | "warning" | "success" | "destructive" | "info" {
  if (status === "disetujui") return "success"
  if (status === "diajukan") return "warning"
  if (status === "ditolak") return "destructive"
  if (status === "belum_mengisi") return "secondary"
  return "info"
}

function statusLabel(status: MonitoringRow["status_target"]): string {
  if (status === "belum_mengisi") return "Belum Mengisi"
  if (status === "diajukan") return "Diajukan"
  if (status === "disetujui") return "Disetujui"
  if (status === "ditolak") return "Ditolak"
  return status ?? "Draft"
}

function createDefaultTargets(): TargetKerja[] {
  return [
    { ...EMPTY_TARGET, bobot_dalam_capaian: 40 },
    { ...EMPTY_TARGET, bobot_dalam_capaian: 30 },
    { ...EMPTY_TARGET, bobot_dalam_capaian: 30 },
  ]
}

export default function TargetKerjaPage() {
  const { user } = useAuth()
  const { data: periodes, loading: periodeLoading, refetch: refetchPeriode } = useApi<Periode[]>("/api/periode")
  const periodeList = periodes ?? []
  const [selectedPeriodeId, setSelectedPeriodeId] = useState("")
  const activePeriodeId = selectedPeriodeId || (periodeList[0]?.id ? String(periodeList[0].id) : "")

  const { data: monitoring, loading: monitoringLoading, refetch: refetchMonitoring } = useApi<MonitoringRow[]>(
    `/api/target?id_periode=${activePeriodeId || 0}`,
    [activePeriodeId],
  )

  const [targetPegawaiId, setTargetPegawaiId] = useState<string>(user?.karyawan_id ? String(user.karyawan_id) : "")
  const [targetPegawaiName, setTargetPegawaiName] = useState(user?.nama_karyawan ?? "Target Saya")
  const [targets, setTargets] = useState<TargetKerja[]>(createDefaultTargets())
  const [targetLoaded, setTargetLoaded] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [approving, setApproving] = useState(false)

  const [periodeOpen, setPeriodeOpen] = useState(false)
  const [periodeForm, setPeriodeForm] = useState({
    kode_periode: "",
    nama_periode: "",
    tanggal_mulai: "",
    tanggal_selesai: "",
    tanggal_buka: "",
    tanggal_tutup: "",
    status: "aktif",
    keterangan: "",
  })

  const totalBobot = targets.reduce((sum, item) => sum + Number(item.bobot_dalam_capaian || 0), 0)
  const currentTargetPegawaiId = targetPegawaiId || (user?.karyawan_id ? String(user.karyawan_id) : "")
  const currentTargetPegawaiName = targetPegawaiId ? targetPegawaiName : (user?.nama_karyawan ?? "Target Saya")
  const belumMengisi = (monitoring ?? []).filter(row => row.status_target === "belum_mengisi").length
  const diajukan = (monitoring ?? []).filter(row => row.status_target === "diajukan").length
  const disetujui = (monitoring ?? []).filter(row => row.status_target === "disetujui").length

  const loadTarget = async (idPegawai = currentTargetPegawaiId, name = currentTargetPegawaiName) => {
    if (!activePeriodeId || !idPegawai) return
    setErrors({})
    const res = await fetch(`/api/target/${idPegawai}/${activePeriodeId}`)
    const rows = await res.json()
    if (!res.ok) { setErrors({ _: rows.error ?? "Gagal mengambil target" }); return }
    setTargetPegawaiId(idPegawai)
    setTargetPegawaiName(name)
    setTargets(rows.length > 0
      ? rows.map((row: TargetKerja) => ({
          id: row.id,
          uraian_tugas: row.uraian_tugas,
          satuan: row.satuan,
          target_nilai: Number(row.target_nilai),
          bobot_dalam_capaian: Number(row.bobot_dalam_capaian),
          catatan: row.catatan ?? "",
          status: row.status,
        }))
      : createDefaultTargets())
    setTargetLoaded(true)
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (!activePeriodeId) e.periode = "Pilih periode penilaian"
    if (!currentTargetPegawaiId) e.target = "Pegawai target belum dipilih"
    if (targets.length < 3 || targets.length > 5) e.targets = "Target kerja wajib 3 sampai 5 tugas utama"
    targets.forEach((target, index) => {
      if (!target.uraian_tugas.trim()) e[`uraian_${index}`] = "Uraian wajib diisi"
      if (Number(target.target_nilai) <= 0) e[`nilai_${index}`] = "Target harus > 0"
      if (Number(target.bobot_dalam_capaian) <= 0) e[`bobot_${index}`] = "Bobot harus > 0"
    })
    if (Math.round(totalBobot * 100) / 100 !== 100) e.bobot = "Total bobot semua tugas harus = 100%"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const saveTargets = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      const res = await fetch("/api/target", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_periode: Number(activePeriodeId), id_pegawai: Number(currentTargetPegawaiId), targets }),
      })
      const json = await res.json()
      if (!res.ok) { setErrors({ _: json.error ?? "Gagal menyimpan target" }); return }
      setTargetLoaded(false)
      await loadTarget(currentTargetPegawaiId, currentTargetPegawaiName)
      refetchMonitoring()
    } finally {
      setSaving(false)
    }
  }

  const approveTargets = async () => {
    const firstTargetId = targets.find(target => target.id)?.id
    if (!firstTargetId) { setErrors({ _: "Belum ada target yang dapat disetujui" }); return }
    setApproving(true)
    try {
      const res = await fetch(`/api/target/${firstTargetId}/setujui`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply_all: true }),
      })
      const json = await res.json()
      if (!res.ok) { setErrors({ _: json.error ?? "Gagal menyetujui target" }); return }
      await loadTarget(currentTargetPegawaiId, currentTargetPegawaiName)
      refetchMonitoring()
    } finally {
      setApproving(false)
    }
  }

  const createPeriode = async () => {
    const e: Record<string, string> = {}
    if (!periodeForm.kode_periode.trim()) e.kode_periode = "Kode wajib diisi"
    if (!periodeForm.nama_periode.trim()) e.nama_periode = "Nama wajib diisi"
    if (!periodeForm.tanggal_mulai) e.tanggal_mulai = "Tanggal mulai wajib"
    if (!periodeForm.tanggal_selesai) e.tanggal_selesai = "Tanggal selesai wajib"
    if (!periodeForm.tanggal_buka) e.tanggal_buka = "Tanggal buka wajib"
    if (!periodeForm.tanggal_tutup) e.tanggal_tutup = "Tanggal tutup wajib"
    setErrors(e); if (Object.keys(e).length) return

    setSaving(true)
    try {
      const res = await fetch("/api/periode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(periodeForm),
      })
      const json = await res.json()
      if (!res.ok) { setErrors({ _: json.error ?? "Gagal membuat periode" }); return }
      setPeriodeOpen(false)
      await refetchPeriode()
      setSelectedPeriodeId(String(json.id))
    } finally {
      setSaving(false)
    }
  }

  const columns: Column<MonitoringRow>[] = [
    {
      key: "nama_karyawan",
      header: "Pegawai",
      cell: row => (
        <div>
          <p className="font-semibold text-sm">{row.nama_karyawan}</p>
          <p className="text-xs font-mono" style={{ color: "var(--text-subtle)" }}>{row.nik} · {row.jabatan}</p>
        </div>
      ),
    },
    { key: "jumlah_target", header: "Target", cell: row => <span className="font-mono">{Number(row.jumlah_target)}</span> },
    { key: "total_bobot", header: "Bobot", cell: row => <span className="font-mono">{Number(row.total_bobot ?? 0)}%</span> },
    { key: "status_target", header: "Status", cell: row => <Badge variant={statusBadge(row.status_target)}>{statusLabel(row.status_target)}</Badge> },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Target Kerja Awal Periode</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
            Usulan 3-5 tugas utama, revisi atasan, dan approval final.
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <select value={activePeriodeId} onChange={e => setSelectedPeriodeId(e.target.value)} className="h-8 rounded-lg px-3 text-sm cursor-pointer" style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-900)" }}>
            <option value="">Pilih periode</option>
            {periodeList.map(p => <option key={p.id} value={p.id}>{p.nama_periode}</option>)}
          </select>
          <Button variant="outline" size="sm" onClick={() => { refetchPeriode(); refetchMonitoring() }}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button size="sm" onClick={() => { setErrors({}); setPeriodeOpen(true) }}><Plus className="h-3.5 w-3.5 mr-1.5" />Buat Periode</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "Belum Mengisi", value: belumMengisi, color: "var(--warning)" },
          { label: "Diajukan", value: diajukan, color: "var(--primary)" },
          { label: "Disetujui", value: disetujui, color: "var(--success)" },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{stat.label}</p>
            <p className="text-2xl font-bold font-mono mt-0.5" style={{ color: stat.color }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {errors._ && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{errors._}</div>}
      {errors.periode && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{errors.periode}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(460px,520px)] gap-5">
        <div className="rounded-xl p-4 space-y-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-bold" style={{ color: "var(--text-900)" }}>{currentTargetPegawaiName}</h2>
              <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Total bobot: <span className="font-mono">{totalBobot}%</span></p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => loadTarget()} disabled={!activePeriodeId || !currentTargetPegawaiId || periodeLoading}>
                <ClipboardList className="h-3.5 w-3.5" />Muat Target
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setTargets(t => t.length < 5 ? [...t, { ...EMPTY_TARGET }] : t)} disabled={targets.length >= 5}>Tambah Baris</Button>
            </div>
          </div>

          {errors.bobot && <p className="text-xs" style={{ color: "var(--danger)" }}>{errors.bobot}</p>}
          {errors.targets && <p className="text-xs" style={{ color: "var(--danger)" }}>{errors.targets}</p>}
          {!targetLoaded && <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Klik Muat Target untuk mengambil data periode terpilih, atau langsung isi target baru.</p>}

          <div className="space-y-3">
            {targets.map((target, index) => (
              <div key={index} className="rounded-xl p-3 space-y-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="secondary">Tugas {index + 1}</Badge>
                  <Button variant="ghost" size="sm" onClick={() => setTargets(t => t.filter((_, i) => i !== index))} disabled={targets.length <= 3}>Hapus</Button>
                </div>
                <TextField label="Uraian Tugas" required error={errors[`uraian_${index}`]} value={target.uraian_tugas} onChange={e => setTargets(t => t.map((row, i) => i === index ? { ...row, uraian_tugas: e.target.value } : row))} />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <SelectField label="Satuan" required options={satuanOptions} value={target.satuan} onChange={e => setTargets(t => t.map((row, i) => i === index ? { ...row, satuan: e.target.value as TargetKerja["satuan"] } : row))} />
                  <TextField label="Target Nilai" required type="number" error={errors[`nilai_${index}`]} value={target.target_nilai} onChange={e => setTargets(t => t.map((row, i) => i === index ? { ...row, target_nilai: Number(e.target.value) } : row))} />
                  <TextField label="Bobot (%)" required type="number" error={errors[`bobot_${index}`]} value={target.bobot_dalam_capaian} onChange={e => setTargets(t => t.map((row, i) => i === index ? { ...row, bobot_dalam_capaian: Number(e.target.value) } : row))} />
                </div>
                <TextareaField label="Catatan/Keterangan" value={target.catatan} onChange={e => setTargets(t => t.map((row, i) => i === index ? { ...row, catatan: e.target.value } : row))} />
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={approveTargets} disabled={approving || targets.length === 0}><CheckSquare className="h-3.5 w-3.5" />{approving ? "Menyetujui..." : "Setujui Target"}</Button>
            <Button onClick={saveTargets} disabled={saving}><Save className="h-3.5 w-3.5" />{saving ? "Menyimpan..." : "Simpan Usulan"}</Button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <h2 className="font-bold" style={{ color: "var(--text-900)" }}>Monitoring Atasan</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Klik pegawai untuk revisi/approval target bawahannya.</p>
          </div>
          <DataTable
            data={(monitoring ?? []) as unknown as Record<string, unknown>[]}
            columns={columns as unknown as Column<Record<string, unknown>>[]}
            searchKeys={["nama_karyawan", "nik", "jabatan"]}
            loading={monitoringLoading}
            emptyMessage="Tidak ada pegawai dalam scope monitoring"
            actions={(row: Record<string, unknown>) => {
              const r = row as unknown as MonitoringRow
              return <Button variant="ghost" size="sm" onClick={() => loadTarget(String(r.id_pegawai), r.nama_karyawan)}>Pilih</Button>
            }}
          />
        </div>
      </div>

      <Modal open={periodeOpen} onClose={() => setPeriodeOpen(false)} title="Buat Periode Penilaian" size="md"
        footer={<><Button variant="outline" onClick={() => setPeriodeOpen(false)}>Batal</Button><Button onClick={createPeriode} disabled={saving}>{saving ? "Menyimpan..." : "Buat Periode"}</Button></>}
      >
        <div className="space-y-4">
          <TextField label="Kode Periode" required error={errors.kode_periode} value={periodeForm.kode_periode} placeholder="SEM1-2026" onChange={e => setPeriodeForm(f => ({ ...f, kode_periode: e.target.value.toUpperCase() }))} />
          <TextField label="Nama Periode" required error={errors.nama_periode} value={periodeForm.nama_periode} placeholder="Semester I 2026" onChange={e => setPeriodeForm(f => ({ ...f, nama_periode: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Tanggal Mulai" required type="date" error={errors.tanggal_mulai} value={periodeForm.tanggal_mulai} onChange={e => setPeriodeForm(f => ({ ...f, tanggal_mulai: e.target.value }))} />
            <TextField label="Tanggal Selesai" required type="date" error={errors.tanggal_selesai} value={periodeForm.tanggal_selesai} onChange={e => setPeriodeForm(f => ({ ...f, tanggal_selesai: e.target.value }))} />
            <TextField label="Tanggal Buka" required type="date" error={errors.tanggal_buka} value={periodeForm.tanggal_buka} onChange={e => setPeriodeForm(f => ({ ...f, tanggal_buka: e.target.value }))} />
            <TextField label="Tanggal Tutup" required type="date" error={errors.tanggal_tutup} value={periodeForm.tanggal_tutup} onChange={e => setPeriodeForm(f => ({ ...f, tanggal_tutup: e.target.value }))} />
          </div>
          <TextareaField label="Keterangan" value={periodeForm.keterangan} onChange={e => setPeriodeForm(f => ({ ...f, keterangan: e.target.value }))} />
        </div>
      </Modal>
    </div>
  )
}
