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
