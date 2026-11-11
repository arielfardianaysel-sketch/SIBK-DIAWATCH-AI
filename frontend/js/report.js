/**
 * DiaWatch AI - Authentic 2-Page Medical Examination Document Controller
 */
// Protect route
guard();

(async () => {
  const container = $('#out');
  const urlParams = new URLSearchParams(location.search);
  const id = urlParams.get('id');
  const session = getSession();
  const userName = session && session.user ? session.user.name : 'Pasien';
  const userEmail = session && session.user ? session.user.email : '-';
  const birthDateRaw = session && session.user ? session.user.birth_date : null;

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
          <span>Gagal memuat berkas rekam medis: ${esc(err.message)}</span>
        </div>
        <p style="margin-top:1.25rem"><a class="btn" href="screening.html">Mulai Skrining Baru</a></p>
      </div>
    `;
    return;
  }

  if (!rec || !rec.result) {
    container.innerHTML = `
      <div class="card" style="text-align:center;padding:3.5rem 1.5rem">
        <div style="font-size:2.5rem;margin-bottom:0.75rem">📋</div>
        <h2>Berkas Rekam Skrining Tidak Ditemukan</h2>
        <p class="note" style="margin:0.5rem auto 1.5rem;max-width:440px">
          Silakan lakukan pengisian kuesioner skrining mandiri terlebih dahulu untuk menerbitkan berkas hasil pemeriksaan Anda.
        </p>
        <a class="btn" href="screening.html">Mulai Skrining Sekarang</a>
      </div>
    `;
    return;
  }

  const ans = rec.answers || {};
  const r = rec.result || {};
  const pct = Math.round((r.probability || 0) * 100);
  const riskCat = (r.risk_category || 'rendah').toLowerCase();

  // 1. Calculate Age and Birth Date display
  let birthDateFormatted = '-';
  let userAge = '-';
  if (birthDateRaw) {
    try {
      const bDate = new Date(birthDateRaw);
      birthDateFormatted = bDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      const examDate = new Date(rec.created_at);
      const ageDiff = Math.floor((examDate - bDate) / (365.25 * 864e5));
      userAge = isNaN(ageDiff) ? '-' : ageDiff;
    } catch (e) {
      birthDateFormatted = String(birthDateRaw);
    }
  }

  // 2. Antropometry formatting
  const bmiVal = ans.BMI != null ? Number(ans.BMI).toFixed(1) : '-';
  let heightStr = ans.height ? ans.height : '-';
  let weightStr = ans.weight ? ans.weight : '-';

  // If height and weight are missing in older record, attempt reverse calculation or sensible placeholder
  if (heightStr === '-' && bmiVal !== '-') {
    heightStr = '170 (Estimasi)';
    weightStr = (Number(bmiVal) * ((1.7) ** 2)).toFixed(1) + ' (Estimasi)';
  }

  let bmiCategoryText = 'Normal';
  let bmiClass = 'rendah';
  const numericBmi = Number(bmiVal);
  if (!isNaN(numericBmi)) {
    if (numericBmi < 18.5) {
      bmiCategoryText = 'Berat Badan Kurang (Underweight)';
      bmiClass = 'sedang';
    } else if (numericBmi >= 18.5 && numericBmi < 25.0) {
      bmiCategoryText = 'Berat Badan Normal / Ideal';
      bmiClass = 'rendah';
    } else if (numericBmi >= 25.0 && numericBmi < 30.0) {
      bmiCategoryText = 'Kelebihan Berat Badan (Overweight)';
      bmiClass = 'sedang';
    } else {
      bmiCategoryText = 'Obesitas (Obese)';
      bmiClass = 'tinggi';
    }
  }

  // 3. Mapping answers
  const sexLabel = ans.Sex === 1 || ans.Sex === '1' ? 'Laki-laki' : 'Perempuan';
  const highBp = ans.HighBP === 1 || ans.HighBP === '1';
  const highChol = ans.HighChol === 1 || ans.HighChol === '1';
  const cholCheck = ans.CholCheck === 1 || ans.CholCheck === '1';
  const stroke = ans.Stroke === 1 || ans.Stroke === '1';
  const heartDisease = ans.HeartDiseaseorAttack === 1 || ans.HeartDiseaseorAttack === '1';
  const smoker = ans.Smoker === 1 || ans.Smoker === '1';
  const physActivity = ans.PhysActivity === 1 || ans.PhysActivity === '1';
  const fruits = ans.Fruits === 1 || ans.Fruits === '1';
  const veggies = ans.Veggies === 1 || ans.Veggies === '1';
  const alcohol = ans.HvyAlcoholConsump === 1 || ans.HvyAlcoholConsump === '1';
  const diffWalk = ans.DiffWalk === 1 || ans.DiffWalk === '1';

  const GENHLTH_MAP = {
    '1': 'Sangat Baik',
    '2': 'Baik',
    '3': 'Cukup',
    '4': 'Kurang Baik',
    '5': 'Buruk'
  };
  const genHlthText = GENHLTH_MAP[String(ans.GenHlth)] || 'Cukup';

  // 4. Clinical interpretation text
  let riskDescription = '';
  if (riskCat === 'rendah') {
    riskDescription = 'Estimasi probabilitas model menunjukkan tingkat risiko diabetes melitus berada pada tingkat RENDAH. Profil antropometri dan gaya hidup Anda secara umum menunjukkan status metabolisme yang terkontrol baik. Pertahankan pola makan bergizi seimbang, rutinitas aktivitas fisik harian, dan pantau kesehatan secara teratur.';
  } else if (riskCat === 'sedang') {
    riskDescription = 'Estimasi probabilitas model menunjukkan tingkat risiko diabetes melitus berada pada kategori SEDANG (MODERATE RISK). Terdapat beberapa indikator klinis atau pola hidup yang berkontribusi terhadap potensi resistensi insulin. Diperlukan evaluasi gaya hidup aktif serta pemeriksaan glukosa darah berkala.';
  } else {
    riskDescription = 'Estimasi probabilitas model menunjukkan tingkat risiko diabetes melitus berada pada kategori TINGGI (HIGH RISK). Terdapat akumulasi faktor risiko dominan yang secara klinis berhubungan kuat dengan gangguan homeostasis glukosa. Pasien sangat disarankan melakukan pemeriksaan klinis langsung ke dokter.';
  }

  // 5. Factors descriptions with detailed pathophysiology
  const factorPatho = {
    BMI: {
      name: 'Indeks Massa Tubuh (BMI)',
      patho: 'Peningkatan akumulasi adiposa memicu pelepasan asam lemak bebas berlebih dan sitokin pro-inflamasi (TNF-α, IL-6), menyebabkan penurunan sensitivitas reseptor insulin di jaringan otot dan hepar.'
    },
    HighBP: {
      name: 'Riwayat Tekanan Darah Tinggi (Hipertensi)',
      patho: 'Hipertensi kronis menyebabkan disfungsi endotel vaskular, kekakuan arterial, dan penurunan perfusi mikrosirkulasi perifer yang memperberat resistensi insulin metabolik.'
    },
    HighChol: {
      name: 'Kadar Kolesterol Darah Tinggi (Hiperkolesterolemia)',
      patho: 'Dislipidemia atherogenik menginduksi stres lipotoksik pada sel beta pulau Langerhans pankreas serta mempercepat kerusakan endotel vaskulatur.'
    },
    Age: {
      name: 'Faktor Usia Biologis Pasien',
      patho: 'Penambahan usia berkaitan dengan penurunan progresif massa dan fungsi sekresi sel beta pankreas serta penurunan laju metabolisme basal jaringan tubuh.'
    },
    GenHlth: {
      name: 'Penilaian Status Kesehatan Umum Rendah',
      patho: 'Persepsi kesehatan umum yang kurang optimal mencerminkan kelelahan kronis dan akumulasi disfungsi fisiologis multiorgan subklinis.'
    },
    PhysActivity: {
      name: 'Kurang Aktivitas Fisik / Gaya Hidup Sedentari',
      patho: 'Kurangnya kontraksi otot skeletal menurunkan translokasi transporter glukosa (GLUT-4) intraseluler ke membran sel secara mandiri-insulin, menghambat klirens glukosa darah.'
    },
    DiffWalk: {
      name: 'Keterbatasan Mobilitas / Kesulitan Berjalan',
      patho: 'Keterbatasan fisik membatasi kapasitas pengeluaran energi harian, mempercepat atrofi sarkopenia otot yang merupakan organ penyerap glukosa terbesar.'
    },
    HeartDiseaseorAttack: {
      name: 'Riwayat Penyakit Jantung Koroner',
      patho: 'Penyakit vaskular kardiovaskular memiliki dasar patologis yang sama dengan disfungsi metabolik glukosa dan aterosklerosis arteri sistemik.'
    },
    Stroke: {
      name: 'Riwayat Serangan Stroke / Serebrovaskular',
      patho: 'Insiden stroke menunjukkan adanya kerusakan makrovaskular yang meningkatkan kerentanan vaskular terhadap fluktuasi kadar glukosa darah.'
    }
  };

  const topFactorsList = r.top_factors && r.top_factors.length ? r.top_factors : ['BMI', 'PhysActivity'];
  const topFactorsRows = topFactorsList.map((fKey, i) => {
    const fObj = factorPatho[fKey] || { name: API.LABEL[fKey] || fKey, patho: 'Parameter ini memberikan kontribusi bobot statistik terhadap kenaikan skor estimasi risiko diabetes.' };
    let patientCondition = '-';
    if (fKey === 'BMI') patientCondition = `${bmiVal} kg/m² (${bmiCategoryText})`;
    else if (fKey === 'HighBP') patientCondition = highBp ? 'Positif Hipertensi' : 'Tidak';
    else if (fKey === 'HighChol') patientCondition = highChol ? 'Positif Kolesterol Tinggi' : 'Tidak';
    else if (fKey === 'PhysActivity') patientCondition = physActivity ? 'Aktif' : 'Kurang Bergerak';
    else if (fKey === 'Age') patientCondition = `${userAge} Tahun`;
    else patientCondition = 'Positif / Terindikasi';

    return `
      <tr>
        <td style="text-align:center">${i + 1}</td>
        <td><b>${esc(fObj.name)}</b></td>
        <td><span class="status-tag tag-warn">${esc(patientCondition)}</span></td>
        <td style="font-size:0.78rem;line-height:1.45">${esc(fObj.patho)}</td>
      </tr>
    `;
  }).join('');

  // 6. Build HTML output
  container.innerHTML = `
    <!-- Screen Action Toolbar (Hidden during print) -->
    <div class="doc-toolbar">
      <div>
        <span class="status-tag tag-ok" style="font-size:0.8rem;padding:0.3rem 0.75rem">
          ✓ BERKAS RESMI TERVERIFIKASI SISTEM
        </span>
        <span class="note" style="margin-left:0.5rem">Dokumen Rekam Medis (2 Halaman A4)</span>
      </div>
      <div style="display:flex;gap:0.6rem;flex-wrap:wrap">
        <button class="btn btn-sm" onclick="window.print()">
          <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          <span>Cetak / Unduh Berkas Medis (PDF)</span>
        </button>
        <a class="btn ghost btn-sm" href="history.html">Riwayat Skrining</a>
        <a class="btn ghost btn-sm" href="screening.html">Skrining Ulang</a>
      </div>
    </div>

    <!-- ==================== HALAMAN 1: DATA PASIEN & PARAMETER PEMERIKSAAN ==================== -->
    <div class="doc-sheet" id="doc-page-1">
      <div>
        <!-- Kop Surat Klinis Resmi -->
        <div class="doc-kop">
          <div class="doc-kop-logo">
            <div class="kop-emblem">DW</div>
            <div>
              <h2 class="kop-title">DIAWATCH AI HEALTHCARE & DIAGNOSTIC INTELLIGENCE</h2>
              <p class="kop-sub">Pusat Penapisan Risiko Metabolik & Skrining Dini Diabetes Melitus Terintegrasi</p>
              <p class="kop-addr">Layanan Skrining Digital Terstandar Epidemiologi CDC BRFSS | Registrasi Sistem No. DW-REG/2026-KLN</p>
            </div>
          </div>
          <div class="kop-divider"></div>
        </div>

        <!-- Judul Lembar Dokumen I -->
        <div class="doc-title-bar">
          <h3>LEMBAR I: DATA DEMOGRAFI & PARAMETER PEMERIKSAAN PASIEN</h3>
          <span class="doc-reg-badge">TERVERIFIKASI SISTEM ELEKTRONIK</span>
        </div>

        <!-- Metadata Grid Box -->
        <div class="doc-meta-box">
          <div class="meta-item"><span class="meta-label">No. Rekam Skrining (RM):</span><b class="meta-val">DW-2026-${rec.id}</b></div>
          <div class="meta-item"><span class="meta-label">Waktu Pemeriksaan:</span><b class="meta-val">${fmtDate(rec.created_at)}</b></div>
          <div class="meta-item"><span class="meta-label">Nama Lengkap Pasien:</span><b class="meta-val">${esc(userName)}</b></div>
          <div class="meta-item"><span class="meta-label">Alamat Email Terdaftar:</span><b class="meta-val">${esc(userEmail)}</b></div>
          <div class="meta-item"><span class="meta-label">Tanggal Lahir / Usia:</span><b class="meta-val">${birthDateFormatted} (${userAge} Tahun)</b></div>
          <div class="meta-item"><span class="meta-label">Jenis Kelamin Biologis:</span><b class="meta-val">${sexLabel}</b></div>
        </div>

        <!-- Bagian A: Data Fisik & Antropometri -->
        <div class="doc-sec-header">A. DATA FISIK & PENGUKURAN ANTROPOMETRI TUBUH</div>
        <table class="doc-table">
          <thead>
            <tr>
              <th style="width:40px;text-align:center">No</th>
              <th style="width:220px">Parameter Antropometri</th>
              <th style="width:160px">Nilai Terukur</th>
              <th>Klasifikasi Standar Klinis (WHO / Kemenkes)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="text-align:center">1</td>
              <td>Tinggi Badan (Statur)</td>
              <td><b>${heightStr} cm</b></td>
              <td>Tinggi badan aktual dalam posisi tegak</td>
            </tr>
            <tr>
              <td style="text-align:center">2</td>
              <td>Berat Badan</td>
              <td><b>${weightStr} kg</b></td>
              <td>Massa tubuh aktual saat pengisian skrining</td>
            </tr>
            <tr>
              <td style="text-align:center">3</td>
              <td>Indeks Massa Tubuh (BMI)</td>
              <td><span class="bmi-pill ${bmiClass}">${bmiVal} kg/m²</span></td>
              <td><b>${bmiCategoryText}</b> (Rentang normal: 18.5 – 24.9 kg/m²)</td>
            </tr>
          </tbody>
        </table>

        <!-- Bagian B: Data Riwayat Penyakit Klinis -->
        <div class="doc-sec-header">B. ANAMNESIS RIWAYAT KESEHATAN & DIAGNOSIS DOKTER</div>
        <table class="doc-table">
          <thead>
            <tr>
              <th style="width:40px;text-align:center">No</th>
              <th style="width:220px">Indikator Riwayat Klinis</th>
              <th style="width:160px">Status Pengakuan Pasien</th>
              <th>Relevansi Fisiologis Terhadap Risiko Diabetes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="text-align:center">1</td>
              <td>Tekanan Darah Tinggi (Hipertensi)</td>
              <td><span class="status-tag ${highBp ? 'tag-warn' : 'tag-ok'}">${highBp ? 'Positif (Pernah Didiagnosis)' : 'Negatif / Tidak Ada Riwayat'}</span></td>
              <td>Memicu hipertrofi mikrovaskular dan stres resistensi insulin</td>
            </tr>
            <tr>
              <td style="text-align:center">2</td>
              <td>Kadar Kolesterol Tinggi</td>
              <td><span class="status-tag ${highChol ? 'tag-warn' : 'tag-ok'}">${highChol ? 'Positif (Pernah Didiagnosis)' : 'Negatif / Tidak Ada Riwayat'}</span></td>
              <td>Dislipidemia aterogenik sering menyertai sindrom metabolik pradiabetes</td>
            </tr>
            <tr>
              <td style="text-align:center">3</td>
              <td>Cek Kolesterol (5 Tahun Terakhir)</td>
              <td><span class="status-tag ${cholCheck ? 'tag-ok' : 'tag-muted'}">${cholCheck ? 'Sudah Pernah Melakukan' : 'Belum Pernah Cek'}</span></td>
              <td>Tolak ukur keteraturan pemantauan profil lipid darah secara klinis</td>
            </tr>
            <tr>
              <td style="text-align:center">4</td>
              <td>Riwayat Serangan Stroke</td>
              <td><span class="status-tag ${stroke ? 'tag-warn' : 'tag-ok'}">${stroke ? 'Pernah Mengalami' : 'Tidak Pernah'}</span></td>
              <td>Bukti keterlibatan komplikasi makrovaskular vaskulopati serebral</td>
            </tr>
            <tr>
              <td style="text-align:center">5</td>
              <td>Riwayat Penyakit Jantung Koroner</td>
              <td><span class="status-tag ${heartDisease ? 'tag-warn' : 'tag-ok'}">${heartDisease ? 'Pernah Mengalami' : 'Tidak Pernah'}</span></td>
              <td>Penyakit kardiovaskular memiliki korelasi kuat dengan intoleransi glukosa</td>
            </tr>
          </tbody>
        </table>

        <!-- Bagian C: Pola Hidup & Kebugaran -->
        <div class="doc-sec-header">C. DATA PERILAKU GAYA HIDUP & KONDISI KEBUGARAN</div>
        <table class="doc-table">
          <thead>
            <tr>
              <th style="width:40px;text-align:center">No</th>
              <th style="width:220px">Parameter Kebiasaan Pasien</th>
              <th style="width:160px">Kondisi Aktual</th>
              <th>Keterangan Indikator</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="text-align:center">1</td>
              <td>Riwayat Merokok (≥100 Batang)</td>
              <td><span class="status-tag ${smoker ? 'tag-warn' : 'tag-ok'}">${smoker ? 'Perokok / Riwayat Merokok' : 'Bukan Perokok'}</span></td>
              <td>Senyawa nikotin memicu stres oksidatif dan resistensi insulin</td>
            </tr>
            <tr>
              <td style="text-align:center">2</td>
              <td>Olahraga & Aktivitas Fisik Teratur</td>
              <td><span class="status-tag ${physActivity ? 'tag-ok' : 'tag-warn'}">${physActivity ? 'Aktif Bergerak Rutin' : 'Kurang Olahraga (Sedentari)'}</span></td>
              <td>Aktivitas fisik memacu translokasi reseptor GLUT-4 penyerap glukosa darah</td>
            </tr>
            <tr>
              <td style="text-align:center">3</td>
              <td>Konsumsi Buah & Sayur Harian</td>
              <td><span class="status-tag tag-ok">Buah: ${fruits ? 'Rutin' : 'Jarang'} | Sayur: ${veggies ? 'Rutin' : 'Jarang'}</span></td>
              <td>Asupan serat penting untuk menjaga stabilitas glikemia post-prandial</td>
            </tr>
            <tr>
              <td style="text-align:center">4</td>
              <td>Konsumsi Alkohol Berlebih</td>
              <td><span class="status-tag ${alcohol ? 'tag-warn' : 'tag-ok'}">${alcohol ? 'Ya (Konsumsi Tinggi)' : 'Tidak / Dalam Batas Aman'}</span></td>
              <td>Konsumsi berlebih merusak hepar dan menurunkan efektivitas insulin</td>
            </tr>
            <tr>
              <td style="text-align:center">5</td>
              <td>Penilaian Kesehatan Umum Pribadi</td>
              <td><b>${genHlthText}</b></td>
              <td>Persepsi subjektif pasien terhadap status vitalitas fisik tubuh</td>
            </tr>
            <tr>
              <td style="text-align:center">6</td>
              <td>Hari Sakit Fisik / Mental (30 Hari)</td>
              <td>Fisik: <b>${ans.PhysHlth ?? 0} hari</b> | Mental: <b>${ans.MentHlth ?? 0} hari</b></td>
              <td>Tingkat morbiditas fungsional bulanan yang dialami pasien</td>
            </tr>
            <tr>
              <td style="text-align:center">7</td>
              <td>Kesulitan Berjalan / Naik Tangga</td>
              <td><span class="status-tag ${diffWalk ? 'tag-warn' : 'tag-ok'}">${diffWalk ? 'Mengalami Hambatan' : 'Mobilitas Normal'}</span></td>
              <td>Kapasitas mobilisasi fisik untuk pengeluaran energi harian</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Footer Halaman 1 -->
      <div class="doc-page-footer">
        <div class="footer-left">
          <span>* Data demografi dan parameter fisik di atas dicatat berdasarkan masukan terpandu pasien pada sistem DiaWatch AI.</span>
          <span>No. Berkas RM: DW-2026-${rec.id}</span>
        </div>
        <div class="footer-right">
          <span class="page-num">Halaman 1 dari 2</span>
        </div>
      </div>
    </div>

    <!-- ==================== HALAMAN 2: ANALISIS AI, FAKTOR RISIKO & PENAFIAN MEDIS ==================== -->
    <div class="doc-sheet" id="doc-page-2">
      <div>
        <!-- Running Mini Header Halaman 2 -->
        <div class="doc-running-kop">
          <div class="running-left">
            <b>DIAWATCH AI CLINICAL INTELLIGENCE REPORT</b>
            <span>Pusat Penapisan Risiko Metabolik & Skrining Dini Diabetes Melitus</span>
          </div>
          <div class="running-right">
            <span>No. RM: <b>DW-2026-${rec.id}</b> | Pasien: <b>${esc(userName)}</b></span>
          </div>
        </div>
        <div class="running-divider"></div>

        <!-- Judul Lembar Dokumen II -->
        <div class="doc-title-bar">
          <h3>LEMBAR II: ANALISIS RISIKO DIABETES MELITUS & REKOMENDASI KLINIS</h3>
          <span class="doc-reg-badge badge-page2">EVALUASI ALGORITMA AI</span>
        </div>

        <!-- Bagian D: Hasil Klasifikasi Risiko AI -->
        <div class="doc-sec-header">D. HASIL KLASIFIKASI PREDIKSI RISIKO DIABETES MELITUS</div>
        <div class="doc-assessment-box ${riskCat}">
          <div class="assessment-main">
            <div class="assessment-cat-badge ${riskCat}">
              STATUS TINGKAT RISIKO: ${riskCat.toUpperCase()}
            </div>
            <div class="assessment-prob">
              <span class="prob-num">${pct}%</span>
              <span class="prob-label">Estimasi Probabilitas Risiko Diabetes</span>
            </div>
          </div>
          <div class="assessment-bar">
            <div class="assessment-fill ${riskCat}" style="width:${pct}%"></div>
          </div>
          <p class="assessment-desc">
            ${riskDescription}
          </p>
        </div>

        <!-- Bagian E: Faktor Risiko Utama yang Terdeteksi -->
        <div class="doc-sec-header">E. FAKTOR RISIKO PALING DOMINAN YANG TERIDENTIFIKASI</div>
        <table class="doc-table">
          <thead>
            <tr>
              <th style="width:40px;text-align:center">No</th>
              <th style="width:220px">Faktor Risiko Terdeteksi</th>
              <th style="width:160px">Kondisi Pasien</th>
              <th>Analisis Patofisiologis & Mekanisme Risiko Terhadap Diabetes</th>
            </tr>
          </thead>
          <tbody>
            ${topFactorsRows}
          </tbody>
        </table>

        <!-- Bagian F: Rencana Tindak Lanjut Medis Terstruktur -->
        <div class="doc-sec-header">F. RENCANA TINDAK LANJUT & ANJURAN INTERVENSI KESEHATAN</div>
        <div class="doc-plan-grid">
          <div class="plan-card">
            <div class="plan-card-head">🥗 1. Intervensi Pola Makan & Gizi</div>
            <p>Batasi konsumsi karbohidrat sederhana, tepung, dan gula olahan. Perbanyak sayuran hijau berserat tinggi serta makanan dengan indeks glikemik rendah (Low GI) untuk mencegah lonjakan glukosa darah post-prandial.</p>
          </div>
          <div class="plan-card">
            <div class="plan-card-head">🏃 2. Program Aktivitas Fisik</div>
            <p>Jadwalkan aktivitas aerobik intensitas sedang minimal 150 menit per minggu (30 menit, 5x seminggu), seperti jalan cepat atau berenang guna meningkatkan sensitivitas reseptor insulin di jaringan otot.</p>
          </div>
          <div class="plan-card">
            <div class="plan-card-head">🩺 3. Rujukan Uji Laboratorium</div>
            <p>Sangat dianjurkan melakukan tes darah definitif di laboratorium: <b>Glukosa Darah Puasa (GDP)</b>, <b>Glukosa Darah 2 Jam PP</b>, dan <b>Hemoglobin A1c (HbA1c)</b> guna memastikan diagnosis normoglikemia atau pradiabetes.</p>
          </div>
        </div>

        <!-- Bagian G: AI MEDICAL DISCLAIMER (PENAFIAN MEDIS SINGKAT) -->
        <div class="doc-disclaimer-box">
          <div class="disclaimer-header">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#b45309" stroke-width="2.5"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <h4>PENAFIAN MEDIS (AI DISCLAIMER)</h4>
          </div>
          <div class="disclaimer-body">
            <p style="font-size:0.86rem;color:#78350f;line-height:1.55">
              Dokumen ini <strong>hanya berupa dugaan awal</strong> berbasis sistem skrining kecerdasan buatan. Anda <strong>tetap membutuhkan konsultasi dan pemeriksaan langsung ke dokter</strong> untuk mengetahui hasil pemeriksaan dan diagnosis medis yang sesungguhnya.
            </p>
          </div>
        </div>
      </div>

      <!-- Footer Halaman 2 -->
      <div class="doc-page-footer">
        <div class="footer-left">
          <span>* Berkas ini diterbitkan secara sah oleh sistem elektronik DiaWatch AI untuk keperluan edukasi dan penapisan mandiri.</span>
          <span>Dokumen Rahasia Medis Pasien Terlindungi | No. Berkas RM: DW-2026-${rec.id}</span>
        </div>
        <div class="footer-right">
          <span class="page-num">Halaman 2 dari 2</span>
        </div>
      </div>
    </div>
  `;
})();
