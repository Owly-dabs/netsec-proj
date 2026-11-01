"""Static figures for the report/slides from results/*.json and *_scores.npz.

Colours: the dataviz reference palette (categorical slots 1-3 validated
all-pairs; sequential blue ramp). Light theme, for slides and print.
"""
import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from report import NAME, RESULTS  # noqa: E402

SERIES = ["#2a78d6", "#eb6834", "#1baf7a"]
INK, INK_2, GRID, SURFACE, BAND = "#0b0b0b", "#52514e", "#e4e3df", "#fcfcfb", "#d9d8d4"
SEQ = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"]

plt.rcParams.update({
    "figure.facecolor": SURFACE, "axes.facecolor": SURFACE, "axes.edgecolor": GRID,
    "axes.labelcolor": INK_2, "xtick.color": INK_2, "ytick.color": INK_2, "text.color": INK,
    "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.6, "axes.spines.top": False,
    "axes.spines.right": False, "font.size": 10, "legend.frameon": False,
})


def _shade_attacks(ax, labels: np.ndarray, x: np.ndarray) -> None:
    from swatad.metrics import segments
    for i, (s, e) in enumerate(segments(labels)):
        ax.axvspan(x[s], x[e - 1], color=BAND, lw=0, label="attack window" if i == 0 else None)


def score_trace(run: str) -> Path:
    d = np.load(RESULTS / f"{run}_scores.npz")
    meta = json.loads((RESULTS / f"{run}.json").read_text())
    hours = np.arange(len(d["scores"])) * 10 / 3600
    fig, ax = plt.subplots(figsize=(11, 3.2))
    _shade_attacks(ax, d["labels"], hours)
    ax.plot(hours, d["scores"], color=SERIES[0], lw=0.8, label="anomaly score")
    t = meta["metrics"]["val_q999"]["threshold"]
    ax.axhline(t, color=INK_2, lw=1, ls="--", label="threshold (val 99.9%)")
    ax.set_yscale("symlog")
    ax.set_ylim(bottom=max(float(d["scores"].min()), -1.0))  # GDN scores dip just below 0, never far
    ax.set_xlabel("hours into attack set")
    ax.set_title(f"{run}: anomaly score over the test period", loc="left", fontsize=11)
    ax.legend(loc="upper right", ncol=3)
    out = RESULTS / f"fig_trace_{run}.png"
    fig.tight_layout()
    fig.savefig(out, dpi=150)
    plt.close(fig)
    return out


def protocol_bars(dataset: str) -> Path | None:
    by_run: dict[str, list[dict]] = {}
    for f in sorted(RESULTS.glob(f"{dataset}_*.json")):
        if (mt := NAME.match(f.stem)):
            by_run.setdefault(mt["run"], []).append(json.loads(f.read_text())["metrics"])
    if not by_run:
        return None
    names = sorted(by_run)
    specs = [("point-adjusted F1 (oracle thr.)", "best_f1", "pa_f1"),
             ("point-wise F1 (oracle thr.)", "best_f1", "f1"),
             ("composite F1 (val thr., deployable)", "val_q999", "composite_f1")]
    bars = [(lab, [np.mean([m[blk][k] for m in by_run[n]]) for n in names],
             [np.std([m[blk][k] for m in by_run[n]]) for n in names]) for lab, blk, k in specs]
    x = np.arange(len(names))
    w = 0.26
    fig, ax = plt.subplots(figsize=(max(8, 1.3 * len(names)), 3.6))
    for i, (lab, vals, err) in enumerate(bars):
        b = ax.bar(x + (i - 1) * (w + 0.01), vals, w, color=SERIES[i], label=lab,
                   yerr=err, error_kw={"ecolor": INK_2, "lw": 0.8})
        ax.bar_label(b, fmt="%.2f", fontsize=8, color=INK_2, padding=2)
    ax.set_xticks(x, names)
    ax.set_ylim(0, 1.08)
    ax.set_ylabel("F1")
    ax.grid(axis="x", visible=False)
    ax.set_title(f"{dataset.upper()}: the same detectors under three scoring protocols (mean ± std, 3 seeds)", loc="left", fontsize=11)
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.12), ncol=3, fontsize=8)
    out = RESULTS / f"fig_protocols_{dataset}.png"
    fig.tight_layout()
    fig.savefig(out, dpi=150)
    plt.close(fig)
    return out


def stage_heatmap(run: str) -> Path | None:
    d = np.load(RESULTS / f"{run}_scores.npz")
    if "sensor_scores" not in d:
        return None
    from matplotlib.colors import ListedColormap
    from swatad.alarms import stage_alarms, stage_thresholds
    cols = d["columns"].tolist()
    th = stage_thresholds(d["val_sensor_scores"], cols)
    alarms, stages = stage_alarms(d["sensor_scores"], cols, th)
    hours = np.arange(len(alarms)) * 10 / 3600
    fig, (ax0, ax1) = plt.subplots(2, 1, figsize=(11, 3.4), sharex=True, height_ratios=[1, 4])
    ax0.fill_between(hours, d["labels"], step="mid", color=INK_2, lw=0)
    ax0.set_yticks([])
    ax0.set_ylabel("attack", rotation=0, ha="right", va="center")
    ax1.imshow(alarms.T, aspect="auto", interpolation="nearest", cmap=ListedColormap([SURFACE, SEQ[5]]),
               extent=[hours[0], hours[-1], len(stages) - 0.5, -0.5])
    ax1.set_yticks(range(len(stages)), [f"stage {s}" for s in stages])
    ax1.grid(False)
    ax1.set_xlabel("hours into attack set")
    ax0.set_title(f"{run}: which plant stage raised the alarm", loc="left", fontsize=11)
    out = RESULTS / f"fig_stages_{run}.png"
    fig.tight_layout()
    fig.savefig(out, dpi=150)
    plt.close(fig)
    return out


def main() -> None:
    for f in sorted(RESULTS.glob("*_s0_scores.npz")):
        run = f.name.removesuffix("_scores.npz")
        print(score_trace(run), stage_heatmap(run) or "")
    for ds in ["swat", "wadi"]:
        print(protocol_bars(ds) or "")


if __name__ == "__main__":
    main()
