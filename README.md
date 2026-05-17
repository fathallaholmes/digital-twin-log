# 🇲🇦 Digital Twin Intelligent — Parc Automobile Maroc

> **Projet de Fin d'Études — TIYAOUIL Fathallah · MSID TA · FSR Université Mohammed V Rabat · 2024-2026**

Jumeau numérique intelligent d'un parc automobile multi-sites au Maroc, combinant **simulation temps réel**, **collaboration multi-utilisateurs** et **intelligence artificielle** (5 modèles ML, optimisation de tournées, recommandation contextuelle, génération de langage naturel).

---

## 🌟 Vue d'ensemble

| Couche | Description |
|---|---|
| **Jumeau numérique** | Réplique digitale de 75 véhicules répartis sur 5 sièges, avec état mis à jour en temps réel |
| **Collaboration** | Authentification JWT, WebSocket, partage d'état entre utilisateurs |
| **Intelligence Artificielle** | Maintenance prédictive, détection d'anomalies, what-if, optimisation tournées, recommandations |
| **Restitution** | Cartographie Leaflet, dashboards, narration NLG, mode démo plein écran |

### Chiffres clés

- **5 sièges** : Casablanca · Rabat · Tanger · Marrakech · Fès
- **75 véhicules** simulés (4 types : Cargo 3.5t, VLTT, Minicar 9p, M915 Conteneur)
- **5 modèles ML** entraînés (RandomForest, Isolation Forest, LightGBM ×3, OR-Tools VRP)
- **35+ endpoints API** REST + 1 WebSocket
- **13 500 lignes** de dataset historique synthétique (180 jours)

---

## 🚀 Installation & Lancement

### Prérequis

- **Python 3.10+** (testé sur 3.12)
- **Node.js 18+** et npm
- 4 Go RAM minimum

### 1. Backend (FastAPI)

```bash
cd backend
python -m venv venv
venv\Scripts\activate                  # Windows
# source venv/bin/activate              # Linux/Mac
pip install -r requirements.txt
python main.py
```

→ API disponible sur `http://localhost:8000`
→ Documentation interactive Swagger : `http://localhost:8000/docs`

**Compte admin créé automatiquement au premier démarrage** : `admin` / `admin123`

### 2. Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

→ Application web sur `http://localhost:5173`

### 3. Génération du dataset ML (optionnel — fait automatiquement au premier appel)

```bash
cd backend
venv\Scripts\python -m ai_extensions.data.synthetic_dataset
```

Génère 3 fichiers CSV dans `backend/ai_extensions/data/samples/` :
- `obd_history.csv` (13 500 lignes — capteurs OBD journaliers)
- `telematics_stream.csv` (13 500 lignes — comportement de conduite)
- `breakdowns.csv` (14 pannes étiquetées — vérité terrain)

---

## 🧠 Module IA — `backend/ai_extensions/`

Module isolé regroupant 7 briques avancées d'IA & Data Science :

```
backend/ai_extensions/
├── data/                              ← Génération IoT + datasets historiques
│   ├── iot_generator.py                Flux temps réel OBD + télémétrie
│   ├── synthetic_dataset.py            Agrégats journaliers + breakdowns
│   └── samples/                        CSV pré-générés (27 000 lignes)
├── models/                            ← Modèles ML
│   ├── maintenance_predictive.py       RandomForest (panne 30j)
│   ├── anomaly_detector.py             Isolation Forest (conduite dangereuse)
│   ├── what_if_simulator.py            LightGBM surrogate (KPIs flotte)
│   └── trained/                        Modèles .pkl entraînés
├── decision/                          ← Couche décisionnelle
│   ├── route_optimizer.py              OR-Tools VRP multi-dépôts
│   └── recommendation_engine.py        Rules + bandit ε-greedy
├── nlg/                               ← Génération langage naturel
│   └── narrator.py                     Templates F-string FR
└── api_routes.py                      Router FastAPI (35+ endpoints /ai/*)
```

### Performances mesurées

| Modèle | Algorithme | Métrique principale |
|---|---|---|
| Maintenance prédictive | Random Forest (200 arbres) | **ROC-AUC 0.986 · Recall 90.5 %** |
| Détection anomalies | Isolation Forest (5 % contamination) | **100 % des profils agressifs identifiés** |
| What-If surrogate | LightGBM × 3 KPIs | **R² 0.95-0.99 · 5 ms d'inférence** |
| Optimisation tournées | OR-Tools VRP (GLS) | **-76 % distance et CO₂ vs naïf** |
| Recommandations | Règles + ε-greedy bandit | **Apprentissage persistant JSON** |

---

## 🎬 Démonstration recommandée pour la soutenance

### A. Démo applicative (5-7 min)
1. **Connexion** avec `admin` / `admin123`
2. Le **bandeau NLG** sous le header annonce automatiquement les top alertes IA
3. **Onglet 🚚 Transport** : créer un ordre, l'IA propose un véhicule, route routière dessinée sur la carte
4. **Onglet 🧠 IA → Actions** : voir les recommandations, cliquer "✓ Accepter" → le score du bandit monte
5. **Onglet 🧠 IA → Tournées** : lancer une optimisation OR-Tools, voir le comparatif Avant/Après
6. **Onglet 🧠 IA → What-If** : déplacer les curseurs siège → KPIs recalculés en temps réel

### B. Démo collaboration multi-utilisateurs
1. Ouvrir 2 navigateurs (ou 1 navigateur + 1 fenêtre privée) avec 2 comptes différents
2. Créer un ordre de transport dans l'un → apparaît immédiatement chez l'autre
3. Le badge "👥 N en ligne" en haut affiche les utilisateurs connectés

### C. Mode "Présentation Jury" plein écran
- Cliquer le bouton **🎬 Mode Démo** (gradient violet en haut à droite)
- 7 slides automatiques comparant **Sans IA vs Avec IA** avec compteurs animés
- Navigation clavier : `→` (suivant) · `←` (précédent) · `Esc` (quitter)

---

## 🏗 Architecture technique

```
digital-twin-maroc/
│
├── backend/                            FastAPI 0.115 + SQLAlchemy + JWT
│   ├── main.py                          Auth + WebSocket + état partagé
│   ├── requirements.txt
│   ├── digital_twin.db                  SQLite (généré au runtime)
│   └── ai_extensions/                   Module IA isolé (voir plus haut)
│
├── frontend/                            React 18 + Vite + Tailwind 3 + Zustand
│   └── src/
│       ├── App.jsx                      Layout principal + auth gate + bandeau NLG
│       ├── store/
│       │   ├── useStore.js              État métier (véhicules, IPL, ordres)
│       │   └── useAuthStore.js          JWT + utilisateur
│       ├── hooks/
│       │   └── useBackendSync.js        WebSocket bidirectionnel
│       ├── api/
│       │   ├── apiClient.js             Wrapper fetch + JWT
│       │   └── aiClient.js              API /ai/* (25+ fonctions)
│       ├── components/
│       │   ├── MapView.jsx              Leaflet + OSRM (routes routières)
│       │   ├── Dashboard.jsx            Charts IPL Recharts
│       │   ├── SimulatorPanel.jsx       Scénarios prédéfinis + custom
│       │   ├── TransportOrder.jsx       Dispatch IA + ordres de prêt
│       │   ├── TripHistory.jsx          Historique trajets
│       │   ├── FleetManager.jsx         CRUD véhicules + seuils km
│       │   ├── EventLog.jsx             Journal événements
│       │   ├── AuthorizationBar.jsx     Demande autorisation arrivée
│       │   ├── LoginPage.jsx            Connexion / inscription
│       │   ├── CollabIndicator.jsx      Liste utilisateurs en ligne
│       │   └── ai/                      Composants module IA
│       │       ├── AIPanel.jsx           Conteneur 5 onglets
│       │       ├── Recommendations.jsx   Cards + boutons feedback bandit
│       │       ├── MaintenancePrediction.jsx
│       │       ├── AnomalyAlerts.jsx
│       │       ├── WhatIfSimulator.jsx   Sliders temps réel
│       │       ├── RouteOptimizer.jsx    Comparatif Avant/Après
│       │       ├── NLGBanner.jsx         Bandeau header rotatif
│       │       └── DemoJuryMode.jsx      Présentation plein écran 7 slides
│       └── utils/
│           ├── iplCalculator.js          Calcul IPL temps réel
│           ├── simulationEngine.js       Moteur de simulation
│           ├── routeService.js           Cache OSRM
│           ├── dispatchAI.js             Sélection meilleur véhicule
│           └── driveTime.js              Estimation temps trajet
│
└── README.md
```

---

## 🔌 Endpoints REST principaux

### Authentification
| Méthode | Route | Description |
|---|---|---|
| POST | `/auth/register` | Créer un compte |
| POST | `/auth/login` | Connexion (retourne JWT) |
| GET | `/auth/me` | Profil utilisateur courant |
| GET | `/auth/users` | Liste tous les utilisateurs (admin) |

### Collaboration en temps réel
| Méthode | Route | Description |
|---|---|---|
| WS | `/ws?token=...` | WebSocket pour diffusion temps réel |
| GET | `/shared/state` | État partagé complet |
| POST | `/shared/push` | Pousser un delta (ordre, événement) |

### Module IA — Données IoT
| Méthode | Route | Description |
|---|---|---|
| GET | `/ai/iot/snapshot?vehicle_id=V001` | Tick OBD+télémétrie temps réel |
| GET | `/ai/iot/stream?interval_s=2` | Flux SSE temps réel |
| GET | `/ai/iot/historical?vehicle_id&days&kind` | Agrégats journaliers |
| GET | `/ai/iot/breakdowns` | Pannes étiquetées |
| GET | `/ai/iot/dataset/stats` | Statistiques dataset |

### Module IA — Modèles
| Méthode | Route | Description |
|---|---|---|
| POST | `/ai/predict/maintenance` | Risque de panne 30j (un véhicule) |
| GET | `/ai/predict/maintenance/all` | Risque de panne pour toute la flotte |
| GET | `/ai/anomaly/scan?days_back=14` | Top anomalies récentes |
| POST | `/ai/whatif/simulate` | KPIs d'une configuration de flotte |
| POST | `/ai/whatif/compare` | Comparaison de 2 configurations |
| POST | `/ai/optimize/routes` | Optimisation VRP (missions + véhicules) |
| GET | `/ai/optimize/demo?n_missions=10` | Démo aléatoire reproductible |

### Module IA — Décision & NLG
| Méthode | Route | Description |
|---|---|---|
| GET | `/ai/recommend/list?days_back=14` | Recommandations actives triées |
| POST | `/ai/recommend/feedback` | Feedback bandit (accepted/dismissed/ignored) |
| GET | `/ai/recommend/bandit-stats` | État du bandit (templates + scores) |
| GET | `/ai/nlg/banner?max_items=5` | Top alertes pour le bandeau header |
| POST | `/ai/nlg/narrate` | Génération NLG d'un payload arbitraire |

---

## 📐 Concepts métier

### IPL — Indice de Pression Logistique

```
IPL = (charge_simulée) / max(1, véhicules_opérationnels) × 100
```

Un véhicule est *opérationnel* si : `etat === 'OK' && !en_transit`.

| Niveau | Plage | Couleur | Action |
|---|---|---|---|
| Vert | < 40 % | 🟢 | Aucune |
| Orange | 40-74 % | 🟠 | Surveillance |
| Rouge | ≥ 75 % | 🔴 | Alerte + actions IA automatiques |

### États véhicule
- **OK** : opérationnel
- **Risque** : km depuis maintenance ≥ seuil critique (configurable, défaut 4 000 km)
- **Panne** : indisponible
- **en_transit** : booléen indépendant — true pendant un trajet
- **onLoan** : véhicule prêté à un autre siège (badge "prêt·CASA")

### États ordre de transport
- `active` → en route
- `awaiting_auth` → arrivé, demande d'autorisation
- `completed` → terminé (avec `authorization: 'use'` ou `'return'`)
- `cancelled` → annulé

---

## 🛠 Stack technique

| Couche | Technologie |
|---|---|
| **Frontend** | React 18 · Vite · Tailwind CSS 3 · Zustand · Leaflet 1.9 · Recharts |
| **Backend** | FastAPI 0.115 · SQLAlchemy 2 · python-jose (JWT) · passlib (bcrypt) |
| **Persistance** | SQLite (utilisateurs) + JSON (bandit) + CSV (datasets) |
| **Temps réel** | WebSocket FastAPI + Server-Sent Events |
| **ML** | scikit-learn 1.5 · LightGBM 4.6 · OR-Tools 9.11 · pandas · numpy |
| **Cartographie** | OpenStreetMap CartoDB Voyager · GeoJSON Maroc · OSRM (routes routières) |

---

## 📊 Données synthétiques

Le dataset historique est généré de façon reproductible (seed = 42) avec :

- **Profils véhicules** réalistes par type (RPM max, conso L/100, CO₂ g/km, poids)
- **Profils conducteurs** : safe / neutre / agressif (probas d'événements différentes)
- **Axes routiers réels Maroc** : Casa-Tanger 340 km · Casa-Marrakech 240 km · etc.
- **Trafic urbain Casablanca** modélisé : vitesse × 0.55 aux heures de pointe (7-9h, 17-19h)
- **Dégradation pré-panne** : 7 jours avant chaque panne, indicateurs progressivement dégradés (+40 % T°/RPM)

---

## 📝 Licence & Crédits

Projet académique réalisé dans le cadre du Master MSID — Mathématiques Appliquées, Statistique, Informatique Décisionnelle, Tronc commun A, à la Faculté des Sciences de Rabat, Université Mohammed V.

**Auteur** : TIYAOUIL Fathallah · Promotion 2024-2026

---

## 🆘 Dépannage

| Problème | Solution |
|---|---|
| Backend refuse login | Vérifier `bcrypt==4.0.1` (5.x incompatible avec passlib) |
| Port 8000 occupé | `taskkill /F /PID <pid>` ou changer le port dans `main.py` |
| Frontend pas connecté au backend | Vérifier que backend tourne sur `localhost:8000` |
| Tuiles carte ne chargent pas | Vérifier connexion Internet (CartoDB CDN) |
| Routes routières absentes | OSRM public peut être lent — fallback ligne droite après 6 s |
| Dataset CSV manquant | Lancer `python -m ai_extensions.data.synthetic_dataset` |
