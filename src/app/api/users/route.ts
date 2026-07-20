import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma, serialize } from "@/lib/prisma"
import { requireSession } from "@/lib/auth"

function getErrorCode(err: unknown): unknown {
  return err && typeof err === "object" && "code" in err ? (err as { code?: unknown }).code : undefined
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession(req)
    if ("error" in auth) return auth.error

    const users = await prisma.users.findMany({
      select: { id: true, name: true, email: true, role: true, karyawan_id: true, created_at: true },
      orderBy: { name: "asc" },
    })

    // Enrichment: nama karyawan
    const karyawans = await prisma.karyawans.findMany({ select: { id: true, nama_karyawan: true, jabatan: true } })
    const kMap = new Map(karyawans.map(k => [Number(k.id), k]))

    const enriched = users.map(u => ({
      ...u,
      nama_karyawan: u.karyawan_id ? kMap.get(u.karyawan_id)?.nama_karyawan ?? null : null,
      jabatan:       u.karyawan_id ? kMap.get(u.karyawan_id)?.jabatan       ?? null : null,
    }))

    return NextResponse.json(serialize(enriched))
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSession(req)
    if ("error" in auth) return auth.error
    if ((auth.user.role ?? "user").toLowerCase() === "user") {
      return NextResponse.json({ error: "Role user tidak boleh menambah data user" }, { status: 403 })
    }

    const body = await req.json()
    const { name, email, password, role, karyawan_id } = body

    if (!name || !email || !password || !role) {
      return NextResponse.json({ error: "Field wajib tidak lengkap" }, { status: 400 })
    }

    // Hash password dan simpan ke password_baru (tidak mengubah password lama pedami)
    const hashedPassword = await bcrypt.hash(password, 12)

    let user
    try {
      user = await prisma.users.create({
        data: {
          name, email,
          password: hashedPassword,    // password lama tetap diisi (required field)
          password_baru: hashedPassword, // password khusus inventaris_baru
          role,
          karyawan_id: karyawan_id ? Number(karyawan_id) : null,
        },
      })
    } catch (err: unknown) {
      if (getErrorCode(err) === "P2002") throw err // duplicate email
      // Fallback: kolom password_baru belum ada
      user = await prisma.users.create({
        data: {
          name, email, password: hashedPassword, role,
          karyawan_id: karyawan_id ? Number(karyawan_id) : null,
        },
      })
    }

    return NextResponse.json(serialize({ id: user.id, name: user.name, email: user.email, role: user.role }), { status: 201 })
  } catch (err: unknown) {
    if (getErrorCode(err) === "P2002") return NextResponse.json({ error: "Email sudah terdaftar" }, { status: 400 })
    return NextResponse.json({ error: "Gagal menyimpan" }, { status: 500 })
  }
}
