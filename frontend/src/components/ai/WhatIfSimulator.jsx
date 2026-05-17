// /frontend/src/components/ai/WhatIfSimulator.jsx
// Simulation interactive : sliders pour ajuster la flotte par siège,
// KPIs (délai, CO₂, taux de panne) recalculés en temps réel via surrogate.

import { useState, useEffect, useRef } from 'react';
import { aiApi } from '../../api/aiClient';

const SIEGES = ['Casablanca', 'Rabat', 'Tanger', 'Marrakech', 'Fès'];

export default function WhatIfSimulator() {
  const [baselineConfig, setBaselineConfig] = useState(null);
  const [baselineKpis,   setBaselineKpis]   = useState(null);
  const [config,         setConfig]         = useState({});
  const [kpis,           setKpis]           = useState(null);
  const [demand,         setDemand]         = useState(1.0);
  const [info,           setInfo]           = useState(null);
  const [loading,        setLoading]        = useState(false);
  const debounceRef = useRef(null);

  // ── Chargement initial : baseline ──────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [base, modelInfo] = await Promise.all([
          aiApi.whatifBaseline(15),
          aiApi.whatifInfo(),
        ]);
        setBaselineConfig(base.config);
        setBaselineKpis(base.kpis);
        setConfig(base.config);
        setKpis(base.kpis);
        setInfo(modelInfo);
      } catch (e) { console.error(e); }
    })();
  }, []);

  // ── Réagir aux changements de sliders avec debounce 120ms ──────────────────
  useEffect(() => {
    if (!baselineConfig) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await aiApi.whatifSimulate(config, demand);
        setKpis(res.kpis);
      } catch (e) { console.error(e); }
      finally     { setLoading(false); }
    }, 120);
    return () => clearTimeout(debounceRef.current);
  }, [config, demand, baselineConfig]);

  if (!baselineConfig || !kpis) {
    return <div className="text-center text-slate-400 py-8 text-sm">Chargement surrogate...</div>;
  }

  const totalFleet = Object.values(config).reduce((a, b) => a + b, 0);
  const totalBase  = Object.values(baselineConfig).reduce((a, b) => a + b, 0);

  function resetToBaseline() {
    setConfig(baselineConfig);
    setDemand(1.0);
  }

  function preset(name) {
    if (name === 'casa-hub') {
      setConfig({ Casablanca: 30, Rabat: 12, Tanger: 8,  Marrakech: 10, Fès: 10 });
    } else if (name === 'reduit') {
      setConfig({ Casablanca: 10, Rabat: 8,  Tanger: 7,  Marrakech: 7,  Fès: 6  });
    } else if (name === 'equilibre') {
      setConfig({ Casablanca: 18, Rabat: 16, Tanger: 14, Marrakech: 14, Fès: 13 });
    }
  }

  return (
    <div className="space-y-3">

      {/* Bandeau modèle */}
      {info && (
        <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-bold text-blue-800">🔮 LightGBM Surrogate</p>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-600 text-white font-bold">
              {loading ? '⟳ Calcul...' : '⚡ Temps réel'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
            <Stat label="R² délai"  value={info.metrics.delay_min_avg.r2.toFixed(3)}  color="text-blue-700"/>
            <Stat label="R² CO₂"    value={info.metrics.co2_kg_day.r2.toFixed(3)}     color="text-emerald-700"/>
            <Stat label="R² pannes" value={info.metrics.breakdown_rate_pct.r2.toFixed(3)} color="text-amber-700"/>
          </div>
          <p className="text-[9px] text-blue-600 mt-1 text-center">
            3 régresseurs · {info.n_train} échantillons · inférence ≈ 5 ms
          </p>
        </div>
      )}

      {/* KPIs avec deltas */}
      <div className="grid grid-cols-3 gap-2">
        <KpiCard label="Délai moyen"
                 current={kpis.delay_min_avg}      baseline={baselineKpis.delay_min_avg}
                 unit="min" goodIsLow color="amber"  decimals={1}/>
        <KpiCard label="CO₂ / jour"
                 current={kpis.co2_kg_day}         baseline={baselineKpis.co2_kg_day}
                 unit="kg"  goodIsLow color="green"  decimals={0}/>
        <KpiCard label="Taux panne"
                 current={kpis.breakdown_rate_pct} baseline={baselineKpis.breakdown_rate_pct}
                 unit="%"   goodIsLow color="red"    decimals={2}/>
      </div>

      {/* Sliders par siège */}
      <div className="bg-white rounded-lg border border-slate-200 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-slate-700">Composition par siège</p>
          <span className="text-[10px] text-slate-500">Total : <strong>{totalFleet}</strong> / {totalBase}</span>
        </div>
        {SIEGES.map(s => (
          <SiegeSlider key={s}
            siege={s}
            value={config[s] ?? 0}
            baseline={baselineConfig[s] ?? 0}
            onChange={v => setConfig(c => ({ ...c, [s]: v }))} />
        ))}
      </div>

      {/* Slider demand multiplier */}
      <div className="bg-white rounded-lg border border-slate-200 p-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[11px] font-bold text-slate-700">📈 Niveau d'activité</p>
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
            demand >= 1.3 ? 'bg-red-100 text-red-700' :
            demand >= 1.1 ? 'bg-amber-100 text-amber-700' :
            demand >= 0.9 ? 'bg-slate-100 text-slate-700' :
                            'bg-emerald-100 text-emerald-700'
          }`}>×{demand.toFixed(2)}</span>
        </div>
        <input type="range" min="0.5" max="1.8" step="0.05" value={demand}
          onChange={e => setDemand(Number(e.target.value))}
          className="w-full accent-blue-600"/>
        <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
          <span>Creux ×0.5</span><span>Normal ×1.0</span><span>Pic ×1.8</span>
        </div>
      </div>

      {/* Presets + reset */}
      <div className="grid grid-cols-2 gap-1.5">
        <button onClick={() => preset('casa-hub')}
          className="text-[10px] py-1.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-semibold">
          🏛 Tout Casa-Hub
        </button>
        <button onClick={() => preset('reduit')}
          className="text-[10px] py-1.5 rounded bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 font-semibold">
          📉 Flotte réduite
        </button>
        <button onClick={() => preset('equilibre')}
          className="text-[10px] py-1.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-semibold">
          ⚖ Équilibré
        </button>
        <button onClick={resetToBaseline}
          className="text-[10px] py-1.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold">
          ↺ Reset baseline
        </button>
      </div>
    </div>
  );
}

// ── Card KPI avec delta vs baseline ──────────────────────────────────────────
function KpiCard({ label, current, baseline, unit, goodIsLow, color, decimals = 1 }) {
  const delta = current - baseline;
  const pct   = baseline ? (delta / baseline) * 100 : 0;
  const isImprovement = goodIsLow ? delta < 0 : delta > 0;
  const arrow = delta === 0 ? '–' : delta > 0 ? '▲' : '▼';
  const deltaCls = Math.abs(pct) < 0.5 ? 'text-slate-400'
                  : isImprovement       ? 'text-emerald-600'
                                        : 'text-red-600';
  const ringCls = {
    amber:  'border-amber-300 bg-amber-50',
    green:  'border-emerald-300 bg-emerald-50',
    red:    'border-red-300 bg-red-50',
  }[color];

  return (
    <div className={`rounded-lg border ${ringCls} px-2 py-2 text-center`}>
      <p className="text-[9px] uppercase text-slate-500 font-semibold">{label}</p>
      <p className="text-base font-bold text-slate-800 mt-0.5">
        {current.toFixed(decimals)}
        <span className="text-[9px] text-slate-500 ml-0.5">{unit}</span>
      </p>
      <p className={`text-[10px] ${deltaCls} font-mono`}>
        {arrow} {Math.abs(pct).toFixed(1)}%
      </p>
    </div>
  );
}

// ── Slider individuel par siège ──────────────────────────────────────────────
function SiegeSlider({ siege, value, baseline, onChange }) {
  const delta = value - baseline;
  return (
    <div>
      <div className="flex justify-between items-baseline text-[10px] mb-0.5">
        <span className="font-semibold text-slate-700">{siege}</span>
        <span className="text-slate-500 font-mono">
          {value} véh.
          {delta !== 0 && (
            <span className={delta > 0 ? 'text-emerald-600 ml-1' : 'text-red-600 ml-1'}>
              ({delta > 0 ? '+' : ''}{delta})
            </span>
          )}
        </span>
      </div>
      <input type="range" min="0" max="30" step="1" value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-blue-600 h-1.5"/>
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
