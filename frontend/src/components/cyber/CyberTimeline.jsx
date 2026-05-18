// /frontend/src/components/cyber/CyberTimeline.jsx
// Visualiseur de la timeline d'un véhicule + dernières lectures capteurs.

import { useState, useEffect } from 'react';
import { cyberApi } from '../../api/cyberClient';

const KIND_STYLE = {
  breakdown:   { color: 'bg-red-100 text-red-700 border-red-300',         icon: '🔧' },
  maintenance: { color: 'bg-amber-100 text-amber-700 border-amber-300',   icon: '🛠' },
  mission:     { color: 'bg-blue-100 text-blue-700 border-blue-300',      icon: '🚚' },
  incident:    { color: 'bg-orange-100 text-orange-700 border-orange-300',icon: '⚠' },
  refuel:      { color: 'bg-emerald-100 text-emerald-700 border-emerald-300', icon: '⛽' },
};

export default function CyberTimeline() {
  const [vehicles,    setVehicles]    = useState([]);
  const [selectedId,  setSelectedId]  = useState('');
  const [vehicle,     setVehicle]     = useState(null);
  const [timeline,    setTimeline]    = useState([]);
  const [obd,         setObd]         = useState([]);
  const [events,      setEvents]      = useState([]);
  const [daysBack,    setDaysBack]    = useState(30);
  const [loading,     setLoading]     = useState(false);
  const [tab,         setTab]         = useState('timeline');

  useEffect(() => {
    cyberApi.vehicles().then(v => {
      setVehicles(v);
      if (v.length > 0 && !selectedId) setSelectedId(v[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    Promise.all([
      cyberApi.vehicle(selectedId),
      cyberApi.vehicleTimeline(selectedId, daysBack),
      cyberApi.vehicleObd(selectedId, 30),
      cyberApi.vehicleEvents(selectedId, 30),
    ]).then(([v, tl, o, e]) => {
      setVehicle(v); setTimeline(tl.events ?? []);
      setObd(o); setEvents(e);
    }).catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedId, daysBack]);

  return (
    <div className="space-y-3">

      {/* Sélecteur véhicule */}
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="text-[10px] text-slate-600 block">Véhicule</label>
          <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
            className="w-full text-xs border border-slate-300 rounded px-2 py-1.5 bg-white">
            {vehicles.map(v => (
              <option key={v.id} value={v.id}>{v.id} · {v.type} · {v.depot_siege}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-slate-600 block">Fenêtre</label>
          <select value={daysBack} onChange={e => setDaysBack(Number(e.target.value))}
            className="text-xs border border-slate-300 rounded px-2 py-1.5 bg-white">
            <option value={7}>7 j</option>
            <option value={30}>30 j</option>
            <option value={90}>90 j</option>
          </select>
        </div>
      </div>

      {/* Header véhicule */}
      {vehicle && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-sm font-bold text-slate-800">
                {vehicle.id} <span className="text-slate-400 text-xs">· {vehicle.plate}</span>
              </p>
              <p className="text-[11px] text-slate-500">
                {vehicle.type} · {vehicle.depot_siege} · {vehicle.year ?? ''}
              </p>
            </div>
            <div className="text-right text-[10px]">
              <p>Odomètre : <strong>{vehicle.odometer_km.toLocaleString('fr-FR')} km</strong></p>
              <p className={vehicle.km_since_maintenance > 4000 ? 'text-red-600 font-bold' : 'text-slate-500'}>
                Depuis maint : {Math.round(vehicle.km_since_maintenance)} km
              </p>
            </div>
          </div>
          <div className="grid grid-cols-5 gap-1 mt-2 text-center text-[9px]">
            <Mini label="OBD"      val={vehicle.stats.obd_readings.toLocaleString('fr-FR')}/>
            <Mini label="GPS"      val={vehicle.stats.gps_pings.toLocaleString('fr-FR')}/>
            <Mini label="Events"   val={vehicle.stats.events.toLocaleString('fr-FR')}/>
            <Mini label="Pannes"   val={vehicle.stats.breakdowns}/>
            <Mini label="Missions" val={vehicle.stats.missions}/>
          </div>
        </div>
      )}

      {/* Sous-tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {[['timeline','Timeline'],['obd','OBD'],['events','Events']].map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`text-[11px] px-3 py-1 ${tab === id ? 'border-b-2 border-blue-600 text-blue-700 font-semibold' : 'text-slate-500 hover:text-slate-700'}`}>
            {l}
          </button>
        ))}
      </div>

      {loading && <p className="text-center text-slate-400 text-xs py-2">⟳ Chargement...</p>}

      {/* Tab Timeline */}
      {tab === 'timeline' && (
        <div className="space-y-1.5 max-h-96 overflow-y-auto">
          {timeline.length === 0 ? (
            <p className="text-center text-slate-400 text-xs py-4">Aucun événement sur cette période.</p>
          ) : timeline.map((e, i) => {
            const sty = KIND_STYLE[e.kind] ?? { color: 'bg-slate-100', icon: '·' };
            return (
              <div key={i} className={`border rounded px-2 py-1.5 ${sty.color}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span>{sty.icon}</span>
                    <span className="text-xs font-semibold truncate">{e.title}</span>
                  </div>
                  <span className="text-[9px] opacity-60 flex-shrink-0">
                    {new Date(e.ts).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </div>
                {(e.status || e.cost_mad || e.workshop || e.description) && (
                  <div className="text-[10px] mt-0.5 opacity-80 truncate">
                    {e.status && <span className="mr-2">statut : <strong>{e.status}</strong></span>}
                    {e.cost_mad > 0 && <span className="mr-2">coût : <strong>{e.cost_mad} MAD</strong></span>}
                    {e.workshop && <span className="mr-2">@{e.workshop}</span>}
                    {e.description && <span className="italic">{e.description}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tab OBD */}
      {tab === 'obd' && (
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-[10px]">
            <thead className="bg-slate-50 sticky top-0 border-b border-slate-200">
              <tr className="text-left text-slate-600">
                <th className="px-2 py-1">Date</th>
                <th className="px-2 py-1 text-right">RPM</th>
                <th className="px-2 py-1 text-right">T° °C</th>
                <th className="px-2 py-1 text-right">Charge %</th>
                <th className="px-2 py-1 text-right">Carbur. %</th>
                <th className="px-2 py-1 text-right">Odomètre</th>
              </tr>
            </thead>
            <tbody>
              {obd.map((r, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-2 py-0.5 text-slate-500">
                    {new Date(r.ts).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="px-2 py-0.5 text-right font-mono">{r.rpm}</td>
                  <td className={`px-2 py-0.5 text-right font-mono ${r.engine_temp_c > 105 ? 'text-red-600 font-bold' : ''}`}>
                    {r.engine_temp_c.toFixed(1)}
                  </td>
                  <td className="px-2 py-0.5 text-right font-mono">{r.engine_load_pct?.toFixed(1)}</td>
                  <td className="px-2 py-0.5 text-right font-mono">{r.fuel_level_pct?.toFixed(0) ?? '—'}</td>
                  <td className="px-2 py-0.5 text-right font-mono">{r.odometer_km?.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab Events */}
      {tab === 'events' && (
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {events.length === 0 ? (
            <p className="text-center text-slate-400 text-xs py-4">Aucun événement télémétrique.</p>
          ) : events.map((e, i) => (
            <div key={i} className={`border rounded px-2 py-1 text-[10px] ${
              e.severity === 'critical' ? 'border-red-300 bg-red-50' :
              e.severity === 'warning'  ? 'border-amber-300 bg-amber-50' :
                                          'border-slate-200 bg-slate-50'
            }`}>
              <div className="flex justify-between items-center">
                <span className="font-bold">{e.type}</span>
                <span className="opacity-60">{new Date(e.ts).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>
              </div>
              <div className="text-[9px] opacity-80">
                {e.speed_kmh ? `vitesse ${e.speed_kmh} km/h` : ''}
                {e.accel_mps2 != null ? ` · accel ${e.accel_mps2.toFixed(1)} m/s²` : ''}
                {e.lateral_g != null ? ` · latéral ${e.lateral_g.toFixed(2)}g` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Mini({ label, val }) {
  return (
    <div className="bg-white rounded px-1 py-1 border border-slate-200">
      <div className="text-slate-400">{label}</div>
      <div className="font-mono font-semibold text-slate-800">{val}</div>
    </div>
  );
}
