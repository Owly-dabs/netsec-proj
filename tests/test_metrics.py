import math

import numpy as np
import pytest

from swatad.metrics import evaluate, point_adjust, segments, threshold_best_f1, threshold_val_max, threshold_val_quantile

LABELS = np.array([0, 0, 1, 1, 1, 0, 0, 1, 1, 0])
PRED = np.array([0, 0, 0, 1, 0, 0, 1, 0, 0, 0])


def test_segments():
    assert segments(LABELS) == [(2, 5), (7, 9)]
    assert segments(np.zeros(4)) == []
    assert segments(np.ones(3)) == [(0, 3)]


def test_point_adjust():
    np.testing.assert_array_equal(point_adjust(PRED, LABELS), [0, 0, 1, 1, 1, 0, 1, 0, 0, 0])


def test_evaluate_known_values():
    m = evaluate(PRED.astype(float), LABELS, threshold=0.5)
    assert m["precision"] == pytest.approx(0.5)
    assert m["recall"] == pytest.approx(0.2)
    assert m["pa_recall"] == pytest.approx(0.6)
    assert m["event_recall"] == pytest.approx(0.5)
    assert m["event_precision"] == pytest.approx(0.5)
    assert m["composite_f1"] == pytest.approx(0.5)
    assert m["ttd_median_s"] == pytest.approx(10.0)
    assert m["n_events"] == 2 and m["n_detected"] == 1 and m["n_alarm_segments"] == 2


def test_metrics_no_events():
    m = evaluate(np.array([0.1, 0.9, 0.2]), np.zeros(3, dtype=int), threshold=0.5)
    assert math.isnan(m["event_recall"])
    assert m["f1"] == 0.0
    assert math.isnan(m["roc_auc"])


def test_best_f1_threshold():
    t = threshold_best_f1(np.array([0.1, 0.2, 0.9, 0.8]), np.array([0, 0, 1, 1]))
    assert 0.2 < t <= 0.8


def test_val_thresholds():
    v = np.arange(1001, dtype=float)
    assert threshold_val_max(v) == 1000.0
    assert threshold_val_quantile(v, 0.999) == pytest.approx(999.0)
