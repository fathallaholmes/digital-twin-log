// /frontend/src/components/CollabIndicator.jsx
// Affiche les utilisateurs en ligne et le statut de connexion au backend.
import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { api }          from '../api/apiClient';

export default function CollabIndicator({ wsRef }) {
  const { user, logout } = useAuthStore();
  const [online,    setOnline]    = useState([user?.username ?? '']);
  const [connected, setConnected] = useState(false);
  const [open,      setOpen]      = useState(false);

  useEffect(() => {
    const ws = wsRef?.current;
    if (!ws) return;

    const onOpen    = ()  => setConnected(true);
    const onClose   = ()  => setConnected(false);
    const onMessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.online) setOnline(msg.online);
        if (msg.type === 'online_users' || msg.type === 'user_joined' || msg.type === 'user_left') {
          setOnline(msg.online ?? []);
        }
      } catch { /* ignore */ }
    };

    ws.addEventListener('open',    onOpen);
    ws.addEventListener('close',   onClose);
    ws.addEventListener('message', onMessage);

    if (ws.readyState === WebSocket.OPEN) setConnected(true);

    return () => {
      ws.removeEventListener('open',    onOpen);
      ws.removeEventListener('close',   onClose);
      ws.removeEventListener('message', onMessage);
    };
  }, [wsRef?.current]);   // eslint-disable-line react-hooks/exhaustive-deps

  const others = online.filter(u => u !== user?.username);

  return (
    <div className="relative flex items-center gap-2">

      {/* Statut connexion */}
      <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-slate-400'}`} title={connected ? 'Backend connecté' : 'Hors ligne'} />

      {/* Bouton utilisateurs en ligne */}
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-xs text-slate-200 hover:text-white">
        <span>👥</span>
        <span className="font-semibold">{online.length}</span>
        <span className="hidden sm:inline opacity-70">en ligne</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-7 bg-white border border-slate-200 rounded-lg shadow-lg z-50 min-w-[180px] overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100">
            <p className="text-[10px] text-slate-500 font-semibold uppercase">Utilisateurs en ligne</p>
          </div>
          {online.map(u => (
            <div key={u} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50">
              <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
              <span className="text-xs text-slate-700 font-medium">
                {u}
                {u === user?.username && <span className="ml-1 text-[10px] text-slate-400">(vous)</span>}
              </span>
            </div>
          ))}
          <div className="border-t border-slate-100 px-3 py-2">
            <p className="text-[10px] text-slate-400">{user?.full_name ?? user?.username}</p>
            <p className="text-[10px] text-slate-400 capitalize">{user?.role}</p>
          </div>
          <button
            onClick={logout}
            className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 border-t border-slate-100">
            Déconnexion
          </button>
        </div>
      )}
    </div>
  );
}
