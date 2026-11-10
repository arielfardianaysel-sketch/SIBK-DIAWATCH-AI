/**
 * DiaWatch AI - Clinical Report Controller
 */
// Protect route
guard();

(async () => {
  const container = $('#out');
  const urlParams = new URLSearchParams(location.search);
  const id = urlParams.get('id');
  const session = getSession();
  const userName = session && session.user ? session.user.name : 'Pengguna';

  let rec = null;
  try {
    if (id) {
      const historyList = await API.history();
      rec = historyList.find((h) => String(h.id) === String(id));
    } else {
      rec = JSON.parse(sessionStorage.getItem('dw_last') || 'null');
    }
  } catch (err) {
    container.innerHTML = `
      <div class="card">
        <div class="err">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>Gagal memuat laporan: ${esc(err.message)}</span>
        </div>
        <p style="margin-top:1.25rem"><a class="btn" href="screening.html">Mulai Skrining</a></p>
      </div>
    `;
    return;
  }

  if (!rec || !rec.result) {
    container.innerHTML = `
      <div class="card" style="text-align:center;padding:3rem 1.5rem">
        <div style="font-size:2.5rem;margin-bottom:0.75rem">📋</div>
        <h2>Belum Ada Laporan Skrining</h2>
        <p class="note" style="margin:0.5rem auto 1.5rem;max-width:440px">
          Silakan isi kuesioner skrining terlebih dahulu untuk menghasilkan laporan analisis risiko kesehatan Anda.
        </p>
        <a class="btn" href="screening.html">Mulai Skrining Sekarang</a>
      </div>
    `;
    return;
  }

  const r = rec.result;
  const pct = Math.round(r.probability * 100);
  const riskCat = r.risk_category || 'rendah';
  const bmi = rec.answers ? rec.answers.BMI : '-';

  // Human-readable labels for factors
  const factorDescriptions = {
    BMI: 'Indeks massa tubuh di atas batas normal dapat memicu resistensi insulin.',
    HighBP: 'Tekanan darah tinggi berkaitan erat dengan gangguan metabolisme kardiovaskular.',
    HighChol: 'Kolesterol tinggi mempercepat penumpukan plak arteri dan stres metabolik.',
    Age: 'Risiko diabetes meningkat seiring pertambahan usia dan penurunan fungsi pankreas.',
    GenHlth: 'Persepsi kesehatan umum mencerminkan akumulasi gejala fisik dan vitalitas tubuh.',
    PhysActivity: 'Kurang bergerak menurunkan sensitivitas reseptor insulin dalam menyerap glukosa.',
    DiffWalk: 'Keterbatasan mobilitas sering membatasi pengeluaran kalori harian.',
    HeartDiseaseorAttack: 'Riwayat komplikasi jantung menuntut pengawasan ketat terhadap profil glukosa.',
    Stroke: 'Riwayat vaskular serebral meningkatkan urgensi pengelolaan faktor risiko metabolik.'
  };

  let riskDescription = '';
  if (riskCat === 'rendah') {
    riskDescription = 'Estimasi model menunjukkan tingkat risiko diabetes Anda relatif rendah. Pertahankan gaya hidup sehat, konsumsi gizi seimbang, dan rutinitas aktivitas fisik harian Anda.';
  } else if (riskCat === 'sedang') {
    riskDescription = 'Estimasi model menunjukkan risiko pada level moderat. Beberapa faktor gaya hidup atau fisik Anda memerlukan perhatian preventif agar tidak berkembang menjadi diabetes melitus.';
  } else {
    riskDescription = 'Estimasi model menunjukkan probabilitas risiko tinggi. Sangat disarankan untuk segera melakukan konsultasi dengan tenaga medis atau dokter di puskesmas/klinik terdekat untuk pemeriksaan laboratorium lanjutan.';
  }

  container.innerHTML = `
    <!-- Top Meta Strip -->
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.75rem;margin-bottom:1.25rem">
      <div>
        <span class="note">Laporan untuk: <b>${esc(userName)}</b></span>
        <span class="note" style="margin-left:0.5rem">· ${fmtDate(rec.created_at)}</span>
      </div>
      <div>
        <button class="btn ghost btn-sm" onclick="window.print()">
          <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          <span>Cetak / Simpan PDF</span>
        </button>
      </div>
    </div>

    <!-- Hero Card: Risk Level Gauge -->
    <div class="report-badge-hero ${esc(riskCat)}">
      <span class="risk-pill-large ${esc(riskCat)}">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        Tingkat Risiko: ${esc(riskCat.toUpperCase())}
      </span>
      <div class="risk-percent-display">${pct}%</div>
      <p class="note" style="font-weight:600;color:var(--ink-secondary)">Estimasi Probabilitas Risiko Diabetes</p>
      
      <div class="report-gauge-bar">
        <div class="report-gauge-fill ${esc(riskCat)}" style="width:${pct}%"></div>
      </div>

      <p class="note" style="max-width:540px;margin:0.75rem auto 0;line-height:1.6">
        ${riskDescription}
      </p>
    </div>

    <!-- Card: Influential Factors -->
    <div class="card">
      <h3 style="display:flex;align-items:center;gap:0.5rem">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>
        Faktor Risiko Utama yang Teridentifikasi
      </h3>
      <p class="note" style="margin-top:0.25rem">
        Berdasarkan bobot statistik data yang Anda masukkan, berikut indikator paling berpengaruh:
      </p>

      <div class="factors-list">
        ${
          r.top_factors && r.top_factors.length
            ? r.top_factors.map((f) => `
              <div class="factor-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
                <div class="factor-item-text">
                  <b>${esc(API.LABEL[f] || f)} ${f === 'BMI' ? `(${bmi} kg/m²)` : ''}</b>
                  <span>${esc(factorDescriptions[f] || 'Indikator ini memberikan kontribusi pada skor risiko keseluruhan.')}</span>
                </div>
              </div>
            `).join('')
            : '<div class="factor-item"><div class="factor-item-text"><b>Tidak ada faktor risiko tinggi yang menonjol</b><span>Pertahankan gaya hidup sehat dan pola makan seimbang.</span></div></div>'
        }
      </div>
    </div>

    <!-- Card: Actionable Guidance -->
    <div class="card">
      <h3 style="display:flex;align-items:center;gap:0.5rem">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
        Langkah Preventif yang Disarankan
      </h3>
      <p class="note" style="margin-top:0.25rem">
        Tindakan nyata yang dapat Anda terapkan segera untuk mengelola risiko diabetes:
      </p>

      <div class="action-card-grid">
        <div class="action-tip-box">
          <h4>🥗 Pola Makan & Gizi</h4>
          <p>Prioritaskan sayuran berserat tinggi, batasi karbohidrat sederhana, tepung, serta minuman dengan pemanis tambahan.</p>
        </div>
        <div class="action-tip-box">
          <h4>🏃 Olahraga Rutin</h4>
          <p>Lakukan aktivitas aerobik intensitas sedang minimal 150 menit per minggu (30 menit, 5 kali per minggu) seperti jalan cepat atau berenang.</p>
        </div>
        <div class="action-tip-box">
          <h4>🩺 Pemeriksaan Laboratorium</h4>
          <p>Jadwalkan tes gula darah puasa (GDP) dan HbA1c di puskesmas atau klinik terdekat untuk memastikan diagnosis pasti.</p>
        </div>
      </div>
    </div>

    <!-- Card: Medical Disclaimer -->
    <div class="card" style="background:#fffbeb;border-color:#fde68a">
      <div style="display:flex;align-items:flex-start;gap:0.85rem">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#b45309" stroke-width="2" style="flex-shrink:0;margin-top:2px"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <div>
          <h4 style="color:#92400e;font-size:0.95rem;margin-bottom:0.25rem">Batasan & Penafian Medis</h4>
          <p style="color:#78350f;font-size:0.85rem;line-height:1.55">
            Hasil laporan ini dihitung menggunakan model prediktif berbasis machine learning pada data survei populasi BRFSS CDC. Laporan ini merupakan alat skrining edukatif, <b>bukan diagnosis medis definitif</b> dan tidak menggantikan tes glukosa darah klinis. Selalu konsultasikan kondisi kesehatan Anda kepada dokter spesialis atau tenaga medis berwenang.
          </p>
        </div>
      </div>
    </div>

    <!-- Navigation Buttons -->
    <div class="row">
      <a class="btn ghost" href="history.html">
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="12 8 8 12 12 16"/><line x1="20" y1="12" x2="8" y2="12"/><line x1="4" y1="6" x2="4" y2="18"/></svg>
        <span>Lihat Riwayat & Tren</span>
      </a>
      <a class="btn" href="screening.html">
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        <span>Lakukan Skrining Ulang</span>
      </a>
    </div>
  `;
})();
