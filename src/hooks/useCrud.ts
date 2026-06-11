"use client"

import { useState, useCallback } from "react"

interface UseCrudOptions<T> {
  apiPath: string
  onSuccess?: () => void
}

export function useCrud<T>({ apiPath, onSuccess }: UseCrudOptions<T>) {
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = useCallback(async (data: Partial<T>): Promise<boolean> => {
    setSaving(true); setError(null)
    try {
      const res = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? "Gagal menyimpan") }
      onSuccess?.()
      return true
    } catch (e) { setError(e instanceof Error ? e.message : "Terjadi kesalahan"); return false }
    finally { setSaving(false) }
  }, [apiPath, onSuccess])

  const update = useCallback(async (id: number | string, data: Partial<T>): Promise<boolean> => {
    setSaving(true); setError(null)
    try {
      const res = await fetch(`${apiPath}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? "Gagal memperbarui") }
      onSuccess?.()
      return true
    } catch (e) { setError(e instanceof Error ? e.message : "Terjadi kesalahan"); return false }
    finally { setSaving(false) }
  }, [apiPath, onSuccess])

  const remove = useCallback(async (id: number | string): Promise<boolean> => {
    setDeleting(true); setError(null)
    try {
      const res = await fetch(`${apiPath}/${id}`, { method: "DELETE" })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? "Gagal menghapus") }
      onSuccess?.()
      return true
    } catch (e) { setError(e instanceof Error ? e.message : "Terjadi kesalahan"); return false }
    finally { setDeleting(false) }
  }, [apiPath, onSuccess])

  return { create, update, remove, saving, deleting, error, clearError: () => setError(null) }
}
