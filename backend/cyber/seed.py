"""
Seed la base cyber.db avec des données historiques réalistes.
=============================================================
Utilise les générateurs synthétiques d'ai_extensions (mêmes profils, axes,
distances) pour produire un volume crédible :

    - 75 véhicules (registre)
    - 60 chauffeurs (registre, ~12 par siège)
    - 6 mois d'historique télémétrique (≈ 100 000 lignes OBD + GPS)
    - 14 pannes étiquetées avec parcours reported → repaired
    - 200 pleins de carburant
    - 80 missions clôturées
    - 20 incidents

Idempotent : si la base contient déjà des données, vide d'abord (option `purge`).
"""

from __future__ import annotations
import json
import random
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy.orm import Session

from .database import SessionLocal, init_db
from .models import (
    Vehicle, Driver, ObdReading, GpsPing, TelemetricsEvent,
    FuelRefill, Incident, Breakdown, MaintenanceIntervention, Mission,
)

# Imports synthétiques
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from ai_extensions.data.iot_generator import (
    VEHICLE_PROFILES, SIEGES_GPS, AXES,
)
from ai_extensions.data.synthetic_dataset import default_fleet_specs


# ── Helpers ──────────────────────────────────────────────────────────────────
_FIRST_NAMES = ["Ahmed", "Mohamed", "Youssef", "Hassan", "Karim", "Omar",
                "Said", "Khalid", "Rachid", "Fouad", "Abdellah", "Driss",
                "Mustapha", "Brahim", "Anas", "Hicham", "Aziz", "Tarik"]
_LAST_NAMES  = ["Benali", "Alaoui", "Mansouri", "Idrissi", "Tazi", "El Amrani",
                "El Fassi", "Bennani", "Lahlou", "Chraibi", "Benkirane",
                "Belhaj", "Ouazzani", "Hajji", "Berrada"]
_WORKSHOPS   = ["Atelier Casa Nord", "Garage Rabat Centre", "Auto-Service Tanger",
                "Mécanique Marrakech", "Réparation Fès", "Atelier Mobile MAR"]
_STATIONS    = ["Total Casa-Anfa", "Shell Rabat-Agdal", "Afriquia Tanger-Med",
                "Vivo Marrakech-Gueliz", "Petrom Fès-Saiss"]
_INCIDENT_TYPES = ["accident", "near_miss", "weather", "other"]


def _random_plate(rng: random.Random) -> str:
    n = rng.randint(10000, 99999)
    l = rng.choice("ABCDEFGH")
    z = rng.randint(1, 90)
    return f"{n}-{l}-{z}"


# ═══════════════════════════════════════════════════════════════════════════════
#  Seed principal
# ═══════════════════════════════════════════════════════════════════════════════
def seed_all(
    db:        Session,
    days_back: int  = 90,
    purge:     bool = False,
    obd_step:  int  = 1800,   # secondes entre 2 lectures OBD persistées (=30 min)
    gps_step:  int  = 600,    # secondes entre 2 GPS pings persistés (=10 min)
    seed:      int  = 42,
) -> dict:
    """
    Peuple la base cyber.db avec données réalistes.
    `obd_step`/`gps_step` = pas en secondes (plus court = plus de volume).
    """
    rng = random.Random(seed)

    if purge:
        # Order matter: faits d'abord (FK), puis référentiels
        for tbl in [TelemetricsEvent, GpsPing, ObdReading, FuelRefill, Incident,
                    Breakdown, MaintenanceIntervention, Mission, Driver, Vehicle]:
            db.query(tbl).delete()
        db.commit()

    # ── 1. Véhicules (registre) ──────────────────────────────────────────────
    if db.query(Vehicle).count() == 0:
        fleet = default_fleet_specs(n_per_siege=15)
        for spec in fleet:
            db.add(Vehicle(
                id=spec.vehicle_id,
                plate=_random_plate(rng),
                type=spec.vehicle_type,
                depot_siege=spec.siege,
                year=rng.randint(2015, 2024),
                capacity_kg=VEHICLE_PROFILES[spec.vehicle_type]["weight_kg"],
                odometer_km=spec.odometer_km,
                last_maint_km=max(0, spec.odometer_km - spec.km_since_maintenance),
                status="active",
            ))
        db.commit()
    vehicles = db.query(Vehicle).all()
    n_vehicles = len(vehicles)

    # ── 2. Chauffeurs (registre) ─────────────────────────────────────────────
    if db.query(Driver).count() == 0:
        for siege in SIEGES_GPS:
            for _ in range(12):
                profile = rng.choices(
                    ["safe", "neutre", "neutre", "neutre", "aggressif"],
                    weights=[1, 1, 1, 1, 1])[0]
                db.add(Driver(
                    full_name=f"{rng.choice(_FIRST_NAMES)} {rng.choice(_LAST_NAMES)}",
                    license_class=rng.choice(["B", "C", "C+E"]),
                    profile=profile,
                    home_siege=siege,
                    phone=f"06{rng.randint(10000000, 99999999)}",
                    hired_at=datetime.utcnow() - timedelta(days=rng.randint(180, 2200)),
                    status="active",
                ))
        db.commit()
    drivers = db.query(Driver).all()
    drivers_by_siege = {}
    for d in drivers:
        drivers_by_siege.setdefault(d.home_siege, []).append(d)

    # ── 3. Données IoT historiques (OBD + GPS + events) ──────────────────────
    now = datetime.utcnow()
    start = now - timedelta(days=days_back)
    n_obd_rows = 0
    n_gps_rows = 0
    n_events   = 0

    if db.query(ObdReading).count() == 0:
        for v in vehicles:
            profile = VEHICLE_PROFILES.get(v.type, VEHICLE_PROFILES["Cargo 3.5t"])
            cumul_odo = v.odometer_km - days_back * 50   # rewind
            cumul_odo = max(50_000, cumul_odo)

            # Pour chaque jour, simuler une activité
            for day_offset in range(days_back):
                day_dt = start + timedelta(days=day_offset)
                is_weekend = day_dt.weekday() >= 5

                # 15 % chance de jour off + week-end peu actif
                if rng.random() < (0.50 if is_weekend else 0.15):
                    continue

                # Horaire de travail typique 7h → 18h
                day_start = day_dt.replace(hour=7, minute=rng.randint(0, 59), second=0)
                day_end   = day_dt.replace(hour=rng.randint(16, 19), minute=rng.randint(0, 59), second=0)

                # OBD readings espacés de `obd_step` secondes
                t = day_start
                while t < day_end:
                    speed = rng.gauss(profile["cruise_speed_kmh"], 18)
                    speed = max(0, min(profile["max_speed_kmh"], speed))
                    if rng.random() < 0.20:   # 20 % arrêts
                        speed = 0
                    rpm_ratio = speed / profile["max_speed_kmh"]
                    rpm = int(profile["idle_rpm"] + rpm_ratio * (profile["max_rpm"] - profile["idle_rpm"]))
                    rpm += rng.randint(-80, 80)
                    temp = 75 if speed < 5 else rng.gauss(91, 4)

                    cumul_odo += speed * (obd_step / 3600)   # km accumulés
                    db.add(ObdReading(
                        vehicle_id=v.id, ts=t,
                        rpm=max(600, rpm),
                        engine_temp_c=round(temp, 1),
                        engine_load_pct=round(rpm_ratio * 100, 1),
                        fuel_level_pct=round(rng.uniform(15, 95), 1),
                        odometer_km=round(cumul_odo, 1),
                        source="obd_box",
                    ))
                    n_obd_rows += 1
                    t += timedelta(seconds=obd_step)

                # GPS pings (interpolation sur un axe choisi)
                axes_from_depot = [a for a in AXES if a[0] == v.depot_siege] or AXES
                axe = rng.choice(axes_from_depot)
                origin, dest, distance_km, _ = axe
                lat_o, lon_o = SIEGES_GPS[origin]
                lat_d, lon_d = SIEGES_GPS[dest]

                t = day_start
                progress = 0.0
                while t < day_end and progress <= 1.0:
                    speed = rng.gauss(80, 15)
                    progress += (speed * (gps_step / 3600)) / distance_km
                    progress = min(1.0, progress)
                    lat = lat_o + (lat_d - lat_o) * progress
                    lon = lon_o + (lon_d - lon_o) * progress
                    lat += rng.gauss(0, 0.001)
                    lon += rng.gauss(0, 0.001)
                    db.add(GpsPing(
                        vehicle_id=v.id, ts=t,
                        lat=round(lat, 5), lon=round(lon, 5),
                        speed_kmh=round(max(0, speed), 1),
                        heading_deg=round(rng.uniform(0, 360), 1),
                    ))
                    n_gps_rows += 1
                    t += timedelta(seconds=gps_step)

                # Événements télémétrie (rares)
                event_probs = {
                    "safe":      {"hard_brake": 0.5, "hard_accel": 0.5, "sharp_corner": 1.0, "over_rev": 0.5},
                    "neutre":    {"hard_brake": 2.0, "hard_accel": 2.0, "sharp_corner": 3.0, "over_rev": 2.0},
                    "aggressif": {"hard_brake": 8.0, "hard_accel": 8.0, "sharp_corner": 10.0, "over_rev": 8.0},
                }
                # Assigne un chauffeur (peut tourner)
                drv_list = drivers_by_siege.get(v.depot_siege, drivers)
                drv = rng.choice(drv_list) if drv_list else None
                if drv:
                    drv_events = event_probs.get(drv.profile, event_probs["neutre"])
                    for evt, expected in drv_events.items():
                        n_to_emit = int(rng.gauss(expected, expected / 3))
                        for _ in range(max(0, n_to_emit)):
                            evt_t = day_start + timedelta(
                                seconds=rng.randint(0, int((day_end - day_start).total_seconds())))
                            db.add(TelemetricsEvent(
                                vehicle_id=v.id, driver_id=drv.id, ts=evt_t,
                                event_type=evt,
                                severity="critical" if drv.profile == "aggressif" else "warning",
                                accel_mps2=rng.uniform(-6, -4) if evt == "hard_brake"
                                          else rng.uniform(4, 6) if evt == "hard_accel" else None,
                                lateral_g=rng.uniform(0.4, 0.7) if evt == "sharp_corner" else None,
                                speed_kmh=round(rng.uniform(40, 110), 1),
                            ))
                            n_events += 1
            # Mise à jour odometer dans le registre
            v.odometer_km = cumul_odo
            db.flush()
        db.commit()

    # ── 4. Pleins de carburant ───────────────────────────────────────────────
    if db.query(FuelRefill).count() == 0:
        for _ in range(200):
            v = rng.choice(vehicles)
            d = rng.choice(drivers_by_siege.get(v.depot_siege, drivers))
            liters = round(rng.uniform(40, 120), 1)
            db.add(FuelRefill(
                vehicle_id=v.id, driver_id=d.id,
                ts=now - timedelta(days=rng.randint(0, days_back)),
                liters=liters,
                cost_mad=round(liters * rng.uniform(13.5, 14.8), 2),
                km_at_refill=round(rng.uniform(50_000, 200_000), 0),
                station=rng.choice(_STATIONS),
                fuel_type="diesel",
                reported_by=d.full_name,
            ))
        db.commit()

    # ── 5. Pannes étiquetées ─────────────────────────────────────────────────
    if db.query(Breakdown).count() == 0:
        pieces = [("turbo", "Surchauffe + sur-régime"),
                  ("plaquettes_frein", "Freinages brusques répétés"),
                  ("courroie_distrib", "Régime moteur élevé prolongé"),
                  ("amortisseurs", "Virages serrés + nids-de-poule"),
                  ("embrayage", "Accélérations brutales"),
                  ("alternateur", "Vieillissement + km élevés"),
                  ("pneus", "Conduite agressive + km")]
        for i in range(14):
            v = rng.choice(vehicles)
            piece, cause = rng.choice(pieces)
            break_ts = now - timedelta(days=rng.randint(2, days_back - 5))
            status = rng.choice(["repaired", "repaired", "repaired", "in_repair", "reported"])
            db.add(Breakdown(
                vehicle_id=v.id, ts=break_ts,
                piece=piece, root_cause=cause,
                km_at_break=v.odometer_km - rng.uniform(0, 5000),
                status=status,
                repair_cost_mad=round(rng.uniform(800, 12000), 2) if status == "repaired" else 0,
                repair_started_at=break_ts + timedelta(hours=rng.randint(6, 48)) if status != "reported" else None,
                repair_completed_at=break_ts + timedelta(days=rng.randint(1, 6)) if status == "repaired" else None,
                workshop=rng.choice(_WORKSHOPS) if status != "reported" else None,
                reported_by=rng.choice(drivers).full_name,
                notes=f"Détecté par capteurs IoT — proba IA initiale {rng.uniform(0.55, 0.92):.2f}",
            ))
        db.commit()

    # ── 6. Maintenance préventive ────────────────────────────────────────────
    if db.query(MaintenanceIntervention).count() == 0:
        for _ in range(40):
            v = rng.choice(vehicles)
            db.add(MaintenanceIntervention(
                vehicle_id=v.id,
                ts=now - timedelta(days=rng.randint(0, days_back)),
                type=rng.choice(["preventive", "preventive", "corrective", "inspection"]),
                pieces_replaced=json.dumps(rng.sample(
                    ["huile", "filtre_huile", "filtre_air", "plaquettes", "pneus"],
                    k=rng.randint(1, 3))),
                cost_mad=round(rng.uniform(400, 3500), 2),
                km_at_intervention=round(v.odometer_km - rng.uniform(0, 8000), 0),
                workshop=rng.choice(_WORKSHOPS),
                reported_by="chef.parc",
                notes="Maintenance planifiée selon programme préventif",
            ))
        db.commit()

    # ── 7. Missions clôturées ────────────────────────────────────────────────
    if db.query(Mission).count() == 0:
        sieges = list(SIEGES_GPS.keys())
        for i in range(80):
            v = rng.choice(vehicles)
            d = rng.choice(drivers_by_siege.get(v.depot_siege, drivers))
            from_s = v.depot_siege
            to_s = rng.choice([s for s in sieges if s != from_s])
            scheduled = now - timedelta(days=rng.randint(0, days_back))
            started = scheduled + timedelta(minutes=rng.randint(10, 90))
            duration = rng.randint(120, 480)
            db.add(Mission(
                vehicle_id=v.id, driver_id=d.id,
                pickup_siege=from_s, delivery_siege=to_s,
                mission_type=rng.choice([
                    "Transport personnel", "Transport marchandise", "Transport conteneur",
                    "Évacuation médicale", "Mission administrative"]),
                demand_kg=rng.choice([100, 500, 1000, 2000, 3500]),
                priority=rng.choice([1, 1, 1, 2, 5]),
                scheduled_at=scheduled,
                started_at=started,
                completed_at=started + timedelta(minutes=duration),
                status="completed",
                distance_km=rng.uniform(80, 560),
                duration_min=duration,
                reported_by="chef.parc",
            ))
        db.commit()

    # ── 8. Incidents ─────────────────────────────────────────────────────────
    if db.query(Incident).count() == 0:
        for _ in range(20):
            v = rng.choice(vehicles)
            d = rng.choice(drivers_by_siege.get(v.depot_siege, drivers))
            db.add(Incident(
                vehicle_id=v.id, driver_id=d.id,
                ts=now - timedelta(days=rng.randint(0, days_back)),
                type=rng.choice(_INCIDENT_TYPES),
                severity=rng.choice(["minor", "minor", "moderate", "major"]),
                description=rng.choice([
                    "Léger contact avec véhicule en stationnement.",
                    "Crevaison sur autoroute, roue de secours posée.",
                    "Pluie intense, ralentissement nécessaire.",
                    "Animal traversé la route, freinage d'urgence.",
                    "Demi-tour interdit involontaire signalé.",
                ]),
                reported_by=d.full_name,
            ))
        db.commit()

    # ── Récap ───────────────────────────────────────────────────────────────
    return {
        "vehicles":      db.query(Vehicle).count(),
        "drivers":       db.query(Driver).count(),
        "obd_readings":  db.query(ObdReading).count(),
        "gps_pings":     db.query(GpsPing).count(),
        "events":        db.query(TelemetricsEvent).count(),
        "fuel_refills":  db.query(FuelRefill).count(),
        "breakdowns":    db.query(Breakdown).count(),
        "maintenance":   db.query(MaintenanceIntervention).count(),
        "missions":      db.query(Mission).count(),
        "incidents":     db.query(Incident).count(),
    }


# ── CLI ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    try: sys.stdout.reconfigure(encoding="utf-8")
    except Exception: pass

    init_db()
    db = SessionLocal()
    print("[*] Seeding cyber.db (90 jours, pas OBD 30min, GPS 10min)...")
    stats = seed_all(db, days_back=90, purge=True)
    print("[OK] Base hydratee :")
    for k, v in stats.items():
        print(f"    {k:14s} : {v:>7d}")
    db.close()
