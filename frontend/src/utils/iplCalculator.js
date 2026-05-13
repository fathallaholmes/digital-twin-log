// /frontend/src/utils/iplCalculator.js
// Indice de Pression Logistique
//
// Représentation interne "charge logistique" (float) :
//   charge = commandes_pondérées + retards_pondérés
//   IPL    = charge / max(1, vehicules_operationnels) * 100
//
// Cette approche permet de calibrer précisément les IPL cibles
// (45% pour Casa avec 14 OK est impossible avec des entiers).

/** Calcule l'IPL d'un siège à partir de sa charge et de sa flotte. */
export function calculateIPL(ville, vehicles, charge) {
  const flotteSiege = vehicles.filter(v => v.siege === ville);
  // exclude vehicles currently en route to another siège
  const operationnels = flotteSiege.filter(v => v.etat === 'OK' && !v.en_transit).length;
  const denom = Math.max(1, operationnels);
  return Math.round((charge / denom) * 100);
}

export function iplLevel(ipl) {
  if (ipl >= 75) return 'rouge';
  if (ipl >= 40) return 'orange';
  return 'vert';
}

export function iplColor(ipl) {
  const lvl = iplLevel(ipl);
  return { vert: '#10b981', orange: '#f59e0b', rouge: '#ef4444' }[lvl];
}

/** Calcule l'IPL pour tous les sièges. charges est {ville: float}. */
export function calculateAllIPL(sieges, vehicles, charges) {
  const out = {};
  sieges.forEach(s => {
    out[s.ville] = calculateIPL(s.ville, vehicles, charges[s.ville] ?? 0);
  });
  return out;
}

/** Charge à appliquer pour atteindre l'IPL cible donné. */
export function chargeFromIPL(iplCible, okInitial) {
  return (iplCible / 100) * okInitial;
}
