-- ============================================================
-- Migration: payroll_periods rentang tanggal kustom
-- period_start_date & period_end_date (NULL = default 1..akhir bulan)
-- Idempotent via information_schema.
-- ============================================================

DROP PROCEDURE IF EXISTS _add_period_custom_dates;
DELIMITER //
CREATE PROCEDURE _add_period_custom_dates()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'payroll_periods'
      AND COLUMN_NAME  = 'period_start_date'
  ) THEN
    ALTER TABLE payroll_periods
      ADD COLUMN `period_start_date` DATE NULL AFTER `period_year`,
      ADD COLUMN `period_end_date` DATE NULL AFTER `period_start_date`;
  END IF;
END //
DELIMITER ;
CALL _add_period_custom_dates();
DROP PROCEDURE IF EXISTS _add_period_custom_dates;

-- Backfill rentang default (1..akhir bulan) untuk periode lama agar konsisten.
UPDATE payroll_periods
SET period_start_date = DATE(CONCAT(period_year, '-', LPAD(period_month, 2, '0'), '-01')),
    period_end_date   = LAST_DAY(CONCAT(period_year, '-', LPAD(period_month, 2, '0'), '-01'))
WHERE period_start_date IS NULL;
