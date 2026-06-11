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
}

export default function CetakBarcodePage() {
  const [assets, setAssets] = useState<AssetData[]>([])

  useEffect(() => {
    // Baca daftar aset dari localStorage (dikirim dari halaman inventaris)
    try {
      const raw = sessionStorage.getItem("cetak-barcode-assets")
      if (raw) setAssets(JSON.parse(raw))
    } catch {}
  }, [])

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
        }
        .sticker-body { padding: 7px 8px; display: flex; gap: 8px; align-items: center; }
        .sticker-info { flex: 1; min-width: 0; }
        .asset-code { font-weight: 800; font-size: 13px; color: #0f172a; font-family: 'Courier New', monospace; }
        .asset-name { font-size: 9.5px; color: #475569; margin-top: 2px; font-weight: 500; line-height: 1.25; }
        .asset-divisi {
          font-size: 8px; color: #64748b; margin-top: 4px;
          background: #f1f5f9; padding: 1px 5px; border-radius: 3px;
          display: inline-block;
        }
        .sticker-qr { flex-shrink: 0; }
        .sticker-footer {
          text-align: center; font-size: 7.5px; font-style: italic;
          color: #ef4444; padding: 4px 6px;
          border-top: 1px dashed #cbd5e1;
        }
      `}</style>

      {/* Controls - only visible on screen, not print */}
      <div className="no-print" style={{ padding: 16, background: "#fff", borderBottom: "1px solid #e2e8f0", display: "flex", gap: 12, alignItems: "center" }}>
        <button
          onClick={() => window.print()}
          style={{ background: "#1E40AF", color: "#fff", padding: "8px 20px", borderRadius: 8, border: "none", fontWeight: 600, cursor: "pointer", fontSize: 14 }}
        >
          Cetak / Print
        </button>
        <button
          onClick={() => window.close()}
          style={{ background: "#F1F5F9", color: "#475569", padding: "8px 16px", borderRadius: 8, border: "1px solid #E2E8F0", fontWeight: 500, cursor: "pointer", fontSize: 14 }}
        >
          Tutup
        </button>
        <span style={{ color: "#64748B", fontSize: 13 }}>
          {assets.length} stiker akan dicetak ({Math.ceil(assets.length / 2)} baris)
        </span>
      </div>

      {assets.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>
          <p style={{ fontSize: 16 }}>Tidak ada aset yang dipilih untuk dicetak.</p>
          <p style={{ fontSize: 13, marginTop: 8 }}>Kembali ke halaman Inventaris Aset dan pilih aset terlebih dahulu.</p>
        </div>
      ) : (
        /* 2 stiker per baris — lebar fixed 88mm */
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
      )}
    </div>
  )
}
