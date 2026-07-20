import { NextRequest, NextResponse } from "next/server"
import { requireSession } from "@/lib/auth"
import { prisma, serialize } from "@/lib/prisma"
import { canCreateOrEditTransaksi, canDeleteTransaksi, getTransaksiActionError } from "@/lib/transaksi-role"
import { ensureAssetBuktiNotaColumn } from "@/lib/asset-schema"
import { toNullableDate, toNullableNumber, toNullableString, toRequiredNumber } from "@/lib/asset-input"

function sanitizeAssetUpdateData(body: Record<string, unknown>): Record<string, unknown> {
  const data = { ...body }
  delete data.id
  delete data.bukti_nota
  delete data.nama_ruangan
  delete data.lokasi
  delete data.nama_pj
  delete data.divisi_pj
  delete data.nama_pemakai

  if ("kode_asset" in data) data.kode_asset = toNullableString(data.kode_asset)?.trim()
  if ("nama_asset" in data) data.nama_asset = String(data.nama_asset ?? "")
  if ("gambar" in data) data.gambar = toNullableString(data.gambar)
  if ("tgl_beli" in data) data.tgl_beli = toNullableDate(data.tgl_beli)
  if ("hrg_beli" in data) data.hrg_beli = toNullableNumber(data.hrg_beli)
  if ("kelompok_asset" in data) data.kelompok_asset = String(data.kelompok_asset ?? "")
  if ("ruangan_id" in data) data.ruangan_id = toNullableNumber(data.ruangan_id)
  if ("penanggung_jawab_id" in data) data.penanggung_jawab_id = toRequiredNumber(data.penanggung_jawab_id)
  if ("pemakai" in data) data.pemakai = toNullableString(data.pemakai)
  if ("divisi" in data) data.divisi = toNullableString(data.divisi)
  if ("status_barang" in data) data.status_barang = String(data.status_barang ?? "Baik")
  if ("karyawan_id" in data) data.karyawan_id = toRequiredNumber(data.karyawan_id)
  if ("foto" in data) data.foto = toNullableString(data.foto)
  if ("deskripsi" in data) data.deskripsi = toNullableString(data.deskripsi)
  if ("kode_nama" in data) data.kode_nama = toNullableString(data.kode_nama)

  return data
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await ensureAssetBuktiNotaColumn(); const { id } = await params; const data = await prisma.assets.findUnique({ where: { id: BigInt(id) } }); if (!data) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 }); return NextResponse.json(serialize(data)) } catch { return NextResponse.json({ error: "Server error" }, { status: 500 }) }
}
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession(req)
  if ("error" in auth) return auth.error
  if (!canCreateOrEditTransaksi(auth.user.role)) return NextResponse.json({ error: getTransaksiActionError("update") }, { status: 403 })
  try { await ensureAssetBuktiNotaColumn(); const { id } = await params; const body = await req.json(); const data = await prisma.assets.update({ where: { id: BigInt(id) }, data: sanitizeAssetUpdateData(body) }); return NextResponse.json(serialize(data)) } catch { return NextResponse.json({ error: "Gagal" }, { status: 500 }) }
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession(req)
  if ("error" in auth) return auth.error
  if (!canDeleteTransaksi(auth.user.role)) return NextResponse.json({ error: getTransaksiActionError("delete") }, { status: 403 })
  try { const { id } = await params; await prisma.assets.delete({ where: { id: BigInt(id) } }); return NextResponse.json({ success: true }) } catch { return NextResponse.json({ error: "Gagal" }, { status: 500 }) }
}
