"use client"

import React, { useEffect, useRef, useState } from "react"
import { Camera, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"

interface CameraCaptureModalProps {
  open: boolean
  onClose: () => void
  onCapture: (file: File) => void
  title?: string
}

export function CameraCaptureModal({ open, onClose, onCapture, title = "Ambil Gambar" }: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
  }

  const startCamera = async () => {
    if (!open) return
    setLoading(true)
    setError(null)
    stopCamera()

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
    } catch {
      setError("Kamera tidak dapat dibuka. Pastikan izin kamera sudah diberikan dan perangkat memiliki kamera.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return stopCamera
    const timer = window.setTimeout(() => void startCamera(), 0)
    return () => {
      window.clearTimeout(timer)
      stopCamera()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const capture = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth || !video.videoHeight) {
      setError("Kamera belum siap. Coba beberapa detik lagi.")
      return
    }

    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      setError("Gagal mengambil gambar dari kamera.")
      return
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (!blob) {
        setError("Gagal membuat file gambar.")
        return
      }

      const file = new File([blob], `kamera-${Date.now()}.jpg`, { type: "image/jpeg" })
      onCapture(file)
      stopCamera()
      onClose()
    }, "image/jpeg", 0.9)
  }

  const handleClose = () => {
    stopCamera()
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={title}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={startCamera} disabled={loading}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Muat Ulang
          </Button>
          <Button onClick={capture} disabled={loading || Boolean(error)}>
            <Camera className="h-3.5 w-3.5 mr-1.5" />
            Ambil Foto
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--border)", background: "#000" }}>
          <video ref={videoRef} playsInline muted className="h-72 w-full object-cover" />
        </div>
        {loading && <p className="text-xs" style={{ color: "var(--text-subtle)" }}>Membuka kamera...</p>}
        {error && <p className="text-xs" style={{ color: "var(--danger)" }}>{error}</p>}
      </div>
    </Modal>
  )
}
