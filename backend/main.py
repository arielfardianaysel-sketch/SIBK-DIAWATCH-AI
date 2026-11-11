"""Backend DiaWatch: API aman untuk Qwen lokal + Supabase."""
import os
import re
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import create_client

from questionnaire import ScreeningForm, SYSTEM_PROMPT, features_from_form, recommendations, user_prompt

load_dotenv(Path(__file__).resolve().parent / ".env")
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_PUBLISHABLE_KEY = os.getenv("SUPABASE_PUBLISHABLE_KEY", "").strip()
SUPABASE_SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY", "").strip()
LLM_URL = os.getenv("LLM_URL", "http://127.0.0.1:8080").rstrip("/")

app = FastAPI(title="DiaWatch API", version="0.1.0")
allowed_origins = os.getenv(
    "ALLOWED_ORIGINS", "http://127.0.0.1:5500,http://localhost:5500"
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in allowed_origins if origin.strip()],
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

bearer = HTTPBearer(auto_error=False)


def get_supabase_clients():
    if not all([SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY]):
        raise HTTPException(status_code=503, detail="Supabase belum dikonfigurasi di backend/.env")
    return (
        create_client(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY),
        create_client(SUPABASE_URL, SUPABASE_SECRET_KEY),
    )


def get_authenticated_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> str:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Login dahulu menggunakan Supabase Auth")
    auth_client, _ = get_supabase_clients()
    try:
        response = auth_client.auth.get_user(credentials.credentials)
        user = response.user
        if user is None or not user.id:
            raise ValueError("Token tidak valid")
        return str(user.id)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Sesi login tidak valid / kedaluwarsa") from exc


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "DiaWatch API",
        "supabase_configured": bool(SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY),
        "llm_url": LLM_URL,
    }


@app.get("/api/history")
def get_history(user_id: str = Depends(get_authenticated_user)):
    _, db = get_supabase_clients()
    try:
        result = (
            db.table("screenings")
            .select("id,created_at,bmi,predicted_label,experimental_score_percent,model_name")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        return {"items": result.data or []}
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Gagal mengambil riwayat dari Supabase") from exc


@app.get("/api/history/{screening_id}")
def get_history_detail(screening_id: str, user_id: str = Depends(get_authenticated_user)):
    _, db = get_supabase_clients()
    try:
        result = (
            db.table("screenings").select("*")
            .eq("user_id", user_id)
            .eq("id", screening_id)
            .limit(1).execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Gagal membaca laporan") from exc
    if not result.data:
        raise HTTPException(status_code=404, detail="Laporan tidak ditemukan")
    return result.data[0]


async def predict_via_llama(features: dict) -> int:
    """Prediksi kategorikal dari server llama.cpp (model + adapter WAJIB telah di-load)."""
    payload = {
        "model": "diawatch",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt(features)},
        ],
        "temperature": 0,
        "max_tokens": 4,
        "stream": False,
    }
    try:
        async with httpx.AsyncClient(timeout=180) as client:
            result = await client.post(f"{LLM_URL}/v1/chat/completions", json=payload)
            result.raise_for_status()
        output = result.json()["choices"][0]["message"]["content"].strip()
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="Qwen lokal belum siap atau gagal merespons") from exc
    match = re.fullmatch(r"\s*([01])\s*", output)
    if not match:
        # Tidak boleh menyimpan klaim medis dari output generatif yang melenceng.
        raise HTTPException(status_code=502, detail="Format output model bukan label 0 atau 1")
    return int(match.group(1))


@app.post("/api/predict")
async def predict(form: ScreeningForm, user_id: str = Depends(get_authenticated_user)):
    features, bmi = features_from_form(form)
    label = await predict_via_llama(features)
    tips = recommendations(form, bmi)
    row = {
        "user_id": user_id,  # Didapat dari JWT valid, BUKAN dari input frontend
        "questionnaire_answers": form.model_dump(),
        "questionnaire_version": "v1",
        "bmi": bmi,
        "predicted_label": label,
        "experimental_score_percent": None,  # Jangan membuat angka % tanpa kalibrasi yang sama dengan Colab
        "recommendations": tips,
        "model_name": "Qwen3-4B-Instruct-2507 + DiaWatch LoRA (GGUF)",
    }
    _, db = get_supabase_clients()
    try:
        result = db.table("screenings").insert(row).execute()
        record = result.data[0]
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Prediksi berhasil tetapi gagal menyimpan riwayat") from exc
    return {
        "screening_id": record["id"],
        "created_at": record["created_at"],
        "bmi": bmi,
        "prediction": {
            "predicted_label": label,
            "meaning": "Prediabetes/diabetes pada label data survei" if label == 1 else "Tidak diabetes pada label data survei",
            "experimental_score_percent": None,
            "score_is_clinical_risk": False,
        },
        "recommendations": tips,
        "disclaimer": "Prototipe skrining akademik berbasis data survei, bukan diagnosis atau peluang diabetes masa depan."
    }
