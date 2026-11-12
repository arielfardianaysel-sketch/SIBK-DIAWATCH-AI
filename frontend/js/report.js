import { getHistoryDetail, screeningLabel, requestRecommendations } from "./api.js";

if (typeof window.guard === "function") {
  window.guard();
}

const stateEl = document.getElementById("report-state");
const contentEl = document.getElementById("report-content");
const summaryEl = document.getElementById("report-summary");
const explanationEl = document.getElementById("report-explanation");
const answersEl = document.getElementById("report-answers");
const recommendationsEl = document.getElementById("report-recommendations");
const printButton = document.getElementById("print-report");

printButton.disabled = true;

// Menghindari HTML injection dari data yang ditampilkan.
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function formatDate(value) {
  if (!value) return "Tanggal tidak tersedia";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Tanggal tidak tersedia";
  }

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Jakarta"
  }).format(date) + " WIB";
}

function formatBMI(value) {
  if (value == null || value === "") return "-";

  const bmi = Number(value);
  return Number.isFinite(bmi) ? bmi.toFixed(1) : "-";
}

function yesNo(value) {
  if (value === 1 || value === "1" || value === true) {
    return "Ya";
  }

  if (value === 0 || value === "0" || value === false) {
    return "Tidak";
  }

  return "Tidak tersedia";
}

function generalHealth(value) {
  const values = {
    1: "Sangat baik",
    2: "Baik sekali",
    3: "Baik",
    4: "Cukup",
    5: "Buruk"
  };

  return values[value] || "Tidak tersedia";
}

function answerValue(key, value) {
  if (value === null || value === undefined || value === "") {
    return "Tidak tersedia";
  }

  if (key === "sex_uci") {
    return Number(value) === 1 ? "Laki-laki" : "Perempuan";
  }

  if (key === "GenHlth") {
    return generalHealth(value);
  }

  if (key === "age_years") return `${value} tahun`;
  if (key === "height_cm") return `${value} cm`;
  if (key === "weight_kg") return `${value} kg`;

  if (key === "MentHlth" || key === "PhysHlth") {
    return `${value} hari dalam 30 hari terakhir`;
  }

  if (key === "sugary_days_per_week") {
    return `${value} hari per minggu`;
  }

  if (key === "Fruits" || key === "Veggies") {
    return Number(value) === 1
      ? "Minimal sekali sehari"
      : "Kurang dari sekali sehari";
  }

  if (key === "PhysActivity") {
    return Number(value) === 1
      ? "Melakukan aktivitas fisik"
      : "Tidak melakukan aktivitas fisik";
  }

  return yesNo(value);
}

// Pertanyaan sesuai kontrak backend DiaWatch.
const questionGroups = [
  {
    title: "Data Diri dan Tubuh",
    questions: [
      ["age_years", "Usia"],
      ["sex_uci", "Jenis kelamin"],
      ["height_cm", "Tinggi badan"],
      ["weight_kg", "Berat badan"]
    ]
  },
  {
    title: "Riwayat dan Kondisi Kesehatan",
    questions: [
      ["HighBP", "Riwayat tekanan darah tinggi"],
      ["HighChol", "Riwayat kolesterol tinggi"],
      ["CholCheck", "Pemeriksaan kolesterol"],
      ["Stroke", "Riwayat stroke"],
      ["HeartDiseaseorAttack", "Riwayat penyakit jantung/serangan jantung"],
      ["GenHlth", "Kesehatan secara umum"],
      ["MentHlth", "Hari kesehatan mental kurang baik"],
      ["PhysHlth", "Hari kesehatan fisik kurang baik"],
      ["DiffWalk", "Kesulitan berjalan atau menaiki tangga"]
    ]
  },
  {
    title: "Kebiasaan dan Faktor Tambahan",
    questions: [
      ["Smoker", "Riwayat merokok"],
      ["PhysActivity", "Aktivitas fisik"],
      ["Fruits", "Konsumsi buah"],
      ["Veggies", "Konsumsi sayuran"],
      ["HvyAlcoholConsump", "Konsumsi alkohol berlebihan"],
      ["sugary_days_per_week", "Frekuensi konsumsi makanan/minuman manis"],
      ["family_history", "Riwayat diabetes keluarga"]
    ]
  }
];

function renderSummary(report) {
  const label = report.predicted_label === 0 || report.predicted_label === 1 ? report.predicted_label : null;

  const isPositive = label === 1;
  const isNegative = label === 0;

  const categoryText = screeningLabel(label);
  const categoryDesc = "Berdasarkan jawaban skrining, bukan diagnosis medis.";

  const pillClass = isPositive
    ? "high"
    : isNegative ? "low" : "";

  summaryEl.innerHTML = `
    <div class="card report-stat">
      <div class="report-stat-label">
        Hasil Klasifikasi AI
      </div>
      <div class="report-stat-value">
        <span class="pill ${pillClass}">
          ${esc(categoryText)}
        </span>
      </div>
      <p class="note" style="margin-top:.6rem">
        ${esc(categoryDesc)}
      </p>
    </div>

    <div class="card report-stat">
      <div class="report-stat-label">
        Indeks Massa Tubuh (BMI)
      </div>
      <div class="report-stat-value">
        ${esc(formatBMI(report.bmi))}
        <span style="font-size:.8rem">kg/m²</span>
      </div>
      <p class="note">
        Berdasarkan tinggi dan berat badan
      </p>
    </div>

    <div class="card report-stat">
      <div class="report-stat-label">
        Tanggal Pemeriksaan
      </div>
      <div class="report-stat-value"
           style="font-size:1rem">
        ${esc(formatDate(report.created_at))}
      </div>
      <p class="note">
        Tersimpan di riwayat pribadi
      </p>
    </div>
  `;
}

function renderExplanation(report) {
  const label = report.predicted_label === 0 || report.predicted_label === 1 ? report.predicted_label : null;

  let message;

  if (label === 1) {
    message = `
      Model mengklasifikasikan jawaban ini ke
      <b>kelas 1</b>, yaitu kategori prediabetes
      atau diabetes pada dataset survei.
      Hasil ini bukan diagnosis. Pemeriksaan
      gula darah dan konsultasi tenaga kesehatan
      diperlukan untuk penilaian medis.
    `;
  } else if (label === 0) {
    message = `
      Model mengklasifikasikan jawaban ini ke
      <b>kelas 0</b>, yaitu kategori tidak diabetes
      pada dataset survei. Hasil ini tidak
      menyingkirkan kemungkinan diabetes.
      Pemeriksaan medis tetap dapat diperlukan
      sesuai gejala dan faktor risiko.
    `;
  } else {
    message = `
      Hasil klasifikasi tidak tersedia.
      Silakan periksa kembali data skrining.
    `;
  }

  explanationEl.innerHTML = `
    <p>${message}</p>
    <p class="note" style="margin-top:1rem">
      <b>Model:</b>
      ${esc(report.model_name || "Qwen DiaWatch")}
    </p>
  `;
}

function renderAnswers(report) {
  const answers = report.questionnaire_answers || {};

  if (!answers || Object.keys(answers).length === 0) {
    answersEl.innerHTML = `
      <p class="note">
        Jawaban skrining tidak tersedia.
      </p>
    `;
    return;
  }

  answersEl.innerHTML = questionGroups.map(group => {
    const rows = group.questions
      .filter(([key]) => Object.hasOwn(answers, key))
      .map(([key, label]) => `
        <div class="answer-row">
          <span class="note">${esc(label)}</span>
          <span class="answer-value">
            ${esc(answerValue(key, answers[key]))}
          </span>
        </div>
      `).join("");

    if (!rows) return "";

    return `
      <div style="margin-top:1.5rem">
        <h3 style="font-size:1.05rem;margin-bottom:.5rem">
          ${esc(group.title)}
        </h3>
        ${rows}
      </div>
    `;
  }).join("");
}

// Hanya izinkan URL sumber HTTPS.
function safeSourceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function renderRecommendations(report) {
  const tips = Array.isArray(report.recommendations)
    ? report.recommendations.filter(tip => tip?.kind !== "model_score")
    : [];

  const retry = `<button type="button" class="btn ghost btn-sm" id="retry-recommendations" style="margin-top:1rem">${tips.length ? 'Buat ulang saran dengan AI' : 'Buat saran personal dengan AI'}</button><p class="note" id="recommendation-state" role="status" style="margin-top:.5rem"></p>`;
  function attachRetry() {
    document.getElementById("retry-recommendations").addEventListener("click", async event => {
      const button = event.currentTarget;
      button.disabled = true;
      const state = document.getElementById("recommendation-state");
      state.textContent = "AI sedang menyusun saran berdasarkan jawaban dan referensi kesehatan...";
      try {
        const result = await requestRecommendations(report.id);
        renderRecommendations({ ...report, recommendations: result.recommendations });
      } catch (error) {
        state.textContent = error.message || "Saran belum berhasil dibuat. Silakan coba lagi.";
        button.disabled = false;
      }
    });
  }

  if (tips.length === 0) {
    recommendationsEl.innerHTML = `
      <p class="note">
        Saran personal AI belum tersedia untuk hasil ini. Hasil klasifikasi Anda tetap tersimpan.
      </p>
    ` + retry;
    attachRetry();
    return;
  }

  const origin = tips.every(tip => tip?.generator === "qwen-rag-v1")
    ? '<p class="note">Saran disusun Qwen dari jawaban Anda dan referensi CDC. Tinjau bersama tenaga kesehatan bila diperlukan.</p>'
    : '<p class="note">Saran tersimpan dari versi sebelumnya. Anda dapat membuat ulang dengan AI.</p>';
  recommendationsEl.innerHTML = origin + tips.map((tip, index) => {
    const title = typeof tip === "string"
      ? `Rekomendasi ${index + 1}`
      : tip.title || `Rekomendasi ${index + 1}`;

    const description = typeof tip === "string"
      ? tip
      : tip.description || "";

    const reason = typeof tip === "object" && tip !== null
      ? tip.reason_from_questionnaire
      : null;

    const source = typeof tip === "object" && tip !== null
      ? safeSourceUrl(tip.source_url)
      : null;

    return `
      <article class="recommendation-item">
        <h3>${esc(title)}</h3>

        <p>${esc(description)}</p>

        ${reason ? `
          <p class="note">
            <b>Berdasarkan jawaban:</b>
            ${esc(reason)}
          </p>
        ` : ""}

        ${source ? `
          <a href="${esc(source)}"
             target="_blank"
             rel="noopener noreferrer"
             style="font-size:.85rem">
            Referensi: ${esc(tip.source_title || "panduan kesehatan")}
          </a>
        ` : ""}
      </article>
    `;
  }).join("") + retry;
  attachRetry();
}

function showError(message) {
  contentEl.hidden = true;
  stateEl.hidden = false;

  stateEl.innerHTML = `
    <div role="alert">
      <h2 style="margin-bottom:.5rem">
        Laporan Tidak Dapat Ditampilkan
      </h2>

      <p class="note">${esc(message)}</p>

      <a class="btn ghost"
         style="margin-top:1rem"
         href="history.html">
        Kembali ke Riwayat
      </a>
    </div>
  `;
}

async function loadReport() {
  const params = new URLSearchParams(window.location.search);
  let screeningId = params.get("id");

  if (!screeningId) {
    try {
      const cached = JSON.parse(sessionStorage.getItem("dw_last") || "null");
      if (cached?.id || cached?.screening_id) {
        screeningId = String(cached.id ?? cached.screening_id);
      }
    } catch (_) {
      // Abaikan jika sessionStorage tidak valid
    }
  }

  if (!screeningId) {
    showError("ID pemeriksaan tidak ditemukan pada URL.");
    return;
  }

  // Hanya menerima ID UUID dari database.
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(screeningId)) {
    showError("Format ID pemeriksaan tidak valid.");
    return;
  }

  try {
    const response = await getHistoryDetail(screeningId);

    // Backend sekarang mengembalikan baris screening
    // secara langsung. Mendukung juga {item: {...}}.
    const report = response?.item ?? response;

    if (!report || !report.id) {
      throw new Error("Data laporan tidak ditemukan.");
    }

    renderSummary(report);
    renderExplanation(report);
    renderAnswers(report);
    renderRecommendations(report);

    stateEl.hidden = true;
    contentEl.hidden = false;
    printButton.disabled = false;

  } catch (error) {
    console.error("Gagal memuat laporan:", error);

    showError(
      error?.message ||
      "Terjadi kesalahan saat mengambil laporan."
    );
  }
}

printButton.addEventListener("click", () => {
  window.print();
});

loadReport();
