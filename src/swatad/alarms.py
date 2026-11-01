"""Plant-aware alarm logic (original modification).

Instead of one global threshold on the max sensor score, each process stage
(SWaT P1-P6, WADI 1/2/3) gets its own threshold from validation data, so an
alarm also says *which stage* looks attacked. k-of-n persistence suppresses
one-off spikes.
"""
import re

import numpy as np


def stage_of(column: str) -> int:
    """Process stage = first digit in the tag name (FIT101 -> 1, 2B_AIT_001_PV -> 2).

    Tags with no digit (WADI's LEAK_DIFF_PRESSURE etc.) are plant-wide: stage 0.
    """
    m = re.search(r"\d", column)
    return int(m.group()) if m else 0


def _stage_max(sensor_scores: np.ndarray, columns: list[str]) -> tuple[np.ndarray, list[int]]:
    stage_ids = np.array([stage_of(c) for c in columns])
    stages = sorted(set(stage_ids.tolist()))
    return np.stack([sensor_scores[:, stage_ids == s].max(axis=1) for s in stages], axis=1), stages


def stage_thresholds(val_sensor_scores: np.ndarray, columns: list[str], q: float = 0.999) -> dict[int, float]:
    per_stage, stages = _stage_max(val_sensor_scores, columns)
    return {s: float(np.quantile(per_stage[:, i], q)) for i, s in enumerate(stages)}


def stage_alarms(sensor_scores: np.ndarray, columns: list[str],
                 thresholds: dict[int, float]) -> tuple[np.ndarray, list[int]]:
    """(T, n_stages) boolean alarms and the stage id of each column."""
    per_stage, stages = _stage_max(sensor_scores, columns)
    return per_stage >= np.array([thresholds[s] for s in stages]), stages


def k_of_n(pred: np.ndarray, k: int, n: int) -> np.ndarray:
    """Alarm at t when at least k of the last n steps (t-n+1..t) alarmed."""
    c = np.concatenate([[0], np.cumsum(np.asarray(pred, dtype=int))])
    t = np.arange(1, len(pred) + 1)
    window_sum = c[t] - c[np.maximum(t - n, 0)]
    return (window_sum >= k).astype(np.int8)
