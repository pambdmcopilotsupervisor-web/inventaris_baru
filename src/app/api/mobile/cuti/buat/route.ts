import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireMobileAuth } from "@/lib/mobile-auth"
import { hitungHariKerja, resolveAtasan, STATUS_CUTI, JABATAN_MANAGER } from "@/lib/leave"
import { writeAuditLog } from "@/lib/audit"

// POST /api/mobile/cuti
// Buat pengajuan cuti dari mobile (simpan sebagai draft)

export async function POST(req: NextRequest) {
  const auth = await requireMobileAuth(req)
  if ("error" in auth) return auth.error

  const karyawanId = auth.user.karyawan_id
  if (!karyawanId) return NextResponse.json({ error: "Akun belum terhubung ke karyawan" }, { status: 422 })

  try {
    const body = await req.json()
    const { jenis_cuti_id, tanggal_mulai, tanggal_selesai, alasan, alamat_selama_cuti } = body

    if (!jenis_cuti_id)   return NextResponse.json({ error: "Jenis cuti wajib dipilih" }, { status: 400 })
    if (!tanggal_mulai)   return NextResponse.json({ error: "Tanggal mulai wajib diisi" }, { status: 400 })
    if (!tanggal_selesai) return NextResponse.json({ error: "Tanggal selesai wajib diisi" }, { status: 400 })
    if (!alasan?.trim())  return NextResponse.json({ error: "Alasan wajib diisi" }, { status: 400 })

    const dtMulai   = new Date(tanggal_mulai)
    const dtSelesai = new Date(tanggal_selesai)
    if (dtSelesai < dtMulai) return NextResponse.json({ error: "Tanggal selesai tidak boleh sebelum tanggal mulai" }, { status: 400 })

    // Cek karyawan aktif
    const karyawan = await prisma.karyawans.findUnique({
      where: { id: BigInt(karyawanId) },
      select: { status_karyawan: true, nama_karyawan: true, jabatan: true },
    })
    if (!karyawan || ["Pensiun", "Nonaktif"].includes(karyawan.status_karyawan ?? "")) {
      return NextResponse.json({ error: "Status karyawan tidak aktif" }, { status: 422 })
    }

    // Cek jenis cuti
    const jenisCuti = await prisma.jenis_cutis.findUnique({ where: { id: BigInt(jenis_cuti_id) } })
    if (!jenisCuti || jenisCuti.status !== "aktif") {
      return NextResponse.json({ error: "Jenis cuti tidak tersedia" }, { status: 422 })
    }

    // Cek lampiran wajib
    if (jenisCuti.membutuhkan_lampiran) {
      return NextResponse.json({ error: `Jenis cuti "${jenisCuti.nama_cuti}" memerlukan lampiran. Gunakan aplikasi web untuk pengajuan ini.` }, { status: 422 })
    }

    // Validasi atasan
    const jabatan = karyawan.jabatan ?? ""
    const isManagerKetua = JABATAN_MANAGER.some(j => jabatan.toLowerCase().includes(j.toLowerCase()))
    const { atasan } = await resolveAtasan(BigInt(karyawanId))
    if (!isManagerKetua && !atasan) {
      return NextResponse.json({ error: "Atasan langsung belum dikonfigurasi. Hubungi HRD." }, { status: 422 })
    }

    // Cek overlap
    const overlap = await prisma.pengajuan_cutis.findFirst({
      where: {
        karyawan_id:    BigInt(karyawanId),
        status:         { notIn: [STATUS_CUTI.CANCELLED, STATUS_CUTI.REJECTED_HRD, STATUS_CUTI.REJECTED_SUPERVISOR] },
        tanggal_mulai:  { lte: dtSelesai },
        tanggal_selesai: { gte: dtMulai },
      },
    })
    if (overlap) return NextResponse.json({ error: "Sudah ada pengajuan cuti pada rentang tanggal yang sama" }, { status: 409 })

    // Cek saldo
    const jumlahHari = await hitungHariKerja(BigInt(karyawanId), dtMulai, dtSelesai)
    if (jenisCuti.potong_saldo_cuti && jumlahHari > 0) {
      const tahun = dtMulai.getFullYear()
      const saldo = await prisma.saldo_cutis.findFirst({
        where: { karyawan_id: BigInt(karyawanId), jenis_cuti_id: BigInt(jenis_cuti_id), tahun },
      })
      const saldoSisa = saldo ? saldo.saldo_awal + saldo.saldo_penyesuaian - saldo.saldo_terpakai : 0
      if (jumlahHari > saldoSisa) {
        return NextResponse.json({ error: `Saldo cuti tidak mencukupi. Sisa: ${saldoSisa} hari, dibutuhkan: ${jumlahHari} hari.` }, { status: 422 })
      }
    }

    const now = new Date()
    const data = await prisma.pengajuan_cutis.create({
      data: {
        karyawan_id:        BigInt(karyawanId),
        jenis_cuti_id:      BigInt(jenis_cuti_id),
        tanggal_mulai:      dtMulai,
        tanggal_selesai:    dtSelesai,
        jumlah_hari:        jumlahHari,
        alasan:             alasan.trim(),
        alamat_selama_cuti: alamat_selama_cuti?.trim() || null,
        status:             STATUS_CUTI.DRAFT,
        dibuat_oleh:        BigInt(auth.user.id),
        created_at:         now, updated_at: now,
      },
    })

    return NextResponse.json(serialize({ success: true, data, jumlah_hari: jumlahHari }), { status: 201 })
  } catch (err) {
    console.error("[mobile cuti POST]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal membuat pengajuan cuti" }, { status: 500 })
  }
}
