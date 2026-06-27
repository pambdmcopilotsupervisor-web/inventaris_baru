-- ============================================================
-- Migration: Snapshot Kehadiran pada Slip Gaji
-- Tanggal  : 2026-06-22
-- Tujuan   : Membekukan rekap kehadiran (hadir/alfa/terlambat/izin/sakit/cuti)
--            ke payroll_slips saat dihitung, agar slip tidak ikut berubah bila
--            data absensi diedit setelah periode disetujui (audit trail).
-- Catatan  : Idempotent.
-- ============================================================
DROP PROCEDURE IF EXISTS _payroll_att_snapshot;
DELIMITER //
CREATE PROCEDURE _payroll_att_snapshot()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'payroll_slips' AND COLUMN_NAME = 'attendance_snapshot'
  ) THEN
    ALTER TABLE payroll_slips ADD COLUMN attendance_snapshot JSON NULL AFTER tax_detail;
  END IF;
END //
DELIMITER ;
CALL _payroll_att_snapshot();
DROP PROCEDURE IF EXISTS _payroll_att_snapshot;
