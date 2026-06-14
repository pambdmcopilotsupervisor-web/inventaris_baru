import { prisma } from "@/lib/prisma"

// ─────────────────────────────────────────────────────────────────
// Data gathering untuk dokumen PDF penilaian kinerja
// ─────────────────────────────────────────────────────────────────

export type PdfPenilaianData = {
  penilaian: {
    id: number
    status: "draft" | "diajukan" | "diverifikasi" | "disetujui" | "final"
    nilai_kehadiran: number | null
    nilai_capaian_sasaran: number | null
    nilai_perilaku: number | null
    nilai_pengembangan: number | null
    nilai_akhir: number | null
    catatan_atasan: string | null
    tanggal_diverifikasi: Date | null
    tanggal_disetujui: Date | null
    tanggal_final: Date | null
  }
  identitas: {
    nik: string
    nama_karyawan: string
    jabatan: string
    nama_divisi: string | null
    nama_atasan: string | null
  }
  periode: {
    id: number
    kode_periode: string
    nama_periode: string
    tanggal_mulai: Date
    tanggal_selesai: Date
  }
  targets: {
    uraian_tugas: string
    satuan: string
    target_nilai: number
    realisasi_nilai: number | null
    bobot_dalam_capaian: number
  }[]
  perilaku: {
    aspek: string
    nilai_mandiri: number | null
    nilai_atasan: number | null
  }[]
  approval: {
    actor_nama: string | null
    actor_jabatan: string | null
    aksi: string
    status_ke: string | null
    catatan: string | null
    created_at: Date | null
  }[]
}

const ASPEK_LABELS: Record<string, string> = {
  integritas: "Integritas",
  kerjasama: "Kerjasama",
  inisiatif: "Inisiatif & Kreativitas",
  orientasi_layanan: "Orientasi Layanan",
  kedisiplinan: "Kedisiplinan",
}
const ASPEK_ORDER = ["integritas", "kerjasama", "inisiatif", "orientasi_layanan", "kedisiplinan"]

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export async function getPdfPenilaianData(idPenilaian: number): Promise<PdfPenilaianData | null> {
  type PenRow = {
    id: bigint
    id_periode: bigint
    id_pegawai: bigint
    status: PdfPenilaianData["penilaian"]["status"]
    nilai_kehadiran: string | number | null
    nilai_capaian_sasaran: string | number | null
    nilai_perilaku: string | number | null
    nilai_pengembangan: string | number | null
    nilai_akhir: string | number | null
    catatan_atasan: string | null
    tanggal_diverifikasi: Date | null
    tanggal_disetujui: Date | null
    tanggal_final: Date | null
  }
  const penRows = await prisma.$queryRaw<PenRow[]>`
    SELECT id, id_periode, id_pegawai, status,
           nilai_kehadiran, nilai_capaian_sasaran, nilai_perilaku, nilai_pengembangan, nilai_akhir,
           catatan_atasan, tanggal_diverifikasi, tanggal_disetujui, tanggal_final
    FROM penilaian_kinerja WHERE id = ${BigInt(idPenilaian)} LIMIT 1
  `
  const pen = penRows[0]
  if (!pen) return null

  type KarRow = {
    nik: string
    nama_karyawan: string
    jabatan: string
    nama_divisi: string | null
    nama_atasan: string | null
  }
  const karRows = await prisma.$queryRaw<KarRow[]>`
    SELECT k.nik, k.nama_karyawan, k.jabatan,
           COALESCE(d.nama_divisi, sub_d.nama_divisi, s.nama_sub) AS nama_divisi,
           COALESCE(
             a.nama_karyawan,
             (SELECT kep.nama_karyawan FROM karyawans kep
               WHERE kep.subdivisi_id = k.subdivisi_id
                 AND kep.jabatan IN ('Kepala Divisi','Kepala Bagian')
                 AND kep.status_karyawan NOT IN ('Pensiun','Nonaktif')
                 AND kep.id != k.id LIMIT 1),
             (SELECT kep.nama_karyawan FROM karyawans kep
               WHERE kep.divisi_id = k.divisi_id
                 AND kep.jabatan IN ('Kepala Divisi','Kepala Bagian')
                 AND kep.status_karyawan NOT IN ('Pensiun','Nonaktif')
                 AND kep.id != k.id LIMIT 1)
           ) AS nama_atasan
    FROM karyawans k
    LEFT JOIN divisis d ON d.id = k.divisi_id
    LEFT JOIN subdivisis s ON s.id = k.subdivisi_id
    LEFT JOIN divisis sub_d ON sub_d.id = s.divisi_id
    LEFT JOIN karyawans a ON a.id = k.atasan_id
    WHERE k.id = ${pen.id_pegawai} LIMIT 1
  `
  const kar = karRows[0]

  type PerRow = { id: bigint; kode_periode: string; nama_periode: string; tanggal_mulai: Date; tanggal_selesai: Date }
  const perRows = await prisma.$queryRaw<PerRow[]>`
    SELECT id, kode_periode, nama_periode, tanggal_mulai, tanggal_selesai
    FROM periode_penilaian WHERE id = ${pen.id_periode} LIMIT 1
  `
  const per = perRows[0]

  type TgtRow = { uraian_tugas: string; satuan: string; target_nilai: string | number; realisasi_nilai: string | number | null; bobot_dalam_capaian: string | number }
  const tgtRows = await prisma.$queryRaw<TgtRow[]>`
    SELECT uraian_tugas, satuan, target_nilai, realisasi_nilai, bobot_dalam_capaian
    FROM target_kerja
    WHERE id_periode = ${pen.id_periode} AND id_pegawai = ${pen.id_pegawai}
    ORDER BY id ASC
  `

  type PerilakuRow = { aspek: string; nilai: number; sumber: "mandiri" | "atasan" }
  const perilakuRows = await prisma.$queryRaw<PerilakuRow[]>`
    SELECT aspek, nilai, sumber FROM penilaian_perilaku WHERE id_penilaian = ${pen.id}
  `
  const perilaku = ASPEK_ORDER.map(aspek => ({
    aspek: ASPEK_LABELS[aspek] ?? aspek,
    nilai_mandiri: perilakuRows.find(p => p.aspek === aspek && p.sumber === "mandiri")?.nilai ?? null,
    nilai_atasan:  perilakuRows.find(p => p.aspek === aspek && p.sumber === "atasan")?.nilai ?? null,
  }))

  type ApprovalRow = { actor_nama: string | null; actor_jabatan: string | null; aksi: string; status_ke: string | null; catatan: string | null; created_at: Date | null }
  const approval = await prisma.$queryRaw<ApprovalRow[]>`
    SELECT k.nama_karyawan AS actor_nama, k.jabatan AS actor_jabatan,
           al.aksi, al.status_ke, al.catatan, al.created_at
    FROM approval_log al
    LEFT JOIN karyawans k ON k.id = al.actor_karyawan_id
    WHERE al.id_penilaian = ${pen.id}
    ORDER BY al.created_at ASC
  `

  return {
    penilaian: {
      id: Number(pen.id),
      status: pen.status,
      nilai_kehadiran: num(pen.nilai_kehadiran),
      nilai_capaian_sasaran: num(pen.nilai_capaian_sasaran),
      nilai_perilaku: num(pen.nilai_perilaku),
      nilai_pengembangan: num(pen.nilai_pengembangan),
      nilai_akhir: num(pen.nilai_akhir),
      catatan_atasan: pen.catatan_atasan,
      tanggal_diverifikasi: pen.tanggal_diverifikasi,
      tanggal_disetujui: pen.tanggal_disetujui,
      tanggal_final: pen.tanggal_final,
    },
    identitas: {
      nik: kar?.nik ?? "-",
      nama_karyawan: kar?.nama_karyawan ?? "-",
      jabatan: kar?.jabatan ?? "-",
      nama_divisi: kar?.nama_divisi ?? null,
      nama_atasan: kar?.nama_atasan ?? null,
    },
    periode: {
      id: Number(per?.id ?? pen.id_periode),
      kode_periode: per?.kode_periode ?? "-",
      nama_periode: per?.nama_periode ?? "-",
      tanggal_mulai: per?.tanggal_mulai ?? new Date(),
      tanggal_selesai: per?.tanggal_selesai ?? new Date(),
    },
    targets: tgtRows.map(t => ({
      uraian_tugas: t.uraian_tugas,
      satuan: t.satuan,
      target_nilai: Number(t.target_nilai),
      realisasi_nilai: num(t.realisasi_nilai),
      bobot_dalam_capaian: Number(t.bobot_dalam_capaian),
    })),
    perilaku,
    approval,
  }
}

// ─── Daftar penilaian dalam satu periode (untuk bulk PDF) ──────────

export async function getPenilaianIdsByPeriode(idPeriode: number): Promise<{ id: number; nama_karyawan: string; nik: string }[]> {
  type Row = { id: bigint; nama_karyawan: string; nik: string }
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT pk.id, k.nama_karyawan, k.nik
    FROM penilaian_kinerja pk
    JOIN karyawans k ON k.id = pk.id_pegawai
    WHERE pk.id_periode = ${BigInt(idPeriode)}
    ORDER BY k.nama_karyawan ASC
  `
  return rows.map(r => ({ id: Number(r.id), nama_karyawan: r.nama_karyawan, nik: r.nik }))
}

// ─── Predikat kinerja ─────────────────────────────────────────────

export function getPredikat(nilai: number | null): { label: string; color: [number, number, number] } {
  if (nilai === null) return { label: "Belum Dinilai", color: [120, 120, 120] }
  if (nilai >= 91) return { label: "Istimewa", color: [22, 163, 74] }       // hijau
  if (nilai >= 76) return { label: "Baik", color: [37, 99, 235] }           // biru
  if (nilai >= 61) return { label: "Cukup", color: [217, 119, 6] }          // oranye
  if (nilai >= 51) return { label: "Kurang", color: [220, 38, 38] }         // merah
  return { label: "Sangat Kurang", color: [153, 27, 27] }                   // merah tua
}
