"""Thresholds and detection metrics.

Besides the usual point-wise scores we report point-adjusted scores (to show
how much they inflate results), event-level precision/recall, composite F1
(Garg et al. 2021: point-wise precision x event-wise recall) and time-to-detect.
"""
import numpy as np
from sklearn.metrics import average_precision_score, precision_recall_curve, roc_auc_score


def segments(binary: np.ndarray) -> list[tuple[int, int]]:
    """Half-open [start, end) runs of ones."""
    b = np.concatenate([[0], np.asarray(binary, dtype=np.int8), [0]])
    edges = np.flatnonzero(np.diff(b))
    return list(zip(edges[::2].tolist(), edges[1::2].tolist()))


def point_adjust(pred: np.ndarray, labels: np.ndarray) -> np.ndarray:
    """Mark a whole attack segment as detected if any point inside it is."""
    out = np.asarray(pred, dtype=np.int8).copy()
    for s, e in segments(labels):
        if out[s:e].any():
            out[s:e] = 1
    return out


def threshold_best_f1(scores: np.ndarray, labels: np.ndarray) -> float:
    """Oracle threshold (uses labels): what most papers report."""
    p, r, t = precision_recall_curve(labels, scores)
    f1 = 2 * p * r / np.maximum(p + r, 1e-12)
    return float(t[np.argmax(f1[:-1])])


def threshold_val_max(val_scores: np.ndarray) -> float:
    return float(np.max(val_scores))


def threshold_val_quantile(val_scores: np.ndarray, q: float = 0.999) -> float:
    return float(np.quantile(val_scores, q))


def _prf(pred: np.ndarray, labels: np.ndarray) -> tuple[float, float, float]:
    tp = float(np.sum(pred & labels))
    p = tp / pred.sum() if pred.sum() else 0.0
    r = tp / labels.sum() if labels.sum() else 0.0
    f = 2 * p * r / (p + r) if p + r else 0.0
    return p, r, f


def evaluate(scores: np.ndarray, labels: np.ndarray, threshold: float, step_seconds: int = 10) -> dict:
    labels = np.asarray(labels, dtype=np.int8)
    pred = (np.asarray(scores) >= threshold).astype(np.int8)
    p, r, f = _prf(pred, labels)
    pa_p, pa_r, pa_f = _prf(point_adjust(pred, labels), labels)

    events = segments(labels)
    alarms = segments(pred)
    ttd = []
    for s, e in events:
        hits = np.flatnonzero(pred[s:e])
        if hits.size:
            ttd.append(hits[0] * step_seconds)
    ev_r = len(ttd) / len(events) if events else float("nan")
    ev_p = (
        sum(labels[s:e].any() for s, e in alarms) / len(alarms) if alarms else float("nan")
    )
    comp = 2 * p * ev_r / (p + ev_r) if events and p + ev_r else (0.0 if events else float("nan"))
    two_classes = 0 < labels.sum() < len(labels)
    return {
        "threshold": float(threshold),
        "precision": p, "recall": r, "f1": f,
        "pa_precision": pa_p, "pa_recall": pa_r, "pa_f1": pa_f,
        "event_recall": ev_r, "event_precision": ev_p, "composite_f1": comp,
        "ttd_median_s": float(np.median(ttd)) if ttd else float("nan"),
        "ttd_mean_s": float(np.mean(ttd)) if ttd else float("nan"),
        "n_events": len(events), "n_detected": len(ttd), "n_alarm_segments": len(alarms),
        "roc_auc": float(roc_auc_score(labels, scores)) if two_classes else float("nan"),
        "pr_auc": float(average_precision_score(labels, scores)) if two_classes else float("nan"),
    }
