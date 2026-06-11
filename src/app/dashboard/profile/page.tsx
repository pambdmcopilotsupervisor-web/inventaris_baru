"use client"

import React, { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { TextField } from "@/components/ui/form-field"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/contexts/AuthContext"
import { User, Key, Save, CheckCircle } from "lucide-react"

export default function ProfilePage() {
  const { user, refetch } = useAuth()

  const [editName, setEditName]   = useState(false)
  const [nameVal, setNameVal]     = useState(user?.name ?? "")
  const [saving, setSaving]       = useState(false)
  const [nameSuccess, setNameSuccess] = useState(false)

  const [oldPw, setOldPw]         = useState("")
  const [newPw, setNewPw]         = useState("")
  const [confirmPw, setConfirmPw] = useState("")
  const [pwSaving, setPwSaving]   = useState(false)
  const [pwError, setPwError]     = useState("")
  const [pwSuccess, setPwSuccess] = useState(false)

  const handleSaveName = async () => {
    if (!nameVal.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/users/${user?.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameVal, email: user?.email, role: user?.role, karyawan_id: user?.karyawan_id }),
      })
      if (res.ok) {
        setEditName(false)
        setNameSuccess(true)
        await refetch()
        setTimeout(() => setNameSuccess(false), 3000)
      }
    } finally { setSaving(false) }
  }

  const handleChangePassword = async () => {
    setPwError("")
    if (!oldPw || !newPw || !confirmPw) { setPwError("Semua field wajib diisi"); return }
    if (newPw.length < 6) { setPwError("Password baru minimal 6 karakter"); return }
    if (newPw !== confirmPw) { setPwError("Konfirmasi password tidak cocok"); return }

    setPwSaving(true)
    try {
      // Verifikasi password lama dulu dengan mencoba login
      const verifyRes = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user?.email, password: oldPw }),
      })
      if (!verifyRes.ok) { setPwError("Password lama salah"); return }

      // Ganti password
      const res = await fetch(`/api/users/${user?.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: user?.name, email: user?.email, role: user?.role, karyawan_id: user?.karyawan_id, password: newPw }),
      })
      if (res.ok) {
        setOldPw(""); setNewPw(""); setConfirmPw("")
        setPwSuccess(true)
        setTimeout(() => setPwSuccess(false), 4000)
      } else {
        setPwError("Gagal mengganti password")
      }
    } finally { setPwSaving(false) }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Profil Saya</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Kelola informasi akun dan keamanan</p>
      </div>

      {/* Info Akun */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <User className="h-4 w-4" style={{ color: "var(--primary)" }} />Informasi Akun
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Avatar / Inisial */}
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full flex items-center justify-center text-2xl font-bold text-white"
              style={{ background: "var(--primary)" }}>
              {(user?.nama_karyawan ?? user?.name ?? "?").charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-sm" style={{ color: "var(--text-900)" }}>
                {user?.nama_karyawan ?? user?.name ?? "—"}
              </p>
              <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{user?.email ?? "—"}</p>
              <div className="flex gap-2 mt-1.5">
                {user?.role && <Badge variant="secondary" className="text-[10px] uppercase">{user.role}</Badge>}
                {user?.jabatan && <Badge variant="outline" className="text-[10px]">{user.jabatan}</Badge>}
              </div>
            </div>
          </div>

          {/* Edit Nama */}
          <div className="pt-2" style={{ borderTop: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Nama Tampilan</span>
              {!editName && <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setEditName(true); setNameVal(user?.name ?? "") }}>Edit</Button>}
            </div>
            {editName ? (
              <div className="flex gap-2">
                <TextField label="Nama Baru" value={nameVal} onChange={e => setNameVal(e.target.value)} className="flex-1" />
                <Button size="sm" onClick={handleSaveName} disabled={saving}>
                  <Save className="h-3.5 w-3.5 mr-1" />{saving ? "..." : "Simpan"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEditName(false)}>Batal</Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium" style={{ color: "var(--text-900)" }}>{user?.name ?? "—"}</p>
                {nameSuccess && <CheckCircle className="h-4 w-4" style={{ color: "var(--success)" }} />}
              </div>
            )}
          </div>

          {/* Info read-only */}
          <div className="grid grid-cols-2 gap-4 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
            {[
              { label: "Email", value: user?.email },
              { label: "Role", value: user?.role },
              { label: "Jabatan", value: user?.jabatan },
              { label: "Nama Karyawan", value: user?.nama_karyawan },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: "var(--text-subtle)" }}>{label}</p>
                <p className="text-sm" style={{ color: "var(--text-900)" }}>{value ?? "—"}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Ganti Password */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Key className="h-4 w-4" style={{ color: "var(--warning)" }} />Ganti Password
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {pwSuccess && (
            <div className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--success-bg)", color: "var(--success)" }}>
              <CheckCircle className="h-4 w-4 shrink-0" />Password berhasil diubah!
            </div>
          )}
          {pwError && (
            <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{pwError}</div>
          )}
          <TextField label="Password Lama" type="password" value={oldPw} onChange={e => setOldPw(e.target.value)} placeholder="Masukkan password lama" />
          <TextField label="Password Baru" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Minimal 6 karakter" />
          <TextField label="Konfirmasi Password Baru" type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Ulangi password baru" />
          <div className="flex justify-end">
            <Button onClick={handleChangePassword} disabled={pwSaving}>
              <Key className="h-3.5 w-3.5 mr-1.5" />
              {pwSaving ? "Menyimpan..." : "Ganti Password"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
