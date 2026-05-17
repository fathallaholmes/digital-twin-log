// /frontend/src/App.jsx
import { useState }     from 'react';
import MapView          from './components/MapView';
import Dashboard        from './components/Dashboard';
import SimulatorPanel   from './components/SimulatorPanel';
import TransportOrder   from './components/TransportOrder';
import TripHistory      from './components/TripHistory';
import EventLog         from './components/EventLog';
import FleetManager     from './components/FleetManager';
import AuthorizationBar from './components/AuthorizationBar';
import LoginPage        from './components/LoginPage';
import CollabIndicator  from './components/CollabIndicator';
import AIPanel          from './components/ai/AIPanel';
import NLGBanner        from './components/ai/NLGBanner';
import DemoJuryMode     from './components/ai/DemoJuryMode';
import { useStore }     from './store/useStore';
import { useAuthStore } from './store/useAuthStore';
import { useBackendSync } from './hooks/useBackendSync';

function MainApp() {
  const { setShowFleetManager, vehicles, rightTab, setRightTab, transportOrders } = useStore();
  const { user } = useAuthStore();
  const { ws }   = useBackendSync();
  const [demoMode, setDemoMode] = useState(false);

  const enTransit    = vehicles.filter(v => v.en_transit).length;
  const activeOrders = transportOrders.filter(o => o.status === 'active').length;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">

      {/* ── Header ── */}
      <header className="bg-slate-900 border-b border-slate-700 px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-lg font-bold text-white">
              🇲🇦 Digital Twin Intelligent — Parc Automobile Maroc
            </h1>
            <p className="text-xs text-slate-400">
              MSID TA · 5 sièges · {vehicles.length} véhicules
              {enTransit > 0 && <span className="ml-2 text-purple-400 font-semibold">· {enTransit} en transit</span>}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"/>Vert &lt;40%</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block"/>Orange 40-74%</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block"/>Rouge ≥75%</span>
            </div>
            <button
              onClick={() => setShowFleetManager(true)}
              className="text-xs px-3 py-1.5 rounded-md bg-slate-700 hover:bg-slate-600 text-white font-medium"
            >
              🛠 Gérer la flotte
            </button>
            <button
              onClick={() => setDemoMode(true)}
              className="text-xs px-3 py-1.5 rounded-md bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold shadow-md transition-all"
              title="Mode présentation jury"
            >
              🎬 Mode Démo
            </button>
            {/* Indicateur collaboratif */}
            <CollabIndicator wsRef={ws} />
          </div>
        </div>
      </header>

      <NLGBanner />
      <AuthorizationBar />

      {/* ── Layout ── */}
      <main className="p-3 grid grid-cols-12 gap-3" style={{ minHeight: 'calc(100vh - 60px)' }}>

        {/* Carte + Journal + FleetManager */}
        <section className="col-span-12 lg:col-span-6 flex flex-col gap-3">
          <div className="flex-1" style={{ minHeight: 480 }}>
            <MapView />
          </div>
          <EventLog />
          <FleetManager />
        </section>

        {/* Dashboard */}
        <section className="col-span-12 lg:col-span-3">
          <Dashboard />
        </section>

        {/* Panneau droit — 3 onglets */}
        <section className="col-span-12 lg:col-span-3 flex flex-col gap-3">
          <div className="flex rounded-lg overflow-hidden border border-slate-200 bg-white text-[11px] font-semibold">
            <button onClick={() => setRightTab('simulator')}
              className={`flex-1 py-2 transition-colors ${rightTab === 'simulator' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
              🧠 Sim. IA
            </button>
            <button onClick={() => setRightTab('transport')}
              className={`flex-1 py-2 transition-colors relative ${rightTab === 'transport' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
              🚚 Transport
              {activeOrders > 0 && (
                <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-purple-500 text-white text-[8px] flex items-center justify-center">
                  {activeOrders}
                </span>
              )}
            </button>
            <button onClick={() => setRightTab('history')}
              className={`flex-1 py-2 transition-colors ${rightTab === 'history' ? 'bg-emerald-700 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
              📊 Historique
            </button>
            <button onClick={() => setRightTab('ai')}
              className={`flex-1 py-2 transition-colors ${rightTab === 'ai' ? 'bg-purple-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
              🧠 IA
            </button>
          </div>

          {rightTab === 'simulator' && <SimulatorPanel />}
          {rightTab === 'transport' && <TransportOrder />}
          {rightTab === 'history'   && <TripHistory />}
          {rightTab === 'ai'        && <AIPanel />}
        </section>
      </main>

      <footer className="text-center text-[11px] text-slate-400 py-2 border-t border-slate-200 bg-white">
        Digital Twin Maroc · TIYAOUIL Fathallah · MSID TA 2024-2026 · FSR
        {user && <span className="ml-3 text-slate-300">· connecté : <strong>{user.username}</strong></span>}
      </footer>

      {/* Mode Démo Jury (plein écran) */}
      {demoMode && <DemoJuryMode onClose={() => setDemoMode(false)} />}
    </div>
  );
}

export default function App() {
  const { user } = useAuthStore();
  if (!user) return <LoginPage />;
  return <MainApp />;
}
