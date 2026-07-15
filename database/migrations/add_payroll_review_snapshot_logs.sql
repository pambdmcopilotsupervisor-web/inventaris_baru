-- ============================================================
-- Migration: Payroll Review, Snapshot Identitas, dan Run Logs
-- Tanggal  : 2026-06-27
-- Tujuan   :
--   - Snapshot identitas/bank karyawan pada payroll_slips.
--   - Review per slip sebelum approve periode.
--   - Log error/warning kalkulasi payroll yang persisten.
-- Catatan  : Idempotent — menggunakan ADD COLUMN IF NOT EXISTS (MariaDB).
-- ============================================================

-- Pastikan attendance_snapshot ada terlebih dahulu (dependency dari
-- add_payroll_attendance_snapshot.sql yang mungkin belum jalan).
ALTER TABLE payroll_slips ADD COLUMN IF NOT EXISTS attendance_snapshot JSON NULL;

-- Tambah kolom-kolom snapshot & review
ALTER TABLE payroll_slips ADD COLUMN IF NOT EXISTS employee_snapshot JSON NULL;
ALTER TABLE payroll_slips ADD COLUMN IF NOT EXISTS bank_snapshot JSON NULL;
ALTER TABLE payroll_slips ADD COLUMN IF NOT EXISTS reviewed_by BIGINT UNSIGNED NULL;
ALTER TABLE payroll_slips ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP NULL;

CREATE TABLE IF NOT EXISTS payroll_run_logs (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  payroll_period_id BIGINT UNSIGNED NOT NULL,
  payroll_slip_id   BIGINT UNSIGNED NULL,
  employee_id       BIGINT UNSIGNED NULL,
  level             VARCHAR(20)     NOT NULL,
  message           VARCHAR(255)    NOT NULL,
  context           JSON            NULL,
  created_at        TIMESTAMP       NULL,
  KEY payroll_run_logs_period_id_index (payroll_period_id),
  KEY payroll_run_logs_slip_id_index (payroll_slip_id),
  KEY payroll_run_logs_employee_id_index (employee_id),
  KEY payroll_run_logs_level_index (level),
  CONSTRAINT prl_period_id_foreign FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods (id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT prl_slip_id_foreign FOREIGN KEY (payroll_slip_id) REFERENCES payroll_slips (id) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT prl_employee_id_foreign FOREIGN KEY (employee_id) REFERENCES karyawans (id) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
