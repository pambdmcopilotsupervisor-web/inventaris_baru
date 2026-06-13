import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireRole, getClientIp } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { STATUS_LEMBUR, getSettingLembur, deteksiTipeHari, hitungUangLembur, validateLemburEligibility } from "@/lib/lembur"
import { isAdminRole, isHrdUser, isRecordedApprover } from "@/lib/approval"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin", "hrd", "atasan", "user", "operator"])
  if ("error" in auth) return auth.error
  try {
    const { id } = await params
    const body = await req.json()
    const overtime = await prisma.overtime_requests.findUnique({
      where: { id: BigInt(id) },
      include: { overtime_approvals: { orderBy: { approval_level: "asc" } }, karyawans: { select: { tarif_lembur_per_jam: true } } },
    })
    if (!overtime) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 })

    const now = new Date()
    const userId = BigInt(auth.user.id)
    const role = auth.user.role ?? "user"
    const karyawanId = auth.user.karyawan_id

    const isAdmin = isAdminRole(role)
    const isHrd = await isHrdUser(karyawanId)

    const doAtasanApproval = overtime.status === STATUS_LEMBUR.SUBMITTED
    const doHrdApproval    = overtime.status === STATUS_LEMBUR.APPROVED_SUPERVISOR
    if (!doAtasanApproval && !doHrdApproval) return NextResponse.json({ error: "Status tidak dapat disetujui" }, { status: 422 })

    await prisma.$transaction(async (tx) => {
    if (doAtasanApproval) {
      const ap = overtime.overtime_approvals.find(a => a.approval_level === 1 && a.status === "pending")
      if (!ap) return NextResponse.json({ error: "Tidak ada approval level 1 pending" }, { status: 422 })
      if (!isAdmin && !isRecordedApprover(ap.approver_id, karyawanId)) {
        return NextResponse.json({ error: "Anda bukan approver yang tercatat untuk pengajuan ini" }, { status: 403 })
      }
      await tx.overtime_approvals.update({
        where: { id: ap.id },
        data: { status: "approved", approver_user_id: userId, approver_id: ap.approver_id, note: body.note || null, approved_at: now, updated_at: now },
      })
      await tx.overtime_approvals.create({
        data: { overtime_request_id: BigInt(id), approver_id: null, approver_role: "hrd", approval_level: 2, status: "pending", created_at: now, updated_at: now },
      })
      await tx.overtime_requests.update({ where: { id: BigInt(id) }, data: { status: STATUS_LEMBUR.APPROVED_SUPERVISOR, updated_at: now } })
    } else {
      // HRD approve final — hitung uang lembur
      if (!isAdmin && !isHrd) return NextResponse.json({ error: "Anda tidak memiliki hak approval level 2 (HRD)" }, { status: 403 })
      const ap = overtime.overtime_approvals.find(a => a.approval_level === 2 && a.status === "pending")
      if (!ap) return NextResponse.json({ error: "Tidak ada approval HRD pending" }, { status: 422 })

      const lemburValidation = await validateLemburEligibility({
        karyawanId: overtime.karyawan_id,
        tanggal: overtime.tanggal_lembur,
        jamMulai: overtime.jam_mulai_rencana,
        jamSelesai: overtime.jam_selesai_rencana,
        isLintasHari: overtime.is_lintas_hari,
        mode: "rencana",
      })
      if (!lemburValidation.valid) {
        return NextResponse.json({ error: lemburValidation.errors.join(" "), errors: lemburValidation.errors }, { status: 422 })
      }

      await tx.overtime_approvals.update({
        where: { id: ap.id },
        data: { status: "approved", approver_user_id: userId, approver_id: karyawanId ? BigInt(karyawanId) : ap.approver_id, note: body.note || null, approved_at: now, updated_at: now },
      })

      // Hitung uang lembur
      const durasiDisetujui = overtime.durasi_disetujui_menit ?? overtime.durasi_rencana_menit
      const tipeHari = await deteksiTipeHari(overtime.tanggal_lembur)
      const setting  = await getSettingLembur(tipeHari)
      let totalUang = 0
      let calculationDetail: object = {}

      if (setting) {
        const tarifPegawai = overtime.karyawans.tarif_lembur_per_jam ? Number(overtime.karyawans.tarif_lembur_per_jam) : null
        const hasil = hitungUangLembur({ durasiMenit: durasiDisetujui, setting, tarifPerJamPegawai: tarifPegawai })
        totalUang = hasil.totalUang
        calculationDetail = hasil.detail
      }

      await tx.overtime_requests.update({
        where: { id: BigInt(id) },
        data: {
          status:                STATUS_LEMBUR.APPROVED_HRD,
          durasi_disetujui_menit: durasiDisetujui,
          total_uang_lembur:     totalUang,
          calculation_detail:    calculationDetail,
          updated_at:            now,
        },
      })
    }

    await writeAuditLog({ user: auth.user, action: "UPDATE", modelType: "overtime_requests", modelId: BigInt(id), dataBaru: { status: "approved" }, ip: getClientIp(req), tx })
    }, { timeout: 20000 })
    return NextResponse.json({ success: true, message: "Lembur disetujui" })
  } catch (err) {
    console.error("[approve overtime]", err)
    return NextResponse.json({ error: "Gagal menyetujui" }, { status: 500 })
  }
}
