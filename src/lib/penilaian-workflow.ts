import { prisma } from "@/lib/prisma"
import { getBawahanIds } from "@/lib/penilaian-target"
import { getBawahanPenilaianIds } from "@/lib/penilaian-atasan"
import { assertPeriodePenilaianTerbuka } from "@/lib/penilaian-periode"

// ─── Types ───────────────────────────────────────────────────────

export type StatusPenilaian = "draft" | "diajukan" | "diverifikasi" | "disetujui" | "final"

const STATUS_PENILAIAN: StatusPenilaian[] = ["draft", "diajukan", "diverifikasi", "disetujui", "final"]

export function isStatusPenilaian(value: unknown): value is StatusPenilaian {
  return typeof value === "string" && STATUS_PENILAIAN.includes(value as StatusPenilaian)
}

export type TransisiInfo = {
  dari:   StatusPenilaian
  ke:     StatusPenilaian
  label:  string
  peran:  ("pegawai" | "kepala_divisi" | "manager" | "admin" | "hrd")[]
  butuh_catatan: boolean
  butuh_hierarki: boolean  // true = cek relasi bawahan
}

// ─── State machine ────────────────────────────────────────────────

const TRANSISI: TransisiInfo[] = [
  {
    dari: "draft",       ke: "diajukan",
    label: "Kirim ke Atasan",
    peran: ["pegawai", "admin", "hrd"],
    butuh_catatan: false, butuh_hierarki: false,
  },
  {
    dari: "diajukan",    ke: "diverifikasi",
    label: "Verifikasi (Kepala Divisi)",
    peran: ["kepala_divisi", "admin", "hrd"],
    butuh_catatan: false, butuh_hierarki: true,
  },
  {
    dari: "diajukan",    ke: "draft",
    label: "Kembalikan ke Pegawai",
    peran: ["kepala_divisi", "admin", "hrd"],
    butuh_catatan: true, butuh_hierarki: true,
  },
  {
    dari: "diverifikasi", ke: "disetujui",
    label: "Setujui (Manager)",
    peran: ["manager", "admin", "hrd"],
    butuh_catatan: false, butuh_hierarki: true,
  },
  {
    dari: "diverifikasi", ke: "diajukan",
    label: "Kembalikan ke Kepala Divisi",
    peran: ["manager", "admin", "hrd"],
    butuh_catatan: true, butuh_hierarki: true,
  },
  {
    dari: "disetujui",   ke: "final",
    label: "Finalisasi (HRD)",
    peran: ["admin", "hrd"],
    butuh_catatan: false, butuh_hierarki: false,
  },
]

// ─── Helper: resolve role efektif dalam hierarki ──────────────────

/**
 * Apakah user adalah kepala_divisi (bawahan langsung rekursi=false) dari pegawai?
 * Apakah user adalah manager (bawahan rekursi=true) dari pegawai?
 */
async function getRoleEfektif(
  karyawanId: number,
  idPegawai: number,
  role: string,
): Promise<"pegawai" | "kepala_divisi" | "manager" | "admin" | "hrd" | null> {
  if (role === "admin") return "admin"
  if (role === "hrd")   return "hrd"
  if (karyawanId === idPegawai) return "pegawai"

  // Cek apakah atasan langsung (kepala divisi) berdasarkan jabatan+divisi
  const kepalaIds = await getBawahanPenilaianIds(karyawanId)
  type JabInfo = { jabatan: string }
  const jabRows = await prisma.$queryRaw<JabInfo[]>`SELECT jabatan FROM karyawans WHERE id = ${BigInt(karyawanId)} LIMIT 1`
  const jabatan = jabRows[0]?.jabatan ?? ""
  const isManager = ["Manager", "Manajer", "Direktur"].some(j => jabatan.toLowerCase().includes(j.toLowerCase()))

  // Kepala Divisi: idPegawai ada di level 1 bawahan
  if (!isManager && kepalaIds.some(id => Number(id) === idPegawai)) return "kepala_divisi"

  // Manager: idPegawai bisa ada di level 1 (Kepala Divisi) atau level 2 (Staf di bawah Kepala Divisi)
  if (isManager) {
    if (kepalaIds.some(id => Number(id) === idPegawai)) return "manager"
    // Level 2: cek bawahan dari setiap Kepala Divisi
    for (const kepalaId of kepalaIds) {
      const level2 = await getBawahanPenilaianIds(Number(kepalaId))
      if (level2.some(id => Number(id) === idPegawai)) return "manager"
    }
  }

  return null
}

// ─── canTransition ────────────────────────────────────────────────

export function canTransition(
  dari: StatusPenilaian,
  ke: StatusPenilaian,
  roleEfektif: "pegawai" | "kepala_divisi" | "manager" | "admin" | "hrd" | null,
): TransisiInfo | null {
  if (!roleEfektif) return null
  return TRANSISI.find(t => t.dari === dari && t.ke === ke && t.peran.includes(roleEfektif)) ?? null
}

// ─── getNextActions ────────────────────────────────────────────────

export async function getNextActions(
  idPenilaian: number,
  karyawanId: number,
  role: string,
): Promise<{ ke: StatusPenilaian; label: string; butuh_catatan: boolean }[]> {
  type Row = { status: StatusPenilaian; id_pegawai: bigint }
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT status, id_pegawai FROM penilaian_kinerja WHERE id = ${BigInt(idPenilaian)} LIMIT 1
  `
  if (!rows[0]) return []
  const { status, id_pegawai } = rows[0]
  const roleEfektif = await getRoleEfektif(karyawanId, Number(id_pegawai), role)
  if (!roleEfektif) return []

  return TRANSISI
    .filter(t => t.dari === status && t.peran.includes(roleEfektif))
    .map(t => ({ ke: t.ke, label: t.label, butuh_catatan: t.butuh_catatan }))
}

// ─── doTransition ────────────────────────────────────────────────

export async function doTransition(params: {
  idPenilaian:   number
  ke:            StatusPenilaian
  karyawanId:    number
  role:          string
  catatan:       string
}): Promise<{ status: StatusPenilaian; message: string }> {
  const { idPenilaian, ke, karyawanId, role, catatan } = params
  if (!Number.isSafeInteger(idPenilaian) || idPenilaian <= 0) throw new Error("ID penilaian tidak valid")
  if (!Number.isSafeInteger(karyawanId) || karyawanId <= 0) throw new Error("ID karyawan tidak valid")
  if (!isStatusPenilaian(ke)) throw new Error("Status tujuan tidak valid")

  type Row = { id: bigint; id_periode: bigint; status: StatusPenilaian; id_pegawai: bigint }
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT id, id_periode, status, id_pegawai FROM penilaian_kinerja WHERE id = ${BigInt(idPenilaian)} LIMIT 1
  `
  const penilaian = rows[0]
  if (!penilaian) throw new Error("Data penilaian tidak ditemukan")

  const dari = penilaian.status
  const roleEfektif = await getRoleEfektif(karyawanId, Number(penilaian.id_pegawai), role)
  const transisi = canTransition(dari, ke, roleEfektif)
  if (!transisi) throw new Error(`Transisi dari '${dari}' ke '${ke}' tidak diizinkan untuk peran Anda`)
  if (transisi.butuh_catatan && !catatan.trim()) throw new Error("Catatan alasan wajib diisi untuk transisi ini")
  await assertPeriodePenilaianTerbuka(penilaian.id_periode, `melakukan transisi ${dari} ke ${ke}`)

  if (dari === "draft" && ke === "diajukan") {
    type DraftCheck = {
      target_count: bigint
      target_realisasi_count: bigint
      mandiri_count: bigint
      nilai_capaian_sasaran: string | number | null
      nilai_perilaku: string | number | null
      nilai_pengembangan: string | number | null
      catatan_pegawai: string | null
    }
    const checkRows = await prisma.$queryRaw<DraftCheck[]>`
      SELECT
        (SELECT COUNT(*) FROM target_kerja tk WHERE tk.id_periode = pk.id_periode AND tk.id_pegawai = pk.id_pegawai) AS target_count,
        (SELECT COUNT(*) FROM target_kerja tk WHERE tk.id_periode = pk.id_periode AND tk.id_pegawai = pk.id_pegawai AND tk.realisasi_nilai IS NOT NULL) AS target_realisasi_count,
        (SELECT COUNT(*) FROM penilaian_perilaku pp WHERE pp.id_penilaian = pk.id AND pp.sumber = 'mandiri') AS mandiri_count,
        pk.nilai_capaian_sasaran,
        pk.nilai_perilaku,
        pk.nilai_pengembangan,
        pk.catatan_pegawai
      FROM penilaian_kinerja pk
      WHERE pk.id = ${BigInt(idPenilaian)}
      LIMIT 1
    `
    const check = checkRows[0]
    if (
      !check ||
      Number(check.target_count) === 0 ||
      Number(check.target_count) !== Number(check.target_realisasi_count) ||
      Number(check.mandiri_count) < 5 ||
      check.nilai_capaian_sasaran == null ||
      check.nilai_perilaku == null ||
      check.nilai_pengembangan == null ||
      !check.catatan_pegawai
    ) {
      throw new Error("Penilaian mandiri belum lengkap. Lengkapi target, perilaku, dan pengembangan sebelum mengirim ke atasan.")
    }
  }

  // Guard khusus: diajukan → diverifikasi wajib penilaian atasan sudah diisi
  if (dari === "diajukan" && ke === "diverifikasi") {
    type AtasanCheck = { catatan_atasan: string | null; id_penilai_atasan: bigint | null }
    const checkRows = await prisma.$queryRaw<AtasanCheck[]>`
      SELECT catatan_atasan, id_penilai_atasan FROM penilaian_kinerja WHERE id = ${BigInt(idPenilaian)} LIMIT 1
    `
    const catAtasan = checkRows[0]?.catatan_atasan
    const penilaiAtasan = checkRows[0]?.id_penilai_atasan
    type PerilakuCount = { cnt: bigint }
    const perilakuRows = await prisma.$queryRaw<PerilakuCount[]>`
      SELECT COUNT(*) AS cnt FROM penilaian_perilaku WHERE id_penilaian = ${BigInt(idPenilaian)} AND sumber = 'atasan'
    `
    const cntAtasan = Number(perilakuRows[0]?.cnt ?? 0)
    if (!penilaiAtasan || !catAtasan || cntAtasan < 5) {
      throw new Error("Penilaian Atasan belum dilengkapi. Isi form penilaian atasan terlebih dahulu sebelum memverifikasi.")
    }
  }

  if (dari === "diverifikasi" && ke === "disetujui") {
    type ApprovalCheck = { nilai_akhir: string | number | null; tanggal_diverifikasi: Date | null; id_penilai_atasan: bigint | null }
    const checkRows = await prisma.$queryRaw<ApprovalCheck[]>`
      SELECT nilai_akhir, tanggal_diverifikasi, id_penilai_atasan
      FROM penilaian_kinerja
      WHERE id = ${BigInt(idPenilaian)}
      LIMIT 1
    `
    const check = checkRows[0]
    if (!check?.id_penilai_atasan || !check.tanggal_diverifikasi || check.nilai_akhir == null) {
      throw new Error("Penilaian belum lengkap diverifikasi atau nilai akhir belum tersedia.")
    }
  }

  if (dari === "disetujui" && ke === "final") {
    type FinalCheck = { nilai_akhir: string | number | null; tanggal_disetujui: Date | null }
    const checkRows = await prisma.$queryRaw<FinalCheck[]>`
      SELECT nilai_akhir, tanggal_disetujui
      FROM penilaian_kinerja
      WHERE id = ${BigInt(idPenilaian)}
      LIMIT 1
    `
    const check = checkRows[0]
    if (!check?.tanggal_disetujui || check.nilai_akhir == null) {
      throw new Error("Penilaian belum disetujui Manager atau nilai akhir belum tersedia.")
    }
  }

  const timestamps: Record<string, string> = {
    diajukan:     "tanggal_diajukan",
    diverifikasi: "tanggal_diverifikasi",
    disetujui:    "tanggal_disetujui",
    final:        "tanggal_final",
  }
  const tsField = timestamps[ke]

  await prisma.$transaction(async tx => {
    if (tsField) {
      const actorField = ke === "diverifikasi"
        ? ", id_verifikator = ?"
        : ke === "final"
          ? ", id_approver_final = ?"
          : ""
      const updateArgs = actorField
        ? [ke, BigInt(karyawanId), BigInt(idPenilaian)]
        : [ke, BigInt(idPenilaian)]
      await tx.$executeRawUnsafe(`
        UPDATE penilaian_kinerja
        SET status = ?, ${tsField} = NOW()${actorField}, updated_at = NOW()
        WHERE id = ?
      `, ...updateArgs)
    } else {
      await tx.$executeRaw`
        UPDATE penilaian_kinerja
        SET status = ${ke}, updated_at = NOW()
        WHERE id = ${BigInt(idPenilaian)}
      `
    }

    await tx.$executeRaw`
      INSERT INTO approval_log
        (id_penilaian, actor_karyawan_id, aksi, status_dari, status_ke, catatan, created_at)
      VALUES
        (${BigInt(idPenilaian)}, ${BigInt(karyawanId)}, ${`transisi_${dari}_ke_${ke}`}, ${dari}, ${ke}, ${catatan.trim()}, NOW())
    `
  })

  // Kirim notifikasi
  await kirimNotifikasi({ idPenilaian, dari, ke, karyawanId, idPegawai: Number(penilaian.id_pegawai), catatan })

  const pesanMap: Partial<Record<StatusPenilaian, string>> = {
    diajukan:     "Penilaian berhasil dikirim ke atasan.",
    diverifikasi: "Penilaian berhasil diverifikasi.",
    disetujui:    "Penilaian berhasil disetujui.",
    final:        "Penilaian berhasil difinalisasi.",
    draft:        "Penilaian dikembalikan untuk revisi.",
  }

  return { status: ke, message: pesanMap[ke] ?? "Transisi berhasil." }
}

// ─── Notifikasi ──────────────────────────────────────────────────

async function kirimNotifikasi(params: {
  idPenilaian: number
  dari:        StatusPenilaian
  ke:          StatusPenilaian
  karyawanId:  number
  idPegawai:   number
  catatan:     string
}) {
  try {
    const { dari, ke, karyawanId, idPegawai, catatan, idPenilaian } = params

    type KaryawanInfo = { id: bigint; nama_karyawan: string; atasan_id: bigint | null }
    const [pegawaiRows, penilaiRows] = await Promise.all([
      prisma.$queryRaw<KaryawanInfo[]>`SELECT id, nama_karyawan, atasan_id FROM karyawans WHERE id = ${BigInt(idPegawai)} LIMIT 1`,
      prisma.$queryRaw<KaryawanInfo[]>`SELECT id, nama_karyawan, atasan_id FROM karyawans WHERE id = ${BigInt(karyawanId)} LIMIT 1`,
    ])
    const pegawai = pegawaiRows[0]
    const penilai = penilaiRows[0]
    if (!pegawai) return

    const notifs: { notifiable_id: bigint; pesan: string }[] = []

    if (ke === "diajukan" && dari === "draft") {
      // Pegawai submit → notif ke atasan langsung
      if (pegawai.atasan_id) {
        notifs.push({ notifiable_id: pegawai.atasan_id, pesan: `Penilaian ${pegawai.nama_karyawan} menunggu verifikasi Anda.` })
      }
    } else if (ke === "diverifikasi") {
      // Kepala divisi verif → notif ke manager (atasan dari penilai)
      if (penilai?.atasan_id) {
        notifs.push({ notifiable_id: penilai.atasan_id, pesan: `Penilaian kinerja pegawai Anda siap untuk disetujui.` })
      }
    } else if (ke === "draft") {
      // Dikembalikan → notif ke pegawai
      notifs.push({ notifiable_id: pegawai.id, pesan: `Penilaian Anda dikembalikan. Alasan: ${catatan || "Lihat catatan."}` })
    } else if (ke === "diajukan" && dari === "diverifikasi") {
      // Manager kembalikan ke kepala divisi → notif ke penilai (kepala divisi)
      const penilaianRows = await prisma.$queryRaw<{ id_penilai_atasan: bigint | null }[]>`
        SELECT id_penilai_atasan FROM penilaian_kinerja WHERE id = ${BigInt(idPenilaian)} LIMIT 1
      `
      const penilaiAtasan = penilaianRows[0]?.id_penilai_atasan
      if (penilaiAtasan) {
        notifs.push({ notifiable_id: penilaiAtasan, pesan: `Penilaian ${pegawai.nama_karyawan} dikembalikan. Alasan: ${catatan || "Lihat catatan."}` })
      }
    } else if (ke === "disetujui") {
      // Manager setujui → notif ke pegawai
      notifs.push({ notifiable_id: pegawai.id, pesan: `Penilaian kinerja Anda telah disetujui oleh Manager.` })
    } else if (ke === "final") {
      // HRD final → notif ke pegawai
      notifs.push({ notifiable_id: pegawai.id, pesan: `Penilaian kinerja Anda telah difinalisasi oleh HRD.` })
    }

    for (const n of notifs) {
      await prisma.notifications.create({
        data: {
          id: crypto.randomUUID(),
          type: `penilaian_kinerja.${dari}_ke_${ke}`,
          notifiable_type: "karyawans",
          notifiable_id: n.notifiable_id,
          data: JSON.stringify({ penilaian_id: idPenilaian, pesan: n.pesan }),
          created_at: new Date(),
          updated_at: new Date(),
        },
      })
    }
  } catch { /* notifikasi gagal tidak boleh menggagalkan transisi */ }
}

// ─── getMenungguSaya ─────────────────────────────────────────────

export async function getMenungguSaya(karyawanId: number, role: string, idPeriode?: number) {
  type MenungguRow = {
    id: bigint
    id_periode: bigint
    nama_periode: string
    id_pegawai: bigint
    nik: string
    nama_karyawan: string
    jabatan: string
    status: StatusPenilaian
    tanggal_diajukan: Date | null
    nilai_akhir: string | number | null
  }

  let periodeFilter = ""
  const args: unknown[] = []
  if (idPeriode) {
    periodeFilter = " AND pk.id_periode = ?"
    args.push(BigInt(idPeriode))
  }

  // Admin/HRD: semua yang butuh tindakan
  if (role === "admin" || role === "hrd") {
    const rows = await prisma.$queryRawUnsafe<MenungguRow[]>(`
      SELECT pk.id, pk.id_periode, pp.nama_periode,
             pk.id_pegawai, k.nik, k.nama_karyawan, k.jabatan,
             pk.status, pk.tanggal_diajukan, pk.nilai_akhir
      FROM penilaian_kinerja pk
      JOIN karyawans k ON k.id = pk.id_pegawai
      JOIN periode_penilaian pp ON pp.id = pk.id_periode
      WHERE pk.status IN ('diajukan', 'diverifikasi', 'disetujui')
      ${periodeFilter}
      ORDER BY pk.tanggal_diajukan ASC
    `, ...args)
    return rows
  }

  // Kumpulkan semua bawahan secara multi-level via jabatan+divisi
  // Level 1: bawahan langsung (Kepala Divisi untuk Manager, Staf untuk Kepala Divisi)
  const level1 = await getBawahanPenilaianIds(karyawanId)
  const allIds  = new Set(level1.map(id => id.toString()))

  // Level 2: bawahan dari bawahan (untuk Manager agar bisa lihat penilaian Staf)
  for (const id of level1) {
    const level2 = await getBawahanPenilaianIds(Number(id))
    level2.forEach(id2 => allIds.add(id2.toString()))
  }

  let bawahanIds = Array.from(allIds).map(id => BigInt(id))

  // Fallback: jika masih kosong, coba atasan_id rekursif
  if (bawahanIds.length === 0) bawahanIds = await getBawahanIds(karyawanId, true)
  if (bawahanIds.length === 0) return []

  const idList = bawahanIds.map(id => `${id}`).join(",")

  const rows = await prisma.$queryRawUnsafe<MenungguRow[]>(`
    SELECT pk.id, pk.id_periode, pp.nama_periode,
           pk.id_pegawai, k.nik, k.nama_karyawan, k.jabatan,
           pk.status, pk.tanggal_diajukan, pk.nilai_akhir
    FROM penilaian_kinerja pk
    JOIN karyawans k ON k.id = pk.id_pegawai
    JOIN periode_penilaian pp ON pp.id = pk.id_periode
    WHERE pk.id_pegawai IN (${idList})
      AND pk.status IN ('diajukan', 'diverifikasi')
    ${periodeFilter.replace("?", periodeFilter ? "?" : "")}
    ORDER BY pk.tanggal_diajukan ASC
  `, ...args)

  return rows
}
