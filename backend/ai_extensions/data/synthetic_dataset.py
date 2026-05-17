"""
Génération de datasets historiques synthétiques pour l'entraînement des modèles ML.
==================================================================================

Produit 3 datasets persistés en CSV :

1. **obd_history.csv**         — agrégats journaliers OBD par véhicule (180 jours)
                                  · km parcourus / jour, T° moy, T° max, RPM moy, RPM pics
                                  · charge moteur moyenne
2. **telematics_stream.csv**   — agrégats journaliers télématique
                                  · nb hard_brake, hard_accel, sharp_corner, over_rev
                                  · vitesse moyenne, max
3. **breakdowns.csv**          — événements de panne étiquetés (taux ~2.5 %)
                                  · vehicle_id, date, pièce_concernée, cause

Le tout sert de **vérité terrain** pour entraîner :
    · maintenance_predictive (target = panne dans les N jours)
    · anomaly_detector       (features = nb événements/jour)
    · what_if_simulator      (features = composition flotte → KPIs)
"""

from __future__ import annotations
import csv
import hashlib
import random
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from .iot_generator import VEHICLE_PROFILES, DRIVER_PROFILES, SIEGES_GPS


# ── Pièces susceptibles de tomber en panne ────────────────────────────────────
PIECES = [
    ("plaquettes_frein",   "freinage",   "Freinages brusques répétés"),
    ("courroie_distrib",   "moteur",     "Régime moteur élevé prolongé"),
    ("turbo",              "moteur",     "Surchauffe + sur-régime"),
    ("amortisseurs",       "suspension", "Virages serrés + nids-de-poule"),
    ("embrayage",          "transmission", "Accélérations brutales"),
    ("alternateur",        "électrique", "Vieillissement + km élevés"),
    ("radiateur",          "refroidissement", "Surchauffe persistante"),
    ("pneus",              "roulement",  "Conduite agressive + km"),
]


@dataclass
class FleetSpec:
    """Description simplifiée d'un véhicule pour la génération."""
    vehicle_id:           str
    vehicle_type:         str
    siege:                str
    odometer_km:          float
    km_since_maintenance: float
    driver_profile:       str


def _hash_pick(seed_str: str, choices: list, salt: str = ""):
    """Pick déterministe basé sur hash MD5 (cohérent entre runs)."""
    h = int(hashlib.md5((seed_str + salt).encode()).hexdigest(), 16)
    return choices[h % len(choices)]


def fleet_from_specs(vehicles_meta: list[dict]) -> list[FleetSpec]:
    """Construit la liste FleetSpec à partir des véhicules réels du store."""
    out = []
    for v in vehicles_meta:
        out.append(FleetSpec(
            vehicle_id=v["id"],
            vehicle_type=v["type"],
            siege=v["siege"],
            odometer_km=v.get("odometer_km", random.uniform(50_000, 180_000)),
            km_since_maintenance=v.get("km_depuis_derniere_maintenance", 0),
            driver_profile=_hash_pick(v["id"], ["safe", "neutre", "neutre", "neutre", "aggressif"]),
        ))
    return out


# ── Génération principale ─────────────────────────────────────────────────────
def generate_historical(
    fleet: list[FleetSpec],
    days: int = 180,
    breakdown_rate: float = 0.025,
    seed: int = 42,
) -> dict[str, list[dict]]:
    """
    Génère 3 datasets agrégés journaliers.

    Returns:
        {
            "obd":          [dict, ...],  # 1 ligne / (véhicule × jour)
            "telematics":   [dict, ...],
            "breakdowns":   [dict, ...],  # 1 ligne par panne
        }
    """
    rng = random.Random(seed)
    end_date   = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    start_date = end_date - timedelta(days=days)

    obd_rows:    list[dict] = []
    telem_rows:  list[dict] = []
    breakdowns:  list[dict] = []

    for spec in fleet:
        profile        = VEHICLE_PROFILES.get(spec.vehicle_type, VEHICLE_PROFILES["Cargo 3.5t"])
        driver         = DRIVER_PROFILES.get(spec.driver_profile, DRIVER_PROFILES["neutre"])
        cumulative_km  = spec.odometer_km - days * 50   # remonte le temps
        cumul_since    = max(0, spec.km_since_maintenance - days * 50)

        # Va-t-on injecter une panne sur ce véhicule ?
        will_break        = rng.random() < breakdown_rate * (days / 30)  # rate mensuel
        break_day_offset  = rng.randint(int(days * 0.6), days - 5) if will_break else None
        broken_piece      = None
        if will_break:
            broken_piece = _hash_pick(spec.vehicle_id, [p[0] for p in PIECES], salt="brk")

        for day_idx in range(days):
            current_date = start_date + timedelta(days=day_idx)
            day_of_week  = current_date.weekday()   # 0=lundi, 6=dimanche

            # Activité réduite week-end
            activity_factor = 0.3 if day_of_week >= 5 else 1.0
            # 15 % chance de jour sans déplacement
            if rng.random() < 0.15:
                activity_factor = 0.0

            km_today = rng.uniform(0, 350) * activity_factor

            # Pré-panne : 7 jours avant, dégradation des indicateurs
            is_pre_break = will_break and (break_day_offset - 7 <= day_idx <= break_day_offset)
            degradation  = 1.0
            if is_pre_break:
                degradation = 1.0 + (1 - (break_day_offset - day_idx) / 7) * 0.4  # jusqu'à +40 %

            cumulative_km += km_today
            cumul_since   += km_today

            # ── OBD agrégat jour ──────────────────────────────────────────────
            temp_avg = (88 + rng.uniform(-3, 5)) * degradation
            temp_max = temp_avg + rng.uniform(5, 15)
            rpm_avg  = (profile["idle_rpm"] + km_today * 4) * degradation
            rpm_peak = profile["max_rpm"] * (0.7 + rng.uniform(-0.1, 0.25)) * degradation
            load_avg = (40 + km_today * 0.1) * degradation
            load_avg = min(100, load_avg)

            obd_rows.append({
                "date":                 current_date.strftime("%Y-%m-%d"),
                "vehicle_id":           spec.vehicle_id,
                "vehicle_type":         spec.vehicle_type,
                "siege":                spec.siege,
                "km_today":             round(km_today, 1),
                "odometer_km":          round(cumulative_km, 1),
                "km_since_maintenance": round(cumul_since, 1),
                "engine_temp_avg":      round(temp_avg, 1),
                "engine_temp_max":      round(temp_max, 1),
                "rpm_avg":              round(rpm_avg, 0),
                "rpm_peak":             round(rpm_peak, 0),
                "engine_load_avg":      round(load_avg, 1),
            })

            # ── Télématique agrégat jour ──────────────────────────────────────
            n_ticks = int(km_today * 30)   # ~30 ticks/km
            hard_brake_n   = sum(1 for _ in range(n_ticks) if rng.random() < driver["hard_brake_prob"]   * degradation)
            hard_accel_n   = sum(1 for _ in range(n_ticks) if rng.random() < driver["hard_accel_prob"]   * degradation)
            sharp_corner_n = sum(1 for _ in range(n_ticks) if rng.random() < driver["sharp_corner_prob"] * degradation)
            over_rev_n     = sum(1 for _ in range(n_ticks) if rng.random() < driver["over_rev_prob"]     * degradation)

            speed_avg = profile["cruise_speed_kmh"] * (0.7 + rng.uniform(-0.05, 0.15))
            speed_max = profile["max_speed_kmh"] * (0.85 + rng.uniform(-0.05, 0.15))

            telem_rows.append({
                "date":            current_date.strftime("%Y-%m-%d"),
                "vehicle_id":      spec.vehicle_id,
                "vehicle_type":    spec.vehicle_type,
                "driver_profile":  spec.driver_profile,
                "siege":           spec.siege,
                "km_today":        round(km_today, 1),
                "speed_avg":       round(speed_avg, 1),
                "speed_max":       round(speed_max, 1),
                "hard_brake_n":    hard_brake_n,
                "hard_accel_n":    hard_accel_n,
                "sharp_corner_n":  sharp_corner_n,
                "over_rev_n":      over_rev_n,
            })

            # ── Panne déclenchée ──────────────────────────────────────────────
            if will_break and day_idx == break_day_offset:
                cause = next((p[2] for p in PIECES if p[0] == broken_piece), "Usure générale")
                breakdowns.append({
                    "date":          current_date.strftime("%Y-%m-%d"),
                    "vehicle_id":    spec.vehicle_id,
                    "vehicle_type":  spec.vehicle_type,
                    "siege":         spec.siege,
                    "piece":         broken_piece,
                    "cause":         cause,
                    "km_at_break":   round(cumulative_km, 1),
                    "km_since_maintenance": round(cumul_since, 1),
                })

    return {"obd": obd_rows, "telematics": telem_rows, "breakdowns": breakdowns}


# ── Persistance CSV ───────────────────────────────────────────────────────────
def save_csvs(datasets: dict[str, list[dict]], output_dir: Path) -> dict[str, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    paths = {}
    for name, rows in datasets.items():
        if not rows:
            continue
        path = output_dir / f"{name}.csv" if name == "telematics" else \
               output_dir / ("obd_history.csv" if name == "obd"
                              else ("breakdowns.csv" if name == "breakdowns"
                                    else f"{name}.csv"))
        # Mapping plus propre :
        path = output_dir / {
            "obd":         "obd_history.csv",
            "telematics":  "telematics_stream.csv",
            "breakdowns":  "breakdowns.csv",
        }[name]

        with open(path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            writer.writerows(rows)
        paths[name] = path
    return paths


def load_csv(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        return list(csv.DictReader(f))


# ── Helper pour générer la flotte par défaut (5 sièges × 15 véhicules) ────────
def default_fleet_specs(n_per_siege: int = 15) -> list[FleetSpec]:
    """Génère une flotte synthétique cohérente avec celle du frontend."""
    rng = random.Random(42)
    types = list(VEHICLE_PROFILES.keys())
    fleet = []
    counter = 1
    for siege in SIEGES_GPS:
        for _ in range(n_per_siege):
            vid = f"V{counter:03d}"
            fleet.append(FleetSpec(
                vehicle_id=vid,
                vehicle_type=rng.choice(types),
                siege=siege,
                odometer_km=rng.uniform(40_000, 200_000),
                km_since_maintenance=rng.uniform(0, 4500),
                driver_profile=_hash_pick(vid, ["safe", "neutre", "neutre", "neutre", "aggressif"]),
            ))
            counter += 1
    return fleet


# ── Point d'entrée CLI ────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    # Force UTF-8 sur stdout pour Windows
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    output_dir = Path(__file__).parent / "samples"
    print(f"[*] Generation des datasets historiques dans : {output_dir}")
    fleet = default_fleet_specs(n_per_siege=15)
    print(f"    Flotte : {len(fleet)} vehicules sur {len(SIEGES_GPS)} sieges")
    datasets = generate_historical(fleet, days=180)
    paths = save_csvs(datasets, output_dir)
    for name, path in paths.items():
        n = sum(1 for _ in open(path)) - 1
        print(f"    [OK] {name:12s} -> {path.name}  ({n} lignes)")
    print("[OK] Datasets generes.")
