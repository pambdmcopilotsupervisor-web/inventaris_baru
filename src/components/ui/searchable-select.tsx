"use client"

import React, { useState, useRef, useEffect } from "react"
import { Search, X, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { FormField } from "./form-field"

export interface SearchableOption {
  value: string
  label: string
  description?: string
}

interface SearchableSelectProps {
  label: string
  required?: boolean
  error?: string
  value: string
  onChange: (value: string) => void
  options: SearchableOption[]
  placeholder?: string
  searchPlaceholder?: string
  disabled?: boolean
  className?: string
  loading?: boolean
}

export function SearchableSelect({
  label, required, error, value, onChange, options,
  placeholder = "— Pilih —",
  searchPlaceholder = "Cari...",
  disabled = false, className, loading = false,
}: SearchableSelectProps) {
  const [open, setOpen]       = useState(false)
  const [search, setSearch]   = useState("")
  const containerRef          = useRef<HTMLDivElement>(null)
  const inputRef              = useRef<HTMLInputElement>(null)

  const selectedOption = options.find(o => o.value === value)

  // Filter options based on search
  const filtered = search.trim().length === 0
    ? options.slice(0, 50)  // show first 50 when no search
    : options.filter(o =>
        o.label.toLowerCase().includes(search.toLowerCase()) ||
        (o.description ?? "").toLowerCase().includes(search.toLowerCase())
      ).slice(0, 50)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch("")
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  const handleSelect = (optValue: string) => {
    onChange(optValue)
    setOpen(false)
    setSearch("")
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange("")
    setOpen(false)
    setSearch("")
  }

  return (
    <FormField label={label} required={required} error={error} className={className}>
      <div ref={containerRef} className="relative">
        {/* Trigger button */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setOpen(!open)}
          className="flex h-8 w-full items-center justify-between rounded-lg px-3 text-sm transition-all duration-150 focus:outline-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            border: `1px solid ${error ? "var(--danger)" : open ? "var(--primary)" : "var(--border-strong)"}`,
            background: disabled ? "var(--surface-muted)" : "var(--surface)",
            color: selectedOption ? "var(--text-900)" : "var(--text-subtle)",
          }}
        >
          <span className="truncate text-left flex-1 min-w-0">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            {value && !disabled && (
              <span
                onClick={handleClear}
                className="flex h-4 w-4 items-center justify-center rounded cursor-pointer hover:bg-gray-100"
                style={{ color: "var(--text-subtle)" }}
              >
                <X className="h-3 w-3" />
              </span>
            )}
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform duration-150", open && "rotate-180")}
              style={{ color: "var(--text-subtle)" }}
            />
          </div>
        </button>

        {/* Dropdown */}
        {open && (
          <div
            className="absolute z-[200] mt-1 w-full rounded-xl shadow-xl overflow-hidden"
            style={{
              border: "1px solid var(--border)",
              background: "var(--surface)",
              minWidth: 220,
            }}
          >
            {/* Search input */}
            <div className="p-2" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--text-subtle)" }} />
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none"
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--surface-muted)",
                    color: "var(--text-900)",
                    fontFamily: "var(--font-body)",
                  }}
                />
              </div>
            </div>

            {/* Options list */}
            <div style={{ maxHeight: 240, overflowY: "auto" }}>
              {loading ? (
                <div className="px-4 py-3 text-xs" style={{ color: "var(--text-subtle)" }}>Memuat data...</div>
              ) : filtered.length === 0 ? (
                <div className="px-4 py-3 text-xs" style={{ color: "var(--text-subtle)" }}>
                  {search ? `Tidak ada hasil untuk "${search}"` : "Tidak ada data"}
                </div>
              ) : (
                filtered.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className="flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-sm text-left transition-colors duration-100 cursor-pointer"
                    style={{
                      borderBottom: "1px solid var(--border)",
                      background: opt.value === value ? "var(--primary-light)" : "transparent",
                    }}
                    onMouseEnter={e => {
                      if (opt.value !== value) (e.currentTarget as HTMLElement).style.background = "var(--surface-hover)"
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.background = opt.value === value ? "var(--primary-light)" : "transparent"
                    }}
                  >
                    <span
                      className="font-medium leading-tight"
                      style={{ color: opt.value === value ? "var(--primary)" : "var(--text-900)" }}
                    >
                      {opt.label}
                    </span>
                    {opt.description && (
                      <span className="text-xs leading-tight" style={{ color: "var(--text-subtle)" }}>
                        {opt.description}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </FormField>
  )
}
