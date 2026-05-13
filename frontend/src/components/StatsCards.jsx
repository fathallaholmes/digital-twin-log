// /frontend/src/components/StatsCards.jsx
import { useStore } from '../store/useStore';

export default function StatsCards() {
  const vehicles = useStore(s => s.vehicles);
  const selectedSiege = useStore(s => s.selectedSiege);

  const flotte = vehicles.filter(v => v.siege === selectedSiege);
  const ok = flotte.filter(v => v.etat === 'OK').length;
  const risque = flotte.filter(v => v.etat === 'Risque').length;
  const panne = flotte.filter(v => v.etat === 'Panne').length;

  const cards = [
    { label: 'Opérationnels', value: ok, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    { label: 'Risque',        value: risque, color: 'bg-amber-50 text-amber-700 border-amber-200' },
    { label: 'En panne',      value: panne, color: 'bg-red-50 text-red-700 border-red-200' },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {cards.map(c => (
        <div key={c.label} className={`border rounded-md p-3 text-center ${c.color}`}>
          <div className="text-2xl font-bold">{c.value}</div>
          <div className="text-xs">{c.label}</div>
        </div>
      ))}
    </div>
  );
}
