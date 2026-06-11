"use client"

import React from "react"
import { Navbar } from "./navbar"

interface DashboardLayoutProps {
  children: React.ReactNode
  title?: string
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <Navbar />
      {/* pt-14 = tinggi navbar 56px */}
      <main className="pt-14">
        <div className="max-w-screen-2xl mx-auto p-5 lg:p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
