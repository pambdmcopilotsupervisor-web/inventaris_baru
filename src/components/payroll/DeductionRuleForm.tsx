"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Modal } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { TextField, SelectField } from "@/components/ui/form-field"
import { Plus, Trash2, Play, AlertTriangle } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import {
  deductionRuleSchema,
  validateTiers,
  type DeductionRuleInput,
} from "@/lib/validations/attendance-deduction-rule"
import {
  createDeductionRule,
  updateDeductionRule,
  simulateDeductionRule,
} from "@/actions/attendance-deduction-rule"
import type { SalaryComponentRow } from "@/components/payroll/SalaryComponentForm"

export interface DeductionRuleRow {
  id: number
  name: string
  trigger_type: "ALFA" | "LATE" | "EARLY_LEAVE" | "SICK_NO_CERT"
  calc_method: "PER_DAY" | "PER_HOUR" | "PER_MINUTE" | "FLAT" | "PERCENT"
  basis_component_id: number | null
  value: number
  working_days: number
  tolerance_minutes: number | null
  max_deduction_per_month: number | null
  is_active: boolean
  late_tiers: Array<{
    id?: number
    late_from_minutes: number
    late_to_minutes: number | null
    deduction_type: "FIXED" | "PERCENT" | "PER_HOUR"
    deduction_value: number
  }>
  basis_component?: { id: number; code: string; name: string } | null
}

interface Props {
  open: boolean
  onClose: () => void
  rule: DeductionRuleRow | null
  components: SalaryComponentRow[]
  onSaved: () => void
}

const TRIGGER_OPTIONS = [
  { value: "ALFA", label: "Alfa (Tidak Hadir)" },
  { value: "LATE", label: "Terlambat" },
  { value: "EARLY_LEAVE", label: "Pulang Cepat" },
  { value: "SICK_NO_CERT", label: "Sakit Tanpa Surat" },
]
const CALC_BY_TRIGGER: Record<string, { value: string; label: string }[]> = {
  ALFA: [
    { value: "PER_DAY", label: "Per Hari (Gaji/Hari Kerja)" },
    { value: "FLAT", label: "Flat (Nominal/hari)" },
    { value: "PERCENT", label: "Persentase (% basis/hari)" },
  ],
  SICK_NO_CERT: [
    { value: "PER_DAY", label: "Per Hari (Gaji/Hari Kerja)" },
    { value: "FLAT", label: "Flat (Nominal/hari)" },
    { value: "PERCENT", label: "Persentase (% basis/hari)" },
  ],
  EARLY_LEAVE: [
    { value: "PER_HOUR", label: "Per Jam" },
    { value: "PER_MINUTE", label: "Per Menit" },
    { value: "FLAT", label: "Flat (Nominal)" },
  ],
  LATE: [],
}
const TIER_TYPE_OPTIONS = [
  { value: "FIXED", label: "Nominal Tetap" },
  { value: "PERCENT", label: "Persentase" },
  { value: "PER_HOUR", label: "Per Jam" },
]

function defaultsFrom(rule: DeductionRuleRow | null): DeductionRuleInput {
  if (!rule) {
    return {
      name: "", trigger_type: "ALFA", calc_method: "PER_DAY", basis_component_id: undefined,
      value: 0, working_days: 22, tolerance_minutes: undefined, max_deduction_per_month: undefined,
      is_active: true, tiers: [],
    }
  }
  return {
    name: rule.name,
    trigger_type: rule.trigger_type,
    calc_method: rule.calc_method,
    basis_component_id: rule.basis_component_id ?? undefined,
    value: rule.value,
    working_days: rule.working_days,
    tolerance_minutes: rule.tolerance_minutes ?? undefined,
    max_deduction_per_month: rule.max_deduction_per_month ?? undefined,
    is_active: rule.is_active,
    tiers: rule.late_tiers.map((t) => ({
      late_from_minutes: t.late_from_minutes,
      late_to_minutes: t.late_to_minutes ?? undefined,
      deduction_type: t.deduction_type,
      deduction_value: t.deduction_value,
    })),
  }
}

interface SimResult { breakdown: { label: string; detail: string; amount: number }[]; total_deduction: number; capped: boolean }

export function DeductionRuleForm({ open, onClose, rule, components, onSaved }: Props) {
  const isEdit = !!rule
  const {
    register, handleSubmit, reset, watch, setValue, setError, control,
    formState: { errors, isSubmitting },
  } = useForm<DeductionRuleInput>({
    resolver: zodResolver(deductionRuleSchema),
    defaultValues: defaultsFrom(rule),
  })
  const { fields, append, remove } = useFieldArray({ control, name: "tiers" })

  useEffect(() => {
    if (open) reset(defaultsFrom(rule))
  }, [open, rule, reset])

  const trigger = watch("trigger_type")
  const method = watch("calc_method")
  const tiers = watch("tiers")

  // Saat trigger berubah, sesuaikan calc_method default.
  useEffect(() => {
    const opts = CALC_BY_TRIGGER[trigger] ?? []
    if (trigger === "LATE") {
      setValue("calc_method", "FLAT") // tidak dipakai untuk LATE (pakai tier)
    } else if (opts.length && !opts.some((o) => o.value === method)) {
      setValue("calc_method", opts[0].value as DeductionRuleInput["calc_method"])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger])

  const componentOptions = components.filter((c) => c.is_active).map((c) => ({ value: String(c.id), label: `${c.code} — ${c.name}` }))

  const needsBasis = ["PERCENT", "PER_DAY", "PER_HOUR"].includes(method) && trigger !== "LATE"
  const needsValue = ["FLAT", "PERCENT", "PER_HOUR", "PER_MINUTE"].includes(method) && trigger !== "LATE"
  const needsWorkingDays = method === "PER_DAY" && trigger !== "LATE"
  const needsTolerance = trigger === "EARLY_LEAVE"

  // Validasi visual tier (overlap/gap)
  const tierWarning = useMemo(() => {
    if (trigger !== "LATE") return null
    const parsed = (tiers ?? []).map((t) => ({
      late_from_minutes: Number(t.late_from_minutes) || 0,
      late_to_minutes: t.late_to_minutes === undefined || t.late_to_minutes === null || (t.late_to_minutes as unknown as string) === "" ? null : Number(t.late_to_minutes),
    }))
    return validateTiers(parsed)
  }, [tiers, trigger])

  const onSubmit = async (values: DeductionRuleInput) => {
    const res = isEdit ? await updateDeductionRule(rule!.id, values) : await createDeductionRule(values)
    if (!res.success) {
      setError("root", { message: res.error })
      return
    }
    onSaved()
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit Aturan Potongan" : "Tambah Aturan Potongan"}
      description="Konfigurasi potongan absensi yang dinamis & dapat disimulasikan."
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Batal</Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={isSubmitting}>{isSubmitting ? "Menyimpan..." : "Simpan"}</Button>
        </>
      }
    >
      {errors.root?.message && (
        <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{errors.root.message}</div>
      )}

      <div className="space-y-6">
        {/* Section 1: Info dasar */}
        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>1. Info Dasar</h3>
          <div className="grid grid-cols-2 gap-4">
            <TextField label="Nama Aturan" required error={errors.name?.message} placeholder="Potongan Alfa Standar" {...register("name")} />
            <SelectField label="Trigger" required options={TRIGGER_OPTIONS} error={errors.trigger_type?.message} {...register("trigger_type")} />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--text-muted)" }}>
            <input type="checkbox" className="h-4 w-4 rounded" {...register("is_active")} /> Aktif
          </label>
        </section>

        {/* Section 2: Metode kalkulasi */}
        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>2. Metode Kalkulasi</h3>

          {trigger !== "LATE" ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <SelectField label="Metode" required options={CALC_BY_TRIGGER[trigger] ?? []} error={errors.calc_method?.message} {...register("calc_method")} />
                {needsBasis && (
                  <SelectField label="Komponen Acuan (Basis)" required placeholder="Pilih komponen…" options={componentOptions} error={errors.basis_component_id?.message} {...register("basis_component_id")} />
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                {needsValue && (
                  <TextField label={method === "PERCENT" ? "Nilai (%)" : "Nilai (Rp)"} type="number" step="0.01" min={0} error={errors.value?.message} {...register("value")} />
                )}
                {needsWorkingDays && (
                  <TextField label="Hari Kerja Standar" type="number" min={1} max={31} error={errors.working_days?.message} {...register("working_days")} />
                )}
                {needsTolerance && (
                  <TextField label="Toleransi (menit)" type="number" min={0} placeholder="0" error={errors.tolerance_minutes?.message as string | undefined} {...register("tolerance_minutes")} />
                )}
              </div>
              {method === "PER_DAY" && (
                <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Formula: (Gaji Acuan / Hari Kerja) × Jumlah Hari</p>
              )}
            </>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium" style={{ color: "var(--text-900)" }}>Tier Keterlambatan</p>
                <Button size="sm" variant="outline" type="button" onClick={() => append({ late_from_minutes: 0, late_to_minutes: undefined, deduction_type: "FIXED", deduction_value: 0 })}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Tambah Tier
                </Button>
              </div>

              {tierWarning && (
                <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: "var(--warning-bg, #fffbeb)", color: "var(--warning)" }}>
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{tierWarning}
                </div>
              )}

              <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid var(--border)" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "var(--surface-hover)", color: "var(--text-subtle)" }}>
                      <th className="px-3 py-2 text-left text-xs font-semibold">Dari (menit)</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold">Sampai (menit)</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold">Tipe Potongan</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold">Nilai</th>
                      <th className="px-3 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.length === 0 && (
                      <tr><td colSpan={5} className="px-3 py-4 text-center text-xs" style={{ color: "var(--text-subtle)" }}>Belum ada tier. Tambahkan minimal 1 tier.</td></tr>
                    )}
                    {fields.map((f, i) => (
                      <tr key={f.id} style={{ borderTop: "1px solid var(--border)" }}>
                        <td className="px-2 py-1.5"><input type="number" min={0} className="w-full rounded border px-2 py-1 text-sm" style={{ borderColor: "var(--border-strong)", background: "var(--surface)" }} {...register(`tiers.${i}.late_from_minutes`)} /></td>
                        <td className="px-2 py-1.5"><input type="number" min={0} placeholder="∞ (kosong)" className="w-full rounded border px-2 py-1 text-sm" style={{ borderColor: "var(--border-strong)", background: "var(--surface)" }} {...register(`tiers.${i}.late_to_minutes`)} /></td>
                        <td className="px-2 py-1.5">
                          <select className="w-full rounded border px-2 py-1 text-sm" style={{ borderColor: "var(--border-strong)", background: "var(--surface)" }} {...register(`tiers.${i}.deduction_type`)}>
                            {TIER_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-1.5"><input type="number" step="0.01" min={0} className="w-full rounded border px-2 py-1 text-sm" style={{ borderColor: "var(--border-strong)", background: "var(--surface)" }} {...register(`tiers.${i}.deduction_value`)} /></td>
                        <td className="px-2 py-1.5 text-center">
                          <button type="button" onClick={() => remove(i)} style={{ color: "var(--danger)" }}><Trash2 className="h-3.5 w-3.5" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {typeof errors.tiers?.message === "string" && (
                <p className="text-xs" style={{ color: "var(--danger)" }}>{errors.tiers.message}</p>
              )}
            </div>
          )}
        </section>

        {/* Section 3: Batas maksimal */}
        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>3. Batas Maksimal</h3>
          <TextField label="Maks. Potongan / Bulan (Rp) — opsional" type="number" min={0} placeholder="Tanpa batas" className="max-w-xs" error={errors.max_deduction_per_month?.message as string | undefined} {...register("max_deduction_per_month")} />
        </section>

        {/* Section 4: Simulator */}
        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>4. Simulator</h3>
          {isEdit ? (
            <Simulator ruleId={rule!.id} />
          ) : (
            <p className="text-xs rounded-lg px-3 py-2" style={{ background: "var(--surface-hover)", color: "var(--text-subtle)" }}>
              Simpan aturan terlebih dahulu untuk menjalankan simulasi.
            </p>
          )}
        </section>
      </div>
    </Modal>
  )
}

// ─── Simulator (memanggil server action) ─────────────────────────
function Simulator({ ruleId }: { ruleId: number }) {
  const [input, setInput] = useState({ alfa_days: 0, late_minutes: 0, early_leave_minutes: 0, sick_no_cert_days: 0, basis_value: 5000000 })
  const [result, setResult] = useState<SimResult | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (k: keyof typeof input, v: string) => setInput((p) => ({ ...p, [k]: Number(v) || 0 }))

  const run = async () => {
    setRunning(true); setError(null)
    const res = await simulateDeductionRule(ruleId, input)
    setRunning(false)
    if (!res.success) { setError(res.error); setResult(null); return }
    setResult(res.data as SimResult)
  }

  return (
    <div className="rounded-lg p-4 space-y-3" style={{ border: "1px solid var(--border)", background: "var(--surface-hover)" }}>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <TextField label="Hari Alfa" type="number" min={0} value={String(input.alfa_days)} onChange={(e) => set("alfa_days", e.target.value)} />
        <TextField label="Menit Terlambat" type="number" min={0} value={String(input.late_minutes)} onChange={(e) => set("late_minutes", e.target.value)} />
        <TextField label="Menit Pulang Cepat" type="number" min={0} value={String(input.early_leave_minutes)} onChange={(e) => set("early_leave_minutes", e.target.value)} />
        <TextField label="Hari Sakit (tanpa surat)" type="number" min={0} value={String(input.sick_no_cert_days)} onChange={(e) => set("sick_no_cert_days", e.target.value)} />
        <TextField label="Gaji Acuan (Rp)" type="number" min={0} value={String(input.basis_value)} onChange={(e) => set("basis_value", e.target.value)} />
        <div className="flex items-end">
          <Button type="button" onClick={run} disabled={running} className="w-full"><Play className="h-3.5 w-3.5 mr-1.5" />{running ? "Menghitung..." : "Simulasikan"}</Button>
        </div>
      </div>

      {error && <p className="text-xs" style={{ color: "var(--danger)" }}>{error}</p>}

      {result && (
        <div className="space-y-2">
          {result.breakdown.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Tidak ada potongan untuk input ini.</p>
          ) : (
            result.breakdown.map((b, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div><p className="font-medium">{b.label}</p><p className="text-xs font-mono" style={{ color: "var(--text-subtle)" }}>{b.detail}</p></div>
                <span className="font-mono">{formatCurrency(b.amount)}</span>
              </div>
            ))
          )}
          <div className="flex items-center justify-between border-t pt-2 mt-2" style={{ borderColor: "var(--border)" }}>
            <span className="text-sm font-bold">Total Potongan {result.capped && <span className="text-xs font-normal" style={{ color: "var(--warning)" }}>(dibatasi maks)</span>}</span>
            <span className="font-mono font-bold" style={{ color: "var(--danger)" }}>{formatCurrency(result.total_deduction)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
