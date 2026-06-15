#!/bin/sh
set -e

# ─────────────────────────────────────────────────────────────────────
# Docker Entrypoint — inventaris_baru
# Menjalankan semua migration SQL (idempotent) sebelum start server.
# ─────────────────────────────────────────────────────────────────────

# Parse DATABASE_URL: mysql://user:pass@host:port/dbname
DB_URL="${DATABASE_URL}"
if [ -z "$DB_URL" ]; then
  echo "[entrypoint] ERROR: DATABASE_URL tidak diset." >&2
  exit 1
fi

# Ekstrak komponen dari URL mysql://user:pass@host:port/dbname
DB_USER=$(echo "$DB_URL" | sed -E 's|mysql://([^:]+):.*|\1|')
DB_PASS=$(echo "$DB_URL" | sed -E 's|mysql://[^:]+:([^@]+)@.*|\1|')
DB_HOST=$(echo "$DB_URL" | sed -E 's|mysql://[^@]+@([^:/]+).*|\1|')
DB_PORT=$(echo "$DB_URL" | sed -E 's|mysql://[^@]+@[^:]+:([0-9]+)/.*|\1|')
DB_NAME=$(echo "$DB_URL" | sed -E 's|mysql://[^@]+@[^/]+/([^?]+).*|\1|')

DB_PORT="${DB_PORT:-3306}"

MYSQL_CMD="mysql -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} -p${DB_PASS} ${DB_NAME}"

# Tunggu database siap (maks 60 detik)
echo "[entrypoint] Menunggu database ${DB_HOST}:${DB_PORT}..."
RETRIES=30
until $MYSQL_CMD -e "SELECT 1" > /dev/null 2>&1 || [ $RETRIES -eq 0 ]; do
  RETRIES=$((RETRIES - 1))
  echo "[entrypoint] Database belum siap, retry dalam 2 detik... ($RETRIES)"
  sleep 2
done

if [ $RETRIES -eq 0 ]; then
  echo "[entrypoint] ERROR: Database tidak bisa diakses setelah 60 detik." >&2
  exit 1
fi
echo "[entrypoint] Database siap."

# Jalankan semua migration SQL secara berurutan (idempotent — IF NOT EXISTS)
MIGRATION_DIR="./database/migrations"
if [ -d "$MIGRATION_DIR" ]; then
  echo "[entrypoint] Menjalankan migrations dari $MIGRATION_DIR ..."
  for SQL_FILE in $(ls "$MIGRATION_DIR"/*.sql 2>/dev/null | sort); do
    echo "[entrypoint]   → $(basename $SQL_FILE)"
    $MYSQL_CMD < "$SQL_FILE" 2>&1 || echo "[entrypoint]     WARNING: $SQL_FILE mungkin sudah dijalankan sebelumnya, lanjut..."
  done
  echo "[entrypoint] Migrations selesai."
else
  echo "[entrypoint] Folder migrations tidak ditemukan, skip."
fi

# Start aplikasi
echo "[entrypoint] Memulai server Next.js..."
exec node server.js
