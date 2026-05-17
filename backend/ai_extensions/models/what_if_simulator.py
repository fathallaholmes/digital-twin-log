"""
What-If Simulator — Surrogate Model (LightGBM)
================================================
Permet de répondre instantanément à des questions du type :

    "Si je retire 3 véhicules à Tanger et que j'en ajoute 2 à Marrakech,
     quel est l'impact sur les délais, le CO₂, le taux de panne ?"

Au lieu de re-simuler tout le système (ce qui prendrait plusieurs secondes),
on entraîne un **modèle de substitution** ultra-rapide qui apprend la fonction :

    f(config_flotte) → (délai_moyen, CO₂_jour, taux_panne)

Pipeline :
    1. Échantillonner ~5000 configurations aléatoires de flotte
    2. Pour chaque config, calculer les VRAIS KPIs via un modèle physique
       (formules simples mais physiquement plausibles)
    3. Entraîner 3 LightGBM Regressors (un par KPI)
    4. À l'inférence : f(config) → KPIs en ~5 ms

Avantages :
    - Inférence quasi-instantanée → curseurs UI temps réel
    - Indépendant du simulateur original
    - Permet aussi des analyses contrefactuelles ("what would happen if...")
"""

from __future__ import annotations
import pickle
import warnings
from datetime import datetime
from pathlib import Path
from typing import Optional

warnings.filterwarnings("ignore")

import numpy as np
import lightgbm as lgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import r2_score, mean_absolute_error

from ..data.iot_generator import VEHICLE_PROFILES, SIEGES_GPS


# ── Chemins ──────────────────────────────────────────────────────────────────
_HERE       = Path(__file__).parent
TRAINED_DIR = _HERE / "trained"
MODEL_PATH  = TRAINED_DIR / "whatif_surrogate.pkl"

SIEGES = list(SIEGES_GPS.keys())  # ['Casablanca', 'Rabat', 'Tanger', 'Marrakech', 'Fès']

# Demande "normale" en missions/jour par siège (calibrée selon poids économique)
BASE_DEMAND = {
    "Casablanca": 25,   # hub principal
    "Rabat":      18,   # capitale
    "Tanger":     15,   # port
    "Marrakech":  14,   # tourisme
    "Fès":        12,
}

# CO₂ moyen pondéré par type (g/km)
AVG_CO2_PER_KM   = sum(p["co2_g_per_km"] for p in VEHICLE_PROFILES.values()) / len(VEHICLE_PROFILES)
# Km moyen par véhicule / jour
AVG_KM_PER_DAY   = 180.0

# Features d'entrée du surrogate : 5 (vehicles per site) + 1 (demand multiplier)
FEATURE_COLS = [f"n_vehicles_{s}" for s in SIEGES] + ["demand_multiplier"]
TARGET_COLS  = ["delay_min_avg", "co2_kg_day", "breakdown_rate_pct"]


# ═══════════════════════════════════════════════════════════════════════════════
#  1. Modèle physique de référence (vérité terrain pour l'entraînement)
# ═══════════════════════════════════════════════════════════════════════════════
def compute_true_kpis(config: dict, demand_multiplier: float = 1.0,
                       avg_co2_per_km: float = AVG_CO2_PER_KM) -> dict:
    """
    Calcule les KPIs "vrais" d'une configuration de flotte à partir
    d'un modèle physique simplifié mais cohérent.

    Args:
        config: {siege: n_vehicles, ...}
        demand_multiplier: 1.0 = normal, 1.5 = pic d'activité, 0.7 = creux

    Returns:
        {delay_min_avg, co2_kg_day, breakdown_rate_pct}
    """
    delays  = []
    co2     = 0.0
    n_total = 0
    overload_sum = 0.0

    for siege, n_vehicles in config.items():
        if n_vehicles <= 0:
            # Site sans véhicule : demande non desservie → pénalité forte
            delays.append(120.0 * demand_multiplier)
            continue

        # Capacité = véhicules × dispo (80 %) × tournées_par_véhicule_par_jour (3)
        capacity = n_vehicles * 0.80 * 3
        demand   = BASE_DEMAND.get(siege, 12) * demand_multiplier

        utilization = demand / capacity if capacity > 0 else 99
        overload_sum += max(0, utilization - 1.0) * n_vehicles

        # Modèle de file d'attente : délai monte exponentiellement si surcharge
        if utilization < 0.7:
            delay = 8 + utilization * 12       # baseline + croissance lente
        elif utilization < 1.0:
            delay = 15 + (utilization - 0.7) * 80  # croissance rapide
        else:
            delay = 40 + (utilization - 1.0) * 150  # explosion

        delays.append(delay)
        n_total += n_vehicles
        # CO₂ proportionnel aux km parcourus = capacity × km_moyen
        km_total_day = n_vehicles * AVG_KM_PER_DAY * min(1.0, utilization)
        co2         += km_total_day * avg_co2_per_km / 1000.0   # g → kg

    avg_delay = float(np.mean(delays)) if delays else 0

    # Taux de panne : baseline 0.5 %, +1 % par unité de surcharge moyenne
    base_breakdown_pct = 0.5
    overload_factor    = (overload_sum / max(1, n_total))
    breakdown_pct      = base_breakdown_pct + overload_factor * 100 * 0.8
    breakdown_pct      = max(0.1, min(15.0, breakdown_pct))

    return {
        "delay_min_avg":      round(avg_delay, 2),
        "co2_kg_day":         round(co2, 2),
        "breakdown_rate_pct": round(breakdown_pct, 3),
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  2. Génération du dataset d'entraînement du surrogate
# ═══════════════════════════════════════════════════════════════════════════════
def generate_training_samples(n_samples: int = 5000, seed: int = 42) -> tuple[np.ndarray, np.ndarray]:
    """Échantillonne des configurations aléatoires + calcule les KPIs vrais."""
    rng = np.random.RandomState(seed)
    X = np.zeros((n_samples, len(FEATURE_COLS)))
    y = np.zeros((n_samples, len(TARGET_COLS)))

    for i in range(n_samples):
        # Échantillonnage : 0 à 30 véhicules par siège (réaliste)
        n_per_siege = rng.randint(0, 30, size=len(SIEGES))
        demand_mult = rng.uniform(0.5, 1.8)

        config = {s: int(n) for s, n in zip(SIEGES, n_per_siege)}
        kpis = compute_true_kpis(config, demand_multiplier=demand_mult)

        X[i, :-1] = n_per_siege
        X[i, -1]  = demand_mult
        y[i, 0]   = kpis["delay_min_avg"]
        y[i, 1]   = kpis["co2_kg_day"]
        y[i, 2]   = kpis["breakdown_rate_pct"]

    return X, y


# ═══════════════════════════════════════════════════════════════════════════════
#  3. Entraînement des 3 surrogate models (LightGBM)
# ═══════════════════════════════════════════════════════════════════════════════
def train_model(n_samples: int = 5000, save: bool = True) -> dict:
    """Entraîne 1 LightGBM par KPI cible."""
    X, y = generate_training_samples(n_samples)
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.20, random_state=42)

    models  = {}
    metrics = {}

    for i, target in enumerate(TARGET_COLS):
        m = lgb.LGBMRegressor(
            n_estimators=200,
            learning_rate=0.05,
            num_leaves=31,
            min_child_samples=20,
            random_state=42,
            verbose=-1,
        )
        m.fit(X_train, y_train[:, i])
        y_pred = m.predict(X_test)
        models[target] = m
        metrics[target] = {
            "r2":  float(r2_score(y_test[:, i], y_pred)),
            "mae": float(mean_absolute_error(y_test[:, i], y_pred)),
        }

    feature_importance = {
        target: dict(zip(FEATURE_COLS, [float(x) for x in models[target].feature_importances_]))
        for target in TARGET_COLS
    }

    bundle = {
        "models":             models,
        "feature_cols":       FEATURE_COLS,
        "target_cols":        TARGET_COLS,
        "sieges":             SIEGES,
        "base_demand":        BASE_DEMAND,
        "avg_co2_per_km":     AVG_CO2_PER_KM,
        "metrics":            metrics,
        "feature_importance": feature_importance,
        "n_train":            len(X_train),
        "n_test":             len(X_test),
        "trained_at":         datetime.utcnow().isoformat(),
    }

    if save:
        TRAINED_DIR.mkdir(parents=True, exist_ok=True)
        with open(MODEL_PATH, "wb") as f:
            pickle.dump(bundle, f)

    return {
        "metrics":      metrics,
        "n_train":      len(X_train),
        "n_test":       len(X_test),
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


# ═══════════════════════════════════════════════════════════════════════════════
#  4. Inférence — quasi-instantané
# ═══════════════════════════════════════════════════════════════════════════════
def predict(config: dict, demand_multiplier: float = 1.0,
            use_surrogate: bool = True) -> dict:
    """
    Prédit les KPIs pour une configuration donnée.

    Args:
        config: {siege: n_vehicles}
        demand_multiplier: niveau d'activité (1.0 = normal)
        use_surrogate: True = LightGBM (rapide), False = modèle physique
    """
    if not use_surrogate:
        return compute_true_kpis(config, demand_multiplier)

    bundle = _load()
    X = np.array([[
        *[config.get(s, 0) for s in bundle["sieges"]],
        demand_multiplier,
    ]])

    preds = {}
    for target in bundle["target_cols"]:
        val = float(bundle["models"][target].predict(X)[0])
        preds[target] = round(val, 3)

    return preds


def compare(config_a: dict, config_b: dict, demand_multiplier: float = 1.0,
            labels: tuple[str, str] = ("A", "B")) -> dict:
    """Compare deux configurations côte à côte."""
    a = predict(config_a, demand_multiplier)
    b = predict(config_b, demand_multiplier)
    delta = {
        "delay_min_avg":      round(b["delay_min_avg"]      - a["delay_min_avg"],      3),
        "co2_kg_day":         round(b["co2_kg_day"]         - a["co2_kg_day"],         3),
        "breakdown_rate_pct": round(b["breakdown_rate_pct"] - a["breakdown_rate_pct"], 3),
    }
    delta_pct = {
        k: round((delta[k] / a[k] * 100), 2) if a[k] not in (0, None) else None
        for k in delta
    }
    return {
        "labels":          {"a": labels[0], "b": labels[1]},
        "config_a":        config_a,
        "config_b":        config_b,
        "kpis_a":          a,
        "kpis_b":          b,
        "delta_absolute":  delta,
        "delta_pct":       delta_pct,
    }


def get_baseline_config(n_per_siege_default: int = 15) -> dict:
    """Configuration de référence : flotte par défaut homogène."""
    return {s: n_per_siege_default for s in SIEGES}


# ── CLI ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys, json
    try: sys.stdout.reconfigure(encoding="utf-8")
    except Exception: pass

    print("[*] Entrainement surrogate LightGBM (3 modeles)...")
    out = train_model(n_samples=5000)
    print(json.dumps(out["metrics"], indent=2))
    print(f"    Train : {out['n_train']} | Test : {out['n_test']}")

    print("\n[*] Test prediction sur baseline 15 vehicules/siege :")
    base = get_baseline_config(15)
    pred = predict(base, demand_multiplier=1.0)
    true = compute_true_kpis(base, demand_multiplier=1.0)
    print(f"    Surrogate : {pred}")
    print(f"    Physique  : {true}")

    print("\n[*] What-If : retirer 5 vehicules a Tanger, en ajouter 5 a Casa")
    config_b = dict(base)
    config_b["Tanger"]     -= 5
    config_b["Casablanca"] += 5
    cmp = compare(base, config_b, labels=("Actuel", "Reorganisation"))
    print(f"    Delai : {cmp['kpis_a']['delay_min_avg']:.1f} -> {cmp['kpis_b']['delay_min_avg']:.1f} min "
          f"({cmp['delta_pct']['delay_min_avg']:+.1f}%)")
    print(f"    CO2   : {cmp['kpis_a']['co2_kg_day']:.0f} -> {cmp['kpis_b']['co2_kg_day']:.0f} kg/j "
          f"({cmp['delta_pct']['co2_kg_day']:+.1f}%)")
    print(f"    Pannes: {cmp['kpis_a']['breakdown_rate_pct']:.2f} -> {cmp['kpis_b']['breakdown_rate_pct']:.2f}% "
          f"({cmp['delta_pct']['breakdown_rate_pct']:+.1f}%)")
