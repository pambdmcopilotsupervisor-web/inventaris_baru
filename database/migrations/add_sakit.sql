-- ============================================================
-- Migration: Fitur Sakit Pegawai
-- Tanggal  : 2026-06-12
-- ============================================================

-- 1. Pengajuan Sakit
CREATE TABLE IF NOT EXISTS pengajuan_sakits (
  id                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  karyawan_id              BIGINT UNSIGNED NOT NULL,
  tanggal_mulai            DATE            NOT NULL,
  tanggal_selesai          DATE            NOT NULL,
  jumlah_hari              INT             NOT NULL DEFAULT 0,
  keterangan_sakit         TEXT            NULL,
  nama_dokter              VARCHAR(100)    NULL,
  nama_fasilitas_kesehatan VARCHAR(150)    NULL,
  nomor_surat_sakit        VARCHAR(100)    NULL,
  lampiran_path            VARCHAR(255)    NULL,
  status                   VARCHAR(30)     NOT NULL DEFAULT 'draft',
  submitted_at             TIMESTAMP       NULL,
  dibuat_oleh              BIGINT UNSIGNED NULL,
  created_at               TIMESTAMP       NULL,
  updated_at               TIMESTAMP       NULL,
  KEY pengajuan_sakits_karyawan_id_index (karyawan_id),
  KEY pengajuan_sakits_status_index      (status),
  KEY pengajuan_sakits_tanggal_index     (tanggal_mulai),
  CONSTRAINT pengajuan_sakits_karyawan_id_foreign
    FOREIGN KEY (karyawan_id) REFERENCES karyawans (id) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Approval Sakit (pola sama)
CREATE TABLE IF NOT EXISTS sakit_approvals (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  pengajuan_sakit_id   BIGINT UNSIGNED NOT NULL,
  approver_id          BIGINT UNSIGNED NULL,
  approver_user_id     BIGINT UNSIGNED NULL,
  approver_role        VARCHAR(50)     NOT NULL,
  approval_level       INT             NOT NULL,
  status               VARCHAR(20)     NOT NULL DEFAULT 'pending',
  note                 TEXT            NULL,
  approved_at          TIMESTAMP       NULL,
  created_at           TIMESTAMP       NULL,
  updated_at           TIMESTAMP       NULL,
  KEY sakit_approvals_pengajuan_id_index (pengajuan_sakit_id),
  KEY sakit_approvals_approver_id_index  (approver_id),
  KEY sakit_approvals_status_index       (status),
  CONSTRAINT sakit_approvals_pengajuan_sakit_id_foreign
    FOREIGN KEY (pengajuan_sakit_id) REFERENCES pengajuan_sakits (id) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
