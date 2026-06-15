#!/bin/sh
set -e

# ─────────────────────────────────────────────────────────────────────
# Docker Entrypoint — inventaris_baru
# Menjalankan semua migration SQL (idempotent) sebelum start server.
# ─────────────────────────────────────────────────────────────────────

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[entrypoint] ERROR: DATABASE_URL tidak diset." >&2
  exit 1
fi

# Parse DATABASE_URL dengan Node.js (aman untuk password dengan karakter khusus,
# dan mendukung prefix mysql:// maupun mysql2://)
_PARSED=$(node -e "
const raw = (process.env.DATABASE_URL || '').replace(/^mysql2:\/\//, 'mysql://');
try {
  const u = new URL(raw);
  const lines = [
    decodeURIComponent(u.hostname),
    u.port || '3306',
    decodeURIComponent(u.username),
    decodeURIComponent(u.password),
    decodeURIComponent(u.pathname.slice(1).split('?')[0]),
  ];
  process.stdout.write(lines.join('\n') + '\n');
} catch (e) {
  process.stderr.write('Gagal parse DATABASE_URL: ' + e.message + '\n');
  process.exit(1);
}
")

DB_HOST=$(printf '%s' "$_PARSED" | sed -n '1p')
DB_PORT=$(printf '%s' "$_PARSED" | sed -n '2p')
DB_USER=$(printf '%s' "$_PARSED" | sed -n '3p')
DB_PASS=$(printf '%s' "$_PARSED" | sed -n '4p')
DB_NAME=$(printf '%s' "$_PARSED" | sed -n '5p')

echo "[entrypoint] Menunggu database ${DB_HOST}:${DB_PORT}..."

# Gunakan MYSQL_PWD agar password tidak bocor di process list
# Cek koneksi ke server MySQL (tanpa --database agar tidak bergantung DB sudah ada)
RETRIES=30
until MYSQL_PWD="$DB_PASS" mysql \
  -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" \
  --connect-timeout=3 --silent \
  -e "SELECT 1" >/dev/null 2>&1; do
  RETRIES=$((RETRIES - 1))
  if [ $RETRIES -eq 0 ]; then
    echo "[entrypoint] ERROR: Database tidak bisa diakses setelah 60 detik." >&2
    echo "[entrypoint] Host=${DB_HOST} Port=${DB_PORT} User=${DB_USER}" >&2
    exit 1
  fi
  echo "[entrypoint] Database belum siap, retry dalam 2 detik... ($RETRIES)"
  sleep 2
done

echo "[entrypoint] Database siap."

# Jalankan semua migration SQL secara berurutan (idempotent — IF NOT EXISTS)
MIGRATION_DIR="./database/migrations"
if [ -d "$MIGRATION_DIR" ]; then
  echo "[entrypoint] Menjalankan migrations dari $MIGRATION_DIR ..."
  for SQL_FILE in $(ls "$MIGRATION_DIR"/*.sql 2>/dev/null | sort); do
    echo "[entrypoint]   → $(basename $SQL_FILE)"
    MYSQL_PWD="$DB_PASS" mysql \
      -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "$DB_NAME" \
      --connect-timeout=10 \
      < "$SQL_FILE" 2>&1 \
      || echo "[entrypoint]     (sudah dijalankan sebelumnya, lanjut...)"
  done
  echo "[entrypoint] Migrations selesai."
else
  echo "[entrypoint] Folder migrations tidak ditemukan, skip."
fi

# Start aplikasi
echo "[entrypoint] Memulai server Next.js..."
exec node server.js

