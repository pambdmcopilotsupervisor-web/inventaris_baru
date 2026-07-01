-- ============================================================
-- Modul Keuangan — Buku Pembantu, Pinjaman Anggota, SHU Anggota
-- ============================================================

CREATE TABLE IF NOT EXISTS keu_pinjaman (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  anggota_id        BIGINT UNSIGNED NOT NULL,
  nomor_pinjaman    VARCHAR(40) NOT NULL,
  tanggal           DATE NOT NULL,
  pokok             DECIMAL(18,2) NOT NULL,
  jasa              DECIMAL(18,2) NOT NULL DEFAULT 0,
  tenor_bulan       SMALLINT NOT NULL DEFAULT 1,
  angsuran_pokok    DECIMAL(18,2) NOT NULL DEFAULT 0,
  angsuran_jasa     DECIMAL(18,2) NOT NULL DEFAULT 0,
  status            VARCHAR(12) NOT NULL DEFAULT 'AKTIF',
  keterangan        VARCHAR(255) NULL,
  akun_kas_id       BIGINT UNSIGNED NULL,
  jurnal_cair_id    BIGINT UNSIGNED NULL,
  dibuat_oleh       BIGINT UNSIGNED NULL,
  created_at        TIMESTAMP NULL,
  updated_at        TIMESTAMP NULL,
  UNIQUE KEY uq_keu_pinjaman_nomor (nomor_pinjaman),
  KEY idx_keu_pinjaman_anggota (anggota_id),
  KEY idx_keu_pinjaman_status (status),
  KEY idx_keu_pinjaman_tanggal (tanggal),
  CONSTRAINT fk_keu_pinjaman_anggota FOREIGN KEY (anggota_id)
    REFERENCES keu_anggota (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_keu_pinjaman_akun FOREIGN KEY (akun_kas_id)
    REFERENCES keu_akun (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_keu_pinjaman_jurnal FOREIGN KEY (jurnal_cair_id)
    REFERENCES keu_jurnal (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_keu_pinjaman_user FOREIGN KEY (dibuat_oleh)
    REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS keu_pinjaman_pembayaran (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  pinjaman_id     BIGINT UNSIGNED NOT NULL,
  tanggal         DATE NOT NULL,
  pokok           DECIMAL(18,2) NOT NULL DEFAULT 0,
  jasa            DECIMAL(18,2) NOT NULL DEFAULT 0,
  keterangan      VARCHAR(255) NULL,
  jurnal_id       BIGINT UNSIGNED NULL,
  dibuat_oleh     BIGINT UNSIGNED NULL,
  created_at      TIMESTAMP NULL,
  updated_at      TIMESTAMP NULL,
  KEY idx_keu_pinjam_bayar_pinjaman (pinjaman_id),
  KEY idx_keu_pinjam_bayar_tanggal (tanggal),
  CONSTRAINT fk_keu_pinjam_bayar_pinjaman FOREIGN KEY (pinjaman_id)
    REFERENCES keu_pinjaman (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_keu_pinjam_bayar_jurnal FOREIGN KEY (jurnal_id)
    REFERENCES keu_jurnal (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_keu_pinjam_bayar_user FOREIGN KEY (dibuat_oleh)
    REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS keu_shu_anggota (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  run_id          BIGINT UNSIGNED NOT NULL,
  anggota_id      BIGINT UNSIGNED NOT NULL,
  basis_simpanan  DECIMAL(18,2) NOT NULL DEFAULT 0,
  porsi           DECIMAL(8,4) NOT NULL DEFAULT 0,
  jumlah          DECIMAL(18,2) NOT NULL DEFAULT 0,
  status          VARCHAR(15) NOT NULL DEFAULT 'DIALOKASIKAN',
  created_at      TIMESTAMP NULL,
  updated_at      TIMESTAMP NULL,
  UNIQUE KEY uq_keu_shu_anggota (run_id, anggota_id),
  KEY idx_keu_shu_anggota_anggota (anggota_id),
  CONSTRAINT fk_keu_shu_anggota_run FOREIGN KEY (run_id)
    REFERENCES keu_shu_run (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_keu_shu_anggota_anggota FOREIGN KEY (anggota_id)
    REFERENCES keu_anggota (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
