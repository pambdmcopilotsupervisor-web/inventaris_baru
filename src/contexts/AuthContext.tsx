"use client"

import React, { createContext, useContext, useState, useEffect, useCallback } from "react"

export interface AuthUser {
  id: number
  name: string
  email: string
  role: string | null
  karyawan_id: number | null
  jabatan: string | null
  nama_karyawan: string | null
  divisi_id?: number | null
  nama_divisi?: string | null
  /** Daftar menu_href yang diizinkan. null = semua menu tampil. */
  allowed_menus?: string[] | null
}

interface AuthContext {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string; redirectTo?: string; defaultModule?: string | null }>
  logout: () => Promise<void>
  refetch: () => void
}

const AuthCtx = createContext<AuthContext>({
  user: null, loading: true,
  login: async () => ({ ok: false }),
  logout: async () => {},
  refetch: () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchMe = useCallback(async () => {
    try {
      // Refresh allowed_menus langsung dari DB → hasilnya dipakai sebagai override
      // agar tidak perlu menunggu session round-trip (mencegah flash "semua menu")
      let freshAllowedMenus: string[] | null | undefined = undefined

      try {
        const refreshRes = await fetch("/api/auth/refresh-menus", { method: "POST" })
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json()
          freshAllowedMenus = refreshData.allowed_menus // null = semua tampil, array = dibatasi
        }
      } catch { /* abaikan jika endpoint belum ada */ }

      const res = await fetch("/api/auth/me")
      if (res.ok) {
        const data = await res.json()
        // Override allowed_menus dengan data fresh dari DB jika tersedia
        setUser({
          ...data,
          allowed_menus: freshAllowedMenus !== undefined ? freshAllowedMenus : (data.allowed_menus ?? null),
        })
      } else {
        setUser(null)
      }
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchMe()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [fetchMe])

  const login = async (email: string, password: string) => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) return { ok: false, error: data.error ?? "Login gagal" }
      setUser(data)
      return { ok: true, redirectTo: data.redirectTo, defaultModule: data.defaultModule }
    } catch {
      return { ok: false, error: "Terjadi kesalahan jaringan" }
    }
  }

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" })
    setUser(null)
    window.localStorage.removeItem("pedami_modul")
    window.location.href = "/login"
  }

  return (
    <AuthCtx.Provider value={{ user, loading, login, logout, refetch: fetchMe }}>
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuth() {
  return useContext(AuthCtx)
}

// Helper: apakah user bisa verifikasi sebagai Manager?
export function canVerifManager(user: AuthUser | null): boolean {
  return user?.jabatan === "Manager"
}

// Helper: apakah user bisa verifikasi sebagai Ketua?
export function canVerifKetua(user: AuthUser | null): boolean {
  return user?.jabatan === "Ketua"
}

// Helper: apakah user adalah admin?
export function isAdmin(user: AuthUser | null): boolean {
  return user?.role === "admin"
}
