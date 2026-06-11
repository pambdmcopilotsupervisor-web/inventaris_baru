"use client"

import React, { useState } from "react"
import { Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface Column<T> {
  key: string
  header: string
  cell?: (row: T) => React.ReactNode
  className?: string
}

interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  searchable?: boolean
  searchKeys?: string[]
  actions?: (row: T) => React.ReactNode
  loading?: boolean
  emptyMessage?: string
}

export function DataTable<T extends Record<string, unknown>>({
  data, columns, searchable = true, searchKeys = [], actions, loading = false, emptyMessage = "Tidak ada data",
}: DataTableProps<T>) {
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const perPage = 10

  const filtered = searchable && search
    ? data.filter((row) => searchKeys.some((k) => String(row[k] ?? "").toLowerCase().includes(search.toLowerCase())))
    : data

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const paginated = filtered.slice((page - 1) * perPage, page * perPage)

  return (
    <div className="space-y-3">
      {searchable && (
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--text-subtle)" }} />
          <Input
            placeholder="Cari data..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9 h-8 text-sm"
          />
        </div>
      )}

      {/* Table — overflow-x-auto: UX guideline for mobile tables */}
      <div className="rounded-xl overflow-hidden overflow-x-auto" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
        <table className="w-full caption-bottom text-sm">
          <thead>
            <tr style={{ background: "var(--surface-muted)", borderBottom: "1px solid var(--border)" }}>
              <th className="w-10 px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>#</th>
              {columns.map((col) => (
                <th key={col.key} className={cn("px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide", col.className)} style={{ color: "var(--text-subtle)" }}>
                  {col.header}
                </th>
              ))}
              {actions && <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wide w-28" style={{ color: "var(--text-subtle)" }}>Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td colSpan={columns.length + (actions ? 2 : 1)} className="p-4">
                  <div className="h-4 rounded-md animate-pulse" style={{ background: "var(--primary-light)" }} />
                </td></tr>
              ))
            ) : paginated.length === 0 ? (
              <tr><td colSpan={columns.length + (actions ? 2 : 1)} className="py-16 text-center text-sm" style={{ color: "var(--text-subtle)" }}>
                {emptyMessage}
              </td></tr>
            ) : (
              paginated.map((row, i) => (
                <tr
                  key={i}
                  className="transition-colors duration-150"
                  style={{ borderBottom: "1px solid var(--border)" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--surface-hover)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                >
                  <td className="px-4 py-3 text-center text-xs" style={{ color: "var(--text-subtle)" }}>
                    {(page - 1) * perPage + i + 1}
                  </td>
                  {columns.map((col) => (
                    <td key={col.key} className={cn("px-4 py-3", col.className)} style={{ color: "var(--text-900)" }}>
                      {col.cell ? col.cell(row) : String(row[col.key] ?? "—")}
                    </td>
                  ))}
                  {actions && <td className="px-4 py-3 text-center">{actions(row)}</td>}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
            {(page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} dari {filtered.length} data
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => setPage(1)} disabled={page === 1} className="h-7 w-7"><ChevronsLeft className="h-3.5 w-3.5" /></Button>
            <Button variant="outline" size="icon" onClick={() => setPage(page - 1)} disabled={page === 1} className="h-7 w-7"><ChevronLeft className="h-3.5 w-3.5" /></Button>
            <span className="px-3 text-xs font-medium" style={{ color: "var(--text-700)" }}>{page} / {totalPages}</span>
            <Button variant="outline" size="icon" onClick={() => setPage(page + 1)} disabled={page === totalPages} className="h-7 w-7"><ChevronRight className="h-3.5 w-3.5" /></Button>
            <Button variant="outline" size="icon" onClick={() => setPage(totalPages)} disabled={page === totalPages} className="h-7 w-7"><ChevronsRight className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      )}
    </div>
  )
}
