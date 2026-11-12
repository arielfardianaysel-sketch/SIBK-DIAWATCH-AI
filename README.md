# DiaWatch AI
Aplikasi skrining risiko diabetes (HTML, CSS, JavaScript). Untuk edukasi, bukan diagnosis medis.

## Menjalankan

Panduan interpreter Windows/WSL, instalasi dependensi, pemeriksaan environment,
dan pengujian tersedia di [backend/ENVIRONMENT.md](backend/ENVIRONMENT.md).

Dari root repository, setelah environment Linux siap:

```bash
backend/.venv-linux/bin/python -m uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Di terminal kedua:

```bash
backend/.venv-linux/bin/python -m http.server 5500 --bind 127.0.0.1 --directory frontend
```

Buka http://localhost:5500. Jalankan llama.cpp dengan model dan adapter yang
sudah dikonfigurasi pada port 8080 untuk menggunakan prediksi.

## Integrasi yang digunakan

Frontend menggunakan Supabase Auth dan FastAPI melalui
`frontend/js/diawatch-supabase.js`; `frontend/js/api.js` menyediakan normalisasi
dan antarmuka kompatibilitas. Pada jalur ini, `USE_MOCK` dan `API_URL` dalam
konfigurasi lama tidak mengalihkan permintaan jaringan.

Endpoint backend: `GET /health`, `POST /api/predict`, `GET /api/history`, dan
`GET /api/history/{id}`. Penghapusan riwayat menggunakan Supabase dan bergantung
pada RLS. Konfigurasi rahasia tetap dikelola secara lokal; jangan memasukkannya
ke dokumentasi atau commit.

Saat ini model menghasilkan label 0/1, skor persentase backend masih kosong,
dan rekomendasi masih berbasis aturan. Evaluasi dan pengumpulan referensi
tersedia sebagai skrip terpisah; keduanya belum menjadi kalibrasi atau retrieval
yang terintegrasi ke endpoint prediksi.
