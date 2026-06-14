import { prisma } from "@/lib/prisma"
import type { SessionUser } from "@/lib/session"
import { hitungNilaiKehadiran } from "@/lib/penilaian-kehadiran"
import { assertPeriodePenilaianTerbuka, getPeriodeAktifAtauTerbaru } from "@/lib/penilaian-periode"

export type PerilakuAspek = "integritas" | "kerjasama" | "inisiatif" | "orientasi_layanan" | "kedisiplinan"

export type TargetMandiriInput = {
  id: number
  realisasi_nilai: number
  keterangan_kendala?: string | null
}

export type PerilakuMandiriInput = {
  aspek: PerilakuAspek
  nilai: number
  catatan?: string | null
}

export type PengembanganMandiriInput = {
  pelatihan: string[]
  rencana_pengembangan: string
  pencapaian_terbaik: string
  saran_pimpinan?: string | null
}

export type SimpanPenilaianMandiriInput = {
  id_periode: number
  targets: TargetMandiriInput[]
  perilaku: PerilakuMandiriInput[]
  pengembangan: PengembanganMandiriInput
  submit?: boolean
}

type PenilaianRow = {
  id: bigint
  status: "draft" | "diajukan" | "diverifikasi" | "disetujui" | "final"
  catatan_pegawai: string | null
  catatan_atasan: string | null
  nilai_kehadiran: string | number | null
  nilai_capaian_sasaran: string | number | null
  nilai_perilaku: string | number | null
  nilai_pengembangan: string | number | null
}

type IdentitasRow = {
  id: bigint
  nik: string
  nama_karyawan: string
  jabatan: string
  divisi_id: number | null
  nama_divisi: string | null
  nama_atasan: string | null
}

type TargetRow = {
  id: bigint
  uraian_tugas: string
  satuan: string
  target_nilai: string | number
  realisasi_nilai: string | number | null
  bobot_dalam_capaian: string | number
  catatan: string | null
  catatan_pegawai: string | null
  catatan_atasan: string | null
  status: string
}

type PerilakuRow = {
  aspek: PerilakuAspek
  nilai: number
  catatan: string | null
}

const ASPEK_PERILAKU: PerilakuAspek[] = ["integritas", "kerjasama", "inisiatif", "orientasi_layanan", "kedisiplinan"]

function parseJsonCatatan(value: string | null): PengembanganMandiriInput {
  if (!value) return { pelatihan: [], rencana_pengembangan: "", pencapaian_terbaik: "", saran_pimpinan: "" }
  try {
    const parsed = JSON.parse(value) as Partial<PengembanganMandiriInput>
    return {
      pelatihan: Array.isArray(parsed.pelatihan) ? parsed.pelatihan.map(String) : [],
      rencana_pengembangan: String(parsed.rencana_pengembangan ?? ""),
      pencapaian_terbaik: String(parsed.pencapaian_terbaik ?? ""),
      saran_pimpinan: String(parsed.saran_pimpinan ?? ""),
    }
  } catch {
    return { pelatihan: [], rencana_pengembangan: "", pencapaian_terbaik: "", saran_pimpinan: "" }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function hitungNilaiCapaian(targets: { target_nilai: number; realisasi_nilai: number; bobot_dalam_capaian: number }[]): number {
  const nilai = targets.reduce((sum, target) => {
    const capaian = target.target_nilai > 0 ? clamp((target.realisasi_nilai / target.target_nilai) * 100, 0, 120) : 0
    return sum + capaian * (target.bobot_dalam_capaian / 100)
  }, 0)
  return round2(clamp(nilai, 0, 120))
}

export function hitungNilaiPerilakuMandiri(items: PerilakuMandiriInput[]): number {
  if (items.length === 0) return 0
  const avg = items.reduce((sum, item) => sum + item.nilai, 0) / items.length
  return round2((avg / 5) * 100)
}

export function hitungNilaiPengembangan(input: PengembanganMandiriInput): number {
  let score = 0
  if (input.pelatihan.filter(Boolean).length > 0) score += 40
  if (input.rencana_pengembangan.trim()) score += 30
  if (input.pencapaian_terbaik.trim()) score += 30
  return score
}

export async function getPenilaianMandiri(user: SessionUser, idPeriode?: number) {
  if (!user.karyawan_id) throw new Error("Akun belum terhubung ke data karyawan")
  const periode = await getPeriodeAktifAtauTerbaru(idPeriode)
  if (!periode) throw new Error("Periode penilaian belum tersedia")

  const karyawanRows = await prisma.$queryRaw<IdentitasRow[]>`
    SELECT
      k.id,
      k.nik,
      k.nama_karyawan,
      k.jabatan,
      k.divisi_id,
      COALESCE(
        d.nama_divisi,
        sub_d.nama_divisi,
        s.nama_sub
      ) AS nama_divisi,
      COALESCE(
        a.nama_karyawan,
        (SELECT kep.nama_karyawan
         FROM karyawans kep
         WHERE kep.subdivisi_id = k.subdivisi_id
           AND kep.jabatan IN ('Kepala Divisi','Kepala Bagian')
           AND kep.status_karyawan NOT IN ('Pensiun','Nonaktif')
           AND kep.id != k.id
         LIMIT 1),
        (SELECT kep.nama_karyawan
         FROM karyawans kep
         WHERE kep.divisi_id = k.divisi_id
           AND kep.jabatan IN ('Kepala Divisi','Kepala Bagian')
           AND kep.status_karyawan NOT IN ('Pensiun','Nonaktif')
           AND kep.id != k.id
         LIMIT 1)
      ) AS nama_atasan
    FROM karyawans k
    LEFT JOIN divisis d ON d.id = k.divisi_id
    LEFT JOIN subdivisis s ON s.id = k.subdivisi_id
    LEFT JOIN divisis sub_d ON sub_d.id = s.divisi_id
    LEFT JOIN karyawans a ON a.id = k.atasan_id
    WHERE k.id = ${BigInt(user.karyawan_id)}
    LIMIT 1
  `
  const identitas = karyawanRows[0]
  if (!identitas) throw new Error("Data karyawan tidak ditemukan")

  const kehadiran = await hitungNilaiKehadiran(user.karyawan_id, periode.id, { save: true })

  await prisma.$executeRaw`
    INSERT INTO penilaian_kinerja
      (id_periode, id_pegawai, status, nilai_kehadiran, created_at, updated_at)
    VALUES
      (${periode.id}, ${BigInt(user.karyawan_id)}, 'draft', ${kehadiran.nilai_kehadiran}, NOW(), NOW())
    ON DUPLICATE KEY UPDATE
      nilai_kehadiran = VALUES(nilai_kehadiran),
      updated_at = NOW()
  `

  const penilaianRows = await prisma.$queryRaw<PenilaianRow[]>`
    SELECT id, status, catatan_pegawai, catatan_atasan, nilai_kehadiran, nilai_capaian_sasaran, nilai_perilaku, nilai_pengembangan
    FROM penilaian_kinerja
    WHERE id_periode = ${periode.id}
      AND id_pegawai = ${BigInt(user.karyawan_id)}
    LIMIT 1
  `
  const penilaian = penilaianRows[0]

  const targets = await prisma.$queryRaw<TargetRow[]>`
    SELECT id, uraian_tugas, satuan, target_nilai, realisasi_nilai, bobot_dalam_capaian, catatan, catatan_pegawai, catatan_atasan, status
    FROM target_kerja
    WHERE id_periode = ${periode.id}
      AND id_pegawai = ${BigInt(user.karyawan_id)}
    ORDER BY id ASC
  `

  const perilaku = await prisma.$queryRaw<PerilakuRow[]>`
    SELECT aspek, nilai, catatan
    FROM penilaian_perilaku
    WHERE id_penilaian = ${penilaian.id}
      AND sumber = 'mandiri'
    ORDER BY FIELD(aspek, 'integritas', 'kerjasama', 'inisiatif', 'orientasi_layanan', 'kedisiplinan')
  `

  return {
    periode,
    identitas,
    kehadiran,
    penilaian: {
      ...penilaian,
      pengembangan: parseJsonCatatan(penilaian.catatan_pegawai),
    },
    targets,
    perilaku,
    aspek_perilaku: ASPEK_PERILAKU,
  }
}

export function validatePenilaianMandiri(input: SimpanPenilaianMandiriInput): string | null {
  if (!input.id_periode) return "Periode wajib dipilih"
  if (!Array.isArray(input.targets) || input.targets.length === 0) return "Target kerja belum tersedia"

  for (const target of input.targets) {
    if (!target.id) return "Target kerja tidak valid"
    if (!Number.isFinite(Number(target.realisasi_nilai)) || Number(target.realisasi_nilai) < 0) return "Realisasi target tidak boleh kosong atau negatif"
    if (target.realisasi_nilai < 0) return "Realisasi target tidak valid"
    if (target.keterangan_kendala == null) target.keterangan_kendala = ""
  }

  for (const perilaku of input.perilaku) {
    if (!ASPEK_PERILAKU.includes(perilaku.aspek)) return "Aspek perilaku tidak valid"
    if (!Number.isInteger(perilaku.nilai) || perilaku.nilai < 1 || perilaku.nilai > 5) return "Nilai perilaku harus 1 sampai 5"
  }
  if (input.perilaku.length !== 5) return "Semua 5 aspek perilaku wajib diisi"

  if (!input.pengembangan.rencana_pengembangan.trim()) return "Rencana pengembangan diri wajib diisi"
  if (!input.pengembangan.pencapaian_terbaik.trim()) return "Pencapaian terbaik wajib diisi"
  return null
}

export async function simpanPenilaianMandiri(user: SessionUser, input: SimpanPenilaianMandiriInput) {
  if (!user.karyawan_id) throw new Error("Akun belum terhubung ke data karyawan")
  const validation = validatePenilaianMandiri(input)
  if (validation) throw new Error(validation)
  await assertPeriodePenilaianTerbuka(input.id_periode, input.submit ? "mengirim penilaian mandiri" : "menyimpan draft penilaian mandiri")

  const current = await getPenilaianMandiri(user, input.id_periode)
  if (current.penilaian.status !== "draft") throw new Error("Penilaian sudah dikirim dan tidak dapat diedit")

  const targetById = new Map(current.targets.map(target => [Number(target.id), target]))
  const normalizedTargets = input.targets.map(target => {
    const existing = targetById.get(Number(target.id))
    if (!existing) throw new Error("Target kerja tidak ditemukan")
    const targetNilai = Number(existing.target_nilai)
    const realisasi = Number(target.realisasi_nilai)
    const capaian = targetNilai > 0 ? clamp((realisasi / targetNilai) * 100, 0, 120) : 0
    if (capaian < 80 && !target.keterangan_kendala?.trim()) throw new Error("Keterangan/kendala wajib diisi untuk capaian di bawah 80%")
    return {
      id: Number(existing.id),
      target_nilai: targetNilai,
      realisasi_nilai: realisasi,
      bobot_dalam_capaian: Number(existing.bobot_dalam_capaian),
      keterangan_kendala: target.keterangan_kendala?.trim() || null,
    }
  })

  const nilaiCapaian = hitungNilaiCapaian(normalizedTargets)
  const nilaiPerilaku = hitungNilaiPerilakuMandiri(input.perilaku)
  const nilaiPengembangan = hitungNilaiPengembangan(input.pengembangan)
  const nextStatus = input.submit ? "diajukan" : "draft"
  const penilaianId = current.penilaian.id

  await prisma.$transaction(async tx => {
    for (const target of normalizedTargets) {
      await tx.$executeRaw`
        UPDATE target_kerja
        SET realisasi_nilai = ${target.realisasi_nilai},
            catatan_pegawai = ${target.keterangan_kendala ?? ""},
            updated_at = NOW()
        WHERE id = ${BigInt(target.id)}
      `
    }

    for (const item of input.perilaku) {
      await tx.$executeRaw`
        INSERT INTO penilaian_perilaku
          (id_penilaian, aspek, nilai, sumber, id_penilai, catatan, created_at, updated_at)
        VALUES
          (${penilaianId}, ${item.aspek}, ${item.nilai}, 'mandiri', ${BigInt(user.karyawan_id!)}, ${item.catatan?.trim() ?? ""}, NOW(), NOW())
        ON DUPLICATE KEY UPDATE
          nilai = VALUES(nilai),
          catatan = VALUES(catatan),
          updated_at = NOW()
      `
    }

    await tx.$executeRaw`
      UPDATE penilaian_kinerja
      SET status = ${nextStatus},
          nilai_capaian_sasaran = ${nilaiCapaian},
          nilai_perilaku = ${nilaiPerilaku},
          nilai_pengembangan = ${nilaiPengembangan},
          catatan_pegawai = ${JSON.stringify(input.pengembangan)},
          tanggal_diajukan = CASE WHEN ${input.submit ? 1 : 0} = 1 THEN NOW() ELSE tanggal_diajukan END,
          updated_at = NOW()
      WHERE id = ${penilaianId}
    `

    if (input.submit) {
      await tx.$executeRaw`
        INSERT INTO approval_log
          (id_penilaian, actor_karyawan_id, aksi, status_dari, status_ke, catatan, created_at)
        VALUES
          (${penilaianId}, ${BigInt(user.karyawan_id!)}, 'submit_mandiri', 'draft', 'diajukan', 'Penilaian mandiri dikirim ke atasan', NOW())
      `
    }
  })

  if (input.submit) await buatNotifikasiSubmitMandiri(user, penilaianId)

  return { nilai_capaian: nilaiCapaian, nilai_perilaku: nilaiPerilaku, nilai_pengembangan: nilaiPengembangan, status: nextStatus }
}

async function buatNotifikasiSubmitMandiri(user: SessionUser, penilaianId: bigint): Promise<void> {
  if (!user.karyawan_id) return
  const rows = await prisma.karyawans.findUnique({ where: { id: BigInt(user.karyawan_id) }, select: { atasan_id: true, nama_karyawan: true } })
  const atasanId = rows?.atasan_id
  if (!atasanId) return
  try {
    await prisma.notifications.create({
      data: {
        id: crypto.randomUUID(),
        type: "penilaian_mandiri.submitted",
        notifiable_type: "karyawans",
        notifiable_id: atasanId,
        data: JSON.stringify({ penilaian_id: Number(penilaianId), nama_karyawan: rows.nama_karyawan, message: "Penilaian mandiri telah dikirim ke atasan." }),
        created_at: new Date(),
        updated_at: new Date(),
      },
    })
  } catch {
    // Notifikasi gagal tidak boleh menggagalkan submit.
  }
}
