// /frontend/src/components/ai/AnomalyAlerts.jsx
// Détection d'anomalies de conduite par Isolation Forest, avec
// explications NLG ("Freinages brusques 6x au-dessus de la moyenne").

import { useState, useEffect } from 'react';
import { aiApi } from '../../api/aiClient';

const SEVERITY = {
  critique: { color: 'bg-red-100 text-red-700 border-red-400',          dot: 'bg-red-500',     emoji: '🔥' },
  'élevé':  { color: 'bg-orange-100 text-orange-700 border-orange-400', dot: 'bg-orange-500',  emoji: '⚠️' },
  'modéré': { color: 'bg-amber-100 text-amber-700 border-amber-400',    dot: 'bg-amber-500',   emoji: '⚡' },
  faible:   { color: 'bg-yellow-50 text-yellow-700 border-yellow-300',  dot: 'bg-yellow-500',  emoji: '·' },
  normal:   { color: 'bg-emerald-50 text-emerald-700 border-emerald-300', dot: 'bg-emerald-500', emoji: '✓' },
};

const DRIVER_BADGE = {
  safe:      'bg-emerald-50 text-emerald-700',
  neutre:    'bg-slate-50 text-slate-600',
  aggressif: 'bg-red-50 text-red-700',
};

export default function AnomalyAlerts() {
  const [scan,      setScan]      = useState(null);
  const [info,      setInfo]      = useState(null);
  const [daysBack,  setDaysBack]  = useState(14);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [expanded,  setExpanded]  = useState(null);
  const [training,  setTraining]  = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [s, i] = await Promise.all([
        aiApi.anomalyScan(daysBack, 30),
        aiApi.anomalyInfo(),
      ]);
      setScan(s);
      setInfo(i);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [daysBack]);

  async function handleRetrain() {
    setTraining(true);
    try {
      await aiApi.anomalyTrain(0.05);
      await load();
    } catch (e) { setError(e.message); }
    finally     { setTraining(false); }
  }

  if (loading && !scan) return <div className="text-center text-slate-400 py-8 text-sm">Analyse IA en cours...</div>;
  if (error)             return <div className="text-red-600 text-xs p-3 bg-red-50 rounded">⚠ {error}</div>;
  if (!scan)             return null;

  // On filtre uniquement les anomalies (sévérité != normal)
  const alerts = scan.results.filter(r => r.severity !== 'normal');

  return (
    <div className="space-y-3">

      {/* Bandeau modèle */}
      {info && (
        <div className="bg-gradient-to-r from-purple-50 to-fuchsia-50 border border-purple-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-bold text-purple-800">🌲 Isolation Forest</p>
            <button
              onClick={handleRetrain}
              disabled={training}
              className="text-[10px] px-2 py-0.5 rounded bg-purple-600 hover:bg-purple-700 text-white font-medium disabled:opacity-50"
            >
              {training ? '⟳' : '↻ Réentraîner'}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
            <Stat label="Échantillons" value={info.n_samples.toLocaleString()} color="text-purple-700"/>
            <Stat label="Anomalies entraîn." value={`${(info.anomaly_rate * 100).toFixed(1)}%`} color="text-fuchsia-700"/>
            <Stat label="Contamination" value={`${(info.contamination * 100).toFixed(0)}%`} color="text-indigo-700"/>
          </div>
          <p className="text-[9px] text-purple-600 mt-1 text-center">
            Non supervisé · Score : [{info.score_range[0].toFixed(3)} … {info.score_range[1].toFixed(3)}]
          </p>
        </div>
      )}

      {/* Sélecteur fenêtre d'analyse */}
      <div className="flex items-center gap-1 text-[10px]">
        <span className="text-slate-500 mr-1">Fenêtre :</span>
        {[7, 14, 30, 90].map(n => (
          <button
            key={n}
            onClick={() => setDaysBack(n)}
            className={`px-2 py-0.5 rounded ${daysBack === n
              ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >{n}j</button>
        ))}
      </div>

      {/* Répartition sévérité */}
      <div className="grid grid-cols-5 gap-1">
        {['critique', 'élevé', 'modéré', 'faible', 'normal'].map(sev => (
          <div key={sev}
            className={`text-[10px] py-1.5 rounded border text-center ${SEVERITY[sev].color}`}>
            <div className="font-bold text-base leading-none">{scan.by_severity[sev] ?? 0}</div>
            <div className="capitalize mt-0.5">{sev}</div>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-slate-500 px-1">
        🌲 <strong>{alerts.length} alertes</strong> sur {scan.total} véhicules — fenêtre {daysBack} jours
      </p>

      {/* Liste des anomalies */}
      <div className="space-y-1.5 max-h-96 overflow-y-auto">
        {alerts.length === 0 ? (
          <p className="text-center text-slate-400 text-xs py-8">
            ✅ Aucune anomalie détectée sur cette fenêtre.
          </p>
        ) : alerts.map(r => {
          const sty   = SEVERITY[r.severity] ?? SEVERITY.normal;
          const open  = expanded === r.vehicle_id;
          const drvCl = DRIVER_BADGE[r.driver_profile] ?? 'bg-slate-100';
          return (
            <div key={r.vehicle_id} className={`border rounded-lg overflow-hidden ${sty.color}`}>
              <button
                onClick={() => setExpanded(open ? null : r.vehicle_id)}
                className="w-full px-3 py-2 flex items-center justify-between hover:bg-white/40 text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base">{sty.emoji}</span>
                  <span className="font-mono font-bold text-xs">{r.vehicle_id}</span>
                  <span className={`text-[9px] px-1 py-0 rounded font-medium ${drvCl}`}>{r.driver_profile}</span>
                  <span className="text-[10px] opacity-70 truncate">{r.vehicle_type}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] opacity-60">{r.date}</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/60">
                    {r.confidence_pct}%
                  </span>
                </div>
              </button>

              {open && (
                <div className="px-3 py-2 border-t border-current/20 bg-white/50 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px]">
                    <span>📍 {r.siege}</span>
                    <span className="font-mono">score : {r.score.toFixed(4)}</span>
                  </div>

                  {r.reasons.length > 0 && (
                    <div>
                      <p className="text-[9px] font-semibold uppercase mb-0.5 opacity-70">Signaux anormaux</p>
                      <ul className="space-y-0.5">
                        {r.reasons.map((s, i) => (
                          <li key={i} className="text-[10px] flex gap-1">
                            <span className="opacity-50">▸</span><span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Mini-tableau features */}
                  <div className="grid grid-cols-4 gap-1 text-[9px] pt-1 border-t border-current/20">
                    <Mini label="Vit. moy" value={`${r.features_evaluated.speed_avg.toFixed(0)} km/h`}/>
                    <Mini label="Vit. max" value={`${r.features_evaluated.speed_max.toFixed(0)} km/h`}/>
                    <Mini label="Freinages" value={r.features_evaluated.hard_brake_n}/>
                    <Mini label="Accélér." value={r.features_evaluated.hard_accel_n}/>
                    <Mini label="Virages" value={r.features_evaluated.sharp_corner_n}/>
                    <Mini label="Sur-régime" value={r.features_evaluated.over_rev_n}/>
                    <Mini label="km/jour" value={r.features_evaluated.km_today.toFixed(0)}/>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div>
      <div className={`text-sm font-bold ${color}`}>{value}</div>
      <div className="text-slate-500">{label}</div>
    </div>
  );
}

function Mini({ label, value }) {
  return (
    <div className="bg-white/60 rounded px-1 py-0.5">
      <div className="opacity-50">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
