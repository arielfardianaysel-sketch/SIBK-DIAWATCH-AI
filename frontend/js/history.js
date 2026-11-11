/**
 * DiaWatch AI — Riwayat kuesioner / skrining pribadi.
 * Cocok dengan GET /api/history => { items: [...] } maupun API helper yang
 * mengembalikan array secara langsung.
 * Menggunakan CSS class DiaWatch yang sudah ada; tidak perlu mengganti style.css.
 */
import { getHistory, deleteMyScreening } from './api.js';

// Autentikasi tetap divalidasi oleh FastAPI; guard() hanya membantu navigasi UI.
if (typeof window.guard === 'function') window.guard();

const listEl = document.getElementById('list');
const summaryEl = document.getElementById('history-summary');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeItem(raw) {
  const value = raw?.predicted_label ?? raw?.prediction?.predicted_label ?? raw?.result?.predicted_label;
  const numericLabel = nullableNumber(value);
  const label = (numericLabel === 0 || numericLabel === 1) ? numericLabel : null;
  return {
    id: String(raw?.id ?? raw?.screening_id ?? ''),
    created_at: raw?.created_at ?? raw?.submitted_at ?? null,
    predicted_label: label,
    bmi: nullableNumber(raw?.bmi ?? raw?.answers?.BMI ?? raw?.questionnaire_answers?.BMI),
    model_name: raw?.model_name ?? 'Qwen DiaWatch',
  };
}

function formatDate(isoString) {
  if (!isoString) return 'Tanggal tidak tersedia';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return 'Tanggal tidak tersedia';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Jakarta'
  }).format(date) + ' WIB';
}

function labelMeta(label) {
  if (label === 1) return { css: 'high', text: 'Kelas 1 · Prediabetes/diabetes' };
  if (label === 0) return { css: 'low', text: 'Kelas 0 · Tidak diabetes' };
  return { css: '', text: 'Label belum tersedia' };
}

function bmiDisplay(bmi) {
  return bmi === null ? 'Belum tersedia' : bmi.toFixed(1).replace(/\.0$/, '');
}

function displayHistoryComparison(item, previous) {
  if (!previous) return 'Skrining pertama yang tersimpan';
  if (item.predicted_label !== null && previous.predicted_label !== null) {
    if (item.predicted_label !== previous.predicted_label) {
      return `Hasil klasifikasi berubah dari kelas ${previous.predicted_label} menjadi kelas ${item.predicted_label}`;
    }
    if (item.bmi !== null && previous.bmi !== null) {
      const diff = item.bmi - previous.bmi;
      const sign = diff > 0 ? '+' : '';
      if (Math.abs(diff) > 0.001) {
        return `Kelas tetap ${item.predicted_label} · Perubahan BMI ${sign}${diff.toFixed(1)} kg/m²`;
      }
    }
    return `Hasil klasifikasi sama dengan pemeriksaan sebelumnya (kelas ${item.predicted_label})`;
  }
  return 'Catatan tersedia untuk dibandingkan dengan pemeriksaan berikutnya';
}

function renderEmpty() {
  summaryEl?.classList.add('hide');
  if (!listEl) return;
  listEl.innerHTML = `
    <div class="card empty-state">
      <div class="empty-state-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="12" y1="18" x2="12" y2="12"/>
          <line x1="9" y1="15" x2="15" y2="15"/>
        </svg>
      </div>
      <h2 style="font-size:1.35rem;margin-bottom:0.5rem">Belum Ada Riwayat Skrining</h2>
      <p class="note" style="max-width:440px;margin:0 auto 1.5rem">
        Kuesioner yang telah kamu selesaikan akan tersimpan di sini, bersama hasil klasifikasi dan saran personal.
      </p>
      <a class="btn" href="screening.html">Mulai Skrining Pertama</a>
    </div>`;
}

function renderSummary(items) {
  if (!summaryEl) return;
  const latest = items[0];
  const latestLabel = labelMeta(latest.predicted_label);
  const countClassOne = items.filter((x) => x.predicted_label === 1).length;
  const countClassZero = items.filter((x) => x.predicted_label === 0).length;
  summaryEl.classList.remove('hide');
  summaryEl.innerHTML = `
    <div class="dash-card">
      <div class="dash-card-header">
        <span class="dash-card-label">Total Kuesioner</span>
        <div class="dash-card-icon" aria-hidden="true">📋</div>
      </div>
      <div class="dash-card-val">${items.length} kali</div>
      <span class="dash-card-sub">Riwayat tersimpan di akunmu</span>
    </div>
    <div class="dash-card">
      <div class="dash-card-header">
        <span class="dash-card-label">Hasil Skrining Terakhir</span>
        <div class="dash-card-icon" aria-hidden="true">🩺</div>
      </div>
      <div class="dash-card-val">
        <span class="pill ${latestLabel.css}">${escapeHtml(latestLabel.text)}</span>
      </div>
      <span class="dash-card-sub">${escapeHtml(formatDate(latest.created_at))}</span>
    </div>
    <div class="dash-card">
      <div class="dash-card-header">
        <span class="dash-card-label">Ringkasan Hasil</span>
        <div class="dash-card-icon" aria-hidden="true">📊</div>
      </div>
      <div class="dash-card-val">${countClassZero} / ${countClassOne}</div>
      <span class="dash-card-sub">Jumlah kelas 0 / kelas 1 dalam riwayat</span>
    </div>`;
}

function renderItems(items) {
  if (!listEl) return;
  listEl.innerHTML = items.map((item, index) => {
    const label = labelMeta(item.predicted_label);
    const comparison = displayHistoryComparison(item, items[index + 1]);
    const date = escapeHtml(formatDate(item.created_at));
    const id = encodeURIComponent(item.id);
    const safeId = escapeHtml(item.id);
    const safeModel = escapeHtml(item.model_name);
    const details = item.id
      ? `<a class="btn ghost btn-sm" href="report.html?id=${id}">Buka Detail Laporan</a>`
      : '';
    const deleteButton = item.id
      ? `<button type="button" class="btn ghost btn-sm btn-delete-history" data-id="${safeId}" style="color:var(--high)">Hapus</button>`
      : '';

    return `
      <article class="history-item" data-id="${safeId}">
        <div style="flex:1;min-width:200px">
          <span class="history-date">📅 ${date}</span>
          <div style="display:flex;align-items:center;gap:0.6rem;margin-top:0.45rem;flex-wrap:wrap">
            <span class="pill ${label.css}">${escapeHtml(label.text)}</span>
            <b style="font-size:1.05rem;color:var(--ink)">BMI: ${escapeHtml(bmiDisplay(item.bmi))}</b>
          </div>
          <p class="history-meta note" style="margin-top:0.4rem">
            ${escapeHtml(comparison)}
          </p>
          <p class="note" style="margin-top:0.25rem;font-size:0.82rem">
            Model: ${safeModel}
          </p>
        </div>
        <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">
          ${details}
          ${deleteButton}
        </div>
      </article>`;
  }).join('');
}

async function loadHistory() {
  if (!listEl) return;
  listEl.innerHTML = '<div class="card"><p class="note">Memuat catatan riwayat Anda...</p></div>';
  try {
    const response = await getHistory();
    // Beberapa api.js mengembalikan array, yang lain mengembalikan {items:[...]}.
    const rawItems = Array.isArray(response) ? response : (response?.items ?? response?.data ?? []);
    if (!Array.isArray(rawItems)) throw new Error('Format respons riwayat tidak sesuai');
    const items = rawItems
      .map(normalizeItem)
      .sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));

    if (items.length === 0) {
      renderEmpty();
      return;
    }
    renderSummary(items);
    renderItems(items);
  } catch (error) {
    summaryEl?.classList.add('hide');
    console.error('Gagal memuat riwayat:', error);
    const message = escapeHtml(error?.message || 'Kesalahan tidak diketahui');
    listEl.innerHTML = `
      <div class="card" role="alert">
        <div class="err">Gagal memuat riwayat: ${message}</div>
        <p class="note">Periksa apakah kamu sudah login dan FastAPI berjalan pada port 8000.</p>
        <button class="btn ghost btn-sm" type="button" id="retry-history">Coba Lagi</button>
      </div>`;
    document.getElementById('retry-history')?.addEventListener('click', loadHistory);
  }
}

// Satu handler untuk semua tombol Hapus, termasuk yang dirender ulang.
listEl?.addEventListener('click', async (event) => {
  const btn = event.target.closest('.btn-delete-history');
  if (!btn || !listEl.contains(btn)) return;
  const id = btn.dataset.id;
  if (!id || !window.confirm('Hapus riwayat skrining ini secara permanen?')) return;
  btn.disabled = true;
  btn.textContent = 'Menghapus...';
  try {
    await deleteMyScreening(id);
    await loadHistory();
  } catch (error) {
    window.alert('Gagal menghapus riwayat: ' + (error?.message || String(error)));
    btn.disabled = false;
    btn.textContent = 'Hapus';
  }
});

loadHistory();
