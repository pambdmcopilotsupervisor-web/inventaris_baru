import { prisma } from "@/lib/prisma"
import type { SessionUser } from "@/lib/session"
import { getBawahanIds } from "@/lib/penilaian-target"
import { assertPeriodePenilaianTerbuka } from "@/lib/penilaian-periode"

export type PerilakuAspek = "integritas" | "kerjasama" | "inisiatif" | "orientasi_layanan" | "kedisiplinan"

// Jabatan non-pemimpin (bawahan dari Kepala Divisi)
const JABATAN_STAF = ["Staff", "Staf", "Koordinator", "Bendahara", "Sekretaris", "Ketua"]
const JABATAN_KEPALA = ["Kepala Divisi", "Kepala Bagian"]
const JABATAN_MANAGER = ["Manager", "Manajer", "Direktur"]

/**
 * Deteksi bawahan berdasarkan jabatan + divisi (logika penilaian kinerja).
 * - Manager → semua Kepala Divisi aktif
 * - Kepala Divisi → semua Staf/Koordinator dalam divisi yang sama
 * - Fallback → gunakan atasan_id jika ada
 */
export async function getBawahanPenilaianIds(karyawanId: number): Promise<bigint[]> {
  type Info = { jabatan: string; divisi_id: number | null }
  const rows = await prisma.$queryRaw<Info[]>`
    SELECT jabatan, divisi_id FROM karyawans WHERE id = ${BigInt(karyawanId)} LIMIT 1
  `
  const info = rows[0]
  if (!info) return []

  const jabatan = info.jabatan ?? ""
  const toSqlList = (arr: string[]) => arr.map(s => `'${s.replace(/'/g, "\\'")}'`).join(",")

  // Manager → semua Kepala Divisi
  if (JABATAN_MANAGER.some(j => jabatan.toLowerCase().includes(j.toLowerCase()))) {
    const result = await prisma.$queryRawUnsafe<{ id: bigint }[]>(
      `SELECT id FROM karyawans WHERE jabatan IN (${toSqlList(JABATAN_KEPALA)}) AND status_karyawan NOT IN ('Pensiun','Nonaktif') AND id != ${karyawanId}`,
    )
    if (result.length > 0) return result.map(r => r.id)
  }

  // Kepala Divisi → prioritas: subdivisi yang sama, lalu divisi yang sama, lalu atasan_id
  if (JABATAN_KEPALA.some(j => jabatan.toLowerCase().includes(j.toLowerCase()))) {
    type Info2 = { jabatan: string; divisi_id: number | null; subdivisi_id: number | null }
    const fullRows = await prisma.$queryRaw<Info2[]>`
      SELECT jabatan, divisi_id, subdivisi_id FROM karyawans WHERE id = ${BigInt(karyawanId)} LIMIT 1
    `
    const full = fullRows[0]

    // Bangun filter: subdivisi → divisi → atasan_id
    const filters: string[] = []
    if (full?.subdivisi_id) filters.push(`subdivisi_id = ${full.subdivisi_id}`)
    if (full?.divisi_id)    filters.push(`divisi_id = ${full.divisi_id}`)
    filters.push(`atasan_id = ${karyawanId}`)

    const whereClause = filters.map(f => `(${f})`).join(" OR ")
    const result = await prisma.$queryRawUnsafe<{ id: bigint }[]>(
      `SELECT id FROM karyawans WHERE (${whereClause}) AND jabatan IN (${toSqlList(JABATAN_STAF)}) AND status_karyawan NOT IN ('Pensiun','Nonaktif') AND id != ${karyawanId}`,
    )
    if (result.length > 0) return result.map(r => r.id)
  }

  // Fallback: gunakan atasan_id (relasi langsung)
  return getBawahanIds(karyawanId, true)
}



export type VerifikasiTargetInput = {
  id: number
  realisasi_nilai_atasan: number | null
  catatan_verifikasi?: string | null
}

export type PerilakuAtasanInput = {
  aspek: PerilakuAspek
  nilai: number
  catatan?: string | null
}

export type SimpanPenilaianAtasanInput = {
  id_penilaian: number
  targets: VerifikasiTargetInput[]
  perilaku: PerilakuAtasanInput[]
  nilai_pengembangan: number
  catatan_atasan: string
  submit?: boolean
}

type PenilaianRow = {
  id: bigint
  id_periode: bigint
  id_pegawai: bigint
  id_penilai_atasan: bigint | null
  status: "draft" | "diajukan" | "diverifikasi" | "disetujui" | "final"
  nilai_kehadiran: string | number | null
  nilai_capaian_sasaran: string | number | null
  nilai_perilaku: string | number | null
  nilai_pengembangan: string | number | null
  nilai_akhir: string | number | null
  catatan_pegawai: string | null
  catatan_atasan: string | null
  tanggal_diajukan: Date | null
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
  sumber: "mandiri" | "atasan"
  catatan: string | null
}

type KaryawanRow = {
  id: bigint
  nik: string
  nama_karyawan: string
  jabatan: string
  nama_divisi: string | null
  nama_atasan: string | null
}

type PeriodeRow = {
  id: bigint
  nama_periode: string
  tanggal_mulai: Date
  tanggal_selesai: Date
  tanggal_buka: Date
  tanggal_tutup: Date
  status: string
}

const ASPEK_PERILAKU: PerilakuAspek[] = ["integritas", "kerjasama", "inisiatif", "orientasi_layanan", "kedisiplinan"]

function clamp(v: number, min: number, max: number) { return Math.min(max, Math.max(min, v)) }
function round2(v: number) { return Math.round(v * 100) / 100 }

// ─── Kalkulasi ───────────────────────────────────────────────────

export function hitungNilaiCapaianAtasan(
  targets: { target_nilai: number; realisasi_nilai: number; bobot_dalam_capaian: number }[],
): number {
  const nilai = targets.reduce((sum, t) => {
    const capaian = t.target_nilai > 0 ? clamp((t.realisasi_nilai / t.target_nilai) * 100, 0, 120) : 0
    return sum + capaian * (t.bobot_dalam_capaian / 100)
  }, 0)
  return round2(clamp(nilai, 0, 120))
}

export function hitungNilaiPerilakuGabungan(
  mandiriItems: { nilai: number }[],
  atasanItems: { nilai: number }[],
): number {
  const avgMandiri = mandiriItems.length ? mandiriItems.reduce((s, i) => s + i.nilai, 0) / mandiriItems.length : 0
  const avgAtasan  = atasanItems.length  ? atasanItems.reduce((s, i) => s + i.nilai, 0)  / atasanItems.length  : 0
  return round2((avgMandiri * 0.3 + avgAtasan * 0.7) / 5 * 100)
}

export function hitungNilaiAkhir(params: {
  nilai_kehadiran: number
  nilai_capaian_sasaran: number
  nilai_perilaku: number
  nilai_pengembangan: number
}): number {
  return round2(clamp(
    params.nilai_kehadiran       * 0.20 +
    params.nilai_capaian_sasaran * 0.40 +
    params.nilai_perilaku        * 0.30 +
    params.nilai_pengembangan    * 0.10,
    0, 100,
  ))
}

// ─── Validasi akses ──────────────────────────────────────────────

export async function canAccessBawahanPenilaian(user: SessionUser, idPegawai: number | bigint): Promise<boolean> {
  if (!user.karyawan_id) return false
  if (user.role === "admin" || user.role === "hrd") return true
  // Cek bawahan rekursif untuk semua role (termasuk user yang jadi atasan)
  const bawahanIds = await getBawahanPenilaianIds(user.karyawan_id)
  return bawahanIds.some(id => BigInt(id) === BigInt(idPegawai))
}

// ─── Daftar penilaian bawahan ────────────────────────────────────

export async function getDaftarPenilaianBawahan(user: SessionUser, idPeriode?: number) {
  if (!user.karyawan_id) throw new Error("Akun belum terhubung ke data karyawan")

  let periodeId: bigint
  if (idPeriode) {
    periodeId = BigInt(idPeriode)
  } else {
    const rows = await prisma.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM periode_penilaian
      ORDER BY CASE WHEN status = 'aktif' THEN 0 ELSE 1 END, tanggal_mulai DESC, id DESC
      LIMIT 1
    `
    if (!rows[0]) throw new Error("Periode penilaian belum tersedia")
    periodeId = rows[0].id
  }

  const periodeRows = await prisma.$queryRaw<PeriodeRow[]>`
    SELECT id, nama_periode, tanggal_mulai, tanggal_selesai, tanggal_buka, tanggal_tutup, status
    FROM periode_penilaian WHERE id = ${periodeId} LIMIT 1
  `
  if (!periodeRows[0]) throw new Error("Periode tidak ditemukan")

  let bawahanIds: bigint[]
  // Kumpulkan semua bawahan secara multi-level via jabatan+divisi
  const level1 = await getBawahanPenilaianIds(user.karyawan_id)
  const allIds  = new Set(level1.map(id => id.toString()))
  // Level 2: bawahan dari bawahan (Manager → semua Staf via Kepala Divisi)
  for (const id of level1) {
    const level2 = await getBawahanPenilaianIds(Number(id))
    level2.forEach(id2 => allIds.add(id2.toString()))
  }
  bawahanIds = Array.from(allIds).map(id => BigInt(id))

  if (bawahanIds.length === 0 && (user.role === "admin" || user.role === "hrd")) {
    // Admin/HRD tanpa bawahan langsung → tampilkan semua pegawai aktif
    const rows = await prisma.$queryRaw<{ id: bigint }[]>`SELECT id FROM karyawans WHERE status_karyawan NOT IN ('Pensiun','Nonaktif')`
    bawahanIds = rows.map(r => r.id)
  }

  if (bawahanIds.length === 0) return { periode: periodeRows[0], list: [] }

  type DaftarRow = {
    penilaian_id: bigint | null
    id_pegawai: bigint
    nik: string
    nama_karyawan: string
    jabatan: string
    nama_divisi: string | null
    status: string | null
    nilai_kehadiran: string | number | null
    nilai_akhir: string | number | null
    tanggal_diajukan: Date | null
    id_penilai_atasan: bigint | null  // null = atasan belum isi form penilaian
  }

  // Build IN clause safely via parameterized query won't work with bigint array, use raw join
  const idList = bawahanIds.map(id => `${id}`).join(",")
  const list = await prisma.$queryRawUnsafe<DaftarRow[]>(`
    SELECT
      pk.id                AS penilaian_id,
      k.id                 AS id_pegawai,
      k.nik,
      k.nama_karyawan,
      k.jabatan,
      COALESCE(d.nama_divisi, sub_d.nama_divisi, s.nama_sub) AS nama_divisi,
      pk.status,
      pk.nilai_kehadiran,
      pk.nilai_akhir,
      pk.tanggal_diajukan,
      pk.id_penilai_atasan
    FROM karyawans k
    LEFT JOIN divisis d ON d.id = k.divisi_id
    LEFT JOIN subdivisis s ON s.id = k.subdivisi_id
    LEFT JOIN divisis sub_d ON sub_d.id = s.divisi_id
    LEFT JOIN penilaian_kinerja pk ON pk.id_pegawai = k.id AND pk.id_periode = ${periodeId}
    WHERE k.id IN (${idList})
    ORDER BY k.nama_karyawan ASC
  `)

  return { periode: periodeRows[0], list }
}

// ─── Detail untuk form atasan ────────────────────────────────────

export async function getPenilaianUntukAtasan(user: SessionUser, idPenilaian: number) {
  if (!user.karyawan_id) throw new Error("Akun belum terhubung ke data karyawan")

  const penilRows = await prisma.$queryRaw<PenilaianRow[]>`
    SELECT id, id_periode, id_pegawai, id_penilai_atasan, status,
           nilai_kehadiran, nilai_capaian_sasaran, nilai_perilaku, nilai_pengembangan, nilai_akhir,
           catatan_pegawai, catatan_atasan, tanggal_diajukan
    FROM penilaian_kinerja
    WHERE id = ${BigInt(idPenilaian)}
    LIMIT 1
  `
  const penilaian = penilRows[0]
  if (!penilaian) throw new Error("Data penilaian tidak ditemukan")

  const ok = await canAccessBawahanPenilaian(user, penilaian.id_pegawai)
  if (!ok) throw new Error("Tidak diizinkan mengakses penilaian pegawai ini")

  const karyawanRows = await prisma.$queryRaw<KaryawanRow[]>`
    SELECT k.id, k.nik, k.nama_karyawan, k.jabatan,
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
    WHERE k.id = ${penilaian.id_pegawai}
    LIMIT 1
  `

  const periodeRows = await prisma.$queryRaw<PeriodeRow[]>`
    SELECT id, nama_periode, tanggal_mulai, tanggal_selesai, tanggal_buka, tanggal_tutup, status
    FROM periode_penilaian WHERE id = ${penilaian.id_periode} LIMIT 1
  `

  const targets = await prisma.$queryRaw<TargetRow[]>`
    SELECT id, uraian_tugas, satuan, target_nilai, realisasi_nilai, bobot_dalam_capaian, catatan, catatan_pegawai, catatan_atasan, status
    FROM target_kerja
    WHERE id_periode = ${penilaian.id_periode} AND id_pegawai = ${penilaian.id_pegawai}
    ORDER BY id ASC
  `

  const perilaku = await prisma.$queryRaw<PerilakuRow[]>`
    SELECT aspek, nilai, sumber, catatan
    FROM penilaian_perilaku
    WHERE id_penilaian = ${penilaian.id}
    ORDER BY FIELD(aspek, 'integritas', 'kerjasama', 'inisiatif', 'orientasi_layanan', 'kedisiplinan'), sumber ASC
  `

  let pengembanganPegawai: { pelatihan: string[]; rencana_pengembangan: string; pencapaian_terbaik: string; saran_pimpinan?: string | null } = {
    pelatihan: [], rencana_pengembangan: "", pencapaian_terbaik: "", saran_pimpinan: null,
  }
  try {
    if (penilaian.catatan_pegawai) pengembanganPegawai = JSON.parse(penilaian.catatan_pegawai)
  } catch { /* ignore */ }

  return {
    penilaian,
    identitas: karyawanRows[0] ?? null,
    periode: periodeRows[0] ?? null,
    targets,
    perilaku,
    pengembanganPegawai,
    aspek_perilaku: ASPEK_PERILAKU,
  }
}

// ─── Simpan penilaian atasan ─────────────────────────────────────

export async function simpanPenilaianAtasan(user: SessionUser, input: SimpanPenilaianAtasanInput) {
  if (!user.karyawan_id) throw new Error("Akun belum terhubung ke data karyawan")
  if (!Number.isInteger(input.id_penilaian)) throw new Error("ID penilaian tidak valid")
  if (input.perilaku.length !== 5) throw new Error("Semua 5 aspek perilaku atasan wajib diisi")
  for (const item of input.perilaku) {
    if (!ASPEK_PERILAKU.includes(item.aspek)) throw new Error(`Aspek '${item.aspek}' tidak valid`)
    if (!Number.isInteger(item.nilai) || item.nilai < 1 || item.nilai > 5) throw new Error("Nilai perilaku harus 1–5")
  }
  if (!Number.isFinite(input.nilai_pengembangan) || input.nilai_pengembangan < 0 || input.nilai_pengembangan > 100)
    throw new Error("Nilai pengembangan harus 0–100")
  if (input.submit && !input.catatan_atasan.trim()) throw new Error("Catatan atasan wajib diisi saat menyelesaikan penilaian")

  const detail = await getPenilaianUntukAtasan(user, input.id_penilaian)
  await assertPeriodePenilaianTerbuka(detail.penilaian.id_periode, input.submit ? "menyelesaikan penilaian atasan" : "menyimpan draft penilaian atasan")
  if (!["diajukan", "diverifikasi"].includes(detail.penilaian.status))
    throw new Error("Penilaian pegawai belum diajukan atau sudah final")
  if (detail.penilaian.status === "diajukan" && detail.penilaian.id_penilai_atasan && !["admin", "hrd"].includes(user.role ?? ""))
    throw new Error("Penilaian atasan sudah selesai diisi dan menunggu verifikasi")

  const penilaianId = detail.penilaian.id
  const nextStatus  = detail.penilaian.status

  const targetById = new Map(detail.targets.map(t => [Number(t.id), t]))
  const targetsForCalc = input.targets.map(inp => {
    const existing = targetById.get(inp.id)
    if (!existing) throw new Error(`Target id=${inp.id} tidak ditemukan`)
    const realisasi = inp.realisasi_nilai_atasan != null ? inp.realisasi_nilai_atasan : Number(existing.realisasi_nilai ?? 0)
    return {
      id: Number(existing.id),
      target_nilai: Number(existing.target_nilai),
      realisasi_nilai: realisasi,
      bobot_dalam_capaian: Number(existing.bobot_dalam_capaian),
      catatan_verifikasi: inp.catatan_verifikasi?.trim() ?? null,
      override: inp.realisasi_nilai_atasan != null,
    }
  })

  const nilaiCapaian      = hitungNilaiCapaianAtasan(targetsForCalc)
  const perilakuMandiri   = detail.perilaku.filter(p => p.sumber === "mandiri")
  const nilaiPerilaku     = hitungNilaiPerilakuGabungan(perilakuMandiri, input.perilaku)
  const nilaiPengembangan = round2(clamp(input.nilai_pengembangan, 0, 100))
  const nilaiKehadiran    = round2(Number(detail.penilaian.nilai_kehadiran ?? 0))
  const nilaiAkhir        = hitungNilaiAkhir({ nilai_kehadiran: nilaiKehadiran, nilai_capaian_sasaran: nilaiCapaian, nilai_perilaku: nilaiPerilaku, nilai_pengembangan: nilaiPengembangan })

  await prisma.$transaction(async tx => {
    for (const t of targetsForCalc.filter(t => t.override)) {
      await tx.$executeRaw`
        UPDATE target_kerja
        SET realisasi_nilai = ${t.realisasi_nilai}, catatan_atasan = ${t.catatan_verifikasi ?? ""}, updated_at = NOW()
        WHERE id = ${BigInt(t.id)}
      `
    }

    for (const item of input.perilaku) {
      await tx.$executeRaw`
        INSERT INTO penilaian_perilaku
          (id_penilaian, aspek, nilai, sumber, id_penilai, catatan, created_at, updated_at)
        VALUES
          (${penilaianId}, ${item.aspek}, ${item.nilai}, 'atasan', ${BigInt(user.karyawan_id!)}, ${item.catatan?.trim() ?? ""}, NOW(), NOW())
        ON DUPLICATE KEY UPDATE
          nilai = VALUES(nilai), catatan = VALUES(catatan), updated_at = NOW()
      `
    }

    await tx.$executeRaw`
      UPDATE penilaian_kinerja
      SET status                = ${nextStatus},
          id_penilai_atasan     = CASE WHEN ${input.submit ? 1 : 0} = 1 THEN ${BigInt(user.karyawan_id!)} ELSE id_penilai_atasan END,
          nilai_capaian_sasaran = ${nilaiCapaian},
          nilai_perilaku        = ${nilaiPerilaku},
          nilai_pengembangan    = ${nilaiPengembangan},
          nilai_akhir           = ${nilaiAkhir},
          catatan_atasan        = ${input.catatan_atasan.trim()},
          updated_at            = NOW()
      WHERE id = ${penilaianId}
    `

    if (input.submit) {
      await tx.$executeRaw`
        INSERT INTO approval_log
          (id_penilaian, actor_karyawan_id, aksi, status_dari, status_ke, catatan, created_at)
        VALUES
          (${penilaianId}, ${BigInt(user.karyawan_id!)}, 'penilaian_atasan_selesai', ${detail.penilaian.status}, ${detail.penilaian.status}, 'Penilaian atasan selesai diisi dan siap diverifikasi', NOW())
      `
    }
  })

  return { nilai_capaian: nilaiCapaian, nilai_perilaku: nilaiPerilaku, nilai_pengembangan: nilaiPengembangan, nilai_akhir: nilaiAkhir, status: nextStatus }
}
