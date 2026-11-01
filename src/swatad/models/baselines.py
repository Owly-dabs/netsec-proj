"""Classical baselines: PCA reconstruction error and Isolation Forest."""
import numpy as np
from sklearn.decomposition import PCA
from sklearn.ensemble import IsolationForest


class PCADetector:
    name = "pca"

    def __init__(self, var: float = 0.95):
        self.pca = PCA(n_components=var, svd_solver="full")

    def fit(self, train: np.ndarray, val: np.ndarray) -> "PCADetector":
        self.pca.fit(train)
        return self

    def score(self, x: np.ndarray) -> np.ndarray:
        recon = self.pca.inverse_transform(self.pca.transform(x))
        return np.square(x - recon).sum(axis=1)


class IForestDetector:
    name = "iforest"

    def __init__(self, n_estimators: int = 200, seed: int = 0):
        self.model = IsolationForest(n_estimators=n_estimators, random_state=seed, n_jobs=-1)

    def fit(self, train: np.ndarray, val: np.ndarray) -> "IForestDetector":
        self.model.fit(train)
        return self

    def score(self, x: np.ndarray) -> np.ndarray:
        return -self.model.score_samples(x)
