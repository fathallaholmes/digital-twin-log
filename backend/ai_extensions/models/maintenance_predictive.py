"""
Maintenance prédictive — modèle Random Forest
==============================================
Prédit la probabilité qu'un véhicule tombe en panne dans les 30 prochains jours
à partir de ses indicateurs OBD + télémétrie agrégés sur une fenêtre glissante.

Pipeline :
    1. Charger CSV historiques (obd + télémétrie + breakdowns)
    2. Pour chaque couple (vehicle_id, date), construire les features
       en agrégeant les 30 jours précédents
    3. Étiqueter : 1 si une panne survient dans les 30 jours suivants
    4. Entraîner RandomForestClassifier (class_weight balanced)
    5. Sauvegarder le modèle + métriques dans models/trained/

Inférence :
    predict_for_vehicle(vehicle_id) → {
        probability,            # proba [0..1] panne dans 30 jours
        risk_level,             # 'faible' | 'modéré' | 'élevé' | 'critique'
        piece_at_risk,          # pièce la plus probable (turbo, freins, ...)
        days_horizon,
        contributing_factors,   # ex: ['T° moteur élevée', 'Freinages brusques']
        recommendation,         # action concrète
    }
"""

from __future__ import annotations
import pickle
import warnings
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

warnings.filterwarnings("ignore", category=DeprecationWarning)

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score, roc_auc_score,
    classification_report, confusion_matrix,
)


# ── Chemins ──────────────────────────────────────────────────────────────────
_HERE        = Path(__file__).parent
SAMPLES_DIR  = _HERE.parent / "data" / "samples"
TRAINED_DIR  = _HERE / "trained"
MODEL_PATH   = TRAINED_DIR / "maintenance_rf.pkl"

HORIZON_DAYS = 30   # fenêtre prédictive
WINDOW_DAYS  = 30   # fenêtre d'agrégation

FEATURE_COLS = [
    "km_total_window", "km_since_maintenance_end",
    "engine_temp_avg_mean", "engine_temp_avg_max",
    "engine_temp_max_mean", "engine_temp_max_max",
    "rpm_avg_mean", "rpm_avg_max",
    "rpm_peak_mean", "rpm_peak_max",
    "engine_load_avg_mean", "engine_load_avg_max",
    "speed_avg_mean", "speed_max_max",
    "hard_brake_total", "hard_accel_total",
    "sharp_corner_total", "over_rev_total",
]


# ── Construction du dataset entraînement ─────────────────────────────────────
def build_training_dataset(samples_dir: Path = SAMPLES_DIR) -> pd.DataFrame:
    """
    Combine OBD + télémétrie en agrégats par fenêtre 30j, étiquette via breakdowns.
    Retourne un DataFrame avec FEATURE_COLS + 'label' (0/1) + 'vehicle_id', 'date'.
    """
    obd     = pd.read_csv(samples_dir / "obd_history.csv")
    telem   = pd.read_csv(samples_dir / "telematics_stream.csv")
    breaks  = pd.read_csv(samples_dir / "breakdowns.csv")

    obd["date"]    = pd.to_datetime(obd["date"])
    telem["date"]  = pd.to_datetime(telem["date"])
    breaks["date"] = pd.to_datetime(breaks["date"])

    # ── Merge OBD + télémétrie sur (vehicle_id, date) ────────────────────────
    daily = obd.merge(
        telem[["vehicle_id", "date", "speed_avg", "speed_max",
                "hard_brake_n", "hard_accel_n", "sharp_corner_n", "over_rev_n"]],
        on=["vehicle_id", "date"], how="inner",
    )

    # ── Pour chaque (vehicle, date) où on a au moins WINDOW_DAYS d'historique,
    #    calculer agrégats des WINDOW_DAYS précédents.
    rows = []
    for vid, sub in daily.groupby("vehicle_id"):
        sub = sub.sort_values("date").reset_index(drop=True)
        for i in range(WINDOW_DAYS, len(sub)):
            window = sub.iloc[i - WINDOW_DAYS:i]
            ref_date = sub.iloc[i]["date"]
            row = {
                "vehicle_id": vid,
                "date":       ref_date,
                "siege":      sub.iloc[i]["siege"],
                "vehicle_type": sub.iloc[i]["vehicle_type"],
                "km_total_window":          float(window["km_today"].sum()),
                "km_since_maintenance_end": float(sub.iloc[i]["km_since_maintenance"]),
                "engine_temp_avg_mean":     float(window["engine_temp_avg"].mean()),
                "engine_temp_avg_max":      float(window["engine_temp_avg"].max()),
                "engine_temp_max_mean":     float(window["engine_temp_max"].mean()),
                "engine_temp_max_max":      float(window["engine_temp_max"].max()),
                "rpm_avg_mean":             float(window["rpm_avg"].mean()),
                "rpm_avg_max":              float(window["rpm_avg"].max()),
                "rpm_peak_mean":            float(window["rpm_peak"].mean()),
                "rpm_peak_max":             float(window["rpm_peak"].max()),
                "engine_load_avg_mean":     float(window["engine_load_avg"].mean()),
                "engine_load_avg_max":      float(window["engine_load_avg"].max()),
                "speed_avg_mean":           float(window["speed_avg"].mean()),
                "speed_max_max":            float(window["speed_max"].max()),
                "hard_brake_total":         int(window["hard_brake_n"].sum()),
                "hard_accel_total":         int(window["hard_accel_n"].sum()),
                "sharp_corner_total":       int(window["sharp_corner_n"].sum()),
                "over_rev_total":           int(window["over_rev_n"].sum()),
            }
            rows.append(row)

    df = pd.DataFrame(rows)

    # ── Labellisation : panne dans les HORIZON_DAYS prochains ?  ─────────────
    df["label"] = 0
    if not breaks.empty:
        for _, brk in breaks.iterrows():
            vid     = brk["vehicle_id"]
            brk_dt  = brk["date"]
            # Tous les points (vehicle_id == vid, brk_dt - HORIZON < date <= brk_dt)
            mask = (
                (df["vehicle_id"] == vid)
                & (df["date"] > brk_dt - pd.Timedelta(days=HORIZON_DAYS))
                & (df["date"] <= brk_dt)
            )
            df.loc[mask, "label"] = 1

    return df


# ── Entraînement ─────────────────────────────────────────────────────────────
def train_model(df: pd.DataFrame, save: bool = True) -> dict:
    """Entraîne le RandomForest et retourne les métriques + chemin du .pkl."""
    X = df[FEATURE_COLS].values
    y = df["label"].values

    if y.sum() < 5:
        # Trop peu de positifs : entraîner sans split
        X_train, X_test, y_train, y_test = X, X, y, y
    else:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.25, random_state=42, stratify=y,
        )

    clf = RandomForestClassifier(
        n_estimators=200,
        max_depth=10,
        min_samples_leaf=5,
        class_weight="balanced",
        n_jobs=-1,
        random_state=42,
    )
    clf.fit(X_train, y_train)

    y_pred  = clf.predict(X_test)
    y_proba = clf.predict_proba(X_test)[:, 1]

    metrics = {
        "accuracy":   float(accuracy_score(y_test, y_pred)),
        "precision":  float(precision_score(y_test, y_pred, zero_division=0)),
        "recall":     float(recall_score(y_test, y_pred, zero_division=0)),
        "f1":         float(f1_score(y_test, y_pred, zero_division=0)),
        "roc_auc":    float(roc_auc_score(y_test, y_proba)) if len(set(y_test)) > 1 else None,
        "n_train":    int(len(y_train)),
        "n_test":     int(len(y_test)),
        "n_positive": int(y.sum()),
        "n_total":    int(len(y)),
    }

    feature_importance = dict(zip(FEATURE_COLS,
                                  [float(x) for x in clf.feature_importances_]))

    bundle = {
        "model":              clf,
        "feature_cols":       FEATURE_COLS,
        "horizon_days":       HORIZON_DAYS,
        "window_days":        WINDOW_DAYS,
        "metrics":            metrics,
        "feature_importance": feature_importance,
        "trained_at":         datetime.utcnow().isoformat(),
    }

    if save:
        TRAINED_DIR.mkdir(parents=True, exist_ok=True)
        with open(MODEL_PATH, "wb") as f:
            pickle.dump(bundle, f)

    return {
        "metrics":            metrics,
        "feature_importance": feature_importance,
        "model_path":         str(MODEL_PATH),
    }


# ── Cache singleton du modèle chargé ─────────────────────────────────────────
_loaded_bundle: Optional[dict] = None

def _load_bundle() -> dict:
    """Charge le modèle .pkl (lazy + cache)."""
    global _loaded_bundle
    if _loaded_bundle is None:
        if not MODEL_PATH.exists():
            # Entraînement automatique si absent
            df = build_training_dataset()
            train_model(df, save=True)
        with open(MODEL_PATH, "rb") as f:
            _loaded_bundle = pickle.load(f)
    return _loaded_bundle


def invalidate_cache():
    """À appeler après re-entraînement pour forcer le rechargement."""
    global _loaded_bundle
    _loaded_bundle = None


# ── Inférence pour un véhicule ───────────────────────────────────────────────
# Mapping signaux dégradés → pièce probable (utilisé pour expliquer la prédiction)
PIECE_RULES = [
    # (label_pièce, fonction_score_features)
    ("plaquettes_frein",  lambda f: f["hard_brake_total"] / 50),
    ("courroie_distrib",  lambda f: f["over_rev_total"] / 30),
    ("turbo",             lambda f: max(0, (f["engine_temp_max_max"] - 100) / 15)
                                    + max(0, (f["rpm_peak_max"] - 4500) / 1000)),
    ("amortisseurs",      lambda f: f["sharp_corner_total"] / 50),
    ("embrayage",         lambda f: f["hard_accel_total"] / 50),
    ("radiateur",         lambda f: max(0, (f["engine_temp_avg_mean"] - 92) / 8)),
    ("alternateur",       lambda f: max(0, (f["km_since_maintenance_end"] - 4000) / 4000)),
    ("pneus",             lambda f: (f["km_total_window"] / 1500)
                                    + (f["sharp_corner_total"] / 100)),
]


def _suspect_piece(features: dict) -> tuple[str, float]:
    """Retourne (pièce, score) la plus suspecte selon les règles ci-dessus."""
    scores = [(label, fn(features)) for label, fn in PIECE_RULES]
    scores.sort(key=lambda x: x[1], reverse=True)
    return scores[0]


def _contributing_factors(features: dict) -> list[str]:
    """Phrases courtes décrivant les signaux préoccupants (seuils calibrés sur le dataset)."""
    factors = []
    if features["engine_temp_max_max"] > 108:
        factors.append(f"T° moteur max critique ({features['engine_temp_max_max']:.0f}°C)")
    elif features["engine_temp_avg_mean"] > 95:
        factors.append(f"T° moteur moyenne élevée ({features['engine_temp_avg_mean']:.0f}°C)")
    if features["rpm_peak_max"] > 5200:
        factors.append(f"Sur-régime moteur critique ({features['rpm_peak_max']:.0f} RPM)")
    if features["hard_brake_total"] > 2000:
        factors.append(f"Freinages brusques fréquents ({features['hard_brake_total']} en 30j)")
    if features["hard_accel_total"] > 2000:
        factors.append(f"Accélérations brutales fréquentes ({features['hard_accel_total']} en 30j)")
    if features["sharp_corner_total"] > 3000:
        factors.append(f"Virages serrés répétés ({features['sharp_corner_total']} en 30j)")
    if features["over_rev_total"] > 2000:
        factors.append(f"Sur-régime répété ({features['over_rev_total']} épisodes)")
    if features["km_since_maintenance_end"] > 6000:
        factors.append(f"Maintenance en retard ({features['km_since_maintenance_end']:.0f} km depuis dernière)")
    return factors


def _risk_level(prob: float) -> str:
    if prob >= 0.70: return "critique"
    if prob >= 0.40: return "élevé"
    if prob >= 0.15: return "modéré"
    return "faible"


def _recommendation(prob: float, piece: str, factors: list[str]) -> str:
    if prob >= 0.70:
        return f"Immobiliser le véhicule sous 48h pour inspection {piece}."
    if prob >= 0.40:
        return f"Planifier un contrôle {piece} dans la semaine."
    if prob >= 0.15:
        return f"Surveiller — vérifier {piece} à la prochaine maintenance."
    return "Aucune action urgente — surveillance routinière."


def _aggregate_window(vehicle_id: str, samples_dir: Path = SAMPLES_DIR) -> Optional[dict]:
    """Construit les features pour les 30 derniers jours d'un véhicule depuis les CSV."""
    obd_path   = samples_dir / "obd_history.csv"
    telem_path = samples_dir / "telematics_stream.csv"
    if not obd_path.exists() or not telem_path.exists():
        return None

    obd   = pd.read_csv(obd_path)
    telem = pd.read_csv(telem_path)
    obd["date"]   = pd.to_datetime(obd["date"])
    telem["date"] = pd.to_datetime(telem["date"])

    sub_obd   = obd[obd["vehicle_id"]   == vehicle_id].sort_values("date")
    sub_telem = telem[telem["vehicle_id"] == vehicle_id].sort_values("date")
    if sub_obd.empty:
        return None

    window_obd   = sub_obd.tail(WINDOW_DAYS)
    window_telem = sub_telem.tail(WINDOW_DAYS)

    return {
        "vehicle_id": vehicle_id,
        "siege":      sub_obd.iloc[-1]["siege"],
        "vehicle_type": sub_obd.iloc[-1]["vehicle_type"],
        "as_of_date": str(sub_obd.iloc[-1]["date"].date()),
        "km_total_window":          float(window_obd["km_today"].sum()),
        "km_since_maintenance_end": float(sub_obd.iloc[-1]["km_since_maintenance"]),
        "engine_temp_avg_mean":     float(window_obd["engine_temp_avg"].mean()),
        "engine_temp_avg_max":      float(window_obd["engine_temp_avg"].max()),
        "engine_temp_max_mean":     float(window_obd["engine_temp_max"].mean()),
        "engine_temp_max_max":      float(window_obd["engine_temp_max"].max()),
        "rpm_avg_mean":             float(window_obd["rpm_avg"].mean()),
        "rpm_avg_max":              float(window_obd["rpm_avg"].max()),
        "rpm_peak_mean":            float(window_obd["rpm_peak"].mean()),
        "rpm_peak_max":             float(window_obd["rpm_peak"].max()),
        "engine_load_avg_mean":     float(window_obd["engine_load_avg"].mean()),
        "engine_load_avg_max":      float(window_obd["engine_load_avg"].max()),
        "speed_avg_mean":           float(window_telem["speed_avg"].mean()) if not window_telem.empty else 0.0,
        "speed_max_max":            float(window_telem["speed_max"].max())  if not window_telem.empty else 0.0,
        "hard_brake_total":         int(window_telem["hard_brake_n"].sum()) if not window_telem.empty else 0,
        "hard_accel_total":         int(window_telem["hard_accel_n"].sum()) if not window_telem.empty else 0,
        "sharp_corner_total":       int(window_telem["sharp_corner_n"].sum()) if not window_telem.empty else 0,
        "over_rev_total":           int(window_telem["over_rev_n"].sum())   if not window_telem.empty else 0,
    }


def predict_for_vehicle(vehicle_id: str) -> dict:
    """Inférence complète + explication pour un véhicule."""
    bundle = _load_bundle()
    features = _aggregate_window(vehicle_id)
    if features is None:
        return {
            "vehicle_id": vehicle_id,
            "error":      "Données historiques insuffisantes pour ce véhicule.",
        }

    X = np.array([[features[c] for c in bundle["feature_cols"]]])
    prob = float(bundle["model"].predict_proba(X)[0, 1])

    piece, piece_score = _suspect_piece(features)
    factors = _contributing_factors(features)
    risk    = _risk_level(prob)
    reco    = _recommendation(prob, piece, factors)

    return {
        "vehicle_id":           vehicle_id,
        "siege":                features["siege"],
        "vehicle_type":         features["vehicle_type"],
        "as_of_date":           features["as_of_date"],
        "probability":          round(prob, 4),
        "risk_level":           risk,
        "horizon_days":         bundle["horizon_days"],
        "piece_at_risk":        piece,
        "piece_confidence":     round(min(1.0, piece_score), 3),
        "contributing_factors": factors,
        "recommendation":       reco,
    }


def predict_all(vehicle_ids: list[str]) -> list[dict]:
    return [predict_for_vehicle(vid) for vid in vehicle_ids]


# ── CLI ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys, json
    try: sys.stdout.reconfigure(encoding="utf-8")
    except Exception: pass

    print("[*] Construction du dataset d'entrainement...")
    df = build_training_dataset()
    print(f"    {len(df)} lignes, {int(df['label'].sum())} positifs")

    print("[*] Entrainement RandomForest...")
    out = train_model(df, save=True)
    print("    Metriques :", json.dumps(out["metrics"], indent=2))
    print(f"    Modele sauvegarde : {out['model_path']}")

    # Top 5 features les plus importantes
    fi = sorted(out["feature_importance"].items(), key=lambda x: -x[1])[:5]
    print("    Top 5 features :")
    for name, score in fi:
        print(f"       {name:30s} {score:.4f}")

    print("\n[*] Test inference sur V002 (vehicule avec panne historique) :")
    pred = predict_for_vehicle("V002")
    print(json.dumps(pred, indent=2, ensure_ascii=False))
