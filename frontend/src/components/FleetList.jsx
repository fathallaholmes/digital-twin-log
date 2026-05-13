// /frontend/src/components/FleetList.jsx
import { useStore } from '../store/useStore';

const ETAT_BADGE = {
  OK:     'bg-emerald-100 text-emerald-700',
  Risque: 'bg-amber-100 text-amber-700',
  Panne:  'bg-red-100 text-red-700',
};

export default function FleetList() {
  const vehicles = useStore(s => s.vehicles);
  const selectedSiege = useStore(s => s.selectedSiege);
  const setVehicles = useStore(s => s.setVehicles);

  const flotte = vehicles.filter(v => v.siege === selectedSiege);

  function triggerMaintenance(id) {
    const next = vehicles.map(v =>
      v.id === id ? { ...v, km_depuis_derniere_maintenance: 0, etat: 'OK' } : v
    );
    setVehicles(next);
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-100 flex justify-between items-center">
        <h3 className="text-sm font-bold text-slate-800">🚛 Flotte — {selectedSiege}</h3>
        <span className="text-xs text-slate-500">{flotte.length} véhicules</span>
      </div>
      <div className="max-h-72 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 sticky top-0">
            <tr className="text-slate-600">
              <th className="text-left px-2 py-1.5">ID</th>
              <th className="text-left px-2 py-1.5">Type</th>
              <th className="text-left px-2 py-1.5">État</th>
              <th className="text-left px-2 py-1.5">Km</th>
              <th className="text-right px-2 py-1.5">Action</th>
            </tr>
          </thead>
          <tbody>
            {flotte.map(v => (
              <tr key={v.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-2 py-1.5 font-mono">{v.id}</td>
                <td className="px-2 py-1.5">{v.type}</td>
                <td className="px-2 py-1.5">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${ETAT_BADGE[v.etat]}`}>{v.etat}</span>
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1">
                    <div className="w-12 h-1.5 bg-slate-100 rounded">
                      <div
                        className={`h-1.5 rounded ${v.km_depuis_derniere_maintenance > 4000 ? 'bg-red-500' : v.km_depuis_derniere_maintenance > 2500 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.min(100, v.km_depuis_derniere_maintenance / 50)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-slate-500">{v.km_depuis_derniere_maintenance}</span>
                  </div>
                </td>
                <td className="px-2 py-1.5 text-right">
                  <button
                    onClick={() => triggerMaintenance(v.id)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100"
                  >🔧 Maint.</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
