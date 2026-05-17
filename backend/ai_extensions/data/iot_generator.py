"""
Générateur de flux IoT réalistes pour le parc automobile marocain.
==================================================================

Simule deux familles de capteurs en temps réel :

1. **OBD** (On-Board Diagnostics) — santé moteur
     · régime moteur (RPM)
     · température liquide refroidissement (°C)
     · charge moteur (%)
     · km cumulé depuis dernière maintenance

2. **Télématique** — comportement de conduite
     · vitesse instantanée (km/h)
     · accélération longitudinale (m/s²)
     · décélération (freinage)
     · accélération latérale (g) — virages
     · GPS (lat, lon)
     · événements : hard_brake, hard_accel, sharp_corner, over_rev

Les caractéristiques varient selon le **type de véhicule** et le **profil de conducteur**.
Les routes simulées sont les axes réels Casablanca ↔ Tanger / Marrakech / Fès / Rabat.
"""

from __future__ import annotations
import math
import random
import hashlib
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional


# ── Profils par type de véhicule ──────────────────────────────────────────────
VEHICLE_PROFILES = {
    "Cargo 3.5t": {
        "max_speed_kmh":   110, "cruise_speed_kmh":  85,
        "max_rpm":         4000, "idle_rpm":         750,
        "fuel_l_per_100":  12.0, "co2_g_per_km":     310,
        "weight_kg":       3500, "engine_type":      "diesel",
    },
    "VLTT": {
        "max_speed_kmh":   140, "cruise_speed_kmh": 100,
        "max_rpm":         5000, "idle_rpm":         800,
        "fuel_l_per_100":  10.0, "co2_g_per_km":     260,
        "weight_kg":       2200, "engine_type":      "diesel",
    },
    "Minicar 9p": {
        "max_speed_kmh":   130, "cruise_speed_kmh":  95,
        "max_rpm":         5500, "idle_rpm":         850,
        "fuel_l_per_100":  8.5,  "co2_g_per_km":     210,
        "weight_kg":       2800, "engine_type":      "diesel",
    },
    "M915 Conteneur": {
        "max_speed_kmh":   90,  "cruise_speed_kmh":  70,
        "max_rpm":         3500, "idle_rpm":         700,
        "fuel_l_per_100":  35.0, "co2_g_per_km":     920,
        "weight_kg":       18000, "engine_type":     "diesel",
    },
}


# ── Profils de conducteur (impact comportemental) ─────────────────────────────
DRIVER_PROFILES = {
    "safe": {
        "hard_brake_prob":   0.005,  # 0.5 % des ticks
        "hard_accel_prob":   0.005,
        "sharp_corner_prob": 0.010,
        "over_rev_prob":     0.005,
        "speed_overshoot":   0.05,   # 5 % au-dessus limite max
    },
    "neutre": {
        "hard_brake_prob":   0.020,
        "hard_accel_prob":   0.020,
        "sharp_corner_prob": 0.030,
        "over_rev_prob":     0.020,
        "speed_overshoot":   0.10,
    },
    "aggressif": {
        "hard_brake_prob":   0.080,
        "hard_accel_prob":   0.080,
        "sharp_corner_prob": 0.100,
        "over_rev_prob":     0.080,
        "speed_overshoot":   0.20,
    },
}


# ── Coordonnées GPS des 5 sièges (réelles) ────────────────────────────────────
SIEGES_GPS = {
    "Casablanca": (33.5731, -7.5898),
    "Rabat":      (34.0209, -6.8416),
    "Tanger":     (35.7595, -5.8340),
    "Marrakech":  (31.6295, -7.9811),
    "Fès":        (34.0331, -4.9998),
}

# Axes principaux (origine → destination, distance_km, type_route)
AXES = [
    ("Casablanca", "Rabat",     90,  "autoroute"),
    ("Casablanca", "Marrakech", 240, "autoroute"),
    ("Casablanca", "Tanger",    340, "autoroute"),
    ("Casablanca", "Fès",       290, "autoroute"),
    ("Rabat",      "Tanger",    250, "autoroute"),
    ("Rabat",      "Fès",       200, "nationale"),
    ("Marrakech",  "Casablanca", 240, "autoroute"),
    ("Tanger",     "Casablanca", 340, "autoroute"),
]


@dataclass
class VehicleState:
    """État courant simulé d'un véhicule (persistant entre ticks)."""
    vehicle_id:           str
    vehicle_type:         str
    driver_profile:       str
    siege:                str
    odometer_km:          float
    km_since_maintenance: float
    engine_temp:          float = 90.0
    current_speed:        float = 0.0
    current_rpm:          float = 750.0
    current_axis:         Optional[tuple] = None     # axe en cours
    progress_on_axis:     float = 0.0                # 0.0 → 1.0
    last_tick_at:         Optional[datetime] = None
    health_factor:        float = 1.0                # 1.0 = neuf, 0.0 = panne imminente


class IoTGenerator:
    """
    Simulateur IoT stateful. Maintient l'état de chaque véhicule entre les ticks
    pour produire des séries temporelles cohérentes (régime → vitesse →
    température progressent de manière physiquement plausible).

    Usage :
        gen = IoTGenerator(seed=42)
        gen.register_vehicle("V001", "Cargo 3.5t", "Casablanca", driver="neutre",
                             km_since_maintenance=1200)
        tick = gen.next_tick("V001")
    """

    def __init__(self, seed: int = 42):
        self._rng    = random.Random(seed)
        self._states: dict[str, VehicleState] = {}

    # ── Enregistrement ────────────────────────────────────────────────────────
    def register_vehicle(self, vehicle_id: str, vehicle_type: str, siege: str,
                          driver: str = "neutre", km_since_maintenance: float = 0,
                          odometer_km: float = 0):
        # Si le type est inconnu, on retombe sur le profil neutre Cargo
        if vehicle_type not in VEHICLE_PROFILES:
            vehicle_type = "Cargo 3.5t"
        if driver not in DRIVER_PROFILES:
            driver = "neutre"

        # health_factor décroît avec les km depuis maintenance (1.0 → 0.5)
        health = max(0.5, 1.0 - (km_since_maintenance / 8000))

        self._states[vehicle_id] = VehicleState(
            vehicle_id=vehicle_id,
            vehicle_type=vehicle_type,
            driver_profile=driver,
            siege=siege,
            odometer_km=odometer_km or self._rng.uniform(50_000, 180_000),
            km_since_maintenance=km_since_maintenance,
            health_factor=health,
        )

    def assign_driver_deterministic(self, vehicle_id: str) -> str:
        """Profil conducteur déterministe (cohérent entre redémarrages serveur)."""
        h = int(hashlib.md5(vehicle_id.encode()).hexdigest(), 16)
        return ["safe", "neutre", "neutre", "neutre", "aggressif"][h % 5]

    # ── Tick principal ────────────────────────────────────────────────────────
    def next_tick(self, vehicle_id: str, dt_seconds: float = 2.0) -> dict:
        """Génère un point IoT pour `vehicle_id`. Met à jour l'état interne."""
        if vehicle_id not in self._states:
            # Auto-registration avec defaults raisonnables
            self.register_vehicle(vehicle_id, "Cargo 3.5t", "Casablanca",
                                  driver=self.assign_driver_deterministic(vehicle_id),
                                  km_since_maintenance=self._rng.uniform(0, 4500))
        st = self._states[vehicle_id]
        profile = VEHICLE_PROFILES[st.vehicle_type]
        driver  = DRIVER_PROFILES[st.driver_profile]

        now = datetime.utcnow()
        st.last_tick_at = now

        # ── 1. Choisir un axe si pas en cours ─────────────────────────────────
        if st.current_axis is None or st.progress_on_axis >= 1.0:
            # 30 % du temps : véhicule à l'arrêt au siège
            if self._rng.random() < 0.30:
                st.current_axis     = None
                st.progress_on_axis = 0.0
                st.current_speed    = 0.0
                st.current_rpm      = profile["idle_rpm"] + self._rng.uniform(-30, 30)
            else:
                # Démarrer un trajet depuis le siège courant
                candidates = [a for a in AXES if a[0] == st.siege]
                if not candidates:
                    candidates = AXES
                st.current_axis     = self._rng.choice(candidates)
                st.progress_on_axis = 0.0

        events = []

        if st.current_axis is not None:
            origin, dest, distance_km, road_type = st.current_axis
            # ── 2. Calcul vitesse cible ──────────────────────────────────────
            cruise = profile["cruise_speed_kmh"]
            target_speed = cruise * (1 + self._rng.uniform(-0.10, driver["speed_overshoot"]))
            target_speed = min(target_speed, profile["max_speed_kmh"])
            if road_type == "nationale":
                target_speed *= 0.75  # nationales plus lentes

            # ── 3. Smoothing : converger doucement vers la vitesse cible ─────
            delta = target_speed - st.current_speed
            st.current_speed += delta * 0.20   # 20 % du gap par tick
            accel_mps2 = (delta * 0.20) * (1000 / 3600) / dt_seconds

            # ── 4. Événements anormaux selon profil conducteur ───────────────
            r = self._rng.random()
            if r < driver["hard_brake_prob"]:
                accel_mps2     = self._rng.uniform(-6, -4)
                st.current_speed = max(0, st.current_speed + accel_mps2 * dt_seconds * 3.6)
                events.append("hard_brake")
            elif r < driver["hard_brake_prob"] + driver["hard_accel_prob"]:
                accel_mps2     = self._rng.uniform(4, 6)
                st.current_speed = min(profile["max_speed_kmh"],
                                       st.current_speed + accel_mps2 * dt_seconds * 3.6)
                events.append("hard_accel")

            lateral_g = abs(self._rng.gauss(0, 0.08))
            if self._rng.random() < driver["sharp_corner_prob"]:
                lateral_g = self._rng.uniform(0.45, 0.70)
                events.append("sharp_corner")

            # ── 5. Régime moteur lié à la vitesse ────────────────────────────
            rpm_ratio = st.current_speed / profile["max_speed_kmh"]
            target_rpm = profile["idle_rpm"] + rpm_ratio * (profile["max_rpm"] - profile["idle_rpm"])
            if self._rng.random() < driver["over_rev_prob"]:
                target_rpm *= 1.25
                events.append("over_rev")
            st.current_rpm = target_rpm + self._rng.uniform(-80, 80)

            # ── 6. Mise à jour km ────────────────────────────────────────────
            km_this_tick = st.current_speed * dt_seconds / 3600
            st.odometer_km          += km_this_tick
            st.km_since_maintenance += km_this_tick
            st.progress_on_axis     += km_this_tick / distance_km

            # ── 7. Température moteur ────────────────────────────────────────
            # tend vers 90°C en conduite, 75°C à l'arrêt ; pénalité si health bas
            target_temp = 90 + (1 - st.health_factor) * 15
            if st.current_speed < 5:
                target_temp = 75
            st.engine_temp += (target_temp - st.engine_temp) * 0.10
            st.engine_temp += self._rng.uniform(-0.5, 0.5)

            # ── 8. GPS interpolé sur l'axe ───────────────────────────────────
            lat_o, lon_o = SIEGES_GPS.get(origin, (33.5731, -7.5898))
            lat_d, lon_d = SIEGES_GPS.get(dest,   (33.5731, -7.5898))
            t = max(0.0, min(1.0, st.progress_on_axis))
            lat = lat_o + (lat_d - lat_o) * t
            lon = lon_o + (lon_d - lon_o) * t

            # Si trajet terminé, le siège devient la destination
            if st.progress_on_axis >= 1.0:
                st.siege = dest

        else:
            # À l'arrêt
            lat_o, lon_o = SIEGES_GPS.get(st.siege, (33.5731, -7.5898))
            lat, lon = lat_o, lon_o
            lateral_g  = 0.0
            accel_mps2 = 0.0
            st.engine_temp = 75 + self._rng.uniform(-1, 1)
            origin, dest, road_type = st.siege, st.siege, "stationary"

        # Charge moteur (proxy) : ratio rpm / max_rpm
        engine_load = round((st.current_rpm / profile["max_rpm"]) * 100, 1)

        return {
            "timestamp":            now.isoformat(),
            "vehicle_id":           vehicle_id,
            "vehicle_type":         st.vehicle_type,
            "driver_profile":       st.driver_profile,
            "siege":                st.siege,
            "axis":                 f"{origin} → {dest}" if origin != dest else st.siege,
            "road_type":            road_type,
            # OBD
            "odometer_km":          round(st.odometer_km, 2),
            "km_since_maintenance": round(st.km_since_maintenance, 2),
            "rpm":                  round(st.current_rpm, 0),
            "engine_temp_c":        round(st.engine_temp, 1),
            "engine_load_pct":      engine_load,
            # Télématique
            "speed_kmh":            round(st.current_speed, 1),
            "accel_mps2":           round(accel_mps2, 2),
            "lateral_g":            round(lateral_g, 3),
            "lat":                  round(lat, 5),
            "lon":                  round(lon, 5),
            # Événements
            "events":               events,
            # Méta santé
            "health_factor":        round(st.health_factor, 3),
        }

    def snapshot_all(self, vehicle_ids: list[str]) -> list[dict]:
        """Renvoie un tick pour chaque véhicule."""
        return [self.next_tick(vid) for vid in vehicle_ids]


# ── Singleton ──────────────────────────────────────────────────────────────────
_default_generator: Optional[IoTGenerator] = None

def get_generator() -> IoTGenerator:
    """Retourne l'instance singleton du générateur (lazy init)."""
    global _default_generator
    if _default_generator is None:
        _default_generator = IoTGenerator(seed=42)
    return _default_generator
