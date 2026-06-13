# API Mobile - Pengajuan (Cuti, Izin, Sakit, Lembur)

Dokumentasi endpoint mobile untuk pengajuan Cuti, Izin, Sakit, dan Lembur.

> **Catatan:** Semua endpoint memerlukan header `Authorization: Bearer <token>`.  
> Token diperoleh dari endpoint login: `POST /api/mobile/auth/login`

---

## Autentikasi

Semua endpoint berikut memerlukan:
```
Authorization: Bearer <mobile_token>
```

---

## Cuti

### 1. List Pengajuan Cuti + Saldo

**GET** `/api/mobile/cuti`

**Query params (opsional):**
- `status` — filter by status (draft, submitted, approved_supervisor, rejected_supervisor, approved_hrd, rejected_hrd, cancelled)

**Response:**
```json
{
  "saldo": [
    {
      "jenis_cuti": { "nama_jenis": "Cuti Tahunan", "maks_hari": 12 },
      "saldo_awal": 12,
      "saldo_terpakai": 3,
      "saldo_sisa": 9
    }
  ],
  "pengajuan": [
    {
      "id": 1,
      "jenis_cuti_id": 1,
      "tanggal_mulai": "2025-01-20",
      "tanggal_selesai": "2025-01-22",
      "jumlah_hari": 3,
      "alasan": "Cuti keluarga",
      "status": "submitted",
      "status_label": "Menunggu Persetujuan Atasan",
      "submitted_at": "2025-01-15T09:00:00.000Z",
      "leave_request_approvals": [...]
    }
  ]
}
```

---

### 2. Buat Pengajuan Cuti (Draft)

**POST** `/api/mobile/cuti/buat`

**Body:**
```json
{
  "jenis_cuti_id": 1,
  "tanggal_mulai": "2025-01-20",
  "tanggal_selesai": "2025-01-22",
  "alasan": "Cuti keluarga"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "status": "draft",
    ...
  }
}
```

---

### 3. Detail Pengajuan Cuti

**GET** `/api/mobile/cuti/{id}`

**Response:**
```json
{
  "id": 1,
  "jenis_cuti_id": 1,
  "tanggal_mulai": "2025-01-20",
  "tanggal_selesai": "2025-01-22",
  "jumlah_hari": 3,
  "alasan": "...",
  "status": "submitted",
  "status_label": "Menunggu Persetujuan Atasan",
  "approvals": [
    {
      "approval_level": 1,
      "approver_role": "atasan",
      "status": "pending",
      "note": null,
      "approved_at": null,
      "approver_nama": "Budi Santoso"
    },
    {
      "approval_level": 2,
      "approver_role": "hrd",
      "status": "pending",
      "note": null,
      "approved_at": null,
      "approver_nama": null
    }
  ]
}
```

---

### 4. Submit Pengajuan Cuti

**POST** `/api/mobile/cuti/{id}/submit`

Mengubah status dari `draft` → `submitted`. Otomatis membuat record approval level 1 (atasan) dan level 2 (HRD).

**Response:**
```json
{ "success": true, "message": "Pengajuan cuti berhasil disubmit" }
```

---

### 5. Batalkan Pengajuan Cuti

**POST** `/api/mobile/cuti/{id}/cancel`

Hanya bisa membatalkan dengan status `draft` atau `submitted`.

**Response:**
```json
{ "success": true, "message": "Pengajuan cuti dibatalkan" }
```

---

### 6. List Cuti Pending (Untuk Atasan)

**GET** `/api/mobile/cuti/approval-pending`

Hanya bisa diakses oleh karyawan dengan jabatan atasan (Kepala Divisi, Manager, Ketua).

**Response:**
```json
[
  {
    "pengajuan_id": 1,
    "karyawan": {
      "id": 5,
      "nama_karyawan": "Andi Wijaya",
      "jabatan": "Staff",
      "foto": null
    },
    "jenis_cuti": { "nama_jenis": "Cuti Tahunan" },
    "tanggal_mulai": "2025-01-20",
    "tanggal_selesai": "2025-01-22",
    "jumlah_hari": 3,
    "alasan": "...",
    "status": "submitted",
    "submitted_at": "2025-01-15T09:00:00.000Z"
  }
]
```

---

### 7. Approve / Reject Cuti (Level 1 — Atasan)

**POST** `/api/mobile/cuti/{id}/approve`  
**POST** `/api/mobile/cuti/{id}/reject`

Hanya untuk approval level 1 (atasan langsung). Level 2 (HRD final) dilakukan di aplikasi web.

**Body (reject wajib ada note):**
```json
{ "note": "Jadwal berbenturan dengan deadline proyek" }
```

**Response:**
```json
{ "success": true, "message": "Cuti disetujui. Menunggu verifikasi HRD." }
```
atau
```json
{ "success": true, "message": "Cuti ditolak" }
```

---

## Izin

### 1. List Pengajuan Izin

**GET** `/api/mobile/izin`

**Response:** array `pengajuan_izins` dengan field `status_label`.

---

### 2. Buat Pengajuan Izin (Draft)

**POST** `/api/mobile/izin`

**Body:**
```json
{
  "jenis_izin_id": 1,
  "tanggal_mulai": "2025-01-20",
  "tanggal_selesai": "2025-01-20",
  "jam_mulai": "09:00",
  "jam_selesai": "12:00",
  "alasan": "Urusan keluarga"
}
```

> `jam_mulai` dan `jam_selesai` wajib jika satuan jenis izin adalah `jam`.

---

### 3. Submit Pengajuan Izin

**POST** `/api/mobile/izin/{id}/submit`

**Response:**
```json
{ "success": true, "message": "Pengajuan izin berhasil disubmit" }
```

---

### 4. Approve / Reject Izin (Level 1 — Atasan)

**POST** `/api/mobile/izin/{id}/approve`  
**POST** `/api/mobile/izin/{id}/reject`

**Body (reject):**
```json
{ "note": "Alasan penolakan wajib diisi" }
```

---

## Sakit

### 1. List Pengajuan Sakit

**GET** `/api/mobile/sakit`

---

### 2. Buat Pengajuan Sakit (Draft)

**POST** `/api/mobile/sakit`

**Body (multipart/form-data):**
```
tanggal_mulai    : 2025-01-20
tanggal_selesai  : 2025-01-22
keterangan       : Demam tinggi
lampiran         : <file> (PDF/JPG/PNG, max 5MB, WAJIB)
```

> Lampiran surat dokter/surat sakit wajib diunggah.

---

### 3. Submit Pengajuan Sakit

**POST** `/api/mobile/sakit/{id}/submit`

**Response:**
```json
{ "success": true, "message": "Pengajuan sakit berhasil disubmit" }
```

---

### 4. Approve / Reject Sakit (Level 1 — Atasan)

**POST** `/api/mobile/sakit/{id}/approve`  
**POST** `/api/mobile/sakit/{id}/reject`

**Body (reject):**
```json
{ "note": "Alasan penolakan" }
```

---

### 5. Batalkan Pengajuan Sakit

**POST** `/api/mobile/sakit/{id}/cancel`

Hanya untuk status `draft` atau `submitted`.

---

## Lembur

### 1. List Pengajuan Lembur

**GET** `/api/mobile/lembur`

**Query params (opsional):**
- `status` — filter by status

**Response:**
```json
[
  {
    "id": 1,
    "tanggal_lembur": "2025-01-20T00:00:00.000Z",
    "jam_mulai_rencana": "17:00",
    "jam_selesai_rencana": "20:00",
    "durasi_rencana_menit": 180,
    "alasan_lembur": "Deadline proyek",
    "pekerjaan_lembur": "Finishing laporan Q4",
    "is_lintas_hari": false,
    "status": "draft",
    "status_label": "Draft",
    "overtime_settings": { "nama_setting": "Lembur Hari Kerja", "tipe_hari": "hari_kerja" }
  }
]
```

---

### 2. Buat Pengajuan Lembur (Draft)

**POST** `/api/mobile/lembur`

**Body:**
```json
{
  "tanggal_lembur": "2025-01-20",
  "jam_mulai_rencana": "17:00",
  "jam_selesai_rencana": "20:00",
  "alasan_lembur": "Deadline proyek",
  "pekerjaan_lembur": "Finishing laporan Q4",
  "is_lintas_hari": false
}
```

> Validasi:
> - Durasi minimal sesuai pengaturan lembur (mis. 30 menit)
> - Tidak boleh overlap dengan lembur lain di tanggal yang sama

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "status": "draft",
    ...
  }
}
```

---

### 3. Submit Pengajuan Lembur

**POST** `/api/mobile/lembur/{id}/submit`

**Response:**
```json
{ "success": true, "message": "Pengajuan lembur berhasil disubmit" }
```

---

### 4. Approve / Reject Lembur (Level 1 — Atasan)

**POST** `/api/mobile/lembur/{id}/approve`  
**POST** `/api/mobile/lembur/{id}/reject`

Hanya untuk approval level 1 (atasan langsung). Level 2 (HRD final) dilakukan di aplikasi web.

**Body (reject wajib ada note):**
```json
{ "note": "Lembur tidak terencana dengan baik" }
```

**Response:**
```json
{ "success": true, "message": "Lembur disetujui. Menunggu verifikasi HRD." }
```

---

### 5. Batalkan Pengajuan Lembur

**POST** `/api/mobile/lembur/{id}/cancel`

Hanya untuk status `draft` atau `submitted`.

---

### 6. List Lembur Pending (Untuk Atasan)

**GET** `/api/mobile/lembur/approval-pending`

Hanya bisa diakses oleh karyawan dengan jabatan atasan.

**Response:**
```json
[
  {
    "overtime_id": 1,
    "karyawan": {
      "id": 5,
      "nama_karyawan": "Andi Wijaya",
      "jabatan": "Staff",
      "foto": null
    },
    "tanggal_lembur": "2025-01-20T00:00:00.000Z",
    "jam_mulai_rencana": "17:00",
    "jam_selesai_rencana": "20:00",
    "durasi_rencana_menit": 180,
    "alasan_lembur": "Deadline proyek",
    "pekerjaan_lembur": "Finishing laporan Q4",
    "is_lintas_hari": false,
    "tipe_hari": "hari_kerja",
    "status": "submitted",
    "status_label": "Menunggu Persetujuan Atasan",
    "submitted_at": "2025-01-15T09:00:00.000Z"
  }
]
```

---

## Alur Approval

```
Draft → Submit → Level 1 (Atasan via Mobile) → Level 2 (HRD via Web)
                                               ↓                      ↓
                                          Approved               Rejected
```

| Level | Siapa | Via |
|-------|-------|-----|
| Level 1 | Atasan Langsung (Kepala Divisi / Manager / Ketua) | Mobile App |
| Level 2 | Kepala Divisi HRD | Aplikasi Web |

> Jika karyawan tidak memiliki atasan langsung, pengajuan langsung masuk ke HRD (Level 2).

---

## Status Pengajuan

| Status | Keterangan |
|--------|-----------|
| `draft` | Baru dibuat, belum disubmit |
| `submitted` | Sudah disubmit, menunggu approval level 1 |
| `approved_supervisor` | Disetujui atasan, menunggu HRD |
| `rejected_supervisor` | Ditolak atasan |
| `approved_hrd` | Disetujui HRD (final) |
| `rejected_hrd` | Ditolak HRD |
| `cancelled` | Dibatalkan karyawan |

---

## Error Responses

| HTTP Status | Keterangan |
|-------------|-----------|
| 400 | Request tidak valid (field kosong, dsb.) |
| 401 | Token tidak valid atau expired |
| 403 | Tidak memiliki izin akses |
| 404 | Data tidak ditemukan |
| 409 | Konflik data (overlap tanggal) |
| 422 | Validasi bisnis gagal (saldo tidak cukup, status tidak sesuai, dsb.) |
| 500 | Internal server error |

---

*Dokumentasi ini mencakup endpoint mobile untuk Cuti, Izin, Sakit, dan Lembur.*  
*Untuk endpoint Absensi (GPS + selfie), lihat [api-mobile.md](./api-mobile.md).*
