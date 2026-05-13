// /frontend/src/components/TripHistory.jsx
// Historique complet des trajets et demandes de transport.
import { useState } from 'react';
import { useStore } from '../store/useStore';

const MISSION_COLORS = {
  'Transport personnel':          'bg-blue-100 text-blue-700',
  'Transport marchandise':        'bg-amber-100 text-amber-700',
  'Transport conteneur':          'bg-indigo-100 text-indigo-700',
  'Transport équipement':         'bg-purple-100 text-purple-700',
  'Mission administrative':       'bg-slate-100 text-slate-700',
  'Évacuation médicale':          'bg-red-100 text-red-700',
  'Autre':                        'bg-gray-100 text-gray-600',
  'Non spécifiée':                'bg-gray-50 text-gray-400',
};

export default function TripHistory() {
  const vehicleHistory  = useStore(s => s.vehicleHistory);
  const transportOrders = useStore(s => s.transportOrders);

  const [filter, setFilter] = useState('all'); // 'all' | siege name

  const sieges = useStore(s => s.sieges).map(s => s.ville);

  const filtered = vehicleHistory.filter(h =>
    filter === 'all' || h.fromSiege === filter || h.toSiege === filter
  );

  const stats = {
    total:     vehicleHistory.length,
    completed: vehicleHistory.filter(h => !h.cancelled).length,
    cancelled: vehicleHistory.filter(h => h.cancelled).length,
    active:    transportOrders.filter(o => o.status === 'active').length,
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 space-y-4">
      <h2 className="text-base font-bold text-slate-800">📊 Historique des trajets</h2>

      {/* Stats rapides */}
      <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
        {[
          { label: 'Total',     val: stats.total,     cls: 'text-slate-700' },
          { label: 'Complétés', val: stats.completed, cls: 'text-emerald-600' },
          { label: 'En route',  val: stats.active,    cls: 'text-blue-600' },
          { label: 'Annulés',   val: stats.cancelled, cls: 'text-red-500' },
        ].map(c => (
          <div key={c.label} className="bg-slate-50 rounded-md py-2 border border-slate-100">
            <div className={`text-lg font-bold ${c.cls}`}>{c.val}</div>
            <div className="text-slate-500">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Filtre par siège */}
      <div>
        <label className="text-[10px] text-slate-500 block mb-1">Filtrer par siège</label>
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setFilter('all')}
            className={`text-[11px] px-2 py-0.5 rounded ${filter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >Tous</button>
          {sieges.map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`text-[11px] px-2 py-0.5 rounded ${filter === s ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >{s}</button>
          ))}
        </div>
      </div>

      {/* Tableau historique */}
      <div className="overflow-x-auto">
        {filtered.length === 0 ? (
          <p className="text-center text-slate-400 text-xs py-6">
            Aucun trajet enregistré{filter !== 'all' ? ` pour ${filter}` : ''}.
          </p>
        ) : (
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-slate-600">
                <th className="px-2 py-1.5">Ordre</th>
                <th className="px-2 py-1.5">Véhicule</th>
                <th className="px-2 py-1.5">Mission</th>
                <th className="px-2 py-1.5">Trajet</th>
                <th className="px-2 py-1.5">ETA</th>
                <th className="px-2 py-1.5">Demandé</th>
                <th className="px-2 py-1.5">Arrivée</th>
              </tr>
            </thead>
            <tbody>
              {[...filtered].reverse().map(h => (
                <tr key={h.id} className={`border-t border-slate-100 hover:bg-slate-50 ${h.cancelled ? 'opacity-50' : ''}`}>
                  <td className="px-2 py-1.5 font-mono text-slate-500">{h.orderId}</td>
                  <td className="px-2 py-1.5">
                    <div className="font-semibold text-slate-800">{h.vehicleId}</div>
                    <div className="text-slate-400">{h.vehicleType}</div>
                  </td>
                  <td className="px-2 py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${MISSION_COLORS[h.missionType] ?? 'bg-gray-100 text-gray-600'}`}>
                      {h.missionType}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <span className="text-slate-600">{h.fromSiege}</span>
                    <span className="mx-1 text-slate-400">→</span>
                    <span className="text-slate-800 font-medium">{h.toSiege}</span>
                  </td>
                  <td className="px-2 py-1.5 text-slate-600">{h.etaLabel}</td>
                  <td className="px-2 py-1.5 text-slate-400">{h.requestedAt ?? '—'}</td>
                  <td className="px-2 py-1.5">
                    {h.cancelled
                      ? <span className="text-red-500">❌ Annulé</span>
                      : <span className="text-emerald-600">{h.completedAt}</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
