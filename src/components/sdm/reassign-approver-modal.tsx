"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { FormField, TextareaField } from "@/components/ui/form-field"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { useApi } from "@/hooks/useApi"

interface KaryawanOption {
  id: number
  nik: string
  nama_karyawan: string
  jabatan: string
  status_karyawan: string | null
}

interface ReassignApproverModalProps {
  open: boolean
  onClose: () => void
  requestId: number | null
  endpointBase: string
  title: string
  description?: string
  onSuccess: () => void
}

function isAtasan(jabatan: string): boolean {
  const value = jabatan.toLowerCase()
  return value.includes("kepala divisi") || value.includes("manager") || value.includes("ketua")
}

export function ReassignApproverModal({ open, onClose, requestId, endpointBase, title, description, onSuccess }: ReassignApproverModalProps) {
  const { data: karyawans, loading } = useApi<KaryawanOption[]>('/api/karyawan?status=Aktif')
  const [mode, setMode] = useState<"manual" | "refresh" | "skip">("manual")
  const [approverId, setApproverId] = useState("")
  const [alasan, setAlasan] = useState("")
  const [saving, setSaving] = useState(false)

  const approverOptions = (karyawans ?? [])
    .filter(k => isAtasan(k.jabatan ?? ""))
    .map(k => ({ value: String(k.id), label: k.nama_karyawan, description: `${k.nik} - ${k.jabatan}` }))

  const reset = () => {
    setMode("manual")
    setApproverId("")
    setAlasan("")
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleSubmit = async () => {
    if (!requestId) return
    if (!alasan.trim()) { alert("Alasan perubahan approver wajib diisi"); return }
    if (mode === "manual" && !approverId) { alert("Approver baru wajib dipilih"); return }

    setSaving(true)
    try {
      const body = mode === "manual"
        ? { approver_id: Number(approverId), alasan }
        : mode === "refresh"
          ? { refresh: true, alasan }
          : { skip_to_hrd: true, alasan }

      const res = await fetch(`${endpointBase}/${requestId}/reassign-approver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) { alert(json.error ?? "Gagal mengganti approver"); return }

      handleClose()
      onSuccess()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title={title} size="md"
      footer={(
        <>
          <Button variant="outline" onClick={handleClose}>Batal</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving ? "Menyimpan..." : "Simpan Perubahan"}</Button>
        </>
      )}
    >
      <div className="space-y-4">
        {description && <p className="text-sm" style={{ color: "var(--text-subtle)" }}>{description}</p>}

        <FormField label="Mode Perubahan" required>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { value: "manual", label: "Pilih Manual" },
              { value: "refresh", label: "Refresh Atasan" },
              { value: "skip", label: "Skip ke HRD" },
            ].map(item => (
              <button
                key={item.value}
                type="button"
                onClick={() => setMode(item.value as "manual" | "refresh" | "skip")}
                className="rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
                style={{
                  border: `1px solid ${mode === item.value ? "var(--primary)" : "var(--border)"}`,
                  background: mode === item.value ? "var(--primary-light)" : "var(--surface)",
                  color: mode === item.value ? "var(--primary)" : "var(--text-900)",
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </FormField>

        {mode === "manual" && (
          <SearchableSelect
            label="Approver Baru"
            required
            value={approverId}
            onChange={setApproverId}
            options={approverOptions}
            loading={loading}
            placeholder="Pilih atasan"
            searchPlaceholder="Cari nama, NIK, jabatan..."
          />
        )}

        {mode === "refresh" && (
          <div className="rounded-lg p-3 text-sm" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
            Sistem akan mengambil ulang atasan terbaru dari struktur karyawan saat ini.
          </div>
        )}

        {mode === "skip" && (
          <div className="rounded-lg p-3 text-sm" style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)", color: "var(--text-muted)" }}>
            Approval atasan akan dilewati dan pengajuan langsung masuk ke approval HRD. Gunakan hanya jika tidak ada atasan valid.
          </div>
        )}

        <TextareaField label="Alasan Perubahan" required value={alasan} onChange={e => setAlasan(e.target.value)} />
      </div>
    </Modal>
  )
}
