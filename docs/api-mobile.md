# Dokumentasi API Mobile — Absensi Pegawai PEDAMI

**Base URL:** `https://domain-anda.com`  
**Versi:** 1.0  
**Autentikasi:** Bearer Token (lihat bagian Login)

---

## Daftar Endpoint

| No | Method | Endpoint | Keterangan |
|----|--------|----------|-----------|
| 1 | POST | `/api/mobile/auth/login` | Login & dapatkan token |
| 2 | POST | `/api/mobile/auth/logout` | Logout & hapus token |
| 3 | GET | `/api/mobile/profile` | Profil karyawan yang login |
| 4 | GET | `/api/mobile/absensi/hari-ini` | Status absensi hari ini |
| 5 | POST | `/api/mobile/upload/foto` | Upload foto selfie |
| 6 | POST | `/api/mobile/absensi/masuk` | Absen masuk (foto + GPS) |
| 7 | POST | `/api/mobile/absensi/pulang` | Absen pulang (foto + GPS) |
| 8 | GET | `/api/mobile/absensi/riwayat` | Riwayat absensi |
| 9 | GET | `/api/mobile/jadwal-shift/saya` | Jadwal shift saya |

---

## Autentikasi

Semua endpoint **kecuali login** memerlukan header:
```
Authorization: Bearer <token>
```

Token berlaku **30 hari** sejak login terakhir. Jika expired, client harus login ulang.

---

## 1. Login

**POST** `/api/mobile/auth/login`

### Request Body
```json
{
  "email":       "pegawai@pedami.com",
  "password":    "password123",
  "device_info": "Samsung Galaxy A54"
}
```
| Field | Tipe | Wajib | Keterangan |
|-------|------|-------|-----------|
| email | string | Ya | Email akun web |
| password | string | Ya | Password akun web |
| device_info | string | Tidak | Info perangkat (untuk manajemen session) |

### Response Sukses (200)
```json
{
  "token":      "a1b2c3d4e5f6...",
  "expires_at": "2026-07-12T08:00:00.000Z",
  "user": {
    "id":            2,
    "name":          "Riny Fuji Hastuti",
    "email":         "riny@pedami.com",
    "role":          "admin",
    "karyawan_id":   26,
    "nik":           "52104201",
    "nama_karyawan": "Riny Fuji Hastuti, S.Kom",
    "jabatan":       "Staff",
    "foto":          null
  }
}
```

### Response Error
```json
{ "error": "Email atau password salah" }  // 401
{ "error": "Akun ini belum terhubung ke data karyawan. Hubungi Admin." }  // 403
```

---

## 2. Logout

**POST** `/api/mobile/auth/logout`  
**Header:** `Authorization: Bearer <token>`

### Response
```json
{ "success": true, "message": "Logout berhasil" }
```

---

## 3. Profil

**GET** `/api/mobile/profile`  
**Header:** `Authorization: Bearer <token>`

### Response Sukses (200)
```json
{
  "id":            26,
  "nik":           "52104201",
  "nama_karyawan": "Riny Fuji Hastuti, S.Kom",
  "jabatan":       "Staff",
  "jkel":          "Perempuan",
  "status_karyawan": "Aktif",
  "foto":          null,
  "tanggal_masuk_kerja": "2021-01-01",
  "no_hp":         "08123456789",
  "alamat":        "Jl. ...",
  "nama_divisi":   "HRD",
  "nama_subdivisi": "Back Office",
  "user": {
    "id":    2,
    "name":  "Riny Fuji Hastuti",
    "email": "riny@pedami.com",
    "role":  "admin"
  }
}
```

---

## 4. Status Absensi Hari Ini

**GET** `/api/mobile/absensi/hari-ini`  
**Header:** `Authorization: Bearer <token>`

### Response Sukses (200)
```json
{
  "tanggal":         "2026-06-12T00:00:00.000Z",
  "is_hari_libur":   false,
  "nama_hari_libur": null,
  "shift": {
    "kode_shift":                "PAGI",
    "nama_shift":                "Shift Pagi",
    "jam_masuk":                 "08:00:00",
    "jam_pulang":                "16:00:00",
    "toleransi_terlambat_menit": 15,
    "is_lintas_hari":            false
  },
  "absensi": {
    "id":                    123,
    "jam_masuk":             "07:55",
    "jam_pulang":            null,
    "status_absensi":        "hadir",
    "is_terlambat":          false,
    "is_pulang_cepat":       false,
    "menit_terlambat":       0,
    "menit_pulang_cepat":    0,
    "total_jam_kerja_menit": 0,
    "metode_input":          "mobile",
    "foto_masuk":            "/uploads/mobile/selfie/uuid.jpg",
    "foto_pulang":           null
  },
  "bisa_masuk":  false,
  "bisa_pulang": true,
  "lokasi_config": {
    "nama_lokasi":  "Kantor Utama",
    "latitude":     -3.3194374,
    "longitude":    114.5907741,
    "radius_meter": 100
  }
}
```

**Logika `bisa_masuk` dan `bisa_pulang`:**
- `bisa_masuk = true` → belum ada jam_masuk hari ini, dan bukan hari libur
- `bisa_pulang = true` → sudah ada jam_masuk, belum ada jam_pulang, dan bukan hari libur

---

## 5. Upload Foto Selfie

**POST** `/api/mobile/upload/foto`  
**Header:** `Authorization: Bearer <token>`  
**Content-Type:** `multipart/form-data`

### Request Form
| Field | Tipe | Keterangan |
|-------|------|-----------|
| foto | File | JPG/PNG/WEBP, maks 5 MB |

### Response Sukses (200)
```json
{
  "path": "/uploads/mobile/selfie/a1b2c3d4-uuid.jpg",
  "size": 245678
}
```

> **Alur yang benar:**  
> 1. Upload foto → dapat `path`  
> 2. Kirim `path` tersebut ke endpoint absen masuk/pulang

---

## 6. Absen Masuk

**POST** `/api/mobile/absensi/masuk`  
**Header:** `Authorization: Bearer <token>`

### Request Body
```json
{
  "latitude":       -3.3194374,
  "longitude":      114.5907741,
  "foto_path":      "/uploads/mobile/selfie/uuid.jpg",
  "catatan":        "Masuk via mobile",
  "perangkat_info": "Samsung Galaxy A54 / Android 14"
}
```
| Field | Tipe | Wajib | Keterangan |
|-------|------|-------|-----------|
| latitude | number | Ya | Koordinat GPS pegawai |
| longitude | number | Ya | Koordinat GPS pegawai |
| foto_path | string | Ya | Path foto dari endpoint upload |
| catatan | string | Tidak | Catatan tambahan |
| perangkat_info | string | Tidak | Info perangkat |

### Response Sukses (200)
```json
{
  "success":         true,
  "message":         "Absen masuk berhasil pukul 07:55",
  "jam_masuk":       "07:55",
  "status_absensi":  "hadir",
  "is_terlambat":    false,
  "menit_terlambat": 0,
  "jarak_meter":     45,
  "shift": {
    "kode_shift": "PAGI",
    "nama_shift": "Shift Pagi",
    "jam_masuk":  "08:00:00",
    "jam_pulang": "16:00:00"
  },
  "absensi_id": 123
}
```

### Response Error
```json
{ "error": "Anda berada di luar radius absensi. Jarak Anda: 250m, radius maksimum: 100m.", "jarak_meter": 250 }  // 422
{ "error": "Anda sudah absen masuk hari ini pada pukul 07:55", "absensi": {...} }  // 409
```

---

## 7. Absen Pulang

**POST** `/api/mobile/absensi/pulang`  
**Header:** `Authorization: Bearer <token>`

### Request Body
```json
{
  "latitude":       -3.3194374,
  "longitude":      114.5907741,
  "foto_path":      "/uploads/mobile/selfie/uuid2.jpg",
  "catatan":        "",
  "perangkat_info": "Samsung Galaxy A54 / Android 14"
}
```

### Response Sukses (200)
```json
{
  "success":            true,
  "message":            "Absen pulang berhasil pukul 16:05",
  "jam_pulang":         "16:05",
  "status_absensi":     "hadir",
  "is_pulang_cepat":    false,
  "menit_pulang_cepat": 0,
  "total_jam_kerja":    "8j 10m",
  "jarak_meter":        38,
  "absensi_id":         123
}
```

### Response Error
```json
{ "error": "Belum ada data absen masuk hari ini. Lakukan absen masuk terlebih dahulu." }  // 422
{ "error": "Anda sudah absen pulang hari ini pada pukul 16:05" }  // 409
```

---

## 8. Riwayat Absensi

**GET** `/api/mobile/absensi/riwayat`  
**Header:** `Authorization: Bearer <token>`

### Query Parameters
| Parameter | Tipe | Default | Keterangan |
|-----------|------|---------|-----------|
| tgl_mulai | string (YYYY-MM-DD) | Awal bulan ini | Tanggal mulai |
| tgl_selesai | string (YYYY-MM-DD) | Akhir bulan ini | Tanggal selesai |

**Contoh:** `/api/mobile/absensi/riwayat?tgl_mulai=2026-06-01&tgl_selesai=2026-06-30`

### Response Sukses (200)
```json
{
  "rekap": {
    "hadir":             15,
    "terlambat":          2,
    "pulang_cepat":       1,
    "alpha":              0,
    "tidak_masuk":        0,
    "tidak_pulang":       0,
    "cuti":               3,
    "izin":               1,
    "sakit":              0,
    "libur":              4,
    "total_jam_menit":  7260,
    "total_terlambat_menit": 35
  },
  "data": [
    {
      "id":                    123,
      "tanggal_absensi":       "2026-06-12T00:00:00.000Z",
      "jam_masuk":             "07:55",
      "jam_pulang":            "16:05",
      "status_absensi":        "hadir",
      "is_terlambat":          false,
      "is_pulang_cepat":       false,
      "menit_terlambat":       0,
      "menit_pulang_cepat":    0,
      "total_jam_kerja_menit": 490,
      "metode_input":          "mobile",
      "shift": {
        "kode_shift": "PAGI",
        "nama_shift": "Shift Pagi",
        "jam_masuk":  "08:00:00",
        "jam_pulang": "16:00:00"
      }
    }
  ],
  "periode": {
    "dtMulai":   "2026-06-01T00:00:00.000Z",
    "dtSelesai": "2026-06-30T00:00:00.000Z"
  }
}
```

---

## 9. Jadwal Shift Saya

**GET** `/api/mobile/jadwal-shift/saya`  
**Header:** `Authorization: Bearer <token>`

### Query Parameters
| Parameter | Tipe | Default | Keterangan |
|-----------|------|---------|-----------|
| tgl_mulai | string (YYYY-MM-DD) | Hari ini | Tanggal mulai |
| tgl_selesai | string (YYYY-MM-DD) | +6 hari | Tanggal selesai |

### Response Sukses (200)
```json
{
  "data": [
    {
      "id":           1001,
      "tanggal":      "2026-06-12T00:00:00.000Z",
      "is_hari_libur": false,
      "hari_libur":   null,
      "shift": {
        "id":                          1,
        "kode_shift":                  "PAGI",
        "nama_shift":                  "Shift Pagi",
        "jam_masuk":                   "08:00:00",
        "jam_pulang":                  "16:00:00",
        "toleransi_terlambat_menit":   15,
        "is_lintas_hari":              false,
        "durasi_kerja_menit":          480
      }
    }
  ],
  "periode": {
    "dtMulai":   "2026-06-12T00:00:00.000Z",
    "dtSelesai": "2026-06-18T00:00:00.000Z"
  }
}
```

---

## Kode Status HTTP

| Kode | Keterangan |
|------|-----------|
| 200 | Sukses |
| 201 | Sukses (data baru dibuat) |
| 400 | Request tidak valid (field wajib kosong, dll) |
| 401 | Token tidak valid atau expired |
| 403 | Tidak memiliki akses |
| 409 | Konflik (sudah absen, dll) |
| 422 | Data tidak valid (di luar radius, status karyawan, dll) |
| 500 | Server error |

---

## Alur Lengkap Absensi Mobile

```
1. Login → simpan token di local storage / keychain

2. Setiap buka app:
   GET /api/mobile/absensi/hari-ini
   → tampilkan status, shift, bisa_masuk/bisa_pulang, peta radius

3. Absen Masuk:
   a. Minta izin kamera & GPS
   b. Ambil foto selfie
   c. POST /api/mobile/upload/foto → dapat foto_path
   d. POST /api/mobile/absensi/masuk (latitude, longitude, foto_path)
   e. Tampilkan hasil (jam, status, jarak)

4. Absen Pulang:
   a-d. Sama seperti absen masuk
   e. Tampilkan hasil (jam, total jam kerja)

5. Riwayat:
   GET /api/mobile/absensi/riwayat
   → tampilkan kalender/list absensi bulan ini

6. Jadwal:
   GET /api/mobile/jadwal-shift/saya
   → tampilkan 7 hari ke depan
```

---

## Catatan Konfigurasi

### Koordinat Kantor
Update koordinat kantor via endpoint (admin):
```
POST /api/sdm/absensi/lokasi-config
{
  "nama_lokasi":  "Kantor Utama PEDAMI",
  "latitude":     -3.3194374,
  "longitude":    114.5907741,
  "radius_meter": 100
}
```

### Validasi Radius
Jika pegawai di luar radius, absensi **ditolak** dengan pesan error.  
Untuk menonaktifkan validasi radius sementara: set `aktif = false` pada semua konfigurasi lokasi.

---

## Perbedaan Absensi Mobile vs Manual (Web)

| Aspek | Mobile | Manual (Web) |
|-------|--------|-------------|
| Metode | `metode_input = "mobile"` | `metode_input = "manual"` |
| Foto | Wajib (selfie) | Tidak ada |
| GPS | Wajib (radius kantor) | Tidak ada |
| Input oleh | Pegawai sendiri | Admin/HRD |
| `is_manual` | `false` | `true` |
