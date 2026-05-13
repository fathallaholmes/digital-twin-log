// /frontend/src/utils/dispatchAI.js
// Moteur de dispatch IA : trouve le meilleur véhicule disponible pour un ordre de transport.
// Critères de tri : 1) temps de trajet minimal, 2) kilométrage minimal (meilleur état).

import { estimateDriveTime } from './driveTime';

/**
 * Retourne les candidats triés (meilleur en premier) pour couvrir une demande.
 * @param {Array}  vehicles     - flotte complète
 * @param {string} toSiege      - siège demandeur
 * @param {string} vehicleType  - type demandé ('Tous types' = pas de filtre)
 * @param {Array}  excludedIds  - IDs déjà refusés dans cette session
 */
export function findBestCandidates(vehicles, toSiege, vehicleType, excludedIds = []) {
  return vehicles
    .filter(v =>
      v.siege !== toSiege &&
      v.etat === 'OK' &&
      !v.en_transit &&
      !excludedIds.includes(v.id) &&
      (vehicleType === 'Tous types' || v.type === vehicleType)
    )
    .map(v => ({ ...v, driveTime: estimateDriveTime(v.siege, toSiege) }))
    .sort((a, b) =>
      a.driveTime - b.driveTime ||
      a.km_depuis_derniere_maintenance - b.km_depuis_derniere_maintenance
    );
}

/** Formate une durée en minutes → "1h30", "45 min", etc. */
export function formatDriveTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h00`;
  return `${h}h${String(m).padStart(2, '0')}`;
}

/** Délai réel (ms) pour simuler l'arrivée du véhicule (30 ms par minute simulée). */
export function arrivalDelayMs(driveTimeMinutes) {
  return Math.max(3000, driveTimeMinutes * 30);
}
