// /frontend/src/components/cyber/CyberConsole.jsx
// Console plein écran qui regroupe tous les sous-composants Cyber Layer.

import { useState } from 'react';
import CyberDashboard from './CyberDashboard';
import CyberDataEntry from './CyberDataEntry';
import CyberTimeline  from './CyberTimeline';
import CyberSimulator from './CyberSimulator';

const TABS = [
  { id: 'dashboard', label: 'Dashboard',  icon: '📊' },
  { id: 'entry',     label: 'Saisies',    icon: '✍' },
  { id: 'timeline',  label: 'Timeline',   icon: '🕐' },
  { id: 'sim',       label: 'Capteurs',   icon: '🛰' },
];

export default function CyberConsole({ onClose }) {
  const [tab, setTab] = useState('dashboard');

  return (
    <div className="fixed inset-0 z-[8000] bg-slate-900/80 flex items-center justify-center p-4 overflow-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-blue-900 text-white px-5 py-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold">🛰 Cyber Console — Couche d'acquisition de données</h2>
            <p className="text-[11px] text-slate-300">
              Persiste tous les flux : capteurs IoT + saisies humaines → base cyber.db
            </p>
          </div>
          <button onClick={onClose}
            className="text-slate-300 hover:text-white text-xl leading-none" aria-label="Fermer">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 flex-shrink-0">
          {TABS.map(t => (
            <button key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 text-xs py-2.5 transition-colors flex items-center justify-center gap-1.5 ${
                tab === t.id
                  ? 'bg-white border-b-2 border-blue-600 text-blue-700 font-bold'
                  : 'text-slate-500 hover:bg-white/50'
              }`}>
              <span>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>

        {/* Contenu scrollable */}
        <div className="overflow-y-auto p-4 flex-1">
          {tab === 'dashboard' && <CyberDashboard />}
          {tab === 'entry'     && <CyberDataEntry />}
          {tab === 'timeline'  && <CyberTimeline />}
          {tab === 'sim'       && <CyberSimulator />}
        </div>
      </div>
    </div>
  );
}
