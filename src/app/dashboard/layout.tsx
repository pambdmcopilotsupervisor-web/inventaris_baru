import type { Metadata } from "next"
import { DashboardLayout } from "@/components/layout/dashboard-layout"

export const metadata: Metadata = {
  title: "PEDAMI Inventaris",
  description: "Sistem Inventaris Koperasi Konsumen Pedami",
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>
}
