-- Migration: Tambah tabel hak akses menu per user
-- Setiap user dapat dikonfigurasi hanya boleh mengakses menu tertentu.
-- User dengan role admin selalu dapat akses semua menu (tidak perlu baris di tabel ini).
-- Jika user tidak punya baris sama sekali di tabel ini, semua menu tampil (backward-compat).

CREATE TABLE IF NOT EXISTS user_menu_permissions (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  menu_href   VARCHAR(255)    NOT NULL,
  created_at  TIMESTAMP       NULL DEFAULT NULL,
  updated_at  TIMESTAMP       NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_menu (user_id, menu_href),
  INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
