import numpy as np

from swatad.alarms import k_of_n, stage_alarms, stage_of, stage_thresholds

COLS = ["FIT101", "LIT101", "AIT301", "P602"]


def test_stage_of():
    assert stage_of("FIT101") == 1
    assert stage_of("P602") == 6
    assert stage_of("2B_AIT_001_PV") == 2
    assert stage_of("1_P_001_STATUS") == 1
    assert stage_of("LEAK_DIFF_PRESSURE") == 0   # plant-wide WADI tag


def test_k_of_n():
    np.testing.assert_array_equal(k_of_n(np.array([1, 0, 1, 1, 0, 0]), k=2, n=3), [0, 0, 1, 1, 1, 0])


def test_stage_alarms_localise():
    rng = np.random.default_rng(0)
    val = rng.random((1000, 4))
    test = rng.random((50, 4))
    test[20, 2] = 10.0                     # AIT301 -> stage 3
    th = stage_thresholds(val, COLS, q=0.999)
    assert sorted(th) == [1, 3, 6]
    alarms, stages = stage_alarms(test, COLS, th)
    assert stages == [1, 3, 6]
    assert alarms.shape == (50, 3)
    assert alarms[20].tolist() == [False, True, False]
    assert alarms[:, 1].sum() == 1
