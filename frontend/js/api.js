import {
  API_BASE_URL,
  supabase,
  registerUser,
  loginUser,
  logoutUser,
  currentUser,
  getMyProfile,
  getBackendHealth,
  getHistory,
  getHistoryDetail,
  submitScreening,
  deleteMyScreening,
  backendRequest,
} from "./diawatch-supabase.js";

export {
  getHistory,
  getHistoryDetail,
  submitScreening,
  API_BASE_URL,
  supabase,
  registerUser,
  loginUser,
  logoutUser,
  currentUser,
  getMyProfile,
  getBackendHealth,
  deleteMyScreening,
} from "./diawatch-supabase.js";

export const LABEL = {
  BMI: "Indeks massa tubuh",
  HighBP: "Tekanan darah tinggi",
  HighChol: "Kolesterol tinggi",
  Age: "Usia",
  GenHlth: "Kesehatan umum",
  PhysActivity: "Kurang aktivitas fisik",
  DiffWalk: "Sulit berjalan",
  HeartDiseaseorAttack: "Riwayat penyakit jantung",
  Stroke: "Riwayat stroke",
  Smoker: "Riwayat merokok",
  Fruits: "Kurang konsumsi buah",
  Veggies: "Kurang konsumsi sayur",
  HvyAlcoholConsump: "Konsumsi alkohol berlebih",
  sugary_days_per_week: "Konsumsi minuman/makanan manis",
  family_history: "Riwayat diabetes keluarga",
};

export function screeningLabel(label) {
  return label === 1 ? "Terindikasi diabetes"
    : label === 0 ? "Tidak terindikasi diabetes" : "Hasil belum tersedia";
}

export async function requestRecommendations(id) {
  return backendRequest(`/api/history/${encodeURIComponent(id)}/recommendations`, { method: "POST" });
}

/**
 * Menentukan faktor risiko utama dari jawaban kuesioner.
 */
export function extractTopFactors(answers = {}, bmiVal = null) {
  const bmi = Number(bmiVal ?? answers.BMI ?? answers.bmi ?? 0);
  const factors = [];

  if (bmi >= 25) factors.push("BMI");
  if (Number(answers.HighBP) === 1) factors.push("HighBP");
  if (Number(answers.HighChol) === 1) factors.push("HighChol");
  if (Number(answers.HeartDiseaseorAttack) === 1) factors.push("HeartDiseaseorAttack");
  if (Number(answers.Stroke) === 1) factors.push("Stroke");
  if (Number(answers.DiffWalk) === 1) factors.push("DiffWalk");
  if (Number(answers.GenHlth) >= 4) factors.push("GenHlth");
  if (Number(answers.PhysActivity) === 0) factors.push("PhysActivity");
  if (Number(answers.Smoker) === 1) factors.push("Smoker");
  if (Number(answers.age_years) >= 45 || Number(answers.Age) >= 6) factors.push("Age");

  return factors.slice(0, 4);
}

/**
 * Normalisasi satu item riwayat dari GET /api/history atau GET /api/history/{id}
 * ataupun hasil POST /api/predict agar seragam di seluruh halaman UI.
 */
export function normalizeHistoryItem(item, fallbackAnswers = null) {
  if (!item) return null;

  // Jika sudah dalam format lama dan lengkap, pastikan properti utama tetap ada
  const id = item.id ?? item.screening_id;
  const created_at = item.created_at ?? new Date().toISOString();

  const rawAnswers = item.questionnaire_answers || item.answers || fallbackAnswers || {};
  const bmi =
    item.bmi ??
    rawAnswers.BMI ??
    (rawAnswers.weight_kg && rawAnswers.height_cm
      ? +(rawAnswers.weight_kg / ((rawAnswers.height_cm / 100) ** 2)).toFixed(1)
      : null);

  const rawLabel = item.predicted_label ?? item.prediction?.predicted_label ?? item.result?.predicted_label;
  const predictedLabel = rawLabel === 0 || rawLabel === 1 ? rawLabel : null;
  const riskLabelText = screeningLabel(predictedLabel);

  const topFactors =
    item.result?.top_factors && item.result.top_factors.length
      ? item.result.top_factors
      : extractTopFactors(rawAnswers, bmi);

  const recommendations = (item.recommendations || item.result?.recommendations || [])
    .filter(tip => tip?.kind !== "model_score");

  const normalizedAnswers = {
    ...rawAnswers,
    BMI: bmi,
    Sex: rawAnswers.sex_uci ?? rawAnswers.Sex ?? 0,
    height: rawAnswers.height_cm ?? rawAnswers.height ?? null,
    weight: rawAnswers.weight_kg ?? rawAnswers.weight ?? null,
    age_years: rawAnswers.age_years ?? null,
  };

  return {
    ...item,
    id,
    created_at,
    bmi,
    predicted_label: predictedLabel,
    model_name: item.model_name || "Qwen3-4B-Instruct-2507 + DiaWatch LoRA (GGUF)",
    recommendations,
    answers: normalizedAnswers,
    result: {
      id,
      created_at,
      risk_label: riskLabelText,
      predicted_label: predictedLabel,
      top_factors: topFactors,
      recommendations,
      meaning: riskLabelText,
      disclaimer:
        item.disclaimer ||
        "Prototipe skrining akademik berbasis data survei, bukan diagnosis atau peluang diabetes masa depan.",
    },
  };
}

/**
 * Objek kompatibilitas API untuk modul yang memanggil API.*
 */
export const API = {
  LABEL,
  async register(u) {
    const data = await registerUser(u.email, u.password, u.name, u.birth_date);
    const user = data.user;
    const token = data.session?.access_token || null;
    return {
      token,
      session: data.session,
      user: {
        id: user?.id,
        name: u.name || user?.user_metadata?.display_name || u.email.split("@")[0],
        email: user?.email || u.email,
        birth_date: u.birth_date || user?.user_metadata?.birth_date || null,
      },
    };
  },
  async login(u) {
    const data = await loginUser(u.email, u.password);
    const user = data.user;
    let profileName = user?.user_metadata?.display_name;
    if (!profileName) {
      try {
        const profile = await getMyProfile();
        if (profile?.display_name) profileName = profile.display_name;
      } catch (_) {
        // Abaikan jika tabel profiles belum memiliki baris untuk user ini
      }
    }
    return {
      token: data.session?.access_token,
      session: data.session,
      user: {
        id: user?.id,
        name: profileName || user?.email?.split("@")[0] || "Pengguna",
        email: user?.email || u.email,
        birth_date: user?.user_metadata?.birth_date || null,
      },
    };
  },
  async logout() {
    await logoutUser();
  },
  async predict(answers) {
    const raw = await submitScreening(answers);
    return normalizeHistoryItem(raw, answers);
  },
  async history() {
    const items = await getHistory();
    return items.map((item) => normalizeHistoryItem(item));
  },
  async historyDetail(id) {
    const detail = await getHistoryDetail(id);
    return normalizeHistoryItem(detail);
  },
};

window.API = API;
