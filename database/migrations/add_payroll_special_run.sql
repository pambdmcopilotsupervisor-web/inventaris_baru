-- ============================================================
-- Migration: Prorata & Run Non-Rutin (THR / Bonus)
-- Tanggal  : 2026-06-22
-- Tujuan   :
--   - payroll_periods.run_type: REGULER | THR | BONUS
--   - Konfigurasi THR/Bonus per periode (min masa kerja, multiplier, label)
--   - salary_components.is_prorata  : ikut prorata karyawan baru/keluar (REGULER)
--   - salary_components.is_thr_basis : jadi basis perhitungan THR/Bonus
--   - Unique periode jadi (bulan, tahun, run_type) agar REGULER & THR bisa
--     ada di bulan yang sama.
-- Catatan  : Idempotent.
-- ============================================================
DROP PROCEDURE IF EXISTS _payroll_special_run;
DELIMITER //
CREATE PROCEDURE _payroll_special_run()
BEGIN
  -- Kolom payroll_periods
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payroll_periods' AND COLUMN_NAME='run_type') THEN
    ALTER TABLE payroll_periods ADD COLUMN run_type ENUM('REGULER','THR','BONUS') NOT NULL DEFAULT 'REGULER' AFTER period_year;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payroll_periods' AND COLUMN_NAME='thr_min_masa_bulan') THEN
    ALTER TABLE payroll_periods ADD COLUMN thr_min_masa_bulan INT NOT NULL DEFAULT 12;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payroll_periods' AND COLUMN_NAME='bonus_multiplier') THEN
    ALTER TABLE payroll_periods ADD COLUMN bonus_multiplier DECIMAL(6,2) NOT NULL DEFAULT 1.00;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payroll_periods' AND COLUMN_NAME='run_label') THEN
    ALTER TABLE payroll_periods ADD COLUMN run_label VARCHAR(150) NULL;
  END IF;
  -- Kolom salary_components
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='salary_components' AND COLUMN_NAME='is_prorata') THEN
    ALTER TABLE salary_components ADD COLUMN is_prorata TINYINT(1) NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='salary_components' AND COLUMN_NAME='is_thr_basis') THEN
    ALTER TABLE salary_components ADD COLUMN is_thr_basis TINYINT(1) NOT NULL DEFAULT 0;
  END IF;
  -- Unique index: (bulan, tahun) → (bulan, tahun, run_type)
  IF EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payroll_periods' AND INDEX_NAME='payroll_periods_month_year_unique') THEN
    ALTER TABLE payroll_periods DROP INDEX payroll_periods_month_year_unique;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payroll_periods' AND INDEX_NAME='payroll_periods_month_year_type_unique') THEN
    ALTER TABLE payroll_periods ADD UNIQUE KEY payroll_periods_month_year_type_unique (period_month, period_year, run_type);
  END IF;
END //
DELIMITER ;
CALL _payroll_special_run();
DROP PROCEDURE IF EXISTS _payroll_special_run;

-- Tandai komponen default: gaji pokok & tunjangan jabatan ikut prorata & basis THR;
-- tunjangan makan ikut prorata saja.
UPDATE salary_components SET is_prorata = 1, is_thr_basis = 1 WHERE code IN ('GAJI_POKOK', 'TJ_JABATAN');
UPDATE salary_components SET is_prorata = 1 WHERE code = 'TJ_MAKAN';
