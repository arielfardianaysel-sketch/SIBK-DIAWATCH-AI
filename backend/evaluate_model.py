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

from questionnaire import FEATURES  # noqa: E402
from ai import classification_payload


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


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--llm-url", default=LLM_URL)
    args = parser.parse_args()
    LLM_URL = args.llm_url
    main()
