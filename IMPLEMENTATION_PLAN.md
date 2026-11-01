# SWaT/WADI ML Attack Detection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reproduce published unsupervised ML attack detectors (USAD, GDN) on the SWaT 2015 physical-process dataset, evaluate them more rigorously than the papers do, and test whether they transfer to WADI.

**Architecture:** One Python package `swatad`. It has a data layer (raw → Parquet → normalised windows), a metrics layer (point-wise, point-adjusted, event-level and time-to-detect), and three model families (classical baselines, USAD, GDN). They share one `fit(train, val) / score(x) -> (T,)` interface. A CLI runs one (dataset, model, seed) combination and writes a JSON result plus raw scores. A report script turns all results into tables and figures for the final presentation.

**Tech Stack:** Python 3.10, PyTorch 2.3.1 (CPU), pandas 2.2.2, NumPy 1.26.4, scikit-learn 1.5.0, PyArrow 16.1.0, openpyxl 3.1.3, matplotlib 3.9.0, pytest 8.2.2. Managed with `uv` in `.venv/`.

**Spec:** `instructions.md` (course brief) plus the Design section below.

---

## Design

### Problem statement
Brief: *design, implement, and demonstrate/evaluate an attack/anomaly detection system using AI/ML; reproduce published mechanisms; stretch: original modifications.*

- **Dataset:** SWaT Dec 2015 (A1/A2), physical-process data only. The network data was ruled out for disk space and for weak signal; see the stretch goals.
- **Second dataset:** WADI A2 (19 Nov 2019), for generalisation.
- **Detection paradigm:** semi-supervised. Train on normal data only. Raise an alarm when the anomaly score exceeds a threshold. Attack labels are used **only** for evaluation.

### Data (verified in this repository)
| File | Rows | Columns | Notes |
|---|---|---|---|
| `SWaT_Dataset_Normal_v1.xlsx` (sheet `Normal.csv`) | 495,000 | 51 signals + `Timestamp` + `Normal/Attack` | header on row 2 (`header=1`). Column names carry stray spaces (`' Timestamp'`, `' MV101'`). v1 = v0 minus 30 min of tank drain |
| `SWaT_Dataset_Attack_v0.xlsx` (sheet `Combined Data`) | 449,919 | same | labels `Normal` / `Attack` (some files contain `A ttack`; treat any value other than `Normal` as attack) |
| `WADI_14days_new.csv` | 784,571 (measured; the 2019 release drops unstable periods) | `Row, Date, Time` + 127 signals | normal only. 34 empty or constant columns are dropped, leaving 93 |
| `WADI_attackdataLABLE.csv` | 172,801 (5.77% attack, measured) | first line is junk (`0,1,2,…`), header on line 2 | label column `Attack LABLE (1:No Attack, -1:Attack)`. Has trailing empty rows |

Measured SWaT test attack fraction: 12.14%. After 10× downsampling, SWaT has 35 attack events and WADI has 14.

**Finding during implementation:** WADI sensor `2B_AIT_002_PV` is outside its training range in 54% of test rows, and only 4% of those rows are attacks. It is already 4.2× out of range on validation. An opt-in **drift guard** (`load_split(..., drift_tol=1.5)`, CLI `--drift-tol 1.5 --tag _drift`) drops columns whose *validation* values exceed the train range by more than 1.5×. It uses normal data only, with no test data and no labels. On WADI it drops exactly this sensor; on SWaT it drops nothing. It is reported as an original modification (`scripts/run_drift.sh`).

### Preprocessing protocol (follow GDN, Deng & Hooi AAAI 2021, so its numbers are comparable)
1. Strip whitespace from column names. Drop timestamp/row/date/time columns.
2. **WADI only:** drop columns that are all-NaN or constant in train. Forward-fill and then fill any remaining NaN with 0. Map label `-1 → 1` (attack) and `1 → 0`.
3. **Downsample** by a factor of 10: take the median of each non-overlapping 10-row block. The block label is 1 if ≥ 50% of its rows are attacks.
4. **Drop** the first 2,160 downsampled train rows (6 h of start-up transient).
5. **Min–max scale** with the train min/max. Do not clip test values; out-of-range values carry signal.
6. **Validation split:** the last 10% of (downsampled) train rows, kept in time order.

### Models
| ID | Paper | Score | Key hyperparameters (paper defaults) |
|---|---|---|---|
| `pca` | Shyu et al. 2003 (classical baseline) | squared reconstruction error | components that keep 95% of variance |
| `iforest` | Liu et al. 2008 | `-score_samples` | 200 trees, seed fixed |
| `usad` | Audibert et al., KDD 2020 | `α‖W−AE1(W)‖² + β‖W−AE2(AE1(W))‖²` | window 12, latent 40, α=β=0.5, 70 epochs, batch 512, Adam |
| `gdn` | Deng & Hooi, AAAI 2021 | max over sensors of the robust-normalised abs forecast error, smoothed over 3 steps | window 5, embed dim 64 (SWaT) / 128 (WADI), top-k 15 (SWaT) / 30 (WADI), 50 epochs early-stopped (patience 10), batch 32, Adam lr 1e-3 |

Published targets to reproduce (GDN Table 2, best-F1 protocol, no point-adjust):
- SWaT: P = 99.35, R = 68.12, F1 = 0.81
- WADI (2017 release): P = 97.50, R = 40.19, F1 = 0.57

USAD targets come from its paper's Table 3. Record them in `results/published.json` when implementing Task 6, and note which protocol each number uses (with or without point-adjust).

### Evaluation (part of the original contribution)
Every run reports all of the following, each tagged with the threshold rule used.
- **Thresholds:**
  - `best_f1`: oracle, what most papers report.
  - `val_max`: GDN rule, the maximum validation score.
  - `val_q99.9`: 99.9th percentile of validation scores.
- **Metrics:**
  - point-wise P/R/F1
  - point-adjusted P/R/F1, to show how much it inflates scores
  - event-level recall (an attack segment counts as detected if it contains ≥1 alarm)
  - event-level precision (fraction of alarm segments that overlap an attack)
  - **composite F1** (Garg et al., 2021): point-wise precision combined with event-wise recall
  - median and mean **time-to-detect** in seconds (downsampled steps × 10)
  - ROC-AUC and PR-AUC

### Original modifications (stretch, in priority order)
1. **Rigorous re-evaluation:** the threshold × metric matrix above, comparing paper protocol against a deployable one.
2. **Plant-aware alarm logic:** stage-wise thresholds over SWaT stages P1–P6 (the digit in the sensor name, e.g. `LIT301 → 3`) plus k-of-n alarm persistence. Measure the change in false-alarm rate and in time-to-detect. Output: which stage alarmed, for operators.
3. **Transfer to WADI:** apply the SWaT-tuned configuration to WADI without re-tuning.
4. **Network + process fusion (optional, needs extra data):** only if the network CSVs for a few attack windows are obtained. Out of scope for this plan.

### Interim presentation
`presentation/interim.html` (full detail) and `presentation/interim.pptx` (slides). Both cover motivation, dataset choice, related work, design, models, evaluation protocol, demo plan and timeline. These are produced alongside this plan, not as a coded task.

---

## Global Constraints
- Python 3.10. All dependency versions as pinned in Tech Stack. CPU only (no CUDA on this machine). 14 GB RAM.
- Raw data lives in `data/raw/`; Parquet in `data/processed/`; both are git-ignored. Delete raw xlsx/csv after conversion only if disk drops below 5 GB.
- Fixed seeds everywhere: `torch.manual_seed`, `np.random.seed`, and sklearn `random_state`. Default seed 0; final results average seeds 0, 1, 2.
- Labels are never used in `fit` or in threshold selection, except for the `best_f1` oracle, which is always reported under that name.
- One score per downsampled time step: `score(x) -> np.ndarray` of shape `(T,)`, aligned with the test labels. Windowed models pad the first `window` positions with the first valid score.
- Results go to `results/{dataset}_{model}_s{seed}.json` and `results/{dataset}_{model}_s{seed}_scores.npz`.

## Review Focus
1. **Label/score misalignment** from windowing: off-by-`window` shifts silently ruin F1. `test_score_alignment` in Task 4 pins a known spike to its index.
2. **WADI NaN/constant columns** produce NaN after min–max (divide by zero). `test_minmax_constant_column` in Task 2 checks for finite output.
3. **SWaT label typos** (`A ttack`, whitespace): `test_swat_label_variants` in Task 2.
4. **Empty or all-normal label arrays** in metrics (e.g. a validation slice) must not raise errors or divide by zero. `test_metrics_no_events` in Task 3.
5. **Memory blow-up** from materialising every window of WADI (127 signals × ~120k × window). Use strided views or lazy windowing. `test_windows_is_view` in Task 2.

---

## File Structure
```
pyproject.toml                 # package metadata + pinned deps
src/swatad/__init__.py
src/swatad/convert.py          # raw xlsx/csv -> parquet (one-off)
src/swatad/data.py             # load parquet, downsample, scale, split, windows
src/swatad/metrics.py          # thresholds + all metrics
src/swatad/models/base.py      # Detector protocol
src/swatad/models/baselines.py # PCADetector, IForestDetector
src/swatad/models/usad.py      # USADDetector
src/swatad/models/gdn.py       # GDNDetector (dense graph attention, no torch_geometric)
src/swatad/alarms.py           # stage-wise thresholds, k-of-n persistence (stretch 2)
src/swatad/run.py              # CLI: one (dataset, model, seed) run
scripts/report.py              # aggregate results -> results/summary.md + figures
tests/test_data.py tests/test_metrics.py tests/test_models.py tests/test_alarms.py
```

---

### Task 1: Project scaffold and raw → Parquet conversion

**Files:**
- Create: `pyproject.toml`, `src/swatad/__init__.py`, `src/swatad/convert.py`
- Modify: `.gitignore` (add `data/`, `.venv/`, `results/*.npz`, `__pycache__/`)

**Interfaces:**
- Produces: `data/processed/swat_train.parquet`, `swat_test.parquet`, `wadi_train.parquet`, `wadi_test.parquet`. Each has float32 signal columns (stripped names) plus an int8 `label` column (0/1; train is all 0) and no timestamp.
- Produces: `convert_swat(raw_dir: Path, out_dir: Path) -> None` and `convert_wadi(raw_dir: Path, out_dir: Path) -> None`. CLI: `python -m swatad.convert`.

- [ ] **Step 1:** Write `pyproject.toml` (src layout, deps from Tech Stack, `[tool.pytest.ini_options] testpaths=["tests"]`) and run `uv pip install -e .`.
- [ ] **Step 2:** Implement `convert_swat`. Use `pd.read_excel(..., header=1)` on `SWaT_Dataset_Normal_v1.xlsx` and `SWaT_Dataset_Attack_v0.xlsx`. Label = `(col.str.strip() != "Normal")`.
- [ ] **Step 3:** Implement `convert_wadi`. Read train with `pd.read_csv`; read test with `skiprows=1`; strip column names; drop rows where every signal is NaN; map the label column as in Design §Preprocessing.
- [ ] **Step 4:** Run `python -m swatad.convert`. Expected output:
  - SWaT train 495,000 rows, SWaT test 449,919 rows, 51 signals.
  - SWaT test attack fraction ≈ 0.12.
  - WADI test attack fraction ≈ 0.06.

### Task 2: Data pipeline

**Files:** Create `src/swatad/data.py`; Test `tests/test_data.py`

**Interfaces:**
- Produces: `@dataclass Split: train: np.ndarray (T,N) float32; val: np.ndarray; test: np.ndarray; test_labels: np.ndarray (T,) int8; columns: list[str]`
- Produces: `load_split(dataset: Literal["swat","wadi"], downsample: int = 10, drop_head: int = 2160, val_frac: float = 0.1) -> Split`
- Produces: `downsample_median(x: np.ndarray, labels: np.ndarray | None, factor: int) -> tuple[np.ndarray, np.ndarray | None]`
- Produces: `minmax_fit(x) -> tuple[np.ndarray, np.ndarray]`, `minmax_apply(x, lo, hi) -> np.ndarray`
- Produces: `sliding_windows(x: np.ndarray, w: int) -> np.ndarray` returning a read-only view of shape `(T-w+1, w, N)`

- [ ] **Step 1: Write failing tests**
  - `test_downsample_median`: an input of 20 rows where row i = i gives 2 rows, `[4.5, 14.5]`. Labels `[0]*14 + [1]*6` give `[0, 1]` (block 2 has 6/10 ≥ 0.5).
  - `test_minmax_constant_column`: a column with constant value 3.0 gives finite output equal to 0.
  - `test_swat_label_variants`: `normalise_swat_label(pd.Series(["Normal"," Attack","A ttack"]))` gives `[0, 1, 1]`.
  - `test_windows_is_view`: `sliding_windows(np.zeros((100, 3)), 5)` has shape `(96, 5, 3)` and `np.shares_memory` with the input.
  - `test_load_split_shapes` (skipped if Parquet is missing): for SWaT, `train.shape[1] == test.shape[1] == 51` and `len(test) == len(test_labels)`.
- [ ] **Step 2:** Run `pytest tests/test_data.py -v`. Expected: FAIL (import error).
- [ ] **Step 3:** Implement. In `minmax_apply`, use `(x - lo) / np.where(hi > lo, hi - lo, 1)`. `sliding_windows` uses `np.lib.stride_tricks.sliding_window_view`, then `moveaxis`.
- [ ] **Step 4:** Run `pytest tests/test_data.py -v`. Expected: PASS.

### Task 3: Metrics and thresholds

**Files:** Create `src/swatad/metrics.py`; Test `tests/test_metrics.py`

**Interfaces:**
- Produces: `segments(binary: np.ndarray) -> list[tuple[int,int]]` (half-open `[start, end)`)
- Produces: `point_adjust(pred, labels) -> np.ndarray`
- Produces: `threshold_best_f1(scores, labels) -> float`, `threshold_val_max(val_scores) -> float`, `threshold_val_quantile(val_scores, q=0.999) -> float`
- Produces: `evaluate(scores: np.ndarray, labels: np.ndarray, threshold: float, step_seconds: int = 10) -> dict`. Keys: `precision, recall, f1, pa_precision, pa_recall, pa_f1, event_recall, event_precision, composite_f1, ttd_median_s, ttd_mean_s, n_events, n_detected, n_alarm_segments, roc_auc, pr_auc, threshold`.

- [ ] **Step 1: Write failing tests**, using `labels = [0,0,1,1,1,0,0,1,1,0]` (two events) and `pred = [0,0,0,1,0,0,1,0,0,0]`:
  - `segments(labels) == [(2,5),(7,9)]`
  - point-wise P = 1/2, R = 1/5
  - `point_adjust(pred, labels)` = `[0,0,1,1,1,0,1,0,0,0]`, so PA recall = 3/5
  - event_recall = 0.5 (event 1 detected, event 2 not)
  - event_precision = 0.5 (alarm segments `(3,4)` hits and `(6,7)` misses)
  - composite_f1 = 2·0.5·0.5/(0.5+0.5) = 0.5
  - ttd for event 1 = (3−2)·10 = 10 s
  - `test_metrics_no_events`: all-zero labels return `event_recall` NaN (not an error) and `f1 == 0.0`
  - `test_best_f1_threshold`: for scores `[0.1,0.2,0.9,0.8]` and labels `[0,0,1,1]`, the threshold lies in `(0.2, 0.8]`
- [ ] **Step 2:** Run `pytest tests/test_metrics.py -v`. Expected: FAIL.
- [ ] **Step 3:** Implement. `threshold_best_f1` uses `sklearn.metrics.precision_recall_curve` and returns the threshold with maximum F1. `pred = scores >= threshold`. AUCs come from `roc_auc_score` / `average_precision_score`, and are NaN when only one class is present.
- [ ] **Step 4:** Run the tests. Expected: PASS.

### Task 4: Detector interface and classical baselines

**Files:** Create `src/swatad/models/base.py`, `src/swatad/models/baselines.py`; Test `tests/test_models.py`

**Interfaces:**
- Produces: `class Detector(Protocol): name: str; def fit(self, train: np.ndarray, val: np.ndarray) -> "Detector"; def score(self, x: np.ndarray) -> np.ndarray  # (T,)`
- Produces: `PCADetector(var: float = 0.95)`, `IForestDetector(n_estimators: int = 200, seed: int = 0)`
- Produces: `pad_scores(window_scores: np.ndarray, total_len: int) -> np.ndarray`, in `base.py`, used by Tasks 5 and 6.

- [ ] **Step 1: Write failing tests**, using synthetic data from `make_sine(T=600, N=4, seed=0)` (a test helper of sines plus noise):
  - `test_baseline_detects_spike[pca|iforest]`: inject `+5` into all sensors at t=400 of the test copy. `argmax(score) == 400`.
  - `test_score_alignment`: `pad_scores(np.arange(5.), 8)` gives `[0,0,0,0,1,2,3,4]` (window 4: the first 3 positions are padded with the first score).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement with sklearn `PCA(n_components=var)` and `IsolationForest`.
- [ ] **Step 4:** Run. Expected: PASS.

### Task 5: USAD

**Files:** Create `src/swatad/models/usad.py`; Test: add to `tests/test_models.py`

**Interfaces:**
- Consumes: `sliding_windows`, `pad_scores`
- Produces: `USADDetector(window: int = 12, latent: int = 40, epochs: int = 70, batch: int = 512, alpha: float = 0.5, beta: float = 0.5, seed: int = 0)`

- [ ] **Step 1: Write failing tests:**
  - `test_usad_detects_spike`: the same spike test with `epochs=5`.
  - `test_usad_loss_decreases`: the epoch-1 loss is greater than the last epoch's loss. Expose `self.history: list[float]`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement as in the paper.
  - **Architecture:** shared encoder `Linear(wN → wN/2) → ReLU → Linear(→ wN/4) → ReLU → Linear(→ latent) → ReLU`, with two mirrored decoders ending in `Sigmoid`.
  - **Epoch-n losses:**
    - `L1 = (1/n)‖W−AE1‖² + (1−1/n)‖W−AE2(AE1)‖²`
    - `L2 = (1/n)‖W−AE2‖² − (1−1/n)‖W−AE2(AE1)‖²`
  - **Optimisers:** two Adam optimisers; optimiser 1 updates encoder + decoder 1, optimiser 2 updates encoder + decoder 2.
- [ ] **Step 4:** Run. Expected: PASS (under 30 s).

### Task 6: GDN

**Files:** Create `src/swatad/models/gdn.py`; Test: add to `tests/test_models.py`; Create `results/published.json`

**Interfaces:**
- Consumes: `sliding_windows`, `pad_scores`
- Produces: `GDNDetector(window: int = 5, embed_dim: int = 64, topk: int = 15, epochs: int = 50, patience: int = 10, batch: int = 32, lr: float = 1e-3, smooth: int = 3, norm_stats: Literal["val","test"] = "val", seed: int = 0)`. `norm_stats="test"` reproduces the official code's use of test-set median/IQR. The runner exposes it as `--norm-stats test --tag _teststats`.
- Produces: `GDNDetector.sensor_scores(x) -> np.ndarray (T, N)`, the per-sensor normalised error used for attribution and for the stage-wise alarms in Task 8.

- [ ] **Step 1: Write failing tests:**
  - `test_gdn_detects_spike`: spike on sensor 2 only, `epochs=5`, `topk=2`. `argmax(score)` lies within ±1 of 400.
  - `test_gdn_attribution`: at t=400, `sensor_scores(x)[400].argmax() == 2`.
  - `test_gdn_graph_topk`: the learned adjacency has exactly `topk` neighbours per node and none on the diagonal.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement following Deng & Hooi 2021, §3, as dense tensors (N ≤ 127, so an N×N matrix is cheap):
  - **Graph:** each sensor i has an embedding `v_i ∈ R^d`. Neighbours are the top-k of `cos(v_i, v_j)` for j ≠ i.
  - **Graph attention:**
    - `g_i = v_i ⊕ W x_i`
    - `π(i,j) = LeakyReLU(aᵀ(g_i ⊕ g_j))`, softmax over the neighbours of i plus i itself
    - `z_i = ReLU(Σ α_ij W x_j)`
  - **Output:** `ŷ_i = MLP(z_i ∘ v_i)`, followed by BatchNorm + ReLU before the output layer (as in the official code).
  - **Loss:** MSE on the next step.
  - **Score:**
    - `err_i(t) = |ŷ_i − y_i|`, normalised as `(err − median)/(IQR + 1e-2)`.
    - Use **validation** median/IQR. This is stricter than the official code, which uses test statistics; note it in the report.
    - Then take the max over i and apply a moving average over 3 steps.
  - Fill `results/published.json` with GDN's SWaT/WADI P/R/F1 (Design §Models) and USAD's Table 3 values.
- [ ] **Step 4:** Run. Expected: PASS (under 60 s).

### Task 7: Experiment runner

**Files:** Create `src/swatad/run.py`; Test `tests/test_run.py`

**Interfaces:**
- Consumes: `load_split`, all Detectors, `evaluate`, the threshold functions
- Produces: CLI `python -m swatad.run --dataset {swat,wadi} --model {pca,iforest,usad,gdn} --seed 0 [--epochs N] [--quick]`
- Produces: a JSON file with keys `config, train_seconds, metrics: {best_f1: {...}, val_max: {...}, val_q999: {...}}`, plus an npz with `scores, labels, val_scores` (and `sensor_scores` for gdn).
- Produces: `MODEL_DEFAULTS: dict[tuple[str,str], dict]` holding the dataset-specific hyperparameters from Design §Models.

- [ ] **Step 1: Write failing test.** `test_run_quick` monkeypatches `load_split` to return synthetic data, runs `main(["--dataset","swat","--model","pca","--seed","0","--quick"])`, and asserts that the JSON exists and contains all three threshold keys.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. `--quick` uses the first 5% of train and 2 epochs, for smoke tests only.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Real runs.**
  - `for m in pca iforest usad gdn; do python -m swatad.run --dataset swat --model $m --seed 0; done`
  - Expected: GDN best-F1 point-wise F1 ≥ 0.70 on SWaT. Below that, debug before going further. The published value is 0.81.

### Task 8: Plant-aware alarm logic (stretch 2)

**Files:** Create `src/swatad/alarms.py`; Test `tests/test_alarms.py`

**Interfaces:**
- Consumes: `GDNDetector.sensor_scores`, `evaluate`
- Produces: `stage_of(column: str) -> int` (SWaT: the first digit in the name, e.g. `"LIT301" → 3`; WADI: the leading digit, e.g. `"2A_AIT_001_PV" → 2`)
- Produces: `stage_thresholds(val_sensor_scores, columns, q=0.999) -> dict[int, float]`
- Produces: `stage_alarms(sensor_scores, columns, thresholds) -> tuple[np.ndarray (T, n_stages) bool, list[int] stages]`
- Runner integration: `run.py` always adds `metrics.val_q999_persist` (k=3 of n=5, fixed a priori) and, for models with `sensor_scores`, `metrics.stage_q999` and `metrics.stage_q999_persist`.
- Produces: `k_of_n(pred: np.ndarray, k: int, n: int) -> np.ndarray` (an alarm when ≥k of the last n steps alarm)

- [ ] **Step 1: Write failing tests:**
  - `stage_of("FIT101") == 1`, `stage_of("P602") == 6`, `stage_of("2B_AIT_001_PV") == 2`
  - `k_of_n([1,0,1,1,0,0], k=2, n=3) == [0,0,1,1,1,0]`
  - `stage_alarms` raises only the stage whose sensor spiked
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS. Then add `--alarm stage` to `run.py`, which writes an extra `metrics.stage_kofn` block.

### Task 9: Multi-seed runs, WADI transfer, report

**Files:** Create `scripts/report.py`

**Interfaces:**
- Consumes: `results/*.json`, `results/*.npz`, `results/published.json`
- Produces: `results/summary.md` (mean ± std over seeds 0–1–2 per model × threshold × metric, with the published numbers alongside) and `results/fig_*.png` (score traces with attack shading, a PA-vs-point-wise bar chart, a TTD histogram, and a stage-alarm heatmap)

- [ ] **Step 1:** Run all models for seeds 0, 1, 2 on SWaT, then on WADI with the SWaT-tuned config (transfer, stretch 3).
- [ ] **Step 2:** Implement `report.py`. Run `python scripts/report.py`. Expected: `results/summary.md` contains a row for every (dataset, model) with point-wise, PA and composite F1.
- [ ] **Step 3:** Write the findings into the final presentation (outside this plan).

---

## Execution notes
- The runtime estimates are guesses until measured. Measure GDN on SWaT (~50k training windows after downsampling) and USAD in Task 7 Step 5, and adjust epochs if a run exceeds 1 h on CPU.
- No commits are made by the agent unless the user asks. The checkpoints are the end of each task.
