"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { ShieldOff } from "lucide-react"

/**
 * PermissionGuard — client component yang memproteksi akses langsung via URL.
 * Jika user mencoba mengakses halaman yang tidak ada di allowed_menus,
 * akan ditampilkan modal pemberitahuan lalu di-redirect ke /dashboard.
 */
export function PermissionGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    if (loading) return          // Tunggu user data selesai dimuat
    if (!user) return             // Belum login
    if (user.role === "admin") return  // Admin bypass semua cek
    if (!user.allowed_menus) return    // Tidak ada batasan → semua boleh

    // Cek apakah path saat ini diizinkan
    const isAllowed = user.allowed_menus.some(
      (allowedHref) =>
        pathname === allowedHref ||
        pathname.startsWith(allowedHref + "/")
    )

    // Path-path yang selalu diizinkan tanpa perlu ada di allowed_menus
    const isAlwaysAllowed = (
      pathname === "/dashboard" ||                          // Dashboard home (exact)
      pathname === "/dashboard/sdm" ||                      // SDM module dashboard
      pathname.startsWith("/dashboard/profile") ||          // Profile pages
      pathname.startsWith("/dashboard/pengaturan")          // Pengaturan pages
    )

    if (!isAllowed && !isAlwaysAllowed) {
      setShowModal(true)
      // Tidak auto-redirect — user harus klik tombol "Kembali"
    }
  }, [loading, user, pathname, router])

  const handleRedirect = () => {
    setShowModal(false)
    router.replace("/select-module")
  }

  return (
    <>
      {children}

      {/* Modal akses ditolak */}
      {showModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-2xl p-6 shadow-2xl text-center"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <div
              className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
              style={{ background: "var(--error-bg, #fef2f2)" }}
            >
              <ShieldOff className="h-7 w-7" style={{ color: "var(--error, #dc2626)" }} />
            </div>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-900)" }}>
              Akses Ditolak
            </h2>
            <p className="text-sm mb-4" style={{ color: "var(--text-subtle)" }}>
              Anda tidak memiliki hak akses ke menu ini. Silakan hubungi admin untuk mengatur hak akses Anda.
            </p>
            <button
              onClick={handleRedirect}
              className="w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: "var(--primary)" }}
            >
              Kembali ke Pilih Modul
            </button>
          </div>
        </div>
      )}
    </>
  )
}
