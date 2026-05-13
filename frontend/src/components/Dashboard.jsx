// /frontend/src/components/Dashboard.jsx
import { useStore } from '../store/useStore';
import StatsCards from './StatsCards';
import IPLChart from './IPLChart';
import FleetList from './FleetList';

export default function Dashboard() {
  const sieges = useStore(s => s.sieges);
  const ipl = useStore(s => s.ipl);
  const selectedSiege = useStore(s => s.selectedSiege);
  const setSelectedSiege = useStore(s => s.setSelectedSiege);

  const iplVal = ipl[selectedSiege] ?? 0;
  const couleur = iplVal >= 75 ? 'text-red-600' : iplVal >= 40 ? 'text-amber-500' : 'text-emerald-600';

  return (
    <div className="space-y-3">
      {/* Sélecteur sièges */}
      <div className="flex gap-1 flex-wrap">
        {sieges.map(s => (
          <button
            key={s.id}
            onClick={() => setSelectedSiege(s.ville)}
            className={`text-xs px-2.5 py-1 rounded border ${
              selectedSiege === s.ville
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
            }`}
          >{s.ville}</button>
        ))}
      </div>

      {/* IPL grand chiffre */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 flex justify-between items-center shadow-sm">
        <div>
          <div className="text-xs text-slate-500">IPL actuel</div>
          <div className={`text-4xl font-bold ${couleur}`}>{iplVal}%</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500">Siège</div>
          <div className="text-sm font-semibold text-slate-700">{selectedSiege}</div>
        </div>
      </div>

      <StatsCards />
      <IPLChart />
      <FleetList />
    </div>
  );
}
