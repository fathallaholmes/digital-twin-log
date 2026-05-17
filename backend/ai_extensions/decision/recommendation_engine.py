"""
Moteur de Recommandation — Règles métier + Bandit contextuel ε-greedy
======================================================================
Lie chaque alerte IA (panne prédite, anomalie de conduite, surcharge, ...)
à une **action concrète et exécutable** par le gestionnaire de flotte.

Architecture en 2 couches :

    1. **Couche RULES** : règles métier déterministes qui transforment les
       prédictions ML en recommandations structurées (titre, contexte, action,
       sévérité). Catalogue extensible.

    2. **Couche BANDIT** : un bandit contextuel ε-greedy qui apprend des
       feedbacks utilisateurs ("Accepté" → +1, "Ignoré" → 0, "Rejeté" → -1).
       Il ajuste le **score de confiance** de chaque template de règle au
       fil du temps : les actions qui fonctionnent remontent dans le ranking.

    Politique : avec proba ε=0.10 on explore (action random), sinon exploit (best).

Persistance : fichier JSON (bandit_stats.json) pour conserver l'apprentissage
entre redémarrages du serveur.
"""

from __future__ import annotations
import json
import random
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from ..models import maintenance_predictive as mp
from ..models import anomaly_detector       as ad


# ── Persistance ──────────────────────────────────────────────────────────────
_HERE       = Path(__file__).parent
STATE_FILE  = _HERE / "bandit_state.json"

# Cache mémoire des recommandations émises (orderable feedback)
_emitted_recommendations: dict[str, dict] = {}

# Stats bandit : par template_id → {n_pulls, n_accepted, n_dismissed, score}
_bandit_stats: dict[str, dict] = {}


# ── Politique ε-greedy ───────────────────────────────────────────────────────
EPSILON = 0.10   # 10 % exploration


def _load_state():
    global _bandit_stats
    if STATE_FILE.exists():
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            _bandit_stats = json.load(f)


def _save_state():
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(_bandit_stats, f, indent=2, ensure_ascii=False)


_load_state()


def _ensure_template(template_id: str):
    if template_id not in _bandit_stats:
        _bandit_stats[template_id] = {
            "n_pulls":     0,
            "n_accepted":  0,
            "n_dismissed": 0,
            "n_ignored":   0,
            "score":       0.5,  # confiance initiale neutre
        }


def _score_template(template_id: str) -> float:
    """Score du bandit pour un template (entre 0 et 1)."""
    _ensure_template(template_id)
    s = _bandit_stats[template_id]
    if s["n_pulls"] == 0:
        return 0.5
    # Score = accepted / (accepted + dismissed + ignored*0.3)
    reward = s["n_accepted"] - s["n_dismissed"]
    return max(0.0, min(1.0, 0.5 + (reward / max(1, s["n_pulls"])) * 0.5))


def _epsilon_greedy_select(candidates: list[dict], rng: random.Random) -> list[dict]:
    """Trie les candidats selon le bandit + bruit d'exploration."""
    for c in candidates:
        c["bandit_score"] = _score_template(c["template_id"])
        # Ajout de bruit ε pour explorer
        if rng.random() < EPSILON:
            c["bandit_score"] += rng.uniform(-0.3, 0.3)
    candidates.sort(key=lambda c: c["bandit_score"], reverse=True)
    return candidates


# ═══════════════════════════════════════════════════════════════════════════════
#  Catalogue de règles métier
# ═══════════════════════════════════════════════════════════════════════════════
def rule_maintenance_critical(pred: dict) -> Optional[dict]:
    if pred.get("risk_level") != "critique":
        return None
    return {
        "template_id": "maintenance_critical_immobilize",
        "severity":    "critique",
        "category":    "maintenance",
        "vehicle_id":  pred["vehicle_id"],
        "title":       f"Immobiliser {pred['vehicle_id']} sous 48h",
        "detail":      f"Risque de panne {pred['piece_at_risk']} évalué à {pred['probability']*100:.0f}% "
                       f"dans les {pred['horizon_days']} prochains jours.",
        "recommended_action": f"Programmer immédiatement un contrôle {pred['piece_at_risk']} en atelier.",
        "metadata":    pred,
    }


def rule_maintenance_high(pred: dict) -> Optional[dict]:
    if pred.get("risk_level") != "élevé":
        return None
    return {
        "template_id": "maintenance_high_schedule",
        "severity":    "élevé",
        "category":    "maintenance",
        "vehicle_id":  pred["vehicle_id"],
        "title":       f"Planifier contrôle {pred['vehicle_id']} cette semaine",
        "detail":      f"Risque de panne {pred['piece_at_risk']} à {pred['probability']*100:.0f}% "
                       f"({pred['siege']}). Signaux : {', '.join(pred.get('contributing_factors', [])[:2])}.",
        "recommended_action": f"Inspection {pred['piece_at_risk']} sous 7 jours.",
        "metadata":    pred,
    }


def rule_anomaly_aggressive_driver(anom: dict) -> Optional[dict]:
    if anom.get("severity") not in ("critique", "élevé"):
        return None
    if anom.get("driver_profile") != "aggressif":
        return None
    return {
        "template_id": "anomaly_aggressive_driver_training",
        "severity":    anom["severity"],
        "category":    "comportement",
        "vehicle_id":  anom["vehicle_id"],
        "title":       f"Formation sécurité conducteur {anom['vehicle_id']}",
        "detail":      f"Comportement de conduite anormal détecté avec confiance {anom['confidence_pct']}% "
                       f"({anom.get('siege', '?')}). " +
                       (anom['reasons'][0] if anom.get('reasons') else ""),
        "recommended_action": "Programmer session de formation éco-conduite + audit conducteur.",
        "metadata":    anom,
    }


def rule_anomaly_unknown_driver(anom: dict) -> Optional[dict]:
    if anom.get("severity") != "critique":
        return None
    if anom.get("driver_profile") == "aggressif":
        return None
    return {
        "template_id": "anomaly_unexpected_critical",
        "severity":    "critique",
        "category":    "anomalie",
        "vehicle_id":  anom["vehicle_id"],
        "title":       f"Anomalie inattendue sur {anom['vehicle_id']}",
        "detail":      f"Profil conducteur {anom.get('driver_profile')} mais comportement critique "
                       f"({anom['confidence_pct']}% confiance). Possible incident technique ou utilisateur tiers.",
        "recommended_action": "Vérifier identité conducteur + diagnostic OBD complet.",
        "metadata":    anom,
    }


def rule_maintenance_overdue(pred: dict) -> Optional[dict]:
    factors = pred.get("contributing_factors", [])
    if not any("Maintenance en retard" in f for f in factors):
        return None
    return {
        "template_id": "maintenance_overdue_schedule",
        "severity":    "modéré",
        "category":    "maintenance",
        "vehicle_id":  pred["vehicle_id"],
        "title":       f"Maintenance préventive {pred['vehicle_id']} attendue",
        "detail":      f"Le véhicule cumule plus de 4 000 km depuis la dernière maintenance.",
        "recommended_action": "Inclure dans le prochain créneau d'atelier (vidange + filtres + freins).",
        "metadata":    pred,
    }


RULES = [
    rule_maintenance_critical,
    rule_maintenance_high,
    rule_anomaly_aggressive_driver,
    rule_anomaly_unknown_driver,
    rule_maintenance_overdue,
]


# ═══════════════════════════════════════════════════════════════════════════════
#  Génération des recommandations
# ═══════════════════════════════════════════════════════════════════════════════
def generate_recommendations(
    vehicle_ids:  Optional[list[str]] = None,
    days_back:    int = 14,
    max_results:  int = 20,
    seed:         int = 42,
) -> list[dict]:
    """
    Lance les modèles ML + applique les règles + scoring bandit.
    Retourne la liste triée des recommandations à présenter.
    """
    if vehicle_ids is None:
        vehicle_ids = [f"V{i:03d}" for i in range(1, 76)]

    rng = random.Random(seed + int(datetime.utcnow().timestamp()))

    # ── 1. Sources : maintenance + anomalies ─────────────────────────────────
    maint_preds = mp.predict_all(vehicle_ids)
    anom_scan   = ad.scan_recent_anomalies(days_back=days_back, max_results=50)
    anomalies   = anom_scan.get("results", [])

    # ── 2. Application des règles ────────────────────────────────────────────
    candidates: list[dict] = []
    for p in maint_preds:
        if "error" in p: continue
        for rule in RULES:
            if rule.__name__.startswith("rule_maintenance"):
                r = rule(p)
                if r:
                    r["id"]         = str(uuid.uuid4())[:8]
                    r["created_at"] = datetime.utcnow().isoformat()
                    candidates.append(r)
    for a in anomalies:
        if a.get("severity") == "normal": continue
        for rule in RULES:
            if rule.__name__.startswith("rule_anomaly"):
                r = rule(a)
                if r:
                    r["id"]         = str(uuid.uuid4())[:8]
                    r["created_at"] = datetime.utcnow().isoformat()
                    candidates.append(r)

    # ── 3. Dédoublonnage par (template_id, vehicle_id) ──────────────────────
    seen, dedup = set(), []
    for c in candidates:
        key = (c["template_id"], c["vehicle_id"])
        if key in seen: continue
        seen.add(key)
        dedup.append(c)
    candidates = dedup

    # ── 4. Scoring + tri ε-greedy par sévérité ───────────────────────────────
    SEV_ORDER = {"critique": 0, "élevé": 1, "modéré": 2, "faible": 3}
    candidates = _epsilon_greedy_select(candidates, rng)
    candidates.sort(key=lambda c: (SEV_ORDER.get(c["severity"], 9), -c["bandit_score"]))

    # ── 5. Garder le top + persister en cache pour feedback ──────────────────
    out = candidates[:max_results]
    for r in out:
        _emitted_recommendations[r["id"]] = r
    return out


# ═══════════════════════════════════════════════════════════════════════════════
#  Feedback : maj du bandit
# ═══════════════════════════════════════════════════════════════════════════════
def record_feedback(recommendation_id: str, feedback: str) -> dict:
    """
    feedback ∈ {accepted, dismissed, ignored}
    Met à jour les stats bandit et persiste sur disque.
    """
    if feedback not in ("accepted", "dismissed", "ignored"):
        raise ValueError("feedback doit être 'accepted', 'dismissed' ou 'ignored'")

    rec = _emitted_recommendations.get(recommendation_id)
    if rec is None:
        return {"error": "Recommandation inconnue ou expirée", "id": recommendation_id}

    template_id = rec["template_id"]
    _ensure_template(template_id)
    s = _bandit_stats[template_id]
    s["n_pulls"] += 1
    if   feedback == "accepted":  s["n_accepted"]  += 1
    elif feedback == "dismissed": s["n_dismissed"] += 1
    else:                          s["n_ignored"]   += 1
    s["score"] = _score_template(template_id)
    _save_state()

    return {
        "status":         "recorded",
        "template_id":    template_id,
        "new_score":      s["score"],
        "n_pulls":        s["n_pulls"],
        "feedback":       feedback,
    }


def get_bandit_stats() -> dict:
    return {
        "templates": _bandit_stats,
        "total_recommendations_emitted": len(_emitted_recommendations),
        "epsilon": EPSILON,
        "policy": "ε-greedy contextuel",
    }


def reset_bandit():
    global _bandit_stats, _emitted_recommendations
    _bandit_stats = {}
    _emitted_recommendations = {}
    if STATE_FILE.exists():
        STATE_FILE.unlink()


# ── CLI ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    try: sys.stdout.reconfigure(encoding="utf-8")
    except Exception: pass

    print("[*] Generation des recommandations...")
    recs = generate_recommendations(max_results=10)
    for r in recs:
        print(f"\n[{r['severity'].upper()}] {r['title']}")
        print(f"  Categorie    : {r['category']}")
        print(f"  Detail       : {r['detail']}")
        print(f"  Action       : {r['recommended_action']}")
        print(f"  Bandit score : {r.get('bandit_score', 0):.2f}")
        print(f"  ID           : {r['id']}")

    print(f"\n[*] Total recommandations : {len(recs)}")
