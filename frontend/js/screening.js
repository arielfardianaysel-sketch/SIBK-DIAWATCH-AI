/**
 * DiaWatch AI - Multi-Step Screening Wizard
 */
// Protect route: user must be logged in
guard();

const YN = [['1', 'Ya'], ['0', 'Tidak']];
const q = (name, text, hint) => ({ name, text, hint, t: 'yn' });
const sel = (name, text, opts, hint) => ({ name, text, hint, t: 'sel', opts });
const lv = (a) => a.map((l, i) => [String(i + 1), l]);

const STEPS = [
  {
    title: 'Data Tubuh & Profil Fisik',
    sub: 'Informasi dasar untuk menghitung indeks massa tubuh (BMI) dan kategori usia.',
    f: [
      sel('Sex', 'Jenis Kelamin', [['0', 'Perempuan'], ['1', 'Laki-laki']]),
      { name: 'height', text: 'Tinggi Badan (cm)', t: 'num', min: 100, max: 230, placeholder: 'Contoh: 168' },
      { name: 'weight', text: 'Berat Badan (kg)', t: 'num', min: 30, max: 250, placeholder: 'Contoh: 65' }
    ]
  },
  {
    title: 'Riwayat Kesehatan Klinis',
    sub: 'Kondisi medis yang pernah didiagnosis oleh dokter atau fasilitas kesehatan.',
    f: [
      q('HighBP', 'Pernah didiagnosis tekanan darah tinggi (hipertensi)?'),
      q('HighChol', 'Pernah didiagnosis kadar kolesterol darah tinggi?'),
      q('CholCheck', 'Pernah melakukan cek kolesterol dalam 5 tahun terakhir?'),
      q('Stroke', 'Pernah mengalami serangan stroke?'),
      q('HeartDiseaseorAttack', 'Pernah didiagnosis penyakit jantung koroner atau serangan jantung?')
    ]
  },
  {
    title: 'Pola & Kebiasaan Gaya Hidup',
    sub: 'Aktivitas fisik harian, pola makan sayur/buah, dan kebiasaan konsumsi.',
    f: [
      q('Smoker', 'Pernah merokok minimal 100 batang selama seumur hidup?'),
      q('PhysActivity', 'Melakukan olahraga atau aktivitas fisik dalam 30 hari terakhir?', 'Di luar aktivitas pekerjaan harian rutin'),
      q('Fruits', 'Mengonsumsi buah minimal satu kali setiap hari?'),
      q('Veggies', 'Mengonsumsi sayuran minimal satu kali setiap hari?'),
      q('HvyAlcoholConsump', 'Mengonsumsi alkohol dalam jumlah berlebih?', 'Lebih dari 14 gelas per minggu (pria) atau 7 gelas (wanita)')
    ]
  },
  {
    title: 'Kondisi Kesehatan Fisik & Mental',
    sub: 'Evaluasi kebugaran dan hari-hari di mana kondisi Anda kurang optimal.',
    f: [
      sel('GenHlth', 'Secara umum, bagaimana Anda menilai kondisi kesehatan Anda?', lv(['Sangat Baik', 'Baik', 'Cukup', 'Kurang Baik', 'Buruk'])),
      { name: 'MentHlth', text: 'Jumlah hari kesehatan mental terasa kurang baik', hint: 'Termasuk stres, depresi, atau cemas (dalam 30 hari terakhir)', t: 'num', min: 0, max: 30, placeholder: '0 - 30 hari' },
      { name: 'PhysHlth', text: 'Jumlah hari kondisi fisik terganggu oleh sakit/cedera', hint: 'Dalam 30 hari terakhir', t: 'num', min: 0, max: 30, placeholder: '0 - 30 hari' },
      q('DiffWalk', 'Apakah Anda mengalami kesulitan berjalan atau menaiki tangga?')
    ]
  },
  {
    title: 'Akses Layanan & Sosio-Ekonomi',
    sub: 'Parameter sosio-demografis yang berhubungan dengan disparitas risiko kesehatan.',
    f: [
      q('AnyHealthcare', 'Memiliki akses asuransi atau jaminan kesehatan (BPJS/Asuransi Swasta)?'),
      q('NoDocbcCost', 'Pernah membatalkan rencana berobat ke dokter karena kendala biaya dalam 12 bulan terakhir?'),
      sel('Education', 'Tingkat pendidikan formal terakhir', lv(['Tidak sekolah / TK', 'SD', 'SMP', 'SMA / Sederajat', 'Perguruan Tinggi (Diploma/S1 Belum Lulus)', 'Lulus Perguruan Tinggi (Diploma/S1/S2/S3)'])),
      sel('Income', 'Estimasi pendapatan tahunan rumah tangga', lv(['< $10 ribu', '$10-15 ribu', '$15-20 ribu', '$20-25 ribu', '$25-35 ribu', '$35-50 ribu', '$50-75 ribu', '≥ $75 ribu']), 'Kategori standar dataset BRFSS CDC.')
    ]
  }
];

let cur = 0;
const ans = {};

function fieldHtml(f) {
  const hintText = f.hint ? `<span class="hint">${f.hint}</span>` : '';

  if (f.t === 'yn') {
    return `
      <div class="q-block">
        <div class="q-label">${f.text}${hintText}</div>
        <div class="yn">
          ${YN.map(([val, label]) => `
            <label>
              <input type="radio" name="${f.name}" value="${val}" ${ans[f.name] === val ? 'checked' : ''}>
              <span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                ${label}
              </span>
            </label>
          `).join('')}
        </div>
      </div>
    `;
  }

  if (f.t === 'sel') {
    return `
      <div class="q-block">
        <label for="${f.name}">${f.text}${hintText}</label>
        <select id="${f.name}" name="${f.name}">
          <option value="">-- Pilih salah satu opsi --</option>
          ${f.opts.map(([val, label]) => `
            <option value="${val}" ${ans[f.name] === val ? 'selected' : ''}>${label}</option>
          `).join('')}
        </select>
      </div>
    `;
  }

  return `
    <div class="q-block">
      <label for="${f.name}">${f.text}${hintText}</label>
      <input id="${f.name}" name="${f.name}" type="number" min="${f.min}" max="${f.max}" placeholder="${f.placeholder || ''}" inputmode="numeric" value="${ans[f.name] ?? ''}">
    </div>
  `;
}

function updateStepIndicator() {
  const nodes = $$('#wizard-nodes .wizard-step-node');
  nodes.forEach((node, idx) => {
    node.classList.remove('active', 'completed');
    if (idx === cur) {
      node.classList.add('active');
    } else if (idx < cur) {
      node.classList.add('completed');
    }
  });

  const progressPct = ((cur + 1) / STEPS.length) * 100;
  $('#bar').style.width = progressPct + '%';
  $('#count').textContent = `Langkah ${cur + 1} dari ${STEPS.length}: ${STEPS[cur].title}`;
}

function updateLiveBmi() {
  const bmiBox = $('#bmi-preview');
  if (!bmiBox) return;

  if (cur !== 0) {
    bmiBox.classList.add('hide');
    return;
  }

  const h = +ans.height || +($('#height') ? $('#height').value : 0);
  const w = +ans.weight || +($('#weight') ? $('#weight').value : 0);

  if (h >= 100 && h <= 230 && w >= 30 && w <= 250) {
    const bmi = +(w / ((h / 100) ** 2)).toFixed(1);
    let statusText = 'Normal';
    let statusClass = 'rendah';

    if (bmi < 18.5) {
      statusText = 'Berat Kurang';
      statusClass = 'sedang';
    } else if (bmi >= 25 && bmi < 30) {
      statusText = 'Kelebihan Berat Badan';
      statusClass = 'sedang';
    } else if (bmi >= 30) {
      statusText = 'Obesitas';
      statusClass = 'tinggi';
    }

    $('#bmi-val').textContent = `${bmi} kg/m²`;
    const badge = $('#bmi-badge');
    badge.textContent = statusText;
    badge.className = `live-bmi-badge pill ${statusClass}`;
    bmiBox.classList.remove('hide');
  } else {
    bmiBox.classList.add('hide');
  }
}

function draw() {
  const s = STEPS[cur];
  updateStepIndicator();

  $('#step').innerHTML = `
    <h2 style="font-size:1.45rem;margin-bottom:0.35rem">${s.title}</h2>
    <p class="note" style="margin-bottom:1.5rem">${s.sub}</p>
    ${s.f.map(fieldHtml).join('')}
  `;

  $('#back').classList.toggle('hide', cur === 0);
  $('#next-text').textContent = cur === STEPS.length - 1 ? 'Analisis Risiko Sekarang' : 'Lanjut';
  $('#err').classList.add('hide');

  // Attach live listener for BMI inputs in Step 0
  if (cur === 0) {
    const hInput = $('#height');
    const wInput = $('#weight');
    if (hInput && wInput) {
      hInput.oninput = () => { ans.height = hInput.value; updateLiveBmi(); };
      wInput.oninput = () => { ans.weight = wInput.value; updateLiveBmi(); };
      updateLiveBmi();
    }
  } else {
    updateLiveBmi();
  }
}

function collect() {
  const bad = [];
  STEPS[cur].f.forEach((f) => {
    let val;
    if (f.t === 'yn') {
      const checked = document.querySelector(`[name="${f.name}"]:checked`);
      val = checked ? checked.value : '';
    } else {
      const el = document.querySelector(`[name="${f.name}"]`);
      val = el ? el.value.trim() : '';
    }

    if (val === '' || val == null) {
      bad.push(f.text);
      return;
    }

    if (f.t === 'num') {
      const numVal = Number(val);
      if (isNaN(numVal) || numVal < f.min || numVal > f.max) {
        bad.push(`${f.text} (harus antara ${f.min} - ${f.max})`);
        return;
      }
    }

    ans[f.name] = val;
  });
  return bad;
}

$('#next').onclick = async () => {
  const bad = collect();
  const errBox = $('#err');
  const errText = $('#err-text');

  if (bad.length > 0) {
    errText.textContent = 'Mohon lengkapi pertanyaan berikut: ' + bad.join(', ');
    errBox.classList.remove('hide');
    errBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }

  errBox.classList.add('hide');

  if (cur < STEPS.length - 1) {
    cur++;
    draw();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  // Final Step: Submit payload
  const body = {};
  Object.entries(ans).forEach(([k, v]) => {
    if (k !== 'height' && k !== 'weight') {
      body[k] = +v;
    }
  });

  const h = +ans.height;
  const w = +ans.weight;
  body.BMI = +(w / ((h / 100) ** 2)).toFixed(1);

  const session = getSession();
  const birthDate = session && session.user ? session.user.birth_date : '1995-01-01';
  body.Age = ageCategory(birthDate);

  const nextBtn = $('#next');
  nextBtn.disabled = true;
  $('#next-text').textContent = 'Menganalisis dengan AI...';

  try {
    const result = await API.predict(body);
    sessionStorage.setItem('dw_last', JSON.stringify({
      id: result.id,
      created_at: result.created_at,
      answers: body,
      result: result
    }));
    location.href = 'report.html';
  } catch (err) {
    errText.textContent = err.message || 'Gagal memproses analisis skrining.';
    errBox.classList.remove('hide');
    nextBtn.disabled = false;
    $('#next-text').textContent = 'Analisis Risiko Sekarang';
  }
};

$('#back').onclick = () => {
  collect();
  if (cur > 0) {
    cur--;
    draw();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

// Initial draw
draw();
