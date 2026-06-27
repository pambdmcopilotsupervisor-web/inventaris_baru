-- ============================================================
-- Migration: Pembulatan gaji configurable + Penyesuaian sekali jalan
-- 1) Kolom payroll_tax_configs.pembulatan_gaji (idempotent)
-- 2) Tabel payroll_adjustments (one-time earning/deduction per periode)
-- ============================================================

-- 1) Kolom pembulatan_gaji
DROP PROCEDURE IF EXISTS _add_pembulatan_gaji;
DELIMITER //
CREATE PROCEDURE _add_pembulatan_gaji()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'payroll_tax_configs'
      AND COLUMN_NAME  = 'pembulatan_gaji'
  ) THEN
    ALTER TABLE payroll_tax_configs
      ADD COLUMN `pembulatan_gaji` INT NOT NULL DEFAULT 0
      COMMENT 'Pembulatan gaji bersih ke kelipatan (0=tanpa, 100, 1000, dst.)'
      AFTER `pembulatan_pph`;
  END IF;
END //
DELIMITER ;
CALL _add_pembulatan_gaji();
DROP PROCEDURE IF EXISTS _add_pembulatan_gaji;

-- 2) Tabel payroll_adjustments
CREATE TABLE IF NOT EXISTS `payroll_adjustments` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `payroll_period_id` BIGINT UNSIGNED NOT NULL,
  `employee_id`       BIGINT UNSIGNED NOT NULL,
  `type`              ENUM('EARNING','DEDUCTION') NOT NULL DEFAULT 'EARNING',
  `label`             VARCHAR(150) NOT NULL,
  `amount`            DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  `is_taxable`        TINYINT(1) NOT NULL DEFAULT 0,
  `notes`             VARCHAR(255) NULL,
  `created_at`        TIMESTAMP NULL,
  `updated_at`        TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  KEY `payroll_adjustments_period_id_index` (`payroll_period_id`),
  KEY `payroll_adjustments_employee_id_index` (`employee_id`),
  CONSTRAINT `padj_period_id_foreign` FOREIGN KEY (`payroll_period_id`) REFERENCES `payroll_periods` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `padj_employee_id_foreign` FOREIGN KEY (`employee_id`) REFERENCES `karyawans` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
