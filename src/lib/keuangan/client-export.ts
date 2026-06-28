"use client"

function escapeCsv(value: unknown): string {
  const text = value == null ? "" : String(value)
  if (!/[",\n]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}

export function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return
  const headers = Object.keys(rows[0])
  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escapeCsv(row[h])).join(",")),
  ].join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function printToPdf(title?: string) {
  const main = document.querySelector("main")
  const printTitle = title ?? document.querySelector("h1")?.textContent ?? "Laporan Keuangan"
  document.body.classList.add("finance-print")
  main?.setAttribute("data-print-title", printTitle)
  main?.setAttribute("data-print-date", new Date().toLocaleString("id-ID"))

  const cleanup = () => {
    document.body.classList.remove("finance-print")
    main?.removeAttribute("data-print-title")
    main?.removeAttribute("data-print-date")
    window.removeEventListener("afterprint", cleanup)
  }

  window.addEventListener("afterprint", cleanup)
  window.print()
  window.setTimeout(cleanup, 500)
}
