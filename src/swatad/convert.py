"""One-off conversion of the raw iTrust files to Parquet.

Output frames hold float32 signal columns (whitespace-stripped names) and an
int8 ``label`` column (1 = attack). Timestamps are dropped.
"""
from pathlib import Path

import numpy as np
import pandas as pd

RAW = Path("data/raw")
OUT = Path("data/processed")

WADI_LABEL = "Attack LABLE (1:No Attack, -1:Attack)"
WADI_DROP = ["Row", "Date", "Time"]


def normalise_swat_label(s: pd.Series) -> np.ndarray:
    """'Normal' -> 0, anything else ('Attack', 'A ttack', ...) -> 1."""
    return (s.astype(str).str.strip() != "Normal").to_numpy(np.int8)


def _finish(df: pd.DataFrame, label: np.ndarray) -> pd.DataFrame:
    out = df.astype(np.float32)
    out["label"] = label
    return out.reset_index(drop=True)


def convert_swat(raw_dir: Path, out_dir: Path) -> None:
    files = {"train": "SWaT_Dataset_Normal_v1.xlsx", "test": "SWaT_Dataset_Attack_v0.xlsx"}
    for split, name in files.items():
        df = pd.read_excel(raw_dir / name, header=1)
        df.columns = [c.strip() for c in df.columns]
        label = normalise_swat_label(df.pop("Normal/Attack"))
        df = df.drop(columns=["Timestamp"])
        _finish(df, label).to_parquet(out_dir / f"swat_{split}.parquet")


def convert_wadi(raw_dir: Path, out_dir: Path) -> None:
    train = pd.read_csv(raw_dir / "WADI_14days_new.csv")
    test = pd.read_csv(raw_dir / "WADI_attackdataLABLE.csv", skiprows=1)
    for split, df in {"train": train, "test": test}.items():
        df.columns = [c.strip() for c in df.columns]
        if split == "test":
            raw_label = df.pop(WADI_LABEL)
        df = df.drop(columns=WADI_DROP)
        keep = df.notna().any(axis=1).to_numpy()
        df = df[keep]
        if split == "test":
            label = (raw_label[keep] == -1).to_numpy(np.int8)
        else:
            label = np.zeros(len(df), np.int8)
        _finish(df, label).to_parquet(out_dir / f"wadi_{split}.parquet")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    convert_swat(RAW / "swat", OUT)
    convert_wadi(RAW / "wadi" / "WADI.A2_19 Nov 2019", OUT)
    for f in sorted(OUT.glob("*.parquet")):
        df = pd.read_parquet(f)
        print(f"{f.name}: rows={len(df)} signals={df.shape[1] - 1} attack_frac={df['label'].mean():.4f}")


if __name__ == "__main__":
    main()
