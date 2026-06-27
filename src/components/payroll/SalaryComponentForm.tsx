"use client"

import React, { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Modal } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { TextField, SelectField, TextareaField } from "@/components/ui/form-field"
import { salaryComponentSchema, type SalaryComponentInput } from "@/lib/validations/salary-component"
import {
  createSalaryComponent,
  updateSalaryComponent,
} from "@/actions/salary-component"

export interface SalaryComponentRow {
  id: number
  code: string
  name: string
  type: "EARNING" | "DEDUCTION"
  calc_method: "FIXED" | "PERCENT" | "FORMULA"
  formula_expression: string | null
  default_rate?: number | null
  basis_component_id: number | null
  calc_order: number
  is_taxable: boolean
  is_active: boolean
  is_prorata?: boolean
  is_thr_basis?: boolean
  basis_component?: { id: number; code: string; name: string } | null
}

interface Props {
  open: boolean
  onClose: () => void
  component: SalaryComponentRow | null
  components: SalaryComponentRow[]
  onSaved: () => void
}

const TYPE_OPTIONS = [
  { value: "EARNING", label: "Pendapatan (Earning)" },
  { value: "DEDUCTION", label: "Potongan (Deduction)" },
]
const METHOD_OPTIONS = [
  { value: "FIXED", label: "Nominal Tetap (Fixed)" },
  { value: "PERCENT", label: "Persentase (Percent)" },
  { value: "FORMULA", label: "Formula" },
]

const FORMULA_VARS = [
  "GAJI_POKOK", "TJ_JABATAN", "TJ_MAKAN",
  "total_earnings", "total_taxable", "working_days", "present_days",
  "alpha_days", "late_minutes", "overtime_minutes", "overtime_amount",
]

function defaultsFrom(component: SalaryComponentRow | null): SalaryComponentInput {
  if (!component) {
    return {
      code: "", name: "", type: "EARNING", calc_method: "FIXED",
      percent: undefined, formula_expression: "", basis_component_id: undefined,
      calc_order: 0, is_taxable: false, is_active: true, is_prorata: false, is_thr_basis: false,
    }
  }
  return {
    code: component.code,
    name: component.name,
    type: component.type,
    calc_method: component.calc_method,
    // Untuk PERCENT, rate disimpan di default_rate (fallback formula_expression lama).
    percent: component.calc_method === "PERCENT"
      ? (component.default_rate ?? (component.formula_expression ? Number(component.formula_expression) : undefined))
      : undefined,
    formula_expression: component.calc_method === "FORMULA" ? component.formula_expression ?? "" : "",
    basis_component_id: component.basis_component_id ?? undefined,
    calc_order: component.calc_order,
    is_taxable: component.is_taxable,
    is_active: component.is_active,
    is_prorata: component.is_prorata ?? false,
    is_thr_basis: component.is_thr_basis ?? false,
  }
}

export function SalaryComponentForm({ open, onClose, component, components, onSaved }: Props) {
  const isEdit = !!component
  const {
    register, handleSubmit, reset, watch, setError,
    formState: { errors, isSubmitting },
  } = useForm<SalaryComponentInput>({
    resolver: zodResolver(salaryComponentSchema),
    defaultValues: defaultsFrom(component),
  })

  useEffect(() => {
    if (open) reset(defaultsFrom(component))
  }, [open, component, reset])

  const method = watch("calc_method")

  // Opsi komponen acuan (basis): semua kecuali dirinya sendiri.
  const basisOptions = components
    .filter((c) => c.id !== component?.id)
    .map((c) => ({ value: String(c.id), label: `${c.code} — ${c.name}` }))

  const onSubmit = async (values: SalaryComponentInput) => {
    const res = isEdit
      ? await updateSalaryComponent(component!.id, values)
      : await createSalaryComponent(values)
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
      title={isEdit ? "Edit Komponen Gaji" : "Tambah Komponen Gaji"}
      description="Definisi komponen gaji bersifat dinamis & dapat dikonfigurasi."
      size="lg"
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
        <div className="grid grid-cols-2 gap-4">
          <TextField
            label="Kode"
            required
            placeholder="GAJI_POKOK"
            error={errors.code?.message}
            {...register("code")}
          />
          <TextField
            label="Nama"
            required
            placeholder="Gaji Pokok"
            error={errors.name?.message}
            {...register("name")}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <SelectField label="Tipe" required options={TYPE_OPTIONS} error={errors.type?.message} {...register("type")} />
          <SelectField label="Metode" required options={METHOD_OPTIONS} error={errors.calc_method?.message} {...register("calc_method")} />
          <TextField label="Urutan Kalkulasi" type="number" min={0} error={errors.calc_order?.message} {...register("calc_order")} />
        </div>

        {/* Conditional: FIXED */}
        {method === "FIXED" && (
          <div className="rounded-lg px-4 py-3 text-xs" style={{ background: "var(--surface-hover)", color: "var(--text-subtle)" }}>
            Metode <strong>FIXED</strong>: nilai nominal ditetapkan per karyawan pada menu Struktur Gaji. Form ini hanya mendefinisikan komponennya.
          </div>
        )}

        {/* Conditional: PERCENT */}
        {method === "PERCENT" && (
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="Persentase (%)"
              type="number"
              step="0.01"
              min={0}
              max={100}
              required
              placeholder="4.24"
              error={errors.percent?.message}
              {...register("percent")}
            />
            <SelectField
              label="Komponen Acuan (Basis)"
              required
              placeholder="Pilih komponen acuan…"
              options={basisOptions}
              error={errors.basis_component_id?.message}
              {...register("basis_component_id")}
            />
          </div>
        )}

        {/* Conditional: FORMULA */}
        {method === "FORMULA" && (
          <div className="space-y-2">
            <TextareaField
              label="Formula (Ekspresi)"
              required
              placeholder="GAJI_POKOK * 0.0424"
              error={errors.formula_expression?.message}
              {...register("formula_expression")}
            />
            <div className="rounded-lg px-3 py-2 text-[11px]" style={{ background: "var(--surface-hover)", color: "var(--text-subtle)" }}>
              <span className="font-semibold">Variabel tersedia:</span>{" "}
              {FORMULA_VARS.map((v) => (
                <code key={v} className="mr-1.5 rounded px-1 py-0.5" style={{ background: "var(--surface)", color: "var(--text-muted)" }}>{v}</code>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-6 pt-1">
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--text-muted)" }}>
            <input type="checkbox" className="h-4 w-4 rounded" {...register("is_taxable")} />
            Kena Pajak (taxable)
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--text-muted)" }}>
            <input type="checkbox" className="h-4 w-4 rounded" {...register("is_active")} />
            Aktif
          </label>
        </div>
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--text-muted)" }}>
            <input type="checkbox" className="h-4 w-4 rounded" {...register("is_prorata")} />
            Prorata (karyawan baru/keluar)
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--text-muted)" }}>
            <input type="checkbox" className="h-4 w-4 rounded" {...register("is_thr_basis")} />
            Basis THR / Bonus
          </label>
        </div>
      </form>
    </Modal>
  )
}
