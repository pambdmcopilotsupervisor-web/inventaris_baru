-- ============================================================
-- Migration: employee_loan_payments.payroll_period_id
-- Mengaitkan potongan cicilan ke periode payroll (REGULER/THR/BONUS)
-- agar idempotent & tidak tabrakan saat REGULER + THR di bulan sama.
-- Idempotent: cek information_schema.
-- ============================================================

DROP PROCEDURE IF EXISTS _add_loanpay_period;
DELIMITER //
CREATE PROCEDURE _add_loanpay_period()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'employee_loan_payments'
      AND COLUMN_NAME  = 'payroll_period_id'
  ) THEN
    ALTER TABLE employee_loan_payments
      ADD COLUMN `payroll_period_id` BIGINT UNSIGNED NULL AFTER `payroll_slip_id`,
      ADD INDEX `employee_loan_payments_period_id_index` (`payroll_period_id`),
      ADD CONSTRAINT `loanpay_period_id_foreign` FOREIGN KEY (`payroll_period_id`)
        REFERENCES `payroll_periods` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT;
  END IF;
END //
DELIMITER ;
CALL _add_loanpay_period();
DROP PROCEDURE IF EXISTS _add_loanpay_period;

-- Backfill payroll_period_id dari slip terkait (untuk data lama bila ada).
UPDATE employee_loan_payments elp
JOIN payroll_slips ps ON ps.id = elp.payroll_slip_id
SET elp.payroll_period_id = ps.payroll_period_id
WHERE elp.payroll_period_id IS NULL AND elp.payroll_slip_id IS NOT NULL;
