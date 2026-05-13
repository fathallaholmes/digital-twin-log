// /frontend/src/components/SimulatorPanel.jsx
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import {
  pickCasaBreakdowns, applyBreakdowns, cascadeRepair,
  planTransfer, simulateStep, stepToClock,
} from '../utils/simulationEngine';
import { calculateAllIPL, chargeFromIPL } from '../utils/iplCalculator';
import { getClosestSiege } from '../utils/driveTime';

const STEP_INTERVAL_MS = 1000;
const VEHICLE_TYPES    = ['Tous types', 'Cargo 3.5t', 'VLTT', 'Minicar 9p', 'M915 Conteneur'];
const EVENT_TYPES      = [
  { value: 'panne',   label: '🔴 Pannes véhicules' },
  { value: 'rush',    label: '📈 Rush de commandes' },
  { value: 'risque',  label: '🟠 Passage en état Risque' },
];

export default function SimulatorPanel() {
  const intervalRef  = useRef(null);
  const lastToastRef = useRef({});
  const state        = useStore();

  // Mode scénario
  const [scenarioMode, setScenarioMode] = useState('predefined'); // 'predefined' | 'custom'

  // Params scénario personnalisé
  const [customSiege,       setCustomSiege]       = useState('Casablanca');
  const [customEventType,   setCustomEventType]   = useState('panne');
  const [customVehicleCount, setCustomVehicleCount] = useState(2);
  const [customVehicleType, setCustomVehicleType] = useState('Tous types');

  useEffect(() => () => clearInterval(intervalRef.current), []);

  // Toast zone rouge
  useEffect(() => {
    Object.entries(state.ipl).forEach(([ville, val]) => {
      if (val >= 75 && lastToastRef.current[ville] !== 'rouge') {
        showToast(`⚠️ ALERTE — IPL ${ville} : ${val}% (zone rouge)`);
        lastToastRef.current[ville] = 'rouge';
      } else if (val < 75 && lastToastRef.current[ville] === 'rouge') {
        lastToastRef.current[ville] = 'ok';
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ipl]);

  function showToast(msg) {
    const el = document.createElement('div');
    el.textContent = msg;
    el.className = 'fixed top-4 right-4 z-[1000] bg-red-600 text-white px-4 py-2 rounded shadow-lg text-sm';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  function stopInterval() {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }

  // ── Lance la boucle de simulation générique ──────────────────────────────
  function startSimLoop(siege, dynamics) {
    let step = 0;
    intervalRef.current = setInterval(() => {
      step += 1;
      const cur  = useStore.getState();
      const next = simulateStep(
        { vehicles: cur.vehicles, charges: cur.charges,
          scheduledTransfers: cur.scheduledTransfers, sieges: cur.sieges },
        step, dynamics
      );
      const clock = stepToClock(step);
      state.setVehicles(next.vehicles);
      state.setCharges(next.charges);
      state.setIPL(next.ipl);
      state.pushIPLHistory({ clock, ...next.ipl });
      if (next.events.length) state.pushEvents(next.events);
      state.setCurrentStep(step);

      if (next.ipl[siege] < 75 && !useStore.getState().scenarioFinished) {
        state.pushEvents([`[${clock}] 🎯 OBJECTIF ATTEINT : IPL ${siege} = ${next.ipl[siege]}%`]);
        state.setScenarioFinished(true);
      }
      if (step >= cur.maxSteps) {
        stopInterval();
        state.setIsSimulating(false);
        state.pushEvents([`[${clock}] 🏁 Simulation terminée — IPL final ${siege} : ${next.ipl[siege]}%`]);
      }
    }, STEP_INTERVAL_MS);
  }

  // ── Scénario prédéfini : panne Casa 14h00 ────────────────────────────────
  function handleLaunchScenario() {
    stopInterval();
    state.resetSimulation();
    setTimeout(() => {
      const s0     = useStore.getState();
      const sieges = s0.sieges;
      const siege  = 'Casablanca';

      const brokenIds = pickCasaBreakdowns(s0.vehicles);
      let vehicles = applyBreakdowns(s0.vehicles, brokenIds, s0.paramRepairTime);
      vehicles = cascadeRepair(vehicles, brokenIds, s0.paramRepairTime);

      let charges = { ...s0.charges };
      charges['Casablanca'] = chargeFromIPL(82, 11);

      const { transfers } = planTransfer(vehicles, 'Rabat', 'Casablanca', s0.paramTransferCount, 0, 15);
      const iplPostPanne  = calculateAllIPL(sieges, vehicles, charges);

      const events = [
        `[14:00] 🚨 Pannes : ${brokenIds.length} véhicules à Casablanca (${brokenIds.join(', ')})`,
        `[14:00] 📊 IPL Casa : 45% → ${iplPostPanne['Casablanca']}%`,
        `[14:00] 🤖 IA — Transfert ${s0.paramTransferCount} véh. Rabat→Casa (ETA 15:00)`,
        s0.paramReplanifyActive
          ? '[14:00] 🤖 IA — Replanification tournées (14:15 & 14:30)'
          : '[14:00] 🤖 IA — Replanification désactivée',
        `[14:00] 🤖 IA — Maintenance cascade (${s0.paramRepairTime} min)`,
      ];
      const aiActions = [
        { label: `Transfert ${s0.paramTransferCount}× Rabat→Casa`, eta: '15:00', active: true },
        { label: 'Replanif tournées non urgentes', eta: '14:15-14:30', active: s0.paramReplanifyActive },
        { label: `Maintenance cascade (${s0.paramRepairTime} min)`, eta: '14:45/15:30', active: true },
      ];

      const dynamics = {
        drift: { Casablanca: 0.3, Rabat: 0.1, Tanger: 0.05, Errachidia: 0.02, Agadir: 0.08 },
        scheduledReplanif: s0.paramReplanifyActive ? {
          1: { from: 'Casablanca', to: 'Rabat', delta: 1.5 },
          2: { from: 'Casablanca', to: 'Rabat', delta: 0.5 },
        } : {},
      };

      state.setVehicles(vehicles);
      state.setCharges(charges);
      state.setIPL(iplPostPanne);
      state.setScheduledTransfers(transfers);
      state.pushEvents(events);
      state.pushAIActions(aiActions);
      state.pushIPLHistory({ clock: '14:00', ...iplPostPanne });
      state.setIsSimulating(true);
      state.setCurrentStep(0);

      startSimLoop(siege, dynamics);
    }, 80);
  }

  // ── Scénario personnalisé ─────────────────────────────────────────────────
  function handleLaunchCustom() {
    stopInterval();
    state.resetSimulation();
    setTimeout(() => {
      const s0     = useStore.getState();
      const sieges = s0.sieges;
      const siege  = customSiege;

      let vehicles = [...s0.vehicles];
      let charges  = { ...s0.charges };
      const events = [];

      if (customEventType === 'panne') {
        const candidates = vehicles.filter(v =>
          v.siege === siege && v.etat === 'OK' &&
          (customVehicleType === 'Tous types' || v.type === customVehicleType)
        ).slice(0, customVehicleCount);

        if (candidates.length === 0) {
          showToast(`⚠ Aucun véhicule disponible à ${siege} pour ce type`);
          return;
        }

        const brokenIds = candidates.map(v => v.id);
        vehicles = applyBreakdowns(vehicles, brokenIds, s0.paramRepairTime);
        vehicles = cascadeRepair(vehicles, brokenIds, s0.paramRepairTime);

        const okAfter = vehicles.filter(v => v.siege === siege && v.etat === 'OK').length;
        charges[siege] = Math.max(charges[siege], chargeFromIPL(75, okAfter));

        events.push(`[14:00] 🚨 Panne ${brokenIds.length} véhicule(s) à ${siege} (${brokenIds.join(', ')})`);

        // Transfert du siège le plus proche
        const closest = getClosestSiege(siege, sieges.map(s => s.ville));
        if (closest && s0.paramTransferCount > 0) {
          const { transfers } = planTransfer(vehicles, closest, siege, s0.paramTransferCount, 0, 15);
          state.setScheduledTransfers(transfers);
          events.push(`[14:00] 🤖 IA — Transfert ${s0.paramTransferCount} véh. ${closest}→${siege}`);
        }

      } else if (customEventType === 'rush') {
        const extraCharge = customVehicleCount * 1.5;
        charges[siege] = (charges[siege] ?? 0) + extraCharge;
        events.push(`[14:00] 📈 Rush de commandes à ${siege} (+${extraCharge.toFixed(1)} charge)`);
        events.push(`[14:00] 🤖 IA — Replanification des tournées non urgentes`);

      } else if (customEventType === 'risque') {
        const candidates = vehicles.filter(v =>
          v.siege === siege && v.etat === 'OK' &&
          (customVehicleType === 'Tous types' || v.type === customVehicleType)
        ).slice(0, customVehicleCount);

        const ids = candidates.map(v => v.id);
        vehicles = vehicles.map(v =>
          ids.includes(v.id) ? { ...v, etat: 'Risque', km_depuis_derniere_maintenance: 4200 } : v
        );
        events.push(`[14:00] 🟠 ${ids.length} véhicule(s) passé(s) en état Risque à ${siege}`);
      }

      const iplPost = calculateAllIPL(sieges, vehicles, charges);
      events.push(`[14:00] 📊 IPL ${siege} : ${iplPost[siege]}%`);

      const dynamics = {
        drift: { [siege]: 0.3 },
        scheduledReplanif: s0.paramReplanifyActive ? {
          1: { from: siege, to: getClosestSiege(siege, sieges.map(s => s.ville)), delta: 1.5 },
          2: { from: siege, to: getClosestSiege(siege, sieges.map(s => s.ville)), delta: 0.5 },
        } : {},
      };

      state.setVehicles(vehicles);
      state.setCharges(charges);
      state.setIPL(iplPost);
      state.pushEvents(events);
      state.pushIPLHistory({ clock: '14:00', ...iplPost });
      state.setIsSimulating(true);
      state.setCurrentStep(0);
      state.setSelectedSiege(siege);

      startSimLoop(siege, dynamics);
    }, 80);
  }

  const selectedIPL = state.ipl[customEventType !== 'predefined' ? customSiege : 'Casablanca'] ?? 0;
  const clock       = stepToClock(state.currentStep);
  const iplCasa     = state.ipl['Casablanca'] ?? 0;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-800">🧠 Simulateur IA</h2>
        <span className="text-xs text-slate-500">Horloge : <strong>{clock}</strong></span>
      </div>

      {/* Toggle mode */}
      <div className="flex rounded-lg overflow-hidden border border-slate-200 text-xs font-semibold">
        <button
          onClick={() => setScenarioMode('predefined')}
          className={`flex-1 py-1.5 transition-colors ${scenarioMode === 'predefined' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
        >Prédéfini</button>
        <button
          onClick={() => setScenarioMode('custom')}
          className={`flex-1 py-1.5 transition-colors ${scenarioMode === 'custom' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
        >Personnalisé</button>
      </div>

      {/* ── Scénario prédéfini ── */}
      {scenarioMode === 'predefined' && (
        <button
          onClick={handleLaunchScenario}
          disabled={state.isSimulating}
          className="w-full bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white font-semibold py-3 px-4 rounded-md shadow"
        >
          🚨 Lancer scénario panne Casa 14h00
        </button>
      )}

      {/* ── Scénario personnalisé ── */}
      {scenarioMode === 'custom' && (
        <div className="space-y-2 p-3 bg-indigo-50 rounded-lg border border-indigo-200">
          <p className="text-xs font-semibold text-indigo-800">Configurer le scénario</p>

          <div>
            <label className="text-[10px] text-slate-500 block mb-0.5">Siège affecté</label>
            <select value={customSiege} onChange={e => setCustomSiege(e.target.value)}
              className="w-full text-xs border border-slate-300 rounded px-2 py-1.5 bg-white">
              {state.sieges.map(s => <option key={s.id} value={s.ville}>{s.ville}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[10px] text-slate-500 block mb-0.5">Type d'événement</label>
            <select value={customEventType} onChange={e => setCustomEventType(e.target.value)}
              className="w-full text-xs border border-slate-300 rounded px-2 py-1.5 bg-white">
              {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[10px] text-slate-500 flex justify-between mb-0.5">
              <span>{customEventType === 'rush' ? 'Intensité (×1.5 charge)' : 'Véhicules affectés'}</span>
              <strong>{customVehicleCount}</strong>
            </label>
            <input type="range" min="1" max="5" step="1" value={customVehicleCount}
              onChange={e => setCustomVehicleCount(Number(e.target.value))}
              className="w-full" />
          </div>

          {customEventType !== 'rush' && (
            <div>
              <label className="text-[10px] text-slate-500 block mb-0.5">Type de véhicule</label>
              <select value={customVehicleType} onChange={e => setCustomVehicleType(e.target.value)}
                className="w-full text-xs border border-slate-300 rounded px-2 py-1.5 bg-white">
                {VEHICLE_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          )}

          <button
            onClick={handleLaunchCustom}
            disabled={state.isSimulating}
            className="w-full text-xs py-2 rounded bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-semibold"
          >
            ▶ Lancer le scénario
          </button>
        </div>
      )}

      {/* Contrôles */}
      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => { stopInterval(); state.setIsSimulating(false); }}
          disabled={!state.isSimulating}
          className="text-xs py-2 rounded bg-slate-200 hover:bg-slate-300 disabled:opacity-50">⏸ Stop</button>
        <button onClick={() => scenarioMode === 'predefined' ? handleLaunchScenario() : handleLaunchCustom()}
          className="text-xs py-2 rounded bg-blue-600 hover:bg-blue-700 text-white">🔄 Re-lancer</button>
        <button onClick={() => { stopInterval(); state.resetSimulation(); }}
          className="text-xs py-2 rounded bg-slate-700 hover:bg-slate-800 text-white">↺ Reset</button>
      </div>

      {/* Paramètres */}
      <div className="space-y-3 pt-2 border-t border-slate-100">
        <div>
          <label className="text-xs text-slate-600 flex justify-between">
            <span>Véhicules à transférer</span><strong>{state.paramTransferCount}</strong>
          </label>
          <input type="range" min="0" max="3" step="1" value={state.paramTransferCount}
            onChange={e => state.setParam('paramTransferCount', Number(e.target.value))} className="w-full" />
        </div>
        <div>
          <label className="text-xs text-slate-600 flex justify-between">
            <span>Temps maintenance (min)</span><strong>{state.paramRepairTime}</strong>
          </label>
          <input type="range" min="30" max="90" step="5" value={state.paramRepairTime}
            onChange={e => state.setParam('paramRepairTime', Number(e.target.value))} className="w-full" />
        </div>
        <label className="text-xs text-slate-600 flex items-center gap-2">
          <input type="checkbox" checked={state.paramReplanifyActive}
            onChange={e => state.setParam('paramReplanifyActive', e.target.checked)} />
          Replanification active
        </label>
      </div>

      {/* IPL affiché du siège en cours */}
      <div className="rounded-md bg-slate-50 p-3 text-center border border-slate-200">
        <div className="text-xs text-slate-500">
          IPL {scenarioMode === 'custom' ? customSiege : 'Casablanca'}
        </div>
        <div className={`text-3xl font-bold ${
          (scenarioMode === 'custom' ? selectedIPL : iplCasa) >= 75 ? 'text-red-600'
          : (scenarioMode === 'custom' ? selectedIPL : iplCasa) >= 40 ? 'text-amber-500'
          : 'text-emerald-600'
        }`}>
          {scenarioMode === 'custom' ? selectedIPL : iplCasa}%
        </div>
        {state.scenarioFinished && (
          <div className="text-xs text-emerald-600 font-semibold mt-1">✅ Objectif &lt;75% atteint</div>
        )}
      </div>

      {/* Actions IA */}
      {state.aiActions.length > 0 && (
        <div className="pt-2 border-t border-slate-100">
          <div className="text-xs font-semibold text-slate-700 mb-2">Actions IA :</div>
          <ul className="text-xs space-y-1">
            {state.aiActions.map((a, i) => (
              <li key={i} className="flex items-start gap-2">
                <span>•</span>
                <span className={!a.active ? 'line-through text-slate-400' : ''}>
                  {a.label} <span className="text-slate-400">({a.eta})</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
