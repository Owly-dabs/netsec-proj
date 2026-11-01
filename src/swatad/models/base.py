from typing import Protocol

import numpy as np
import torch


class Detector(Protocol):
    name: str

    def fit(self, train: np.ndarray, val: np.ndarray) -> "Detector": ...

    def score(self, x: np.ndarray) -> np.ndarray:
        """One anomaly score per time step, shape (T,)."""
        ...


def pad_scores(window_scores: np.ndarray, total_len: int) -> np.ndarray:
    """Front-pad with the first score so scores align with time steps."""
    pad = total_len - len(window_scores)
    return np.concatenate([np.full(pad, window_scores[0]), window_scores])


def seed_everything(seed: int) -> None:
    np.random.seed(seed)
    torch.manual_seed(seed)
