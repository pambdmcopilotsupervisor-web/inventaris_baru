-- ============================================================
-- Migration: Snapshot Kehadiran pada Slip Gaji
-- Tanggal  : 2026-06-22
-- Tujuan   : Membekukan rekap kehadiran (hadir/alfa/terlambat/izin/sakit/cuti)
--            ke payroll_slips saat dihitung, agar slip tidak ikut berubah bila
--            data absensi diedit setelah periode disetujui (audit trail).
-- Catatan  : Idempotent — menggunakan ADD COLUMN IF NOT EXISTS (MariaDB).
-- ============================================================
ALTER TABLE payroll_slips ADD COLUMN IF NOT EXISTS attendance_snapshot JSON NULL;
