// /frontend/src/components/EventLog.jsx
import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';

export default function EventLog() {
  const events = useStore(s => s.events);
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [events]);

  return (
    <div className="bg-slate-900 rounded-lg shadow-sm overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-700 flex justify-between">
        <h3 className="text-sm font-bold text-slate-100">📋 Journal d'événements</h3>
        <span className="text-xs text-slate-400">{events.length} entrées</span>
      </div>
      <div ref={ref} className="max-h-56 overflow-y-auto p-2 font-mono text-[11px] text-emerald-300 leading-relaxed">
        {events.length === 0 ? (
          <div className="text-slate-500 italic">En attente du lancement du scénario...</div>
        ) : (
          events.map((e, i) => <div key={i}>{e}</div>)
        )}
      </div>
    </div>
  );
}
