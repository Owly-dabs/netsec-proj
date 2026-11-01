"""Aggregate results/*.json into results/summary.md (mean ± std over seeds)."""
import json
import re
from collections import defaultdict
from pathlib import Path

import numpy as np

RESULTS = Path("results")
BLOCKS = ["best_f1", "val_max", "val_q999", "val_q999_persist", "stage_q999", "stage_q999_persist"]
COLS = ["precision", "recall", "f1", "pa_f1", "event_recall", "event_precision", "composite_f1",
        "ttd_median_s", "n_alarm_segments"]
NAME = re.compile(r"(?P<ds>swat|wadi)_(?P<run>.+)_s(?P<seed>\d+)$")


def fmt(vals: list[float]) -> str:
    v = np.array(vals, dtype=float)
    if np.isnan(v).all():
        return "–"
    m = np.nanmean(v)
    return f"{m:.3f}" if len(v) == 1 else f"{m:.3f} ± {np.nanstd(v):.3f}"


def main() -> None:
    runs: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for f in sorted(RESULTS.glob("*.json")):
        m = NAME.match(f.stem)
        if m:
            runs[(m["ds"], m["run"])].append(json.loads(f.read_text()))
    published = json.loads((RESULTS / "published.json").read_text())

    lines = ["# Results summary", "", "Mean ± std over seeds. TTD in seconds. "
             "`best_f1` uses labels to pick the threshold (oracle, paper protocol); "
             "all other rows are deployable (threshold from validation data only).", ""]
    for ds in ["swat", "wadi"]:
        keys = sorted(k for k in runs if k[0] == ds)
        if not keys:
            continue
        lines += [f"## {ds.upper()}", "", "| model | threshold | seeds | " + " | ".join(COLS) + " | ROC-AUC |",
                  "|" + "---|" * (len(COLS) + 4)]
        for key in keys:
            rs = runs[key]
            auc = fmt([r["metrics"]["best_f1"]["roc_auc"] for r in rs])
            for b in BLOCKS:
                if b not in rs[0]["metrics"]:
                    continue
                cells = [fmt([r["metrics"][b][c] for r in rs]) for c in COLS]
                lines.append(f"| {key[1]} | {b} | {len(rs)} | " + " | ".join(cells) + f" | {auc} |")
        pub = [(mdl, p[ds]) for mdl, p in published.items() if p.get(ds, {}).get("f1") is not None]
        if pub:
            lines += ["", "Published: " + "; ".join(f"{m} F1={p['f1']} ({p['protocol']})" for m, p in pub)]
        lines.append("")
    (RESULTS / "summary.md").write_text("\n".join(lines))
    print("\n".join(lines))


if __name__ == "__main__":
    main()
