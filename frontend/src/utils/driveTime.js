// /frontend/src/utils/driveTime.js
// Estimation temps de trajet en minutes entre sièges (vitesses moyennes routes marocaines)

const DRIVE_TIMES = {
  'Tanger-Rabat':           150, // 2h30
  'Tanger-Casablanca':      210, // 3h30
  'Tanger-Errachidia':      480, // 8h00
  'Tanger-Agadir':          540, // 9h00
  'Rabat-Casablanca':        60, // 1h00
  'Rabat-Errachidia':       360, // 6h00
  'Rabat-Agadir':           420, // 7h00
  'Casablanca-Errachidia':  300, // 5h00
  'Casablanca-Agadir':      240, // 4h00
  'Errachidia-Agadir':      420, // 7h00
};

export function estimateDriveTime(villeA, villeB) {
  if (villeA === villeB) return 0;
  const key1 = `${villeA}-${villeB}`;
  const key2 = `${villeB}-${villeA}`;
  return DRIVE_TIMES[key1] ?? DRIVE_TIMES[key2] ?? 240;
}

/**
 * Retourne le siège le plus proche (par temps de trajet estimé) parmi les villes disponibles.
 * @param {string}   ville      - siège de référence
 * @param {string[]} allVilles  - liste de toutes les villes candidates
 */
export function getClosestSiege(ville, allVilles) {
  const others = allVilles.filter(v => v !== ville);
  if (others.length === 0) return null;
  return others.reduce((best, v) =>
    estimateDriveTime(ville, v) < estimateDriveTime(ville, best) ? v : best
  );
}
