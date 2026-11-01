"""GDN: Graph Deviation Network (Deng & Hooi, AAAI 2021).

Each sensor gets a learned embedding; a sensor's neighbours are the top-k most
similar embeddings. A graph-attention layer forecasts every sensor's next value
from its neighbours' recent history. The anomaly score is the largest
robust-normalised forecast error across sensors, smoothed over time.

Dense N x N implementation (no torch_geometric); N <= ~130 for SWaT/WADI.
"""
import copy
from typing import Literal

import numpy as np
import torch
from torch import nn
import torch.nn.functional as F

from ..data import sliding_windows
from .base import seed_everything


class _GDN(nn.Module):
    def __init__(self, n_nodes: int, window: int, dim: int, topk: int, dropout: float = 0.2):
        super().__init__()
        self.topk = topk
        self.embedding = nn.Embedding(n_nodes, dim)
        self.lin = nn.Linear(window, dim, bias=False)
        self.att_i = nn.Parameter(torch.empty(2 * dim))
        self.att_j = nn.Parameter(torch.empty(2 * dim))
        self.gnn_bias = nn.Parameter(torch.zeros(dim))
        self.bn_gnn = nn.BatchNorm1d(dim)
        self.bn_out = nn.BatchNorm1d(dim)
        self.dropout = nn.Dropout(dropout)
        self.out = nn.Linear(dim, 1)
        nn.init.kaiming_uniform_(self.embedding.weight, a=5 ** 0.5)
        nn.init.normal_(self.att_i, std=0.1)
        nn.init.normal_(self.att_j, std=0.1)

    def adjacency(self) -> torch.Tensor:
        """Boolean (N, N): row i marks the top-k most cosine-similar other sensors."""
        v = F.normalize(self.embedding.weight.detach(), dim=1)
        sim = v @ v.T
        sim.fill_diagonal_(-float("inf"))
        idx = sim.topk(self.topk, dim=1).indices
        adj = torch.zeros_like(sim, dtype=torch.bool)
        adj.scatter_(1, idx, True)
        return adj

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """x: (B, N, window) -> next-step forecast (B, N)."""
        B, N, _ = x.shape
        emb = self.embedding.weight
        wx = self.lin(x)                                        # (B, N, d)
        g = torch.cat([wx, emb.expand(B, -1, -1)], dim=-1)      # (B, N, 2d)
        e = F.leaky_relu((g @ self.att_i)[:, :, None] + (g @ self.att_j)[:, None, :], 0.2)
        allowed = self.adjacency() | torch.eye(N, dtype=torch.bool)
        alpha = torch.softmax(e.masked_fill(~allowed, -float("inf")), dim=-1)
        z = alpha @ wx + self.gnn_bias                          # (B, N, d)
        z = F.relu(self.bn_gnn(z.reshape(B * N, -1))).reshape(B, N, -1)
        h = z * emb
        h = F.relu(self.bn_out(h.permute(0, 2, 1))).permute(0, 2, 1)
        return self.out(self.dropout(h)).squeeze(-1)


class GDNDetector:
    name = "gdn"

    def __init__(self, window: int = 5, embed_dim: int = 64, topk: int = 15, epochs: int = 50,
                 patience: int = 10, batch: int = 32, lr: float = 1e-3, smooth: int = 3,
                 norm_stats: Literal["val", "test"] = "val", seed: int = 0):
        self.window, self.embed_dim, self.topk = window, embed_dim, topk
        self.epochs, self.patience, self.batch, self.lr = epochs, patience, batch, lr
        self.smooth, self.norm_stats, self.seed = smooth, norm_stats, seed
        self.history: list[tuple[float, float]] = []

    def _xy(self, x: np.ndarray) -> tuple[torch.Tensor, torch.Tensor]:
        w = sliding_windows(x[:-1], self.window)               # (T-w, w, N)
        xs = torch.from_numpy(np.ascontiguousarray(w.transpose(0, 2, 1)))
        return xs, torch.from_numpy(x[self.window:])

    @torch.no_grad()
    def _predict(self, xs: torch.Tensor) -> torch.Tensor:
        self.model.eval()
        return torch.cat([self.model(b) for b in xs.split(1024)])

    def fit(self, train: np.ndarray, val: np.ndarray) -> "GDNDetector":
        seed_everything(self.seed)
        self.model = _GDN(train.shape[1], self.window, self.embed_dim, self.topk)
        opt = torch.optim.Adam(self.model.parameters(), lr=self.lr)
        xs, ys = self._xy(train)
        vx, vy = self._xy(val)
        best, best_state, bad = float("inf"), None, 0
        for _ in range(self.epochs):
            self.model.train()
            total = 0.0
            for idx in torch.randperm(len(xs)).split(self.batch):
                loss = F.mse_loss(self.model(xs[idx]), ys[idx])
                opt.zero_grad()
                loss.backward()
                opt.step()
                total += loss.item() * len(idx)
            val_loss = F.mse_loss(self._predict(vx), vy).item()
            self.history.append((total / len(xs), val_loss))
            if val_loss < best:
                best, best_state, bad = val_loss, copy.deepcopy(self.model.state_dict()), 0
            else:
                bad += 1
                if bad >= self.patience:
                    break
        self.model.load_state_dict(best_state)
        val_err = self._abs_err(val)
        self._med = np.median(val_err, axis=0)
        q75, q25 = np.percentile(val_err, [75, 25], axis=0)
        self._iqr = q75 - q25
        return self

    def _abs_err(self, x: np.ndarray) -> np.ndarray:
        xs, ys = self._xy(x)
        return (self._predict(xs) - ys).abs().numpy()

    def adjacency(self) -> np.ndarray:
        return self.model.adjacency().numpy()

    def sensor_scores(self, x: np.ndarray) -> np.ndarray:
        """Per-sensor robust-normalised forecast error, (T, N)."""
        err = self._abs_err(x)
        if self.norm_stats == "test":   # what the official code does
            med = np.median(err, axis=0)
            q75, q25 = np.percentile(err, [75, 25], axis=0)
            iqr = q75 - q25
        else:
            med, iqr = self._med, self._iqr
        norm = (err - med) / (np.abs(iqr) + 1e-2)
        pad = np.repeat(norm[:1], len(x) - len(norm), axis=0)
        return np.concatenate([pad, norm])

    def score(self, x: np.ndarray) -> np.ndarray:
        s = self.sensor_scores(x).max(axis=1)
        k = self.smooth + 1                       # official: mean of current + 3 previous
        smoothed = np.convolve(s, np.ones(k) / k, mode="full")[: len(s)]
        smoothed[: k - 1] = s[: k - 1]
        return smoothed
