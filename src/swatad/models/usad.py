"""USAD: UnSupervised Anomaly Detection on multivariate time series.

Audibert et al., KDD 2020. One encoder, two decoders trained adversarially;
the score mixes plain and adversarial reconstruction error.
"""
import numpy as np
import torch
from torch import nn

from ..data import sliding_windows
from .base import pad_scores, seed_everything


def _mlp(sizes: list[int], last: nn.Module) -> nn.Sequential:
    layers: list[nn.Module] = []
    for i, (a, b) in enumerate(zip(sizes[:-1], sizes[1:])):
        layers += [nn.Linear(a, b), nn.ReLU() if i < len(sizes) - 2 else last]
    return nn.Sequential(*layers)


class _USAD(nn.Module):
    def __init__(self, w_size: int, latent: int):
        super().__init__()
        enc = [w_size, w_size // 2, w_size // 4, latent]
        self.encoder = _mlp(enc, nn.ReLU())
        self.decoder1 = _mlp(enc[::-1], nn.Sigmoid())
        self.decoder2 = _mlp(enc[::-1], nn.Sigmoid())


class USADDetector:
    name = "usad"

    def __init__(self, window: int = 12, latent: int = 40, epochs: int = 70, batch: int = 512,
                 alpha: float = 0.5, beta: float = 0.5, lr: float = 1e-3, seed: int = 0):
        self.window, self.latent, self.epochs, self.batch = window, latent, epochs, batch
        self.alpha, self.beta, self.lr, self.seed = alpha, beta, lr, seed
        self.history: list[float] = []

    def _flat(self, x: np.ndarray) -> torch.Tensor:
        w = sliding_windows(x, self.window)
        return torch.from_numpy(np.ascontiguousarray(w).reshape(len(w), -1))

    def fit(self, train: np.ndarray, val: np.ndarray) -> "USADDetector":
        seed_everything(self.seed)
        data = self._flat(train)
        self.model = m = _USAD(data.shape[1], self.latent)
        opt1 = torch.optim.Adam([*m.encoder.parameters(), *m.decoder1.parameters()], lr=self.lr)
        opt2 = torch.optim.Adam([*m.encoder.parameters(), *m.decoder2.parameters()], lr=self.lr)
        for epoch in range(1, self.epochs + 1):
            total = 0.0
            for idx in torch.randperm(len(data)).split(self.batch):
                w = data[idx]
                z = m.encoder(w)
                w1, w2 = m.decoder1(z), m.decoder2(z)
                w3 = m.decoder2(m.encoder(w1))
                loss1 = torch.mean((w - w1) ** 2) / epoch + (1 - 1 / epoch) * torch.mean((w - w3) ** 2)
                opt1.zero_grad()
                loss1.backward()
                opt1.step()

                z = m.encoder(w)
                w1, w2 = m.decoder1(z), m.decoder2(z)
                w3 = m.decoder2(m.encoder(w1))
                loss2 = torch.mean((w - w2) ** 2) / epoch - (1 - 1 / epoch) * torch.mean((w - w3) ** 2)
                opt2.zero_grad()
                loss2.backward()
                opt2.step()
                total += loss1.item() * len(idx)
            self.history.append(total / len(data))
        return self

    @torch.no_grad()
    def score(self, x: np.ndarray) -> np.ndarray:
        m = self.model.eval()
        out = []
        for w in self._flat(x).split(4096):
            w1 = m.decoder1(m.encoder(w))
            w3 = m.decoder2(m.encoder(w1))
            s = self.alpha * ((w - w1) ** 2).mean(1) + self.beta * ((w - w3) ** 2).mean(1)
            out.append(s)
        return pad_scores(torch.cat(out).numpy(), len(x))
