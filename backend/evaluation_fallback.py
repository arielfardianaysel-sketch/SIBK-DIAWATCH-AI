"""NumPy fallback for exploratory evaluation when sklearn cannot be imported.

The split algorithm is deterministic but is NOT identical to sklearn/Colab.
"""
from types import SimpleNamespace

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd


def train_test_split(
    data: pd.DataFrame,
    test_size: float | int = 0.25,
    random_state: int = 42,
    stratify: pd.Series | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    rng = np.random.RandomState(random_state)
    n_total = len(data)
    n_test = int(round(n_total * test_size)) if isinstance(test_size, float) else int(test_size)

    if stratify is None:
        perm = rng.permutation(n_total)
        test_idx = perm[:n_test]
        train_idx = perm[n_test:]
        return data.iloc[train_idx].copy(), data.iloc[test_idx].copy()

    strat_series = pd.Series(stratify).reset_index(drop=True)
    class_counts = strat_series.value_counts()
    train_indices = []
    test_indices = []

    allocated = 0
    classes = list(class_counts.index)
    for i, cls_val in enumerate(classes):
        cls_pos = np.flatnonzero(strat_series.to_numpy() == cls_val)
        cls_perm = rng.permutation(cls_pos)
        if i == len(classes) - 1:
            cls_n_test = max(0, min(len(cls_perm), n_test - allocated))
        else:
            cls_n_test = int(round(n_test * (len(cls_perm) / n_total)))
            allocated += cls_n_test
        test_indices.extend(cls_perm[:cls_n_test].tolist())
        train_indices.extend(cls_perm[cls_n_test:].tolist())

    rng.shuffle(train_indices)
    rng.shuffle(test_indices)
    return data.iloc[train_indices].copy(), data.iloc[test_indices].copy()

def accuracy_score(y_true, y_pred) -> float:
    yt = np.asarray(y_true, dtype=int)
    yp = np.asarray(y_pred, dtype=int)
    return float((yt == yp).mean()) if len(yt) > 0 else 0.0

def precision_score(y_true, y_pred, pos_label: int = 1, zero_division: int = 0) -> float:
    yt = np.asarray(y_true, dtype=int)
    yp = np.asarray(y_pred, dtype=int)
    tp = int(((yt == pos_label) & (yp == pos_label)).sum())
    fp = int(((yt != pos_label) & (yp == pos_label)).sum())
    return float(tp / (tp + fp)) if (tp + fp) > 0 else float(zero_division)

def recall_score(y_true, y_pred, pos_label: int = 1, zero_division: int = 0) -> float:
    yt = np.asarray(y_true, dtype=int)
    yp = np.asarray(y_pred, dtype=int)
    tp = int(((yt == pos_label) & (yp == pos_label)).sum())
    fn = int(((yt == pos_label) & (yp != pos_label)).sum())
    return float(tp / (tp + fn)) if (tp + fn) > 0 else float(zero_division)

def f1_score(y_true, y_pred, pos_label: int = 1, zero_division: int = 0) -> float:
    p = precision_score(y_true, y_pred, pos_label=pos_label, zero_division=zero_division)
    r = recall_score(y_true, y_pred, pos_label=pos_label, zero_division=zero_division)
    return float(2 * p * r / (p + r)) if (p + r) > 0 else float(zero_division)

def classification_report(y_true, y_pred, labels=None, zero_division: int = 0) -> str:
    if labels is None:
        labels = [0, 1]
    yt = np.asarray(y_true, dtype=int)
    yp = np.asarray(y_pred, dtype=int)
    total_n = len(yt)
    lines = [f"{'':>14} {'precision':>10} {'recall':>10} {'f1-score':>10} {'support':>10}", ""]
    precisions, recalls, f1s, supports = [], [], [], []
    for lbl in labels:
        p = precision_score(yt, yp, pos_label=lbl, zero_division=zero_division)
        r = recall_score(yt, yp, pos_label=lbl, zero_division=zero_division)
        f = f1_score(yt, yp, pos_label=lbl, zero_division=zero_division)
        s = int((yt == lbl).sum())
        precisions.append(p)
        recalls.append(r)
        f1s.append(f)
        supports.append(s)
        lines.append(f"{str(lbl):>14} {p:>10.2f} {r:>10.2f} {f:>10.2f} {s:>10d}")
    lines.append("")
    acc = accuracy_score(yt, yp)
    lines.append(f"{'accuracy':>14} {'':>10} {'':>10} {acc:>10.2f} {total_n:>10d}")
    macro_p = float(np.mean(precisions)) if precisions else 0.0
    macro_r = float(np.mean(recalls)) if recalls else 0.0
    macro_f = float(np.mean(f1s)) if f1s else 0.0
    lines.append(f"{'macro avg':>14} {macro_p:>10.2f} {macro_r:>10.2f} {macro_f:>10.2f} {total_n:>10d}")
    if total_n > 0:
        w_p = float(np.average(precisions, weights=supports))
        w_r = float(np.average(recalls, weights=supports))
        w_f = float(np.average(f1s, weights=supports))
    else:
        w_p = w_r = w_f = 0.0
    lines.append(f"{'weighted avg':>14} {w_p:>10.2f} {w_r:>10.2f} {w_f:>10.2f} {total_n:>10d}")
    return "\n".join(lines)

class ConfusionMatrixDisplay:
    @staticmethod
    def from_predictions(y_true, y_pred, labels=None, display_labels=None, cmap="Blues"):
        if labels is None:
            labels = [0, 1]
        if display_labels is None:
            display_labels = [str(lbl) for lbl in labels]
        yt = np.asarray(y_true, dtype=int)
        yp = np.asarray(y_pred, dtype=int)
        cm = np.zeros((len(labels), len(labels)), dtype=int)
        for i, true_lbl in enumerate(labels):
            for j, pred_lbl in enumerate(labels):
                cm[i, j] = int(((yt == true_lbl) & (yp == pred_lbl)).sum())
        fig, ax = plt.subplots(figsize=(6, 5))
        im = ax.imshow(cm, interpolation="nearest", cmap=cmap)
        fig.colorbar(im, ax=ax)
        ax.set(
            xticks=np.arange(len(labels)),
            yticks=np.arange(len(labels)),
            xticklabels=display_labels,
            yticklabels=display_labels,
            ylabel="True label",
            xlabel="Predicted label",
        )
        thresh = cm.max() / 2.0 if cm.size > 0 else 0
        for i in range(cm.shape[0]):
            for j in range(cm.shape[1]):
                ax.text(
                    j,
                    i,
                    format(cm[i, j], "d"),
                    ha="center",
                    va="center",
                    color="white" if cm[i, j] > thresh else "black",
                )
        return SimpleNamespace(figure_=fig, ax_=ax, confusion_matrix=cm)
