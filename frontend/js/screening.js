/**
 * DiaWatch AI - Multi-Step Screening Wizard Controller
 */
// Protect route: user must be logged in
guard();

const YN = [['1', 'Ya'], ['0', 'Tidak']];
const q = (name, text, hint) => ({ name, text, hint, t: 'yn' });
const sel = (name, text, opts, hint) => ({ name, text, hint, t: 'sel', opts });
const lv = (a) => a.map((l, i) => [String(i + 1), l]);

const STEPS = [
  {
    title: 'Data Tubuh & Pengukuran Fisik',
    sub: 'Informasi dasar antropometri untuk menghitung Indeks Massa Tubuh (BMI) dan kategori usia klinis Anda.',
    f: [
      sel('Sex', 'Jenis Kelamin Biologis', [['0', 'Perempuan'], ['1', 'Laki-laki']], 'Digunakan untuk kalkulasi faktor metabolik.'),
      { name: 'height', text: 'Tinggi Badan', t: 'num', min: 100, max: 230, unit: 'cm', placeholder: 'Contoh: 170' },
      { name: 'weight', text: 'Berat Badan', t: 'num', min: 30, max: 250, unit: 'kg', placeholder: 'Contoh: 68' }
    ]
  },
  {
    title: 'Riwayat Kesehatan Klinis',
    sub: 'Kondisi riwayat medis Anda yang pernah didiagnosis oleh dokter atau fasilitas kesehatan.',
    f: [
      q('HighBP', 'Pernah didiagnosis tekanan darah tinggi (hipertensi)?', 'Tekanan darah di atas batas normal.'),
      q('HighChol', 'Pernah didiagnosis kadar kolesterol darah tinggi (hiperkolesterolemia)?'),
      q('CholCheck', 'Pernah melakukan cek kadar kolesterol dalam 5 tahun terakhir?'),
      q('Stroke', 'Pernah mengalami serangan stroke atau gangguan pembuluh darah otak?'),
      q('HeartDiseaseorAttack', 'Pernah didiagnosis penyakit jantung koroner atau serangan jantung?')
    ]
  },
  {
    title: 'Pola & Kebiasaan Gaya Hidup',
    sub: 'Aktivitas fisik harian, konsumsi gizi sayur/buah, dan kebiasaan konsumsi harian Anda.',
    f: [
      q('Smoker', 'Pernah merokok minimal 100 batang selama seumur hidup?', 'Termasuk riwayat merokok di masa lalu.'),
      q('PhysActivity', 'Melakukan olahraga atau aktivitas fisik dalam 30 hari terakhir?', 'Di luar aktivitas pekerjaan harian rutin (misal jalan santai, senam, dll).'),
      q('Fruits', 'Mengonsumsi buah minimal satu kali setiap hari?'),
      q('Veggies', 'Mengonsumsi sayuran hijau atau sayur mayur setiap hari?'),
      q('HvyAlcoholConsump', 'Mengonsumsi alkohol dalam jumlah berlebih?', 'Lebih dari 14 gelas per minggu (pria) atau 7 gelas (wanita).')
    ]
  },
  {
    title: 'Kondisi Kesehatan Fisik & Mental',
    sub: 'Evaluasi kebugaran umum dan jumlah hari di mana kondisi Anda terasa kurang optimal.',
    f: [
      sel('GenHlth', 'Secara umum, bagaimana Anda menilai kondisi kesehatan Anda saat ini?', lv(['Sangat Baik', 'Baik', 'Cukup', 'Kurang Baik', 'Buruk'])),
      { name: 'MentHlth', text: 'Jumlah hari kesehatan mental terasa kurang baik', hint: 'Termasuk stres, depresi, atau cemas (dalam 30 hari terakhir)', t: 'num', min: 0, max: 30, unit: 'hari', placeholder: '0 - 30' },
      { name: 'PhysHlth', text: 'Jumlah hari kondisi fisik terganggu oleh sakit atau cedera', hint: 'Dalam 30 hari terakhir', t: 'num', min: 0, max: 30, unit: 'hari', placeholder: '0 - 30' },
      q('DiffWalk', 'Apakah Anda mengalami kesulitan berjalan atau menaiki tangga?')
    ]
  }
];

let cur = 0;
const ans = {};

function fieldHtml(f, idx) {
  const hintText = f.hint ? `<span class="hint">${f.hint}</span>` : '';
  const qNum = idx != null ? `<span class="q-badge">${idx + 1}</span>` : '';

  if (f.t === 'yn') {
    return `
      <div class="q-block">
        <div class="q-header-row">
          ${qNum}
          <div class="q-label">${f.text}${hintText}</div>
        </div>
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
        <div class="q-header-row">
          ${qNum}
          <div style="flex:1">
            <label for="${f.name}" style="margin-bottom:0.25rem">${f.text}</label>
            ${hintText}
          </div>
        </div>
        <select id="${f.name}" name="${f.name}" style="margin-top:0.4rem">
          <option value="">-- Pilih salah satu opsi --</option>
          ${f.opts.map(([val, label]) => `
            <option value="${val}" ${ans[f.name] === val ? 'selected' : ''}>${label}</option>
          `).join('')}
        </select>
      </div>
    `;
  }

  // Number input
  return `
    <div class="q-block">
      <div class="q-header-row">
        ${qNum}
        <div style="flex:1">
          <label for="${f.name}" style="margin-bottom:0.25rem">${f.text}</label>
          ${hintText}
        </div>
      </div>
      <div class="input-with-unit" style="margin-top:0.4rem">
        <input id="${f.name}" name="${f.name}" type="number" min="${f.min}" max="${f.max}" placeholder="${f.placeholder || ''}" inputmode="numeric" value="${ans[f.name] ?? ''}">
        ${f.unit ? `<span class="input-unit-label">${f.unit}</span>` : ''}
      </div>
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
    let statusText = 'Berat Badan Normal / Ideal';
    let statusClass = 'rendah';

    if (bmi < 18.5) {
      statusText = 'Berat Badan Kurang (Underweight)';
      statusClass = 'sedang';
    } else if (bmi >= 25 && bmi < 30) {
      statusText = 'Kelebihan Berat Badan (Overweight)';
      statusClass = 'sedang';
    } else if (bmi >= 30) {
      statusText = 'Obesitas (Obese)';
      statusClass = 'tinggi';
    }

    $('#bmi-val').textContent = bmi;
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

  let fieldsHtml = '';
  if (cur === 0) {
    // Step 0: Sex + 2-col Height & Weight
    const sexField = s.f[0];
    const heightField = s.f[1];
    const weightField = s.f[2];

    fieldsHtml = `
      ${fieldHtml(sexField, 0)}
      <div class="form-grid-2col">
        ${fieldHtml(heightField, 1)}
        ${fieldHtml(weightField, 2)}
      </div>
    `;
  } else {
    fieldsHtml = s.f.map((f, i) => fieldHtml(f, i)).join('');
  }

  $('#step').innerHTML = `
    <div style="margin-bottom:1.75rem">
      <h2 style="font-size:1.5rem;margin-bottom:0.35rem;color:var(--ink)">${s.title}</h2>
      <p class="note" style="color:var(--muted);line-height:1.6">${s.sub}</p>
    </div>
    ${fieldsHtml}
  `;

  $('#back').classList.toggle('hide', cur === 0);
  $('#next-text').textContent = cur === STEPS.length - 1 ? 'Analisis Risiko dengan AI Sekarang' : 'Lanjut ke Tahap Berikutnya';
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

  // Nilai default kompatibilitas skema model machine learning (BRFSS 21 features)
  if (body.Education === undefined) body.Education = 4;
  if (body.AnyHealthcare === undefined) body.AnyHealthcare = 1;
  if (body.NoDocbcCost === undefined) body.NoDocbcCost = 0;
  if (body.Income === undefined) body.Income = 5;

  const fullAnswers = { ...body, height: h, weight: w };

  const nextBtn = $('#next');
  nextBtn.disabled = true;
  $('#next-text').textContent = 'Memproses Analisis Kecerdasan Buatan...';

  try {
    const result = await API.predict(body, { height: h, weight: w });
    sessionStorage.setItem('dw_last', JSON.stringify({
      id: result.id,
      created_at: result.created_at,
      answers: fullAnswers,
      result: result
    }));
    location.href = 'report.html';
  } catch (err) {
    errText.textContent = err.message || 'Gagal memproses analisis skrining.';
    errBox.classList.remove('hide');
    nextBtn.disabled = false;
    $('#next-text').textContent = 'Analisis Risiko dengan AI Sekarang';
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
