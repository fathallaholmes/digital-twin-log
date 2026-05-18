// /frontend/src/components/cyber/CyberSimulator.jsx
// Pilotage du simulateur de capteurs (push continu OBD/GPS/events vers cyber.db).

import { useState, useEffect } from 'react';
import { cyberApi } from '../../api/cyberClient';

export default function CyberSimulator() {
  const [status,     setStatus]     = useState(null);
  const [interval_s, setIntervalS]  = useState(5);
  const [seeding,    setSeeding]    = useState(false);
  const [error,      setError]      = useState(null);

  async function refresh() {
    try { setStatus(await cyberApi.simulatorStatus()); }
    catch (e) { setError(e.message); }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, []);

  async function start() {
    try { await cyberApi.simulatorStart(interval_s); refresh(); }
    catch (e) { setError(e.message); }
  }
  async function stop()  {
    try { await cyberApi.simulatorStop(); refresh(); }
    catch (e) { setError(e.message); }
  }
  async function seed() {
    if (!confirm("Régénérer toute la base cyber.db (90 jours) ? Cela peut prendre 60-90s.")) return;
    setSeeding(true);
    try {
      const r = await cyberApi.seed(90, true);
      alert(`Base hydratée :\n` + Object.entries(r.counts).map(([k,v]) => `  ${k}: ${v}`).join('\n'));
    } catch (e) { setError(e.message); }
    finally     { setSeeding(false); }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Pilotez le push automatique des capteurs IoT vers la base cyber.db.
      </p>

      {error && (
        <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded p-2">⚠ {error}</div>
      )}

      {/* Statut */}
      <div className={`border-2 rounded-lg p-4 ${
        status?.running ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-slate-50'
      }`}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold">
            {status?.running
              ? <span className="text-emerald-700">🟢 Capteurs ACTIFS</span>
              : <span className="text-slate-600">⚪ Capteurs au repos</span>}
          </p>
          {status?.running && (
            <span className="text-xs text-emerald-700 animate-pulse">⟳ push toutes les {status.interval_s}s</span>
          )}
        </div>

        {status?.running && (
          <div className="grid grid-cols-2 gap-2 text-center text-[11px]">
            <div className="bg-white rounded p-2">
              <div className="text-2xl font-bold text-emerald-700">{status.ticks_emitted}</div>
              <div className="text-slate-500">Ticks émis</div>
            </div>
            <div className="bg-white rounded p-2">
              <div className="text-2xl font-bold text-orange-600">{status.events_emitted}</div>
              <div className="text-slate-500">Événements</div>
            </div>
          </div>
        )}

        {status?.started_at && (
          <p className="text-[10px] text-slate-400 text-center mt-2">
            Démarré à {new Date(status.started_at).toLocaleTimeString('fr-FR')}
          </p>
        )}
      </div>

      {/* Contrôles */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2">
        <div>
          <label className="text-[10px] text-slate-600 flex justify-between">
            <span>Intervalle de push (secondes)</span>
            <strong>{interval_s}s</strong>
          </label>
          <input type="range" min="1" max="30" step="1" value={interval_s}
            onChange={e => setIntervalS(Number(e.target.value))}
            disabled={status?.running}
            className="w-full accent-emerald-600"/>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button onClick={start} disabled={status?.running}
            className="py-2 rounded bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-bold">
            ▶ Démarrer
          </button>
          <button onClick={stop} disabled={!status?.running}
            className="py-2 rounded bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white text-xs font-bold">
            ⏹ Arrêter
          </button>
        </div>
      </div>

      {/* Seed */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
        <p className="text-xs font-bold text-amber-800">⚠ Zone admin</p>
        <p className="text-[10px] text-amber-700">
          Régénère 90 jours d'historique réaliste (≈ 500 000 lignes en 60-90s).
          Toutes les données existantes sont effacées.
        </p>
        <button onClick={seed} disabled={seeding}
          className="w-full py-1.5 rounded bg-amber-600 hover:bg-amber-700 disabled:bg-slate-400 text-white text-xs font-bold">
          {seeding ? '⟳ Hydratation en cours...' : '🌱 Régénérer la base (90 jours)'}
        </button>
      </div>
    </div>
  );
}
