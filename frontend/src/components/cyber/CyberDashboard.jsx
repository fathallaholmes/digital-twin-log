// /frontend/src/components/cyber/CyberDashboard.jsx
// KPIs globaux de la base cyber.db : registre, capteurs, opérations, finances.

import { useState, useEffect } from 'react';
import { cyberApi } from '../../api/cyberClient';

export default function CyberDashboard() {
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const s = await cyberApi.stats();
      setStats(s);
    } catch (e) { setError(e.message); }
    finally     { setLoading(false); }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);    // refresh toutes les 5s
    return () => clearInterval(id);
  }, []);

  if (error) return <div className="text-red-600 text-xs p-3 bg-red-50 rounded">⚠ {error}</div>;
  if (!stats) return <div className="text-center text-slate-400 py-8 text-sm">Chargement...</div>;

  return (
    <div className="space-y-3">

      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-700 uppercase">📊 État de la base cyber.db</h3>
        {loading && <span className="text-[9px] text-slate-400">⟳ refresh</span>}
      </div>

      {/* Registre */}
      <Section title="Référentiels" icon="📋" color="slate">
        <Stat label="Véhicules"  value={stats.registry.vehicles}/>
        <Stat label="Chauffeurs" value={stats.registry.drivers}/>
      </Section>

      {/* Capteurs */}
      <Section title="Capteurs (faits ingestion)" icon="📡" color="blue">
        <Stat label="OBD readings" value={stats.sensors.obd_readings_total.toLocaleString('fr-FR')}/>
        <Stat label="GPS pings"    value={stats.sensors.gps_pings_total.toLocaleString('fr-FR')}/>
        <Stat label="Événements"   value={stats.sensors.events_total.toLocaleString('fr-FR')}/>
      </Section>

      {/* Opérations */}
      <Section title="Opérations" icon="🔧" color="amber">
        <Stat label="Pannes total"   value={stats.operations.breakdowns_total}/>
        <Stat label="↳ déclarées"    value={stats.operations.breakdowns_reported} cls="text-red-600"/>
        <Stat label="↳ en réparation" value={stats.operations.breakdowns_repair} cls="text-orange-600"/>
        <Stat label="Missions"       value={`${stats.operations.missions_completed}/${stats.operations.missions_total}`}/>
        <Stat label="Interventions"  value={stats.operations.maintenance_total}/>
        <Stat label="Incidents"      value={stats.operations.incidents_total}/>
      </Section>

      {/* Finance */}
      <Section title="Finance (30 derniers jours)" icon="💰" color="emerald">
        <Stat label="Carburant"      value={`${stats.finance.fuel_30d_mad.toLocaleString('fr-FR')} MAD`}/>
        <Stat label="↳ volume"       value={`${stats.finance.fuel_30d_l} L`}/>
        <Stat label="Réparations"    value={`${stats.finance.repair_total.toLocaleString('fr-FR')} MAD`}/>
        <Stat label="Maintenance"    value={`${stats.finance.maint_total.toLocaleString('fr-FR')} MAD`}/>
      </Section>
    </div>
  );
}

const COLORS = {
  slate:   'border-slate-200 bg-slate-50',
  blue:    'border-blue-200 bg-blue-50',
  amber:   'border-amber-200 bg-amber-50',
  emerald: 'border-emerald-200 bg-emerald-50',
};

function Section({ title, icon, color, children }) {
  return (
    <div className={`border rounded-lg p-3 ${COLORS[color] ?? COLORS.slate}`}>
      <p className="text-[10px] font-bold text-slate-600 uppercase mb-1.5">
        {icon} {title}
      </p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value, cls = "text-slate-800" }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-slate-500">{label}</span>
      <span className={`font-mono font-semibold ${cls}`}>{value}</span>
    </div>
  );
}
