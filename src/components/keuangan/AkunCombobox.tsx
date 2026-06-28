"use client"

import React, { useEffect, useRef, useState } from "react"
import { Search, ChevronDown } from "lucide-react"

export interface AkunOption {
  id: number
  kode: string
  nama: string
  jenis?: string
}

interface AkunComboboxProps {
  value: string // akun id sebagai string ("" = belum pilih)
  options: AkunOption[]
  onChange: (id: string) => void
  placeholder?: string
  disabled?: boolean
}

/**
 * Combobox akun ringkas untuk dipakai di dalam baris tabel jurnal.
 * Mendukung pencarian by kode/nama. Lebih hemat ruang dari SelectField + label.
 */
export function AkunCombobox({ value, options, onChange, placeholder = "Pilih akun…", disabled }: AkunComboboxProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = options.find((o) => String(o.id) === value)

  const filtered = search.trim()
    ? options.filter((o) =>
        o.kode.toLowerCase().includes(search.toLowerCase()) ||
        o.nama.toLowerCase().includes(search.toLowerCase()))
        .slice(0, 60)
    : options.slice(0, 60)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setSearch("")
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-1 text-xs rounded px-2 py-1.5 border text-left disabled:opacity-50"
        style={{ borderColor: "var(--border)", background: "var(--surface)", color: selected ? "var(--text-900)" : "var(--text-subtle)" }}
      >
        <span className="truncate">
          {selected ? `${selected.kode} — ${selected.nama}` : placeholder}
        </span>
        <ChevronDown className="h-3 w-3 shrink-0" style={{ color: "var(--text-subtle)" }} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-72 max-w-[90vw] rounded-lg shadow-lg border overflow-hidden"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="p-1.5 border-b" style={{ borderColor: "var(--border)" }}>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3" style={{ color: "var(--text-subtle)" }} />
              <input
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari kode/nama akun…"
                className="w-full text-xs rounded pl-7 pr-2 py-1.5 border"
                style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-900)" }}
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs" style={{ color: "var(--text-subtle)" }}>Tidak ada akun</p>
            )}
            {filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => { onChange(String(o.id)); setOpen(false); setSearch("") }}
                className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors"
                style={{ background: String(o.id) === value ? "var(--primary-light)" : "transparent", color: "var(--text-900)" }}
                onMouseEnter={(e) => { if (String(o.id) !== value) (e.currentTarget as HTMLElement).style.background = "var(--surface-muted)" }}
                onMouseLeave={(e) => { if (String(o.id) !== value) (e.currentTarget as HTMLElement).style.background = "transparent" }}
              >
                <span className="font-mono shrink-0" style={{ color: "var(--text-subtle)" }}>{o.kode}</span>
                <span className="truncate">{o.nama}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
