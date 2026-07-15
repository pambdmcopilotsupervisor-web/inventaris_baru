"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { SelectField, TextField } from "@/components/ui/form-field"
import { ArrowLeftRight, Plus, Wand2, CheckCircle2, AlertCircle, RefreshCw, ChevronRight } from "lucide-react"
import { getAkun, type AkunRow } from "@/actions/keuangan-akun"
import { getPeriodeFiskal, type PeriodeFiskalRow } from "@/actions/keuangan-periode"
import {
  getRekonsiliasiList, getRekonsiliasiDetail, createRekonsiliasi, addRekonsiliasiItem,
  matchItem, autoMatch, updateSaldoBank, selesaiRekonsiliasi,
  type RekonsiliasiRow, type RekonsiliasiItem,
} from "@/actions/keuangan-rekonsiliasi"
import { rp, formatThousand, parseThousand } from "@/lib/keuangan/format"

const STATUS_VARIANT: Record<string, string> = { DRAFT: "secondary", SELESAI: "success" }
const COCOK_VARIANT: Record<string, string> = { BELUM: "secondary", COCOK: "success", BEDA: "warning" }

export default function RekonsiliasiPage() {
  const now = new Date()
  const [list, setList] = useState<RekonsiliasiRow[]>([])
  const [akuns, setAkuns] = useState<AkunRow[]>([])
  const [periods, setPeriods] = useState<PeriodeFiskalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null)

  // Form buat baru
  const [createOpen, setCreateOpen] = useState(false)
  const [formAkun, setFormAkun] = useState("")
  const [formPeriode, setFormPeriode] = useState("")
  const [formSaldoBank, setFormSaldoBank] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Detail view
  const [activeId, setActiveId] = useState<number | null>(null)
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getRekonsiliasiDetail>>["data"] | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Tambah item bank
  const [addItemOpen, setAddItemOpen] = useState(false)
  const [bankRow, setBankRow] = useState({ tanggal: now.toISOString().split("T")[0], keterangan: "", debit: "", kredit: "" })
  const [addingItem, setAddingItem] = useState(false)
  const [matchOpen, setMatchOpen] = useState(false)
  const [targetItem, setTargetItem] = useState<RekonsiliasiItem | null>(null)
  const [matchStatus, setMatchStatus] = useState<"COCOK" | "BEDA">("COCOK")
  const [selectedJurnalId, setSelectedJurnalId] = useState("")
  const [matching, setMatching] = useState(false)

  const loadList = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await getRekonsiliasiList()
    if (res.success) setList(res.data)
    else setError(res.error)
    setLoading(false)
  }, [])

  useEffect(() => {
    Promise.all([
      getAkun({ is_detail: true, is_active: true }),
      getPeriodeFiskal(),
      loadList(),
    ]).then(([a, p]) => {
      if (a.success) setAkuns(a.data.filter((x) => ["1.1.1", "1.1.2"].some((k) => x.kode === k) || x.jenis === "ASET"))
      if (p.success) setPeriods(p.data)
    })
  }, [loadList])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 4500)
    return () => clearTimeout(t)
  }, [notice])

  const loadDetail = async (id: number) => {
    setDetailLoading(true); setActiveId(id)
    const res = await getRekonsiliasiDetail(id)
    if (res.success) setDetail(res.data)
    setDetailLoading(false)
  }

  async function handleCreate() {
    if (!formAkun || !formPeriode) { setCreateError("Pilih akun dan periode"); return }
    setCreating(true); setCreateError(null)
    const res = await createRekonsiliasi({
      akun_id: Number(formAkun), periode_id: Number(formPeriode), saldo_bank: parseThousand(formSaldoBank),
    })
    setCreating(false)
    if (res.success) {
      setCreateOpen(false)
      setNotice({ type: "success", message: "Rekonsiliasi baru berhasil dibuat" })
      await loadList()
      loadDetail(res.data.id)
    }
    else setCreateError(res.error)
  }

  async function handleAddItem() {
    if (!activeId) return
    setAddingItem(true)
    const res = await addRekonsiliasiItem(activeId, [{
      tanggal: bankRow.tanggal, keterangan: bankRow.keterangan,
      debit: parseThousand(bankRow.debit), kredit: parseThousand(bankRow.kredit),
    }])
    setAddingItem(false)
    if (res.success) {
      setAddItemOpen(false)
      setNotice({ type: "success", message: "Mutasi bank berhasil ditambahkan" })
      setBankRow({ tanggal: now.toISOString().split("T")[0], keterangan: "", debit: "", kredit: "" })
      loadDetail(activeId)
    } else setNotice({ type: "error", message: res.error })
  }

  async function handleAutoMatch() {
    if (!activeId) return
    const res = await autoMatch(activeId)
    if (res.success) {
      await loadDetail(activeId)
      setNotice({ type: "success", message: `Auto-match selesai: ${res.data.matched} item berhasil dicocokkan` })
    } else setNotice({ type: "error", message: res.error })
  }

  async function handleOpenMatch(item: RekonsiliasiItem) {
    if (!detail?.jurnal_rows.length) { setNotice({ type: "error", message: "Tidak ada transaksi buku yang tersedia untuk dicocokkan" }); return }
    setTargetItem(item)
    setMatchStatus("COCOK")
    setSelectedJurnalId("")
    setMatchOpen(true)
  }

  async function handleSubmitMatch() {
    if (!targetItem) return
    if (matchStatus === "COCOK" && !selectedJurnalId) {
      setNotice({ type: "error", message: "Pilih transaksi buku terlebih dahulu" })
      return
    }
    setMatching(true)
    const res = await matchItem(targetItem.id, matchStatus === "COCOK" ? Number(selectedJurnalId) : null, matchStatus)
    setMatching(false)
    if (!res.success) {
      setNotice({ type: "error", message: res.error })
      return
    }
    setMatchOpen(false)
    setTargetItem(null)
    setNotice({ type: "success", message: matchStatus === "COCOK" ? "Item berhasil dicocokkan" : "Item ditandai sebagai BEDA" })
    if (activeId) loadDetail(activeId)
  }

  const periodeOptions = useMemo(() => [
    { value: "", label: "— Pilih Periode —" },
    ...periods.map((p) => ({ value: String(p.id), label: p.nama })),
  ], [periods])

  const akunOptions = useMemo(() => [
    { value: "", label: "— Pilih Akun Bank —" },
    ...akuns.map((a) => ({ value: String(a.id), label: `${a.kode} — ${a.nama}` })),
  ], [akuns])

  const active = detail?.header

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 min-h-screen">
      {/* Panel kiri: daftar rekonsiliasi */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5" style={{ color: "var(--primary)" }} />
            <h1 className="text-base font-semibold" style={{ color: "var(--text-900)" }}>Rekonsiliasi Bank</h1>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={loadList}><RefreshCw className="h-3.5 w-3.5" /></Button>
            <Button size="sm" onClick={() => { setCreateError(null); setCreateOpen(true) }}><Plus className="h-4 w-4" /></Button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-14 rounded-lg animate-pulse" style={{ background: "var(--surface-muted)" }} />)}</div>
        ) : list.length === 0 ? (
          <p className="text-sm py-4 text-center" style={{ color: "var(--text-subtle)" }}>Belum ada rekonsiliasi</p>
        ) : (
          list.map((r) => (
            <button key={r.id} onClick={() => loadDetail(r.id)}
              className="w-full text-left rounded-xl p-3 space-y-1 transition-colors"
              style={{ background: activeId === r.id ? "var(--primary-light)" : "var(--surface)", border: `1px solid ${activeId === r.id ? "var(--primary)" : "var(--border)"}` }}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: activeId === r.id ? "var(--primary)" : "var(--text-900)" }}>
                  {r.kode_akun} — {r.nama_akun}
                </span>
                <Badge variant={STATUS_VARIANT[r.status] as never}>{r.status}</Badge>
              </div>
              <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{r.nama_periode}</p>
              <div className="flex justify-between text-xs">
                <span style={{ color: "var(--text-subtle)" }}>{r.cocok_count}/{r.item_count} cocok</span>
                <span style={{ color: Math.abs(r.selisih) < 1 ? "rgb(5,150,105)" : "rgb(220,38,38)", fontWeight: 600 }}>
                  Selisih: {rp(r.selisih)}
                </span>
              </div>
            </button>
          ))
        )}
      </div>

      {notice && (
        <div className="fixed right-4 top-20 z-50 max-w-sm w-[calc(100%-2rem)] rounded-lg px-3 py-2 text-xs shadow-lg"
          style={{
            background: notice.type === "success" ? "rgba(5,150,105,0.95)" : "rgba(220,38,38,0.95)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.18)",
          }}>
          <div className="flex items-start justify-between gap-2">
            <span>{notice.message}</span>
            <button type="button" onClick={() => setNotice(null)} className="text-[11px] leading-none opacity-85 hover:opacity-100">✕</button>
          </div>
        </div>
      )}

      {/* Panel kanan: detail */}
      <div className="lg:col-span-2 space-y-4">
        {!activeId && (
          <div className="flex items-center justify-center h-48 rounded-xl" style={{ border: "1px dashed var(--border)" }}>
            <p className="text-sm" style={{ color: "var(--text-subtle)" }}>Pilih rekonsiliasi untuk melihat detail</p>
          </div>
        )}

        {activeId && detailLoading && (
          <div className="space-y-2">{[1,2,3,4].map((i) => <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: "var(--surface-muted)" }} />)}</div>
        )}

        {activeId && !detailLoading && detail && active && (
          <>
            {/* Header info */}
            <div className="rounded-xl p-4 space-y-2" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="font-semibold" style={{ color: "var(--text-900)" }}>{active.kode_akun} — {active.nama_akun}</p>
                  <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{active.nama_periode}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={handleAutoMatch}><Wand2 className="h-3.5 w-3.5 mr-1" />Auto-Match</Button>
                  <Button size="sm" onClick={() => setAddItemOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" />Tambah Mutasi</Button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                {[
                  { label: "Saldo Buku", val: active.saldo_buku, color: "rgb(37,99,235)" },
                  { label: "Saldo Bank", val: active.saldo_bank, color: "rgb(5,150,105)" },
                  { label: "Selisih", val: active.selisih, color: Math.abs(active.selisih) < 1 ? "rgb(5,150,105)" : "rgb(220,38,38)" },
                ].map(({ label, val, color }) => (
                  <div key={label} className="rounded-lg p-3" style={{ background: "var(--surface-muted)" }}>
                    <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{label}</p>
                    <p className="font-bold mt-0.5" style={{ color }}>{rp(val)}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Tabel mutasi bank */}
            {detail.items.length === 0 ? (
              <p className="text-sm py-4 text-center" style={{ color: "var(--text-subtle)" }}>Belum ada mutasi bank. Klik "Tambah Mutasi" untuk mulai.</p>
            ) : (
              <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: "var(--surface-muted)" }}>
                      <th className="text-left p-2 font-semibold">Tanggal</th>
                      <th className="text-left p-2 font-semibold">Keterangan</th>
                      <th className="text-right p-2 font-semibold">Debit</th>
                      <th className="text-right p-2 font-semibold">Kredit</th>
                      <th className="text-center p-2 font-semibold">Status</th>
                      <th className="p-2 w-16" />
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((item) => (
                      <tr key={item.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="p-2">{new Date(item.tanggal).toLocaleDateString("id-ID")}</td>
                        <td className="p-2 max-w-xs truncate">{item.keterangan}</td>
                        <td className="p-2 text-right">{item.debit > 0 ? rp(item.debit) : "—"}</td>
                        <td className="p-2 text-right">{item.kredit > 0 ? rp(item.kredit) : "—"}</td>
                        <td className="p-2 text-center">
                          <Badge variant={COCOK_VARIANT[item.status_cocok] as never}>{item.status_cocok}</Badge>
                        </td>
                        <td className="p-1">
                          {item.status_cocok === "BELUM" && (
                            <Button size="sm" variant="ghost" onClick={() => handleOpenMatch(item)}>
                              <ChevronRight className="h-3 w-3" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Transaksi buku belum dicocokkan */}
            {detail.jurnal_rows.length > 0 && (
              <div className="rounded-xl p-3 space-y-2" style={{ background: "rgba(217,119,6,0.06)", border: "1px solid rgba(217,119,6,0.2)" }}>
                <p className="text-xs font-semibold" style={{ color: "rgb(180,83,9)" }}>
                  {detail.jurnal_rows.length} transaksi buku belum dicocokkan
                </p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {detail.jurnal_rows.map((j) => (
                    <div key={j.id} className="flex justify-between text-xs py-0.5" style={{ color: "var(--text-subtle)" }}>
                      <span>{new Date(j.tanggal).toLocaleDateString("id-ID")} — {j.nomor_jurnal} — {j.keterangan}</span>
                      <span className="font-mono">{rp(j.debit + j.kredit)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {active.status === "DRAFT" && Math.abs(active.selisih) < 1 && detail.items.filter((i) => i.status_cocok === "BELUM").length === 0 && (
              <div className="flex justify-end">
                <Button
                  onClick={async () => {
                    const res = await selesaiRekonsiliasi(active.id)
                    if (res.success) {
                      setNotice({ type: "success", message: "Rekonsiliasi berhasil ditandai selesai" })
                      await loadList()
                      loadDetail(active.id)
                    } else setNotice({ type: "error", message: res.error })
                  }}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />Tandai Selesai
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal buat rekonsiliasi baru */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Buat Rekonsiliasi Baru" size="sm">
        <div className="space-y-3">
          <SelectField label="Akun Bank *" value={formAkun} onChange={(e) => setFormAkun(e.target.value)} options={akunOptions} />
          <SelectField label="Periode Fiskal *" value={formPeriode} onChange={(e) => setFormPeriode(e.target.value)} options={periodeOptions} />
          <TextField label="Saldo Bank Fisik (Rp)" value={formSaldoBank} onChange={(e) => setFormSaldoBank(formatThousand(e.target.value))} inputMode="numeric" placeholder="Saldo rekening per akhir periode" />
          {createError && <p className="text-sm" style={{ color: "rgb(220,38,38)" }}>{createError}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Batal</Button>
            <Button onClick={handleCreate} disabled={creating}>{creating ? "Memproses…" : "Buat"}</Button>
          </div>
        </div>
      </Modal>

      {/* Modal tambah mutasi bank */}
      <Modal open={addItemOpen} onClose={() => setAddItemOpen(false)} title="Tambah Mutasi Bank" size="sm">
        <div className="space-y-3">
          <TextField label="Tanggal" value={bankRow.tanggal} onChange={(e) => setBankRow({ ...bankRow, tanggal: e.target.value })} type="date" />
          <TextField label="Keterangan" value={bankRow.keterangan} onChange={(e) => setBankRow({ ...bankRow, keterangan: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Debit (Rp)" value={bankRow.debit} onChange={(e) => setBankRow({ ...bankRow, debit: formatThousand(e.target.value) })} inputMode="numeric" placeholder="0" />
            <TextField label="Kredit (Rp)" value={bankRow.kredit} onChange={(e) => setBankRow({ ...bankRow, kredit: formatThousand(e.target.value) })} inputMode="numeric" placeholder="0" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setAddItemOpen(false)}>Batal</Button>
            <Button onClick={handleAddItem} disabled={addingItem}>{addingItem ? "Menambah…" : "Tambah"}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={matchOpen} onClose={() => setMatchOpen(false)} title="Cocokkan Mutasi Bank" size="md">
        <div className="space-y-4">
          {targetItem && (
            <div className="rounded-lg p-3" style={{ border: "1px solid var(--border)", background: "var(--surface-muted)" }}>
              <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Mutasi dipilih</p>
              <p className="text-sm font-medium" style={{ color: "var(--text-900)" }}>{new Date(targetItem.tanggal).toLocaleDateString("id-ID")} · {targetItem.keterangan}</p>
              <p className="text-sm font-mono" style={{ color: "var(--text-900)" }}>Debit {rp(targetItem.debit)} · Kredit {rp(targetItem.kredit)}</p>
            </div>
          )}

          <SelectField
            label="Status"
            value={matchStatus}
            onChange={(e) => setMatchStatus(e.target.value as "COCOK" | "BEDA")}
            options={[{ value: "COCOK", label: "Cocokkan ke transaksi buku" }, { value: "BEDA", label: "Tandai sebagai BEDA" }]}
          />

          {matchStatus === "COCOK" && (
            <SelectField
              label="Transaksi Buku"
              value={selectedJurnalId}
              onChange={(e) => setSelectedJurnalId(e.target.value)}
              options={[
                { value: "", label: "— Pilih transaksi buku —" },
                ...(detail?.jurnal_rows ?? []).slice(0, 30).map((j) => ({
                  value: String(j.id),
                  label: `${new Date(j.tanggal).toLocaleDateString("id-ID")} · ${j.nomor_jurnal} · ${rp(j.debit + j.kredit)}`,
                })),
              ]}
            />
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setMatchOpen(false)} disabled={matching}>Batal</Button>
            <Button onClick={handleSubmitMatch} disabled={matching}>{matching ? "Memproses..." : "Simpan"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
