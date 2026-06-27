"use client"

import React, { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Plus, Pencil, Power, RefreshCw, ChevronDown, ChevronRight } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { getDeductionRules, toggleDeductionRule } from "@/actions/attendance-deduction-rule"
import { getSalaryComponents } from "@/actions/salary-component"
import { DeductionRuleForm, type DeductionRuleRow } from "@/components/payroll/DeductionRuleForm"
import type { SalaryComponentRow } from "@/components/payroll/SalaryComponentForm"

const TRIGGER_LABEL: Record<DeductionRuleRow["trigger_type"], string> = {
  ALFA: "Alfa", LATE: "Terlambat", EARLY_LEAVE: "Pulang Cepat", SICK_NO_CERT: "Sakit Tanpa Surat",
}
const METHOD_LABEL: Record<string, string> = {
  PER_DAY: "Per Hari", PER_HOUR: "Per Jam", PER_MINUTE: "Per Menit", FLAT: "Flat", PERCENT: "Persentase",
}
const TIER_TYPE_LABEL: Record<string, string> = { FIXED: "Nominal", PERCENT: "Persen", PER_HOUR: "Per Jam" }

export default function DeductionRulesPage() {
  const [rules, setRules] = useState<DeductionRuleRow[]>([])
  const [components, setComponents] = useState<SalaryComponentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<DeductionRuleRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const res = await getDeductionRules()
    if (res.success) setRules(res.data as unknown as DeductionRuleRow[])
    else setLoadError(res.error)
    setLoading(false)
  }, [])

  useEffect(() => {
    let active = true
    Promise.all([getDeductionRules(), getSalaryComponents()]).then(([r, c]) => {
      if (!active) return
      if (r.success) setRules(r.data as unknown as DeductionRuleRow[])
      else setLoadError(r.error)
      if (c.success) setComponents(c.data as unknown as SalaryComponentRow[])
      setLoading(false)
    })
    return () => { active = false }
  }, [])

  const toggleExpand = (id: number) => setExpanded((s) => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  const handleToggle = async (r: DeductionRuleRow) => {
    const prev = rules
    setRules((rs) => rs.map((x) => (x.id === r.id ? { ...x, is_active: !x.is_active } : x)))
    const res = await toggleDeductionRule(r.id)
    if (!res.success) { setRules(prev); alert(res.error) }
  }

  const openAdd = () => { setEditing(null); setFormOpen(true) }
  const openEdit = (r: DeductionRuleRow) => { setEditing(r); setFormOpen(true) }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Aturan Potongan Absensi</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>Konfigurasi dinamis potongan dari data absensi (alfa, terlambat, pulang cepat, sakit)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1.5" />Tambah Aturan</Button>
        </div>
      </div>

      {loadError && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{loadError}</div>}

      {loading ? (
        <Card><CardContent className="p-8 text-center text-sm" style={{ color: "var(--text-subtle)" }}>Memuat…</CardContent></Card>
      ) : rules.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm" style={{ color: "var(--text-subtle)" }}>Belum ada aturan potongan.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {rules.map((r) => {
            const isLate = r.trigger_type === "LATE"
            const isOpen = expanded.has(r.id)
            return (
              <Card key={r.id}>
                <CardContent className="p-0">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button
                      onClick={() => isLate && toggleExpand(r.id)}
                      className="shrink-0"
                      style={{ color: isLate ? "var(--text-muted)" : "transparent", cursor: isLate ? "pointer" : "default" }}
                    >
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate" style={{ color: "var(--text-900)" }}>{r.name}</p>
                      <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
                        {isLate ? `${r.late_tiers.length} tier` : METHOD_LABEL[r.calc_method]}
                        {r.basis_component ? ` • basis ${r.basis_component.code}` : ""}
                        {r.max_deduction_per_month != null ? ` • maks ${formatCurrency(r.max_deduction_per_month)}` : ""}
                      </p>
                    </div>
                    <Badge variant="secondary" className="shrink-0">{TRIGGER_LABEL[r.trigger_type]}</Badge>
                    <Badge variant={r.is_active ? "success" : "secondary"} className="shrink-0">{r.is_active ? "Aktif" : "Nonaktif"}</Badge>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--warning)" }} onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: r.is_active ? "var(--danger)" : "var(--success)" }} title={r.is_active ? "Nonaktifkan" : "Aktifkan"} onClick={() => handleToggle(r)}><Power className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>

                  {isLate && isOpen && (
                    <div className="px-4 pb-3" style={{ borderTop: "1px solid var(--border)" }}>
                      <table className="w-full text-sm mt-2">
                        <thead>
                          <tr style={{ color: "var(--text-subtle)" }}>
                            <th className="px-2 py-1.5 text-left text-xs font-semibold">Dari (menit)</th>
                            <th className="px-2 py-1.5 text-left text-xs font-semibold">Sampai (menit)</th>
                            <th className="px-2 py-1.5 text-left text-xs font-semibold">Tipe</th>
                            <th className="px-2 py-1.5 text-right text-xs font-semibold">Nilai</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.late_tiers.length === 0 ? (
                            <tr><td colSpan={4} className="px-2 py-2 text-center text-xs" style={{ color: "var(--text-subtle)" }}>Belum ada tier</td></tr>
                          ) : (
                            [...r.late_tiers].sort((a, b) => a.late_from_minutes - b.late_from_minutes).map((t, i) => (
                              <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                                <td className="px-2 py-1.5 font-mono">{t.late_from_minutes}</td>
                                <td className="px-2 py-1.5 font-mono">{t.late_to_minutes ?? "∞"}</td>
                                <td className="px-2 py-1.5">{TIER_TYPE_LABEL[t.deduction_type]}</td>
                                <td className="px-2 py-1.5 text-right font-mono">{t.deduction_type === "PERCENT" ? `${t.deduction_value}%` : formatCurrency(t.deduction_value)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <DeductionRuleForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        rule={editing}
        components={components}
        onSaved={load}
      />
    </div>
  )
}
