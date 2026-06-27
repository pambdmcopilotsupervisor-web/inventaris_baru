"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { DataTable, Column } from "@/components/ui/data-table"
import { ArrowLeft } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { getLoanDetail } from "@/actions/employee-loan"

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]

interface Payment { id: number; period_month: number; period_year: number; amount: string | number; created_at: string | null }
interface LoanDetail {
  id: number; employee_id: number; loan_number: string | null; title: string
  principal_amount: string | number; installment_amount: string | number; tenor_months: number
  start_month: number; start_year: number; status: "ACTIVE" | "COMPLETED" | "CANCELLED"; notes: string | null
  karyawans: { nama_karyawan: string; nik: string; jabatan: string }
  payments: Payment[]
}

const STATUS: Record<LoanDetail["status"], { label: string; variant: string }> = {
  ACTIVE: { label: "Berjalan", variant: "success" },
  COMPLETED: { label: "Lunas", variant: "info" },
  CANCELLED: { label: "Dibatalkan", variant: "secondary" },
}

interface ScheduleRow { no: number; periode: string; type: "paid" | "projected"; amount: number; saldo: number }

export default function LoanDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const loanId = Number(params.id)

  const [loan, setLoan] = useState<LoanDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    getLoanDetail(loanId).then((res) => {
      if (!active) return
      if (res.success) setLoan(res.data as unknown as LoanDetail)
      else setError(res.error)
      setLoading(false)
    })
    return () => { active = false }
  }, [loanId])

  const calc = useMemo(() => {
    if (!loan) return null
    const principal = Number(loan.principal_amount)
    const installment = Number(loan.installment_amount)
    const paid = loan.payments.reduce((s, p) => s + Number(p.amount), 0)
    const remaining = Math.max(0, principal - paid)
    const progress = principal > 0 ? Math.min(100, Math.round((paid / principal) * 100)) : 0

    // Jadwal: pembayaran nyata (paid) + proyeksi sisa cicilan.
    const schedule: ScheduleRow[] = []
    const sortedPays = [...loan.payments].sort((a, b) => (a.period_year - b.period_year) || (a.period_month - b.period_month))
    let saldo = principal
    let no = 0
    for (const p of sortedPays) {
      saldo = Math.max(0, saldo - Number(p.amount))
      schedule.push({ no: ++no, periode: `${MONTHS[p.period_month - 1]} ${p.period_year}`, type: "paid", amount: Number(p.amount), saldo })
    }
    // Proyeksi sisa (mulai bulan setelah pembayaran terakhir / start period).
    if (loan.status === "ACTIVE" && remaining > 0 && installment > 0) {
      let m: number, y: number
      if (sortedPays.length > 0) {
        const last = sortedPays[sortedPays.length - 1]
        m = last.period_month; y = last.period_year
      } else {
        m = loan.start_month - 1; y = loan.start_year
        if (m < 1) { m = 12; y -= 1 }
      }
      let proj = remaining
      let guard = 0
      while (proj > 0 && guard < 240) {
        guard++
        m++; if (m > 12) { m = 1; y++ }
        const amt = Math.min(installment, proj)
        proj = Math.max(0, proj - amt)
        schedule.push({ no: ++no, periode: `${MONTHS[m - 1]} ${y}`, type: "projected", amount: amt, saldo: proj })
      }
    }
    return { principal, installment, paid, remaining, progress, schedule }
  }, [loan])

  if (loading) return <div className="p-8 text-sm" style={{ color: "var(--text-subtle)" }}>Memuat detail pinjaman…</div>
  if (error || !loan || !calc) return <div className="p-8 text-sm" style={{ color: "var(--danger)" }}>{error ?? "Pinjaman tidak ditemukan"}</div>

  const columns: Column<ScheduleRow>[] = [
    { key: "no", header: "#", cell: (r) => r.no },
    { key: "periode", header: "Periode", cell: (r) => r.periode },
    { key: "type", header: "Status", cell: (r) => r.type === "paid" ? <Badge variant="success">Dipotong</Badge> : <Badge variant="secondary">Proyeksi</Badge> },
    { key: "amount", header: "Cicilan", cell: (r) => <span className="font-mono">{formatCurrency(r.amount)}</span> },
    { key: "saldo", header: "Sisa Pokok", cell: (r) => <span className="font-mono" style={{ color: r.saldo > 0 ? "var(--text-700)" : "var(--success)" }}>{formatCurrency(r.saldo)}</span> },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => router.push("/dashboard/payroll/loans")}><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: "var(--text-900)" }}>
            {loan.title} <Badge variant={STATUS[loan.status].variant as never}>{STATUS[loan.status].label}</Badge>
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
            {loan.karyawans.nama_karyawan} · {loan.karyawans.jabatan}{loan.loan_number ? ` · ${loan.loan_number}` : ""} · mulai {MONTHS[loan.start_month - 1]} {loan.start_year}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><p className="text-xs" style={{ color: "var(--text-subtle)" }}>Pokok Pinjaman</p><p className="text-xl font-bold font-mono mt-0.5">{formatCurrency(calc.principal)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs" style={{ color: "var(--text-subtle)" }}>Cicilan / Bulan</p><p className="text-xl font-bold font-mono mt-0.5">{formatCurrency(calc.installment)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs" style={{ color: "var(--text-subtle)" }}>Terbayar</p><p className="text-xl font-bold font-mono mt-0.5" style={{ color: "var(--success)" }}>{formatCurrency(calc.paid)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs" style={{ color: "var(--text-subtle)" }}>Sisa</p><p className="text-xl font-bold font-mono mt-0.5" style={{ color: calc.remaining > 0 ? "var(--danger)" : "var(--success)" }}>{formatCurrency(calc.remaining)}</p></CardContent></Card>
      </div>

      {/* Progress */}
      <div>
        <div className="flex justify-between text-xs mb-1" style={{ color: "var(--text-subtle)" }}>
          <span>Progres pelunasan</span><span>{calc.progress}%</span>
        </div>
        <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "var(--surface-hover)" }}>
          <div className="h-full rounded-full" style={{ width: `${calc.progress}%`, background: "var(--success)" }} />
        </div>
      </div>

      {loan.notes && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--surface-hover)", color: "var(--text-muted)" }}>{loan.notes}</div>
      )}

      <div>
        <p className="text-sm font-semibold mb-2" style={{ color: "var(--text-900)" }}>Jadwal & Riwayat Cicilan</p>
        <DataTable
          data={calc.schedule as unknown as Record<string, unknown>[]}
          columns={columns as unknown as Column<Record<string, unknown>>[]}
          emptyMessage="Belum ada potongan cicilan"
        />
      </div>
    </div>
  )
}
