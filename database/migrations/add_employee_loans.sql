-- ============================================================
-- Migration: Fitur Pinjaman/Cicilan Karyawan (employee_loans)
-- Potongan cicilan otomatis tiap payroll REGULER sampai pokok habis.
-- Idempotent: CREATE TABLE IF NOT EXISTS.
-- ============================================================

CREATE TABLE IF NOT EXISTS `employee_loans` (
  `id`                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id`        BIGINT UNSIGNED NOT NULL,
  `loan_number`        VARCHAR(40) NULL,
  `title`              VARCHAR(150) NOT NULL,
  `principal_amount`   DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  `installment_amount` DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  `tenor_months`       INT NOT NULL DEFAULT 0,
  `start_month`        TINYINT UNSIGNED NOT NULL,
  `start_year`         SMALLINT UNSIGNED NOT NULL,
  `status`             ENUM('ACTIVE','COMPLETED','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
  `notes`              TEXT NULL,
  `created_at`         TIMESTAMP NULL,
  `updated_at`         TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  KEY `employee_loans_employee_id_index` (`employee_id`),
  KEY `employee_loans_status_index` (`status`),
  CONSTRAINT `loan_employee_id_foreign` FOREIGN KEY (`employee_id`) REFERENCES `karyawans` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `employee_loan_payments` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `loan_id`         BIGINT UNSIGNED NOT NULL,
  `payroll_slip_id` BIGINT UNSIGNED NULL,
  `period_month`    TINYINT UNSIGNED NOT NULL,
  `period_year`     SMALLINT UNSIGNED NOT NULL,
  `amount`          DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  `created_at`      TIMESTAMP NULL,
  `updated_at`      TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  KEY `employee_loan_payments_loan_id_index` (`loan_id`),
  KEY `employee_loan_payments_slip_id_index` (`payroll_slip_id`),
  KEY `employee_loan_payments_period_index` (`period_year`, `period_month`),
  CONSTRAINT `loanpay_loan_id_foreign` FOREIGN KEY (`loan_id`) REFERENCES `employee_loans` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `loanpay_slip_id_foreign` FOREIGN KEY (`payroll_slip_id`) REFERENCES `payroll_slips` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
