# 🇲🇦 Digital Twin Intelligent — Parc Automobile Maroc

Application de jumeau numérique d'un parc automobile multi-sites au Maroc, avec :
- Carte interactive (Leaflet + tuiles CartoDB + contour GeoJSON Maroc)
- 5 sièges : **Tanger · Rabat · Casablanca · Errachidia · Agadir**
- **75 véhicules** (4 types : Cargo, VLTT, Minicar, M915)
- Calcul **IPL** (Indice de Pression Logistique) en temps réel
- Simulateur IA avec **scénario panne Casa 14h00** en un clic

> **Projet PFE — TIYAOUIL Fathallah · MSID TA · FSR 2024-2026**

---

## 🚀 Installation & Lancement

### Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

→ Ouvre automatiquement http://localhost:5173

### Backend (FastAPI, optionnel)

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

→ API sur http://localhost:8000 · docs sur http://localhost:8000/docs

> **Note** : le frontend embarque les 75 véhicules côté client (Zustand), il fonctionne donc **sans backend**. Le backend est fourni à titre de référence et pour démonstration d'architecture.

---

## 🎯 Démonstration du scénario clé

1. Ouvrir l'application
2. Cliquer sur **🚨 Lancer scénario panne Casa 14h00**
3. Observer :
   - 3 véhicules Casa passent en **Panne**
   - IPL Casa saute de **45% → 82%** (zone rouge)
   - L'IA propose 3 actions automatiques
   - La simulation avance (1 sec réelle = 15 min simulées)
   - À **15:15**, IPL Casa revient sous 75% ✅

---

## 🧩 Architecture

```
digital-twin-maroc/
├── frontend/   ← React 18 + Vite + Leaflet + Zustand + Recharts + Tailwind
│   └── src/
│       ├── App.jsx
│       ├── components/  (MapView, Dashboard, SimulatorPanel, ...)
│       ├── store/useStore.js
│       ├── utils/       (iplCalculator, simulationEngine, driveTime)
│       └── data/initialData.js
├── backend/    ← FastAPI (endpoints /sieges, /vehicles, /ipl, /simulate)
└── README.md
```

---

## 📐 Formule IPL

```
IPL = (commandes_en_attente + livraisons_en_retard) / max(1, vehicules_operationnels) × 100
```

| Niveau | Plage | Action |
|--------|-------|--------|
| 🟢 Vert | < 40% | Rien |
| 🟠 Orange | 40-74% | Surveillance |
| 🔴 Rouge | ≥ 75% | Alerte + actions IA auto |

---

## 🛠 Stack technique

| Couche | Techno |
|--------|--------|
| UI | React 18 + TailwindCSS 3 |
| État | Zustand |
| Carte | Leaflet 1.9 + CartoDB Voyager + GeoJSON |
| Graphiques | Recharts |
| Backend | FastAPI + Pydantic |
| Build | Vite |

Aucune clé API payante requise.
