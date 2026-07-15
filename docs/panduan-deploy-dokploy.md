# Panduan Deploy: inventaris_baru ke Dokploy

> **Target:** Dokploy (self-hosted PaaS berbasis Docker Compose)
> **Stack:** Next.js 15, Prisma ORM, MySQL

---

## Prasyarat

| Kebutuhan | Keterangan |
|-----------|-----------|
| Server Dokploy | Sudah terinstall dan berjalan |
| MySQL | Sudah ada sebagai service di Dokploy (network: `dokploy-network`) |
| Git repo | Kode sudah di-push ke GitHub/GitLab |

---

## Langkah 1 — Siapkan Database MySQL

Database **harus sudah dibuat** sebelum deploy. Buat database baru via Dokploy database panel atau langsung di MySQL:

```sql
CREATE DATABASE asset_baru CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

> **Nama database bebas** — sesuaikan dengan `DATABASE_URL` di langkah berikutnya.

### Struktur tabel akan dibuat otomatis saat deploy pertama

Semua tabel dibuat otomatis oleh **script entrypoint** (`docker-entrypoint.sh`) saat container start untuk pertama kali. Urutan eksekusi file SQL (alphabetical):

1. **`000_create_core_tables.sql`** ← dijalankan PERTAMA, membuat 29 tabel core (users, karyawans, assets, divisis, dll.)
2. **`add_absensi.sql`, `add_cuti.sql`, ...** → membuat tabel-tabel modul (SDM, Payroll, Keuangan, dll.)
3. **`alter_*.sql`** → menambahkan kolom baru ke tabel yang sudah ada
4. **`seed_keuangan_demo.sql`** → data demo keuangan (opsional)

Semua file SQL bersifat **idempotent** (`CREATE TABLE IF NOT EXISTS`) — aman dijalankan berulang saat redeploy.

---

## Langkah 2 — Buat Aplikasi Baru di Dokploy

1. Login ke panel Dokploy
2. Pilih **Applications** → **Create Application**
3. Isi:
   - **Name:** `inventaris-baru` (atau sesuai keinginan)
   - **Source:** GitHub / GitLab (pilih repository ini)
   - **Branch:** `main` (atau branch yang diinginkan)
4. Pada **Build Type** pilih: **Docker Compose**
5. **Compose File Path:** `docker-compose.yml`

---

## Langkah 3 — Set Environment Variables

Di panel Dokploy → tab **Environment**, isi variabel berikut:

### Wajib

```env
DATABASE_URL=mysql://USER:PASSWORD@DB_HOST:3306/asset_baru
SESSION_SECRET=ganti-dengan-string-random-panjang-min-32-karakter
```

> **Catatan `DATABASE_URL`:**
> - `DB_HOST` = nama service MySQL di Dokploy (biasanya nama container, misal `mysql` atau hostname internal)
> - Pastikan service MySQL berada di network `dokploy-network`
> - Format: `mysql://username:password@hostname:3306/nama_database`

### Opsional — MinIO/S3 untuk foto absensi mobile

```env
MINIO_ENDPOINT=https://minio.yourdomain.com
MINIO_ACCESS_KEY_ID=your-access-key
MINIO_SECRET_ACCESS_KEY=your-secret-key
MINIO_BUCKET=inventaris-uploads
MINIO_REGION=us-east-1
```

> Jika tidak diisi, foto absensi mobile akan disimpan ke volume lokal (`/app/public/uploads`).

### Modul toggle (opsional — default semua `false` kecuali Aset)

```env
NEXT_PUBLIC_MODULE_ASET=true
NEXT_PUBLIC_MODULE_SDM=true
NEXT_PUBLIC_MODULE_KINERJA=false
NEXT_PUBLIC_MODULE_KEUANGAN=false
```

Ubah ke `true` untuk mengaktifkan modul yang diinginkan.

---

## Langkah 4 — Konfigurasi Network

Di Dokploy → tab **Network** atau langsung di `docker-compose.yml`:

Pastikan service `inventaris_baru` terhubung ke `dokploy-network` yang sama dengan service MySQL.

```yaml
# Sudah dikonfigurasi di docker-compose.yml:
networks:
  dokploy-network:
    external: true
```

> Jika nama network di Dokploy berbeda (misal `traefik-network`), ubah nilai `dokploy-network` di `docker-compose.yml`.

---

## Langkah 5 — Konfigurasi Domain & Port

Di Dokploy → tab **Domains**:

- **Port internal:** `3000`
- Tambahkan domain/subdomain yang diinginkan
- Enable HTTPS (Let's Encrypt) jika perlu

---

## Langkah 6 — Deploy

1. Klik **Deploy** di panel Dokploy
2. Pantau log build — proses akan:
   - Install dependencies (`npm ci`)
   - Generate Prisma Client (`prisma generate`)
   - Build Next.js (`npm run build`)
   - Start container

3. Saat container **pertama kali start**, `docker-entrypoint.sh` akan:
   ```
   [entrypoint] Menunggu database...
   [entrypoint] Database siap.
   [entrypoint] Menjalankan migrations dari ./database/migrations ...
   [entrypoint]   → add_absensi.sql
   [entrypoint]   → add_cuti.sql
   ... (semua 31 file SQL dijalankan berurutan)
   [entrypoint] Migrations selesai.
   [entrypoint] Memulai server Next.js...
   ```

---

## Langkah 7 — Verifikasi

Setelah deploy berhasil, buka browser dan akses domain aplikasi.

Login default (sesuaikan jika sudah diganti):
- Email: `admin@pedami.id`
- Password: lihat di `database/migrations/` file seed atau hubungi developer

---

## Redeploy (Update Versi)

Setiap push ke branch yang dikonfigurasi akan men-trigger build baru.

File SQL di `database/migrations/` **aman dijalankan berulang** karena semua menggunakan `CREATE TABLE IF NOT EXISTS` — tidak akan error meski sudah pernah dijalankan.

---

## Volume & Persistensi Data

| Volume | Path di Container | Isi |
|--------|------------------|-----|
| `inventaris_uploads` | `/app/public/uploads` | Foto selfie absensi, foto surat sakit, foto aset |

> **Penting:** Jangan hapus volume `inventaris_uploads` saat redeploy — berisi foto yang sudah diupload pengguna.

Di panel Dokploy, pastikan volume ini di-mount sebagai **persistent volume**.

---

## Troubleshooting

### Container gagal start — "Database tidak bisa diakses"

```
[entrypoint] ERROR: Database tidak bisa diakses setelah 60 detik.
```

- Cek apakah container MySQL sudah running
- Pastikan `DB_HOST` di `DATABASE_URL` adalah nama/IP yang benar dari dalam `dokploy-network`
- Cek apakah MySQL menerima koneksi dari container lain (bind address `0.0.0.0`)

### Prisma error — "Table does not exist"

**Sudah diatasi** sejak file `database/migrations/000_create_core_tables.sql` ditambahkan — semua tabel core kini dibuat oleh file SQL tersebut sebelum file migration lain berjalan.

Jika error masih muncul, kemungkinan penyebab dan solusi:

```bash
# Cek apakah file 000_create_core_tables.sql ada di container
docker exec -it <container_id> ls /app/database/migrations/ | head -5

# Jalankan ulang script migration secara manual
docker exec -it <container_id> sh -c 'MYSQL_PWD="$DB_PASS" mysql -h "$DB_HOST" -u "$DB_USER" "$DB_NAME" < /app/database/migrations/000_create_core_tables.sql'
```

### Error 500 di halaman login

- Cek `SESSION_SECRET` sudah diisi
- Cek `DATABASE_URL` format benar
- Lihat log container di Dokploy → tab **Logs**

### Foto tidak tersimpan / error upload

- Cek volume `inventaris_uploads` sudah di-mount
- Jika pakai MinIO, cek environment variables `MINIO_*`
- Cek bucket sudah dibuat dan access key punya izin `PutObject`

---

## Checklist Deploy Pertama Kali

- [ ] Database MySQL sudah dibuat
- [ ] `DATABASE_URL` sudah diisi dengan benar
- [ ] `SESSION_SECRET` sudah diisi (minimum 32 karakter, acak)
- [ ] Service MySQL dan container app berada di network yang sama (`dokploy-network`)
- [ ] Volume `inventaris_uploads` sudah dikonfigurasi sebagai persistent
- [ ] Domain sudah diarahkan ke server
- [ ] Modul yang diinginkan sudah di-enable via `NEXT_PUBLIC_MODULE_*`
