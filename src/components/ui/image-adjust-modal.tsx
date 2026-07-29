"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { Image as ImageIcon, RotateCcw, RotateCw, Save, Undo2, ZoomIn } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"

type CropRatio = {
  label: string
  value: number
  suffix: string
}

const CROP_RATIOS: CropRatio[] = [
  { label: "4:3", value: 4 / 3, suffix: "4x3" },
  { label: "3:4", value: 3 / 4, suffix: "3x4" },
  { label: "1:1", value: 1, suffix: "1x1" },
  { label: "16:9", value: 16 / 9, suffix: "16x9" },
]

const OUTPUT_WIDTH = 1600

interface ImageAdjustModalProps {
  open: boolean
  file: File | null
  title?: string
  onClose: () => void
  onSave: (file: File) => void
}

export function ImageAdjustModal({ open, file, title = "Edit Foto", onClose, onSave }: ImageAdjustModalProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const dragRef = useRef<{ active: boolean; x: number; y: number }>({ active: false, x: 0, y: 0 })
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [ratio, setRatio] = useState(CROP_RATIOS[0])
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [canvasSize, setCanvasSize] = useState({ width: 640, height: 480 })
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!open || !file) {
        setSourceUrl(null)
        setReady(false)
        setError(null)
        return
      }

      const url = URL.createObjectURL(file)
      setSourceUrl(url)
      setReady(false)
      setError(null)
      setZoom(1)
      setRotation(0)
      setOffset({ x: 0, y: 0 })
    }, 0)

    return () => window.clearTimeout(timer)
  }, [open, file])

  useEffect(() => {
    return () => {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl)
    }
  }, [sourceUrl])

  useEffect(() => {
    if (!sourceUrl) return

    const img = new Image()
    img.onload = () => {
      imageRef.current = img
      setReady(true)
    }
    img.onerror = () => {
      imageRef.current = null
      setError("Foto tidak dapat dibuka")
      setReady(false)
    }
    img.src = sourceUrl
  }, [sourceUrl])

  useEffect(() => {
    if (!open) return
    const el = wrapperRef.current
    if (!el) return

    const resize = () => {
      const width = Math.max(280, Math.min(760, el.clientWidth))
      setCanvasSize({ width, height: Math.round(width / ratio.value) })
    }

    const timer = window.setTimeout(resize, 0)
    const observer = new ResizeObserver(resize)
    observer.observe(el)
    return () => {
      window.clearTimeout(timer)
      observer.disconnect()
    }
  }, [open, ratio])

  const drawImage = useCallback((
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
    outputScale = 1,
  ) => {
    const img = imageRef.current
    const ctx = canvas.getContext("2d")
    if (!img || !ctx) return false

    canvas.width = width
    canvas.height = height
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = "#fff"
    ctx.fillRect(0, 0, width, height)

    const radians = rotation * Math.PI / 180
    const rotated = rotation % 180 === 0
      ? { width: img.naturalWidth, height: img.naturalHeight }
      : { width: img.naturalHeight, height: img.naturalWidth }
    const baseScale = Math.max(width / rotated.width, height / rotated.height)
    const scale = baseScale * zoom

    ctx.save()
    ctx.translate((width / 2) + (offset.x * outputScale), (height / 2) + (offset.y * outputScale))
    ctx.rotate(radians)
    ctx.scale(scale, scale)
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)
    ctx.restore()

    return true
  }, [offset.x, offset.y, rotation, zoom])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !ready) return
    drawImage(canvas, canvasSize.width, canvasSize.height)
  }, [canvasSize.height, canvasSize.width, drawImage, ready])

  const reset = () => {
    setZoom(1)
    setRotation(0)
    setOffset({ x: 0, y: 0 })
  }

  const exportFile = () => {
    if (!file) return
    const previewWidth = canvasSize.width
    const outputWidth = OUTPUT_WIDTH
    const outputHeight = Math.round(outputWidth / ratio.value)
    const scale = outputWidth / previewWidth
    const canvas = document.createElement("canvas")

    if (!drawImage(canvas, outputWidth, outputHeight, scale)) {
      setError("Gagal membuat hasil edit")
      return
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        setError("Gagal menyimpan hasil edit")
        return
      }

      const baseName = file.name.replace(/\.[^.]+$/, "") || "foto"
      const edited = new File([blob], `${baseName}-edit-${ratio.suffix}.jpg`, { type: "image/jpeg" })
      onSave(edited)
      onClose()
    }, "image/jpeg", 0.9)
  }

  const moveByPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current.active) return
    const dx = event.clientX - dragRef.current.x
    const dy = event.clientY - dragRef.current.y
    dragRef.current = { active: true, x: event.clientX, y: event.clientY }
    setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }))
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={exportFile} disabled={!ready}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            Simpan Foto
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div ref={wrapperRef} className="w-full">
          <div
            className="overflow-hidden rounded-lg"
            style={{ border: "1px solid var(--border)", background: "#111827" }}
          >
            {ready ? (
              <canvas
                ref={canvasRef}
                className="block w-full touch-none cursor-move"
                style={{ height: canvasSize.height }}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId)
                  dragRef.current = { active: true, x: event.clientX, y: event.clientY }
                }}
                onPointerMove={moveByPointer}
                onPointerUp={(event) => {
                  dragRef.current.active = false
                  event.currentTarget.releasePointerCapture(event.pointerId)
                }}
                onPointerCancel={() => { dragRef.current.active = false }}
              />
            ) : (
              <div className="flex h-72 items-center justify-center">
                <ImageIcon className="h-8 w-8" style={{ color: "var(--text-subtle)" }} />
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--text-700)" }}>
                <ZoomIn className="h-3.5 w-3.5" />
                Zoom
              </label>
              <span className="text-xs font-mono" style={{ color: "var(--text-subtle)" }}>{Math.round(zoom * 100)}%</span>
            </div>
            <input
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={zoom}
              onChange={event => setZoom(Number(event.target.value))}
              className="w-full"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setRotation((value) => (value + 270) % 360)} title="Putar kiri">
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setRotation((value) => (value + 90) % 360)} title="Putar kanan">
              <RotateCw className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={reset} title="Reset">
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {CROP_RATIOS.map(item => (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                setRatio(item)
                setOffset({ x: 0, y: 0 })
                setZoom(1)
              }}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold"
              style={{
                border: `1px solid ${ratio.label === item.label ? "var(--primary)" : "var(--border-strong)"}`,
                background: ratio.label === item.label ? "var(--primary-light)" : "var(--surface-muted)",
                color: ratio.label === item.label ? "var(--primary)" : "var(--text-700)",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {error && <p className="text-xs" style={{ color: "var(--danger)" }}>{error}</p>}
      </div>
    </Modal>
  )
}
