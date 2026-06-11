import React from "react"
import { prisma, serialize } from "@/lib/prisma"
import { formatDate } from "@/lib/utils"
import { notFound } from "next/navigation"

export default async function InfoKaryawanPublicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const karyawan = await prisma.karyawans.findUnique({ where: { id: BigInt(id) } }).catch(() => null)
  if (!karyawan) notFound()

  // Enrich divisi & subdivisi
  let divisi: string | null = null
  let subdivisi: string | null = null
  if (karyawan.subdivisi_id) {
    const sub = await prisma.subdivisis.findUnique({ where: { id: BigInt(karyawan.subdivisi_id) } }).catch(() => null)
    if (sub) {
      subdivisi = sub.nama_sub
      const div = await prisma.divisis.findUnique({ where: { id: BigInt(sub.divisi_id) } }).catch(() => null)
      divisi = div?.nama_divisi ?? null
    }
  }

  const statusColor = karyawan.status_karyawan === "Aktif" ? "#059669"
    : karyawan.status_karyawan === "Pensiun" ? "#DC2626"
    : "#D97706"

  const rows: [string, string | null][] = [
    ["NIK",             karyawan.nik],
    ["Jabatan",         karyawan.jabatan],
    ["Divisi",          divisi],
    ["Sub Divisi",      subdivisi],
    ["Jenis Kelamin",   karyawan.jkel],
    ["Tgl Lahir",       karyawan.tanggal_lahir ? formatDate(karyawan.tanggal_lahir.toISOString()) : null],
    ["Tgl Masuk Kerja", karyawan.tanggal_masuk_kerja ? formatDate(karyawan.tanggal_masuk_kerja.toISOString()) : null],
    ["Agama",           karyawan.agama],
    ["Pendidikan",      karyawan.pendidikan_terakhir],
    ["No HP",           karyawan.no_hp],
    ["Alamat",          karyawan.alamat],
  ]

  return (
    <div style={{ minHeight: "100vh", background: "#F1F5F9", fontFamily: "'Fira Sans', sans-serif", padding: "24px 16px" }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ background: "#166534", borderRadius: "12px 12px 0 0", padding: "16px 20px", textAlign: "center" }}>
          <p style={{ color: "#bbf7d0", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, margin: 0 }}>
            DATA KARYAWAN
          </p>
          <p style={{ color: "#FFFFFF", fontSize: 16, fontWeight: 700, margin: "4px 0 0" }}>
            KOPERASI KONSUMEN PEDAMI
          </p>
        </div>

        {/* Card */}
        <div style={{ background: "#FFFFFF", borderRadius: "0 0 12px 12px", overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>

          {/* Nama & Status */}
          <div style={{ padding: "20px 20px 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div>
              <p style={{ fontSize: 20, fontWeight: 800, color: "#0F172A", margin: 0 }}>
                {karyawan.nama_karyawan}
              </p>
              <p style={{ fontSize: 13, color: "#475569", margin: "4px 0 0", fontWeight: 500 }}>
                {karyawan.jabatan}
              </p>
            </div>
            {karyawan.status_karyawan && (
              <span style={{
                background: statusColor + "22",
                color: statusColor,
                padding: "4px 12px",
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}>
                {karyawan.status_karyawan}
              </span>
            )}
          </div>

          {/* Divisi badge */}
          {divisi && (
            <div style={{ padding: "8px 20px 0" }}>
              <span style={{ background: "#ECFDF5", color: "#166534", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                {divisi}{subdivisi ? ` • ${subdivisi}` : ""}
              </span>
            </div>
          )}

          {/* Divider */}
          <div style={{ margin: "16px 0", height: 1, background: "#E2E8F0" }} />

          {/* Info list */}
          <div style={{ padding: "0 20px 20px" }}>
            {rows.filter(([, v]) => v).map(([label, value]) => (
              <div key={label} style={{
                display: "flex", alignItems: "flex-start", gap: 12,
                padding: "8px 0", borderBottom: "1px solid #F1F5F9",
              }}>
                <span style={{ fontSize: 12, color: "#94A3B8", fontWeight: 600, minWidth: 110 }}>{label}</span>
                <span style={{ fontSize: 13, color: "#0F172A", fontWeight: 500, flex: 1 }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{ padding: "12px 20px", background: "#F8FAFC", borderTop: "1px solid #E2E8F0", textAlign: "center" }}>
            <p style={{ fontSize: 11, color: "#94A3B8", margin: 0 }}>
              Data ini bersifat resmi dan hanya untuk keperluan internal.
            </p>
            <p style={{ fontSize: 11, color: "#94A3B8", margin: "4px 0 0" }}>
              &copy; Koperasi Konsumen Pedami
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
