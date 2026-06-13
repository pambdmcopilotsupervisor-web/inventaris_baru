"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { DataTable, Column } from "@/components/ui/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { ConfirmDelete } from "@/components/ui/confirm-delete"
import { TextField, TextareaField, FormField } from "@/components/ui/form-field"
import { useApi } from "@/hooks/useApi"
import { Plus, Pencil, Trash2, RefreshCw, LocateFixed, MapPin, Ruler } from "lucide-react"

type LokasiConfig = {
  id: number
  nama_lokasi: string
  latitude: number | string
  longitude: number | string
  radius_meter: number
  aktif: boolean
  keterangan: string | null
  created_at?: string | null
  updated_at?: string | null
}

type LokasiForm = {
  nama_lokasi: string
  latitude: string
  longitude: string
  radius_meter: string
  aktif: boolean
  keterangan: string
}

declare global {
  interface Window {
    L?: {
      map: (el: HTMLElement) => LeafletMap
      tileLayer: (url: string, options: Record<string, unknown>) => { addTo: (map: LeafletMap) => void }
      marker: (latlng: [number, number]) => LeafletLayer & { bindPopup: (html: string) => void }
      circle: (latlng: [number, number], options: Record<string, unknown>) => LeafletLayer
      circleMarker: (latlng: [number, number], options: Record<string, unknown>) => LeafletLayer
      layerGroup: () => LeafletLayerGroup
      icon: (options: Record<string, unknown>) => unknown
    }
  }
}

type LeafletMap = {
  setView: (latlng: [number, number], zoom: number) => void
  on: (eventName: string, handler: (evt: { latlng?: { lat: number; lng: number } }) => void) => void
  off: (eventName: string) => void
  remove: () => void
  fitBounds: (bounds: [[number, number], [number, number]], options?: Record<string, unknown>) => void
}

type LeafletLayer = {
  addTo: (target: LeafletLayerGroup) => void
  on?: (eventName: string, handler: () => void) => void
}

type LeafletLayerGroup = {
  addTo: (map: LeafletMap) => void
  clearLayers: () => void
}

let leafletLoader: Promise<void> | null = null

function loadLeaflet(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve()
  if (window.L) return Promise.resolve()
  if (leafletLoader) return leafletLoader

  leafletLoader = new Promise<void>((resolve, reject) => {
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link")
      link.id = "leaflet-css"
      link.rel = "stylesheet"
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      link.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
      link.crossOrigin = ""
      document.head.appendChild(link)
    }

    const existing = document.getElementById("leaflet-js") as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true })
      existing.addEventListener("error", () => reject(new Error("Gagal memuat Leaflet")), { once: true })
      return
    }

    const script = document.createElement("script")
    script.id = "leaflet-js"
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
    script.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
    script.crossOrigin = ""
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("Gagal memuat Leaflet"))
    document.body.appendChild(script)
  })

  return leafletLoader
}

const EMPTY_FORM: LokasiForm = {
  nama_lokasi: "",
  latitude: "",
  longitude: "",
  radius_meter: "100",
  aktif: true,
  keterangan: "",
}

function toNum(v: number | string | null | undefined): number {
  if (typeof v === "number") return v
  if (!v) return 0
  return Number(v)
}

export default function LokasiConfigPage() {
  const { data, loading, refetch } = useApi<LokasiConfig[]>("/api/sdm/absensi/lokasi-config")
  const list = useMemo(() => data ?? [], [data])

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [pickedPoint, setPickedPoint] = useState<{ lat: number; lng: number } | null>(null)
  const [pickingMode, setPickingMode] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState<LokasiForm>(EMPTY_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const selected = useMemo(() => {
    if (list.length === 0) return null
    if (selectedId != null) {
      const byId = list.find((x) => x.id === selectedId)
      if (byId) return byId
    }
    return list.find((x) => x.aktif) ?? list[0]
  }, [list, selectedId])

  const stats = useMemo(() => {
    const aktifCount = list.filter((x) => x.aktif).length
    const avgRadius = list.length > 0
      ? Math.round(list.reduce((sum, x) => sum + Number(x.radius_meter || 0), 0) / list.length)
      : 0
    return { total: list.length, aktif: aktifCount, avgRadius }
  }, [list])

  const setField = <K extends keyof LokasiForm>(k: K, v: LokasiForm[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }))

  const openAdd = () => {
    setEditMode(false)
    setErrors({})
    setPickingMode(false)
    setForm({
      ...EMPTY_FORM,
      latitude: pickedPoint ? pickedPoint.lat.toFixed(7) : "",
      longitude: pickedPoint ? pickedPoint.lng.toFixed(7) : "",
    })
    setModalOpen(true)
  }

  const openEdit = (row: LokasiConfig) => {
    setEditMode(true)
    setSelectedId(row.id)
    setErrors({})
    setPickingMode(false)
    setForm({
      nama_lokasi: row.nama_lokasi,
      latitude: toNum(row.latitude).toFixed(7),
      longitude: toNum(row.longitude).toFixed(7),
      radius_meter: String(row.radius_meter ?? 100),
      aktif: !!row.aktif,
      keterangan: row.keterangan ?? "",
    })
    setModalOpen(true)
  }

  const applyPickedPoint = () => {
    if (!pickedPoint) return
    setField("latitude", pickedPoint.lat.toFixed(7))
    setField("longitude", pickedPoint.lng.toFixed(7))
  }

  const validateForm = () => {
    const e: Record<string, string> = {}
    if (!form.nama_lokasi.trim()) e.nama_lokasi = "Nama lokasi wajib diisi"

    const lat = Number(form.latitude)
    const lng = Number(form.longitude)
    const radius = Number(form.radius_meter)

    if (Number.isNaN(lat)) e.latitude = "Latitude tidak valid"
    if (Number.isNaN(lng)) e.longitude = "Longitude tidak valid"
    if (!Number.isNaN(lat) && (lat < -90 || lat > 90)) e.latitude = "Latitude harus di rentang -90 s/d 90"
    if (!Number.isNaN(lng) && (lng < -180 || lng > 180)) e.longitude = "Longitude harus di rentang -180 s/d 180"
    if (Number.isNaN(radius) || radius <= 0) e.radius_meter = "Radius harus lebih dari 0"

    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async () => {
    if (!validateForm()) return

    setSaving(true)
    try {
      const payload = {
        nama_lokasi: form.nama_lokasi,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        radius_meter: Number(form.radius_meter),
        aktif: form.aktif,
        keterangan: form.keterangan,
      }

      const url = editMode && selected
        ? `/api/sdm/absensi/lokasi-config/${selected.id}`
        : "/api/sdm/absensi/lokasi-config"
      const method = editMode ? "PUT" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrors({ _: json.error ?? "Gagal menyimpan data lokasi" })
        return
      }

      setModalOpen(false)
      setForm(EMPTY_FORM)
      setErrors({})
      refetch()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selected) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/sdm/absensi/lokasi-config/${selected.id}`, { method: "DELETE" })
      if (res.ok) {
        setDeleteOpen(false)
        setSelectedId(null)
        refetch()
      }
    } finally {
      setDeleting(false)
    }
  }

  const columns: Column<LokasiConfig>[] = [
    {
      key: "nama_lokasi",
      header: "Lokasi",
      cell: (r) => (
        <div>
          <p className="font-semibold text-sm">{r.nama_lokasi}</p>
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{r.keterangan || "Tanpa keterangan"}</p>
        </div>
      ),
    },
    {
      key: "latitude",
      header: "Koordinat",
      cell: (r) => (
        <div className="font-mono text-xs" style={{ color: "var(--text-900)" }}>
          {toNum(r.latitude).toFixed(6)}, {toNum(r.longitude).toFixed(6)}
        </div>
      ),
    },
    {
      key: "radius_meter",
      header: "Radius",
      cell: (r) => (
        <div className="flex items-center gap-1.5">
          <Ruler className="h-3.5 w-3.5" style={{ color: "var(--text-subtle)" }} />
          <span className="font-mono text-xs">{r.radius_meter} m</span>
        </div>
      ),
    },
    {
      key: "aktif",
      header: "Status",
      cell: (r) => <Badge variant={r.aktif ? "success" : "secondary"}>{r.aktif ? "Aktif" : "Nonaktif"}</Badge>,
    },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-900)" }}>Lokasi Absensi Mobile</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
            Kelola titik lokasi absensi, koordinat peta, dan radius validasi untuk aplikasi mobile.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1.5" />Tambah Lokasi</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Total Lokasi" value={String(stats.total)} color="var(--primary)" />
        <StatCard label="Lokasi Aktif" value={String(stats.aktif)} color="var(--success)" />
        <StatCard label="Rata-rata Radius" value={`${stats.avgRadius} m`} color="var(--text-900)" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <div className="xl:col-span-3 rounded-xl p-3" style={{ background: "var(--surface)", border: "1px solid var(--border)", position: "relative", zIndex: 1 }}>
          <div className="mb-2 flex gap-2">
            <Button 
              size="sm" 
              variant={pickingMode ? "default" : "outline"}
              onClick={() => setPickingMode(!pickingMode)}
            >
              <MapPin className="h-3.5 w-3.5 mr-1.5" />
              {pickingMode ? "Batal Pilih Titik" : "Pilih Titik dari Peta"}
            </Button>
            {pickingMode && (
              <span className="text-xs flex items-center" style={{ color: "var(--warning)" }}>
                🎯 Mode picking aktif - klik peta untuk pilih titik
              </span>
            )}
          </div>
          <MapPreview
            list={list}
            selected={selected}
            pickedPoint={pickedPoint}
            pickingMode={pickingMode}
            onPickPoint={(lat, lng) => setPickedPoint({ lat, lng })}
            onSelectPoint={(id) => {
              setSelectedId(id)
            }}
          />
          <p className="text-xs mt-2" style={{ color: "var(--text-subtle)" }}>
            {pickingMode 
              ? "Mode picking aktif: klik peta untuk pilih titik baru. Lingkaran menunjukkan radius absensi."
              : "Klik 'Pilih Titik dari Peta' untuk memasuki mode picking. Lingkaran menunjukkan radius absensi."
            }
          </p>
        </div>

        <div className="xl:col-span-2 rounded-xl p-4 space-y-2" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-900)" }}>Titik Dipilih</h2>
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
            {pickedPoint
              ? `${pickedPoint.lat.toFixed(7)}, ${pickedPoint.lng.toFixed(7)}`
              : "Belum ada titik dipilih dari peta"}
          </p>
          <div className="pt-1">
            <Button variant="outline" size="sm" onClick={() => setPickedPoint(null)} disabled={!pickedPoint}>Reset Titik</Button>
          </div>

          {selected && (
            <div className="mt-3 rounded-lg p-3" style={{ background: "var(--surface-muted)", border: "1px dashed var(--border)" }}>
              <p className="text-xs font-semibold" style={{ color: "var(--text-900)" }}>Detail Lokasi Terpilih</p>
              <div className="mt-2 space-y-1.5 text-xs" style={{ color: "var(--text-subtle)" }}>
                <p><strong>Nama:</strong> {selected.nama_lokasi}</p>
                <p><strong>Koordinat:</strong> {toNum(selected.latitude).toFixed(7)}, {toNum(selected.longitude).toFixed(7)}</p>
                <p><strong>Radius:</strong> {selected.radius_meter} meter</p>
                <p><strong>Status:</strong> {selected.aktif ? "Aktif" : "Nonaktif"}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <DataTable
        data={list as unknown as Record<string, unknown>[]}
        columns={columns as unknown as Column<Record<string, unknown>>[]}
        searchKeys={["nama_lokasi", "keterangan"]}
        loading={loading}
        emptyMessage="Belum ada lokasi absensi mobile"
        actions={(row: Record<string, unknown>) => {
          const r = row as unknown as LokasiConfig
          return (
            <div className="flex items-center justify-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                style={{ color: "var(--info)" }}
                onClick={() => setSelectedId(r.id)}
                title="Fokus ke peta"
              >
                <MapPin className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                style={{ color: "var(--warning)" }}
                onClick={() => openEdit(r)}
                title="Edit"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                style={{ color: "var(--danger)" }}
                onClick={() => {
                  setSelectedId(r.id)
                  setDeleteOpen(true)
                }}
                title="Hapus"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )
        }}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editMode ? "Edit Lokasi Absensi" : "Tambah Lokasi Absensi"}
        description="Simpan koordinat titik absensi dan radius validasi (meter)."
        size="lg"
        footer={(
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
            <Button onClick={handleSubmit} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </>
        )}
      >
        {errors._ && (
          <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
            {errors._}
          </div>
        )}

        <div className="space-y-4">
          <TextField
            label="Nama Lokasi"
            required
            error={errors.nama_lokasi}
            value={form.nama_lokasi}
            onChange={(e) => setField("nama_lokasi", e.target.value)}
            placeholder="Contoh: Kantor Pusat PEDAMI"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TextField
              label="Latitude"
              required
              error={errors.latitude}
              value={form.latitude}
              onChange={(e) => setField("latitude", e.target.value)}
              placeholder="-6.2000000"
            />
            <TextField
              label="Longitude"
              required
              error={errors.longitude}
              value={form.longitude}
              onChange={(e) => setField("longitude", e.target.value)}
              placeholder="106.8166667"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={applyPickedPoint} disabled={!pickedPoint}>
              <LocateFixed className="h-3.5 w-3.5 mr-1.5" />Gunakan Titik dari Peta
            </Button>
            {pickedPoint && (
              <span className="text-xs font-mono" style={{ color: "var(--text-subtle)" }}>
                {pickedPoint.lat.toFixed(7)}, {pickedPoint.lng.toFixed(7)}
              </span>
            )}
          </div>

          <FormField label="Radius (meter)" required error={errors.radius_meter}>
            <div className="space-y-2">
              <input
                type="range"
                min={10}
                max={2000}
                step={10}
                value={Number(form.radius_meter || 100)}
                onChange={(e) => setField("radius_meter", e.target.value)}
                className="w-full"
              />
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={10}
                  step={10}
                  value={form.radius_meter}
                  onChange={(e) => setField("radius_meter", e.target.value)}
                  className="flex h-8 w-full rounded-lg px-3 py-1 text-sm"
                  style={{
                    border: `1px solid ${errors.radius_meter ? "var(--danger)" : "var(--border-strong)"}`,
                    background: "var(--surface)",
                    color: "var(--text-900)",
                  }}
                />
                <span className="text-xs" style={{ color: "var(--text-subtle)" }}>meter</span>
              </div>
            </div>
          </FormField>

          <FormField label="Status Lokasi">
            <label className="inline-flex items-center gap-2 text-sm" style={{ color: "var(--text-900)" }}>
              <input
                type="checkbox"
                checked={form.aktif}
                onChange={(e) => setField("aktif", e.target.checked)}
              />
              Aktif (dipakai untuk validasi absensi mobile)
            </label>
          </FormField>

          <TextareaField
            label="Keterangan"
            value={form.keterangan}
            onChange={(e) => setField("keterangan", e.target.value)}
            placeholder="Opsional"
          />
        </div>
      </Modal>

      <ConfirmDelete
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        loading={deleting}
        description={`Hapus lokasi "${selected?.nama_lokasi ?? ""}"?`}
      />
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{label}</p>
      <p className="text-2xl font-bold font-mono mt-0.5" style={{ color }}>{value}</p>
    </div>
  )
}

function MapPreview({
  list,
  selected,
  pickedPoint,
  pickingMode,
  onPickPoint,
  onSelectPoint,
}: {
  list: LokasiConfig[]
  selected: LokasiConfig | null
  pickedPoint: { lat: number; lng: number } | null
  pickingMode: boolean
  onPickPoint: (lat: number, lng: number) => void
  onSelectPoint: (id: number) => void
}) {
  const mapElRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const layerRef = useRef<LeafletLayerGroup | null>(null)
  const pickingModeRef = useRef(pickingMode)

  useEffect(() => {
    pickingModeRef.current = pickingMode
  }, [pickingMode])

  useEffect(() => {
    let mounted = true

    const init = async () => {
      await loadLeaflet()
      if (!mounted || !mapElRef.current || !window.L) return

      if (!mapRef.current) {
        const map = window.L.map(mapElRef.current)
        map.setView([-6.2, 106.8166667], 13)

        window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 19,
        }).addTo(map)

        const group = window.L.layerGroup()
        group.addTo(map)
        mapRef.current = map
        layerRef.current = group

        map.on("click", (evt) => {
          if (!evt.latlng || !pickingModeRef.current) return
          onPickPoint(evt.latlng.lat, evt.latlng.lng)
        })
      }
    }

    init().catch(() => {
      // no-op: fallback handled by UI text only
    })

    return () => {
      mounted = false
    }
  }, [onPickPoint, pickingMode])

  useEffect(() => {
    if (!mapRef.current || !layerRef.current || !window.L) return

    const map = mapRef.current
    const group = layerRef.current
    group.clearLayers()

    const points: [number, number][] = []

    for (const item of list) {
      const lat = toNum(item.latitude)
      const lng = toNum(item.longitude)
      if (Number.isNaN(lat) || Number.isNaN(lng)) continue

      points.push([lat, lng])
      const isSelected = selected?.id === item.id

      const marker = window.L.marker([lat, lng])
      marker.bindPopup(`<b>${item.nama_lokasi}</b><br/>Radius: ${item.radius_meter} m`)
      if (marker.on) marker.on("click", () => onSelectPoint(item.id))
      marker.addTo(group)

      const color = isSelected ? "#f59e0b" : item.aktif ? "#16a34a" : "#64748b"
      window.L.circle([lat, lng], {
        radius: Number(item.radius_meter || 100),
        color,
        fillColor: color,
        fillOpacity: isSelected ? 0.24 : 0.18,
        weight: isSelected ? 4 : 3,
      }).addTo(group)

      // Marker cincin kecil agar pusat radius tetap terlihat jelas di semua zoom.
      window.L.circleMarker([lat, lng], {
        radius: isSelected ? 7 : 5,
        color,
        weight: 2,
        fillColor: "#ffffff",
        fillOpacity: 0.95,
      }).addTo(group)
    }

    if (pickedPoint) {
      const marker = window.L.marker([pickedPoint.lat, pickedPoint.lng], {
        icon: window.L.icon({
          iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
          shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
          iconSize: [25, 41],
          iconAnchor: [12, 41],
          popupAnchor: [1, -34],
          shadowSize: [41, 41],
        }),
      })
      marker.bindPopup(
        `<div style="font-size: 12px;">
          <b style="color: #2563eb;">🆕 Titik Baru (Dipilih)</b><br/>
          ${pickedPoint.lat.toFixed(7)}, ${pickedPoint.lng.toFixed(7)}<br/>
          <small>Klik 'Gunakan Titik dari Peta' untuk pakai titik ini</small>
        </div>`
      ).openPopup()
      marker.addTo(group)
      points.push([pickedPoint.lat, pickedPoint.lng])
    }

    // Jangan automatic setView ke selected saat user zoom manual
    // Hanya gunakan fitBounds untuk initial view jika banyak points
    if (points.length >= 2) {
      let minLat = points[0][0]
      let maxLat = points[0][0]
      let minLng = points[0][1]
      let maxLng = points[0][1]

      for (const [lat, lng] of points) {
        minLat = Math.min(minLat, lat)
        maxLat = Math.max(maxLat, lat)
        minLng = Math.min(minLng, lng)
        maxLng = Math.max(maxLng, lng)
      }

      map.fitBounds([[minLat, minLng], [maxLat, maxLng]], { padding: [24, 24] })
    } else if (points.length === 1) {
      map.setView(points[0], 16)
    }
  }, [list, pickedPoint])

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.off("click")
        mapRef.current.remove()
      }
      mapRef.current = null
      layerRef.current = null
    }
  }, [])

  return (
    <div
      ref={mapElRef}
      className="h-[420px] w-full rounded-lg"
      style={{ 
        border: "1px solid var(--border)", 
        background: "var(--surface-muted)", 
        position: "relative", 
        zIndex: 0,
        cursor: pickingMode ? "crosshair" : "grab"
      }}
    />
  )
}
