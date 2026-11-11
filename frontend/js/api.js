/* Kontrak endpoint (mode asli), semua JSON, header Authorization: Bearer <token>
 *  POST /auth/register {name,email,birth_date,password} -> {token,user:{name,email,birth_date}}
 *  POST /auth/login    {email,password}                 -> {token,user}
 *  POST /predict       {HighBP,...,Age}                 -> {id,created_at,risk_category,probability,top_factors[],education_text}
 *  GET  /history                                        -> [{id,created_at,answers,result}]
 * risk_category: "rendah" | "sedang" | "tinggi". Backend menyimpan riwayat saat /predict. */
const API = (() => {
  const db = (k, d) => JSON.parse(localStorage.getItem(k) || d), save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  async function http(path, body) {
    const s = getSession(), ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 25000);
    try {
      const r = await fetch(CFG.API_URL + path, {
        method: body ? 'POST' : 'GET', signal: ctrl.signal, body: body && JSON.stringify(body),
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1', ...(s ? { Authorization: 'Bearer ' + s.token } : {}) }
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Server error ' + r.status);
      return await r.json();
    } catch (e) { throw new Error(e.name === 'AbortError' ? 'Server tidak merespons. Coba lagi.' : e.message); }
    finally { clearTimeout(t); }
  }
  const LABEL = { BMI: 'Indeks massa tubuh', HighBP: 'Tekanan darah tinggi', HighChol: 'Kolesterol tinggi', Age: 'Usia', GenHlth: 'Kesehatan umum',
    PhysActivity: 'Kurang aktivitas fisik', DiffWalk: 'Sulit berjalan', HeartDiseaseorAttack: 'Riwayat penyakit jantung', Stroke: 'Riwayat stroke' };
  function mockPredict(a) {
    const c = {
      BMI: a.BMI >= 30 ? 2 : a.BMI >= 25 ? 1 : 0, HighBP: a.HighBP * 2, HighChol: a.HighChol, Age: (a.Age >= 8) + (a.Age >= 10),
      GenHlth: a.GenHlth >= 4 ? 1 : 0, PhysActivity: 1 - a.PhysActivity, DiffWalk: a.DiffWalk, HeartDiseaseorAttack: a.HeartDiseaseorAttack, Stroke: a.Stroke };
    const score = Object.values(c).reduce((x, y) => x + y, 0), p = 1 / (1 + Math.exp(-(score - 5) * 0.6));
    const top = Object.keys(c).filter(k => c[k] > 0).sort((x, y) => c[y] - c[x]).slice(0, 3);
    return { risk_category: p < .33 ? 'rendah' : p < .66 ? 'sedang' : 'tinggi', probability: +p.toFixed(2), top_factors: top,
      education_text: top.length ? 'Faktor yang paling berpengaruh pada hasil ini: ' + top.map(k => LABEL[k]).join(', ') +
        '. Menjaga berat badan, aktif bergerak, dan memeriksa tekanan darah serta kolesterol secara rutin membantu menurunkan risiko. Bicarakan hasil ini dengan tenaga kesehatan. (Teks contoh dari mode mock.)'
        : 'Tidak ada faktor risiko menonjol pada jawabanmu. Pertahankan pola hidup sehat. (Teks contoh dari mode mock.)' };
  }
  return {
    LABEL,
    async register(u) {
      if (!CFG.USE_MOCK) return http('/auth/register', u);
      await wait(300); const users = db('dw_users', '[]');
      if (users.some(x => x.email === u.email)) throw new Error('Email sudah terdaftar. Silakan masuk.');
      users.push(u); save('dw_users', users);
      return { token: 'mock-' + Date.now(), user: { name: u.name, email: u.email, birth_date: u.birth_date } };
    },
    async login(u) {
      if (!CFG.USE_MOCK) return http('/auth/login', u);
      await wait(300); const m = db('dw_users', '[]').find(x => x.email === u.email && x.password === u.password);
      if (!m) throw new Error('Email atau kata sandi salah.');
      return { token: 'mock-' + Date.now(), user: { name: m.name, email: m.email, birth_date: m.birth_date } };
    },
    async predict(a, meta) {
      if (!CFG.USE_MOCK) return http('/predict', a);
      await wait(900); const r = { id: String(Date.now()), created_at: new Date().toISOString(), ...mockPredict(a) };
      const full = meta ? { ...a, ...meta } : a;
      const k = 'dw_hist_' + getSession().user.email, h = db(k, '[]'); h.unshift({ id: r.id, created_at: r.created_at, answers: full, result: r });
      save(k, h); return r;
    },
    async history() {
      if (!CFG.USE_MOCK) return http('/history');
      await wait(300); return db('dw_hist_' + getSession().user.email, '[]');
    }
  };
})();
