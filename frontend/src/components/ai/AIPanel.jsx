// /frontend/src/components/ai/AIPanel.jsx
// Conteneur du nouvel onglet "IA Avancée" du panneau de droite.
// Hébergera au fil de l'implémentation : maintenance prédictive, anomalies,
// what-if, optimisation, mode démo jury.

import { useState } from 'react';
import MaintenancePrediction from './MaintenancePrediction';
import AnomalyAlerts         from './AnomalyAlerts';
import WhatIfSimulator       from './WhatIfSimulator';

const SECTIONS = [
  { id: 'maintenance', label: 'Maintenance', icon: '🔧', enabled: true },
  { id: 'anomalies',   label: 'Anomalies',   icon: '⚠️', enabled: true },
  { id: 'whatif',      label: 'What-If',     icon: '🔮', enabled: true },
  { id: 'optimize',    label: 'Optimisation', icon: '🛣', enabled: false },
];

export default function AIPanel() {
  const [section, setSection] = useState('maintenance');

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-800">🧠 IA Avancée</h2>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-semibold">PFE</span>
      </div>

      {/* Sous-navigation */}
      <div className="flex gap-1 border-b border-slate-200 -mx-3 px-3 pb-1.5">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => s.enabled && setSection(s.id)}
            disabled={!s.enabled}
            className={`text-[10px] px-2 py-1 rounded-t transition-colors flex items-center gap-1 ${
              section === s.id
                ? 'bg-indigo-600 text-white font-semibold'
                : s.enabled
                  ? 'text-slate-600 hover:bg-slate-100'
                  : 'text-slate-300 cursor-not-allowed'
            }`}
            title={s.enabled ? '' : 'Bientôt disponible'}
          >
            <span>{s.icon}</span>{s.label}
          </button>
        ))}
      </div>

      <div className="pt-1">
        {section === 'maintenance' && <MaintenancePrediction />}
        {section === 'anomalies'   && <AnomalyAlerts />}
        {section === 'whatif'      && <WhatIfSimulator />}
        {section === 'optimize' && (
          <p className="text-center text-slate-400 text-xs py-8">
            Module en cours d'implémentation...
          </p>
        )}
      </div>
    </div>
  );
}
