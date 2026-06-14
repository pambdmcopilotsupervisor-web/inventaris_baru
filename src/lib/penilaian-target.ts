import { prisma } from "@/lib/prisma"
import type { SessionUser } from "@/lib/session"

export type TargetKerjaInput = {
  uraian_tugas: string
  satuan: "dokumen" | "kegiatan" | "laporan" | "persentase" | "lainnya"
  target_nilai: number
  bobot_dalam_capaian: number
  catatan?: string | null
}

export type TargetKerjaRow = {
  id: bigint
  id_periode: bigint
  id_pegawai: bigint
  uraian_tugas: string
  satuan: string
  target_nilai: string | number
  realisasi_nilai: string | number | null
  bobot_dalam_capaian: string | number
  status: "draft" | "diajukan" | "disetujui" | "ditolak"
  disetujui_oleh: bigint | null
  disetujui_pada: Date | null
  catatan: string | null
  created_at: Date | null
  updated_at: Date | null
}

export type PeriodePenilaianRow = {
  id: bigint
  kode_periode: string
  nama_periode: string
  tanggal_mulai: Date
  tanggal_selesai: Date
  tanggal_buka: Date
  tanggal_tutup: Date
  status: "draft" | "aktif" | "tutup"
  keterangan: string | null
  created_at: Date | null
  updated_at: Date | null
}

export type MonitoringTargetRow = {
  id_pegawai: bigint
  nik: string
  nama_karyawan: string
  jabatan: string
  atasan_id: bigint | null
  jumlah_target: bigint | number
  total_bobot: string | number | null
  status_target: string | null
}

const SATUAN_TARGET = new Set(["dokumen", "kegiatan", "laporan", "persentase", "lainnya"])

export function isAdminLike(user: SessionUser): boolean {
  return user.role === "admin" || user.role === "hrd"
}

export function normalizeTargetInputs(items: TargetKerjaInput[]): TargetKerjaInput[] {
  return items.map(item => ({
    uraian_tugas: item.uraian_tugas.trim(),
    satuan: item.satuan,
    target_nilai: Number(item.target_nilai),
    bobot_dalam_capaian: Number(item.bobot_dalam_capaian),
    catatan: item.catatan?.trim() || null,
  }))
}

export function validateTargetInputs(items: TargetKerjaInput[]): string | null {
  if (items.length < 3 || items.length > 5) return "Target kerja wajib berisi 3 sampai 5 uraian tugas utama"

  let totalBobot = 0
  for (const [index, item] of items.entries()) {
    const row = index + 1
    if (!item.uraian_tugas) return `Uraian tugas baris ${row} wajib diisi`
    if (!SATUAN_TARGET.has(item.satuan)) return `Satuan baris ${row} tidak valid`
    if (!Number.isFinite(item.target_nilai) || item.target_nilai <= 0) return `Target nilai baris ${row} harus lebih dari 0`
    if (!Number.isFinite(item.bobot_dalam_capaian) || item.bobot_dalam_capaian <= 0) return `Bobot baris ${row} harus lebih dari 0`
    totalBobot += item.bobot_dalam_capaian
  }

  if (Math.round(totalBobot * 100) / 100 !== 100) return "Total bobot semua tugas harus = 100%"
  return null
}

export async function getPeriodePenilaian(idPeriode: number | bigint): Promise<PeriodePenilaianRow | null> {
  const rows = await prisma.$queryRaw<PeriodePenilaianRow[]>`
    SELECT *
    FROM periode_penilaian
    WHERE id = ${BigInt(idPeriode)}
    LIMIT 1
  `
  return rows[0] ?? null
}

export async function getTargetKerja(idPegawai: number | bigint, idPeriode: number | bigint): Promise<TargetKerjaRow[]> {
  return prisma.$queryRaw<TargetKerjaRow[]>`
    SELECT *
    FROM target_kerja
    WHERE id_pegawai = ${BigInt(idPegawai)}
      AND id_periode = ${BigInt(idPeriode)}
    ORDER BY id ASC
  `
}

export async function getBawahanIds(karyawanId: number | bigint, recursive = true): Promise<bigint[]> {
  const rows = await prisma.karyawans.findMany({
    where: {
      OR: [
        { status_karyawan: null },
        { status_karyawan: { notIn: ["Pensiun", "Nonaktif"] } },
      ],
    },
    select: { id: true, atasan_id: true },
  })

  const rootId = BigInt(karyawanId)
  const byAtasan = new Map<string, bigint[]>()
  rows.forEach(row => {
    if (!row.atasan_id) return
    const key = row.atasan_id.toString()
    byAtasan.set(key, [...(byAtasan.get(key) ?? []), row.id])
  })

  const result: bigint[] = []
  const queue = [...(byAtasan.get(rootId.toString()) ?? [])]
  while (queue.length > 0) {
    const current = queue.shift()!
    result.push(current)
    if (recursive) queue.push(...(byAtasan.get(current.toString()) ?? []))
  }
  return result
}

export async function canAccessPegawaiTarget(user: SessionUser, idPegawai: number | bigint): Promise<boolean> {
  const pegawaiId = BigInt(idPegawai)
  if (isAdminLike(user)) return true
  if (user.karyawan_id && BigInt(user.karyawan_id) === pegawaiId) return true
  if (!user.karyawan_id) return false
  // Gunakan jabatan+divisi multi-level
  const bawahanIds = await getBawahanByJabatanDivisi(user.karyawan_id)
  return bawahanIds.some(id => id === pegawaiId)
}

export async function canApprovePegawaiTarget(user: SessionUser, idPegawai: number | bigint, final = false): Promise<boolean> {
  if (isAdminLike(user)) return true
  if (!user.karyawan_id) return false
  const bawahanIds = await getBawahanByJabatanDivisi(user.karyawan_id)
  return bawahanIds.some(id => id === BigInt(idPegawai))
}

export async function createPenilaianDraftForEmployees(idPeriode: bigint, employeeIds: bigint[]): Promise<void> {
  for (const employeeId of employeeIds) {
    await prisma.$executeRaw`
      INSERT INTO penilaian_kinerja
        (id_periode, id_pegawai, status, created_at, updated_at)
      VALUES
        (${idPeriode}, ${employeeId}, 'draft', NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        updated_at = updated_at
    `
  }
}

export async function saveTargetKerja(idPegawai: bigint, idPeriode: bigint, items: TargetKerjaInput[]): Promise<void> {
  await prisma.$transaction(async tx => {
    const existing = await tx.$queryRaw<{ status: string }[]>`
      SELECT status
      FROM target_kerja
      WHERE id_pegawai = ${idPegawai}
        AND id_periode = ${idPeriode}
      LIMIT 1
    `
    const existingStatus = existing[0]?.status
    if (existingStatus === "disetujui") throw new Error("Target kerja sudah disetujui dan tidak dapat diubah")

    await tx.$executeRaw`
      DELETE FROM target_kerja
      WHERE id_pegawai = ${idPegawai}
        AND id_periode = ${idPeriode}
    `

    for (const item of items) {
      await tx.$executeRaw`
        INSERT INTO target_kerja
          (id_periode, id_pegawai, uraian_tugas, satuan, target_nilai, bobot_dalam_capaian, status, catatan, created_at, updated_at)
        VALUES
          (${idPeriode}, ${idPegawai}, ${item.uraian_tugas}, ${item.satuan}, ${item.target_nilai}, ${item.bobot_dalam_capaian}, 'diajukan', ${item.catatan}, NOW(), NOW())
      `
    }

    await tx.$executeRaw`
      INSERT INTO penilaian_kinerja
        (id_periode, id_pegawai, status, created_at, updated_at)
      VALUES
        (${idPeriode}, ${idPegawai}, 'draft', NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        updated_at = NOW()
    `
  })
}

export async function approveTargetKerja(idTarget: number | bigint, approverId: number | bigint | null, catatan?: string | null): Promise<void> {
  await prisma.$executeRaw`
    UPDATE target_kerja
    SET status = 'disetujui',
        disetujui_oleh = ${approverId == null ? null : BigInt(approverId)},
        disetujui_pada = NOW(),
        catatan = COALESCE(${catatan?.trim() || null}, catatan),
        updated_at = NOW()
    WHERE id = ${BigInt(idTarget)}
  `
}

export async function getMonitoringTarget(idPeriode: number | bigint, atasanId?: number | bigint | null): Promise<MonitoringTargetRow[]> {
  let employeeIds: bigint[] | null = null
  if (atasanId) {
    // Gunakan jabatan+divisi multi-level (sama seperti penilaian-atasan.ts)
    employeeIds = await getBawahanByJabatanDivisi(atasanId)
    if (employeeIds.length === 0) return []
  }

  const rows = await prisma.$queryRaw<MonitoringTargetRow[]>`
    SELECT
      k.id AS id_pegawai,
      k.nik,
      k.nama_karyawan,
      k.jabatan,
      k.atasan_id,
      COUNT(t.id) AS jumlah_target,
      COALESCE(SUM(t.bobot_dalam_capaian), 0) AS total_bobot,
      CASE
        WHEN COUNT(t.id) = 0 THEN 'belum_mengisi'
        WHEN SUM(CASE WHEN t.status = 'disetujui' THEN 1 ELSE 0 END) = COUNT(t.id) THEN 'disetujui'
        WHEN SUM(CASE WHEN t.status = 'diajukan' THEN 1 ELSE 0 END) > 0 THEN 'diajukan'
        ELSE MIN(t.status)
      END AS status_target
    FROM karyawans k
    LEFT JOIN target_kerja t
      ON t.id_pegawai = k.id
      AND t.id_periode = ${BigInt(idPeriode)}
    WHERE (k.status_karyawan IS NULL OR k.status_karyawan NOT IN ('Pensiun', 'Nonaktif'))
    GROUP BY k.id, k.nik, k.nama_karyawan, k.jabatan, k.atasan_id
    ORDER BY k.nama_karyawan ASC
  `

  if (!employeeIds) return rows
  const allowed = new Set(employeeIds.map(id => id.toString()))
  return rows.filter(row => allowed.has(row.id_pegawai.toString()))
}

/**
 * Ambil bawahan berdasarkan jabatan+divisi+subdivisi (multi-level).
 * Tidak di-export agar tidak circular dependency.
 */
async function getBawahanByJabatanDivisi(karyawanId: number | bigint): Promise<bigint[]> {
  type Info = { jabatan: string; divisi_id: number | null; subdivisi_id: number | null }
  const rows = await prisma.$queryRaw<Info[]>`
    SELECT jabatan, divisi_id, subdivisi_id FROM karyawans WHERE id = ${BigInt(karyawanId)} LIMIT 1
  `
  const info = rows[0]
  if (!info) return []

  const jabatan = info.jabatan ?? ""
  const JABATAN_STAF  = ["Staff", "Staf", "Koordinator", "Bendahara", "Sekretaris", "Ketua"]
  const JABATAN_KEPALA = ["Kepala Divisi", "Kepala Bagian"]
  const JABATAN_MANAGER = ["Manager", "Manajer", "Direktur"]
  const toSqlList = (arr: string[]) => arr.map(s => `'${s.replace(/'/g, "\\'")}'`).join(",")

  // Manager → semua Kepala Divisi, lalu semua Staf dari setiap Kepala Divisi
  if (JABATAN_MANAGER.some(j => jabatan.toLowerCase().includes(j.toLowerCase()))) {
    const kepalasResult = await prisma.$queryRawUnsafe<{ id: bigint }[]>(
      `SELECT id FROM karyawans WHERE jabatan IN (${toSqlList(JABATAN_KEPALA)}) AND status_karyawan NOT IN ('Pensiun','Nonaktif') AND id != ${karyawanId}`,
    )
    if (kepalasResult.length > 0) {
      const allIds = new Set(kepalasResult.map(r => r.id.toString()))
      for (const kepala of kepalasResult) {
        const staf = await getBawahanByJabatanDivisi(kepala.id)
        staf.forEach(id => allIds.add(id.toString()))
      }
      return Array.from(allIds).map(id => BigInt(id))
    }
  }

  // Kepala Divisi → Staf di subdivisi/divisi yang sama + atasan_id langsung
  if (JABATAN_KEPALA.some(j => jabatan.toLowerCase().includes(j.toLowerCase()))) {
    const filters: string[] = []
    if (info.subdivisi_id) filters.push(`subdivisi_id = ${info.subdivisi_id}`)
    if (info.divisi_id)    filters.push(`divisi_id = ${info.divisi_id}`)
    filters.push(`atasan_id = ${karyawanId}`)
    const whereClause = filters.map(f => `(${f})`).join(" OR ")
    const result = await prisma.$queryRawUnsafe<{ id: bigint }[]>(
      `SELECT id FROM karyawans WHERE (${whereClause}) AND jabatan IN (${toSqlList(JABATAN_STAF)}) AND status_karyawan NOT IN ('Pensiun','Nonaktif') AND id != ${karyawanId}`,
    )
    if (result.length > 0) return result.map(r => r.id)
  }

  // Fallback: atasan_id rekursif
  return getBawahanIds(karyawanId, true)
}
