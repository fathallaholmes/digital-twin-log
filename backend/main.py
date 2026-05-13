# /backend/main.py
"""
Digital Twin Maroc - Backend FastAPI
Sert de référence et fournit endpoints REST. Le frontend embarque les données
côté client donc le backend est OPTIONNEL pour faire tourner le projet.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict
import random

app = FastAPI(title="Digital Twin Maroc API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =====================
# DONNÉES STATIQUES
# =====================
SIEGES = [
    {"id": "S1", "ville": "Tanger",     "lat": 35.7595, "lon": -5.8340, "role": "Port / Industrie",  "ipl_initial": 35, "commandes": 18, "retards": 4},
    {"id": "S2", "ville": "Rabat",      "lat": 34.0209, "lon": -6.8416, "role": "Capitale / Admin",  "ipl_initial": 30, "commandes": 15, "retards": 3},
    {"id": "S3", "ville": "Casablanca", "lat": 33.5731, "lon": -7.5898, "role": "Hub principal",     "ipl_initial": 45, "commandes": 25, "retards": 6},
    {"id": "S4", "ville": "Errachidia", "lat": 31.9317, "lon": -4.4243, "role": "Sud / Semi-désert", "ipl_initial": 25, "commandes": 12, "retards": 2},
    {"id": "S5", "ville": "Agadir",     "lat": 30.4278, "lon": -9.5981, "role": "Tourisme / Pêche",  "ipl_initial": 38, "commandes": 17, "retards": 4},
]

COMPOSITION = [
    ("Cargo 3.5t", 6),
    ("VLTT", 4),
    ("Minicar 9p", 3),
    ("M915 Conteneur", 2),
]

def generate_fleet():
    vehicles = []
    counter = 1
    random.seed(42)  # déterministe
    for s in SIEGES:
        for vtype, qty in COMPOSITION:
            for _ in range(qty):
                km = random.randint(0, 5000)
                etat = "Risque" if km > 4500 else "OK"
                vehicles.append({
                    "id": f"V{counter:03d}",
                    "type": vtype,
                    "siege": s["ville"],
                    "etat": etat,
                    "position": {"lat": s["lat"], "lon": s["lon"]},
                    "km_depuis_derniere_maintenance": km,
                    "temps_estime_reparation": 0,
                })
                counter += 1
    return vehicles

VEHICLES = generate_fleet()

# =====================
# MODÈLES
# =====================
class SimulateRequest(BaseModel):
    siege: str = "Casablanca"
    nb_pannes: int = 3
    transferts: int = 2
    repair_min: int = 45
    replanify: bool = True

# =====================
# ENDPOINTS
# =====================
@app.get("/")
def root():
    return {"status": "ok", "service": "Digital Twin Maroc API", "vehicles": len(VEHICLES), "sieges": len(SIEGES)}

@app.get("/sieges")
def get_sieges():
    return SIEGES

@app.get("/vehicles")
def get_vehicles(siege: str | None = None):
    if siege:
        return [v for v in VEHICLES if v["siege"] == siege]
    return VEHICLES

@app.get("/ipl")
def get_ipl():
    out = {}
    for s in SIEGES:
        flotte = [v for v in VEHICLES if v["siege"] == s["ville"]]
        ops = sum(1 for v in flotte if v["etat"] == "OK")
        denom = max(1, ops)
        ipl = round(((s["commandes"] + s["retards"]) / denom) * 100)
        out[s["ville"]] = ipl
    return out

@app.post("/simulate")
def simulate(req: SimulateRequest):
    """Renvoie la trajectoire d'IPL projetée pour le scénario panne."""
    # Trajectoire déterministe basée sur les paramètres (illustratif)
    trajectory = [
        {"clock": "14:00", "ipl_casa": 82, "event": "Panne détectée"},
        {"clock": "14:15", "ipl_casa": 82, "event": "Actions IA déclenchées"},
        {"clock": "14:30", "ipl_casa": 80, "event": "Replanification effective"},
        {"clock": "14:45", "ipl_casa": 78, "event": "1er véhicule réparé"},
        {"clock": "15:00", "ipl_casa": 74, "event": f"Transfert {req.transferts}× arrivé"},
        {"clock": "15:15", "ipl_casa": 71, "event": "Objectif <75% atteint ✅"},
    ]
    return {
        "siege": req.siege,
        "ipl_initial": 45,
        "ipl_post_panne": 82,
        "ipl_final": 71,
        "duree_min": 75,
        "actions_ia": [
            f"Transfert {req.transferts} véhicules Rabat → Casa (60 min)",
            "Replanification 8 commandes Casa → Rabat" if req.replanify else "Replanif désactivée",
            f"Maintenance express ({req.repair_min} min cascade)",
        ],
        "trajectoire": trajectory,
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
