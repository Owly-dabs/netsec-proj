"""Load processed Parquet and apply the GDN preprocessing protocol.

Protocol: median-downsample by 10, drop the first 2160 downsampled train rows
(start-up transient), hold out the last 10% of train as validation, min-max
scale with train statistics (test values are not clipped).
"""
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import numpy as np
import pandas as pd

PROCESSED = Path("data/processed")


@dataclass
class Split:
    train: np.ndarray
    val: np.ndarray
    test: np.ndarray
    test_labels: np.ndarray
    columns: list[str]


def downsample_median(
    x: np.ndarray, labels: np.ndarray | None, factor: int
) -> tuple[np.ndarray, np.ndarray | None]:
    """Median of non-overlapping blocks; a block is an attack if >= 50% of its rows are."""
    n = len(x) // factor
    xd = np.median(x[: n * factor].reshape(n, factor, -1), axis=1)
    if labels is None:
        return xd, None
    ld = (labels[: n * factor].reshape(n, factor).mean(axis=1) >= 0.5).astype(np.int8)
    return xd, ld


def minmax_fit(x: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    return x.min(axis=0), x.max(axis=0)


def minmax_apply(x: np.ndarray, lo: np.ndarray, hi: np.ndarray) -> np.ndarray:
    return ((x - lo) / np.where(hi > lo, hi - lo, 1)).astype(np.float32)


def sliding_windows(x: np.ndarray, w: int) -> np.ndarray:
    """Read-only (T-w+1, w, N) view over x."""
    return np.moveaxis(np.lib.stride_tricks.sliding_window_view(x, w, axis=0), -1, 1)


def drifting_columns(val_scaled: np.ndarray, tol: float = 1.5) -> np.ndarray:
    """Columns whose *validation* values already leave the train range by > tol x.

    Uses normal data only (no test data, no labels): a sensor that drifts
    before any attack is a data-quality fault, not an attack signal.
    """
    return np.abs(val_scaled).max(axis=0) > tol


def _clean_wadi(train: pd.DataFrame, test: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    sig = [c for c in train.columns if c != "label" and c in test.columns]
    tr = train[sig]
    keep = [c for c in sig if tr[c].notna().any() and tr[c].nunique(dropna=True) > 1]
    fill = lambda df: df[keep].ffill().fillna(0.0)
    return fill(train), fill(test)


def load_split(
    dataset: Literal["swat", "wadi"],
    downsample: int = 10,
    drop_head: int = 2160,
    val_frac: float = 0.1,
    drift_tol: float | None = None,
) -> Split:
    train_df = pd.read_parquet(PROCESSED / f"{dataset}_train.parquet")
    test_df = pd.read_parquet(PROCESSED / f"{dataset}_test.parquet")
    labels = test_df.pop("label").to_numpy()
    train_df = train_df.drop(columns="label")
    if dataset == "wadi":
        train_df, test_df = _clean_wadi(train_df, test_df)
    columns = list(train_df.columns)

    train, _ = downsample_median(train_df.to_numpy(np.float32), None, downsample)
    test, test_labels = downsample_median(test_df.to_numpy(np.float32), labels, downsample)
    train = train[drop_head:]
    n_val = int(len(train) * val_frac)
    train, val = train[:-n_val], train[-n_val:]

    lo, hi = minmax_fit(train)
    train, val, test = (minmax_apply(a, lo, hi) for a in (train, val, test))
    if drift_tol is not None:
        keep = ~drifting_columns(val, drift_tol)
        train, val, test = train[:, keep], val[:, keep], test[:, keep]
        columns = [c for c, k in zip(columns, keep) if k]
    return Split(train=train, val=val, test=test, test_labels=test_labels, columns=columns)
