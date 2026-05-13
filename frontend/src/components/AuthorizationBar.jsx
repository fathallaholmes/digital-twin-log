// /frontend/src/components/AuthorizationBar.jsx
import { useStore } from '../store/useStore';

export default function AuthorizationBar() {
  const transportOrders = useStore(s => s.transportOrders);
  const authorizeUse    = useStore(s => s.authorizeUse);
  const authorizeReturn = useStore(s => s.authorizeReturn);

  const pending = transportOrders.filter(o => o.status === 'awaiting_auth');
  if (pending.length === 0) return null;

  return (
    <div className="bg-amber-50 border-b-2 border-amber-400 px-4 py-2 space-y-2">
      {pending.map(order => (
        <div key={order.id}
          className="flex flex-wrap items-center justify-between gap-2 bg-white border border-amber-300 rounded-lg px-3 py-2 shadow-sm">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-amber-500 text-base">🚦</span>
            <div>
              <span className="font-bold text-slate-800">{order.vehicleId}</span>
              <span className="mx-1 text-slate-400">·</span>
              <span className="text-slate-500 text-xs">{order.vehicleType}</span>
              <span className="mx-1 text-slate-400">·</span>
              <span className="text-xs text-indigo-600">{order.missionType}</span>
            </div>
            <div className="text-xs text-slate-600">
              arrivé à <strong>{order.toSiege}</strong>
              <span className="mx-1 text-slate-400">—</span>
              origine : <span className="text-slate-500">{order.fromSiege}</span>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => authorizeUse(order.id)}
              className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
              ✓ Utilisation sur place
            </button>
            <button
              onClick={() => authorizeReturn(order.id)}
              className="text-xs px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-semibold">
              ↩ Réintégrer → {order.fromSiege}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
