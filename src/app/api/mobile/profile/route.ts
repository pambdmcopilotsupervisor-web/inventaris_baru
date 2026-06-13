import { NextRequest, NextResponse } from "next/server"
import { prisma, serialize } from "@/lib/prisma"
import { requireMobileAuth } from "@/lib/mobile-auth"

// GET /api/mobile/profile
// Profil lengkap karyawan yang sedang login

export async function GET(req: NextRequest) {
  const auth = await requireMobileAuth(req)
  if ("error" in auth) return auth.error

  try {
    const karyawanId = auth.user.karyawan_id
    if (!karyawanId) {
      return NextResponse.json({ error: "Akun belum terhubung ke data karyawan" }, { status: 422 })
    }

    const karyawan = await prisma.karyawans.findUnique({
      where: { id: BigInt(karyawanId) },
      select: {
        id: true, nik: true, nama_karyawan: true, jabatan: true,
        jkel: true, status_karyawan: true, foto: true,
        tanggal_masuk_kerja: true, no_hp: true, alamat: true,
        divisi_id: true, subdivisi_id: true,
      },
    })
    if (!karyawan) return NextResponse.json({ error: "Data karyawan tidak ditemukan" }, { status: 404 })

    // Ambil nama divisi dan subdivisi
    let nama_divisi: string | null = null
    let nama_subdivisi: string | null = null
    if (karyawan.divisi_id) {
      const d = await prisma.divisis.findUnique({ where: { id: BigInt(karyawan.divisi_id) }, select: { nama_divisi: true } })
      nama_divisi = d?.nama_divisi ?? null
    }
    if (karyawan.subdivisi_id) {
      const s = await prisma.subdivisis.findUnique({ where: { id: BigInt(karyawan.subdivisi_id) }, select: { nama_sub: true } })
      nama_subdivisi = s?.nama_sub ?? null
    }

    return NextResponse.json(serialize({
      ...karyawan,
      nama_divisi,
      nama_subdivisi,
      user: {
        id:    auth.user.id,
        name:  auth.user.name,
        email: auth.user.email,
        role:  auth.user.role,
      },
    }))
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
