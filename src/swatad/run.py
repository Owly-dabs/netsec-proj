"""Run one (dataset, model, seed) experiment and write results/<name>.json + scores.

Example: python -m swatad.run --dataset swat --model gdn --seed 0
"""
import argparse
import json
import pickle
import time
from pathlib import Path

import numpy as np

from .alarms import k_of_n, stage_alarms, stage_thresholds
from .data import load_split
from .metrics import evaluate, threshold_best_f1, threshold_val_max, threshold_val_quantile
from .models.baselines import IForestDetector, PCADetector
from .models.gdn import GDNDetector
from .models.usad import USADDetector

RESULTS = Path("results")
MODELS_DIR = Path("models")

MODELS = {"pca": PCADetector, "iforest": IForestDetector, "usad": USADDetector, "gdn": GDNDetector}

# Paper hyperparameters per dataset (see IMPLEMENTATION_PLAN.md, Design / Models).
MODEL_DEFAULTS: dict[tuple[str, str], dict] = {
    ("swat", "pca"): {}, ("wadi", "pca"): {},
    ("swat", "iforest"): {}, ("wadi", "iforest"): {},
    ("swat", "usad"): {"window": 12}, ("wadi", "usad"): {"window": 10},
    ("swat", "gdn"): {"embed_dim": 64, "topk": 15}, ("wadi", "gdn"): {"embed_dim": 128, "topk": 30},
}
SEEDED = {"iforest", "usad", "gdn"}
PERSIST_K, PERSIST_N = 3, 5  # alarm if >= 3 of the last 5 steps (50 s) exceed the threshold


def build(dataset: str, model: str, seed: int, epochs: int | None, extra: dict) -> object:
    kw = dict(MODEL_DEFAULTS[(dataset, model)], **extra)
    if model in SEEDED:
        kw["seed"] = seed
    if epochs is not None and model in {"usad", "gdn"}:
        kw["epochs"] = epochs
    return MODELS[model](**kw)


def main(argv: list[str] | None = None) -> dict:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", choices=["swat", "wadi"], required=True)
    ap.add_argument("--model", choices=list(MODELS), required=True)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--epochs", type=int)
    ap.add_argument("--quick", action="store_true", help="5%% of train, 2 epochs: smoke test only")
    ap.add_argument("--config-from", choices=["swat", "wadi"],
                    help="use another dataset's hyperparameters (transfer experiment)")
    ap.add_argument("--norm-stats", choices=["val", "test"], help="GDN score normalisation statistics")
    ap.add_argument("--drift-tol", type=float,
                    help="drop sensors whose validation values exceed the train range by this factor")
    ap.add_argument("--tag", default="", help="suffix for the result file name")
    ap.add_argument("--reuse", action="store_true",
                    help="load the fitted model from models/<name>.pkl and skip training")
    args = ap.parse_args(argv)

    split = load_split(args.dataset, drift_tol=args.drift_tol)
    train = split.train[: max(len(split.train) // 20, 200)] if args.quick else split.train
    epochs = 2 if args.quick else args.epochs
    extra = {"norm_stats": args.norm_stats} if args.norm_stats else {}
    cfg_ds = args.config_from or args.dataset
    name = f"{args.dataset}_{args.model}{args.tag}_s{args.seed}"
    model_path = MODELS_DIR / f"{name}.pkl"
    if args.reuse:
        with model_path.open("rb") as f:
            det, train_seconds = pickle.load(f)
        print(f"loaded fitted model {model_path}")
    else:
        det = build(cfg_ds, args.model, args.seed, epochs, extra)
        t0 = time.time()
        det.fit(train, split.val)
        train_seconds = time.time() - t0
        if not args.quick:
            MODELS_DIR.mkdir(exist_ok=True)
            with model_path.open("wb") as f:
                pickle.dump((det, train_seconds), f)
    scores, val_scores = det.score(split.test), det.score(split.val)
    labels = split.test_labels

    thresholds = {
        "best_f1": threshold_best_f1(scores, labels),
        "val_max": threshold_val_max(val_scores),
        "val_q999": threshold_val_quantile(val_scores, 0.999),
    }
    metrics = {k: evaluate(scores, labels, t) for k, t in thresholds.items()}
    # Plant-aware alarms (original modification); k, n fixed a priori, not tuned on labels.
    persisted = k_of_n(scores >= thresholds["val_q999"], PERSIST_K, PERSIST_N)
    metrics["val_q999_persist"] = evaluate(persisted, labels, 0.5)
    stage_info = None
    if hasattr(det, "sensor_scores"):
        sensor, val_sensor = det.sensor_scores(split.test), det.sensor_scores(split.val)
        th = stage_thresholds(val_sensor, split.columns, 0.999)
        alarms, stages = stage_alarms(sensor, split.columns, th)
        any_stage = alarms.any(axis=1)
        metrics["stage_q999"] = evaluate(any_stage.astype(np.int8), labels, 0.5)
        metrics["stage_q999_persist"] = evaluate(k_of_n(any_stage, PERSIST_K, PERSIST_N), labels, 0.5)
        stage_info = {"stages": stages, "thresholds": th}

    out = {
        "config": {**vars(args), "model_kwargs": {k: v for k, v in vars(det).items()
                                                  if isinstance(v, (int, float, str))},
                   "n_train": len(train), "n_test": len(labels), "n_sensors": len(split.columns)},
        "train_seconds": train_seconds,
        "history": getattr(det, "history", None),
        "metrics": metrics,
        "stage_alarms": stage_info,
    }
    RESULTS.mkdir(exist_ok=True)
    (RESULTS / f"{name}.json").write_text(json.dumps(out, indent=2, default=float))
    arrays = {"scores": scores, "labels": labels, "val_scores": val_scores}
    if stage_info:
        arrays["sensor_scores"] = sensor.astype(np.float32)
        arrays["val_sensor_scores"] = val_sensor.astype(np.float32)
    np.savez_compressed(RESULTS / f"{name}_scores.npz", columns=np.array(split.columns), **arrays)
    m = out["metrics"]
    print(f"{name}: train {train_seconds:.0f}s | " + " | ".join(
        f"{k}: F1={v['f1']:.3f} PA-F1={v['pa_f1']:.3f} compF1={v['composite_f1']:.3f} "
        f"events={v['n_detected']}/{v['n_events']}" for k, v in m.items()))
    return out


if __name__ == "__main__":
    main()
