-- ============================================================
-- Modul Keuangan — Lanjutan: Rekonsiliasi Bank
-- Koperasi Pedami
-- ============================================================

-- -----------------------------------------------------------
-- Rekonsiliasi Bank — Header (per akun bank per bulan)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS keu_rekonsiliasi (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  akun_id         BIGINT UNSIGNED NOT NULL COMMENT 'Akun bank yang direkonsiliasi (mis. 1.1.2)',
  periode_id      BIGINT UNSIGNED NOT NULL,
  tanggal_mulai   DATE        NOT NULL,
  tanggal_selesai DATE        NOT NULL,
  saldo_buku      DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT 'Saldo buku per tanggal selesai',
  saldo_bank      DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT 'Saldo rekening bank fisik',
  selisih         DECIMAL(18,2) GENERATED ALWAYS AS (saldo_bank - saldo_buku) VIRTUAL,
  status          ENUM('DRAFT','SELESAI') NOT NULL DEFAULT 'DRAFT',
  catatan         VARCHAR(255) NULL,
  dibuat_oleh     BIGINT UNSIGNED NULL,
  created_at      TIMESTAMP    NULL,
  updated_at      TIMESTAMP    NULL,
  UNIQUE KEY uq_rekonsiliasi_akun_periode (akun_id, periode_id),
  KEY idx_rekonsiliasi_status (status),
  CONSTRAINT fk_rekonsiliasi_akun FOREIGN KEY (akun_id)
    REFERENCES keu_akun (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_rekonsiliasi_periode FOREIGN KEY (periode_id)
    REFERENCES keu_periode_fiskal (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_rekonsiliasi_user FOREIGN KEY (dibuat_oleh)
    REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------
-- Rekonsiliasi Bank — Item (per baris mutasi bank)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS keu_rekonsiliasi_item (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  rekonsiliasi_id   BIGINT UNSIGNED NOT NULL,
  tanggal           DATE        NOT NULL,
  keterangan        VARCHAR(255) NOT NULL,
  debit             DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT 'Penerimaan di rekening bank',
  kredit            DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT 'Pengeluaran di rekening bank',
  -- Tautan ke jurnal jika sudah dicocokkan
  jurnal_detail_id  BIGINT UNSIGNED NULL,
  status_cocok      ENUM('BELUM','COCOK','BEDA') NOT NULL DEFAULT 'BELUM',
  catatan           VARCHAR(255) NULL,
  created_at        TIMESTAMP    NULL,
  updated_at        TIMESTAMP    NULL,
  KEY idx_rekon_item_rekon (rekonsiliasi_id),
  KEY idx_rekon_item_tanggal (tanggal),
  KEY idx_rekon_item_status (status_cocok),
  CONSTRAINT fk_rekon_item_rekon FOREIGN KEY (rekonsiliasi_id)
    REFERENCES keu_rekonsiliasi (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_rekon_item_jd FOREIGN KEY (jurnal_detail_id)
    REFERENCES keu_jurnal_detail (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
