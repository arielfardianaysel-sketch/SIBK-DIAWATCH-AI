"""Backend DiaWatch: API aman untuk Qwen lokal + Supabase."""
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import create_client

from questionnaire import ScreeningForm, features_from_form
from ai import (AIUnavailable, classification_payload, generate_recommendations,
                load_knowledge, parse_classification)

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
        user = response.user if response is not None else None
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
        "knowledge_base_ready": bool(load_knowledge()),
    }


@app.get("/api/history")
def get_history(user_id: str = Depends(get_authenticated_user)):
    _, db = get_supabase_clients()
    try:
        result = (
            db.table("screenings")
            .select("id,created_at,bmi,predicted_label,model_name")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        items = []
        for row in result.data or []:
            if not isinstance(row, dict):
                raise ValueError("Invalid screening row")
            item = dict(row)
            item.pop("recommendations", None)
            items.append(item)
        return {"items": items}
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
    record = result.data[0]
    if not isinstance(record, dict):
        raise HTTPException(status_code=502, detail="Format laporan tidak valid")
    return public_screening(record)


def public_screening(record: dict) -> dict:
    # Ignore legacy score metadata without changing stored history or schema.
    result = dict(record)
    result.pop("experimental_score_percent", None)
    result["recommendations"] = [tip for tip in record.get("recommendations") or []
                                 if not isinstance(tip, dict) or tip.get("kind") != "model_score"]
    return result


async def predict_via_llama(features: dict) -> int:
    """Prediksi label 0/1 menggunakan model dan adapter llama.cpp yang aktif."""
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(180, connect=5), trust_env=False) as client:
            result = await client.post(f"{LLM_URL}/v1/chat/completions", json=classification_payload(features))
            result.raise_for_status()
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="Qwen lokal belum siap atau gagal merespons") from exc
    try:
        return parse_classification(result.json())
    except (ValueError, KeyError, IndexError, TypeError, AttributeError) as exc:
        raise HTTPException(status_code=502, detail="Format output model bukan label 0 atau 1") from exc


@app.post("/api/predict")
async def predict(form: ScreeningForm, user_id: str = Depends(get_authenticated_user)):
    features, bmi = features_from_form(form)
    label = await predict_via_llama(features)
    recommendation_error = None
    try:
        tips = await generate_recommendations(form, bmi, label, LLM_URL)
    except AIUnavailable as exc:
        tips = []
        recommendation_error = str(exc)
    row = {
        "user_id": user_id,  # Didapat dari JWT valid, BUKAN dari input frontend
        "questionnaire_answers": form.model_dump(),
        "questionnaire_version": "v1",
        "bmi": bmi,
        "predicted_label": label,
        "recommendations": tips,
        "model_name": "Qwen3-4B-Instruct-2507 + DiaWatch LoRA (GGUF)",
    }
    _, db = get_supabase_clients()
    try:
        result = db.table("screenings").insert(row).execute()
        record = result.data[0]
        if not isinstance(record, dict) or "id" not in record or "created_at" not in record:
            raise ValueError("Invalid saved screening")
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Prediksi berhasil tetapi gagal menyimpan riwayat") from exc
    return {
        "screening_id": record["id"],
        "created_at": record["created_at"],
        "bmi": bmi,
        "prediction": {
            "predicted_label": label,
            "meaning": "Terindikasi diabetes" if label == 1 else "Tidak terindikasi diabetes",
        },
        "recommendations": tips,
        "recommendation_status": "generated" if tips else "unavailable",
        "recommendation_error": recommendation_error,
        "disclaimer": "Prototipe skrining akademik berbasis data survei, bukan diagnosis atau peluang diabetes masa depan."
    }


@app.post("/api/history/{screening_id}/recommendations")
async def regenerate_recommendations(screening_id: str, user_id: str = Depends(get_authenticated_user)):
    record = get_history_detail(screening_id, user_id)
    try:
        form = ScreeningForm.model_validate(record.get("questionnaire_answers"))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Jawaban laporan ini tidak lengkap untuk membuat saran. Silakan lakukan skrining baru.") from exc
    _, bmi = features_from_form(form)
    if record.get("predicted_label") not in (0, 1):
        raise HTTPException(status_code=422, detail="Label skrining tidak valid")
    try:
        tips = await generate_recommendations(form, bmi, record["predicted_label"], LLM_URL)
    except AIUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    _, db = get_supabase_clients()
    try:
        result = (db.table("screenings").update({"recommendations": tips})
                  .eq("user_id", user_id).eq("id", screening_id).execute())
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Saran AI dibuat tetapi gagal disimpan") from exc
    if not result.data:
        raise HTTPException(status_code=404, detail="Skrining tidak ditemukan")
    return {"recommendations": tips, "recommendation_status": "generated"}
