"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { normalizeModulKey } from "@/lib/module-navigation"
import { AppLogo } from "@/components/layout/app-logo"

export default function LoginPage() {
  const router = useRouter()
  const { login } = useAuth()

  const [email, setEmail]       = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (!email || !password) { setError("Email dan password wajib diisi"); return }
    setLoading(true)
    try {
      const result = await login(email, password)
      if (result.ok) {
        const defaultModule = normalizeModulKey(result.defaultModule)

        if (defaultModule) {
          window.localStorage.setItem("pedami_modul", defaultModule)
        } else {
          window.localStorage.removeItem("pedami_modul")
        }

        router.push(result.redirectTo ?? "/select-module")
        router.refresh()
      } else {
        setError(result.error ?? "Login gagal")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex" style={{ background: "linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)" }}>

      {/* Left panel — branding */}
      <div className="hidden lg:flex flex-col justify-between w-[42%] p-10" style={{ background: "var(--sb-bg)" }}>
        <div className="flex items-center gap-3">
          <AppLogo className="h-8 w-8" priority />
          <span className="text-sm font-bold text-white tracking-wide">PEDAMI Inventaris</span>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-xs font-semibold mb-3" style={{ color: "var(--sb-label)" }}>SISTEM INVENTARIS</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Total Aset", desc: "Peralatan komputer & kantor" },
                { label: "Kendaraan", desc: "R2 & R4 Operasional/Dinas" },
                { label: "Karyawan", desc: "Data SDM terintegrasi" },
                { label: "Laporan", desc: "Rekap & tagihan sewa" },
              ].map((item) => (
                <div key={item.label} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)" }}>
                  <p className="text-sm font-bold text-white">{item.label}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: "var(--sb-label)" }}>{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-xl font-bold text-white leading-tight">
              Kelola inventaris aset dan<br />SDM secara terpadu
            </h2>
            <p className="text-sm mt-2" style={{ color: "var(--sb-label)" }}>
              Sistem manajemen inventaris terintegrasi untuk Koperasi Konsumen Pedami.
            </p>
          </div>
        </div>

        <p className="text-xs" style={{ color: "var(--sb-label)" }}>© 2026 Koperasi Konsumen Pedami</p>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <AppLogo className="h-8 w-8" priority />
            <span className="text-sm font-bold text-white">PEDAMI Inventaris</span>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-white">Selamat Datang</h1>
            <p className="text-sm mt-1" style={{ color: "#94A3B8" }}>Masuk untuk mengelola sistem inventaris</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Error */}
            {error && (
              <div className="rounded-xl px-4 py-3 text-sm font-medium" style={{ background: "rgba(220,38,38,0.15)", border: "1px solid rgba(220,38,38,0.3)", color: "#FCA5A5" }}>
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: "#CBD5E1" }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="email@pedami.id" required
                className="w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all duration-150"
                style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)" }}
                onFocus={e => (e.currentTarget.style.borderColor = "var(--primary)")}
                onBlur={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)")}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: "#CBD5E1" }}>Password</label>
              <div className="relative">
                <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required
                  className="w-full rounded-xl px-3 py-2.5 pr-10 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all duration-150"
                  style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)" }}
                  onFocus={e => (e.currentTarget.style.borderColor = "var(--primary)")}
                  onBlur={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)")}
                />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors duration-150 cursor-pointer"
                  style={{ color: "#64748B" }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "#94A3B8")}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "#64748B")}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all duration-150 shadow-sm hover:shadow-md active:scale-[0.98] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ background: "var(--primary)" }}
              onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = "var(--primary-hover)" }}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "var(--primary)"}
            >
              {loading ? "Memverifikasi..." : "Masuk ke Dashboard"}
            </button>
          </form>

          <p className="text-center text-xs mt-6" style={{ color: "#475569" }}>
            Butuh akses? Hubungi administrator sistem.
          </p>
        </div>
      </div>
    </div>
  )
}
