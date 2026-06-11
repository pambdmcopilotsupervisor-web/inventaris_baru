"use client"

import React from "react"
import { Modal } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"

interface ConfirmDeleteProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title?: string
  description?: string
  loading?: boolean
}

export function ConfirmDelete({
  open, onClose, onConfirm, title = "Hapus Data", description = "Tindakan ini tidak dapat dibatalkan.", loading = false,
}: ConfirmDeleteProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>Batal</Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={loading}
            style={{ background: "var(--danger)", color: "#fff" }}
          >
            {loading ? "Menghapus..." : "Ya, Hapus"}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--danger-bg)" }}>
          <AlertTriangle className="h-5 w-5" style={{ color: "var(--danger)" }} />
        </div>
        <p className="text-sm pt-2" style={{ color: "var(--text-muted)" }}>{description}</p>
      </div>
    </Modal>
  )
}
