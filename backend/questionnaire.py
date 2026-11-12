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
