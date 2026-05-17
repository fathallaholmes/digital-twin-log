"""
Détection d'anomalies de conduite — Isolation Forest
======================================================
Modèle **non supervisé** qui apprend la "normalité" du comportement de conduite
à partir du dataset télémétrique historique, puis détecte en temps réel les
écarts statistiques (freinages excessifs, sur-régimes répétés, conduite agressive).

Algorithme : `sklearn.ensemble.IsolationForest`
    - Apprend des "forêts d'arbres aléatoires" qui isolent les points
    - Score d'anomalie : -1 (anormal) → +1 (normal)
    - Pas besoin de labels : trouve automatiquement les outliers

Features (7) :
    speed_avg, speed_max, hard_brake_n, hard_accel_n,
    sharp_corner_n, over_rev_n, km_today

Sortie : pour chaque véhicule, un score d'anomalie + explication NLG
"""

from __future__ import annotations
import pickle
import warnings
from datetime import datetime
from pathlib import Path
from typing import Optional

warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler


# ── Chemins ──────────────────────────────────────────────────────────────────
_HERE        = Path(__file__).parent
SAMPLES_DIR  = _HERE.parent / "data" / "samples"
TRAINED_DIR  = _HERE / "trained"
MODEL_PATH   = TRAINED_DIR / "anomaly_iforest.pkl"

FEATURE_COLS = [
    "speed_avg", "speed_max",
    "hard_brake_n", "hard_accel_n", "sharp_corner_n", "over_rev_n",
    "km_today",
]


# ── Entraînement ─────────────────────────────────────────────────────────────
def train_model(contamination: float = 0.05, save: bool = True) -> dict:
    """
    Entraîne un Isolation Forest sur les agrégats journaliers télématiques.
    `contamination` = proportion attendue d'anomalies (5 % par défaut).
    """
    telem_path = SAMPLES_DIR / "telematics_stream.csv"
    if not telem_path.exists():
        raise FileNotFoundError(f"Dataset manquant : {telem_path}")

    df = pd.read_csv(telem_path)
    # Filtrer les jours d'inactivité (km = 0) qui faussent les stats
    df = df[df["km_today"] > 5].reset_index(drop=True)

    X = df[FEATURE_COLS].values
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    model = IsolationForest(
        n_estimators=200,
        contamination=contamination,
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_scaled)

    # Stats descriptives pour expliquer les anomalies
    stats = {col: {
        "mean":   float(df[col].mean()),
        "median": float(df[col].median()),
        "std":    float(df[col].std()),
        "p95":    float(df[col].quantile(0.95)),
    } for col in FEATURE_COLS}

    # Évaluation : combien d'anomalies sur le dataset d'entraînement ?
    scores = model.decision_function(X_scaled)
    labels = model.predict(X_scaled)
    n_anom = int((labels == -1).sum())

    bundle = {
        "model":          model,
        "scaler":         scaler,
        "feature_cols":   FEATURE_COLS,
        "contamination":  contamination,
        "stats":          stats,
        "score_min":      float(scores.min()),
        "score_max":      float(scores.max()),
        "trained_at":     datetime.utcnow().isoformat(),
        "n_samples":      len(df),
        "n_anomalies":    n_anom,
        "anomaly_rate":   round(n_anom / len(df), 3),
    }

    if save:
        TRAINED_DIR.mkdir(parents=True, exist_ok=True)
        with open(MODEL_PATH, "wb") as f:
            pickle.dump(bundle, f)

    return {
        "n_samples":    bundle["n_samples"],
        "n_anomalies":  bundle["n_anomalies"],
        "anomaly_rate": bundle["anomaly_rate"],
        "score_range":  [bundle["score_min"], bundle["score_max"]],
        "model_path":   str(MODEL_PATH),
    }


# ── Cache singleton ──────────────────────────────────────────────────────────
_loaded: Optional[dict] = None

def _load() -> dict:
    global _loaded
    if _loaded is None:
        if not MODEL_PATH.exists():
            train_model(save=True)
        with open(MODEL_PATH, "rb") as f:
            _loaded = pickle.load(f)
    return _loaded


def invalidate_cache():
    global _loaded
    _loaded = None


# ── Explication des anomalies (NLG-friendly) ─────────────────────────────────
def _explain(features: dict, stats: dict) -> list[str]:
    """Liste de phrases décrivant en quoi cette session diffère de la normale."""
    reasons = []
    for col in FEATURE_COLS:
        val = features[col]
        ref = stats[col]
        # Écart en nombre d'écarts-types
        if ref["std"] > 0:
            z = (val - ref["mean"]) / ref["std"]
            if z > 2.5:
                ratio = val / ref["mean"] if ref["mean"] > 0 else 0
                label = _human_label(col)
                if ratio >= 3:
                    reasons.append(f"{label} {ratio:.1f}x au-dessus de la moyenne ({val:.0f} vs {ref['mean']:.0f})")
                elif z > 2.5:
                    reasons.append(f"{label} anormalement élevé ({val:.0f}, p95 = {ref['p95']:.0f})")
    return reasons[:4]   # top 4


def _human_label(col: str) -> str:
    return {
        "speed_avg":       "Vitesse moyenne",
        "speed_max":       "Vitesse max",
        "hard_brake_n":    "Freinages brusques",
        "hard_accel_n":    "Accélérations brutales",
        "sharp_corner_n":  "Virages serrés",
        "over_rev_n":      "Sur-régimes",
        "km_today":        "Kilométrage",
    }.get(col, col)


def _severity(score: float) -> str:
    """Convertit le score Isolation Forest en niveau lisible (calibré sur la distribution réelle)."""
    if score < -0.08: return "critique"
    if score < -0.04: return "élevé"
    if score < 0.00:  return "modéré"
    if score < 0.04:  return "faible"
    return "normal"


def _confidence_pct(score: float, score_min: float) -> int:
    """Normalise le score d'anomalie en pourcentage de confiance (0-100)."""
    # Plus le score est négatif, plus on est confiant que c'est anormal
    if score >= 0:
        return 0
    pct = (score / score_min) * 100 if score_min < 0 else 0
    return int(max(0, min(100, pct)))


# ── Inférence ────────────────────────────────────────────────────────────────
def score_features(features: dict) -> dict:
    """Score une session donnée (dict avec toutes les FEATURE_COLS)."""
    bundle = _load()
    X = np.array([[features.get(c, 0) for c in bundle["feature_cols"]]])
    X_scaled = bundle["scaler"].transform(X)
    score    = float(bundle["model"].decision_function(X_scaled)[0])
    label    = bundle["model"].predict(X_scaled)[0]
    is_anom  = bool(label == -1)
    severity = _severity(score)
    reasons  = _explain(features, bundle["stats"]) if is_anom or severity != "normal" else []

    return {
        "score":               round(score, 4),
        "is_anomaly":          is_anom,
        "severity":            severity,
        "confidence_pct":      _confidence_pct(score, bundle["score_min"]),
        "reasons":             reasons,
        "features_evaluated":  features,
    }


def score_vehicle_last_day(vehicle_id: str) -> dict:
    """Score la dernière journée connue d'un véhicule (depuis les CSV)."""
    bundle = _load()
    telem_path = SAMPLES_DIR / "telematics_stream.csv"
    df = pd.read_csv(telem_path)
    df = df[df["vehicle_id"] == vehicle_id].sort_values("date")
    if df.empty:
        return {"vehicle_id": vehicle_id, "error": "Aucune donnée pour ce véhicule"}
    last = df.iloc[-1]

    features = {c: float(last[c]) for c in FEATURE_COLS}
    result = score_features(features)
    result.update({
        "vehicle_id":     vehicle_id,
        "vehicle_type":   last.get("vehicle_type", ""),
        "siege":          last.get("siege", ""),
        "driver_profile": last.get("driver_profile", ""),
        "date":           last["date"],
    })
    return result


def scan_fleet(vehicle_ids: list[str]) -> dict:
    """Scan complet : retourne tous les véhicules triés par sévérité."""
    results = [score_vehicle_last_day(vid) for vid in vehicle_ids]
    valid   = [r for r in results if "error" not in r]
    valid.sort(key=lambda r: r["score"])   # plus négatif = plus anormal en tête

    # Distribution
    by_severity = {"critique": 0, "élevé": 0, "modéré": 0, "faible": 0, "normal": 0}
    for r in valid:
        by_severity[r["severity"]] = by_severity.get(r["severity"], 0) + 1

    return {
        "total":       len(valid),
        "anomalies":   sum(1 for r in valid if r["is_anomaly"]),
        "by_severity": by_severity,
        "results":     valid,
    }


def scan_recent_anomalies(days_back: int = 14, max_results: int = 50) -> dict:
    """
    Scanne les `days_back` dernières journées de tous les véhicules et retourne
    les sessions les plus anormales (toutes sévérités confondues, triées par score).

    Utile pour le dashboard "Alertes récentes" : un véhicule qui a eu UN
    mauvais jour il y a 3 jours doit apparaître, même s'il roule bien aujourd'hui.
    """
    bundle = _load()
    telem_path = SAMPLES_DIR / "telematics_stream.csv"
    df = pd.read_csv(telem_path)
    df["date"] = pd.to_datetime(df["date"])

    # Filtrer fenêtre récente + jours d'activité significative
    cutoff = df["date"].max() - pd.Timedelta(days=days_back)
    df = df[(df["date"] >= cutoff) & (df["km_today"] > 20)].copy()

    if df.empty:
        return {"total": 0, "anomalies": 0, "by_severity": {}, "results": []}

    X = df[FEATURE_COLS].values
    X_scaled = bundle["scaler"].transform(X)
    scores = bundle["model"].decision_function(X_scaled)
    labels = bundle["model"].predict(X_scaled)
    df["score"] = scores
    df["is_anomaly"] = (labels == -1)

    # Garder le pire score par véhicule
    df = df.sort_values("score").reset_index(drop=True)

    results = []
    by_severity = {"critique": 0, "élevé": 0, "modéré": 0, "faible": 0, "normal": 0}
    seen_vehicles = set()

    for _, row in df.iterrows():
        vid = row["vehicle_id"]
        if vid in seen_vehicles:
            continue
        seen_vehicles.add(vid)

        feats = {c: float(row[c]) for c in FEATURE_COLS}
        severity = _severity(float(row["score"]))
        by_severity[severity] = by_severity.get(severity, 0) + 1

        if len(results) < max_results:
            results.append({
                "vehicle_id":      vid,
                "vehicle_type":    row["vehicle_type"],
                "driver_profile":  row["driver_profile"],
                "siege":           row["siege"],
                "date":            row["date"].strftime("%Y-%m-%d"),
                "score":           round(float(row["score"]), 4),
                "is_anomaly":      bool(row["is_anomaly"]),
                "severity":        severity,
                "confidence_pct":  _confidence_pct(float(row["score"]), bundle["score_min"]),
                "reasons":         _explain(feats, bundle["stats"]),
                "features_evaluated": feats,
            })

    return {
        "total":       int(len(seen_vehicles)),
        "anomalies":   int(sum(1 for r in results if r["is_anomaly"])),
        "by_severity": by_severity,
        "days_scanned": days_back,
        "results":     results,
    }


# ── CLI ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys, json
    try: sys.stdout.reconfigure(encoding="utf-8")
    except Exception: pass

    print("[*] Entrainement Isolation Forest...")
    out = train_model(contamination=0.05)
    print(json.dumps(out, indent=2))

    print("\n[*] Scan flotte (top 5 anomalies) :")
    ids = [f"V{i:03d}" for i in range(1, 76)]
    scan = scan_fleet(ids)
    print(f"  Total : {scan['total']}  Anomalies : {scan['anomalies']}")
    print(f"  Distribution : {json.dumps(scan['by_severity'], ensure_ascii=False)}")
    for r in scan["results"][:5]:
        print(f"\n  [{r['severity'].upper()}] {r['vehicle_id']} ({r['vehicle_type']}, {r['driver_profile']})")
        print(f"    Score : {r['score']:.4f}  Confiance : {r['confidence_pct']}%")
        for reason in r["reasons"]:
            print(f"    - {reason}")
