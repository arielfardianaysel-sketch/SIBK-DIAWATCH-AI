"""Kontrak 20 input DiaWatch, sesuai notebook fine-tuning Qwen3."""
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

BINARY = Literal[0, 1]
FEATURES = [
    "Age", "Sex", "BMI", "HighBP", "HighChol", "CholCheck", "Stroke",
    "HeartDiseaseorAttack", "Smoker", "PhysActivity", "Fruits", "Veggies",
    "HvyAlcoholConsump", "GenHlth", "MentHlth", "PhysHlth", "DiffWalk"
]

SYSTEM_PROMPT = (
    "Anda adalah pengklasifikasi DATA SURVEI untuk eksperimen akademik DiaWatch. "
    "Diberikan 17 indikator kesehatan dari dataset UCI CDC Diabetes Health Indicators. "
    "Prediksikan label Diabetes_binary. "
    "Balas tepat satu karakter: 0 atau 1. "
    "0 = tidak diabetes (label survei); 1 = prediabetes atau diabetes (label survei). "
    "Jangan sertakan persentase, diagnosis, atau penjelasan."
)


class ScreeningForm(BaseModel):
    model_config = ConfigDict(extra="forbid")
    age_years: int = Field(ge=18, le=100)
    sex_uci: BINARY
    height_cm: float = Field(ge=100, le=220)
    weight_kg: float = Field(ge=25, le=300)
    HighBP: BINARY
    HighChol: BINARY
    CholCheck: BINARY
    Stroke: BINARY
    HeartDiseaseorAttack: BINARY
    Smoker: BINARY
    PhysActivity: BINARY
    Fruits: BINARY
    Veggies: BINARY
    HvyAlcoholConsump: BINARY
    GenHlth: int = Field(ge=1, le=5)
    MentHlth: int = Field(ge=0, le=30)
    PhysHlth: int = Field(ge=0, le=30)
    DiffWalk: BINARY
    sugary_days_per_week: int = Field(ge=0, le=7)
    family_history: BINARY


def age_to_bucket(age_years: int) -> int:
    if age_years >= 80:
        return 13
    if age_years <= 24:
        return 1
    return min(12, ((age_years - 25) // 5) + 2)


def features_from_form(form: ScreeningForm):
    values = form.model_dump()
    bmi_display = values["weight_kg"] / ((values["height_cm"] / 100) ** 2)
    features = {
        "Age": age_to_bucket(form.age_years),
        "Sex": form.sex_uci,
        "BMI": int(round(bmi_display)),
    }
    for key in FEATURES:
        if key not in features:
            features[key] = int(values[key])
    return features, round(bmi_display, 1)


def user_prompt(features: dict) -> str:
    lines = ["Data survei kesehatan (kode fitur mengikuti UCI):"]
    for key in FEATURES:
        value = float(features[key])
        value = int(value) if value.is_integer() else value
        lines.append(f"{key}: {value}")
    lines.append("Label Diabetes_binary (0 atau 1):")
    return "\n".join(lines)


def recommendations(form: ScreeningForm, bmi: float) -> list[dict]:
    source = "https://www.cdc.gov/diabetes/prevention-type-2/"
    result = []
    def add(title, description, reason):
        result.append({"title": title, "description": description,
                       "reason_from_questionnaire": reason, "source_url": source})
    if form.sugary_days_per_week >= 4:
        add("Kurangi gula tambahan", "Pertimbangkan lebih sering memilih air putih dan mengurangi minuman berpemanis secara bertahap.",
            "Konsumsi makanan/minuman manis pada sedikitnya 4 hari per minggu")
    if form.PhysActivity == 0:
        add("Mulai lebih aktif", "Tambahkan aktivitas fisik secara bertahap sesuai kemampuan. Panduan umum untuk kebanyakan orang dewasa sekitar 150 menit aktivitas sedang per minggu.",
            "Tidak ada aktivitas fisik di luar pekerjaan pada 30 hari terakhir")
    if form.Fruits == 0 or form.Veggies == 0:
        add("Perbanyak makanan berserat", "Usahakan makan buah dan sayuran lebih teratur sebagai bagian dari pola makan seimbang.",
            "Konsumsi buah atau sayur kurang dari sekali per hari")
    if form.family_history == 1:
        add("Perhatikan riwayat keluarga", "Pertimbangkan berkonsultasi dengan tenaga kesehatan mengenai kebutuhan pemeriksaan gula darah.",
            "Memiliki keluarga dekat dengan diabetes (tidak masuk fitur prediksi AI)")
    if form.HighBP == 1 or form.HighChol == 1:
        add("Pantau kesehatan", "Ikuti anjuran dan pemantauan dari tenaga kesehatan terkait tekanan darah atau kolesterol.",
            "Riwayat tekanan darah atau kolesterol tinggi")
    if bmi >= 25:
        add("Tinjau pola hidup", "Diskusikan pola makan dan aktivitas fisik dengan tenaga kesehatan bila diperlukan. BMI bukan diagnosis.",
            "BMI >= 25; aturan edukasi umum")
    if not result:
        add("Pertahankan kebiasaan sehat", "Lanjutkan aktivitas fisik dan pola makan seimbang. Bila ada keluhan, konsultasikan dengan tenaga kesehatan.",
            "Tidak ada pemicu saran spesifik dari aturan prototipe")
    return result
