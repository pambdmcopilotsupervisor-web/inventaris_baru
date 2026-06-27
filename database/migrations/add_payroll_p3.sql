-- ============================================================
-- Migration: P3 — slip_number permanen + default_rate komponen
-- Tanggal  : 2026-06-22
-- Tujuan   :
--   - payroll_slips.slip_number: nomor slip disimpan permanen (hindari
--     race/berubah saat slip ditambah/dihapus).
--   - salary_components.default_rate: rate default komponen PERCENT
--     (gantikan penyimpanan rate di formula_expression).
-- Catatan  : Idempotent.
-- ============================================================
DROP PROCEDURE IF EXISTS _payroll_p3_cols;
DELIMITER //
CREATE PROCEDURE _payroll_p3_cols()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payroll_slips' AND COLUMN_NAME='slip_number') THEN
    ALTER TABLE payroll_slips ADD COLUMN slip_number VARCHAR(40) NULL AFTER employee_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='salary_components' AND COLUMN_NAME='default_rate') THEN
    ALTER TABLE salary_components ADD COLUMN default_rate DECIMAL(15,4) NULL AFTER formula_expression;
  END IF;
END //
DELIMITER ;
CALL _payroll_p3_cols();
DROP PROCEDURE IF EXISTS _payroll_p3_cols;

-- Backfill default_rate dari formula_expression untuk komponen PERCENT (nilai numerik).
UPDATE salary_components
SET default_rate = CAST(formula_expression AS DECIMAL(15,4))
WHERE calc_method = 'PERCENT'
  AND default_rate IS NULL
  AND formula_expression IS NOT NULL
  AND formula_expression REGEXP '^[0-9]+(\\.[0-9]+)?$';
