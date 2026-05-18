"""
Router FastAPI /cyber/* — Couche d'ingestion + lecture de la base cyber.db.
==========================================================================
Regroupe :
    - Référentiels : véhicules + chauffeurs
    - Ingestion capteurs (haute fréquence, batch)
    - Saisies conducteur (formulaires : plein, incident, km manuel)
    - Saisies chef de parc (panne, intervention, mission)
    - Lecture (timeline, recent, stats)
    - Seed + simulator (admin)
"""

from __future__ import annotations
import json
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from .database import get_db, init_db, SessionLocal
from .models import (
    Vehicle, Driver, ObdReading, GpsPing, TelemetricsEvent,
    FuelRefill, Incident, OdometerManualReading, Breakdown,
    MaintenanceIntervention, Mission,
)
from .schemas import (
    VehicleIn, DriverIn,
    ObdReadingIn, GpsPingIn, TelemetricsEventIn, BatchIngest,
    FuelRefillIn, IncidentIn, OdometerManualIn,
    BreakdownIn, BreakdownStatusUpdate,
    MaintenanceIn, MissionIn, MissionStatusUpdate,
    GenericResponse,
)
from .simulator import get_simulator


router = APIRouter(prefix="/cyber", tags=["Cyber Layer (Data Acquisition)"])


# Au démarrage du module : crée les tables si pas encore là
init_db()


# ═══════════════════════════════════════════════════════════════════════════════
#  RÉFÉRENTIELS — Véhicules
# ═══════════════════════════════════════════════════════════════════════════════
@router.get("/vehicles")
def list_vehicles(siege: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(Vehicle)
    if siege:
        q = q.filter(Vehicle.depot_siege == siege)
    rows = q.order_by(Vehicle.id).all()
    return [{"id": v.id, "plate": v.plate, "type": v.type, "depot_siege": v.depot_siege,
             "year": v.year, "capacity_kg": v.capacity_kg, "odometer_km": v.odometer_km,
             "last_maint_km": v.last_maint_km, "status": v.status,
             "created_at": v.created_at.isoformat() if v.created_at else None} for v in rows]


@router.get("/vehicles/{vehicle_id}")
def get_vehicle(vehicle_id: str, db: Session = Depends(get_db)):
    v = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not v: raise HTTPException(404, "Véhicule introuvable")

    # Stats associées
    n_obd  = db.query(func.count(ObdReading.id)).filter(ObdReading.vehicle_id == vehicle_id).scalar()
    n_gps  = db.query(func.count(GpsPing.id)).filter(GpsPing.vehicle_id == vehicle_id).scalar()
    n_evt  = db.query(func.count(TelemetricsEvent.id)).filter(TelemetricsEvent.vehicle_id == vehicle_id).scalar()
    n_brk  = db.query(func.count(Breakdown.id)).filter(Breakdown.vehicle_id == vehicle_id).scalar()
    n_mis  = db.query(func.count(Mission.id)).filter(Mission.vehicle_id == vehicle_id).scalar()

    return {
        "id": v.id, "plate": v.plate, "type": v.type, "depot_siege": v.depot_siege,
        "year": v.year, "capacity_kg": v.capacity_kg, "odometer_km": v.odometer_km,
        "last_maint_km": v.last_maint_km, "km_since_maintenance": (v.odometer_km or 0) - (v.last_maint_km or 0),
        "status": v.status,
        "stats": {"obd_readings": n_obd, "gps_pings": n_gps, "events": n_evt,
                  "breakdowns": n_brk, "missions": n_mis},
    }


@router.post("/vehicles", response_model=GenericResponse)
def upsert_vehicle(payload: VehicleIn, db: Session = Depends(get_db)):
    existing = db.query(Vehicle).filter(Vehicle.id == payload.id).first()
    if existing:
        for k, val in payload.dict(exclude_unset=True).items():
            setattr(existing, k, val)
    else:
        db.add(Vehicle(**payload.dict()))
    db.commit()
    return {"status": "ok", "id": payload.id, "detail": "Véhicule créé/mis à jour"}


# ═══════════════════════════════════════════════════════════════════════════════
#  RÉFÉRENTIELS — Chauffeurs
# ═══════════════════════════════════════════════════════════════════════════════
@router.get("/drivers")
def list_drivers(siege: Optional[str] = None, profile: Optional[str] = None,
                 db: Session = Depends(get_db)):
    q = db.query(Driver)
    if siege:   q = q.filter(Driver.home_siege == siege)
    if profile: q = q.filter(Driver.profile == profile)
    rows = q.order_by(Driver.full_name).all()
    return [{"id": d.id, "full_name": d.full_name, "license_class": d.license_class,
             "profile": d.profile, "home_siege": d.home_siege, "phone": d.phone,
             "hired_at": d.hired_at.isoformat() if d.hired_at else None,
             "status": d.status} for d in rows]


@router.post("/drivers", response_model=GenericResponse)
def create_driver(payload: DriverIn, db: Session = Depends(get_db)):
    drv = Driver(**payload.dict(exclude_unset=True))
    db.add(drv); db.commit(); db.refresh(drv)
    return {"status": "ok", "id": drv.id, "detail": "Chauffeur créé"}


# ═══════════════════════════════════════════════════════════════════════════════
#  INGESTION — Capteurs (push automatique)
# ═══════════════════════════════════════════════════════════════════════════════
@router.post("/ingest/obd")
def ingest_obd(payload: ObdReadingIn, db: Session = Depends(get_db)):
    """Ingestion d'une lecture OBD unique (typiquement depuis le boîtier embarqué)."""
    row = ObdReading(**payload.dict(exclude_unset=True))
    if row.ts is None: row.ts = datetime.utcnow()
    db.add(row); db.commit()
    return {"status": "ingested", "type": "obd"}


@router.post("/ingest/obd-batch")
def ingest_obd_batch(payload: BatchIngest, db: Session = Depends(get_db)):
    """Bulk insert OBD (recommandé : envoyer N readings d'un coup)."""
    n = 0
    for item in payload.items:
        db.add(ObdReading(**item))
        n += 1
    db.commit()
    return {"status": "ingested", "type": "obd", "count": n}


@router.post("/ingest/gps")
def ingest_gps(payload: GpsPingIn, db: Session = Depends(get_db)):
    row = GpsPing(**payload.dict(exclude_unset=True))
    if row.ts is None: row.ts = datetime.utcnow()
    db.add(row); db.commit()
    return {"status": "ingested", "type": "gps"}


@router.post("/ingest/gps-batch")
def ingest_gps_batch(payload: BatchIngest, db: Session = Depends(get_db)):
    n = 0
    for item in payload.items:
        db.add(GpsPing(**item))
        n += 1
    db.commit()
    return {"status": "ingested", "type": "gps", "count": n}


@router.post("/ingest/event")
def ingest_event(payload: TelemetricsEventIn, db: Session = Depends(get_db)):
    row = TelemetricsEvent(**payload.dict(exclude_unset=True))
    if row.ts is None: row.ts = datetime.utcnow()
    db.add(row); db.commit()
    return {"status": "ingested", "type": "event"}


# ═══════════════════════════════════════════════════════════════════════════════
#  SAISIES CONDUCTEUR
# ═══════════════════════════════════════════════════════════════════════════════
@router.post("/report/refuel", response_model=GenericResponse)
def report_refuel(payload: FuelRefillIn, db: Session = Depends(get_db)):
    row = FuelRefill(**payload.dict())
    db.add(row); db.commit(); db.refresh(row)
    return {"status": "ok", "id": row.id, "detail": f"{payload.liters}L à {payload.cost_mad} MAD enregistrés"}


@router.post("/report/incident", response_model=GenericResponse)
def report_incident(payload: IncidentIn, db: Session = Depends(get_db)):
    row = Incident(**payload.dict())
    db.add(row); db.commit(); db.refresh(row)
    return {"status": "ok", "id": row.id, "detail": "Incident enregistré"}


@router.post("/report/odometer", response_model=GenericResponse)
def report_odometer(payload: OdometerManualIn, db: Session = Depends(get_db)):
    row = OdometerManualReading(**payload.dict())
    db.add(row)
    # Aussi mettre à jour le registre véhicule
    v = db.query(Vehicle).filter(Vehicle.id == payload.vehicle_id).first()
    if v and payload.km > (v.odometer_km or 0):
        v.odometer_km = payload.km
    db.commit()
    return {"status": "ok", "detail": f"Odomètre mis à {payload.km} km"}


# ═══════════════════════════════════════════════════════════════════════════════
#  SAISIES CHEF DE PARC
# ═══════════════════════════════════════════════════════════════════════════════
@router.post("/manage/breakdown", response_model=GenericResponse)
def declare_breakdown(payload: BreakdownIn, db: Session = Depends(get_db)):
    row = Breakdown(**payload.dict())
    db.add(row); db.commit(); db.refresh(row)
    return {"status": "ok", "id": row.id, "detail": f"Panne {payload.piece} déclarée"}


@router.put("/manage/breakdown/{breakdown_id}", response_model=GenericResponse)
def update_breakdown(breakdown_id: str, payload: BreakdownStatusUpdate,
                     db: Session = Depends(get_db)):
    bd = db.query(Breakdown).filter(Breakdown.id == breakdown_id).first()
    if not bd: raise HTTPException(404, "Panne introuvable")
    bd.status = payload.status
    if payload.repair_cost_mad is not None: bd.repair_cost_mad = payload.repair_cost_mad
    if payload.workshop:                     bd.workshop = payload.workshop
    if payload.notes:                        bd.notes = (bd.notes or "") + "\n" + payload.notes
    now = datetime.utcnow()
    if payload.status == "in_repair" and not bd.repair_started_at:
        bd.repair_started_at = now
    if payload.status == "repaired":
        bd.repair_completed_at = now
    db.commit()
    return {"status": "ok", "id": breakdown_id, "detail": f"Statut → {payload.status}"}


@router.post("/manage/maintenance", response_model=GenericResponse)
def declare_maintenance(payload: MaintenanceIn, db: Session = Depends(get_db)):
    data = payload.dict()
    if data.get("pieces_replaced") is not None:
        data["pieces_replaced"] = json.dumps(data["pieces_replaced"])
    row = MaintenanceIntervention(**data)
    db.add(row)
    # Mettre à jour last_maint_km
    v = db.query(Vehicle).filter(Vehicle.id == payload.vehicle_id).first()
    if v and payload.km_at_intervention:
        v.last_maint_km = payload.km_at_intervention
    db.commit(); db.refresh(row)
    return {"status": "ok", "id": row.id, "detail": f"Intervention {payload.type} enregistrée"}


@router.post("/manage/mission", response_model=GenericResponse)
def create_mission(payload: MissionIn, db: Session = Depends(get_db)):
    row = Mission(**payload.dict())
    db.add(row); db.commit(); db.refresh(row)
    return {"status": "ok", "id": row.id, "detail": "Mission planifiée"}


@router.put("/manage/mission/{mission_id}", response_model=GenericResponse)
def update_mission(mission_id: str, payload: MissionStatusUpdate,
                   db: Session = Depends(get_db)):
    m = db.query(Mission).filter(Mission.id == mission_id).first()
    if not m: raise HTTPException(404, "Mission introuvable")
    for k, v in payload.dict(exclude_unset=True).items():
        setattr(m, k, v)
    db.commit()
    return {"status": "ok", "id": mission_id, "detail": f"Statut → {payload.status}"}


# ═══════════════════════════════════════════════════════════════════════════════
#  LECTURE
# ═══════════════════════════════════════════════════════════════════════════════
@router.get("/vehicles/{vehicle_id}/obd")
def vehicle_obd_recent(vehicle_id: str, limit: int = Query(100, le=2000),
                        db: Session = Depends(get_db)):
    rows = (db.query(ObdReading)
              .filter(ObdReading.vehicle_id == vehicle_id)
              .order_by(desc(ObdReading.ts))
              .limit(limit).all())
    return [{"ts": r.ts.isoformat(), "rpm": r.rpm, "engine_temp_c": r.engine_temp_c,
             "engine_load_pct": r.engine_load_pct, "fuel_level_pct": r.fuel_level_pct,
             "odometer_km": r.odometer_km, "source": r.source} for r in rows]


@router.get("/vehicles/{vehicle_id}/gps")
def vehicle_gps_recent(vehicle_id: str, limit: int = Query(200, le=5000),
                        db: Session = Depends(get_db)):
    rows = (db.query(GpsPing)
              .filter(GpsPing.vehicle_id == vehicle_id)
              .order_by(desc(GpsPing.ts))
              .limit(limit).all())
    return [{"ts": r.ts.isoformat(), "lat": r.lat, "lon": r.lon,
             "speed_kmh": r.speed_kmh, "heading_deg": r.heading_deg} for r in rows]


@router.get("/vehicles/{vehicle_id}/events")
def vehicle_events_recent(vehicle_id: str, limit: int = Query(100, le=2000),
                          db: Session = Depends(get_db)):
    rows = (db.query(TelemetricsEvent)
              .filter(TelemetricsEvent.vehicle_id == vehicle_id)
              .order_by(desc(TelemetricsEvent.ts))
              .limit(limit).all())
    return [{"ts": r.ts.isoformat(), "type": r.event_type, "severity": r.severity,
             "speed_kmh": r.speed_kmh, "accel_mps2": r.accel_mps2,
             "lateral_g": r.lateral_g, "driver_id": r.driver_id,
             "lat": r.lat, "lon": r.lon} for r in rows]


@router.get("/vehicles/{vehicle_id}/timeline")
def vehicle_timeline(vehicle_id: str, days_back: int = Query(30, ge=1, le=365),
                     db: Session = Depends(get_db)):
    """Timeline chronologique unifiée : breakdowns + maintenance + missions + incidents."""
    cutoff = datetime.utcnow() - timedelta(days=days_back)
    out = []

    for bd in db.query(Breakdown).filter(Breakdown.vehicle_id == vehicle_id, Breakdown.ts >= cutoff).all():
        out.append({"ts": bd.ts.isoformat(), "kind": "breakdown",
                    "title": f"Panne {bd.piece}", "status": bd.status,
                    "cost_mad": bd.repair_cost_mad, "id": bd.id})

    for m in db.query(MaintenanceIntervention).filter(
        MaintenanceIntervention.vehicle_id == vehicle_id,
        MaintenanceIntervention.ts >= cutoff).all():
        out.append({"ts": m.ts.isoformat(), "kind": "maintenance",
                    "title": f"Maintenance {m.type}", "cost_mad": m.cost_mad,
                    "workshop": m.workshop, "id": m.id})

    for ms in db.query(Mission).filter(
        Mission.vehicle_id == vehicle_id,
        Mission.scheduled_at >= cutoff).all():
        out.append({"ts": ms.scheduled_at.isoformat() if ms.scheduled_at else "",
                    "kind": "mission",
                    "title": f"Mission {ms.pickup_siege} → {ms.delivery_siege}",
                    "status": ms.status, "id": ms.id})

    for inc in db.query(Incident).filter(Incident.vehicle_id == vehicle_id, Incident.ts >= cutoff).all():
        out.append({"ts": inc.ts.isoformat(), "kind": "incident",
                    "title": f"{inc.type} ({inc.severity})",
                    "description": inc.description, "id": inc.id})

    for fr in db.query(FuelRefill).filter(FuelRefill.vehicle_id == vehicle_id, FuelRefill.ts >= cutoff).all():
        out.append({"ts": fr.ts.isoformat(), "kind": "refuel",
                    "title": f"Plein {fr.liters}L @ {fr.station}",
                    "cost_mad": fr.cost_mad, "id": fr.id})

    out.sort(key=lambda x: x["ts"], reverse=True)
    return {"vehicle_id": vehicle_id, "count": len(out), "events": out}


@router.get("/breakdowns")
def list_breakdowns(status: Optional[str] = None, limit: int = Query(100, le=500),
                    db: Session = Depends(get_db)):
    q = db.query(Breakdown)
    if status: q = q.filter(Breakdown.status == status)
    rows = q.order_by(desc(Breakdown.ts)).limit(limit).all()
    return [{"id": r.id, "vehicle_id": r.vehicle_id, "ts": r.ts.isoformat(),
             "piece": r.piece, "root_cause": r.root_cause, "status": r.status,
             "km_at_break": r.km_at_break, "repair_cost_mad": r.repair_cost_mad,
             "workshop": r.workshop, "reported_by": r.reported_by} for r in rows]


@router.get("/missions")
def list_missions(status: Optional[str] = None, limit: int = Query(100, le=500),
                  db: Session = Depends(get_db)):
    q = db.query(Mission)
    if status: q = q.filter(Mission.status == status)
    rows = q.order_by(desc(Mission.created_at)).limit(limit).all()
    return [{"id": r.id, "vehicle_id": r.vehicle_id, "driver_id": r.driver_id,
             "pickup_siege": r.pickup_siege, "delivery_siege": r.delivery_siege,
             "mission_type": r.mission_type, "status": r.status,
             "scheduled_at": r.scheduled_at.isoformat() if r.scheduled_at else None,
             "completed_at": r.completed_at.isoformat() if r.completed_at else None,
             "distance_km": r.distance_km, "duration_min": r.duration_min} for r in rows]


# ═══════════════════════════════════════════════════════════════════════════════
#  STATS GLOBALES
# ═══════════════════════════════════════════════════════════════════════════════
@router.get("/stats")
def global_stats(db: Session = Depends(get_db)):
    """Statistiques globales de la base cyber.db."""
    now = datetime.utcnow()
    cutoff_30d = now - timedelta(days=30)

    total_fuel_30d_mad = (db.query(func.sum(FuelRefill.cost_mad))
                            .filter(FuelRefill.ts >= cutoff_30d).scalar() or 0)
    total_fuel_30d_l   = (db.query(func.sum(FuelRefill.liters))
                            .filter(FuelRefill.ts >= cutoff_30d).scalar() or 0)
    total_repair_cost  = (db.query(func.sum(Breakdown.repair_cost_mad)).scalar() or 0)
    total_maint_cost   = (db.query(func.sum(MaintenanceIntervention.cost_mad)).scalar() or 0)
    missions_completed = db.query(Mission).filter(Mission.status == "completed").count()

    return {
        "registry": {
            "vehicles": db.query(Vehicle).count(),
            "drivers":  db.query(Driver).count(),
        },
        "sensors": {
            "obd_readings_total":  db.query(ObdReading).count(),
            "gps_pings_total":     db.query(GpsPing).count(),
            "events_total":        db.query(TelemetricsEvent).count(),
        },
        "operations": {
            "breakdowns_total":    db.query(Breakdown).count(),
            "breakdowns_reported": db.query(Breakdown).filter(Breakdown.status == "reported").count(),
            "breakdowns_repair":   db.query(Breakdown).filter(Breakdown.status == "in_repair").count(),
            "maintenance_total":   db.query(MaintenanceIntervention).count(),
            "missions_total":      db.query(Mission).count(),
            "missions_completed":  missions_completed,
            "incidents_total":     db.query(Incident).count(),
        },
        "finance": {
            "fuel_30d_mad":   round(float(total_fuel_30d_mad), 2),
            "fuel_30d_l":     round(float(total_fuel_30d_l), 1),
            "repair_total":   round(float(total_repair_cost), 2),
            "maint_total":    round(float(total_maint_cost), 2),
        },
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  SEED + SIMULATOR
# ═══════════════════════════════════════════════════════════════════════════════
@router.post("/seed")
def seed_database(days_back: int = Query(90, ge=7, le=365),
                  purge:     bool = Query(False),
                  obd_step:  int  = Query(1800, ge=60, le=3600),
                  gps_step:  int  = Query(600,  ge=60, le=3600)):
    """Hydrate la base cyber.db avec données réalistes (peut prendre 30-90s)."""
    from .seed import seed_all
    db = SessionLocal()
    try:
        stats = seed_all(db, days_back=days_back, purge=purge,
                          obd_step=obd_step, gps_step=gps_step)
        return {"status": "seeded", "config": {"days_back": days_back, "purge": purge},
                "counts": stats}
    finally:
        db.close()


@router.post("/simulator/start")
def simulator_start(interval_s: float = Query(5.0, ge=1.0, le=60.0)):
    return get_simulator().start(interval_s)


@router.post("/simulator/stop")
def simulator_stop():
    return get_simulator().stop()


@router.get("/simulator/status")
def simulator_status():
    return get_simulator().status()
