"""
Digital Twin Maroc — Extensions IA & Data Science
==================================================
Module isolé regroupant les briques avancées :

    ai_extensions/
        data/         → Génération de flux IoT (OBD + télématique) et datasets historiques
        models/       → Modèles ML : maintenance prédictive, anomalies, what-if
        decision/     → Optimisation tournées (OR-Tools) + moteur de recommandation
        nlg/          → Génération de langage naturel pour les alertes
        api_routes.py → Router FastAPI agrégeant tous les endpoints /ai/*

Le module est volontairement découplé du noyau de l'application : importer
`ai_extensions.api_routes.router` dans `main.py` suffit à activer la couche IA.

Auteur : TIYAOUIL Fathallah — MSID TA 2024-2026 — FSR
"""

__version__ = "1.0.0"
