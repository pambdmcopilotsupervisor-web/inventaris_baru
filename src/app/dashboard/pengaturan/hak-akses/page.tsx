"use client"

import React, { useState, useEffect, useCallback } from "react"
import { Users, Shield, Check, Save, Trash2, AlertCircle, ChevronDown, ChevronRight } from "lucide-react"

/* ─────────────────────────────────────────────────────────────────
   Daftar semua menu yang tersedia — harus sinkron dengan navbar.tsx
   ───────────────────────────────────────────────────────────────── */
const MENU_GROUPS = [
  {
    group: "Karyawan",
    items: [
      { label: "Data Karyawan",    href: "/dashboard/master-data/karyawan" },
      { label: "Mutasi Karyawan",  href: "/dashboard/transaksi/mutasi-karyawan" },
      { label: "Pensiun Karyawan", href: "/dashboard/transaksi/pensiun-karyawan" },
      { label: "Rekap Karyawan",   href: "/dashboard/laporan/rekap-karyawan" },
    ],
  },
  {
    group: "Jadwal Kerja",
    items: [
      { label: "Master Shift",  href: "/dashboard/sdm/shift" },
      { label: "Jadwal Kerja",  href: "/dashboard/sdm/jadwal-shift" },
      { label: "Hari Libur",    href: "/dashboard/sdm/hari-libur" },
    ],
  },
  {
    group: "Absensi",
    items: [
      { label: "Monitoring Absensi",     href: "/dashboard/sdm/absensi" },
      { label: "Absensi Bulanan Pegawai",href: "/dashboard/sdm/absensi/bulanan" },
      { label: "Anomali Absensi",        href: "/dashboard/sdm/absensi/anomali" },
      { label: "Karyawan Tanpa Jadwal",  href: "/dashboard/sdm/absensi/tanpa-jadwal" },
      { label: "Lokasi Absensi Mobile",  href: "/dashboard/sdm/absensi/lokasi-config" },
      { label: "Rekap Absensi",          href: "/dashboard/sdm/absensi/rekap" },
    ],
  },
  {
    group: "Pengajuan Cuti",
    items: [
      { label: "Pengajuan Cuti", href: "/dashboard/sdm/pengajuan-cuti" },
      { label: "Approval Cuti",  href: "/dashboard/sdm/approval-cuti" },
      { label: "Jenis Cuti",     href: "/dashboard/sdm/jenis-cuti" },
      { label: "Saldo Cuti",     href: "/dashboard/sdm/saldo-cuti" },
    ],
  },
  {
    group: "Pengajuan Izin",
    items: [
      { label: "Pengajuan Izin", href: "/dashboard/sdm/pengajuan-izin" },
      { label: "Approval Izin",  href: "/dashboard/sdm/approval-izin" },
      { label: "Jenis Izin",     href: "/dashboard/sdm/jenis-izin" },
    ],
  },
  {
    group: "Pengajuan Sakit",
    items: [
      { label: "Pengajuan Sakit", href: "/dashboard/sdm/pengajuan-sakit" },
      { label: "Approval Sakit",  href: "/dashboard/sdm/approval-sakit" },
    ],
  },
  {
    group: "Lembur",
    items: [
      { label: "Pengajuan Lembur", href: "/dashboard/sdm/pengajuan-lembur" },
      { label: "Approval Lembur",  href: "/dashboard/sdm/approval-lembur" },
      { label: "Setting Lembur",   href: "/dashboard/sdm/overtime-settings" },
    ],
  },
  {
    group: "Aset Kantor",
    items: [
      { label: "Inventaris Aset",     href: "/dashboard/transaksi/aset" },
      { label: "Mutasi Aset",         href: "/dashboard/transaksi/mutasi-aset" },
      { label: "Permohonan Disposal", href: "/dashboard/transaksi/disposal" },
      { label: "Service Aset",        href: "/dashboard/transaksi/service-ac" },
    ],
  },
  {
    group: "Kendaraan",
    items: [
      { label: "Data R2/R4",        href: "/dashboard/transaksi/kendaraan" },
      { label: "Kontrak Sewa",      href: "/dashboard/transaksi/kontrak" },
      { label: "Mutasi R2/R4",      href: "/dashboard/transaksi/mutasi-kendaraan" },
      { label: "Servis Kendaraan",  href: "/dashboard/transaksi/servis-kendaraan" },
      { label: "Pembayaran Sewa",   href: "/dashboard/transaksi/pembayaran-kendaraan" },
      { label: "Penjualan R2/R4",   href: "/dashboard/transaksi/penjualan-kendaraan" },
    ],
  },
  {
    group: "Laporan",
    items: [
      { label: "Tagihan Sewa Kendaraan", href: "/dashboard/laporan/tagihan-sewa" },
      { label: "Pendapatan Aset",        href: "/dashboard/laporan/pendapatan-aset" },
    ],
  },
  {
    group: "Master Data",
    items: [
      { label: "Divisi",     href: "/dashboard/master-data/divisi" },
      { label: "Sub Divisi", href: "/dashboard/master-data/subdivisi" },
      { label: "Ruangan",    href: "/dashboard/master-data/ruangan" },
      { label: "Users",      href: "/dashboard/master-data/users" },
    ],
  },
]

interface UserItem {
  id: number
  name: string
  email: string | null
  role: string | null
  nama_karyawan?: string | null
  jabatan?: string | null
}

export default function HakAksesPage() {
  const [users, setUsers] = useState<UserItem[]>([])
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [selectedUserRole, setSelectedUserRole] = useState<string | null>(null)
  const [checkedHrefs, setCheckedHrefs] = useState<Set<string>>(new Set())
  const [hasRestriction, setHasRestriction] = useState(false) // apakah user punya batasan aktif
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loadingPerms, setLoadingPerms] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null)

  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3000)
  }

  // Load daftar users
  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((data: UserItem[]) => setUsers(data))
      .catch(() => showToast("error", "Gagal memuat daftar user"))
      .finally(() => setLoadingUsers(false))
  }, [])

  // Load permissions saat user dipilih
  const loadPerms = useCallback(async (userId: number, role: string | null) => {
    setLoadingPerms(true)
    setCheckedHrefs(new Set())
    setHasRestriction(false)
    try {
      const res = await fetch(`/api/admin/menu-access?userId=${userId}`)
      if (!res.ok) throw new Error()
      const hrefs: string[] = await res.json()
      if (hrefs.length > 0) {
        setCheckedHrefs(new Set(hrefs))
        setHasRestriction(true)
      } else {
        // Cek apakah ada record di DB (batasan semua menu) vs belum ada pengaturan
        // Jika response kosong dan role bukan admin, mungkin belum diset atau semua diblokir
        // Kita tampilkan semua tercentang jika belum ada pengaturan
        if (role !== "admin") {
          // Cek apakah memang belum diset (semua tampil) atau diset kosong (semua diblokir)
          // Karena API return [] untuk kedua kasus, kita defaultkan ke "semua" jika belum ada
          const allHrefs = MENU_GROUPS.flatMap((g) => g.items.map((i) => i.href))
          setCheckedHrefs(new Set(allHrefs))
          setHasRestriction(false)
        }
      }
    } catch {
      showToast("error", "Gagal memuat hak akses menu")
    } finally {
      setLoadingPerms(false)
    }
  }, [])

  const handleSelectUser = (userId: number) => {
    const user = users.find((u) => u.id === userId)
    setSelectedUserId(userId)
    setSelectedUserRole(user?.role ?? null)
    if (user?.role === "admin") {
      const allHrefs = MENU_GROUPS.flatMap((g) => g.items.map((i) => i.href))
      setCheckedHrefs(new Set(allHrefs))
      setHasRestriction(false)
      setLoadingPerms(false)
    } else {
      loadPerms(userId, user?.role ?? null)
    }
  }

  const toggleHref = (href: string) => {
    setCheckedHrefs((prev) => {
      const next = new Set(prev)
      if (next.has(href)) next.delete(href)
      else next.add(href)
      return next
    })
  }

  const toggleGroup = (group: string) => {
    const groupHrefs = MENU_GROUPS.find((g) => g.group === group)?.items.map((i) => i.href) ?? []
    const allChecked = groupHrefs.every((h) => checkedHrefs.has(h))
    setCheckedHrefs((prev) => {
      const next = new Set(prev)
      if (allChecked) {
        groupHrefs.forEach((h) => next.delete(h))
      } else {
        groupHrefs.forEach((h) => next.add(h))
      }
      return next
    })
  }

  const selectAll = () => {
    const allHrefs = MENU_GROUPS.flatMap((g) => g.items.map((i) => i.href))
    setCheckedHrefs(new Set(allHrefs))
  }

  const clearAll = () => setCheckedHrefs(new Set())

  const handleRemoveRestriction = async () => {
    if (!selectedUserId) return
    if (!confirm("Hapus semua batasan menu? User ini akan melihat semua menu.")) return
    setSaving(true)
    try {
      await fetch(`/api/admin/menu-access?userId=${selectedUserId}`, { method: "DELETE" })
      setHasRestriction(false)
      const allHrefs = MENU_GROUPS.flatMap((g) => g.items.map((i) => i.href))
      setCheckedHrefs(new Set(allHrefs))
      showToast("success", "Batasan menu dihapus. User sekarang dapat mengakses semua menu.")
    } catch {
      showToast("error", "Gagal menghapus batasan")
    } finally {
      setSaving(false)
    }
  }

  const handleSave = async () => {
    if (!selectedUserId) return
    setSaving(true)
    try {
      const menuHrefs = Array.from(checkedHrefs)
      const res = await fetch("/api/admin/menu-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId, menuHrefs }),
      })
      if (!res.ok) throw new Error()
      setHasRestriction(menuHrefs.length > 0)
      showToast("success", `Hak akses disimpan. ${menuHrefs.length} menu diizinkan. User perlu login ulang agar berlaku.`)
    } catch {
      showToast("error", "Gagal menyimpan hak akses")
    } finally {
      setSaving(false)
    }
  }

  const toggleGroupOpen = (group: string) =>
    setOpenGroups((prev) => ({ ...prev, [group]: !(prev[group] ?? true) }))

  const selectedUser = users.find((u) => u.id === selectedUserId)
  const isAdmin = selectedUserRole === "admin"

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "var(--primary-light)" }}>
          <Shield className="h-5 w-5" style={{ color: "var(--primary)" }} />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Hak Akses Menu</h1>
          <p className="text-sm" style={{ color: "var(--text-subtle)" }}>
            Atur menu apa saja yang dapat diakses oleh setiap user
          </p>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-xl px-4 py-3 shadow-lg text-sm font-medium text-white"
          style={{ background: toast.type === "success" ? "var(--success)" : "var(--error)" }}
        >
          {toast.type === "success" ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Kolom kiri: pilih user */}
        <div className="lg:col-span-1">
          <div className="rounded-2xl border p-4 space-y-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-4 w-4" style={{ color: "var(--primary)" }} />
              <span className="font-semibold text-sm" style={{ color: "var(--text-900)" }}>Pilih User</span>
            </div>

            {loadingUsers ? (
              <p className="text-sm" style={{ color: "var(--text-subtle)" }}>Memuat...</p>
            ) : (
              <div className="space-y-1 max-h-[480px] overflow-y-auto">
                {users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => handleSelectUser(u.id)}
                    className="w-full text-left rounded-xl px-3 py-2.5 transition-all duration-150"
                    style={{
                      background: selectedUserId === u.id ? "var(--primary-light)" : "transparent",
                      color: selectedUserId === u.id ? "var(--primary)" : "var(--text-700)",
                    }}
                    onMouseEnter={(e) => {
                      if (selectedUserId !== u.id) (e.currentTarget as HTMLElement).style.background = "var(--surface-muted)"
                    }}
                    onMouseLeave={(e) => {
                      if (selectedUserId !== u.id) (e.currentTarget as HTMLElement).style.background = "transparent"
                    }}
                  >
                    <p className="text-sm font-medium truncate">{u.name}</p>
                    <p className="text-xs truncate" style={{ color: selectedUserId === u.id ? "var(--primary)" : "var(--text-subtle)" }}>
                      {u.role} {u.nama_karyawan ? `— ${u.nama_karyawan}` : ""}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Kolom kanan: pengaturan menu */}
        <div className="lg:col-span-2">
          {!selectedUserId ? (
            <div className="rounded-2xl border p-12 text-center" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              <Shield className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm" style={{ color: "var(--text-subtle)" }}>Pilih user di sebelah kiri untuk mengatur hak akses menu</p>
            </div>
          ) : (
            <div className="rounded-2xl border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              {/* Header card */}
              <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
                <div>
                  <p className="font-semibold text-sm" style={{ color: "var(--text-900)" }}>{selectedUser?.name}</p>
                  <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
                    {selectedUser?.email} · {selectedUser?.role}
                    {hasRestriction && !isAdmin && (
                      <span className="ml-2 text-amber-600 font-medium">• Batasan aktif</span>
                    )}
                    {!hasRestriction && !isAdmin && (
                      <span className="ml-2 text-green-600 font-medium">• Semua menu aktif</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!isAdmin && hasRestriction && (
                    <button
                      onClick={handleRemoveRestriction}
                      disabled={saving}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors"
                      style={{ borderColor: "var(--error)", color: "var(--error)" }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Hapus Batasan
                    </button>
                  )}
                  {!isAdmin && (
                    <button
                      onClick={handleSave}
                      disabled={saving || loadingPerms}
                      className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-medium text-white transition-opacity"
                      style={{ background: "var(--primary)", opacity: saving ? 0.6 : 1 }}
                    >
                      <Save className="h-3.5 w-3.5" />
                      {saving ? "Menyimpan..." : "Simpan"}
                    </button>
                  )}
                </div>
              </div>

              {isAdmin ? (
                <div className="px-5 py-8 text-center">
                  <Shield className="h-8 w-8 mx-auto mb-2" style={{ color: "var(--primary)" }} />
                  <p className="text-sm font-medium" style={{ color: "var(--text-700)" }}>User dengan role Admin</p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-subtle)" }}>Admin selalu memiliki akses ke semua menu dan tidak dapat dibatasi.</p>
                </div>
              ) : loadingPerms ? (
                <div className="px-5 py-8 text-center">
                  <p className="text-sm" style={{ color: "var(--text-subtle)" }}>Memuat hak akses...</p>
                </div>
              ) : (
                <div className="p-4 space-y-2">
                  {/* Quick action buttons */}
                  <div className="flex items-center gap-2 mb-3 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
                    <span className="text-xs" style={{ color: "var(--text-subtle)" }}>
                      {checkedHrefs.size} dari {MENU_GROUPS.flatMap((g) => g.items).length} menu dipilih
                    </span>
                    <div className="flex-1" />
                    <button onClick={selectAll} className="text-xs px-2.5 py-1 rounded-lg border transition-colors" style={{ borderColor: "var(--border)", color: "var(--text-700)" }}>
                      Pilih Semua
                    </button>
                    <button onClick={clearAll} className="text-xs px-2.5 py-1 rounded-lg border transition-colors" style={{ borderColor: "var(--border)", color: "var(--text-700)" }}>
                      Kosongkan
                    </button>
                  </div>

                  {/* Menu groups dengan checkbox */}
                  {MENU_GROUPS.map((group) => {
                    const groupHrefs = group.items.map((i) => i.href)
                    const checkedCount = groupHrefs.filter((h) => checkedHrefs.has(h)).length
                    const allChecked = checkedCount === groupHrefs.length
                    const isOpen = openGroups[group.group] ?? true

                    return (
                      <div key={group.group} className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
                        {/* Group header */}
                        <button
                          onClick={() => toggleGroupOpen(group.group)}
                          className="w-full flex items-center justify-between px-4 py-2.5 transition-colors"
                          style={{ background: "var(--surface-muted)" }}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded accent-current cursor-pointer"
                              style={{ accentColor: "var(--primary)" }}
                              checked={allChecked}
                              onChange={() => toggleGroup(group.group)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <span className="text-sm font-semibold" style={{ color: "var(--text-900)" }}>{group.group}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: allChecked ? "var(--primary-light)" : "var(--surface)", color: allChecked ? "var(--primary)" : "var(--text-subtle)" }}>
                              {checkedCount}/{groupHrefs.length}
                            </span>
                          </div>
                          {isOpen ? <ChevronDown className="h-4 w-4" style={{ color: "var(--text-subtle)" }} /> : <ChevronRight className="h-4 w-4" style={{ color: "var(--text-subtle)" }} />}
                        </button>

                        {/* Menu items */}
                        {isOpen && (
                          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                            {group.items.map((item) => (
                              <label
                                key={item.href}
                                className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors"
                                style={{ background: checkedHrefs.has(item.href) ? "var(--primary-light)" : "transparent" }}
                                onMouseEnter={(e) => {
                                  if (!checkedHrefs.has(item.href)) (e.currentTarget as HTMLElement).style.background = "var(--surface-muted)"
                                }}
                                onMouseLeave={(e) => {
                                  (e.currentTarget as HTMLElement).style.background = checkedHrefs.has(item.href) ? "var(--primary-light)" : "transparent"
                                }}
                              >
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded cursor-pointer"
                                  style={{ accentColor: "var(--primary)" }}
                                  checked={checkedHrefs.has(item.href)}
                                  onChange={() => toggleHref(item.href)}
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm" style={{ color: checkedHrefs.has(item.href) ? "var(--primary)" : "var(--text-700)" }}>
                                    {item.label}
                                  </p>
                                  <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{item.href}</p>
                                </div>
                                {checkedHrefs.has(item.href) && <Check className="h-4 w-4 shrink-0" style={{ color: "var(--primary)" }} />}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
