"use client"

import React, { useEffect, useMemo } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Modal } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { TextField, SelectField } from "@/components/ui/form-field"
import { formatCurrency, formatDate } from "@/lib/utils"
import { assignComponentSchema, type AssignComponentInput } from "@/lib/validations/employee-salary"
import { assignSalaryComponent } from "@/actions/employee-salary"
import type { SalaryComponentRow } from "@/components/payroll/SalaryComponentForm"

type ExistingSetting = { value: number; effective_date: string; end_date: string | null; status: "active" | "upcoming" | "ended"; calc_method: string; source: "employee" | "jabatan" }

interface Props {
  open: boolean
  onClose: () => void
  employeeId: number
  /** Komponen aktif yang dapat dipilih. */
  components: SalaryComponentRow[]
  /** Peta komponen → setting efektif saat ini (untuk konteks). */
  existingByComponent?: Record<number, ExistingSetting>
  /** Peta componentId → nilai FIXED karyawan (untuk preview PERCENT). */
  basisValues: Record<number, number>
  /** Mode edit: komponen dikunci (nilai baru efektif menutup record lama). */
  lockedComponent?: SalaryComponentRow | null
  initialValue?: number
  onSaved: () => void
}

/** Tanggal 1 bulan depan (YYYY-MM-DD). */
function firstDayNextMonth(): string {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return d.toISOString().slice(0, 10)
}

/** Tanggal sehari setelah ISO date (YYYY-MM-DD). */
function dayAfter(iso: string): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

export function AssignComponentForm({ open, onClose, employeeId, components, existingByComponent, basisValues, lockedComponent, initialValue, onSaved }: Props) {
  const {
    register, handleSubmit, reset, watch, setValue, setError,
    formState: { errors, isSubmitting },
  } = useForm<AssignComponentInput>({
    resolver: zodResolver(assignComponentSchema),
    defaultValues: { employee_id: employeeId, component_id: lockedComponent?.id, value: initialValue ?? 0, effective_date: firstDayNextMonth(), end_date: "" },
  })

  useEffect(() => {
    if (open) reset({ employee_id: employeeId, component_id: lockedComponent?.id, value: initialValue ?? 0, effective_date: firstDayNextMonth(), end_date: "" })
  }, [open, employeeId, lockedComponent, initialValue, reset])

  const componentId = Number(watch("component_id")) || 0
  const value = Number(watch("value")) || 0

  const selected = useMemo(
    () => lockedComponent ?? components.find((c) => c.id === componentId) ?? null,
    [lockedComponent, components, componentId],
  )

  // Setting efektif yang sudah ada untuk komponen terpilih (konteks).
  const existing = useMemo(() => {
    const id = lockedComponent?.id ?? componentId
    return id ? existingByComponent?.[id] ?? null : null
  }, [existingByComponent, lockedComponent, componentId])

  // Untuk PERCENT/FORMULA, nilai komponen otomatis (bukan input bebas).
  useEffect(() => {
    if (!selected) return
    if (selected.calc_method === "PERCENT") {
      setValue("value", selected.default_rate ?? (selected.formula_expression ? Number(selected.formula_expression) : 0))
    } else if (selected.calc_method === "FORMULA") {
      setValue("value", 0)
    }
  }, [selected, setValue])

  // Saat memilih komponen baru di mode tambah: bila sudah ada record berakhir,
  // default tanggal berlaku = sehari setelah berakhir (untuk melanjutkan periode).
  useEffect(() => {
    if (lockedComponent || !componentId) return
    if (existing?.end_date) setValue("effective_date", dayAfter(existing.end_date))
  }, [lockedComponent, componentId, existing, setValue])

  const componentOptions = components.map((c) => ({
    value: String(c.id),
    label: `${c.code} — ${c.name} (${c.type === "EARNING" ? "Pendapatan" : "Potongan"})`,
  }))

  // Preview realtime untuk PERCENT.
  const percentPreview = useMemo(() => {
    if (!selected || selected.calc_method !== "PERCENT" || !selected.basis_component_id) return null
    const basis = basisValues[selected.basis_component_id] ?? 0
    return (basis * value) / 100
  }, [selected, value, basisValues])

  const onSubmit = async (values: AssignComponentInput) => {
    const res = await assignSalaryComponent({ ...values, employee_id: employeeId })
    if (!res.success) {
      setError("root", { message: res.error })
      return
    }
    onSaved()
    onClose()
  }

  const isEdit = !!lockedComponent

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Ubah Nilai Komponen Gaji" : "Atur Komponen Gaji Karyawan"}
      description={isEdit ? "Nilai baru berlaku sejak tanggal terpilih; nilai lama otomatis ditutup." : "Pilih komponen, isi nilai, dan tentukan tanggal berlaku. Nilai per karyawan menang atas default jabatan."}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Batal</Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={isSubmitting}>
            {isSubmitting ? "Menyimpan..." : "Simpan"}
          </Button>
        </>
      }
    >
      {errors.root?.message && (
        <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
          {errors.root.message}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {isEdit ? (
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Komponen</label>
            <div className="rounded-lg px-3 py-2 text-sm font-medium" style={{ border: "1px solid var(--border-strong)", background: "var(--surface-hover)", color: "var(--text-900)" }}>
              {lockedComponent!.code} — {lockedComponent!.name}
            </div>
            <input type="hidden" {...register("component_id")} />
          </div>
        ) : (
          <SelectField
            label="Komponen"
            required
            placeholder={componentOptions.length ? "Pilih komponen…" : "Belum ada komponen aktif"}
            options={componentOptions}
            error={errors.component_id?.message}
            {...register("component_id")}
          />
        )}

        {/* Konteks: setting efektif yang sudah ada untuk komponen ini */}
        {!isEdit && existing && (
          <div className="rounded-lg px-4 py-3 text-xs" style={{ background: "var(--surface-hover)", border: "1px dashed var(--border-strong)", color: "var(--text-muted)" }}>
            <p>
              <span className="font-semibold" style={{ color: "var(--text-900)" }}>Saat ini:</span>{" "}
              {existing.calc_method === "FIXED" ? formatCurrency(existing.value) : `${existing.value}${existing.calc_method === "PERCENT" ? "%" : ""}`}
              {" · "}{formatDate(existing.effective_date)} – {existing.end_date ? formatDate(existing.end_date) : "tanpa batas"}
              {" · "}<span className="font-semibold">{existing.source === "employee" ? "Individu" : "Default Jabatan"}</span>
            </p>
            <p className="mt-1" style={{ color: "var(--text-subtle)" }}>
              {existing.source === "jabatan"
                ? "Menyimpan akan membuat override per karyawan (menggantikan default jabatan) sejak tanggal berlaku."
                : "Menyimpan akan membuat penyesuaian baru sejak tanggal berlaku; record lama yang masih terbuka otomatis ditutup."}
            </p>
          </div>
        )}

        {/* FIXED → input nominal */}
        {selected?.calc_method === "FIXED" && (
          <TextField
            label="Nilai Nominal (Rp)"
            type="number"
            min={0}
            required
            placeholder="0"
            error={errors.value?.message}
            {...register("value")}
          />
        )}

        {/* PERCENT → readonly info + preview */}
        {selected?.calc_method === "PERCENT" && (
          <div className="space-y-2">
            <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--surface-hover)", color: "var(--text-muted)" }}>
              <span className="font-semibold">{selected.default_rate ?? selected.formula_expression ?? "0"}%</span>{" "}
              dari <span className="font-semibold">{selected.basis_component?.name ?? "komponen acuan"}</span>
            </div>
            {percentPreview != null && (
              <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--success-bg, #ecfdf5)", color: "var(--success)" }}>
                Estimasi nilai: <span className="font-bold font-mono">{formatCurrency(percentPreview)}</span>
                <span className="text-xs ml-1" style={{ color: "var(--text-subtle)" }}>
                  ({formatCurrency(basisValues[selected.basis_component_id!] ?? 0)} × {selected.formula_expression ?? 0}%)
                </span>
              </div>
            )}
          </div>
        )}

        {/* FORMULA → readonly expression */}
        {selected?.calc_method === "FORMULA" && (
          <div className="rounded-lg px-4 py-3 text-xs" style={{ background: "var(--surface-hover)", color: "var(--text-subtle)" }}>
            <span className="font-semibold">Formula:</span> <code>{selected.formula_expression}</code>
            <p className="mt-1">Nilai akan dihitung otomatis oleh engine payroll saat periode dijalankan.</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Berlaku Sejak"
            type="date"
            required
            error={errors.effective_date?.message as string | undefined}
            {...register("effective_date")}
          />
          <TextField
            label="Sampai (opsional)"
            type="date"
            error={errors.end_date?.message as string | undefined}
            {...register("end_date")}
          />
        </div>
        <p className="text-[11px]" style={{ color: "var(--text-subtle)" }}>Kosongkan &quot;Sampai&quot; bila berlaku tanpa batas. Untuk mengubah nilai di periode berikutnya, pilih komponen yang sama dengan tanggal berlaku baru.</p>
      </form>
    </Modal>
  )
}
