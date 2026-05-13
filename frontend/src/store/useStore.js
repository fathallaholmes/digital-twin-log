// /frontend/src/store/useStore.js
import { create } from 'zustand';
import { SIEGES, INITIAL_VEHICLES } from '../data/initialData';
import { calculateAllIPL, chargeFromIPL } from '../utils/iplCalculator';
import { formatDriveTime } from '../utils/dispatchAI';

function buildInitialCharges() {
  const charges = {};
  SIEGES.forEach(s => {
    const ok = INITIAL_VEHICLES.filter(v => v.siege === s.ville && v.etat === 'OK').length;
    charges[s.ville] = chargeFromIPL(s.iplInitial, ok);
  });
  return charges;
}

function nextVehicleId(vehicles) {
  const nums = vehicles.map(v => parseInt(v.id.slice(1), 10)).filter(n => !isNaN(n));
  return `V${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`;
}

function buildProposal(candidate, toSiege, rank, total) {
  return {
    vehicleId:       candidate.id,
    vehicleType:     candidate.type,
    fromSiege:       candidate.siege,
    toSiege,
    driveTime:       candidate.driveTime,
    etaLabel:        formatDriveTime(candidate.driveTime),
    kmVehicule:      candidate.km_depuis_derniere_maintenance,
    rank,
    totalCandidates: total,
  };
}

// Réévalue l'état de chaque véhicule selon les seuils km
function applyKmThresholds(vehicles, criticalKm) {
  return vehicles.map(v => {
    if (v.etat === 'Panne' || v.en_transit) return v;
    const etat = v.km_depuis_derniere_maintenance >= criticalKm ? 'Risque' : 'OK';
    return { ...v, etat };
  });
}

const initialCharges = buildInitialCharges();
const initialIPL     = calculateAllIPL(SIEGES, INITIAL_VEHICLES, initialCharges);

export const useStore = create((set, get) => ({
  // --- DONNÉES ---
  sieges:     SIEGES,
  vehicles:   INITIAL_VEHICLES,
  charges:    initialCharges,
  ipl:        initialIPL,
  iplHistory: [{ clock: '14:00', ...initialIPL }],

  // --- PARAMÈTRES KM ---
  kmWarnThreshold:     2500,   // orange à partir de cette valeur
  kmCriticalThreshold: 4000,   // rouge / Risque à partir de cette valeur
  setKmThresholds: (warn, critical) => set((s) => {
    const vehicles = applyKmThresholds(s.vehicles, critical);
    return {
      kmWarnThreshold:     warn,
      kmCriticalThreshold: critical,
      vehicles,
      ipl: calculateAllIPL(s.sieges, vehicles, s.charges),
    };
  }),

  // --- UI ---
  selectedSiege:    'Casablanca',
  setSelectedSiege: (ville) => set({ selectedSiege: ville }),
  showFleetManager: false,
  setShowFleetManager: (v) => set({ showFleetManager: v }),
  rightTab:    'simulator',
  setRightTab: (t) => set({ rightTab: t }),

  // --- SIMULATION ---
  isSimulating:      false,
  currentStep:       0,
  maxSteps:          8,
  scheduledTransfers: [],
  events:            [],
  aiActions:         [],
  scenarioFinished:  false,

  // --- DISPATCH ---
  transportOrders:    [],
  vehicleHistory:     [],            // historique complet des trajets
  dispatchCandidates: [],
  dispatchIndex:      -1,
  dispatchToSiege:    '',
  pendingOrder:       null,
  orderCounter:       1,

  setDispatch: (candidates, toSiege) => {
    const idx = candidates.length > 0 ? 0 : -1;
    set({
      dispatchCandidates: candidates,
      dispatchIndex:      idx,
      dispatchToSiege:    toSiege,
      pendingOrder:       idx >= 0
        ? buildProposal(candidates[idx], toSiege, idx + 1, candidates.length)
        : null,
    });
  },

  setDispatchIndex: (n) => set((s) => {
    if (n < 0 || n >= s.dispatchCandidates.length) return {};
    return {
      dispatchIndex: n,
      pendingOrder:  buildProposal(
        s.dispatchCandidates[n],
        s.dispatchToSiege,
        n + 1,
        s.dispatchCandidates.length
      ),
    };
  }),

  clearDispatchSession: () => set({
    dispatchCandidates: [], dispatchIndex: -1,
    dispatchToSiege: '', pendingOrder: null,
  }),

  // --- PARAMÈTRES SIMULATION ---
  paramTransferCount:   2,
  paramRepairTime:      45,
  paramReplanifyActive: true,
  setParam: (key, value) => set({ [key]: value }),

  // ─── VÉHICULES ───────────────────────────────────────────────────────────
  setVehicles: (vehicles) => set({ vehicles }),
  setCharges:  (charges)  => set({ charges }),
  setIPL:      (ipl)      => set({ ipl }),

  addVehicle: (data) => set((s) => {
    const id    = nextVehicleId(s.vehicles);
    const siege = s.sieges.find(sg => sg.ville === data.siege);
    const km    = Number(data.km) || 0;
    const vehicle = {
      id,
      type:     data.type,
      siege:    data.siege,
      etat:     km >= s.kmCriticalThreshold ? 'Risque' : (data.etat || 'OK'),
      position: { lat: siege?.lat ?? 33.5731, lon: siege?.lon ?? -7.5898 },
      km_depuis_derniere_maintenance: km,
      temps_estime_reparation: 0,
      en_transit: false,
    };
    const vehicles = [...s.vehicles, vehicle];
    return { vehicles, ipl: calculateAllIPL(s.sieges, vehicles, s.charges) };
  }),

  updateVehicle: (id, changes) => set((s) => {
    const vehicles = s.vehicles.map(v => {
      if (v.id !== id) return v;
      const updated = { ...v, ...changes };
      // Re-évaluer l'état selon les seuils si le km change
      if ('km_depuis_derniere_maintenance' in changes && updated.etat !== 'Panne') {
        updated.etat = updated.km_depuis_derniere_maintenance >= s.kmCriticalThreshold ? 'Risque' : 'OK';
      }
      return updated;
    });
    return { vehicles, ipl: calculateAllIPL(s.sieges, vehicles, s.charges) };
  }),

  removeVehicle: (id) => set((s) => {
    const vehicles = s.vehicles.filter(v => v.id !== id);
    return { vehicles, ipl: calculateAllIPL(s.sieges, vehicles, s.charges) };
  }),

  // ─── TRANSPORT ORDERS ────────────────────────────────────────────────────
  confirmOrder: (missionType) => set((s) => {
    const order = s.pendingOrder;
    if (!order) return {};
    const orderId   = `ORD-${String(s.orderCounter).padStart(3, '0')}`;
    const confirmed = {
      ...order, id: orderId, status: 'active',
      missionType: missionType || 'Non spécifiée',
      startedAt: Date.now(),
      requestedAt: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    };
    const vehicles = s.vehicles.map(v =>
      v.id === order.vehicleId ? { ...v, en_transit: true } : v
    );
    const ipl   = calculateAllIPL(s.sieges, vehicles, s.charges);
    const event = `[${orderId}] 🚚 Départ ${order.vehicleId} (${order.vehicleType}) ${order.fromSiege} → ${order.toSiege} · ${missionType} · ETA ${order.etaLabel}`;
    return {
      vehicles, ipl,
      transportOrders:    [...s.transportOrders, confirmed],
      pendingOrder:       null,
      dispatchCandidates: [], dispatchIndex: -1,
      orderCounter:       s.orderCounter + 1,
      events:             [...s.events, event],
    };
  }),

  completeOrder: (orderId) => set((s) => {
    const order = s.transportOrders.find(o => o.id === orderId);
    if (!order || order.status !== 'active') return {};
    const siege    = s.sieges.find(sg => sg.ville === order.toSiege);
    const vehicles = s.vehicles.map(v =>
      v.id === order.vehicleId
        ? { ...v, siege: order.toSiege, en_transit: false,
            position: { lat: siege.lat, lon: siege.lon } }
        : v
    );
    const ipl = calculateAllIPL(s.sieges, vehicles, s.charges);
    const now = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    // Ordres de retour → complétés directement ; ordres aller → attente d'autorisation
    const newStatus = order.isReturn ? 'completed' : 'awaiting_auth';
    const orders = s.transportOrders.map(o =>
      o.id === orderId ? { ...o, status: newStatus, completedAt: now } : o
    );

    let vehicleHistory = s.vehicleHistory;
    let event;

    if (order.isReturn) {
      // Retour : effacer le flag prêt, enregistrer dans l'historique
      const vIdx = vehicles.findIndex(v => v.id === order.vehicleId);
      if (vIdx >= 0) {
        vehicles[vIdx] = { ...vehicles[vIdx], onLoan: false, loanFrom: null };
      }
      vehicleHistory = [...s.vehicleHistory, {
        id:          `HIST-${String(s.vehicleHistory.length + 1).padStart(3, '0')}`,
        orderId, vehicleId: order.vehicleId, vehicleType: order.vehicleType,
        missionType: order.missionType, fromSiege: order.fromSiege,
        toSiege: order.toSiege, driveTime: order.driveTime, etaLabel: order.etaLabel,
        requestedAt: order.requestedAt, completedAt: now, isReturn: true,
      }];
      event = `[${orderId}] ✅ ${order.vehicleId} réintégré à ${order.toSiege}`;
    } else {
      // Arrivée aller : demande d'autorisation
      event = `[${orderId}] 🚦 ${order.vehicleId} arrivé à ${order.toSiege} — Autorisation requise (utilisation ou retour)`;
    }

    return { vehicles, ipl, transportOrders: orders, vehicleHistory, events: [...s.events, event] };
  }),

  // Autoriser l'utilisation sur place (le véhicule reste au siège demandeur, marqué en prêt)
  authorizeUse: (orderId) => set((s) => {
    const order = s.transportOrders.find(o => o.id === orderId);
    if (!order) return {};
    const now    = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const orders = s.transportOrders.map(o =>
      o.id === orderId ? { ...o, status: 'completed', authorization: 'use' } : o
    );
    // Marquer le véhicule comme "en prêt" — appartient toujours à fromSiege
    const vehicles = s.vehicles.map(v =>
      v.id === order.vehicleId ? { ...v, onLoan: true, loanFrom: order.fromSiege } : v
    );
    const ipl = calculateAllIPL(s.sieges, vehicles, s.charges);
    const histEntry = {
      id: `HIST-${String(s.vehicleHistory.length + 1).padStart(3, '0')}`,
      orderId, vehicleId: order.vehicleId, vehicleType: order.vehicleType,
      missionType: order.missionType, fromSiege: order.fromSiege,
      toSiege: order.toSiege, driveTime: order.driveTime, etaLabel: order.etaLabel,
      requestedAt: order.requestedAt, completedAt: now, authorization: 'use',
    };
    const event = `[${orderId}] ✅ ${order.vehicleId} autorisé en utilisation à ${order.toSiege} (prêt de ${order.fromSiege})`;
    return { vehicles, ipl, transportOrders: orders, vehicleHistory: [...s.vehicleHistory, histEntry], events: [...s.events, event] };
  }),

  // Déclencher le retour au siège d'origine
  authorizeReturn: (orderId) => set((s) => {
    const order = s.transportOrders.find(o => o.id === orderId);
    if (!order) return {};
    const now      = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const returnId = `ORD-${String(s.orderCounter).padStart(3, '0')}`;
    const returnOrder = {
      id: returnId,
      vehicleId:   order.vehicleId,
      vehicleType: order.vehicleType,
      missionType: 'Réintégration',
      fromSiege:   order.toSiege,   // inversé
      toSiege:     order.fromSiege, // inversé
      driveTime:   order.driveTime,
      etaLabel:    order.etaLabel,
      status:      'active',
      startedAt:   Date.now(),
      requestedAt: now,
      isReturn:    true,
      originalOrderId: orderId,
    };
    // Remettre en transit
    const vehicles = s.vehicles.map(v =>
      v.id === order.vehicleId ? { ...v, en_transit: true } : v
    );
    const ipl = calculateAllIPL(s.sieges, vehicles, s.charges);
    // Marquer l'ordre original comme "retour déclenché"
    const orders = s.transportOrders.map(o =>
      o.id === orderId ? { ...o, status: 'completed', authorization: 'return' } : o
    );
    const histEntry = {
      id: `HIST-${String(s.vehicleHistory.length + 1).padStart(3, '0')}`,
      orderId, vehicleId: order.vehicleId, vehicleType: order.vehicleType,
      missionType: order.missionType, fromSiege: order.fromSiege,
      toSiege: order.toSiege, driveTime: order.driveTime, etaLabel: order.etaLabel,
      requestedAt: order.requestedAt, completedAt: now, authorization: 'return',
    };
    const event = `[${returnId}] 🔄 Retour ${order.vehicleId} ${order.toSiege} → ${order.fromSiege} · ETA ${order.etaLabel}`;
    return {
      vehicles, ipl,
      transportOrders: [...orders, returnOrder],
      vehicleHistory:  [...s.vehicleHistory, histEntry],
      orderCounter:    s.orderCounter + 1,
      events:          [...s.events, event],
    };
  }),

  cancelOrder: (orderId) => set((s) => {
    const order    = s.transportOrders.find(o => o.id === orderId);
    if (!order) return {};
    const vehicles = s.vehicles.map(v =>
      v.id === order.vehicleId ? { ...v, en_transit: false } : v
    );
    const ipl    = calculateAllIPL(s.sieges, vehicles, s.charges);
    const orders = s.transportOrders.map(o =>
      o.id === orderId ? { ...o, status: 'cancelled' } : o
    );
    const histEntry = {
      id:          `HIST-${String(s.vehicleHistory.length + 1).padStart(3, '0')}`,
      orderId,
      vehicleId:   order.vehicleId,
      vehicleType: order.vehicleType,
      missionType: order.missionType,
      fromSiege:   order.fromSiege,
      toSiege:     order.toSiege,
      driveTime:   order.driveTime,
      etaLabel:    order.etaLabel,
      requestedAt: order.requestedAt,
      completedAt: '—',
      cancelled:   true,
    };
    const event  = `[${orderId}] ❌ Annulé — ${order.vehicleId} reste à ${order.fromSiege}`;
    return {
      vehicles, ipl,
      transportOrders: orders,
      vehicleHistory:  [...s.vehicleHistory, histEntry],
      events:          [...s.events, event],
    };
  }),

  // ─── SIMULATION ──────────────────────────────────────────────────────────
  pushIPLHistory:  (entry)   => set((s) => ({ iplHistory: [...s.iplHistory, entry] })),
  pushEvents:      (evts)    => set((s) => ({ events: [...s.events, ...evts] })),
  pushAIActions:   (actions) => set((s) => ({ aiActions: [...s.aiActions, ...actions] })),
  setScheduledTransfers: (t) => set({ scheduledTransfers: t }),
  setIsSimulating: (v)       => set({ isSimulating: v }),
  setCurrentStep:  (n)       => set({ currentStep: n }),
  setScenarioFinished: (v)   => set({ scenarioFinished: v }),

  resetSimulation: () => {
    const charges = buildInitialCharges();
    const ipl     = calculateAllIPL(SIEGES, INITIAL_VEHICLES, charges);
    set({
      vehicles:          INITIAL_VEHICLES.map(v => ({ ...v, en_transit: false })),
      charges, ipl,
      iplHistory:        [{ clock: '14:00', ...ipl }],
      isSimulating:      false,
      currentStep:       0,
      scheduledTransfers: [],
      events:            [],
      aiActions:         [],
      scenarioFinished:  false,
    });
  },
}));
