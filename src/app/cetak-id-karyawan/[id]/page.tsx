"use client"

import { useEffect, useState, useRef } from "react"
import { useParams } from "next/navigation"
import { QRCodeSVG } from "qrcode.react"

interface Karyawan {
  id: number; nik: string; nama_karyawan: string; jabatan: string
  tanggal_lahir: string | null; tanggal_masuk_kerja: string | null
  no_hp: string | null; jkel: string; agama: string | null
  pendidikan_terakhir: string | null; status_karyawan: string | null
  nama_divisi: string | null; nama_subdivisi: string | null
  foto: string | null; alamat: string | null
}

function formatTgl(d: string | null) {
  if (!d) return "—"
  const dt = new Date(d)
  return dt.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()
}

function truncate(s: string | null, max: number) {
  if (!s) return "—"
  return s.length > max ? s.slice(0, max) + "..." : s
}

export default function CetakIdKaryawanPage() {
  const params   = useParams()
  const id       = params?.id as string
  const [data, setData]       = useState<Karyawan | null>(null)
  const [loading, setLoading] = useState(true)
  const didPrint              = useRef(false)

  useEffect(() => {
    if (!id) return
    fetch(`/api/karyawan/${id}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!loading && data && !didPrint.current) {
      didPrint.current = true
      setTimeout(() => window.print(), 400)
    }
  }, [loading, data])

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif", color: "#666" }}>
      Memuat data ID card...
    </div>
  )

  if (!data) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif", color: "#ef4444" }}>
      Data karyawan tidak ditemukan.
    </div>
  )

  const origin = typeof window !== "undefined" ? window.location.origin : ""

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Helvetica, Arial, sans-serif; background: #f3f4f6; color: #1f2937; }

        .no-print { padding: 16px; display: flex; gap: 12px; align-items: center; background: #fff; border-bottom: 1px solid #e5e7eb; }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff; }
          @page { size: A4 portrait; margin: 15mm; }
        }

        /* ── Card layout ──────────────────────────── */
        .sheet { display: flex; flex-wrap: wrap; gap: 8mm; padding: 16px; justify-content: center; }
        .card-wrap { display: flex; gap: 4mm; }

        .id-card {
          position: relative;
          width: 62mm;
          height: 86mm;
          border-radius: 8px;
          overflow: hidden;
          background: #ffffff;
          border: 1.5px solid #d1d5db;
          flex-shrink: 0;
        }

        /* ── GREEN TOP BAND ─────────────────────────── */
        .card-top {
          position: absolute; top: 0; left: 0; right: 0; height: 30mm;
          background: #166534;
          z-index: 1;
        }
        /* Decorative circles on top */
        .circle-a {
          position: absolute; top: -7mm; left: -10mm;
          width: 46mm; height: 24mm; border-radius: 50%;
          background: rgba(8,58,32,0.20); z-index: 2;
        }
        .circle-b {
          position: absolute; top: -2mm; right: -13mm;
          width: 42mm; height: 32mm; border-radius: 50%;
          background: rgba(8,58,32,0.24); z-index: 2;
        }
        /* White wave on bottom-right of header */
        .wave-right {
          position: absolute; right: -7mm; top: 19mm;
          width: 36mm; height: 14mm; border-radius: 18mm 18mm 0 0;
          background: #ffffff; z-index: 2;
        }
        /* Large white curve from right side */
        .curve {
          position: absolute; right: -24mm; top: 14mm;
          width: 60mm; height: 74mm; border-radius: 50%;
          background: #ffffff; z-index: 3;
        }

        /* ── LOGO TEXT (top-left of header) ─────── */
        .logo-area {
          position: absolute; top: 5mm; left: 5mm;
          z-index: 5; color: #ffffff; line-height: 1.1;
        }
        .logo-small { font-size: 6px; font-weight: bold; letter-spacing: 1px; text-transform: uppercase; }
        .logo-big   { font-size: 11px; font-weight: 900; text-transform: uppercase; }

        /* ── PHOTO (circle, straddling the header) ─ */
        .photo {
          position: absolute; top: 16mm; left: 50%; margin-left: -10.5mm;
          width: 21mm; height: 21mm; border-radius: 50%;
          border: 3px solid #ffffff; outline: 2px solid #166534;
          background: #f9fafb; overflow: hidden;
          display: flex; align-items: center; justify-content: center;
          font-size: 22px; font-weight: bold; color: #166534;
          z-index: 6;
        }
        .photo img { width: 21mm; height: 21mm; object-fit: cover; }

        /* ── FRONT CONTENT ──────────────────────── */
        .front-content {
          position: absolute; top: 41mm; left: 5mm; right: 5mm;
          text-align: center; z-index: 4;
        }
        .name     { font-size: 11px; font-weight: 800; color: #111827; line-height: 1.2; margin-bottom: 1mm; }
        .position { font-size: 8px;  color: #4b5563; line-height: 1.2; margin-bottom: 2mm; }

        .info-row { display: flex; align-items: flex-start; gap: 2mm; text-align: left; margin-bottom: 1.5mm; }
        .info-label { font-size: 7px; color: #374151; font-weight: bold; white-space: nowrap; width: 18mm; }
        .info-sep   { font-size: 7px; color: #6b7280; width: 2mm; }
        .info-val   { font-size: 7px; color: #111827; flex: 1; line-height: 1.25; }

        /* QR code di bawah nama */
        .qr-area {
          position: absolute; left: 5mm; bottom: 4mm;
          width: 10mm; height: 10mm;
          padding: 0.7mm;
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 2px;
          z-index: 6;
        }

        .front-footer {
          position: absolute; right: 5mm; bottom: 4mm;
          font-size: 6px; color: #6b7280; text-align: right; z-index: 4;
          line-height: 1.3;
        }

        /* ── BACK CARD ─────────────────────────── */
        .back-content {
          position: absolute; top: 31mm; left: 5mm; right: 5mm;
          z-index: 4;
        }
        .back-title {
          font-size: 9px; font-weight: 900; color: #166534;
          text-transform: uppercase; margin-bottom: 2mm;
        }
        .back-info-row { display: flex; align-items: flex-start; gap: 2mm; margin-bottom: 1.5mm; }
        .back-info-label { font-size: 7px; color: #374151; font-weight: bold; width: 22mm; white-space: nowrap; }
        .back-info-sep   { font-size: 7px; color: #6b7280; width: 2mm; }
        .back-info-val   { font-size: 7px; color: #111827; flex: 1; line-height: 1.25; word-break: break-word; }

        .back-footer {
          position: absolute; left: 5mm; right: 5mm; bottom: 3mm;
          text-align: center; font-size: 6px; color: #374151; z-index: 4; line-height: 1.3;
        }
        .back-footer strong { display: block; font-size: 7px; }
      `}</style>

      {/* Tombol kontrol (disembunyikan saat print) */}
      <div className="no-print">
        <button onClick={() => window.print()}
          style={{ padding: "8px 20px", background: "#166534", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}>
          🖨️ Cetak / Simpan PDF
        </button>
        <button onClick={() => window.close()}
          style={{ padding: "8px 16px", background: "#f1f5f9", color: "#333", border: "1px solid #cbd5e1", borderRadius: "6px", cursor: "pointer", fontSize: "13px" }}>
          Tutup
        </button>
        <span style={{ fontSize: 13, color: "#6b7280" }}>
          ID Card — {data.nama_karyawan}
        </span>
      </div>

      <div className="sheet">
        <div className="card-wrap">

          {/* ══ SISI DEPAN ══════════════════════════════ */}
          <div className="id-card">
            <div className="card-top" />
            <div className="circle-a" />
            <div className="circle-b" />
            <div className="wave-right" />
            <div className="curve" />

            {/* Logo */}
            <div className="logo-area">
              <div className="logo-small">Koperasi Konsumen</div>
              <div className="logo-big">PEDAMI</div>
            </div>

            {/* Foto / Inisial */}
            <div className="photo">
              {data.foto
                ? <img src={data.foto} alt={data.nama_karyawan} />
                : initials(data.nama_karyawan)}
            </div>

            {/* Konten depan */}
            <div className="front-content">
              <div className="name">{truncate(data.nama_karyawan, 32)}</div>
              <div className="position">{truncate(data.jabatan, 34)}</div>

              <div className="info-row">
                <span className="info-label">ID No</span>
                <span className="info-sep">:</span>
                <span className="info-val">{data.nik}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Tgl Lahir</span>
                <span className="info-sep">:</span>
                <span className="info-val">{formatTgl(data.tanggal_lahir)}</span>
              </div>
              <div className="info-row">
                <span className="info-label">No HP</span>
                <span className="info-sep">:</span>
                <span className="info-val">{truncate(data.no_hp, 20)}</span>
              </div>
            </div>

            {/* Footer depan */}
            <div className="front-footer">
              Kartu identitas resmi<br />
              Koperasi Konsumen Pedami
            </div>

            {/* QR Code → link ke info-karyawan */}
            <div className="qr-area">
              <QRCodeSVG
                value={`${origin}/info-karyawan/${data.id}`}
                size={33}
                bgColor="#ffffff"
                fgColor="#166534"
                level="M"
              />
            </div>
          </div>

          {/* ══ SISI BELAKANG ═══════════════════════════ */}
          <div className="id-card">
            <div className="card-top" />
            <div className="circle-a" />
            <div className="circle-b" />
            <div className="wave-right" />
            <div className="curve" />

            {/* Logo */}
            <div className="logo-area">
              <div className="logo-small">Koperasi Konsumen</div>
              <div className="logo-big">PEDAMI</div>
            </div>

            {/* Konten belakang */}
            <div className="back-content">
              <div className="back-title">Informasi Karyawan</div>

              <div className="back-info-row">
                <span className="back-info-label">Tgl Masuk</span>
                <span className="back-info-sep">:</span>
                <span className="back-info-val">{formatTgl(data.tanggal_masuk_kerja)}</span>
              </div>
              <div className="back-info-row">
                <span className="back-info-label">Divisi</span>
                <span className="back-info-sep">:</span>
                <span className="back-info-val">{data.nama_divisi ?? "—"}</span>
              </div>
              <div className="back-info-row">
                <span className="back-info-label">Sub Divisi</span>
                <span className="back-info-sep">:</span>
                <span className="back-info-val">{data.nama_subdivisi ?? "—"}</span>
              </div>
              <div className="back-info-row">
                <span className="back-info-label">Agama</span>
                <span className="back-info-sep">:</span>
                <span className="back-info-val">{data.agama ?? "—"}</span>
              </div>
              <div className="back-info-row">
                <span className="back-info-label">Pendidikan</span>
                <span className="back-info-sep">:</span>
                <span className="back-info-val">{data.pendidikan_terakhir ?? "—"}</span>
              </div>
              <div className="back-info-row">
                <span className="back-info-label">Status</span>
                <span className="back-info-sep">:</span>
                <span className="back-info-val">{data.status_karyawan ?? "—"}</span>
              </div>
            </div>

            {/* Footer belakang */}
            <div className="back-footer">
              <strong>Jika menemukan kartu ini, harap kembalikan ke:</strong>
              Koperasi Konsumen Pedami
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
