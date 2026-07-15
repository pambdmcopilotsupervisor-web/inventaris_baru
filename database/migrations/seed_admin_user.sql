-- ============================================================
-- Seed: User Admin Pertama (Default)
-- Tanggal  : 2026-07-15
-- Tujuan   : Menyediakan akun admin awal agar aplikasi bisa
--            diakses pada deploy pertama ke server baru.
-- Catatan  : Idempotent — INSERT IGNORE (tidak menimpa jika
--            email sudah ada).
--
-- KREDENSIAL DEFAULT:
--   Email    : admin@pedami.local
--   Password : Admin@2026!
--
-- PENTING: Ganti password segera setelah login pertama!
-- ============================================================

INSERT IGNORE INTO users (name, email, password, password_baru, role, created_at, updated_at)
VALUES (
  'Administrator',
  'admin@pedami.local',
  -- Hash bcrypt (12 rounds) dari: Admin@2026!
  '$2b$12$uDlKiyqII965csy.I0i75e8ppULAGABNWNEYv1oloBQil99avqLy.',
  '$2b$12$uDlKiyqII965csy.I0i75e8ppULAGABNWNEYv1oloBQil99avqLy.',
  'admin',
  NOW(),
  NOW()
);
