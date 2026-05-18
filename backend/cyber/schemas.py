"""Schémas Pydantic pour l'ingestion et la lecture de la base cyber.db."""

from __future__ import annotations
from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, Field


# ── Référentiels ─────────────────────────────────────────────────────────────
class VehicleIn(BaseModel):
    id:            str
    plate:         Optional[str] = None
    type:          str
    depot_siege:   str
    year:          Optional[int] = None
    capacity_kg:   Optional[int] = None
    odometer_km:   Optional[float] = 0
    last_maint_km: Optional[float] = 0
    status:        Optional[str] = "active"


class DriverIn(BaseModel):
    id:            Optional[str] = None
    full_name:     str
    license_class: Optional[str] = "B"
    profile:       Optional[str] = "neutre"
    home_siege:    str
    phone:         Optional[str] = None


# ── Capteurs ─────────────────────────────────────────────────────────────────
class ObdReadingIn(BaseModel):
    vehicle_id:      str
    ts:              Optional[datetime] = None
    rpm:             int
    engine_temp_c:   float
    engine_load_pct: float
    fuel_level_pct:  Optional[float] = None
    odometer_km:     float
    source:          Optional[str] = "obd_box"


class GpsPingIn(BaseModel):
    vehicle_id:  str
    ts:          Optional[datetime] = None
    lat:         float
    lon:         float
    speed_kmh:   float
    heading_deg: Optional[float] = None


class TelemetricsEventIn(BaseModel):
    vehicle_id: str
    driver_id:  Optional[str] = None
    ts:         Optional[datetime] = None
    event_type: str = Field(..., description="hard_brake | hard_accel | sharp_corner | over_rev")
    severity:   Optional[str] = "normal"
    accel_mps2: Optional[float] = None
    lateral_g:  Optional[float] = None
    speed_kmh:  Optional[float] = None
    lat:        Optional[float] = None
    lon:        Optional[float] = None


class BatchIngest(BaseModel):
    """Pour pousser plusieurs lignes d'un coup (recommandé pour les capteurs)."""
    items: List[dict]


# ── Saisies conducteur ───────────────────────────────────────────────────────
class FuelRefillIn(BaseModel):
    vehicle_id:   str
    driver_id:    Optional[str] = None
    liters:       float = Field(..., gt=0)
    cost_mad:     float = Field(..., ge=0)
    km_at_refill: float = Field(..., ge=0)
    station:      Optional[str] = None
    fuel_type:    Optional[str] = "diesel"


class IncidentIn(BaseModel):
    vehicle_id:  str
    driver_id:   Optional[str] = None
    type:        str = Field(..., description="accident | near_miss | weather | other")
    severity:    Optional[str] = "minor"
    description: str
    lat:         Optional[float] = None
    lon:         Optional[float] = None


class OdometerManualIn(BaseModel):
    vehicle_id: str
    km:         float = Field(..., ge=0)


# ── Saisies chef de parc ─────────────────────────────────────────────────────
class BreakdownIn(BaseModel):
    vehicle_id:  str
    piece:       str
    root_cause:  Optional[str] = None
    km_at_break: Optional[float] = None
    workshop:    Optional[str] = None
    notes:       Optional[str] = None


class BreakdownStatusUpdate(BaseModel):
    status:          str = Field(..., description="reported | in_repair | repaired | cancelled")
    repair_cost_mad: Optional[float] = None
    workshop:        Optional[str] = None
    notes:           Optional[str] = None


class MaintenanceIn(BaseModel):
    vehicle_id:         str
    type:               str = Field(..., description="preventive | corrective | inspection")
    pieces_replaced:    Optional[List[str]] = None
    cost_mad:           Optional[float] = 0
    km_at_intervention: Optional[float] = None
    workshop:           Optional[str] = None
    notes:              Optional[str] = None


class MissionIn(BaseModel):
    vehicle_id:     str
    driver_id:      Optional[str] = None
    pickup_siege:   str
    delivery_siege: str
    mission_type:   Optional[str] = "Transport marchandise"
    demand_kg:      Optional[int] = 1
    priority:       Optional[int] = 1
    scheduled_at:   Optional[datetime] = None


class MissionStatusUpdate(BaseModel):
    status:       str = Field(..., description="scheduled | active | completed | cancelled")
    started_at:   Optional[datetime] = None
    completed_at: Optional[datetime] = None
    distance_km:  Optional[float] = None
    duration_min: Optional[float] = None


# ── Réponses (auto pour debug) ───────────────────────────────────────────────
class GenericResponse(BaseModel):
    status: str
    id:     Optional[str] = None
    detail: Optional[str] = None
