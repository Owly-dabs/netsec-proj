import numpy as np
import pytest

from swatad.models.base import pad_scores
from swatad.models.baselines import IForestDetector, PCADetector
from swatad.models.gdn import GDNDetector
from swatad.models.usad import USADDetector

SPIKE_T = 400


def make_sine(T: int = 600, N: int = 4, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    t = np.arange(T)[:, None]
    phase = rng.uniform(0, 2 * np.pi, N)
    x = 0.5 + 0.4 * np.sin(2 * np.pi * t / 50 + phase) + 0.01 * rng.standard_normal((T, N))
    return x.astype(np.float32)


@pytest.fixture
def data():
    train, val = make_sine(seed=0), make_sine(T=200, seed=1)
    test = make_sine(seed=2)
    return train, val, test


def test_score_alignment():
    np.testing.assert_array_equal(pad_scores(np.arange(5.0), 8), [0, 0, 0, 0, 1, 2, 3, 4])


@pytest.mark.parametrize("det", [PCADetector(), IForestDetector()], ids=["pca", "iforest"])
def test_baseline_detects_spike(det, data):
    train, val, test = data
    test[SPIKE_T] += 5
    s = det.fit(train, val).score(test)
    assert s.shape == (len(test),)
    assert int(np.argmax(s)) == SPIKE_T


def test_usad_detects_spike(data):
    train, val, test = data
    test[SPIKE_T] += 5
    det = USADDetector(window=12, epochs=5, batch=64).fit(train, val)
    s = det.score(test)
    assert s.shape == (len(test),)
    assert SPIKE_T <= int(np.argmax(s)) < SPIKE_T + 12


def test_usad_loss_decreases(data):
    train, val, _ = data
    det = USADDetector(window=12, epochs=5, batch=64).fit(train, val)
    assert det.history[0] > det.history[-1]


def test_gdn_detects_spike_and_attributes(data):
    train, val, test = data
    test[SPIKE_T, 2] += 5
    det = GDNDetector(window=5, embed_dim=16, topk=2, epochs=5, batch=32).fit(train, val)
    s = det.score(test)
    assert s.shape == (len(test),)
    # the spike stays in the input window for `window` later forecasts and the
    # score is a trailing 4-step mean, so the peak may lag; it must never lead
    assert SPIKE_T <= int(np.argmax(s)) <= SPIKE_T + 5 + 3
    sensor = det.sensor_scores(test)
    assert int(sensor[SPIKE_T].argmax()) == 2
    assert sensor[:SPIKE_T, 2].max() < sensor[SPIKE_T, 2]


def test_gdn_graph_topk(data):
    train, val, _ = data
    det = GDNDetector(window=5, embed_dim=16, topk=2, epochs=1).fit(train, val)
    adj = det.adjacency()
    assert adj.shape == (4, 4)
    assert (adj.sum(axis=1) == 2).all()
    assert not adj.diagonal().any()
