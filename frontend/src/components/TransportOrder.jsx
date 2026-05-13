// /frontend/src/components/TransportOrder.jsx
import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { findBestCandidates, arrivalDelayMs } from '../utils/dispatchAI';

const VEHICLE_TYPES = ['Tous types', 'Cargo 3.5t', 'VLTT', 'Minicar 9p', 'M915 Conteneur'];
const MISSION_TYPES = [
  'Transport personnel',
  'Transport marchandise',
  'Transport conteneur',
  'Transport équipement',
  'Mission administrative',
  'Évacuation médicale',
  'Autre',
];

const STATUS_STYLES = {
  active:        'bg-blue-50 border-blue-200 text-blue-800',
  awaiting_auth: 'bg-amber-50 border-amber-300 text-amber-800',
  completed:     'bg-emerald-50 border-emerald-200 text-emerald-800',
  cancelled:     'bg-slate-50 border-slate-200 text-slate-500',
};
const STATUS_LABELS = {
  active:        '🚚 En route',
  awaiting_auth: '🚦 Autorisation requise',
  completed:     '✅ Arrivé',
  cancelled:     '❌ Annulé',
};

export default function TransportOrder() {
  const {
    sieges, vehicles,
    transportOrders, pendingOrder,
    dispatchCandidates, dispatchIndex,
    setDispatch, setDispatchIndex, clearDispatchSession,
    confirmOrder, completeOrder, cancelOrder,
  } = useStore();

  const [toSiege,      setToSiege]      = useState(sieges[0]?.ville ?? '');
  const [vehicleType,  setVehicleType]  = useState('Tous types');
  const [missionType,  setMissionType]  = useState(MISSION_TYPES[0]);
  const [noCandidate,  setNoCandidate]  = useState(false);

  // Auto-arrivée simulée
  useEffect(() => {
    const active = transportOrders.filter(o => o.status === 'active');
    const timers = active.map(order => {
      const elapsed   = Date.now() - (order.startedAt ?? Date.now());
      const remaining = arrivalDelayMs(order.driveTime) - elapsed;
      return setTimeout(() => completeOrder(order.id), Math.max(0, remaining));
    });
    return () => timers.forEach(clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transportOrders.length]);

  function handleDispatch() {
    setNoCandidate(false);
    const candidates = findBestCandidates(vehicles, toSiege, vehicleType, []);
    if (candidates.length === 0) { setNoCandidate(true); return; }
    setDispatch(candidates, toSiege);
  }

  function handleNext() {
    if (dispatchIndex + 1 < dispatchCandidates.length) setDispatchIndex(dispatchIndex + 1);
    else setNoCandidate(true);
  }

  function handlePrev() {
    if (dispatchIndex > 0) setDispatchIndex(dispatchIndex - 1);
  }

  function handleConfirm() {
    confirmOrder(missionType);
  }

  function handleReset() { clearDispatchSession(); setNoCandidate(false); }

  const hasPrev = dispatchIndex > 0;
  const hasNext = dispatchIndex < dispatchCandidates.length - 1;
  const activeOrders    = transportOrders.filter(o => o.status === 'active');
  const completedOrders = transportOrders.filter(o => o.status !== 'active' && o.status !== 'awaiting_auth');

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 space-y-4">
      <h2 className="text-base font-bold text-slate-800">🚚 Ordres de Transport</h2>

      {/* ── Formulaire demande ── */}
      <div className="space-y-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
        <p className="text-xs font-semibold text-slate-600">Nouvelle demande de prêt</p>

        <div>
          <label className="text-[10px] text-slate-500 block mb-0.5">Siège demandeur</label>
          <select value={toSiege} onChange={e => { setToSiege(e.target.value); handleReset(); }}
            className="w-full text-xs border border-slate-300 rounded px-2 py-1.5 bg-white">
            {sieges.map(s => <option key={s.id} value={s.ville}>{s.ville}</option>)}
          </select>
        </div>

        <div>
          <label className="text-[10px] text-slate-500 block mb-0.5">Type de véhicule</label>
          <select value={vehicleType} onChange={e => { setVehicleType(e.target.value); handleReset(); }}
            className="w-full text-xs border border-slate-300 rounded px-2 py-1.5 bg-white">
            {VEHICLE_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>

        <div>
          <label className="text-[10px] text-slate-500 block mb-0.5">Objet de la mission</label>
          <select value={missionType} onChange={e => setMissionType(e.target.value)}
            className="w-full text-xs border border-slate-300 rounded px-2 py-1.5 bg-white">
            {MISSION_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>

        <button onClick={handleDispatch} disabled={!!pendingOrder}
          className="w-full text-xs py-2 rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-semibold">
          🤖 Demander à l'IA
        </button>

        {noCandidate && (
          <p className="text-[11px] text-red-600 text-center font-medium">
            {dispatchCandidates.length === 0 ? 'Aucun véhicule disponible.' : 'Plus aucune option.'}
          </p>
        )}
      </div>

      {/* ── Proposition IA ── */}
      {pendingOrder && (
        <div className="border-2 border-amber-400 rounded-lg p-3 space-y-2 bg-amber-50">
          <div className="flex justify-between items-center">
            <p className="text-xs font-bold text-amber-800">
              Option {pendingOrder.rank} / {pendingOrder.totalCandidates}
            </p>
            <button onClick={handleReset} className="text-[10px] text-slate-400 hover:text-slate-600">✕ Annuler</button>
          </div>

          <div className="bg-white rounded-md p-2.5 border border-amber-200 space-y-1">
            <div className="flex justify-between items-center">
              <span className="font-mono font-bold text-slate-800 text-sm">{pendingOrder.vehicleId}</span>
              <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{pendingOrder.vehicleType}</span>
            </div>
            <div className="text-sm font-medium text-slate-700">
              <span className="text-slate-500">{pendingOrder.fromSiege}</span>
              <span className="mx-2 text-amber-500 text-base">→</span>
              <span className="text-slate-800">{pendingOrder.toSiege}</span>
            </div>
            <div className="flex gap-4 text-[11px] text-slate-500 pt-0.5">
              <span>⏱ <strong>{pendingOrder.etaLabel}</strong></span>
              <span>📍 {pendingOrder.kmVehicule} km</span>
            </div>
            <div className="text-[10px] text-indigo-700 font-medium pt-0.5">
              Mission : {missionType}
            </div>
            <p className="text-[10px] text-amber-700 italic">Route routière affichée sur la carte</p>
          </div>

          {/* Nav prev / confirm / next */}
          <div className="grid grid-cols-3 gap-1.5">
            <button onClick={handlePrev} disabled={!hasPrev}
              className="text-xs py-1.5 rounded bg-slate-200 hover:bg-slate-300 disabled:opacity-30 text-slate-700 font-semibold">
              ← Préc.
            </button>
            <button onClick={handleConfirm}
              className="text-xs py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
              ✓ Confirmer
            </button>
            <button onClick={handleNext} disabled={!hasNext}
              className="text-xs py-1.5 rounded bg-slate-200 hover:bg-slate-300 disabled:opacity-30 text-slate-700 font-semibold">
              Suiv. →
            </button>
          </div>

          {/* Pagination dots */}
          {dispatchCandidates.length > 1 && (
            <div className="flex gap-1 justify-center">
              {dispatchCandidates.map((_, i) => (
                <button key={i} onClick={() => setDispatchIndex(i)}
                  className={`w-2 h-2 rounded-full transition-colors ${i === dispatchIndex ? 'bg-amber-500' : 'bg-slate-300 hover:bg-slate-400'}`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Ordres en cours ── */}
      {activeOrders.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-700 mb-1.5">En route ({activeOrders.length})</p>
          <div className="space-y-1.5">
            {activeOrders.map(o => (
              <ActiveOrderCard key={o.id} order={o} onCancel={() => cancelOrder(o.id)} />
            ))}
          </div>
        </div>
      )}

      {/* ── Historique récent ── */}
      {completedOrders.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 mb-1">Récents</p>
          <div className="space-y-1">
            {[...completedOrders].reverse().slice(0, 5).map(o => (
              <div key={o.id}
                className={`text-[11px] border rounded px-2 py-1.5 flex justify-between items-center ${STATUS_STYLES[o.status]}`}>
                <div>
                  <strong>{o.id}</strong> · {o.vehicleId}
                  <span className="mx-1">·</span>{o.fromSiege}→{o.toSiege}
                  {o.missionType && <span className="ml-1 opacity-70">({o.missionType})</span>}
                </div>
                <span className="font-medium shrink-0 ml-1">{STATUS_LABELS[o.status]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {transportOrders.length === 0 && !pendingOrder && (
        <p className="text-center text-slate-400 text-xs py-2">Aucun ordre créé.</p>
      )}
    </div>
  );
}

function ActiveOrderCard({ order, onCancel }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const total   = arrivalDelayMs(order.driveTime);
    const elapsed = Date.now() - (order.startedAt ?? Date.now());
    setProgress(Math.min(100, (elapsed / total) * 100));
    const interval = setInterval(() =>
      setProgress(p => Math.min(100, p + (100 / (total / 200)))), 200
    );
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);

  return (
    <div className="border border-blue-200 bg-blue-50 rounded-md p-2.5 space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-xs font-bold text-blue-800">{order.id}</span>
        <button onClick={onCancel} className="text-[10px] text-slate-400 hover:text-red-500">Annuler</button>
      </div>
      <div className="text-[11px] text-slate-700">
        <strong>{order.vehicleId}</strong> ({order.vehicleType})
        <span className="mx-1 text-blue-400">·</span>
        {order.fromSiege} <span className="text-blue-500">→</span> {order.toSiege}
        <span className="ml-1 text-slate-500">· {order.etaLabel}</span>
      </div>
      {order.missionType && (
        <div className="text-[10px] text-indigo-600">{order.missionType}</div>
      )}
      <div className="w-full h-1.5 bg-blue-200 rounded overflow-hidden">
        <div className="h-full bg-blue-600 rounded transition-all" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
