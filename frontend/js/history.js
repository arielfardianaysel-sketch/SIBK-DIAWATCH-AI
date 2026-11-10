/**
 * DiaWatch AI - History & Longitudinal Trend Controller
 */
// Protect route
guard();

(async () => {
  const listEl = $('#list');
  const summaryEl = $('#history-summary');

  let historyData = [];
  try {
    historyData = await API.history();
  } catch (e) {
    listEl.innerHTML = `
      <div class="card">
        <div class="err">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>Gagal memuat riwayat: ${esc(e.message)}</span>
        </div>
      </div>
    `;
    return;
  }

  // Handle Empty State
  if (!historyData || historyData.length === 0) {
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
  const avgProb = Math.round(
    (historyData.reduce((acc, cur) => acc + (cur.result.probability || 0), 0) / totalCount) * 100
  );
  const latestItem = historyData[0];

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
        <span class="dash-card-sub">Tercatat dalam akun Anda</span>
      </div>

      <div class="dash-card">
        <div class="dash-card-header">
          <span class="dash-card-label">Hasil Terakhir</span>
          <div class="dash-card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          </div>
        </div>
        <div class="dash-card-val">
          <span class="pill ${esc(latestItem.result.risk_category)}">${esc(latestItem.result.risk_category)}</span>
          <span style="font-size:1.15rem;font-weight:700;margin-left:0.35rem">${Math.round(latestItem.result.probability * 100)}%</span>
        </div>
        <span class="dash-card-sub">${fmtDate(latestItem.created_at)}</span>
      </div>

      <div class="dash-card">
        <div class="dash-card-header">
          <span class="dash-card-label">Rata-rata Skor Risiko</span>
          <div class="dash-card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          </div>
        </div>
        <div class="dash-card-val">${avgProb}%</div>
        <span class="dash-card-sub">Dari seluruh rangkaian pemeriksaan</span>
      </div>
    `;
  }

  // Render History Items
  listEl.innerHTML = historyData.map((item, index) => {
    const prevItem = historyData[index + 1];
    let diff = null;
    let trendHtml = '';

    if (prevItem && prevItem.result) {
      diff = Math.round((item.result.probability - prevItem.result.probability) * 100);
      if (diff > 0) {
        trendHtml = `<span style="color:var(--high);font-weight:600">▲ Naik ${diff}%</span> dari skrining sebelumnya`;
      } else if (diff < 0) {
        trendHtml = `<span style="color:var(--low);font-weight:600">▼ Turun ${Math.abs(diff)}%</span> (membaik)`;
      } else {
        trendHtml = `<span style="color:var(--muted);font-weight:600">━ Stabil</span> (sama seperti sebelumnya)`;
      }
    } else {
      trendHtml = `<span style="color:var(--pri);font-weight:600">🌟 Skrining pertama</span>`;
    }

    const pct = Math.round(item.result.probability * 100);
    const bmiVal = item.answers && item.answers.BMI ? item.answers.BMI : '-';

    return `
      <div class="history-item">
        <div style="flex:1">
          <span class="history-date">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;vertical-align:-1px;margin-right:3px"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            ${fmtDate(item.created_at)}
          </span>
          <div style="display:flex;align-items:center;gap:0.6rem;margin-top:0.35rem">
            <span class="pill ${esc(item.result.risk_category)}">${esc(item.result.risk_category)}</span>
            <b style="font-size:1.15rem;color:var(--ink)">${pct}%</b>
            <span class="note">· BMI ${bmiVal}</span>
          </div>
          <div class="history-meta note" style="margin-top:0.35rem">
            ${trendHtml}
          </div>
        </div>
        <div>
          <a class="btn ghost btn-sm" href="report.html?id=${encodeURIComponent(item.id)}">
            <span>Buka Detail Laporan</span>
            <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </a>
        </div>
      </div>
    `;
  }).join('');
})();
