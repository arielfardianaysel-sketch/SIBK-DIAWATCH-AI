# Audit training DiaWatch — kalibrasi belum diaktifkan

Audit ini membaca artefak lokal dan menguji tokenisasi server. Tidak ada fine-tuning,
perubahan server, perubahan tabel, pembacaan .env, atau aktivasi persentase.

## Notebook dan bukti MAX_LENGTH

| Artefak | Status | MAX_LENGTH |
| --- | --- | --- |
| DiaWatch_Qwen3_QLoRA_Colab.ipynb | Tersedia; 0 sel tercatat dieksekusi | 256 pada sumber |
| DiaWatch_Qwen3_QLoRA_Colab_fix_dependency.ipynb | Belum ditemukan secara lokal | 256 menurut informasi pengguna; kode belum dibandingkan |
| DiaWatch_Qwen3_QLoRA_Colab_fix_MAX_LENGTH.ipynb | Belum ditemukan secara lokal | 512 menurut informasi pengguna; kode belum dibandingkan |
| DiaWatch_Qwen3_QLoRA_Colab_fix_MAX_LENGTH(1).ipynb | Belum ditemukan secara lokal | 512 menurut informasi pengguna; kode belum dibandingkan |
| diawatch_model_metadata.json | Tersedia bersama adapter asli | 512 |

Pada kode yang tersedia, `MAX_LENGTH` adalah batas dalam `assert`, bukan argumen
truncation/padding pada tokenizer. Urutan training adalah prefix chat + token label
+ EOS. Seluruh 2.200 baris kandidat memerlukan 260–263 token termasuk jawaban:
1.600 train, 300 validation, 300 test. Semua gagal pada batas 256 dan muat dalam 512.
Ini menunjukkan bahwa versi 256 tidak dapat memproses kandidat apa adanya;
bukan bukti bahwa nilai runtime historis pasti tepat 512. Nilai 512 paling konsisten
dengan metadata dan perbaikan yang dilaporkan pengguna.

## Tokenisasi dan model

- Build server: b12302-f7b886fe6; alias diawatch.
- Base model: Qwen3-4B-Instruct-2507-Q4_K_M.gguf.
- Adapter proyek aktif pada ID 0, skala 1.0.
- Seluruh 504 tensor GGUF cocok dengan adapter asli safetensors.
- Teks template server dan ekspor berbeda, tetapi ketiga contoh memiliki urutan
  token ID identik. Tokenisasi teks Colab oleh kedua tokenizer juga identik.
- Contoh sintetis memerlukan 260, 260, dan 273 token termasuk label/EOS; contoh
  ketiga sengaja menguji panjang angka dan bukan profil kesehatan valid.
- Tidak ada alasan mengubah template global berdasarkan contoh yang diuji.
  Pemeriksaan ini tidak mencakup template tools/multimodal yang tidak dipakai classifier.

## Rekonstruksi kandidat dan potensi kebocoran

Dataset publik UCI 891 berisi 253.680 baris. Seed 42 merekonstruksi pool
177.576 train, 38.052 validation, dan 38.052 test. Sampel train yang dipakai
kode berjumlah 1.600, seimbang 800/kelas; sampel validation dan test masing-masing
300, dengan 258 label 0 dan 42 label 1.

| Pasangan | Irisan indeks baris | Vektor fitur identik |
| --- | ---: | ---: |
| Train–validation | 0 | 6 |
| Train–test | 0 | 3 |
| Validation–test | 0 | 1 |

Vektor fitur identik tidak membuktikan orang yang sama, tetapi dapat memengaruhi
penilaian generalisasi. Evaluasi ketat perlu kebijakan pengecualian duplikat yang
terdokumentasi, tanpa mengubah model training yang sudah ada.

Urutan label CSV evaluasi lama cocok dengan 30 baris pertama test kandidat.
Ini bukti konsistensi tambahan, bukan bukti bahwa semua baris training historis
sudah diketahui. Indeks kandidat, checksum CSV publik, fingerprint artefak, kode
fungsi relevan, dan versi library disimpan di `training_audit.json`.
Indeks di sana adalah hasil rekonstruksi, BUKAN manifest historis dari Colab.

## Keputusan

Kalibrator belum dilatih; Accuracy/Precision/Recall/F1/Brier dan grafik kalibrasi
baru pada test terverifikasi belum dapat dilaporkan. File `calibration.json` tidak
dibuat, dan persentase website tetap tidak diaktifkan. Hasil sintetis tidak dipakai
sebagai ukuran performa model.

Diperlukan isi tiga notebook fix. Jika kode samplingnya identik, ketidakpastian
file mana yang dijalankan tidak harus menghalangi rekonstruksi split. Jika berbeda,
diperlukan notebook yang dieksekusi, log training, atau manifest indeks. Alternatif
adalah holdout baru yang dapat dipastikan tidak pernah dipakai fine-tuning.
Pengujian pada rekonstruksi yang belum terverifikasi hanya boleh diberi label
pengujian eksploratif dan tidak menjadi dasar aktivasi skor.

Sumber metode: https://huggingface.co/docs/transformers/main/en/chat_templating
Dataset: https://archive.ics.uci.edu/dataset/891/cdc+diabetes+health+indicators
