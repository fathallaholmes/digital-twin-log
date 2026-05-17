"""
Router FastAPI agrégeant tous les endpoints /ai/* du module ai_extensions.
=========================================================================

Architecture :
    /ai/iot/snapshot                     → Tick IoT pour un véhicule
    /ai/iot/snapshot/all                 → Tick IoT pour toute la flotte
    /ai/iot/stream                       → Stream SSE temps réel
    /ai/iot/historical                   → Agrégats journaliers (depuis CSV)
    /ai/iot/dataset/stats                → Stats du dataset historique
    /ai/iot/dataset/regenerate           → Régénère les CSV (admin)
    /ai/iot/breakdowns                   → Liste des pannes étiquetées

Les briques B-G (modèles ML, optimisation, NLG) viendront s'ajouter ici
au fur et à mesure.
"""

from __future__ import annotations
import asyncio
import json
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .data.iot_generator import (
    get_generator, SIEGES_GPS, VEHICLE_PROFILES, DRIVER_PROFILES,
)
from .data.synthetic_dataset import (
    default_fleet_specs, generate_historical, save_csvs, load_csv,
)
from .models import maintenance_predictive as mp
from .models import anomaly_detector       as ad
from .models import what_if_simulator      as wi
from .decision import route_optimizer       as ro
from .decision import recommendation_engine as re_engine
from .nlg      import narrator              as nlg


router = APIRouter(prefix="/ai", tags=["AI Extensions"])

# Dossier des CSV samples
SAMPLES_DIR = Path(__file__).parent / "data" / "samples"


# ── Génération paresseuse du dataset au premier appel ────────────────────────
def _ensure_dataset_exists():
    """Si les CSV n'existent pas, génère le dataset par défaut."""
    obd_path = SAMPLES_DIR / "obd_history.csv"
    if not obd_path.exists():
        fleet = default_fleet_specs(n_per_siege=15)
        datasets = generate_historical(fleet, days=180)
        save_csvs(datasets, SAMPLES_DIR)


# ── Schémas Pydantic ─────────────────────────────────────────────────────────
class VehicleRegister(BaseModel):
    vehicle_id:           str
    vehicle_type:         str = "Cargo 3.5t"
    siege:                str = "Casablanca"
    driver:               str = "neutre"
    km_since_maintenance: float = 0
    odometer_km:          float = 0


# ── Endpoints IoT temps réel ─────────────────────────────────────────────────
@router.get("/iot/snapshot")
def iot_snapshot(vehicle_id: str = Query(..., description="ID du véhicule, ex: V001")):
    """Renvoie un tick IoT instantané pour un véhicule."""
    gen = get_generator()
    return gen.next_tick(vehicle_id)


@router.get("/iot/snapshot/all")
def iot_snapshot_all(
    vehicle_ids: Optional[str] = Query(None, description="IDs séparés par virgule. Si vide, génère V001..V075"),
):
    """Renvoie un tick IoT pour plusieurs véhicules (ou la flotte par défaut)."""
    gen = get_generator()
    if vehicle_ids:
        ids = [v.strip() for v in vehicle_ids.split(",") if v.strip()]
    else:
        ids = [f"V{i:03d}" for i in range(1, 76)]
    return {"count": len(ids), "ticks": gen.snapshot_all(ids)}


@router.get("/iot/stream")
async def iot_stream(
    vehicle_ids: Optional[str] = Query(None),
    interval_s:  float = Query(2.0, ge=0.5, le=10.0),
):
    """
    Stream SSE (Server-Sent Events). Pousse un batch toutes les `interval_s` secondes.
    Côté frontend : utiliser `EventSource("/ai/iot/stream")`.
    """
    gen = get_generator()
    if vehicle_ids:
        ids = [v.strip() for v in vehicle_ids.split(",") if v.strip()]
    else:
        ids = [f"V{i:03d}" for i in range(1, 21)]   # default 20 véhicules

    async def event_generator():
        try:
            while True:
                ticks = gen.snapshot_all(ids)
                payload = json.dumps({"ticks": ticks})
                yield f"data: {payload}\n\n"
                await asyncio.sleep(interval_s)
        except asyncio.CancelledError:
            return

    return StreamingResponse(event_generator(), media_type="text/event-stream",
                              headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/iot/register")
def iot_register(req: VehicleRegister):
    """(Optionnel) Enregistre/met à jour le profil d'un véhicule dans le générateur."""
    gen = get_generator()
    gen.register_vehicle(
        req.vehicle_id, req.vehicle_type, req.siege,
        driver=req.driver,
        km_since_maintenance=req.km_since_maintenance,
        odometer_km=req.odometer_km,
    )
    return {"status": "registered", "vehicle_id": req.vehicle_id}


# ── Endpoints datasets historiques ───────────────────────────────────────────
@router.get("/iot/historical")
def iot_historical(
    vehicle_id: Optional[str] = Query(None),
    days:       int           = Query(30, ge=1, le=365),
    kind:       str           = Query("obd", regex="^(obd|telematics)$"),
):
    """Renvoie les `days` derniers jours du dataset agrégé."""
    _ensure_dataset_exists()
    fname = "obd_history.csv" if kind == "obd" else "telematics_stream.csv"
    rows  = load_csv(SAMPLES_DIR / fname)
    if vehicle_id:
        rows = [r for r in rows if r.get("vehicle_id") == vehicle_id]
    # Garder les `days` plus récents par date
    rows.sort(key=lambda r: r["date"])
    if len(rows) > days * 75:   # ~75 véhicules
        rows = rows[-days * 75:]
    return {"kind": kind, "vehicle_id": vehicle_id, "days": days, "count": len(rows), "rows": rows}


@router.get("/iot/breakdowns")
def iot_breakdowns(vehicle_id: Optional[str] = None):
    """Liste les pannes étiquetées (vérité terrain pour l'entraînement)."""
    _ensure_dataset_exists()
    rows = load_csv(SAMPLES_DIR / "breakdowns.csv")
    if vehicle_id:
        rows = [r for r in rows if r.get("vehicle_id") == vehicle_id]
    return {"count": len(rows), "breakdowns": rows}


@router.get("/iot/dataset/stats")
def iot_dataset_stats():
    """Stats globales sur le dataset historique."""
    _ensure_dataset_exists()
    obd     = load_csv(SAMPLES_DIR / "obd_history.csv")
    telem   = load_csv(SAMPLES_DIR / "telematics_stream.csv")
    breaks  = load_csv(SAMPLES_DIR / "breakdowns.csv")

    dates    = sorted({r["date"] for r in obd})
    vehicles = sorted({r["vehicle_id"] for r in obd})
    sieges   = sorted({r["siege"] for r in obd})

    return {
        "obd_rows":         len(obd),
        "telematics_rows":  len(telem),
        "breakdowns":       len(breaks),
        "n_vehicles":       len(vehicles),
        "n_sieges":         len(sieges),
        "date_range":       [dates[0], dates[-1]] if dates else [],
        "breakdown_rate":   round(len(breaks) / max(1, len(vehicles)), 3),
        "pieces_top":       _top_breakdown_pieces(breaks),
    }


@router.post("/iot/dataset/regenerate")
def iot_dataset_regenerate(days: int = Query(180, ge=30, le=730)):
    """Régénère intégralement les CSV (peut prendre quelques secondes)."""
    fleet = default_fleet_specs(n_per_siege=15)
    datasets = generate_historical(fleet, days=days)
    paths = save_csvs(datasets, SAMPLES_DIR)
    return {
        "status": "regenerated",
        "days":   days,
        "files":  {k: str(v.name) for k, v in paths.items()},
        "counts": {k: len(v) for k, v in datasets.items()},
    }


@router.get("/iot/profiles")
def iot_profiles():
    """Catalogues des profils véhicules et conducteurs (pour l'UI)."""
    return {
        "vehicle_profiles": VEHICLE_PROFILES,
        "driver_profiles":  DRIVER_PROFILES,
        "sieges_gps":       {k: {"lat": v[0], "lon": v[1]} for k, v in SIEGES_GPS.items()},
    }


# ── Helpers internes ─────────────────────────────────────────────────────────
def _top_breakdown_pieces(breaks: list[dict], top_n: int = 5) -> list[dict]:
    from collections import Counter
    c = Counter(r["piece"] for r in breaks)
    return [{"piece": p, "count": n} for p, n in c.most_common(top_n)]


# ═══════════════════════════════════════════════════════════════════════════════
#  Bloc B — Maintenance prédictive (RandomForest)
# ═══════════════════════════════════════════════════════════════════════════════
class PredictRequest(BaseModel):
    vehicle_id: str

@router.post("/predict/maintenance")
def predict_maintenance(req: PredictRequest):
    """Prédit la probabilité de panne à 30 jours pour un véhicule."""
    _ensure_dataset_exists()
    return mp.predict_for_vehicle(req.vehicle_id)


@router.get("/predict/maintenance/all")
def predict_maintenance_all(
    vehicle_ids: Optional[str] = Query(None, description="IDs séparés par virgule. Défaut : V001..V075"),
    min_risk:    str           = Query("faible", regex="^(faible|modéré|élevé|critique)$"),
):
    """Prédictions pour la flotte, filtrées par niveau de risque minimum."""
    _ensure_dataset_exists()
    ids = ([v.strip() for v in vehicle_ids.split(",")] if vehicle_ids
           else [f"V{i:03d}" for i in range(1, 76)])
    preds = mp.predict_all(ids)

    levels_order = {"faible": 0, "modéré": 1, "élevé": 2, "critique": 3}
    min_lvl = levels_order[min_risk]
    filtered = [p for p in preds
                if "error" not in p and levels_order.get(p["risk_level"], 0) >= min_lvl]
    filtered.sort(key=lambda p: p["probability"], reverse=True)

    # Statistiques globales
    by_level = {"faible": 0, "modéré": 0, "élevé": 0, "critique": 0}
    for p in preds:
        if "error" not in p:
            by_level[p["risk_level"]] = by_level.get(p["risk_level"], 0) + 1

    return {
        "count":           len(filtered),
        "total_evaluated": len(preds),
        "by_risk_level":   by_level,
        "predictions":     filtered,
    }


@router.post("/predict/maintenance/train")
def predict_maintenance_train():
    """Relance l'entraînement du modèle (≈ 1-2 secondes)."""
    _ensure_dataset_exists()
    df = mp.build_training_dataset()
    out = mp.train_model(df, save=True)
    mp.invalidate_cache()
    return {
        "status":  "trained",
        "metrics": out["metrics"],
        "feature_importance": dict(sorted(
            out["feature_importance"].items(), key=lambda x: -x[1])[:8]),
    }


@router.get("/predict/maintenance/model-info")
def predict_maintenance_info():
    """Métadonnées du modèle actuellement chargé."""
    bundle = mp._load_bundle()
    return {
        "trained_at":         bundle["trained_at"],
        "horizon_days":       bundle["horizon_days"],
        "window_days":        bundle["window_days"],
        "metrics":            bundle["metrics"],
        "feature_importance": dict(sorted(
            bundle["feature_importance"].items(), key=lambda x: -x[1])),
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  Bloc C — Détection d'anomalies (Isolation Forest)
# ═══════════════════════════════════════════════════════════════════════════════
class AnomalyScoreRequest(BaseModel):
    speed_avg:      float = 0
    speed_max:      float = 0
    hard_brake_n:   int   = 0
    hard_accel_n:   int   = 0
    sharp_corner_n: int   = 0
    over_rev_n:     int   = 0
    km_today:       float = 0


@router.post("/anomaly/score")
def anomaly_score(req: AnomalyScoreRequest):
    """Score une session arbitraire (ex: agrégat de ticks live)."""
    _ensure_dataset_exists()
    return ad.score_features(req.dict())


@router.get("/anomaly/vehicle/{vehicle_id}")
def anomaly_vehicle(vehicle_id: str):
    """Score la dernière journée connue d'un véhicule."""
    _ensure_dataset_exists()
    return ad.score_vehicle_last_day(vehicle_id)


@router.get("/anomaly/scan")
def anomaly_scan(
    days_back:   int = Query(14, ge=1, le=180),
    max_results: int = Query(50, ge=10, le=200),
):
    """
    Scanne les `days_back` dernières journées de toute la flotte et retourne
    les sessions les plus anormales (pire score par véhicule).
    """
    _ensure_dataset_exists()
    return ad.scan_recent_anomalies(days_back=days_back, max_results=max_results)


@router.post("/anomaly/train")
def anomaly_train(contamination: float = Query(0.05, ge=0.01, le=0.30)):
    """Réentraîne l'Isolation Forest."""
    _ensure_dataset_exists()
    out = ad.train_model(contamination=contamination, save=True)
    ad.invalidate_cache()
    return {"status": "trained", **out}


@router.get("/anomaly/info")
def anomaly_info():
    """Métadonnées du modèle d'anomalies."""
    bundle = ad._load()
    return {
        "trained_at":    bundle["trained_at"],
        "contamination": bundle["contamination"],
        "n_samples":     bundle["n_samples"],
        "n_anomalies":   bundle["n_anomalies"],
        "anomaly_rate":  bundle["anomaly_rate"],
        "score_range":   [bundle["score_min"], bundle["score_max"]],
        "feature_stats": bundle["stats"],
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  Bloc D — What-If Simulator (LightGBM surrogate)
# ═══════════════════════════════════════════════════════════════════════════════
class WhatIfRequest(BaseModel):
    config:             dict          # {siege: n_vehicles}
    demand_multiplier:  float = 1.0
    use_surrogate:      bool  = True  # False = modèle physique (légèrement plus lent)

class WhatIfCompareRequest(BaseModel):
    config_a:           dict
    config_b:           dict
    demand_multiplier:  float = 1.0
    label_a:            str   = "Actuel"
    label_b:            str   = "Proposé"


@router.post("/whatif/simulate")
def whatif_simulate(req: WhatIfRequest):
    """Prédit les KPIs d'une configuration de flotte (≈ 5 ms via surrogate)."""
    return {
        "config":            req.config,
        "demand_multiplier": req.demand_multiplier,
        "kpis":              wi.predict(req.config, req.demand_multiplier, req.use_surrogate),
        "model":             "surrogate" if req.use_surrogate else "physical",
    }


@router.post("/whatif/compare")
def whatif_compare(req: WhatIfCompareRequest):
    """Compare deux configurations côte à côte."""
    return wi.compare(req.config_a, req.config_b, req.demand_multiplier,
                      labels=(req.label_a, req.label_b))


@router.get("/whatif/baseline")
def whatif_baseline(n_per_siege: int = Query(15, ge=0, le=50)):
    """Configuration de référence (15 véhicules/siège par défaut)."""
    cfg = wi.get_baseline_config(n_per_siege)
    kpis = wi.predict(cfg, 1.0)
    return {"config": cfg, "kpis": kpis, "demand_multiplier": 1.0}


@router.post("/whatif/train")
def whatif_train(n_samples: int = Query(5000, ge=500, le=20000)):
    """Réentraîne les 3 surrogate models (≈ 5-10 secondes)."""
    out = wi.train_model(n_samples=n_samples, save=True)
    wi.invalidate_cache()
    return {"status": "trained", **out}


@router.get("/whatif/info")
def whatif_info():
    """Métadonnées du modèle + importances de features."""
    bundle = wi._load()
    return {
        "trained_at":   bundle["trained_at"],
        "sieges":       bundle["sieges"],
        "base_demand":  bundle["base_demand"],
        "metrics":      bundle["metrics"],
        "feature_importance": bundle["feature_importance"],
        "n_train":      bundle["n_train"],
        "n_test":       bundle["n_test"],
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  Bloc E — Optimisation tournées (OR-Tools VRP)
# ═══════════════════════════════════════════════════════════════════════════════
class MissionSchema(BaseModel):
    id:        str
    pickup:    str
    delivery:  str
    demand:    int = 1
    priority:  int = 1

class VehicleSlotSchema(BaseModel):
    id:           str
    depot:        str
    vehicle_type: str = "Cargo 3.5t"
    capacity:     int = 10

class OptimizeRequest(BaseModel):
    missions:           list[MissionSchema]
    vehicles:           list[VehicleSlotSchema]
    departure_hour:     int = 9
    weight_distance:    float = 0.4
    weight_time:        float = 0.4
    weight_co2:         float = 0.2
    time_limit_seconds: int = 5


@router.post("/optimize/routes")
def optimize_routes(req: OptimizeRequest):
    """Lance l'optimisation OR-Tools sur un set de missions + véhicules."""
    missions = [ro.Mission(**m.dict()) for m in req.missions]
    vehicles = [ro.VehicleSlot(**v.dict()) for v in req.vehicles]

    naive = ro.baseline_naive_cost(missions, vehicles, req.departure_hour)
    res   = ro.optimize(
        missions, vehicles,
        departure_hour=req.departure_hour,
        weight_distance=req.weight_distance,
        weight_time=req.weight_time,
        weight_co2=req.weight_co2,
        time_limit_seconds=req.time_limit_seconds,
    )

    gain = {
        "distance_pct":
            round((1 - res.total_distance_km / naive["total_distance_km"]) * 100, 1)
            if naive["total_distance_km"] else 0,
        "duration_pct":
            round((1 - res.total_duration_min / naive["total_duration_min"]) * 100, 1)
            if naive["total_duration_min"] else 0,
        "co2_pct":
            round((1 - res.total_co2_kg / naive["total_co2_kg"]) * 100, 1)
            if naive["total_co2_kg"] else 0,
    }

    return {
        "feasible":           res.feasible,
        "solver_status":      res.solver_status,
        "objective":          res.objective_value,
        "total_distance_km":  res.total_distance_km,
        "total_duration_min": res.total_duration_min,
        "total_co2_kg":       res.total_co2_kg,
        "n_vehicles_used":    len(res.routes),
        "n_vehicles_total":   len(vehicles),
        "n_missions":         len(missions),
        "unserved_missions":  res.unserved_missions,
        "routes":             res.routes,
        "computation_time_ms": res.computation_time_ms,
        "baseline_naive":     naive,
        "gain_vs_naive":      gain,
    }


@router.get("/optimize/demo")
def optimize_demo(n_missions: int = 10, n_vehicles: int = 6, hour: int = 9):
    """Lance une optimisation sur un scénario de démo aléatoire mais reproductible."""
    missions = ro.generate_demo_missions(n_missions)
    vehicles = ro.generate_demo_vehicles(n_vehicles)
    req = OptimizeRequest(
        missions=[MissionSchema(id=m.id, pickup=m.pickup, delivery=m.delivery,
                                 demand=m.demand, priority=m.priority) for m in missions],
        vehicles=[VehicleSlotSchema(id=v.id, depot=v.depot,
                                     vehicle_type=v.vehicle_type, capacity=v.capacity)
                  for v in vehicles],
        departure_hour=hour, time_limit_seconds=3,
    )
    return optimize_routes(req)


@router.get("/optimize/distance-matrix")
def optimize_distance_matrix(hour: int = 9):
    """Matrice distance + durée entre les 5 sièges (utile pour visualisation)."""
    sieges = ro.SIEGES_LIST
    mat = []
    for a in sieges:
        row = []
        for b in sieges:
            row.append({
                "distance_km":  ro.get_distance_km(a, b),
                "duration_min": ro.get_duration_min(a, b, hour),
                "road_type":    ro.get_road_type(a, b) if a != b else "—",
            })
        mat.append(row)
    return {"sieges": sieges, "matrix": mat, "hour_of_day": hour}


# ═══════════════════════════════════════════════════════════════════════════════
#  Bloc F — Recommendation Engine + Bandit ε-greedy
# ═══════════════════════════════════════════════════════════════════════════════
class FeedbackRequest(BaseModel):
    recommendation_id: str
    feedback:          str   # accepted | dismissed | ignored


@router.get("/recommend/list")
def recommend_list(
    days_back:   int = Query(14, ge=1, le=60),
    max_results: int = Query(20, ge=1, le=100),
):
    """Génère la liste des recommandations actives, triée par sévérité + bandit."""
    _ensure_dataset_exists()
    recs = re_engine.generate_recommendations(days_back=days_back, max_results=max_results)
    # Enrichissement avec NLG
    for r in recs:
        r["nlg_banner"]   = nlg.narrate_recommendation(r, level="banner")
        r["nlg_card"]     = nlg.narrate_recommendation(r, level="card")
    return {
        "count":           len(recs),
        "recommendations": recs,
        "generated_at":    datetime.utcnow().isoformat(),
    }


@router.post("/recommend/feedback")
def recommend_feedback(req: FeedbackRequest):
    """Enregistre le feedback utilisateur (accepted/dismissed/ignored) pour le bandit."""
    return re_engine.record_feedback(req.recommendation_id, req.feedback)


@router.get("/recommend/bandit-stats")
def recommend_bandit_stats():
    """Retourne ce que le bandit a appris des feedbacks."""
    return re_engine.get_bandit_stats()


@router.post("/recommend/bandit-reset")
def recommend_bandit_reset():
    """Réinitialise la mémoire du bandit (admin / démo)."""
    re_engine.reset_bandit()
    return {"status": "reset"}


# ═══════════════════════════════════════════════════════════════════════════════
#  Bloc F — NLG Narrator (génération de phrases pour bandeau header + cards)
# ═══════════════════════════════════════════════════════════════════════════════
@router.get("/nlg/banner")
def nlg_banner(max_items: int = Query(5, ge=1, le=10)):
    """
    Sélectionne les top alertes (recommandations + anomalies critiques)
    et renvoie 1-N messages courts pour le bandeau scrolling du header.
    Léger : ne refait pas les prédictions maintenance individuelles.
    """
    _ensure_dataset_exists()
    # Source 1 : recommandations (déjà aggrégées maintenance+anomalies via règles)
    recs = re_engine.generate_recommendations(max_results=15)
    # Source 2 : anomalies critiques (les recos n'incluent que les conducteurs aggressifs)
    anom = ad.scan_recent_anomalies(days_back=14, max_results=20).get("results", [])
    # On passe une liste maint vide pour éviter le predict_all coûteux
    items = nlg.build_banner_messages([], anom, recs, max_items=max_items)
    return {"count": len(items), "items": items}


class NarrateRequest(BaseModel):
    kind:    str    # maintenance | anomaly | optimization | whatif | recommendation
    payload: dict
    level:   str = "card"  # banner | card | detailed


@router.post("/nlg/narrate")
def nlg_narrate(req: NarrateRequest):
    """Génère une phrase NLG à partir d'un payload arbitraire."""
    fn = {
        "maintenance":    nlg.narrate_maintenance,
        "anomaly":        nlg.narrate_anomaly,
        "optimization":   nlg.narrate_optimization,
        "whatif":         nlg.narrate_whatif,
        "recommendation": nlg.narrate_recommendation,
    }.get(req.kind)
    if fn is None:
        raise HTTPException(400, f"kind inconnu : {req.kind}")
    return {"text": fn(req.payload, level=req.level)}
