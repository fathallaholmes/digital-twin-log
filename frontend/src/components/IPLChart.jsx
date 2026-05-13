// /frontend/src/components/IPLChart.jsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts';
import { useStore } from '../store/useStore';

const COLORS = {
  Tanger:     '#0ea5e9',
  Rabat:      '#8b5cf6',
  Casablanca: '#ef4444',
  Errachidia: '#f59e0b',
  Agadir:     '#10b981',
};

export default function IPLChart() {
  const history = useStore(s => s.iplHistory);
  const selectedSiege = useStore(s => s.selectedSiege);
  const data = history.slice(-12); // dernières 12 valeurs

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-bold text-slate-800">📈 Historique IPL</h3>
        <span className="text-xs text-slate-500">Focus : <strong style={{ color: COLORS[selectedSiege] }}>{selectedSiege}</strong></span>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="clock" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
          <Tooltip contentStyle={{ fontSize: 11 }} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <ReferenceLine y={75} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'Seuil rouge', fontSize: 9, fill: '#ef4444' }} />
          <ReferenceLine y={40} stroke="#f59e0b" strokeDasharray="4 4" />
          {Object.keys(COLORS).map(ville => (
            <Line
              key={ville}
              type="monotone"
              dataKey={ville}
              stroke={COLORS[ville]}
              strokeWidth={ville === selectedSiege ? 3 : 1.2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
