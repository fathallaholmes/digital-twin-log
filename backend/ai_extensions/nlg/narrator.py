"""
NLG Narrator — Génération de langage naturel pour les alertes IA
==================================================================
Traduit les sorties brutes des modèles ML (scores, probabilités, scores d'anomalies)
en **phrases naturelles en français** lisibles par un gestionnaire de flotte.

Trois niveaux d'abondance :
    - banner   : 1 phrase ultra-courte pour le bandeau du header
    - card     : 2-3 phrases pour une carte récap
    - detailed : paragraphe complet avec recommandations

Approche : **templates paramétrés** avec variations stylistiques pour éviter
la monotonie. Pas de LLM (déterministe + reproductible + zéro latence).
"""

from __future__ import annotations
import random
from datetime import datetime


# ── Vocabulaire et variations ────────────────────────────────────────────────
URGENCY_PREFIXES = {
    "critique": ["🚨 URGENCE", "⛔ CRITIQUE", "🔴 IMMÉDIAT"],
    "élevé":    ["⚠️ ATTENTION", "🟠 ALERTE", "❗ Important"],
    "modéré":   ["🟡 Vigilance", "📌 À surveiller", "⚡ Notable"],
    "faible":   ["ℹ️ Info", "·  Note", "💡 À noter"],
    "normal":   ["✅ OK", "·  Normal"],
}

PIECE_FR = {
    "plaquettes_frein":  "plaquettes de frein",
    "courroie_distrib":  "courroie de distribution",
    "turbo":             "turbo",
    "amortisseurs":      "amortisseurs",
    "embrayage":         "embrayage",
    "alternateur":       "alternateur",
    "radiateur":         "radiateur",
    "pneus":             "pneumatiques",
}

DRIVER_FR = {
    "safe":      "prudent",
    "neutre":    "normal",
    "aggressif": "agressif",
}


def _rng_for(seed_str: str) -> random.Random:
    """RNG déterministe basé sur la chaîne (cohérence visuelle entre rechargements)."""
    return random.Random(hash(seed_str) & 0xFFFFFFFF)


def _prefix(severity: str, seed: str = "") -> str:
    pool = URGENCY_PREFIXES.get(severity, [""])
    return _rng_for(seed).choice(pool)


# ═══════════════════════════════════════════════════════════════════════════════
#  1. Maintenance prédictive
# ═══════════════════════════════════════════════════════════════════════════════
def narrate_maintenance(prediction: dict, level: str = "card") -> str:
    """Convertit une prédiction de maintenance en phrase NLG."""
    vid    = prediction.get("vehicle_id", "?")
    vtype  = prediction.get("vehicle_type", "")
    prob   = prediction.get("probability", 0) * 100
    risk   = prediction.get("risk_level", "faible")
    piece  = PIECE_FR.get(prediction.get("piece_at_risk", ""), prediction.get("piece_at_risk", ""))
    siege  = prediction.get("siege", "")
    reco   = prediction.get("recommendation", "")
    horizon = prediction.get("horizon_days", 30)

    if level == "banner":
        return f"{_prefix(risk, vid)} — {vid} : {prob:.0f}% de panne {piece} à {horizon}j"

    if level == "card":
        return (f"{_prefix(risk, vid)} {vid} ({vtype}) basé à {siege}. "
                f"Le jumeau détecte un risque de panne {piece} à **{prob:.0f}%** dans les {horizon} prochains jours.")

    # detailed
    factors = prediction.get("contributing_factors", [])
    facts_txt = ""
    if factors:
        facts_txt = "\nSignaux détectés : " + " · ".join(factors[:3]) + "."
    return (f"{_prefix(risk, vid)} {vid} ({vtype}, {siege}) — risque de panne **{piece}** "
            f"évalué à **{prob:.0f}%** sur les {horizon} prochains jours.{facts_txt}\n"
            f"→ {reco}")


# ═══════════════════════════════════════════════════════════════════════════════
#  2. Anomalies de conduite
# ═══════════════════════════════════════════════════════════════════════════════
def narrate_anomaly(anomaly: dict, level: str = "card") -> str:
    vid      = anomaly.get("vehicle_id", "?")
    vtype    = anomaly.get("vehicle_type", "")
    driver   = DRIVER_FR.get(anomaly.get("driver_profile", "neutre"), "")
    severity = anomaly.get("severity", "normal")
    conf     = anomaly.get("confidence_pct", 0)
    siege    = anomaly.get("siege", "")
    reasons  = anomaly.get("reasons", [])
    date     = anomaly.get("date", "")

    if level == "banner":
        if reasons:
            short_reason = reasons[0].split(' (')[0].lower()
            return f"{_prefix(severity, vid)} — Anomalie {vid} ({driver}) : {short_reason}"
        return f"{_prefix(severity, vid)} — Anomalie détectée {vid} ({conf}% confiance)"

    if level == "card":
        msg = (f"{_prefix(severity, vid)} Comportement anormal détecté sur {vid} "
               f"({vtype}, conducteur {driver}) à {siege}. ")
        if reasons:
            msg += f"Principal signal : {reasons[0].lower()}."
        msg += f" Niveau de confiance : {conf}%."
        return msg

    # detailed
    msg = (f"{_prefix(severity, vid)} Analyse Isolation Forest sur {vid} le {date} : "
           f"déviation comportementale significative (confiance {conf}%).\n"
           f"Conducteur : {driver}. Base : {siege}.\n")
    if reasons:
        msg += "Anomalies relevées :\n" + "\n".join(f"  • {r}" for r in reasons[:4])
    return msg


# ═══════════════════════════════════════════════════════════════════════════════
#  3. Optimisation tournées (résultat OR-Tools)
# ═══════════════════════════════════════════════════════════════════════════════
def narrate_optimization(result: dict, level: str = "card") -> str:
    gain_d = result.get("gain_vs_naive", {}).get("distance_pct", 0)
    gain_c = result.get("gain_vs_naive", {}).get("co2_pct", 0)
    n_v    = result.get("n_vehicles_used", 0)
    n_t    = result.get("n_vehicles_total", 0)
    n_m    = result.get("n_missions", 0)

    if level == "banner":
        return f"🛣 Optimisation : -{gain_d:.0f}% distance, -{gain_c:.0f}% CO₂ ({n_m} missions, {n_v}/{n_t} véh.)"

    if level == "card":
        return (f"✅ Tournées optimisées : **{n_m} missions** réparties sur **{n_v} véhicules** "
                f"(au lieu de {n_t}). Gain : **-{gain_d:.0f}% distance**, **-{gain_c:.0f}% CO₂**.")

    dur = result.get("total_duration_min", 0)
    dst = result.get("total_distance_km", 0)
    co2 = result.get("total_co2_kg", 0)
    return (f"✅ Optimisation OR-Tools réussie : {n_m} missions servies par {n_v} véhicules "
            f"(au lieu de {n_t} en stratégie naïve).\n"
            f"Distance totale : {dst:.0f} km · Durée : {dur:.0f} min · CO₂ : {co2:.0f} kg.\n"
            f"Économies : -{gain_d:.0f}% distance, -{gain_c:.0f}% CO₂.")


# ═══════════════════════════════════════════════════════════════════════════════
#  4. What-If (comparaison de configurations)
# ═══════════════════════════════════════════════════════════════════════════════
def narrate_whatif(compare: dict, level: str = "card") -> str:
    delta_d = compare.get("delta_pct", {}).get("delay_min_avg", 0)
    delta_c = compare.get("delta_pct", {}).get("co2_kg_day", 0)
    delta_p = compare.get("delta_pct", {}).get("breakdown_rate_pct", 0)
    label_a = compare.get("labels", {}).get("a", "Actuel")
    label_b = compare.get("labels", {}).get("b", "Proposé")

    def fmt(pct: float, good_low: bool = True) -> str:
        if abs(pct) < 0.5: return "stable"
        sign = "-" if pct < 0 else "+"
        ico  = ("📉" if (pct < 0) == good_low else "📈")
        return f"{ico} {sign}{abs(pct):.1f}%"

    if level == "banner":
        return f"🔮 Scenario '{label_b}' vs '{label_a}' : délai {fmt(delta_d)}, CO₂ {fmt(delta_c)}"

    return (f"Scénario **{label_b}** vs **{label_a}** : "
            f"délai {fmt(delta_d)}, CO₂ {fmt(delta_c)}, taux panne {fmt(delta_p)}.")


# ═══════════════════════════════════════════════════════════════════════════════
#  5. Recommandation (objet du recommendation_engine)
# ═══════════════════════════════════════════════════════════════════════════════
def narrate_recommendation(rec: dict, level: str = "card") -> str:
    severity = rec.get("severity", "modéré")
    title    = rec.get("title", "")
    detail   = rec.get("detail", "")
    action   = rec.get("recommended_action", "")
    vid      = rec.get("vehicle_id", "")

    if level == "banner":
        return f"{_prefix(severity, rec.get('id', vid))} {title}"

    if level == "card":
        return f"{_prefix(severity, rec.get('id', vid))} **{title}** — {detail}\n→ {action}"

    return (f"{_prefix(severity, rec.get('id', vid))} **{title}**\n"
            f"Contexte : {detail}\n"
            f"Action recommandée : {action}")


# ═══════════════════════════════════════════════════════════════════════════════
#  6. Banner agrégé — top alertes pour le bandeau du header
# ═══════════════════════════════════════════════════════════════════════════════
def build_banner_messages(maintenance_preds: list[dict],
                          anomalies:         list[dict],
                          recommendations:   list[dict],
                          max_items:         int = 5) -> list[dict]:
    """
    Sélectionne les messages les plus urgents toutes catégories confondues
    et les renvoie sous forme de bandeau scrolling.
    """
    SEVERITY_ORDER = {"critique": 0, "élevé": 1, "modéré": 2, "faible": 3, "normal": 4}

    items = []

    for p in maintenance_preds:
        if p.get("risk_level") in ("critique", "élevé", "modéré"):
            items.append({
                "kind":     "maintenance",
                "severity": p["risk_level"],
                "message":  narrate_maintenance(p, level="banner"),
                "vehicle_id": p.get("vehicle_id"),
            })

    for a in anomalies:
        if a.get("severity") in ("critique", "élevé"):
            items.append({
                "kind":     "anomaly",
                "severity": a["severity"],
                "message":  narrate_anomaly(a, level="banner"),
                "vehicle_id": a.get("vehicle_id"),
            })

    for r in recommendations:
        if r.get("severity") in ("critique", "élevé"):
            items.append({
                "kind":     "recommendation",
                "severity": r["severity"],
                "message":  narrate_recommendation(r, level="banner"),
                "vehicle_id": r.get("vehicle_id"),
            })

    # Tri par sévérité puis dédoublonnage par véhicule
    items.sort(key=lambda x: SEVERITY_ORDER.get(x["severity"], 9))
    seen = set()
    out = []
    for it in items:
        key = (it["kind"], it.get("vehicle_id"))
        if key in seen:
            continue
        seen.add(key)
        out.append(it)
        if len(out) >= max_items:
            break
    return out
