from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from swatad.convert import normalise_swat_label
from swatad.data import downsample_median, drifting_columns, load_split, minmax_apply, minmax_fit, sliding_windows


def test_downsample_median():
    x = np.arange(20, dtype=np.float32).reshape(20, 1)
    labels = np.array([0] * 14 + [1] * 6, dtype=np.int8)
    xd, ld = downsample_median(x, labels, 10)
    np.testing.assert_allclose(xd[:, 0], [4.5, 14.5])
    np.testing.assert_array_equal(ld, [0, 1])


def test_downsample_drops_partial_block():
    xd, ld = downsample_median(np.zeros((25, 2)), None, 10)
    assert xd.shape == (2, 2) and ld is None


def test_minmax_constant_column():
    x = np.array([[3.0, 0.0], [3.0, 2.0]])
    lo, hi = minmax_fit(x)
    out = minmax_apply(x, lo, hi)
    assert np.isfinite(out).all()
    np.testing.assert_allclose(out[:, 0], 0.0)
    np.testing.assert_allclose(out[:, 1], [0.0, 1.0])


def test_swat_label_variants():
    out = normalise_swat_label(pd.Series(["Normal", " Attack", "A ttack"]))
    np.testing.assert_array_equal(out, [0, 1, 1])


def test_windows_is_view():
    x = np.zeros((100, 3))
    w = sliding_windows(x, 5)
    assert w.shape == (96, 5, 3)
    assert np.shares_memory(w, x)


def test_drifting_columns_uses_validation_only():
    val = np.array([[0.5, 0.2], [0.9, 4.0]])
    assert drifting_columns(val, tol=1.5).tolist() == [False, True]


@pytest.mark.skipif(not Path("data/processed/wadi_test.parquet").exists(), reason="parquet not built")
def test_drift_guard_drops_wadi_analyser():
    s = load_split("wadi", drift_tol=1.5)
    assert "2B_AIT_002_PV" not in s.columns
    assert s.train.shape[1] == s.test.shape[1] == len(s.columns) == 92


@pytest.mark.skipif(not Path("data/processed/swat_test.parquet").exists(), reason="parquet not built")
def test_load_split_shapes():
    s = load_split("swat")
    assert s.train.shape[1] == s.test.shape[1] == len(s.columns) == 51
    assert len(s.test) == len(s.test_labels)
    assert s.test_labels.sum() > 0
