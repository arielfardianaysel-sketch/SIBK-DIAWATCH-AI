# DiaWatch AI
Aplikasi skrining risiko diabetes (HTML, CSS, JavaScript). Untuk edukasi, bukan diagnosis medis.

## Menjalankan
1. `cp frontend/js/config.example.js frontend/js/config.js`
2. `cd frontend && python -m http.server 5500`, buka http://localhost:5500
3. Mode mock aktif selama `USE_MOCK: true`. Data disimpan di localStorage (hanya data dummy).

## Menyambung ke API
Di `frontend/js/config.js` isi `API_URL` dengan URL backend/tunnel Colab dan set `USE_MOCK: false`.
Kontrak endpoint ada di `frontend/js/api.js`.
