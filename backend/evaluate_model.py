"""
DiaWatch AI - Evaluasi Qwen GGUF Lokal
Jalankan ketika llama-server aktif di port 8080.
"""

import re
import sys
from pathlib import Path
from typing import Protocol, cast

import httpx
import matplotlib.pyplot as plt
import pandas as pd
from ucimlrepo import fetch_ucirepo

# Pastikan modul lokal di folder backend selalu dapat diimpor
BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from questionnaire import (  # noqa: E402
    FEATURES,
    SYSTEM_PROMPT,
    user_prompt,
)
from ai import CALIBRATION_PATH, SCORING_VERSION, classification_payload, model_signature, parse_classification


class BinaryMetric(Protocol):
    def __call__(self, y_true: pd.Series, y_pred: pd.Series, *, zero_division: int = 0) -> float: ...


class ReportMetric(Protocol):
    def __call__(self, y_true: pd.Series, y_pred: pd.Series, *, labels: list[int], zero_division: int = 0) -> str: ...


# Gunakan scikit-learn jika tersedia; fallback otomatis ke numpy/matplotlib
# jika DLL scipy/sklearn diblokir oleh Windows Application Control (Smart App Control).
try:
    from sklearn.metrics import (
        ConfusionMatrixDisplay,
        accuracy_score,
        classification_report as _classification_report,
        f1_score as _f1_score,
        precision_score as _precision_score,
        recall_score as _recall_score,
    )
    from sklearn.model_selection import train_test_split
    USING_SKLEARN = True
except ImportError:
    from evaluation_fallback import (
        ConfusionMatrixDisplay,
        accuracy_score,
        classification_report as _classification_report,
        f1_score as _f1_score,
        precision_score as _precision_score,
        recall_score as _recall_score,
        train_test_split,
    )
    USING_SKLEARN = False

# sklearn does not ship complete annotations for these functions. Record the
# supported subset used here, including the documented numeric zero_division.
precision_score = cast(BinaryMetric, _precision_score)
recall_score = cast(BinaryMetric, _recall_score)
f1_score = cast(BinaryMetric, _f1_score)
classification_report = cast(ReportMetric, _classification_report)


# Konfigurasi
LLM_URL = "http://127.0.0.1:8080"
MODEL_NAME = "diawatch"
SEED = 42

# Untuk percobaan awal: 30
# Untuk evaluasi lebih representatif: 300
EVAL_SIZE = 30


def predict_qwen(client: httpx.Client, row: pd.Series) -> tuple[int | None, str]:
    """Mengirim fitur ke Qwen menggunakan prompt yang sama dengan backend DiaWatch."""
    features_dict = {key: row[key] for key in FEATURES}
    payload = classification_payload(features_dict)

    response = client.post(
        f"{LLM_URL}/v1/chat/completions",
        json=payload,
    )

    response.raise_for_status()

    result = response.json()
    output = result["choices"][0]["message"]["content"]

    raw = output.strip() if isinstance(output, str) else ""

    match = re.fullmatch(r"[01]", raw)

    if match:
        return int(raw), raw

    # Output selain label 0 atau 1 dinilai invalid.
    return None, raw


def main() -> None:
    if not USING_SKLEARN:
        print("PERINGATAN: memakai fallback NumPy; pembagian data tidak identik dengan scikit-learn/Colab.")
    print("Mengunduh dataset UCI...")

    uci = fetch_ucirepo(id=891)
    if uci.data is None or uci.data.features is None or uci.data.targets is None:
        raise RuntimeError("Dataset UCI (id=891) gagal dimuat atau kosong.")

    X = uci.data.features.copy()
    y = uci.data.targets.copy()

    df = X[FEATURES].copy()
    df["target"] = y["Diabetes_binary"].to_numpy()

    df = df.dropna(
        subset=FEATURES + ["target"]
    ).copy()

    for col in FEATURES + ["target"]:
        df[col] = pd.to_numeric(df[col], errors="raise")

    df["target"] = df["target"].astype(int)

    # Pembagian kandidat; kesamaan dengan data test Colab perlu diverifikasi
    # menggunakan notebook/manifest training, bukan hanya seed yang sama.
    _, test_pool = train_test_split(
        df,
        test_size=0.15,
        random_state=SEED,
        stratify=pd.Series(df["target"]),
    )

    test_pool = pd.DataFrame(test_pool)

    _, test_df = train_test_split(
        test_pool,
        test_size=300,
        random_state=SEED,
        stratify=pd.Series(test_pool["target"]),
    )

    test_df = pd.DataFrame(test_df).head(EVAL_SIZE).copy()

    print("Jumlah data pengujian:", len(test_df))
    print("Distribusi label:")
    print(test_df["target"].value_counts())

    records = []

    print("\nMemulai evaluasi Qwen lokal...\n")

    with httpx.Client(
        timeout=180.0,
        trust_env=False,
    ) as client:

        for number, (_, row) in enumerate(
            test_df.iterrows(),
            start=1,
        ):
            actual = int(cast(int, row["target"]))

            try:
                prediction, raw = predict_qwen(client, row)
            except Exception as error:
                prediction = None
                raw = f"ERROR: {str(error)}"

            records.append({
                "label_asli": actual,
                "prediksi_qwen": prediction,
                "output_mentah": raw,
            })

            print(
                f"[{number}/{len(test_df)}] "
                f"Asli={actual} | Prediksi={prediction}"
            )

    # Hitung metrik evaluasi
    results = pd.DataFrame(records)

    valid = results.dropna(
        subset=["prediksi_qwen"]
    ).copy()

    print("\n===== HASIL EVALUASI =====")

    total = len(results)
    valid_count = len(valid)
    invalid_count = total - valid_count

    print("Total data:", total)
    print("Output valid:", valid_count)
    print("Output invalid:", invalid_count)

    correct_count = sum(
        r["prediksi_qwen"] == r["label_asli"]
        for r in records
    )

    accuracy_all = (correct_count / total) if total > 0 else 0.0
    print(
        "Ketepatan seluruh permintaan:",
        f"{accuracy_all:.2%}",
    )

    png_path = BACKEND_DIR / "diawatch_confusion_matrix.png"
    csv_path = BACKEND_DIR / "diawatch_evaluasi_lokal.csv"

    if valid_count > 0:

        y_true = pd.Series(valid["label_asli"]).astype(int)
        y_pred = pd.Series(valid["prediksi_qwen"]).astype(int)

        print(
            "Accuracy (output valid):",
            round(accuracy_score(y_true, y_pred), 4),
        )

        print(
            "Precision kelas 1:",
            round(precision_score(
                y_true, y_pred, zero_division=0
            ), 4),
        )

        print(
            "Recall kelas 1:",
            round(recall_score(
                y_true, y_pred, zero_division=0
            ), 4),
        )

        print(
            "F1-Score kelas 1:",
            round(f1_score(
                y_true, y_pred, zero_division=0
            ), 4),
        )

        print("\nClassification Report:")
        print(classification_report(
            y_true,
            y_pred,
            labels=[0, 1],
            zero_division=0,
        ))

        disp = ConfusionMatrixDisplay.from_predictions(
            y_true,
            y_pred,
            labels=[0, 1],
            display_labels=["Kelas 0", "Kelas 1"],
            cmap="Blues",
        )

        disp.ax_.set_title(
            "Confusion Matrix Qwen DiaWatch Lokal"
        )

        plt.tight_layout()
        plt.savefig(
            png_path,
            dpi=150,
        )
        plt.close()

    # Simpan hasil untuk dianalisis lagi.
    results.to_csv(
        csv_path,
        index=False,
    )

    print("\nEvaluasi selesai.")
    print(f"Hasil disimpan ke {csv_path.name}.")
    if valid_count > 0:
        print(f"Confusion matrix disimpan ke {png_path.name}.")
    else:
        print("Tidak ada prediksi valid; confusion matrix tidak dibuat.")


def calibrate(train_csv: Path, calibration_csv: Path, test_csv: Path, revision: str,
              low: float, high: float, rationale: str, llm_url: str = LLM_URL,
              output: Path = CALIBRATION_PATH) -> None:
    """Fit on calibration data, evaluate on an independent test set, then export JSON.

    CSVs must be exported from the ORIGINAL training split, including row_id,
    all FEATURES, and Diabetes_binary (or target). No resplitting of UCI here.
    """
    import hashlib
    import json
    from datetime import datetime, timezone
    import numpy as np

    if not USING_SKLEARN:
        raise RuntimeError("Kalibrasi memerlukan scikit-learn yang berfungsi; gunakan environment Linux.")
    if not revision.strip() or not rationale.strip() or not 0 < low < high < 1:
        raise ValueError("Revisi model, alasan ambang, dan 0 < low < high < 1 wajib ditentukan.")
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score

    def read_split(path: Path) -> pd.DataFrame:
        if path.suffix.lower() != ".csv":
            raise ValueError("Data split harus berupa CSV")
        frame = pd.read_csv(path, dtype={"row_id": "string"})
        if "target" not in frame and "Diabetes_binary" in frame:
            frame["target"] = frame["Diabetes_binary"]
        required = FEATURES + ["row_id", "target"]
        if (frame.empty or not frame.columns.is_unique or not set(required).issubset(frame.columns)
                or pd.DataFrame(frame[required]).isna().to_numpy().any()):
            raise ValueError("CSV harus memiliki seluruh fitur, target, dan row_id tanpa nilai kosong")
        if frame["row_id"].duplicated().any():
            raise ValueError("row_id harus unik di setiap split")
        for key in FEATURES + ["target"]:
            frame[key] = pd.to_numeric(frame[key], errors="raise")
        if not pd.Series(frame["target"]).isin([0, 1]).to_numpy().all() or not np.isfinite(frame[FEATURES].to_numpy(dtype=float)).all():
            raise ValueError("Target harus 0/1 dan fitur harus numerik finite")
        return frame

    train, calibration, test = [read_split(p) for p in (train_csv, calibration_csv, test_csv)]
    ids = [set(frame["row_id"]) for frame in (train, calibration, test)]
    if any(ids[i] & ids[j] for i, j in ((0, 1), (0, 2), (1, 2))):
        raise ValueError("Data train, calibration, dan test tumpang tindih berdasarkan row_id")
    for frame in (calibration, test):
        if min(int(pd.Series(frame["target"]).eq(label).to_numpy().sum()) for label in (0, 1)) < 30:
            raise ValueError("Calibration dan test masing-masing memerlukan sedikitnya 30 baris per kelas")

    def collect(frame: pd.DataFrame, client: httpx.Client):
        values, labels = [], []
        for number, (_, row) in enumerate(frame.iterrows(), 1):
            features = {key: row[key] for key in FEATURES}
            response = client.post(f"{llm_url.rstrip('/')}/v1/chat/completions",
                                   json=classification_payload(features, scores=True))
            response.raise_for_status()
            label, value = parse_classification(response.json())
            if value is None:
                raise RuntimeError("llama.cpp tidak mengembalikan logprob kedua token 0 dan 1 pada posisi pertama; kalibrasi dihentikan.")
            values.append(value)
            labels.append(label)
            print(f"Scored {number}/{len(frame)}")
        return np.asarray(values).reshape(-1, 1), labels

    with httpx.Client(timeout=httpx.Timeout(180, connect=5), trust_env=False) as client:
        x_cal, _ = collect(calibration, client)
        x_test, predicted_labels = collect(test, client)
    calibrator = LogisticRegression(C=1e6, solver="lbfgs", random_state=SEED)
    calibrator.fit(x_cal, calibration["target"].astype(int))
    coefficient = float(np.asarray(calibrator.coef_)[0, 0])
    intercept = float(np.asarray(calibrator.intercept_).reshape(-1)[0])
    if coefficient <= 0:
        raise ValueError("Arah skor tidak konsisten dengan label; periksa data/model sebelum mengaktifkan skor")
    probability = np.asarray(calibrator.predict_proba(x_test))[:, 1]
    raw_probability = 1 / (1 + np.exp(-np.clip(x_test[:, 0], -700, 700)))
    y_test = pd.Series(test["target"]).astype(int)

    def bands(scores, targets):
        result = {}
        for name, mask in [("rendah", scores < low), ("sedang", (scores >= low) & (scores < high)),
                           ("tinggi", scores >= high)]:
            result[name] = {"count": int(mask.sum()),
                            "observed_positive_fraction": float(np.asarray(targets)[mask].mean()) if mask.any() else None}
        return result

    reliability = []
    for index in range(10):
        mask = (probability >= index / 10) & ((probability < (index + 1) / 10) if index < 9 else (probability <= 1))
        if mask.any():
            reliability.append({"count": int(mask.sum()), "mean_score": float(probability[mask].mean()),
                                "observed_fraction": float(np.asarray(y_test)[mask].mean())})
    before = float(brier_score_loss(y_test, raw_probability))
    after = float(brier_score_loss(y_test, probability))
    report = {"calibration_count": len(calibration), "test_count": len(test),
              "brier_before": before, "brier_after": after,
              "log_loss": float(log_loss(y_test, probability, labels=[0, 1])),
              "roc_auc": float(roc_auc_score(y_test, probability)),
              "label_accuracy": float(accuracy_score(y_test, predicted_labels)),
              "label_precision": precision_score(y_test, pd.Series(predicted_labels), zero_division=0),
              "label_recall": recall_score(y_test, pd.Series(predicted_labels), zero_division=0),
              "label_f1": f1_score(y_test, pd.Series(predicted_labels), zero_division=0),
              "reliability": reliability,
              "expected_calibration_error": sum(r["count"] * abs(r["mean_score"] - r["observed_fraction"])
                                                 for r in reliability) / len(test),
              "bands": bands(probability, y_test)}
    print(json.dumps(report, indent=2))
    if after > before or report["roc_auc"] <= 0.5:
        raise ValueError("Evaluasi belum mendukung aktivasi skor: Brier memburuk atau ROC AUC <= 0.5. Artefak lama tidak diubah.")
    artifact = {"version": SCORING_VERSION, "signature": model_signature(revision),
                "coefficient": coefficient, "intercept": intercept, "low_threshold": low,
                "high_threshold": high, "threshold_rationale": rationale, "evaluation": report,
                "created_at": datetime.now(timezone.utc).isoformat(), "score_is_clinical_risk": False,
                "split_sha256": {name: hashlib.sha256(path.read_bytes()).hexdigest()
                                 for name, path in zip(("train", "calibration", "test"), (train_csv, calibration_csv, test_csv))}}
    artifact["calibration_id"] = hashlib.sha256(json.dumps(artifact, sort_keys=True).encode()).hexdigest()[:16]
    temporary = output.with_suffix(".tmp")
    temporary.write_text(json.dumps(artifact, indent=2), encoding="utf-8")
    temporary.replace(output)
    print(f"Saved {output.name}. Tinjau hasil evaluasi dan ambang sebelum pemakaian akademik.")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--calibrate", action="store_true")
    parser.add_argument("--train-csv", type=Path)
    parser.add_argument("--calibration-csv", type=Path)
    parser.add_argument("--test-csv", type=Path)
    parser.add_argument("--model-revision")
    parser.add_argument("--low-threshold", type=float)
    parser.add_argument("--high-threshold", type=float)
    parser.add_argument("--threshold-rationale")
    parser.add_argument("--llm-url", default=LLM_URL)
    args = parser.parse_args()
    if args.calibrate:
        if any(value is None for value in (args.train_csv, args.calibration_csv, args.test_csv, args.model_revision,
                                           args.low_threshold, args.high_threshold, args.threshold_rationale)):
            parser.error("Mode --calibrate memerlukan ketiga CSV, revisi model, kedua ambang, dan alasan ambang")
        calibrate(args.train_csv, args.calibration_csv, args.test_csv, args.model_revision,
                  args.low_threshold, args.high_threshold, args.threshold_rationale, args.llm_url)
    else:
        LLM_URL = args.llm_url
        main()
