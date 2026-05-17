// /frontend/src/components/ai/MaintenancePrediction.jsx
// Affiche les prédictions de panne pour la flotte avec niveau de risque,
// pièce suspecte et recommandation IA.

import { useState, useEffect } from 'react';
import { aiApi } from '../../api/aiClient';

const RISK_STYLES = {
  faible:    { badge: 'bg-emerald-100 text-emerald-700 border-emerald-300', dot: 'bg-emerald-500' },
  'modéré':  { badge: 'bg-amber-100  text-amber-700  border-amber-300',    dot: 'bg-amber-500' },
  'élevé':   { badge: 'bg-orange-100 text-orange-700 border-orange-300',   dot: 'bg-orange-500' },
  critique:  { badge: 'bg-red-100    text-red-700    border-red-300',      dot: 'bg-red-500'    },
};

const PIECE_ICONS = {
  plaquettes_frein:  '🛞',
  courroie_distrib:  '⚙️',
  turbo:             '💨',
  amortisseurs:      '🔩',
  embrayage:         '🔄',
  alternateur:       '🔌',
  radiateur:         '🌡',
  pneus:             '🛞',
};

export default function MaintenancePrediction() {
  const [data,       setData]       = useState(null);
  const [info,       setInfo]       = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [minRisk,    setMinRisk]    = useState('modéré');
  const [expanded,   setExpanded]   = useState(null);
  const [retraining, setRetraining] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [preds, modelInfo] = await Promise.all([
        aiApi.predictMaintenanceAll(minRisk),
        aiApi.predictMaintenanceInfo(),
      ]);
      setData(preds);
      setInfo(modelInfo);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [minRisk]);

  async function handleRetrain() {
    setRetraining(true);
    try {
      await aiApi.predictMaintenanceTrain();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setRetraining(false);
    }
  }

  if (loading && !data) return <div className="text-center text-slate-400 py-8 text-sm">Chargement modèle IA...</div>;
  if (error)             return <div className="text-red-600 text-xs p-3 bg-red-50 rounded">⚠ {error}</div>;
  if (!data)             return null;

  return (
    <div className="space-y-3">

      {/* Bandeau métriques modèle */}
      {info && (
        <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-bold text-indigo-800">🤖 Modèle Random Forest</p>
            <button
              onClick={handleRetrain}
              disabled={retraining}
              className="text-[10px] px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50"
            >
              {retraining ? '⟳' : '↻ Réentraîner'}
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center text-[10px]">
            <Stat label="Recall"    value={`${(info.metrics.recall * 100).toFixed(0)}%`} color="text-emerald-700"/>
            <Stat label="Precision" value={`${(info.metrics.precision * 100).toFixed(0)}%`} color="text-blue-700"/>
            <Stat label="ROC-AUC"   value={info.metrics.roc_auc?.toFixed(2) ?? '—'} color="text-purple-700"/>
            <Stat label="F1"        value={info.metrics.f1.toFixed(2)} color="text-indigo-700"/>
          </div>
          <p className="text-[9px] text-indigo-600 mt-1 text-center">
            Horizon : {info.horizon_days}j · Fenêtre : {info.window_days}j · {info.metrics.n_total} échantillons
          </p>
        </div>
      )}

      {/* Répartition par niveau */}
      <div className="grid grid-cols-4 gap-1.5">
        {['critique', 'élevé', 'modéré', 'faible'].map(lvl => (
          <button
            key={lvl}
            onClick={() => setMinRisk(lvl)}
            className={`text-[10px] py-1.5 rounded-md border transition-all ${
              minRisk === lvl ? 'ring-2 ring-offset-1 ring-slate-400' : ''
            } ${RISK_STYLES[lvl].badge}`}
          >
            <div className="font-bold text-base leading-none">{data.by_risk_level[lvl] ?? 0}</div>
            <div className="capitalize mt-0.5">{lvl}</div>
          </button>
        ))}
      </div>

      <p className="text-[10px] text-slate-500 px-1">
        Filtre : risque <strong>≥ {minRisk}</strong> — {data.count} véhicule(s) affiché(s)
      </p>

      {/* Liste des prédictions */}
      <div className="space-y-1.5 max-h-96 overflow-y-auto">
        {data.predictions.length === 0 ? (
          <p className="text-center text-slate-400 text-xs py-6">
            Aucun véhicule à ce niveau de risque.
          </p>
        ) : data.predictions.map(p => {
          const style = RISK_STYLES[p.risk_level] ?? RISK_STYLES.faible;
          const isOpen = expanded === p.vehicle_id;
          return (
            <div key={p.vehicle_id}
              className={`border ${style.badge.replace('bg-', 'border-').split(' ').find(c => c.startsWith('border-'))} bg-white rounded-lg overflow-hidden`}>
              <button
                onClick={() => setExpanded(isOpen ? null : p.vehicle_id)}
                className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-50 transition-colors text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${style.dot}`}/>
                  <span className="font-mono font-bold text-slate-800 text-xs">{p.vehicle_id}</span>
                  <span className="text-[10px] text-slate-500 truncate">{p.vehicle_type}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold border ${style.badge}`}>
                    {(p.probability * 100).toFixed(0)}%
                  </span>
                  <span className="text-base">{PIECE_ICONS[p.piece_at_risk] ?? '🔧'}</span>
                </div>
              </button>

              {isOpen && (
                <div className="px-3 py-2 border-t border-slate-100 bg-slate-50 space-y-1.5">
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <Field label="Siège"        value={p.siege}/>
                    <Field label="Risque"       value={p.risk_level} cls={`capitalize font-bold ${style.dot.replace('bg-', 'text-')}`}/>
                    <Field label="Pièce suspecte" value={p.piece_at_risk}/>
                    <Field label="Horizon"      value={`${p.horizon_days} jours`}/>
                  </div>

                  {p.contributing_factors.length > 0 && (
                    <div>
                      <p className="text-[9px] font-semibold text-slate-500 uppercase mb-0.5">Signaux détectés</p>
                      <ul className="space-y-0.5">
                        {p.contributing_factors.map((f, i) => (
                          <li key={i} className="text-[10px] text-slate-700 flex gap-1">
                            <span className="text-amber-500">▸</span>{f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="bg-blue-50 border border-blue-200 rounded p-1.5">
                    <p className="text-[9px] font-semibold text-blue-700 uppercase">🤖 Recommandation IA</p>
                    <p className="text-[11px] text-blue-900 mt-0.5">{p.recommendation}</p>
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

function Field({ label, value, cls = '' }) {
  return (
    <div>
      <div className="text-slate-400 text-[9px] uppercase">{label}</div>
      <div className={`text-slate-800 ${cls}`}>{value}</div>
    </div>
  );
}
