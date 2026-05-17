// /frontend/src/components/ai/Recommendations.jsx
// Liste des recommandations IA actives avec feedback (Accepter / Ignorer / Rejeter)
// → alimente le bandit ε-greedy qui apprend des décisions.

import { useState, useEffect } from 'react';
import { aiApi } from '../../api/aiClient';

const SEVERITY_STYLE = {
  critique: 'bg-red-50 border-red-300 text-red-800',
  'élevé':  'bg-orange-50 border-orange-300 text-orange-800',
  'modéré': 'bg-amber-50 border-amber-300 text-amber-800',
  faible:   'bg-yellow-50 border-yellow-300 text-yellow-800',
};

const CATEGORY_ICON = {
  maintenance: '🔧',
  comportement: '🚦',
  anomalie:    '⚠️',
};

export default function Recommendations() {
  const [recs,     setRecs]     = useState([]);
  const [stats,    setStats]    = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [dismissed, setDismissed] = useState(new Set());
  const [acted,     setActed]     = useState({});  // recId → feedback

  async function load() {
    setLoading(true);
    try {
      const [list, banditStats] = await Promise.all([
        aiApi.recommendList(14, 15),
        aiApi.recommendBanditStats(),
      ]);
      setRecs(list.recommendations ?? []);
      setStats(banditStats);
      setError(null);
    } catch (e) { setError(e.message); }
    finally     { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleFeedback(recId, feedback) {
    try {
      await aiApi.recommendFeedback(recId, feedback);
      setActed(a => ({ ...a, [recId]: feedback }));
      if (feedback !== 'accepted') {
        setDismissed(d => new Set([...d, recId]));
      }
      // Refresh stats sans refresh complet
      const s = await aiApi.recommendBanditStats();
      setStats(s);
    } catch (e) { setError(e.message); }
  }

  async function handleReset() {
    if (!confirm("Réinitialiser la mémoire d'apprentissage du bandit ?")) return;
    await aiApi.recommendBanditReset();
    setActed({}); setDismissed(new Set());
    await load();
  }

  if (loading && recs.length === 0)
    return <div className="text-center text-slate-400 py-8 text-sm">Génération recommandations...</div>;
  if (error)
    return <div className="text-red-600 text-xs p-3 bg-red-50 rounded">⚠ {error}</div>;

  const visible = recs.filter(r => !dismissed.has(r.id));
  const totalFeedback = stats ? Object.values(stats.templates ?? {})
                              .reduce((s, t) => s + (t.n_pulls ?? 0), 0) : 0;

  return (
    <div className="space-y-3">

      {/* Bandeau bandit */}
      <div className="bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-200 rounded-lg p-3">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs font-bold text-violet-800">🎯 Bandit ε-greedy</p>
          <button onClick={handleReset}
            className="text-[10px] px-2 py-0.5 rounded bg-violet-100 hover:bg-violet-200 text-violet-700 font-medium">
            ⟲ Reset
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
          <Stat label="ε exploration" value={`${((stats?.epsilon ?? 0.1) * 100).toFixed(0)}%`} color="text-violet-700"/>
          <Stat label="Feedbacks reçus" value={totalFeedback} color="text-purple-700"/>
          <Stat label="Templates" value={Object.keys(stats?.templates ?? {}).length} color="text-fuchsia-700"/>
        </div>
      </div>

      {/* Cards recommandations */}
      <div className="space-y-2 max-h-[420px] overflow-y-auto">
        {visible.length === 0 ? (
          <p className="text-center text-slate-400 text-xs py-8">
            ✅ Aucune recommandation active.
          </p>
        ) : visible.map(r => {
          const sty = SEVERITY_STYLE[r.severity] ?? SEVERITY_STYLE.faible;
          const wasActed = acted[r.id];
          return (
            <div key={r.id} className={`border rounded-lg overflow-hidden ${sty}`}>
              <div className="px-3 py-2">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-lg">{CATEGORY_ICON[r.category] ?? '💡'}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold leading-tight">{r.title}</p>
                      <p className="text-[9px] uppercase opacity-60 font-semibold mt-0.5">
                        {r.category} · {r.vehicle_id}
                      </p>
                    </div>
                  </div>
                  {r.bandit_score !== undefined && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/60 font-mono flex-shrink-0">
                      score {(r.bandit_score * 100).toFixed(0)}
                    </span>
                  )}
                </div>

                <p className="text-[11px] opacity-90 mt-1">{r.detail}</p>

                <div className="bg-white/50 rounded p-1.5 mt-1.5 border border-current/20">
                  <p className="text-[9px] uppercase opacity-70 font-semibold">Action proposée</p>
                  <p className="text-[11px] mt-0.5">{r.recommended_action}</p>
                </div>

                {/* Boutons feedback */}
                {wasActed ? (
                  <div className="mt-2 text-[10px] text-center font-medium opacity-70 italic">
                    ✓ Feedback enregistré : <strong>{wasActed}</strong>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-1 mt-2">
                    <button onClick={() => handleFeedback(r.id, 'accepted')}
                      className="text-[10px] py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
                      ✓ Accepter
                    </button>
                    <button onClick={() => handleFeedback(r.id, 'ignored')}
                      className="text-[10px] py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold">
                      Ignorer
                    </button>
                    <button onClick={() => handleFeedback(r.id, 'dismissed')}
                      className="text-[10px] py-1 rounded bg-red-100 hover:bg-red-200 text-red-700 font-semibold">
                      ✕ Rejeter
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Stats bandit détaillées */}
      {stats?.templates && Object.keys(stats.templates).length > 0 && (
        <details className="bg-slate-50 border border-slate-200 rounded p-2">
          <summary className="text-[10px] font-semibold text-slate-700 cursor-pointer">
            🧠 Ce que le bandit a appris ({Object.keys(stats.templates).length} templates)
          </summary>
          <div className="mt-2 space-y-1">
            {Object.entries(stats.templates).map(([tid, t]) => (
              <div key={tid} className="flex items-center justify-between text-[10px]">
                <span className="font-mono truncate flex-1">{tid}</span>
                <span className="text-slate-500 mx-2">
                  ✓{t.n_accepted ?? 0} ✕{t.n_dismissed ?? 0} ·{t.n_ignored ?? 0}
                </span>
                <div className="w-16 h-1.5 bg-slate-200 rounded overflow-hidden">
                  <div className="h-full bg-violet-500"
                       style={{ width: `${(t.score ?? 0.5) * 100}%` }}/>
                </div>
                <span className="ml-1 font-mono text-violet-700 w-8 text-right">
                  {((t.score ?? 0.5) * 100).toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
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
