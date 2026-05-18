// /frontend/src/components/cyber/CyberDataEntry.jsx
// Formulaires de saisie pour les opérateurs humains (conducteur + chef de parc).

import { useState, useEffect } from 'react';
import { cyberApi } from '../../api/cyberClient';

const FORMS = [
  { id: 'refuel',      label: 'Plein',          icon: '⛽', role: 'Conducteur'   },
  { id: 'incident',    label: 'Incident',       icon: '⚠',  role: 'Conducteur'   },
  { id: 'odometer',    label: 'Km manuel',      icon: '📍', role: 'Conducteur'   },
  { id: 'breakdown',   label: 'Panne',          icon: '🔧', role: 'Chef de parc' },
  { id: 'maintenance', label: 'Maintenance',    icon: '🛠', role: 'Chef de parc' },
  { id: 'mission',     label: 'Mission',        icon: '🚚', role: 'Chef de parc' },
];

const SIEGES = ['Casablanca', 'Rabat', 'Tanger', 'Marrakech', 'Fès'];
const PIECES = ['turbo', 'plaquettes_frein', 'courroie_distrib', 'amortisseurs',
                'embrayage', 'alternateur', 'radiateur', 'pneus'];

export default function CyberDataEntry() {
  const [active, setActive] = useState('breakdown');
  const [vehicles, setVehicles] = useState([]);
  const [success, setSuccess] = useState(null);
  const [error, setError]     = useState(null);

  useEffect(() => {
    cyberApi.vehicles().then(setVehicles).catch(() => {});
  }, []);

  function notify(detail, isError = false) {
    if (isError) { setError(detail); setSuccess(null); }
    else         { setSuccess(detail); setError(null); }
    setTimeout(() => { setSuccess(null); setError(null); }, 4000);
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Saisies humaines qui alimentent la base cyber, comme dans le monde réel.
      </p>

      {/* Tabs formulaires */}
      <div className="grid grid-cols-3 gap-1">
        {FORMS.map(f => (
          <button key={f.id}
            onClick={() => { setActive(f.id); setSuccess(null); setError(null); }}
            className={`text-[10px] py-1.5 rounded transition-colors ${
              active === f.id ? 'bg-slate-800 text-white font-bold'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}>
            <div>{f.icon} {f.label}</div>
            <div className="text-[8px] opacity-70 mt-0.5">{f.role}</div>
          </button>
        ))}
      </div>

      {/* Notifs */}
      {success && (
        <div className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">
          ✓ {success}
        </div>
      )}
      {error && (
        <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded p-2">
          ⚠ {error}
        </div>
      )}

      {/* Formulaire actif */}
      <div className="bg-white border border-slate-200 rounded-lg p-3">
        {active === 'refuel'      && <RefuelForm      vehicles={vehicles} onSuccess={notify}/>}
        {active === 'incident'    && <IncidentForm    vehicles={vehicles} onSuccess={notify}/>}
        {active === 'odometer'    && <OdometerForm    vehicles={vehicles} onSuccess={notify}/>}
        {active === 'breakdown'   && <BreakdownForm   vehicles={vehicles} onSuccess={notify}/>}
        {active === 'maintenance' && <MaintenanceForm vehicles={vehicles} onSuccess={notify}/>}
        {active === 'mission'     && <MissionForm     vehicles={vehicles} onSuccess={notify}/>}
      </div>
    </div>
  );
}


// ── Refuel ──────────────────────────────────────────────────────────────────
function RefuelForm({ vehicles, onSuccess }) {
  const [d, setD] = useState({
    vehicle_id: '', liters: '', cost_mad: '', km_at_refill: '', station: '',
  });

  async function submit(e) {
    e.preventDefault();
    try {
      const res = await cyberApi.reportRefuel({
        ...d,
        liters:       Number(d.liters),
        cost_mad:     Number(d.cost_mad),
        km_at_refill: Number(d.km_at_refill),
      });
      onSuccess(res.detail);
      setD({ vehicle_id: '', liters: '', cost_mad: '', km_at_refill: '', station: '' });
    } catch (e) { onSuccess(e.message, true); }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <p className="text-[11px] font-bold text-slate-700">⛽ Plein de carburant</p>
      <FieldVehicle  d={d} setD={setD} vehicles={vehicles}/>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Litres"     value={d.liters}       onChange={v => setD({...d, liters: v})}       type="number" step="0.1" required/>
        <Field label="Coût (MAD)" value={d.cost_mad}     onChange={v => setD({...d, cost_mad: v})}     type="number" step="0.01" required/>
      </div>
      <Field label="Km au plein"  value={d.km_at_refill} onChange={v => setD({...d, km_at_refill: v})} type="number" required/>
      <Field label="Station"      value={d.station}      onChange={v => setD({...d, station: v})}      placeholder="Ex : Total Casa-Anfa"/>
      <button type="submit" className="w-full py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold">
        ✓ Enregistrer
      </button>
    </form>
  );
}

// ── Incident ────────────────────────────────────────────────────────────────
function IncidentForm({ vehicles, onSuccess }) {
  const [d, setD] = useState({
    vehicle_id: '', type: 'near_miss', severity: 'minor', description: '',
  });

  async function submit(e) {
    e.preventDefault();
    try {
      const res = await cyberApi.reportIncident(d);
      onSuccess(res.detail);
      setD({ vehicle_id: '', type: 'near_miss', severity: 'minor', description: '' });
    } catch (e) { onSuccess(e.message, true); }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <p className="text-[11px] font-bold text-slate-700">⚠ Rapport d'incident</p>
      <FieldVehicle d={d} setD={setD} vehicles={vehicles}/>
      <div className="grid grid-cols-2 gap-2">
        <Select label="Type" value={d.type} onChange={v => setD({...d, type: v})}
          options={[{v:'accident',l:'Accident'},{v:'near_miss',l:'Évité de peu'},{v:'weather',l:'Météo'},{v:'other',l:'Autre'}]}/>
        <Select label="Gravité" value={d.severity} onChange={v => setD({...d, severity: v})}
          options={[{v:'minor',l:'Mineur'},{v:'moderate',l:'Modéré'},{v:'major',l:'Majeur'}]}/>
      </div>
      <div>
        <label className="text-[10px] text-slate-600 block">Description</label>
        <textarea value={d.description} onChange={e => setD({...d, description: e.target.value})}
          rows={3} required
          className="w-full text-xs border border-slate-300 rounded px-2 py-1.5"/>
      </div>
      <button type="submit" className="w-full py-1.5 rounded bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold">
        ✓ Signaler
      </button>
    </form>
  );
}

// ── Odometer ────────────────────────────────────────────────────────────────
function OdometerForm({ vehicles, onSuccess }) {
  const [d, setD] = useState({ vehicle_id: '', km: '' });

  async function submit(e) {
    e.preventDefault();
    try {
      const res = await cyberApi.reportOdometer({ vehicle_id: d.vehicle_id, km: Number(d.km) });
      onSuccess(res.detail);
      setD({ vehicle_id: '', km: '' });
    } catch (e) { onSuccess(e.message, true); }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <p className="text-[11px] font-bold text-slate-700">📍 Relevé manuel d'odomètre</p>
      <FieldVehicle d={d} setD={setD} vehicles={vehicles}/>
      <Field label="Kilométrage actuel" value={d.km} onChange={v => setD({...d, km: v})} type="number" required/>
      <button type="submit" className="w-full py-1.5 rounded bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold">
        ✓ Enregistrer
      </button>
    </form>
  );
}

// ── Breakdown ───────────────────────────────────────────────────────────────
function BreakdownForm({ vehicles, onSuccess }) {
  const [d, setD] = useState({
    vehicle_id: '', piece: 'turbo', root_cause: '', km_at_break: '', workshop: '', notes: '',
  });

  async function submit(e) {
    e.preventDefault();
    try {
      const res = await cyberApi.declareBreakdown({
        ...d,
        km_at_break: d.km_at_break ? Number(d.km_at_break) : null,
      });
      onSuccess(`${res.detail} (ID ${res.id})`);
      setD({ vehicle_id: '', piece: 'turbo', root_cause: '', km_at_break: '', workshop: '', notes: '' });
    } catch (e) { onSuccess(e.message, true); }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <p className="text-[11px] font-bold text-red-700">🔧 Déclaration de panne</p>
      <FieldVehicle d={d} setD={setD} vehicles={vehicles}/>
      <div className="grid grid-cols-2 gap-2">
        <Select label="Pièce" value={d.piece} onChange={v => setD({...d, piece: v})}
          options={PIECES.map(p => ({v: p, l: p}))}/>
        <Field label="Km à la panne" value={d.km_at_break} onChange={v => setD({...d, km_at_break: v})} type="number"/>
      </div>
      <Field label="Cause probable" value={d.root_cause} onChange={v => setD({...d, root_cause: v})}/>
      <Field label="Atelier"         value={d.workshop}   onChange={v => setD({...d, workshop: v})}/>
      <div>
        <label className="text-[10px] text-slate-600 block">Notes</label>
        <textarea value={d.notes} onChange={e => setD({...d, notes: e.target.value})}
          rows={2}
          className="w-full text-xs border border-slate-300 rounded px-2 py-1.5"/>
      </div>
      <button type="submit" className="w-full py-1.5 rounded bg-red-600 hover:bg-red-700 text-white text-xs font-bold">
        🚨 Déclarer la panne
      </button>
    </form>
  );
}

// ── Maintenance ─────────────────────────────────────────────────────────────
function MaintenanceForm({ vehicles, onSuccess }) {
  const [d, setD] = useState({
    vehicle_id: '', type: 'preventive', pieces: '', cost_mad: '', km_at_intervention: '', workshop: '', notes: '',
  });

  async function submit(e) {
    e.preventDefault();
    try {
      const res = await cyberApi.declareMaintenance({
        vehicle_id: d.vehicle_id,
        type: d.type,
        pieces_replaced: d.pieces ? d.pieces.split(',').map(s => s.trim()).filter(Boolean) : null,
        cost_mad: Number(d.cost_mad) || 0,
        km_at_intervention: d.km_at_intervention ? Number(d.km_at_intervention) : null,
        workshop: d.workshop,
        notes: d.notes,
      });
      onSuccess(`${res.detail} (ID ${res.id})`);
      setD({ vehicle_id: '', type: 'preventive', pieces: '', cost_mad: '', km_at_intervention: '', workshop: '', notes: '' });
    } catch (e) { onSuccess(e.message, true); }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <p className="text-[11px] font-bold text-amber-700">🛠 Intervention maintenance</p>
      <FieldVehicle d={d} setD={setD} vehicles={vehicles}/>
      <div className="grid grid-cols-2 gap-2">
        <Select label="Type" value={d.type} onChange={v => setD({...d, type: v})}
          options={[{v:'preventive',l:'Préventive'},{v:'corrective',l:'Corrective'},{v:'inspection',l:'Inspection'}]}/>
        <Field label="Coût (MAD)" value={d.cost_mad} onChange={v => setD({...d, cost_mad: v})} type="number"/>
      </div>
      <Field label="Pièces remplacées (séparées par virgule)"
             value={d.pieces} onChange={v => setD({...d, pieces: v})}
             placeholder="huile, filtre_huile, plaquettes"/>
      <Field label="Km" value={d.km_at_intervention} onChange={v => setD({...d, km_at_intervention: v})} type="number"/>
      <Field label="Atelier" value={d.workshop} onChange={v => setD({...d, workshop: v})}/>
      <button type="submit" className="w-full py-1.5 rounded bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold">
        ✓ Enregistrer intervention
      </button>
    </form>
  );
}

// ── Mission ─────────────────────────────────────────────────────────────────
function MissionForm({ vehicles, onSuccess }) {
  const [d, setD] = useState({
    vehicle_id: '', pickup_siege: 'Casablanca', delivery_siege: 'Tanger',
    mission_type: 'Transport marchandise', demand_kg: 1000, priority: 1,
  });

  async function submit(e) {
    e.preventDefault();
    try {
      const res = await cyberApi.createMission({
        ...d,
        demand_kg: Number(d.demand_kg),
        priority: Number(d.priority),
      });
      onSuccess(`${res.detail} (ID ${res.id})`);
    } catch (e) { onSuccess(e.message, true); }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <p className="text-[11px] font-bold text-blue-700">🚚 Nouvelle mission</p>
      <FieldVehicle d={d} setD={setD} vehicles={vehicles}/>
      <div className="grid grid-cols-2 gap-2">
        <Select label="Départ"  value={d.pickup_siege}   onChange={v => setD({...d, pickup_siege: v})}
          options={SIEGES.map(s => ({v: s, l: s}))}/>
        <Select label="Arrivée" value={d.delivery_siege} onChange={v => setD({...d, delivery_siege: v})}
          options={SIEGES.map(s => ({v: s, l: s}))}/>
      </div>
      <Select label="Type" value={d.mission_type} onChange={v => setD({...d, mission_type: v})}
        options={['Transport personnel','Transport marchandise','Transport conteneur',
                  'Mission administrative','Évacuation médicale'].map(t => ({v: t, l: t}))}/>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Charge (kg)" value={d.demand_kg} onChange={v => setD({...d, demand_kg: v})} type="number"/>
        <Select label="Priorité" value={d.priority} onChange={v => setD({...d, priority: v})}
          options={[{v:1,l:'1 (normal)'},{v:2,l:'2 (élevé)'},{v:5,l:'5 (urgent)'}]}/>
      </div>
      <button type="submit" className="w-full py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold">
        ✓ Planifier la mission
      </button>
    </form>
  );
}


// ── Helpers ─────────────────────────────────────────────────────────────────
function FieldVehicle({ d, setD, vehicles }) {
  return (
    <div>
      <label className="text-[10px] text-slate-600 block">Véhicule</label>
      <select value={d.vehicle_id} onChange={e => setD({...d, vehicle_id: e.target.value})} required
        className="w-full text-xs border border-slate-300 rounded px-2 py-1.5 bg-white">
        <option value="">— Sélectionner —</option>
        {vehicles.map(v => (
          <option key={v.id} value={v.id}>{v.id} · {v.type} · {v.depot_siege}</option>
        ))}
      </select>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", step, required, placeholder }) {
  return (
    <div>
      <label className="text-[10px] text-slate-600 block">{label}</label>
      <input type={type} step={step} required={required} placeholder={placeholder}
        value={value} onChange={e => onChange(e.target.value)}
        className="w-full text-xs border border-slate-300 rounded px-2 py-1.5"/>
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <div>
      <label className="text-[10px] text-slate-600 block">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full text-xs border border-slate-300 rounded px-2 py-1.5 bg-white">
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
}
