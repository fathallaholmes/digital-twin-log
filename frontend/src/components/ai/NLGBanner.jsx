// /frontend/src/components/ai/NLGBanner.jsx
// Bandeau "narration IA" : phrases courtes générées par le NLG narrator,
// défilement automatique des top alertes (maintenance + anomalies + recos).

import { useState, useEffect, useRef } from 'react';
import { aiApi } from '../../api/aiClient';

const SEVERITY_BG = {
  critique: 'bg-red-600',
  'élevé':  'bg-orange-500',
  'modéré': 'bg-amber-500',
  faible:   'bg-yellow-400',
};

const KIND_LABEL = {
  maintenance:    'Maintenance',
  anomaly:        'Anomalie',
  recommendation: 'Action recommandée',
};

export default function NLGBanner() {
  const [items,     setItems]     = useState([]);
  const [idx,       setIdx]       = useState(0);
  const [error,     setError]     = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const fetchInterval = useRef(null);
  const rotateInterval = useRef(null);

  // ── Fetch initial + refresh toutes les 60s ────────────────────────────────
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await aiApi.nlgBanner(5);
        if (!alive) return;
        setItems(res.items ?? []);
        setError(false);
      } catch (e) {
        if (alive) setError(true);
      }
    }
    load();
    fetchInterval.current = setInterval(load, 60000);
    return () => { alive = false; clearInterval(fetchInterval.current); };
  }, []);

  // ── Rotation automatique toutes les 6s ────────────────────────────────────
  useEffect(() => {
    if (items.length <= 1) return;
    rotateInterval.current = setInterval(
      () => setIdx(i => (i + 1) % items.length), 6000);
    return () => clearInterval(rotateInterval.current);
  }, [items.length]);

  if (error || items.length === 0) return null;
  if (collapsed) {
    return (
      <div className="bg-slate-900 text-slate-400 px-3 py-1 text-[10px] flex items-center justify-between">
        <span>🧠 {items.length} alertes IA actives</span>
        <button onClick={() => setCollapsed(false)} className="hover:text-white">▼ Afficher</button>
      </div>
    );
  }

  const it = items[idx];
  const bg = SEVERITY_BG[it.severity] ?? 'bg-slate-600';

  return (
    <div className={`${bg} text-white px-4 py-1.5 flex items-center justify-between gap-3 transition-colors`}>
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-white/20 flex-shrink-0">
          {KIND_LABEL[it.kind] ?? it.kind}
        </span>
        <span className="text-xs font-medium truncate">{it.message}</span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Pagination dots */}
        {items.length > 1 && (
          <div className="flex gap-1">
            {items.map((_, i) => (
              <button key={i}
                onClick={() => setIdx(i)}
                className={`w-1.5 h-1.5 rounded-full transition-all ${
                  i === idx ? 'bg-white w-3' : 'bg-white/40 hover:bg-white/60'
                }`}/>
            ))}
          </div>
        )}
        <button onClick={() => setCollapsed(true)}
          className="text-[10px] hover:bg-white/20 px-1.5 py-0.5 rounded" title="Masquer">
          ✕
        </button>
      </div>
    </div>
  );
}
