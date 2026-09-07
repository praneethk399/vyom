"""
VYOM - GAS418S on-device AI training pipeline.

Trains two models on the real telemetry datasets (harmonized across all four
sources) and exports them as plain JSON so the browser can run inference
natively with zero runtime dependencies:

  1. Failure-mode classifier  (multiclass logistic regression)
  2. RUL regressor            (ridge regression)

FEATURE REPRESENTATION - the critical design decision
-----------------------------------------------------
The four corpora describe DIFFERENT engine profiles (crank ~2,850 rpm vs
~4,850 rpm, EGT ~660 vs ~817 C, vibration in mm/s vs the app's g RMS). Any
model trained on absolute levels misclassifies a healthy GAS418S as a
catastrophic failure because the live feature vector sits 4-8 sigma outside
the training manifold.

Fix: every level feature is expressed as a BASELINE-RELATIVE INDEX -
log(value / baseline) where the baseline is the median of the *healthy
(Normal)* rows of the SAME corpus. Index 0.0 = healthy for that channel,
+0.3 = 35% above nominal, etc. At inference time the app subtracts its own
NOMINAL envelope the same way (see src/lib/aiInference.ts), so live vectors
land exactly on-manifold regardless of engine scale or unit system.

Slope features are per-minute rates of the INDEX series (relative rate of
change), computed against a ~10 s reference lag on BOTH sides - exported as
refDtSec so the browser matches it.

Output: src/lib/aiModel.json + a printed evaluation report.
"""

import json
import math
import re
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import accuracy_score, f1_score, mean_absolute_error
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "training-data"
OUT = ROOT / "src" / "lib" / "aiModel.json"

# The failure datasets report structural vibration in mm/s; the app reports
# g RMS. With index features the unit cancels (value / own-baseline), so no
# conversion constant is needed at all - noted for provenance.
FEATURE_CLIP = 6.0
REF_DT_SEC = 10.0  # slope reference lag; aiInference must match

LEVELS = [
    "throttle_pct",
    "rpm",
    "egt_c",
    "oil_pressure_bar",
    "fuel_flow_lph",
    "vibration_mm_s",
    "battery_voltage_v",
    "altitude_m",
]
FEATURES = LEVELS + ["egt_slope_idx_per_min", "vibe_slope_idx_per_min"]

# Label harmonization - the failure modes actually present in the corpora,
# mapped onto the app's six subsystems.
CANON = {
    "normal": "Normal",
    "healthy": "Normal",
    "injector failure": "Fuel System",
    "injector abnormality": "Fuel System",
    "fuel system failure": "Fuel System",
    "fuel leak": "Fuel System",
    "fuel pump failure": "Fuel System",
    "lubrication failure": "Bearings & Shaft",
    "lubrication issue": "Bearings & Shaft",
    "oil system failure": "Bearings & Shaft",
    "oil pressure loss": "Bearings & Shaft",
    "bearing wear": "Bearings & Shaft",
    "bearing failure": "Bearings & Shaft",
    "abnormal vibration failure": "Bearings & Shaft",
    "abnormal vibration": "Bearings & Shaft",
    "overheating failure": "Combustor",
    "overheating": "Combustor",
    "coolant loss": "Combustor",
    "piston damage": "Combustor",
    "detonation": "Combustor",
    "combustion instability": "Combustor",
    "misfire failure": "Combustor",
    "misfire": "Combustor",
    "ignition failure": "Electrical",
    "alternator failure": "Electrical",
    "alternator": "Electrical",
    "electrical failure": "Electrical",
    "battery failure": "Electrical",
    "charging system degradation": "Electrical",
    "spark plug fouling": "Electrical",
    "sensor failure": "Anomaly",
    "sensor drift": "Anomaly",
    "turbocharger failure": "Compressor",
    "supercharger failure": "Compressor",
    "intake leak": "Compressor",
    "compressor stall": "Compressor",
    "exhaust valve failure": "Turbine",
    "exhaust leak": "Turbine",
}


def canon_label(raw: str) -> str:
    s = str(raw).strip().lower()
    if s in CANON:
        return CANON[s]
    for k, v in CANON.items():
        if k in s or s in k:
            return v
    return "Anomaly"


def load_failure_csv(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    df["altitude_m"] = df["altitude_ft"] * 0.3048
    df["label"] = df["failure_mode"].map(canon_label)
    return df


def load_twin_csv(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    df["altitude_m"] = df["altitude_ft"] * 0.3048
    df["label"] = df["fault_type"].map(canon_label)
    return df


def load_flygas_xlsx(path: Path) -> pd.DataFrame:
    """Real GAS418S health telemetry: Timestamp(s), RPM, MAP, EGT, CHT, OilBar, Health."""
    z = zipfile.ZipFile(path)
    ss = z.read("xl/sharedStrings.xml").decode("utf-8", "ignore")
    strings = re.findall(r"<t[^>]*>([^<]+)</t>", ss)
    sheet = z.read("xl/worksheets/sheet1.xml").decode("utf-8", "ignore")
    rows = re.findall(r"<row[^>]*>(.*?)</row>", sheet, re.S)
    parsed = []
    for row in rows:
        cells = re.findall(r'<c r="([A-Z]+)\d+"[^>]*?(?: t="(\w+)")?[^>]*>(?:<v>([^<]*)</v>)?', row)
        vals = {}
        for col, t, v in cells:
            if v == "":
                vals[col] = None
            elif t == "s":
                vals[col] = strings[int(v)]
            else:
                vals[col] = float(v)
        parsed.append(vals)
    if not parsed:
        raise RuntimeError("no rows parsed from xlsx")
    col_of = {name: chr(ord("A") + i) for i, name in enumerate(strings)}
    recs = []
    for row in parsed[1:]:
        try:
            recs.append(
                {
                    "rpm": row[col_of[strings[1]]],
                    "egt_c": row[col_of[strings[3]]],
                    "oil_pressure_bar": row[col_of[strings[5]]],
                    "health_index": row[col_of[strings[6]]],
                    "label": None,
                }
            )
        except KeyError:
            continue
    return pd.DataFrame(recs).dropna(subset=["egt_c"])


def impute(df: pd.DataFrame, medians: dict) -> pd.DataFrame:
    for c in LEVELS:
        if c not in df:
            df[c] = medians.get(c, 1.0)
        df[c] = df[c].fillna(medians.get(c, 1.0))
    return df


def baselines_of(df: pd.DataFrame) -> dict:
    """Per-channel healthy baseline: median of Normal rows (fallback: all rows)."""
    norm = df[df["label"] == "Normal"] if "label" in df.columns and df["label"].notna().any() else df
    src = norm if len(norm) >= 10 else df
    out = {}
    for c in LEVELS:
        m = float(src[c].median())
        out[c] = m if m > 1e-6 else max(1e-6, float(df[c].median()))
    return out


def to_index_features(df: pd.DataFrame, base: dict) -> pd.DataFrame:
    """log(value/baseline) per level channel + index slopes vs ~10 s lag."""
    eps = 1e-6
    for c in LEVELS:
        df[c] = np.clip(np.log(np.clip(df[c], eps, None) / base[c]), -FEATURE_CLIP, FEATURE_CLIP)

    dt = df["sample_sec"].to_numpy(dtype=float) if "sample_sec" in df else np.full(len(df), REF_DT_SEC)
    dt = np.where(np.nan_to_num(dt) <= 0, REF_DT_SEC, dt)

    def slopes(series):
        out = np.zeros(len(series))
        out[1:] = (series[1:] - series[:-1]) * (60.0 / dt[1:])
        return out

    df["egt_slope_idx_per_min"] = np.clip(slopes(df["egt_c"].to_numpy(dtype=float)), -FEATURE_CLIP, FEATURE_CLIP)
    df["vibe_slope_idx_per_min"] = np.clip(
        slopes(df["vibration_mm_s"].to_numpy(dtype=float)), -FEATURE_CLIP, FEATURE_CLIP
    )
    return df


def main() -> None:
    print("loading datasets...")
    fail_demo = load_failure_csv(DATA / "failure_demo_6min.csv")
    fail_sim = load_failure_csv(DATA / "failure_simulation.csv")
    twin = load_twin_csv(DATA / "digital_twin_dataset.csv")
    flygas = load_flygas_xlsx(DATA / "flygas_health_telemetry.xlsx")
    print(
        f"  failure_demo={len(fail_demo)}  failure_sim={len(fail_sim)}  "
        f"twin={len(twin)}  flygas_real={len(flygas)}"
    )

    pooled = pd.concat([fail_demo, fail_sim, twin], ignore_index=True)
    medians = {c: float(pooled[c].median()) for c in LEVELS if c in pooled}

    frames = [fail_demo, fail_sim, twin, flygas.assign(sample_sec=1.0)]
    for i, f in enumerate(frames):
        f = impute(f.copy(), medians)
        base = baselines_of(f)
        frames[i] = to_index_features(f, base)
        print(f"  baselines: " + ", ".join(f"{c}={base[c]:.2f}" for c in LEVELS))

    clf_df = pd.concat(frames, ignore_index=True)
    clf_df = clf_df[clf_df["label"].notna()]

    X = clf_df[FEATURES].to_numpy(dtype=float)
    y = clf_df["label"].to_numpy()
    classes = sorted(np.unique(y))
    print(f"classifier rows={len(X)}  classes={classes}")

    scaler = StandardScaler().fit(X)
    Xs = scaler.transform(X)
    Xtr, Xte, ytr, yte = train_test_split(Xs, y, test_size=0.2, random_state=42, stratify=y)
    clf = LogisticRegression(max_iter=2000, C=2.0).fit(Xtr, ytr)
    acc = accuracy_score(yte, clf.predict(Xte))
    f1 = f1_score(yte, clf.predict(Xte), average="macro")
    print(f"failure-mode classifier: accuracy={acc:.3f}  macro-F1={f1:.3f}")

    # sanity: a zero index vector (perfectly healthy engine) must classify Normal
    healthy_z = scaler.transform(np.zeros((1, len(FEATURES))))
    healthy_p = clf.predict_proba(healthy_z)[0]
    healthy_top = clf.classes_[int(np.argmax(healthy_p))]
    print(f"healthy-vector check: top={healthy_top}  p={healthy_p.max():.3f}")
    if healthy_top != "Normal":
        raise RuntimeError("healthy check FAILED - model does not read a nominal engine as Normal")

    # RUL regressor on rows that carry rul_hours
    rul_df = pd.concat(
        [
            fail_demo.assign(rul_hours=fail_demo["rul_hours"]),
            fail_sim.assign(rul_hours=fail_sim["rul_hours"]),
            twin,
        ],
        ignore_index=True,
    ).dropna(subset=["rul_hours"])
    rul_df = impute(rul_df, medians)
    # index features per own-source baseline - reuse the already-transformed frames by key
    rul_frames = []
    for f in frames[:3]:
        if "rul_hours" in f.columns:
            rul_frames.append(f.dropna(subset=["rul_hours"]))
    rul_df = pd.concat(rul_frames, ignore_index=True)
    Xr = rul_df[FEATURES].to_numpy(dtype=float)
    yr = rul_df["rul_hours"].to_numpy(dtype=float)
    Xrs = scaler.transform(Xr)
    Xrtr, Xrte, yrtr, yrte = train_test_split(Xrs, yr, test_size=0.2, random_state=42)
    reg = Ridge(alpha=1.0).fit(Xrtr, yrtr)
    mae = mean_absolute_error(yrte, reg.predict(Xrte))
    print(f"RUL regressor: MAE={mae:.1f} h  (mean RUL {yr.mean():.0f} h)")

    model = {
        "version": 2,
        "featureScheme": "baseline-relative index: log(value / healthy-nominal), clipped to ±6",
        "refDtSec": REF_DT_SEC,
        "trainedOn": {
            "failure_demo_6min": len(fail_demo),
            "failure_simulation": len(fail_sim),
            "digital_twin": len(twin),
            "flygas_real_telemetry": len(flygas),
        },
        "features": FEATURES,
        "scaler": {"mean": scaler.mean_.tolist(), "std": scaler.scale_.tolist()},
        "classifier": {
            "classes": list(clf.classes_),
            "coef": clf.coef_.tolist(),
            "intercept": clf.intercept_.tolist(),
            "valAccuracy": round(float(acc), 4),
            "valMacroF1": round(float(f1), 4),
        },
        "regressor": {
            "coef": reg.coef_.tolist(),
            "intercept": float(reg.intercept_),
            "valMAEh": round(float(mae), 1),
        },
        "unitNotes": {
            "scheme": "all level features are dimensionless log-ratios to each engine's own healthy baseline",
            "app baselines": "the app subtracts its NOMINAL envelope (src/lib/nominal.ts) - no unit constants needed",
            "vibration": "index cancels units; app uses g RMS vs NOMINAL.vibration, corpora use mm/s vs their own median",
            "egt": "app converts K -> degC before the ratio (NOMINAL.tet - 273.15)",
            "oil": "app converts PSI -> bar before the ratio (x0.0689476)",
        },
    }
    OUT.write_text(json.dumps(model, indent=1))
    print(f"exported -> {OUT}  ({OUT.stat().st_size / 1024:.1f} kB)")


if __name__ == "__main__":
    main()
