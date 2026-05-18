"""
Couche Cyber du jumeau numérique — Data Acquisition Layer.
==========================================================
Persiste tous les flux entrants du monde physique :

    - Capteurs véhicules    (OBD, GPS, télémétrie)         → push automatique
    - Saisies conducteurs   (incidents, pleins, km manuel) → formulaires
    - Saisies chef de parc  (pannes, interventions, missions)

Alimente la couche Digital (jumeau, simulations, modèles IA) avec des données
réelles persistées en base SQLite (cyber.db).
"""

__version__ = "1.0.0"
