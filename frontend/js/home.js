/**
 * DiaWatch AI - Home / Dashboard Controller
 */
document.addEventListener('DOMContentLoaded', async () => {
  const session = getSession();
  const guestLanding = $('#guest-landing');
  const userDash = $('#user-dashboard');

  if (session && session.user) {
    // Show Dashboard for logged in user
    if (guestLanding) guestLanding.classList.add('hide');
    if (userDash) userDash.classList.remove('hide');

    // Populate user info
    const userNameEl = $('#dash-user-name');
    if (userNameEl) userNameEl.textContent = session.user.name;

    // Greeting according to time of day
    const hour = new Date().getHours();
    let greet = 'Halo';
    if (hour < 11) greet = 'Selamat Pagi';
    else if (hour < 15) greet = 'Selamat Siang';
    else if (hour < 18) greet = 'Selamat Sore';
    else greet = 'Selamat Malam';
    const greetEl = $('#dash-greeting');
    if (greetEl) greetEl.textContent = greet;

    // Load recent screening data
    try {
      const history = await API.history();
      renderDashboardStats(history);
    } catch (e) {
      console.warn('Gagal memuat riwayat dashboard:', e);
      renderDashboardStats([]);
    }
  } else {
    // Show Landing Page for guests
    if (guestLanding) guestLanding.classList.remove('hide');
    if (userDash) userDash.classList.add('hide');
  }
});

function renderDashboardStats(history) {
  const countEl = $('#dash-total-count');
  const lastRiskEl = $('#dash-last-risk');
  const lastBmiEl = $('#dash-last-bmi');
  const recentBoxEl = $('#dash-recent-box');

  if (countEl) countEl.textContent = history.length;

  if (history && history.length > 0) {
    const latest = history[0];
    const r = latest.result;
    const ans = latest.answers;

    if (lastRiskEl) {
      lastRiskEl.innerHTML = `
        <span class="pill ${esc(r.risk_category)}">${esc(r.risk_category)}</span>
        <span style="font-size:1.1rem;font-weight:700;margin-left:0.3rem">${Math.round(r.probability * 100)}%</span>
      `;
    }

    if (lastBmiEl) {
      const bmi = ans.BMI;
      let bmiStatus = 'Normal';
      if (bmi < 18.5) bmiStatus = 'Kurang';
      else if (bmi >= 25 && bmi < 30) bmiStatus = 'Kelebihan';
      else if (bmi >= 30) bmiStatus = 'Obesitas';
      lastBmiEl.innerHTML = `${bmi} <span style="font-size:0.85rem;color:var(--muted);font-weight:500">(${bmiStatus})</span>`;
    }

    if (recentBoxEl) {
      const topFactorsText = r.top_factors && r.top_factors.length
        ? r.top_factors.map(k => API.LABEL[k] || k).join(', ')
        : 'Tidak ada faktor risiko tinggi yang menonjol';

      recentBoxEl.innerHTML = `
        <div class="card" style="margin-bottom:0">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.75rem;margin-bottom:1rem">
            <div>
              <span class="note">Skrining Terakhir: <b>${fmtDate(latest.created_at)}</b></span>
              <h3 style="margin-top:0.25rem">Hasil: Risiko ${esc(r.risk_category)} (${Math.round(r.probability * 100)}%)</h3>
            </div>
            <a href="report.html?id=${encodeURIComponent(latest.id)}" class="btn btn-sm">Lihat Laporan Lengkap</a>
          </div>
          <p class="note" style="margin-bottom:0.75rem">Faktor utama: <b>${esc(topFactorsText)}</b></p>
          <div class="bar" style="margin-bottom:0.5rem"><i class="${esc(r.risk_category)}" style="width:${Math.round(r.probability * 100)}%"></i></div>
        </div>
      `;
    }
  } else {
    if (lastRiskEl) lastRiskEl.innerHTML = '<span style="font-size:1rem;color:var(--muted);font-weight:500">Belum ada tes</span>';
    if (lastBmiEl) lastBmiEl.innerHTML = '<span style="font-size:1rem;color:var(--muted);font-weight:500">-</span>';

    if (recentBoxEl) {
      recentBoxEl.innerHTML = `
        <div class="card" style="margin-bottom:0;text-align:center;padding:2rem">
          <div style="font-size:2rem;margin-bottom:0.5rem">🩺</div>
          <h3>Mulai Skrining Pertama Anda</h3>
          <p class="note" style="margin:0.5rem auto 1.25rem;max-width:440px">
            Anda belum memiliki catatan skrining. Luangkan 3-5 menit untuk mengetahui estimasi risiko diabetes Anda hari ini.
          </p>
          <a href="screening.html" class="btn">Mulai Skrining Mandiri</a>
        </div>
      `;
    }
  }
}

