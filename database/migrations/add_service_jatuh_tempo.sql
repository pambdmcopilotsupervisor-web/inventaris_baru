-- Tambah jatuh tempo service otomatis untuk service kendaraan dan service aset.
-- Idempotent agar aman dijalankan berulang.

DROP PROCEDURE IF EXISTS _add_service_jatuh_tempo;
DELIMITER //
CREATE PROCEDURE _add_service_jatuh_tempo()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'riwayat_servis_r2r4s'
      AND COLUMN_NAME = 'jatuh_tempo_berikutnya'
  ) THEN
    ALTER TABLE riwayat_servis_r2r4s
      ADD COLUMN jatuh_tempo_berikutnya DATE NULL AFTER tanggal_servis;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'riwayat_service_acs'
      AND COLUMN_NAME = 'jatuh_tempo_berikutnya'
  ) THEN
    ALTER TABLE riwayat_service_acs
      ADD COLUMN jatuh_tempo_berikutnya DATE NULL AFTER tanggal_service;
  END IF;
END//
DELIMITER ;
CALL _add_service_jatuh_tempo();
DROP PROCEDURE IF EXISTS _add_service_jatuh_tempo;

UPDATE riwayat_servis_r2r4s
SET jatuh_tempo_berikutnya = DATE_ADD(tanggal_servis, INTERVAL 6 MONTH);

UPDATE riwayat_service_acs
SET jatuh_tempo_berikutnya = DATE_ADD(tanggal_service, INTERVAL 6 MONTH);

UPDATE data_r2r4s k
SET service = (
  SELECT r.jatuh_tempo_berikutnya
  FROM riwayat_servis_r2r4s r
  WHERE r.data_r2r4_id = k.id
  ORDER BY r.tanggal_servis DESC, r.id DESC
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1 FROM riwayat_servis_r2r4s r
  WHERE r.data_r2r4_id = k.id
);
