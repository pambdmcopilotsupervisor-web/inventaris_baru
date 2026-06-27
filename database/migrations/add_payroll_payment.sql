-- ============================================================
-- Migration: Workflow Pembayaran Payroll (PAID / CLOSED)
-- Tanggal  : 2026-06-22
-- Tujuan   : Lengkapi alur periode: APPROVED → PAID → CLOSED.
-- Catatan  : Idempotent.
-- ============================================================
DROP PROCEDURE IF EXISTS _payroll_payment_cols;
DELIMITER //
CREATE PROCEDURE _payroll_payment_cols()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payroll_periods' AND COLUMN_NAME='tanggal_bayar') THEN
    ALTER TABLE payroll_periods ADD COLUMN tanggal_bayar DATE NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payroll_periods' AND COLUMN_NAME='paid_by') THEN
    ALTER TABLE payroll_periods ADD COLUMN paid_by BIGINT UNSIGNED NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payroll_periods' AND COLUMN_NAME='paid_at') THEN
    ALTER TABLE payroll_periods ADD COLUMN paid_at TIMESTAMP NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payroll_periods' AND COLUMN_NAME='closed_at') THEN
    ALTER TABLE payroll_periods ADD COLUMN closed_at TIMESTAMP NULL;
  END IF;
END //
DELIMITER ;
CALL _payroll_payment_cols();
DROP PROCEDURE IF EXISTS _payroll_payment_cols;
