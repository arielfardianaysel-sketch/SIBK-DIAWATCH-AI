/**
 * DiaWatch AI - History & Longitudinal Trend Controller
 */
import { getHistory, deleteMyScreening, normalizeHistoryItem } from "./api.js";

// Protect route
guard();

async function loadHistory() {
  const listEl = $('#list');
  const summaryEl = $('#history-summary');

  try {
    const history = await getHistory();

    console.log("Riwayat pengguna:", history);

    // Berikutnya: tampilkan data pada
    // kartu Riwayat Skrining DiaWatch.
    const historyData = (history || []).map((item) => normalizeHistoryItem(item));

    // Handle Empty State
    if (!historyData || historyData.length === 0) {
      if (summaryEl) summaryEl.classList.add('hide');
      listEl.innerHTML = `
        <div class="card empty-state">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
          </div>
          <h2 style="font-size:1.35rem;margin-bottom:0.5rem">Belum Ada Riwayat Skrining</h2>
          <p class="note" style="max-width:440px;margin:0 auto 1.5rem">
            Anda belum pernah melakukan skrining. Hasil skrining mandiri Anda akan tercatat rapi di sini untuk memantau perubahan gaya hidup Anda.
          </p>
          <a class="btn" href="screening.html">Mulai Skrining Pertama Anda</a>
        </div>
      `;
      return;
    }

    // Populate Summary Cards
    const totalCount = historyData.length;
    const highRiskCount = historyData.filter((item) => item.predicted_label === 1).length;
    const latestItem = historyData[0];
    const latestLabelText =
      latestItem.predicted_label === 1 ? 'Terindikasi Berisiko' : 'Risiko Rendah';
    const latestScoreDisplay =
      latestItem.experimental_score_percent != null
        ? `${Math.round(latestItem.experimental_score_percent)}%`
        : `Label ${latestItem.predicted_label}`;

    if (summaryEl) {
      summaryEl.classList.remove('hide');
      summaryEl.innerHTML = `
        <div class="dash-card">
          <div class="dash-card-header">
            <span class="dash-card-label">Total Pemeriksaan</span>
            <div class="dash-card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
          </div>
          <div class="dash-card-val">${totalCount} kali</div>
          <span class="dash-card-sub">Tercatat dalam akun Supabase Anda</span>
        </div>

        <div class="dash-card">
          <div class="dash-card-header">
            <span class="dash-card-label">Hasil Terakhir</span>
            <div class="dash-card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            </div>
          </div>
          <div class="dash-card-val">
            <span class="pill ${esc(latestItem.result.risk_category)}">${esc(latestLabelText)}</span>
            <span style="font-size:1.05rem;font-weight:700;margin-left:0.35rem">${esc(latestScoreDisplay)}</span>
          </div>
          <span class="dash-card-sub">${fmtDate(latestItem.created_at)}</span>
        </div>

        <div class="dash-card">
          <div class="dash-card-header">
            <span class="dash-card-label">Proporsi Indikasi Risiko</span>
            <div class="dash-card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            </div>
          </div>
          <div class="dash-card-val">${highRiskCount} / ${totalCount}</div>
          <span class="dash-card-sub">Pemeriksaan dengan label berisiko (1)</span>
        </div>
      `;
    }

    // Render History Items
    listEl.innerHTML = historyData.map((item, index) => {
      const prevItem = historyData[index + 1];
      let trendHtml = '';

      if (prevItem) {
        if (item.predicted_label > prevItem.predicted_label) {
          trendHtml = `<span style="color:var(--high);font-weight:600">▲ Meningkat ke Label 1 (Berisiko)</span> dibanding skrining sebelumnya`;
        } else if (item.predicted_label < prevItem.predicted_label) {
          trendHtml = `<span style="color:var(--low);font-weight:600">▼ Membaik ke Label 0 (Tidak Berisiko)</span> dibanding skrining sebelumnya`;
        } else if (item.bmi != null && prevItem.bmi != null && item.bmi !== prevItem.bmi) {
          const bmiDiff = +(item.bmi - prevItem.bmi).toFixed(1);
          const sign = bmiDiff > 0 ? '+' : '';
          trendHtml = `<span style="color:var(--muted);font-weight:600">━ Status stabil</span> · Perubahan BMI ${sign}${bmiDiff} kg/m²`;
        } else {
          trendHtml = `<span style="color:var(--muted);font-weight:600">━ Stabil</span> (sama seperti skrining sebelumnya)`;
        }
      } else {
        trendHtml = `<span style="color:var(--pri);font-weight:600">🌟 Skrining pertama</span>`;
      }

      const bmiVal = item.bmi ?? item.answers?.BMI ?? '-';
      const statusText = item.predicted_label === 1 ? 'Berisiko (Label 1)' : 'Rendah (Label 0)';
      const scoreBadge =
        item.experimental_score_percent != null
          ? `${Math.round(item.experimental_score_percent)}%`
          : item.model_name || 'Qwen3-4B LoRA';

      return `
        <div class="history-item" data-id="${esc(item.id)}">
          <div style="flex:1">
            <span class="history-date">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;vertical-align:-1px;margin-right:3px"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              ${fmtDate(item.created_at)}
            </span>
            <div style="display:flex;align-items:center;gap:0.6rem;margin-top:0.35rem;flex-wrap:wrap">
              <span class="pill ${esc(item.result.risk_category)}">${esc(statusText)}</span>
              <b style="font-size:1.05rem;color:var(--ink)">BMI ${esc(bmiVal)}</b>
              <span class="note">· ${esc(scoreBadge)}</span>
            </div>
            <div class="history-meta note" style="margin-top:0.35rem">
              ${trendHtml}
            </div>
          </div>
          <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">
            <a class="btn ghost btn-sm" href="report.html?id=${encodeURIComponent(item.id)}">
              <span>Buka Detail Laporan</span>
              <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
            </a>
            <button type="button" class="btn ghost btn-sm btn-delete-history" data-id="${esc(item.id)}" title="Hapus riwayat ini" style="color:var(--high)">
              Hapus
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Attach delete handlers
    $$('.btn-delete-history', listEl).forEach((btn) => {
      btn.onclick = async () => {
        const targetId = btn.getAttribute('data-id');
        if (!targetId) return;
        if (!confirm('Hapus catatan riwayat skrining ini?')) return;
        btn.disabled = true;
        btn.textContent = 'Menghapus...';
        try {
          await deleteMyScreening(targetId);
          await loadHistory();
        } catch (err) {
          alert('Gagal menghapus riwayat: ' + (err.message || err));
          btn.disabled = false;
          btn.textContent = 'Hapus';
        }
      };
    });
  } catch (error) {
    console.error("Gagal memuat riwayat:", error.message);
    if (listEl) {
      listEl.innerHTML = `
        <div class="card">
          <div class="err">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span>Gagal memuat riwayat: ${esc(error.message)}</span>
          </div>
        </div>
      `;
    }
  }
}

loadHistory();
