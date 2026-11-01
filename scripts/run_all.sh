#!/usr/bin/env bash
# Full experiment grid. Usage: bash scripts/run_all.sh  (from the repo root)
# Resumable: a run whose results/<name>.json exists is skipped; a failing run is
# logged and the grid continues.
set -uo pipefail
PY=.venv/bin/python

run() {  # run <dataset> <model> <seed> [tag] [extra args...]
  local ds=$1 m=$2 seed=$3 tag=${4:-}
  shift 4 2>/dev/null || shift $#
  if [[ -f results/${ds}_${m}${tag}_s${seed}.json ]]; then
    echo "skip ${ds}_${m}${tag}_s${seed}"
    return
  fi
  $PY -m swatad.run --dataset "$ds" --model "$m" --seed "$seed" ${tag:+--tag "$tag"} "$@" \
    || echo "FAILED ${ds}_${m}${tag}_s${seed}"
}

for seed in 0 1 2; do
  for m in pca iforest usad gdn; do
    run swat $m $seed
    run wadi $m $seed
    run wadi $m $seed _drift --drift-tol 1.5
  done
  run swat gdn $seed _teststats --norm-stats test
  run wadi gdn $seed _teststats --norm-stats test
  for m in usad gdn; do
    run wadi $m $seed _transfer --config-from swat
  done
done
echo ALL_DONE
