"use client"

import React, { useEffect } from "react"
import { Navbar } from "./navbar"
import { PermissionGuard } from "./permission-guard"
import { useAuth } from "@/contexts/AuthContext"

interface DashboardLayoutProps {
  children: React.ReactNode
  title?: string
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { refetch } = useAuth()

  // Refresh permissions setiap kali user masuk ke dashboard section
  // Ini memastikan perubahan hak akses oleh admin langsung berlaku
  // tanpa perlu user logout-login
  useEffect(() => {
    refetch()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <Navbar />
      {/* pt-14 = tinggi navbar 56px */}
      <main className="pt-14">
        <div className="max-w-screen-2xl mx-auto p-5 lg:p-6">
          <PermissionGuard>
            {children}
          </PermissionGuard>
        </div>
      </main>
    </div>
  )
}
