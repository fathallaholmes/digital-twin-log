// /frontend/src/components/ai/RouteOptimizer.jsx
// Optimisation de tournées multi-dépôts via OR-Tools VRP.
// Compare la solution optimale à une stratégie naïve et affiche le gain.

import { useState } from 'react';
import { aiApi } from '../../api/aiClient';

const HOURS = [
  { v: 7,  l: '7h (pointe ↑)' }, { v: 8, l: '8h (pointe ↑)' },
  { v: 9,  l: '9h (calme)' },    { v: 12, l: '12h (calme)' },
  { v: 14, l: '14h (calme)' },   { v: 17, l: '17h (pointe ↓)' },
  { v: 18, l: '18h (pointe ↓)' },
];

const TYPE_COLOR = {
  depot:    'bg-slate-600',
  pickup:   'bg-emerald-500',
  delivery: 'bg-blue-500',
};

export default function RouteOptimizer() {
  const [nMissions, setNMissions] = useState(10);
  const [nVehicles, setNVehicles] = useState(6);
  const [hour,      setHour]      = useState(9);
  const [result,    setResult]    = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [expanded,  setExpanded]  = useState(null);

  async function runDemo() {
    setLoading(true);
    setError(null);
    try {
      const r = await aiApi.optimizeDemo(nMissions, nVehicles, hour);
      setResult(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">

      {/* Bandeau modèle */}
      <div className="bg-gradient-to-r from-cyan-50 to-teal-50 border border-cyan-200 rounded-lg p-3">
        <p className="text-xs font-bold text-cyan-800">🛣 Google OR-Tools VRP</p>
        <p className="text-[10px] text-cyan-700 mt-0.5">
          PATH_CHEAPEST_ARC + GUIDED_LOCAL_SEARCH · Multi-dépôts pickup-and-delivery
        </p>
      </div>

      {/* Paramètres */}
      <div className="bg-white rounded-lg border border-slate-200 p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-slate-600 flex justify-between">
              <span>Missions</span><strong>{nMissions}</strong>
            </label>
            <input type="range" min="3" max="20" step="1" value={nMissions}
              onChange={e => setNMissions(Number(e.target.value))}
              className="w-full accent-cyan-600"/>
          </div>
          <div>
            <label className="text-[10px] text-slate-600 flex justify-between">
              <span>Véhicules dispo</span><strong>{nVehicles}</strong>
            </label>
            <input type="range" min="2" max="12" step="1" value={nVehicles}
              onChange={e => setNVehicles(Number(e.target.value))}
              className="w-full accent-cyan-600"/>
          </div>
        </div>
        <div>
          <label className="text-[10px] text-slate-600 block mb-0.5">Heure de départ</label>
          <select value={hour} onChange={e => setHour(Number(e.target.value))}
            className="w-full text-xs border border-slate-300 rounded px-2 py-1.5 bg-white">
            {HOURS.map(h => <option key={h.v} value={h.v}>{h.l}</option>)}
          </select>
        </div>

        <button onClick={runDemo} disabled={loading}
          className="w-full text-xs py-2 rounded-md bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-300 text-white font-semibold">
          {loading ? '⟳ Optimisation OR-Tools...' : '🚀 Optimiser les tournées'}
        </button>

        {error && (
          <p className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
            ⚠ {error}
          </p>
        )}
      </div>

      {result && (
        <>
          {/* Comparaison KPIs : Naïf vs Optimisé */}
          <div className="bg-white rounded-lg border border-slate-200 p-2.5">
            <p className="text-[10px] font-bold text-slate-700 uppercase mb-2 text-center">
              Comparatif Avant / Après IA
            </p>
            <div className="space-y-1.5">
              <Compare label="Distance"
                       naive={result.baseline_naive.total_distance_km}
                       optim={result.total_distance_km}
                       unit="km" gain={result.gain_vs_naive.distance_pct}/>
              <Compare label="Durée"
                       naive={result.baseline_naive.total_duration_min}
                       optim={result.total_duration_min}
                       unit="min" gain={result.gain_vs_naive.duration_pct}/>
              <Compare label="CO₂"
                       naive={result.baseline_naive.total_co2_kg}
                       optim={result.total_co2_kg}
                       unit="kg" gain={result.gain_vs_naive.co2_pct}/>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-slate-100 text-center text-[10px]">
              <Mini label="Véh. utilisés" value={`${result.n_vehicles_used}/${result.n_vehicles_total}`}/>
              <Mini label="Missions" value={`${result.n_missions - result.unserved_missions.length}/${result.n_missions}`}/>
              <Mini label="Calcul" value={`${result.computation_time_ms} ms`}/>
            </div>
          </div>

          {/* Tournées par véhicule */}
          <div className="space-y-1.5 max-h-96 overflow-y-auto">
            <p className="text-[10px] font-semibold text-slate-600 uppercase">Tournées optimisées</p>
            {result.routes.length === 0 ? (
              <p className="text-center text-slate-400 text-xs py-4">
                Aucun véhicule n'a été utilisé (toutes missions infaisables).
              </p>
            ) : result.routes.map(r => {
              const open = expanded === r.vehicle_id;
              // Compresser les visites consécutives au même siège
              const stops = r.stops.reduce((acc, s) => {
                if (acc.length && acc[acc.length-1].siege === s.siege) {
                  acc[acc.length-1].count = (acc[acc.length-1].count ?? 1) + 1;
                  if (s.type !== 'depot') acc[acc.length-1].activities.push(s);
                } else {
                  acc.push({ ...s, count: 1, activities: s.type !== 'depot' ? [s] : [] });
                }
                return acc;
              }, []);

              return (
                <div key={r.vehicle_id} className="border border-cyan-200 bg-cyan-50/50 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpanded(open ? null : r.vehicle_id)}
                    className="w-full px-3 py-2 flex items-center justify-between hover:bg-cyan-100/50 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">🚚</span>
                      <div>
                        <div className="font-mono font-bold text-xs text-slate-800">{r.vehicle_id}</div>
                        <div className="text-[10px] text-slate-500">{r.vehicle_type} · base {r.depot}</div>
                      </div>
                    </div>
                    <div className="text-right text-[10px] text-slate-600">
                      <div><strong>{r.n_missions}</strong> missions</div>
                      <div>{r.distance_km} km · {r.duration_min} min</div>
                    </div>
                  </button>

                  {open && (
                    <div className="px-3 py-2 border-t border-cyan-200 bg-white space-y-2">
                      {/* Étapes visualisées */}
                      <div>
                        <p className="text-[9px] font-semibold uppercase text-slate-500 mb-1">Itinéraire</p>
                        <div className="flex items-start flex-wrap gap-x-2 gap-y-1.5">
                          {stops.map((s, i) => (
                            <div key={i} className="flex items-center gap-1">
                              <div className="flex flex-col items-center">
                                <span className={`w-2 h-2 rounded-full ${TYPE_COLOR[s.type]}`}/>
                                <span className="text-[10px] font-semibold text-slate-700 whitespace-nowrap mt-0.5">
                                  {s.siege}
                                </span>
                                {s.activities.length > 0 && (
                                  <span className="text-[8px] text-slate-500">
                                    ({s.activities.length} act.)
                                  </span>
                                )}
                              </div>
                              {i < stops.length - 1 && (
                                <span className="text-cyan-400 text-xs">→</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-1 text-[10px] pt-1 border-t border-slate-100">
                        <Mini label="Distance" value={`${r.distance_km} km`}/>
                        <Mini label="Durée"    value={`${r.duration_min} min`}/>
                        <Mini label="CO₂"      value={`${r.co2_kg} kg`}/>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {result.unserved_missions.length > 0 && (
            <div className="text-[10px] text-red-700 bg-red-50 border border-red-200 rounded p-2">
              ⚠ {result.unserved_missions.length} mission(s) non servie(s) : {result.unserved_missions.join(', ')}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Compare({ label, naive, optim, unit, gain }) {
  const pct = Math.max(0, Math.min(100, (optim / naive) * 100));
  return (
    <div>
      <div className="flex justify-between text-[10px] mb-0.5">
        <span className="font-semibold text-slate-700">{label}</span>
        <span className="font-mono">
          <span className="text-red-500 line-through">{naive.toFixed(0)}</span>
          {' → '}
          <span className="text-emerald-600 font-bold">{optim.toFixed(0)} {unit}</span>
          <span className="text-emerald-600 ml-1.5">(-{gain}%)</span>
        </span>
      </div>
      <div className="h-1.5 bg-red-200 rounded overflow-hidden">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }}/>
      </div>
    </div>
  );
}

function Mini({ label, value }) {
  return (
    <div className="bg-slate-50 rounded px-1 py-0.5 text-center">
      <div className="text-slate-400 text-[9px] uppercase">{label}</div>
      <div className="text-slate-800 font-semibold">{value}</div>
    </div>
  );
}
