"""
Schéma SQLAlchemy de la base cyber.db.
======================================
Organisation : 2 tables de référence (registres) + 8 tables de faits.

Référentiels :
    vehicles_registry, drivers_registry

Faits capteurs (push automatique) :
    obd_readings, gps_pings, telemetrics_events

Faits saisis (formulaires) :
    fuel_refills, incidents, breakdowns,
    maintenance_interventions, missions
"""

from __future__ import annotations
import uuid
from datetime import datetime

from sqlalchemy import (
    Column, String, Integer, Float, DateTime, Boolean, Text, ForeignKey, Index
)
from sqlalchemy.orm import relationship

from .database import Base


def _uuid8() -> str:
    return str(uuid.uuid4())[:8]


# ═══════════════════════════════════════════════════════════════════════════════
#  RÉFÉRENTIELS
# ═══════════════════════════════════════════════════════════════════════════════
class Vehicle(Base):
    __tablename__ = "vehicles_registry"

    id            = Column(String, primary_key=True)          # ex: V001
    plate         = Column(String, unique=True, nullable=True) # ex: 12345-A-6
    type          = Column(String, nullable=False)             # Cargo 3.5t, VLTT, ...
    depot_siege   = Column(String, nullable=False)             # Casablanca, ...
    year          = Column(Integer, nullable=True)
    capacity_kg   = Column(Integer, nullable=True)
    odometer_km   = Column(Float,   default=0)
    last_maint_km = Column(Float,   default=0)
    status        = Column(String,  default="active")          # active, inactive, scrapped
    created_at    = Column(DateTime, default=datetime.utcnow)
    updated_at    = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Driver(Base):
    __tablename__ = "drivers_registry"

    id            = Column(String, primary_key=True, default=_uuid8)
    full_name     = Column(String, nullable=False)
    license_class = Column(String, nullable=True)              # B, C, D...
    profile       = Column(String, default="neutre")           # safe | neutre | aggressif
    home_siege    = Column(String, nullable=False)
    phone         = Column(String, nullable=True)
    hired_at      = Column(DateTime, default=datetime.utcnow)
    status        = Column(String, default="active")


# ═══════════════════════════════════════════════════════════════════════════════
#  FAITS — Capteurs (push automatique haute fréquence)
# ═══════════════════════════════════════════════════════════════════════════════
class ObdReading(Base):
    """Lecture OBD-II envoyée par le boîtier embarqué."""
    __tablename__ = "obd_readings"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    vehicle_id      = Column(String, ForeignKey("vehicles_registry.id"), index=True)
    ts              = Column(DateTime, index=True, default=datetime.utcnow)
    rpm             = Column(Integer)
    engine_temp_c   = Column(Float)
    engine_load_pct = Column(Float)
    fuel_level_pct  = Column(Float, nullable=True)
    odometer_km     = Column(Float)
    source          = Column(String, default="obd_box")        # obd_box, manual_import...

Index("ix_obd_vehicle_ts", ObdReading.vehicle_id, ObdReading.ts)


class GpsPing(Base):
    """Position GPS du véhicule, transmise par tracker."""
    __tablename__ = "gps_pings"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    vehicle_id  = Column(String, ForeignKey("vehicles_registry.id"), index=True)
    ts          = Column(DateTime, index=True, default=datetime.utcnow)
    lat         = Column(Float, nullable=False)
    lon         = Column(Float, nullable=False)
    speed_kmh   = Column(Float)
    heading_deg = Column(Float, nullable=True)

Index("ix_gps_vehicle_ts", GpsPing.vehicle_id, GpsPing.ts)


class TelemetricsEvent(Base):
    """Événement de conduite remarquable (freinage brusque, sur-régime, ...)."""
    __tablename__ = "telemetrics_events"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    vehicle_id  = Column(String, ForeignKey("vehicles_registry.id"), index=True)
    driver_id   = Column(String, ForeignKey("drivers_registry.id"), nullable=True)
    ts          = Column(DateTime, index=True, default=datetime.utcnow)
    event_type  = Column(String, nullable=False)              # hard_brake, hard_accel, sharp_corner, over_rev
    severity    = Column(String, default="normal")            # normal | warning | critical
    accel_mps2  = Column(Float, nullable=True)
    lateral_g   = Column(Float, nullable=True)
    speed_kmh   = Column(Float, nullable=True)
    lat         = Column(Float, nullable=True)
    lon         = Column(Float, nullable=True)


# ═══════════════════════════════════════════════════════════════════════════════
#  FAITS — Saisies conducteur
# ═══════════════════════════════════════════════════════════════════════════════
class FuelRefill(Base):
    """Plein de carburant saisi par le conducteur."""
    __tablename__ = "fuel_refills"

    id            = Column(String, primary_key=True, default=_uuid8)
    vehicle_id    = Column(String, ForeignKey("vehicles_registry.id"), index=True)
    driver_id     = Column(String, ForeignKey("drivers_registry.id"), nullable=True)
    ts            = Column(DateTime, index=True, default=datetime.utcnow)
    liters        = Column(Float, nullable=False)
    cost_mad      = Column(Float, nullable=False)
    km_at_refill  = Column(Float, nullable=False)
    station       = Column(String, nullable=True)
    fuel_type     = Column(String, default="diesel")
    reported_by   = Column(String, nullable=True)              # username


class Incident(Base):
    """Incident reporté par le conducteur (accident, alerte, autre)."""
    __tablename__ = "incidents"

    id          = Column(String, primary_key=True, default=_uuid8)
    vehicle_id  = Column(String, ForeignKey("vehicles_registry.id"), index=True)
    driver_id   = Column(String, ForeignKey("drivers_registry.id"), nullable=True)
    ts          = Column(DateTime, index=True, default=datetime.utcnow)
    type        = Column(String, nullable=False)               # accident, near_miss, weather, other
    severity    = Column(String, default="minor")              # minor, moderate, major
    description = Column(Text, nullable=False)
    lat         = Column(Float, nullable=True)
    lon         = Column(Float, nullable=True)
    reported_by = Column(String, nullable=True)


class OdometerManualReading(Base):
    """Relevé manuel d'odomètre (fin de journée par exemple)."""
    __tablename__ = "odometer_manual"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    vehicle_id  = Column(String, ForeignKey("vehicles_registry.id"), index=True)
    ts          = Column(DateTime, default=datetime.utcnow)
    km          = Column(Float, nullable=False)
    reported_by = Column(String, nullable=True)


# ═══════════════════════════════════════════════════════════════════════════════
#  FAITS — Saisies chef de parc
# ═══════════════════════════════════════════════════════════════════════════════
class Breakdown(Base):
    """Panne déclarée. Cycle : reported → in_repair → repaired."""
    __tablename__ = "breakdowns"

    id                   = Column(String, primary_key=True, default=_uuid8)
    vehicle_id           = Column(String, ForeignKey("vehicles_registry.id"), index=True)
    ts                   = Column(DateTime, index=True, default=datetime.utcnow)
    piece                = Column(String, nullable=False)      # turbo, freins, ...
    root_cause           = Column(String, nullable=True)
    km_at_break          = Column(Float, nullable=True)
    status               = Column(String, default="reported")  # reported | in_repair | repaired | cancelled
    repair_cost_mad      = Column(Float, default=0)
    repair_started_at    = Column(DateTime, nullable=True)
    repair_completed_at  = Column(DateTime, nullable=True)
    workshop             = Column(String, nullable=True)
    reported_by          = Column(String, nullable=True)
    notes                = Column(Text, nullable=True)


class MaintenanceIntervention(Base):
    """Intervention de maintenance planifiée ou curative."""
    __tablename__ = "maintenance_interventions"

    id                 = Column(String, primary_key=True, default=_uuid8)
    vehicle_id         = Column(String, ForeignKey("vehicles_registry.id"), index=True)
    ts                 = Column(DateTime, index=True, default=datetime.utcnow)
    type               = Column(String, nullable=False)        # preventive, corrective, inspection
    pieces_replaced    = Column(Text, nullable=True)            # JSON serialisé
    cost_mad           = Column(Float, default=0)
    km_at_intervention = Column(Float, nullable=True)
    workshop           = Column(String, nullable=True)
    reported_by        = Column(String, nullable=True)
    notes              = Column(Text, nullable=True)


class Mission(Base):
    """Mission de transport assignée à un véhicule + chauffeur."""
    __tablename__ = "missions"

    id              = Column(String, primary_key=True, default=_uuid8)
    vehicle_id      = Column(String, ForeignKey("vehicles_registry.id"), index=True)
    driver_id       = Column(String, ForeignKey("drivers_registry.id"), nullable=True)
    pickup_siege    = Column(String, nullable=False)
    delivery_siege  = Column(String, nullable=False)
    mission_type    = Column(String, default="Transport marchandise")
    demand_kg       = Column(Integer, default=1)
    priority        = Column(Integer, default=1)               # 1=normal, 5=urgent
    scheduled_at    = Column(DateTime, nullable=True)
    started_at      = Column(DateTime, nullable=True)
    completed_at    = Column(DateTime, nullable=True)
    status          = Column(String, default="scheduled")      # scheduled | active | completed | cancelled
    distance_km     = Column(Float, nullable=True)
    duration_min    = Column(Float, nullable=True)
    reported_by     = Column(String, nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)
