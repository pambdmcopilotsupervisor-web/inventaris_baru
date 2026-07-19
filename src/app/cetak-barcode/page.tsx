"use client"

import React, { useEffect, useState } from "react"
import { QRCodeSVG } from "qrcode.react"

interface AssetData {
  id: number
  kode_asset: string
  nama_asset: string
  kelompok_asset: string
  divisi_pj: string | null
  status_barang: string
  nama_ruangan?: string | null
  lokasi?: string | null
}

interface BarcodePrintMeta {
  ruangan: string | null
  kondisi: string | null
  lokasi: string | null
  total: number
}

export default function CetakBarcodePage() {
  const [assets] = useState<AssetData[]>(() => {
    if (typeof window === "undefined") return []
    try {
      const raw = sessionStorage.getItem("cetak-barcode-assets")
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })
  const [meta] = useState<BarcodePrintMeta | null>(() => {
    if (typeof window === "undefined") return null
    try {
      const rawMeta = sessionStorage.getItem("cetak-barcode-meta")
      return rawMeta ? JSON.parse(rawMeta) : null
    } catch {
      return null
    }
  })

  // Auto print setelah load
  useEffect(() => {
    if (assets.length > 0) {
      const timer = setTimeout(() => window.print(), 800)
      return () => clearTimeout(timer)
    }
  }, [assets])

  const origin = typeof window !== "undefined" ? window.location.origin : "https://inventaris.pedami.id"

  return (
    <div>
      {/* Print stylesheet */}
      <style>{`
        @media print {
          body { margin: 0; padding: 0; }
          .no-print { display: none !important; }
          @page { size: A4 portrait; margin: 10mm; }
        }
        body { font-family: Helvetica, Arial, sans-serif; background: #f8f8f8; }

        /* Grid 2 kolom stiker berukuran fixed */
        .sticker-grid {
          display: flex; flex-wrap: wrap; gap: 8px;
          justify-content: flex-start; padding: 12px;
        }
        .sticker {
          width: 88mm;
          border: 2px solid #1e293b; border-radius: 6px;
          background: #ffffff; overflow: hidden;
          page-break-inside: avoid; break-inside: avoid;
        }
        .sticker-header {
          background: #1e293b; color: #fff;
          text-align: center; font-size: 8px; font-weight: 700;
          padding: 4px 6px; text-transform: uppercase; letter-spacing: 0.5px;
          border-radius: 4px 4px 0 0;
        }
        .sticker-body { padding: 7px 8px; display: flex; gap: 8px; align-items: center; }
        .sticker-info { flex: 1; min-width: 0; }
        .asset-code { font-weight: 800; font-size: 13px; color: #0f172a; font-family: 'Courier New', monospace; }
        .asset-name { font-size: 9.5px; color: #475569; margin-top: 2px; font-weight: 500; line-height: 1.25; }
        .asset-divisi {
          font-size: 8px; color: #64748b; margin-top: 4px;
          background: #f1f5f9; padding: 1px 5px; border-radius: 3px;
          display: inline-block; max-width: 100%; line-height: 1.25;
          white-space: normal; overflow-wrap: anywhere;
        }
        .sticker-qr { flex-shrink: 0; }
        .sticker-footer {
          text-align: center; font-size: 7.5px; font-style: italic;
          color: #ef4444; padding: 4px 6px;
          border-top: 1px dashed #cbd5e1;
        }
        .print-summary {
          margin: 12px;
          padding: 10px 12px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
        }
        .summary-title {
          font-size: 12px;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 6px;
        }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
        }
        .summary-item {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 8px;
        }
        .summary-label {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #64748b;
          margin-bottom: 2px;
        }
        .summary-value {
          font-size: 12px;
          font-weight: 600;
          color: #0f172a;
        }
        @media print {
          .print-summary {
            margin: 0 0 8px;
            padding: 8px 10px;
          }
          .summary-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 6px;
          }
          .summary-item {
            padding: 6px;
          }
          .summary-label {
            font-size: 9px;
          }
          .summary-value {
            font-size: 10px;
          }
        }
      `}</style>

      {/* Controls - only visible on screen, not print */}
      <div className="no-print" style={{ padding: 16, background: "#fff", borderBottom: "1px solid #e2e8f0", display: "flex", gap: 12, alignItems: "center" }}>
        <button
          onClick={() => window.print()}
          style={{ background: "#1E40AF", color: "#fff", padding: "8px 20px", borderRadius: 8, border: "none", fontWeight: 600, cursor: "pointer", fontSize: 14 }}
        >
          Simpan / Cetak PDF
        </button>
        <button
          onClick={() => window.close()}
          style={{ background: "#F1F5F9", color: "#475569", padding: "8px 16px", borderRadius: 8, border: "1px solid #E2E8F0", fontWeight: 500, cursor: "pointer", fontSize: 14 }}
        >
          Tutup
        </button>
        <span style={{ color: "#64748B", fontSize: 13 }}>
          {assets.length} stiker siap diubah ke PDF ({Math.ceil(assets.length / 2)} baris)
        </span>
      </div>

      {assets.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>
          <p style={{ fontSize: 16 }}>Tidak ada aset yang dipilih untuk dicetak.</p>
          <p style={{ fontSize: 13, marginTop: 8 }}>Kembali ke halaman Inventaris Aset dan pilih/filter aset terlebih dahulu.</p>
        </div>
      ) : (
        <>
          <div className="print-summary">
            <div className="summary-title">Ringkasan Cetak Barcode PDF</div>
            <div className="summary-grid">
              <div className="summary-item">
                <div className="summary-label">Total Aset</div>
                <div className="summary-value">{meta?.total ?? assets.length}</div>
              </div>
              <div className="summary-item">
                <div className="summary-label">Ruangan</div>
                <div className="summary-value">{meta?.ruangan ?? "Semua Ruangan"}</div>
              </div>
              <div className="summary-item">
                <div className="summary-label">Kondisi</div>
                <div className="summary-value">{meta?.kondisi ?? "Semua Kondisi"}</div>
              </div>
              <div className="summary-item">
                <div className="summary-label">Lokasi</div>
                <div className="summary-value">{meta?.lokasi ?? "Semua Lokasi"}</div>
              </div>
            </div>
          </div>

          {/* 2 stiker per baris — lebar fixed 88mm */}
          <div className="sticker-grid">
            {assets.map((asset) => (
              <div key={asset.id} className="sticker">
                {/* Header */}
                <div className="sticker-header">
                  Inventaris Koperasi Konsumen Pedami
                </div>

                {/* Body */}
                <div className="sticker-body">
                  {/* Info */}
                  <div className="sticker-info">
                    <div className="asset-code">{asset.kode_asset}</div>
                    <div className="asset-name">
                      {asset.nama_asset.length > 32
                        ? asset.nama_asset.slice(0, 32) + "..."
                        : asset.nama_asset}
                    </div>
                    <div className="asset-divisi">
                      {asset.divisi_pj ?? "Tanpa Divisi"}
                    </div>
                    {(asset.nama_ruangan || asset.lokasi) && (
                      <div className="asset-name" style={{ marginTop: 4, fontSize: 8.5 }}>
                        {asset.nama_ruangan ?? "Tanpa Ruangan"}
                        {asset.lokasi ? ` • ${asset.lokasi}` : ""}
                      </div>
                    )}
                  </div>

                  {/* QR Code */}
                  <div className="sticker-qr">
                    <div style={{ border: "1px solid #e2e8f0", padding: 3, borderRadius: 4, display: "inline-block", background: "#fff" }}>
                      <QRCodeSVG
                        value={`${origin}/info-asset/${asset.id}`}
                        size={52}
                        bgColor="#ffffff"
                        fgColor="#0f172a"
                        level="M"
                      />
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="sticker-footer">
                  Dilarang mencabut/melepas stiker ini!
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
