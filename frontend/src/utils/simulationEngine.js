// /frontend/src/utils/simulationEngine.js
// Moteur de simulation pas-à-pas. 1 step = 15 minutes simulées.
//
// Modèle :
//   - vehicles : tableau des 75 véhicules
//   - charges  : { ville: float } — "charge logistique" (commandes + retards pondérés)
//   - IPL      = charge / max(1, OK) * 100
//
// La panne :
//   - met 3 véhicules en état Panne
//   - ajoute une "charge_panne" instantanée à la ville (retards générés)
// Les actions IA :
//   - transfert  : modifie la ville d'attache au step d'arrivée
//   - replanif   : déplace de la charge d'une ville vers une autre
//   - réparation : cascade (45, 90, 135 min) — pure mécanique sur temps_estime_reparation

import { calculateIPL } from './iplCalculator';
import { estimateDriveTime } from './driveTime';

/** Identifie 3 véhicules Casa à mettre en panne : 1 cargo, 1 VLTT, 1 M915. */
export function pickCasaBreakdowns(vehicles) {
  const casa = vehicles.filter(v => v.siege === 'Casablanca' && v.etat === 'OK');
  const cargo = casa.find(v => v.type === 'Cargo 3.5t');
  const vltt  = casa.find(v => v.type === 'VLTT');
  const m915  = casa.find(v => v.type === 'M915 Conteneur');
  return [cargo, vltt, m915].filter(Boolean).map(v => v.id);
}

/** Applique des pannes (avec temps_estime_reparation par défaut). */
export function applyBreakdowns(vehicles, ids, repairMinutes = 45) {
  return vehicles.map(v =>
    ids.includes(v.id)
      ? { ...v, etat: 'Panne', temps_estime_reparation: repairMinutes }
      : v
  );
}

/** Cascade : 1er répare en R, 2e en 2R, 3e en 3R minutes. */
export function cascadeRepair(vehicles, brokenIds, baseRepairMin = 45) {
  return vehicles.map(v => {
    const idx = brokenIds.indexOf(v.id);
    if (idx === -1) return v;
    return { ...v, temps_estime_reparation: baseRepairMin * (idx + 1) };
  });
}

/** Programme un transfert de N véhicules OK depuis villeSource vers villeCible. */
export function planTransfer(vehicles, villeSource, villeCible, nbVehicules, currentStepIndex, stepMinutes = 15) {
  const candidates = vehicles
    .filter(v => v.siege === villeSource && v.etat === 'OK')
    .slice(0, nbVehicules);
  const drive = estimateDriveTime(villeSource, villeCible);
  const stepsToArrive = Math.ceil(drive / stepMinutes);
  return {
    transfers: candidates.map(v => ({
      id: v.id,
      from: villeSource,
      to: villeCible,
      arrivalStep: currentStepIndex + stepsToArrive,
      drive,
    })),
    drivePlannedMinutes: drive,
  };
}

/** Applique l'arrivée d'un transfert (changement de siège/position). */
export function applyTransferArrival(vehicles, transferIds, villeCible, sieges) {
  const target = sieges.find(s => s.ville === villeCible);
  return vehicles.map(v =>
    transferIds.includes(v.id)
      ? { ...v, siege: villeCible, position: { lat: target.lat, lon: target.lon } }
      : v
  );
}

/** Replanification : transfère X charge de la ville source vers la cible (immédiat). */
export function replanify(charges, fromVille, toVille, deltaCharge) {
  return {
    ...charges,
    [fromVille]: Math.max(0, (charges[fromVille] ?? 0) - deltaCharge),
    [toVille]:   (charges[toVille] ?? 0) + deltaCharge * 0.5, // Rabat absorbe partiellement
  };
}

/** Avance la réparation des véhicules en panne d'un step. */
export function repairStep(vehicles, stepMinutes = 15) {
  return vehicles.map(v => {
    if (v.etat !== 'Panne') return v;
    const remaining = v.temps_estime_reparation - stepMinutes;
    if (remaining <= 0) {
      return { ...v, etat: 'OK', temps_estime_reparation: 0, km_depuis_derniere_maintenance: 0 };
    }
    return { ...v, temps_estime_reparation: remaining };
  });
}

/** Formate "HH:MM" depuis un step index relatif à 14:00. */
export function stepToClock(stepIndex, startHour = 14, startMin = 0, stepMin = 15) {
  const total = startHour * 60 + startMin + stepIndex * stepMin;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Exécute un step de simulation. Pure function.
 * Retourne { vehicles, charges, ipl, events, scheduledTransfers }
 *
 * @param {object} state - { vehicles, charges, scheduledTransfers, sieges }
 * @param {number} stepIndex - index du step (1, 2, 3, ...)
 * @param {object} dynamics - effets de la dynamique de fond (déclin/dérive)
 */
export function simulateStep(state, stepIndex, dynamics = {}) {
  const events = [];
  let { vehicles, charges, scheduledTransfers, sieges } = state;
  // copies défensives
  charges = { ...charges };
  const clock = stepToClock(stepIndex);

  // 1) Avance des réparations
  const before = vehicles;
  vehicles = repairStep(vehicles);
  const repaired = vehicles.filter((v, i) => before[i].etat === 'Panne' && v.etat === 'OK');
  repaired.forEach(v => {
    events.push(`[${clock}] ✅ Véhicule ${v.id} (${v.type}) réparé à ${v.siege}`);
  });

  // 2) Arrivée des transferts planifiés
  const arriving = scheduledTransfers.filter(t => t.arrivalStep === stepIndex);
  if (arriving.length > 0) {
    const ids = arriving.map(t => t.id);
    vehicles = applyTransferArrival(vehicles, ids, arriving[0].to, sieges);
    events.push(`[${clock}] 🚚 Arrivée transfert : ${arriving.length} véhicule(s) ${arriving[0].from} → ${arriving[0].to}`);
  }

  // 3) Dynamique de fond : nouvelles commandes arrivent (drift +epsilon par step)
  // Plus on est en zone rouge, plus la pression continue à monter légèrement.
  if (dynamics.drift) {
    Object.keys(charges).forEach(ville => {
      charges[ville] = (charges[ville] ?? 0) + (dynamics.drift[ville] ?? 0);
    });
  }

  // 4) Replanif programmée pour ce step
  if (dynamics.scheduledReplanif && dynamics.scheduledReplanif[stepIndex]) {
    const { from, to, delta } = dynamics.scheduledReplanif[stepIndex];
    charges = replanify(charges, from, to, delta);
    events.push(`[${clock}] 🔀 Replanif effective : -${delta.toFixed(1)} charge ${from} → ${to}`);
  }

  // 5) Recalcul IPL
  const ipl = {};
  sieges.forEach(s => {
    ipl[s.ville] = calculateIPL(s.ville, vehicles, charges[s.ville] ?? 0);
  });

  return { vehicles, charges, ipl, events, scheduledTransfers };
}
