-- Tambah tahap Verif Pengurus/Bendahara untuk permohonan disposal baru.
-- Kolom Ketua lama tetap dipertahankan agar riwayat pengajuan lama tetap terbaca.

DROP PROCEDURE IF EXISTS _add_disposal_verif_pengurus;
DELIMITER //
CREATE PROCEDURE _add_disposal_verif_pengurus()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'permohonan_disposal'
      AND COLUMN_NAME = 'verif_bendahara'
  ) THEN
    ALTER TABLE `permohonan_disposal` ADD COLUMN `verif_bendahara` int DEFAULT NULL AFTER `verif_ketua`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'permohonan_disposal'
      AND COLUMN_NAME = 'tgl_verif_bendahara'
  ) THEN
    ALTER TABLE `permohonan_disposal` ADD COLUMN `tgl_verif_bendahara` datetime DEFAULT NULL AFTER `tgl_verif_ketua`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'permohonan_disposal'
      AND COLUMN_NAME = 'bendahara_id'
  ) THEN
    ALTER TABLE `permohonan_disposal` ADD COLUMN `bendahara_id` int DEFAULT NULL AFTER `ketua_id`;
  END IF;
END //
DELIMITER ;

CALL _add_disposal_verif_pengurus();
DROP PROCEDURE IF EXISTS _add_disposal_verif_pengurus;
