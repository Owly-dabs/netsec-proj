import json

import numpy as np

from swatad import run
from swatad.data import Split


def fake_split(dataset, **_):
    rng = np.random.default_rng(0)
    test_labels = np.zeros(300, dtype=np.int8)
    test_labels[200:220] = 1
    test = rng.random((300, 3)).astype(np.float32)
    test[200:220] += 3
    return Split(train=rng.random((400, 3)).astype(np.float32), val=rng.random((100, 3)).astype(np.float32),
                 test=test, test_labels=test_labels, columns=["FIT101", "LIT301", "P602"])


def test_run_quick(tmp_path, monkeypatch):
    monkeypatch.setattr(run, "load_split", fake_split)
    monkeypatch.setattr(run, "RESULTS", tmp_path)
    run.main(["--dataset", "swat", "--model", "pca", "--seed", "0", "--quick"])
    out = json.loads((tmp_path / "swat_pca_s0.json").read_text())
    assert {"best_f1", "val_max", "val_q999", "val_q999_persist"} <= set(out["metrics"])
    assert out["metrics"]["best_f1"]["f1"] > 0.5
    assert (tmp_path / "swat_pca_s0_scores.npz").exists()
