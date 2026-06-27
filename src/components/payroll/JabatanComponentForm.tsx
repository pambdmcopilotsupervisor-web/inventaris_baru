"use client"

import React, { useEffect, useMemo } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Modal } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { TextField, SelectField } from "@/components/ui/form-field"
import { formatCurrency, formatDate } from "@/lib/utils"
import { assignJabatanComponentSchema, type AssignJabatanComponentInput } from "@/lib/validations/jabatan-salary"
import { assignJabatanComponent } from "@/actions/jabatan-salary"
import type { SalaryComponentRow } from "@/components/payroll/SalaryComponentForm"

type ExistingSetting = { value: number; effective_date: string; end_date: string | null; status: "active" | "upcoming" | "ended"; calc_method: string }

interface Props {
  open: boolean
  onClose: () => void
  jabatan: string
  components: SalaryComponentRow[]
  /** Peta komponen → setting aktif/mendatang saat ini (untuk konteks). */
  existingByComponent?: Record<number, ExistingSetting>
  lockedComponent?: SalaryComponentRow | null
  initialValue?: number
  onSaved: () => void
}

function firstDayNextMonth(): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10)
}

/** Tanggal sehari setelah ISO date (YYYY-MM-DD). */
function dayAfter(iso: string): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

export function JabatanComponentForm({ open, onClose, jabatan, components, existingByComponent, lockedComponent, initialValue, onSaved }: Props) {
  const isEdit = !!lockedComponent
  const {
    register, handleSubmit, reset, watch, setValue, setError,
    formState: { errors, isSubmitting },
  } = useForm<AssignJabatanComponentInput>({
    resolver: zodResolver(assignJabatanComponentSchema),
    defaultValues: { jabatan, component_id: lockedComponent?.id, value: initialValue ?? 0, effective_date: firstDayNextMonth(), end_date: "" },
  })

  useEffect(() => {
    if (open) reset({ jabatan, component_id: lockedComponent?.id, value: initialValue ?? 0, effective_date: firstDayNextMonth(), end_date: "" })
  }, [open, jabatan, lockedComponent, initialValue, reset])

  const componentId = Number(watch("component_id")) || 0
  const selected = useMemo(
    () => lockedComponent ?? components.find((c) => c.id === componentId) ?? null,
    [lockedComponent, components, componentId],
  )

  // Setting yang sudah ada untuk komponen terpilih (konteks).
  const existing = useMemo(() => {
    const id = lockedComponent?.id ?? componentId
    return id ? existingByComponent?.[id] ?? null : null
  }, [existingByComponent, lockedComponent, componentId])

  useEffect(() => {
    if (!selected) return
    if (selected.calc_method === "PERCENT") setValue("value", selected.default_rate ?? (selected.formula_expression ? Number(selected.formula_expression) : 0))
    else if (selected.calc_method === "FORMULA") setValue("value", 0)
  }, [selected, setValue])

  // Saat memilih komponen baru di mode tambah: bila sudah ada record berakhir,
  // default tanggal berlaku = sehari setelah berakhir (untuk melanjutkan periode).
  useEffect(() => {
    if (isEdit || !componentId) return
    if (existing?.end_date) setValue("effective_date", dayAfter(existing.end_date))
  }, [isEdit, componentId, existing, setValue])

  const componentOptions = components.map((c) => ({ value: String(c.id), label: `${c.code} — ${c.name} (${c.type === "EARNING" ? "Pendapatan" : "Potongan"})` }))

  const statusLabel: Record<ExistingSetting["status"], string> = { active: "Aktif", upcoming: "Mendatang", ended: "Berakhir" }

  const onSubmit = async (values: AssignJabatanComponentInput) => {
    const res = await assignJabatanComponent({ ...values, jabatan })
    if (!res.success) { setError("root", { message: res.error }); return }
    onSaved(); onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Ubah Nilai Komponen Jabatan" : "Atur Komponen Jabatan"}
      description={`Berlaku untuk semua karyawan dengan jabatan: ${jabatan}`}
      size="md"
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

        {/* Konteks: setting yang sudah ada untuk komponen ini */}
        {!isEdit && existing && (
          <div className="rounded-lg px-4 py-3 text-xs" style={{ background: "var(--surface-hover)", border: "1px dashed var(--border-strong)", color: "var(--text-muted)" }}>
            <p>
              <span className="font-semibold" style={{ color: "var(--text-900)" }}>Sudah di-set:</span>{" "}
              {existing.calc_method === "FIXED" ? formatCurrency(existing.value) : `${existing.value}${existing.calc_method === "PERCENT" ? "%" : ""}`}
              {" · "}{formatDate(existing.effective_date)} – {existing.end_date ? formatDate(existing.end_date) : "tanpa batas"}{" "}
              <span className="font-semibold">({statusLabel[existing.status]})</span>
            </p>
            <p className="mt-1" style={{ color: "var(--text-subtle)" }}>
              Menyimpan akan membuat <b>penyesuaian baru</b> sejak tanggal berlaku di bawah. Record lama yang masih terbuka otomatis ditutup sehari sebelumnya.
            </p>
          </div>
        )}

        {selected?.calc_method === "FIXED" && (
          <TextField label="Nilai Nominal (Rp)" type="number" min={0} required placeholder="0" error={errors.value?.message} {...register("value")} />
        )}

        {selected?.calc_method === "PERCENT" && (
          <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--surface-hover)", color: "var(--text-muted)" }}>
            <span className="font-semibold">{selected.default_rate ?? selected.formula_expression ?? "0"}%</span>{" "}
            dari <span className="font-semibold">{selected.basis_component?.name ?? "komponen acuan"}</span>
            <p className="text-xs mt-1" style={{ color: "var(--text-subtle)" }}>Nilai akhir dihitung per karyawan saat payroll (basis bisa berbeda tiap orang).</p>
          </div>
        )}

        {selected?.calc_method === "FORMULA" && (
          <div className="rounded-lg px-4 py-3 text-xs" style={{ background: "var(--surface-hover)", color: "var(--text-subtle)" }}>
            <span className="font-semibold">Formula:</span> <code>{selected.formula_expression}</code>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <TextField label="Berlaku Sejak" type="date" required error={errors.effective_date?.message as string | undefined} {...register("effective_date")} />
          <TextField label="Sampai (opsional)" type="date" error={errors.end_date?.message as string | undefined} {...register("end_date")} />
        </div>
        <p className="text-[11px]" style={{ color: "var(--text-subtle)" }}>Kosongkan &quot;Sampai&quot; bila berlaku tanpa batas. Untuk mengganti nilai di periode berikutnya, cukup pilih komponen yang sama dengan tanggal berlaku baru.</p>
      </form>
    </Modal>
  )
}
