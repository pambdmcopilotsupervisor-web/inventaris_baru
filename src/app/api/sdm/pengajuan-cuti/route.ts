import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { hitungHariKerja, resolveAtasan, STATUS_CUTI, isJabatanAtasan, JABATAN_MANAGER } from "@/lib/leave"
import { checkSdmConflicts } from "@/lib/sdm-validation"

// GET  /api/sdm/pengajuan-cuti   — list pengajuan cuti
// POST /api/sdm/pengajuan-cuti   — buat pengajuan (draft)

const INCLUDE = {
  karyawans:  { select: { id: true, nik: true, nama_karyawan: true, jabatan: true, divisi_id: true } },
  jenis_cutis: { select: { id: true, kode_cuti: true, nama_cuti: true, potong_saldo_cuti: true, membutuhkan_lampiran: true } },
  approvals:  { orderBy: { approval_level: "asc" as const } },
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error
  try {
    const { searchParams } = new URL(req.url)
    const karyawanId = searchParams.get("karyawan_id")
    const status     = searchParams.get("status")
    const tglMulai   = searchParams.get("tgl_mulai")
    const tglSelesai = searchParams.get("tgl_selesai")
    const milik_saya = searchParams.get("milik_saya") === "1"

    const where: Record<string, unknown> = {}
    if (karyawanId)  where.karyawan_id = BigInt(karyawanId)
    if (status)      where.status = status
    if (tglMulai && tglSelesai) where.tanggal_mulai = { gte: new Date(tglMulai), lte: new Date(tglSelesai) }

    // Akses data berdasarkan role & jabatan:
    // - admin → lihat semua
    // - Kepala Divisi → lihat semua bawahan di divisinya
    // - lainnya → hanya milik sendiri
    const role = (auth.user.role ?? "user").toLowerCase()

    if (role === "admin") {
      // tidak ada filter tambahan
    } else if (auth.user.karyawan_id) {
      const loggedInK = await prisma.karyawans.findUnique({
        where: { id: BigInt(auth.user.karyawan_id) },
        select: { jabatan: true, divisi_id: true },
      })
      const isKepala = loggedInK?.jabatan?.toLowerCase().includes("kepala divisi")

      if (isKepala && loggedInK?.divisi_id) {
        // Kepala Divisi: lihat semua karyawan di divisinya + yang subdivisinya di divisi tsb
        const subDivisis = await prisma.subdivisis.findMany({
          where: { divisi_id: loggedInK.divisi_id }, select: { id: true },
        })
        const subIds = subDivisis.map(s => Number(s.id))

        // Ambil ID karyawan di divisi ini (termasuk yang divisi_id = NULL tapi subdivisi match)
        const karyawanDivisi = await prisma.karyawans.findMany({
          where: {
            OR: [
              { divisi_id: loggedInK.divisi_id },
              { divisi_id: null, subdivisi_id: { in: subIds } },
            ],
          },
          select: { id: true },
        })
        const ids = karyawanDivisi.map(k => k.id)
        where.karyawan_id = { in: ids }
      } else {
        // User/atasan biasa: hanya milik sendiri
        where.karyawan_id = BigInt(auth.user.karyawan_id)
      }
    } else {
      return NextResponse.json([])
    }

    // Jika milik_saya eksplisit, override dengan filter karyawan login
    if (milik_saya && auth.user.karyawan_id) {
      where.karyawan_id = BigInt(auth.user.karyawan_id)
    }

    const data = await prisma.pengajuan_cutis.findMany({
      where, orderBy: { created_at: "desc" }, include: INCLUDE,
    })
    return NextResponse.json(serialize(data))
  } catch { return NextResponse.json({ error: "Server error" }, { status: 500 }) }
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error
  try {
    const body = await req.json()
    const { karyawan_id, jenis_cuti_id, tanggal_mulai, tanggal_selesai, alasan, alamat_selama_cuti } = body

    // Tentukan target karyawan:
    // - admin → bisa input untuk siapapun
    // - Semua role lain → hanya untuk dirinya sendiri
    let targetKaryawanId = karyawan_id ? BigInt(karyawan_id) : null

    const role = auth.user.role ?? "user"

    if (role !== "admin") {
      if (!auth.user.karyawan_id) return NextResponse.json({ error: "Akun belum terhubung ke data karyawan" }, { status: 422 })
      targetKaryawanId = BigInt(auth.user.karyawan_id)
    }
    if (!targetKaryawanId) return NextResponse.json({ error: "Karyawan wajib dipilih" }, { status: 400 })

    if (!jenis_cuti_id)   return NextResponse.json({ error: "Jenis cuti wajib dipilih" }, { status: 400 })
    if (!tanggal_mulai)   return NextResponse.json({ error: "Tanggal mulai wajib diisi" }, { status: 400 })
    if (!tanggal_selesai) return NextResponse.json({ error: "Tanggal selesai wajib diisi" }, { status: 400 })
    if (!alasan?.trim())  return NextResponse.json({ error: "Alasan cuti wajib diisi" }, { status: 400 })

    const dtMulai   = new Date(tanggal_mulai)
    const dtSelesai = new Date(tanggal_selesai)
    if (dtSelesai < dtMulai) return NextResponse.json({ error: "Tanggal selesai tidak boleh sebelum tanggal mulai" }, { status: 400 })

    // Cek karyawan aktif
    const karyawan = await prisma.karyawans.findUnique({ where: { id: targetKaryawanId }, select: { status_karyawan: true, nama_karyawan: true } })
    if (!karyawan) return NextResponse.json({ error: "Karyawan tidak ditemukan" }, { status: 404 })
    if (karyawan.status_karyawan === "Pensiun" || karyawan.status_karyawan === "Nonaktif") {
      return NextResponse.json({ error: `Karyawan ${karyawan.nama_karyawan} sudah ${karyawan.status_karyawan}` }, { status: 422 })
    }

    // Cek jenis cuti
    const jenisCuti = await prisma.jenis_cutis.findUnique({ where: { id: BigInt(jenis_cuti_id) } })
    if (!jenisCuti || jenisCuti.status !== "aktif") return NextResponse.json({ error: "Jenis cuti tidak tersedia" }, { status: 422 })

    // Cek lampiran jika wajib
    if (jenisCuti.membutuhkan_lampiran && !body.lampiran) {
      return NextResponse.json({ error: `Jenis cuti "${jenisCuti.nama_cuti}" wajib menyertakan lampiran` }, { status: 400 })
    }

    // ── Validasi overlap tanggal cuti ────────────────────────────
    // Tidak boleh ada cuti lain di rentang tanggal yang sama (kecuali cancelled/rejected)
    const overlapping = await prisma.pengajuan_cutis.findFirst({
      where: {
        karyawan_id:    targetKaryawanId,
        status:         { notIn: [STATUS_CUTI.CANCELLED, STATUS_CUTI.REJECTED_HRD, STATUS_CUTI.REJECTED_SUPERVISOR] },
        tanggal_mulai:  { lte: dtSelesai },
        tanggal_selesai: { gte: dtMulai },
      },
      select: { id: true, tanggal_mulai: true, tanggal_selesai: true, jenis_cutis: { select: { nama_cuti: true } } },
    })
    if (overlapping) {
      const fmt = (d: Date) => d.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })
      return NextResponse.json({
        error: `Karyawan sudah memiliki pengajuan cuti pada rentang tanggal yang sama (${fmt(overlapping.tanggal_mulai)} – ${fmt(overlapping.tanggal_selesai)}). Tidak boleh ada cuti yang overlapping.`,
      }, { status: 409 })
    }

    const crossModuleConflict = await checkSdmConflicts({
      karyawanId: targetKaryawanId,
      tanggalMulai: dtMulai,
      tanggalSelesai: dtSelesai,
      modules: ["izin", "sakit", "lembur"],
    })
    if (crossModuleConflict.hasConflict) {
      return NextResponse.json({ error: crossModuleConflict.message, conflicts: crossModuleConflict.conflicts }, { status: 409 })
    }

    // Hitung hari kerja
    const jumlahHari = await hitungHariKerja(targetKaryawanId, dtMulai, dtSelesai)

    // ── Validasi atasan langsung ─────────────────────────────────
    const karyawanDetail = await prisma.karyawans.findUnique({
      where: { id: targetKaryawanId },
      select: { jabatan: true },
    })
    const jabatanKaryawan = karyawanDetail?.jabatan ?? ""
    const isManagerKetua = JABATAN_MANAGER.some(j => jabatanKaryawan.toLowerCase().includes(j.toLowerCase()))

    const { atasan } = await resolveAtasan(targetKaryawanId)

    // Jika bukan Manager/Ketua dan tidak punya atasan → tidak bisa ajukan cuti
    if (!isManagerKetua && !atasan) {
      return NextResponse.json({
        error: `Pengajuan cuti tidak dapat dibuat. Atasan langsung untuk ${karyawan.nama_karyawan} belum dikonfigurasi. Hubungi HRD untuk mengatur struktur jabatan atau atasan_id.`,
      }, { status: 422 })
    }

    // Cek saldo jika potong saldo
    if (jenisCuti.potong_saldo_cuti && jumlahHari > 0) {
      const tahun = dtMulai.getFullYear()
      const saldo = await prisma.saldo_cutis.findFirst({
        where: { karyawan_id: targetKaryawanId, jenis_cuti_id: BigInt(jenis_cuti_id), tahun },
      })
      const saldoSisa = saldo ? saldo.saldo_awal + saldo.saldo_penyesuaian - saldo.saldo_terpakai : 0
      if (jumlahHari > saldoSisa) {
        return NextResponse.json({ error: `Saldo cuti tidak mencukupi. Sisa: ${saldoSisa} hari, dibutuhkan: ${jumlahHari} hari.` }, { status: 422 })
      }
    }

    const now = new Date()
    const data = await prisma.pengajuan_cutis.create({
      data: {
        karyawan_id:        targetKaryawanId,
        jenis_cuti_id:      BigInt(jenis_cuti_id),
        tanggal_mulai:      dtMulai,
        tanggal_selesai:    dtSelesai,
        jumlah_hari:        jumlahHari,
        alasan:             alasan.trim(),
        alamat_selama_cuti: alamat_selama_cuti?.trim() || null,
        lampiran:           body.lampiran || null,
        status:             STATUS_CUTI.DRAFT,
        dibuat_oleh:        BigInt(auth.user.id),
        created_at:         now, updated_at: now,
      },
    })

    await writeAuditLog({ user: auth.user, action: "CREATE", modelType: "pengajuan_cutis", modelId: data.id, dataBaru: serialize(data), ip: getClientIp(req) })
    return NextResponse.json(serialize(data), { status: 201 })
  } catch (err) {
    console.error("[pengajuan-cuti POST]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal menyimpan pengajuan cuti" }, { status: 500 })
  }
}
