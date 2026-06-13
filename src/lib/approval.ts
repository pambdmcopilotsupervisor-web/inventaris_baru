import { prisma } from "@/lib/prisma"
import { isJabatanAtasan, resolveAtasan } from "@/lib/leave"

export function isAdminRole(role?: string | null): boolean {
  return (role ?? "").toLowerCase() === "admin"
}

export function isRecordedApprover(approverId: bigint | number | null | undefined, userKaryawanId: number | null | undefined): boolean {
  if (!approverId || !userKaryawanId) return false
  return BigInt(approverId) === BigInt(userKaryawanId)
}

export async function isHrdUser(karyawanId: number | null | undefined): Promise<boolean> {
  if (!karyawanId) return false

  const karyawan = await prisma.karyawans.findUnique({
    where: { id: BigInt(karyawanId) },
    select: { jabatan: true, divisi_id: true },
  })
  if (!karyawan?.jabatan?.toLowerCase().includes("kepala divisi")) return false
  if (!karyawan.divisi_id) return false

  const divisi = await prisma.divisis.findUnique({
    where: { id: BigInt(karyawan.divisi_id) },
    select: { nama_divisi: true },
  })

  return (divisi?.nama_divisi ?? "").toLowerCase().includes("hrd")
}

export async function canManageApproval(params: { role?: string | null; karyawanId?: number | null }): Promise<boolean> {
  if (isAdminRole(params.role)) return true
  return isHrdUser(params.karyawanId)
}

export async function validateManualApprover(approverId: bigint): Promise<{
  valid: boolean
  error?: string
  approver?: { id: bigint; nik: string; nama_karyawan: string; jabatan: string }
}> {
  const approver = await prisma.karyawans.findUnique({
    where: { id: approverId },
    select: { id: true, nik: true, nama_karyawan: true, jabatan: true, status_karyawan: true },
  })
  if (!approver) return { valid: false, error: "Approver tidak ditemukan" }
  if (["Pensiun", "Nonaktif"].includes(approver.status_karyawan ?? "")) {
    return { valid: false, error: `Approver ${approver.nama_karyawan} berstatus ${approver.status_karyawan}` }
  }
  if (!isJabatanAtasan(approver.jabatan)) {
    return { valid: false, error: "Approver harus memiliki jabatan atasan, misalnya Kepala Divisi, Manager, atau Ketua" }
  }

  return {
    valid: true,
    approver: { id: approver.id, nik: approver.nik, nama_karyawan: approver.nama_karyawan, jabatan: approver.jabatan },
  }
}

export async function resolveApproverReassignment(params: {
  karyawanId: bigint
  approverId?: string | number | null
  refresh?: boolean
  skipToHrd?: boolean
}): Promise<
  | { type: "approver"; approver: { id: bigint; nik: string; nama_karyawan: string; jabatan: string } }
  | { type: "skip_to_hrd" }
  | { type: "error"; error: string }
> {
  if (params.skipToHrd) return { type: "skip_to_hrd" }

  if (params.refresh) {
    const { atasan } = await resolveAtasan(params.karyawanId)
    if (!atasan) return { type: "error", error: "Atasan terbaru tidak ditemukan. Gunakan opsi skip ke HRD jika memang tidak ada atasan valid." }
    return { type: "approver", approver: atasan }
  }

  if (!params.approverId) return { type: "error", error: "Approver baru wajib dipilih, atau gunakan refresh/skip ke HRD" }

  const validation = await validateManualApprover(BigInt(params.approverId))
  if (!validation.valid || !validation.approver) return { type: "error", error: validation.error ?? "Approver tidak valid" }
  return { type: "approver", approver: validation.approver }
}
