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
}

interface AuthContext {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
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
      const res = await fetch("/api/auth/me")
      if (res.ok) {
        const data = await res.json()
        setUser(data)
      } else {
        setUser(null)
      }
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchMe() }, [fetchMe])

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
      return { ok: true }
    } catch {
      return { ok: false, error: "Terjadi kesalahan jaringan" }
    }
  }

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" })
    setUser(null)
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
