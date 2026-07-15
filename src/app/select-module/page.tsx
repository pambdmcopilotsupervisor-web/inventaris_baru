"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState, Suspense } from "react"
import { Archive, Users, LogOut, ClipboardCheck, Banknote, Lock } from "lucide-react"
import { MODULE_STATUS } from "@/lib/modules"

interface SessionUser {
  name: string; email: string; role: string | null; jabatan: string | null; nama_karyawan: string | null
}

function SelectModuleContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [user, setUser] = useState<SessionUser | null>(null)
  const [blockedMsg, setBlockedMsg] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.ok ? r.json() : null).then(d => setUser(d)).catch(() => {})
  }, [])

  // Tampilkan pesan jika diredirect karena modul nonaktif
  useEffect(() => {
    const blocked = searchParams.get("blocked")
    if (blocked) {
      const labels: Record<string, string> = {
        aset: "Modul Aset",
        sdm: "Modul SDM",
        kinerja: "Modul Kinerja",
        keuangan: "Modul Keuangan",
      }
      setBlockedMsg(`${labels[blocked] ?? "Modul"} sedang tidak aktif. Hubungi administrator.`)
      // Bersihkan query param dari URL tanpa reload
      window.history.replaceState(null, "", "/select-module")
    }
  }, [searchParams])

  const select = (modul: "aset" | "sdm" | "kinerja" | "keuangan") => {
    if (!MODULE_STATUS[modul]) return  // jangan bisa pilih modul nonaktif
    localStorage.setItem("pedami_modul", modul)
    router.push(
      modul === "aset" ? "/dashboard" :
      modul === "sdm" ? "/dashboard/sdm" :
      modul === "kinerja" ? "/dashboard/sdm/penilaian-kinerja/target" :
      "/dashboard/keuangan"
    )
  }

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/login")
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: "linear-gradient(135deg, #0F172A 0%, #1E293B 60%, #0F172A 100%)" }}
    >
      {/* Banner modul nonaktif */}
      {blockedMsg && (
        <div
          className="absolute top-5 left-1/2 -translate-x-1/2 flex items-center gap-2.5 rounded-xl px-5 py-3 text-sm font-medium shadow-lg"
          style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.35)", color: "#fca5a5", maxWidth: "90vw" }}
        >
          <Lock className="h-4 w-4 shrink-0" style={{ color: "#f87171" }} />
          {blockedMsg}
          <button
            onClick={() => setBlockedMsg(null)}
            className="ml-2 opacity-60 hover:opacity-100 cursor-pointer"
            style={{ color: "#f87171" }}
          >✕</button>
        </div>
      )}

      {/* Info login — pojok kanan atas */}
      {user && (
        <div className="absolute top-5 right-5 flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs font-semibold text-white leading-tight">{user.nama_karyawan ?? user.name}</p>
            <p className="text-[10px] leading-tight" style={{ color: "#94A3B8" }}>{user.jabatan ?? user.role ?? user.email}</p>
          </div>
          <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
            style={{ background: "rgba(30,64,175,0.5)", border: "1px solid rgba(59,130,246,0.4)" }}>
            {(user.nama_karyawan ?? user.name ?? "U").charAt(0).toUpperCase()}
          </div>
          <button onClick={handleLogout} title="Keluar"
            className="flex h-8 w-8 items-center justify-center rounded-full cursor-pointer transition-all"
            style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444" }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.3)")}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.15)")}
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-3 mb-4">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center"
            style={{ background: "#1E40AF" }}>
            <Archive className="h-6 w-6 text-white" />
          </div>
          <div className="text-left">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#94A3B8" }}>
              Koperasi Konsumen
            </p>
            <p className="text-xl font-black text-white">PEDAMI</p>
          </div>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Sistem Inventaris Aset, SDM, Kinerja &amp; Keuangan</h1>
        <p className="text-sm" style={{ color: "#94A3B8" }}>
          Pilih modul untuk melanjutkan
        </p>
      </div>

      {/* Module cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 w-full max-w-6xl">
        {/* ASET Module */}
        {MODULE_STATUS.aset && (
        <button
          onClick={() => select("aset")}
          className="group relative overflow-hidden rounded-2xl p-8 text-left transition-all duration-300 cursor-pointer"
          style={{
            background: "linear-gradient(135deg, #1E40AF 0%, #1D4ED8 100%)",
            border: "1px solid rgba(59, 130, 246, 0.3)",
            boxShadow: "0 8px 32px rgba(30, 64, 175, 0.4)",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-4px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 16px 48px rgba(30, 64, 175, 0.6)" }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 32px rgba(30, 64, 175, 0.4)" }}
        >
          <div className="absolute top-0 right-0 h-32 w-32 rounded-full opacity-10" style={{ background: "#60A5FA", transform: "translate(30%, -30%)" }} />
          <div className="absolute bottom-0 left-0 h-20 w-20 rounded-full opacity-10" style={{ background: "#93C5FD", transform: "translate(-30%, 30%)" }} />

          <div className="relative z-10">
            <div className="h-16 w-16 rounded-2xl flex items-center justify-center mb-5"
              style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(10px)" }}>
              <Archive className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-2xl font-black text-white mb-2">Modul Aset</h2>
            <p className="text-sm mb-5" style={{ color: "rgba(255,255,255,0.75)" }}>
              Kelola inventaris aset kantor dan kendaraan
            </p>
            <div className="flex flex-wrap gap-2">
              {["Dashboard", "Aset Kantor", "Kendaraan", "Laporan"].map(m => (
                <span key={m} className="text-xs px-2.5 py-1 rounded-full font-medium"
                  style={{ background: "rgba(255,255,255,0.15)", color: "#fff" }}>{m}</span>
              ))}
            </div>
          </div>
        </button>
        )}

        {/* SDM Module */}
        {MODULE_STATUS.sdm && (
        <button
          onClick={() => select("sdm")}
          className="group relative overflow-hidden rounded-2xl p-8 text-left transition-all duration-300 cursor-pointer"
          style={{
            background: "linear-gradient(135deg, #166534 0%, #15803D 100%)",
            border: "1px solid rgba(34, 197, 94, 0.3)",
            boxShadow: "0 8px 32px rgba(22, 101, 52, 0.4)",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-4px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 16px 48px rgba(22, 101, 52, 0.6)" }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 32px rgba(22, 101, 52, 0.4)" }}
        >
          <div className="absolute top-0 right-0 h-32 w-32 rounded-full opacity-10" style={{ background: "#4ADE80", transform: "translate(30%, -30%)" }} />
          <div className="absolute bottom-0 left-0 h-20 w-20 rounded-full opacity-10" style={{ background: "#86EFAC", transform: "translate(-30%, 30%)" }} />

          <div className="relative z-10">
            <div className="h-16 w-16 rounded-2xl flex items-center justify-center mb-5"
              style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(10px)" }}>
              <Users className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-2xl font-black text-white mb-2">Modul SDM</h2>
            <p className="text-sm mb-5" style={{ color: "rgba(255,255,255,0.75)" }}>
              Kelola data sumber daya manusia &amp; karyawan
            </p>
            <div className="flex flex-wrap gap-2">
              {["Data Karyawan", "Mutasi", "Pensiun", "Master Data"].map(m => (
                <span key={m} className="text-xs px-2.5 py-1 rounded-full font-medium"
                  style={{ background: "rgba(255,255,255,0.15)", color: "#fff" }}>{m}</span>
              ))}
            </div>
          </div>
        </button>
        )}

        {/* KINERJA Module */}
        {MODULE_STATUS.kinerja && (
        <button
          onClick={() => select("kinerja")}
          className="group relative overflow-hidden rounded-2xl p-8 text-left transition-all duration-300 cursor-pointer"
          style={{
            background: "linear-gradient(135deg, #7C2D12 0%, #EA580C 100%)",
            border: "1px solid rgba(251, 146, 60, 0.35)",
            boxShadow: "0 8px 32px rgba(124, 45, 18, 0.45)",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-4px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 16px 48px rgba(234, 88, 12, 0.55)" }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 32px rgba(124, 45, 18, 0.45)" }}
        >
          <div className="absolute top-0 right-0 h-32 w-32 rounded-full opacity-10" style={{ background: "#FDBA74", transform: "translate(30%, -30%)" }} />
          <div className="absolute bottom-0 left-0 h-20 w-20 rounded-full opacity-10" style={{ background: "#FED7AA", transform: "translate(-30%, 30%)" }} />

          <div className="relative z-10">
            <div className="h-16 w-16 rounded-2xl flex items-center justify-center mb-5"
              style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(10px)" }}>
              <ClipboardCheck className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-2xl font-black text-white mb-2">Modul Kinerja</h2>
            <p className="text-sm mb-5" style={{ color: "rgba(255,255,255,0.75)" }}>
              Kelola target kerja dan penilaian kinerja pegawai
            </p>
            <div className="flex flex-wrap gap-2">
              {["Target Kerja", "Penilaian", "Approval", "Rekap"].map(m => (
                <span key={m} className="text-xs px-2.5 py-1 rounded-full font-medium"
                  style={{ background: "rgba(255,255,255,0.15)", color: "#fff" }}>{m}</span>
              ))}
            </div>
          </div>
        </button>
        )}

        {/* KEUANGAN Module */}
        {MODULE_STATUS.keuangan && (
        <button
          onClick={() => select("keuangan")}
          className="group relative overflow-hidden rounded-2xl p-8 text-left transition-all duration-300 cursor-pointer"
          style={{
            background: "linear-gradient(135deg, #4C1D95 0%, #7C3AED 100%)",
            border: "1px solid rgba(167, 139, 250, 0.35)",
            boxShadow: "0 8px 32px rgba(76, 29, 149, 0.45)",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-4px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 16px 48px rgba(124, 58, 237, 0.55)" }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 32px rgba(76, 29, 149, 0.45)" }}
        >
          <div className="absolute top-0 right-0 h-32 w-32 rounded-full opacity-10" style={{ background: "#C4B5FD", transform: "translate(30%, -30%)" }} />
          <div className="absolute bottom-0 left-0 h-20 w-20 rounded-full opacity-10" style={{ background: "#DDD6FE", transform: "translate(-30%, 30%)" }} />

          <div className="relative z-10">
            <div className="h-16 w-16 rounded-2xl flex items-center justify-center mb-5"
              style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(10px)" }}>
              <Banknote className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-2xl font-black text-white mb-2">Modul Keuangan</h2>
            <p className="text-sm mb-5" style={{ color: "rgba(255,255,255,0.75)" }}>
              Akuntansi koperasi — PSAK 27 / ISAK 35
            </p>
            <div className="flex flex-wrap gap-2">
              {["Bagan Akun", "Jurnal", "Neraca", "SHU"].map(m => (
                <span key={m} className="text-xs px-2.5 py-1 rounded-full font-medium"
                  style={{ background: "rgba(255,255,255,0.15)", color: "#fff" }}>{m}</span>
              ))}
            </div>
          </div>
        </button>
        )}
      </div>

      <p className="mt-10 text-xs" style={{ color: "#475569" }}>
        Kamu bisa berpindah modul kapan saja melalui navbar
      </p>
    </div>
  )
}

export default function SelectModulePage() {
  return (
    <Suspense>
      <SelectModuleContent />
    </Suspense>
  )
}
