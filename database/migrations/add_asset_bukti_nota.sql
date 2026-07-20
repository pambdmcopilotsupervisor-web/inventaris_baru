-- Tambah kolom bukti_nota untuk menyimpan key foto/file nota pembelian aset.
-- Idempotent agar aman dijalankan berulang.

DROP PROCEDURE IF EXISTS _add_asset_bukti_nota;
DELIMITER //
CREATE PROCEDURE _add_asset_bukti_nota()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'assets'
      AND COLUMN_NAME = 'bukti_nota'
  ) THEN
    ALTER TABLE assets ADD COLUMN bukti_nota VARCHAR(100) NULL AFTER gambar;
  END IF;
END//
DELIMITER ;
CALL _add_asset_bukti_nota();
DROP PROCEDURE IF EXISTS _add_asset_bukti_nota;
