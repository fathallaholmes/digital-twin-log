"""
Simulateur de capteurs en arrière-plan.
=======================================
Pousse en continu dans la base cyber.db des lectures OBD + GPS + événements,
comme si les boîtiers embarqués sur les véhicules envoyaient leurs données
en temps réel.

Pilotage via /cyber/simulator/start, /cyber/simulator/stop, /cyber/simulator/status.
"""

from __future__ import annotations
import threading
import time
import random
from datetime import datetime
from typing import Optional

from .database import SessionLocal
from .models import Vehicle, Driver, ObdReading, GpsPing, TelemetricsEvent

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from ai_extensions.data.iot_generator import get_generator


class SensorSimulator:
    """Thread daemon qui pousse périodiquement OBD + GPS + events en base."""

    def __init__(self):
        self._thread:    Optional[threading.Thread] = None
        self._stop_evt   = threading.Event()
        self.interval_s  = 5
        self.started_at: Optional[datetime] = None
        self.tick_count  = 0
        self.events_count = 0
        self._lock       = threading.Lock()

    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def start(self, interval_s: float = 5.0) -> dict:
        if self.is_running():
            return {"status": "already_running", "interval_s": self.interval_s}
        self.interval_s   = max(1.0, min(60.0, interval_s))
        self._stop_evt.clear()
        self.started_at   = datetime.utcnow()
        self.tick_count   = 0
        self.events_count = 0
        self._thread = threading.Thread(target=self._loop, name="SensorSim", daemon=True)
        self._thread.start()
        return {"status": "started", "interval_s": self.interval_s}

    def stop(self) -> dict:
        if not self.is_running():
            return {"status": "not_running"}
        self._stop_evt.set()
        self._thread.join(timeout=5)
        self._thread = None
        return {"status": "stopped",
                "ticks_emitted":  self.tick_count,
                "events_emitted": self.events_count}

    def status(self) -> dict:
        return {
            "running":        self.is_running(),
            "interval_s":     self.interval_s,
            "started_at":     self.started_at.isoformat() if self.started_at else None,
            "ticks_emitted":  self.tick_count,
            "events_emitted": self.events_count,
        }

    def _loop(self):
        gen = get_generator()
        rng = random.Random()
        while not self._stop_evt.is_set():
            try:
                self._tick(gen, rng)
            except Exception as e:
                print(f"[SensorSim] ERROR: {e}")
            self._stop_evt.wait(self.interval_s)

    def _tick(self, gen, rng: random.Random):
        """Pousse 1 tick OBD + 1 GPS + éventuellement 1-2 events par véhicule."""
        db = SessionLocal()
        try:
            vehicles = db.query(Vehicle).filter(Vehicle.status == "active").all()
            if not vehicles:
                return

            drivers_by_siege = {}
            for d in db.query(Driver).all():
                drivers_by_siege.setdefault(d.home_siege, []).append(d)

            now = datetime.utcnow()

            for v in vehicles:
                # Tick depuis le générateur (cohérence inter-tick)
                tick = gen.next_tick(v.id, dt_seconds=self.interval_s)

                # OBD
                db.add(ObdReading(
                    vehicle_id=v.id, ts=now,
                    rpm=int(tick["rpm"]),
                    engine_temp_c=tick["engine_temp_c"],
                    engine_load_pct=tick["engine_load_pct"],
                    fuel_level_pct=round(rng.uniform(20, 90), 1),
                    odometer_km=tick["odometer_km"],
                    source="obd_box",
                ))

                # GPS
                db.add(GpsPing(
                    vehicle_id=v.id, ts=now,
                    lat=tick["lat"], lon=tick["lon"],
                    speed_kmh=tick["speed_kmh"],
                    heading_deg=round(rng.uniform(0, 360), 1),
                ))
                self.tick_count += 1

                # Maj odomètre dans le registre véhicule
                if tick["odometer_km"] > (v.odometer_km or 0):
                    v.odometer_km = tick["odometer_km"]

                # Événements détectés par le générateur (rares)
                drv_list = drivers_by_siege.get(v.depot_siege)
                drv_id   = (drv_list[0].id if drv_list else None)
                for evt in tick.get("events", []):
                    db.add(TelemetricsEvent(
                        vehicle_id=v.id, driver_id=drv_id, ts=now,
                        event_type=evt,
                        severity="warning",
                        accel_mps2=tick.get("accel_mps2"),
                        lateral_g=tick.get("lateral_g"),
                        speed_kmh=tick.get("speed_kmh"),
                        lat=tick.get("lat"), lon=tick.get("lon"),
                    ))
                    self.events_count += 1

            db.commit()
        finally:
            db.close()


# Singleton
_sim: Optional[SensorSimulator] = None

def get_simulator() -> SensorSimulator:
    global _sim
    if _sim is None:
        _sim = SensorSimulator()
    return _sim
