import React from "react"
import { prisma, serialize } from "@/lib/prisma"
import { formatDate, formatCurrency } from "@/lib/utils"
import { notFound } from "next/navigation"

export default async function InfoAssetPublicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const asset = await prisma.assets.findUnique({ where: { id: BigInt(id) } }).catch(() => null)
  if (!asset) notFound()

  // Enrichment
  const [ruangan, pj, pemakai] = await Promise.all([
    asset.ruangan_id         ? prisma.ruangans.findUnique({ where: { id: BigInt(asset.ruangan_id) } })     : null,
    asset.penanggung_jawab_id ? prisma.karyawans.findUnique({ where: { id: BigInt(asset.penanggung_jawab_id) } }) : null,
    asset.karyawan_id        ? prisma.karyawans.findUnique({ where: { id: BigInt(asset.karyawan_id) } })   : null,
  ])

  let divisiPj: string | null = null
  if (pj?.subdivisi_id) {
    const sub = await prisma.subdivisis.findUnique({ where: { id: BigInt(pj.subdivisi_id) } })
    if (sub) {
      const div = await prisma.divisis.findUnique({ where: { id: BigInt(sub.divisi_id) } })
      divisiPj = div?.nama_divisi ?? null
    }
  }

  const kondisiColor = asset.status_barang === "Baik" ? "#059669" : asset.status_barang === "Rusak Ringan" ? "#D97706" : "#DC2626"

  return (
    <div style={{ minHeight: "100vh", background: "#F1F5F9", fontFamily: "'Fira Sans', sans-serif", padding: "24px 16px" }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ background: "#0F172A", borderRadius: "12px 12px 0 0", padding: "16px 20px", textAlign: "center" }}>
          <p style={{ color: "#94A3B8", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, margin: 0 }}>
            INVENTARIS
          </p>
          <p style={{ color: "#FFFFFF", fontSize: 16, fontWeight: 700, margin: "4px 0 0" }}>
            KOPERASI KONSUMEN PEDAMI
          </p>
        </div>

        {/* Card */}
        <div style={{ background: "#FFFFFF", borderRadius: "0 0 12px 12px", overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>

          {/* Asset code badge */}
          <div style={{ padding: "20px 20px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <p style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", margin: 0, fontFamily: "'Fira Code', monospace" }}>
                {asset.kode_asset}
              </p>
              <p style={{ fontSize: 15, color: "#475569", margin: "4px 0 0", fontWeight: 500 }}>
                {asset.nama_asset}
              </p>
            </div>
            <span style={{
              background: kondisiColor + "22",
              color: kondisiColor,
              padding: "4px 12px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 700,
            }}>
              {asset.status_barang}
            </span>
          </div>

          {/* Kelompok */}
          <div style={{ padding: "8px 20px 0" }}>
            <span style={{ background: "#EFF6FF", color: "#1E40AF", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
              {asset.kelompok_asset === "komputer" ? "Peralatan Komputer" : "Perabotan Kantor"}
            </span>
          </div>

          {/* Divider */}
          <div style={{ margin: "16px 0", height: 1, background: "#E2E8F0" }} />

          {/* Info list */}
          <div style={{ padding: "0 20px 20px" }}>
            {[
              ["Ruangan / Lokasi", ruangan ? `${ruangan.ruangan} — ${ruangan.lokasi}` : null],
              ["Penanggung Jawab",  pj?.nama_karyawan],
              ["Divisi",           divisiPj],
              ["Pemakai",          pemakai?.nama_karyawan],
              ["Tanggal Beli",     asset.tgl_beli ? formatDate(asset.tgl_beli) : null],
              ["Harga Beli",       asset.hrg_beli ? formatCurrency(asset.hrg_beli) : null],
              ["Deskripsi",        asset.deskripsi],
            ].map(([label, value]) => (
              <div key={String(label)} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #F1F5F9" }}>
                <span style={{ fontSize: 13, color: "#64748B", fontWeight: 500 }}>{label}</span>
                <span style={{ fontSize: 13, color: "#0F172A", fontWeight: 600, textAlign: "right", maxWidth: "60%" }}>
                  {value || "—"}
                </span>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{ background: "#FEF2F2", padding: "12px 20px", borderTop: "1px solid #FECACA" }}>
            <p style={{ fontSize: 11, color: "#DC2626", fontStyle: "italic", textAlign: "center", margin: 0, fontWeight: 500 }}>
              ⚠ Dilarang mencabut/melepas stiker ini!
            </p>
          </div>
        </div>

        <p style={{ textAlign: "center", fontSize: 11, color: "#94A3B8", marginTop: 16 }}>
          ID Aset: {id} · Inventaris Koperasi Konsumen Pedami
        </p>
      </div>
    </div>
  )
}
