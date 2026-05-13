// /frontend/src/components/FleetManager.jsx
import { useState } from 'react';
import { useStore } from '../store/useStore';

const VEHICLE_TYPES = ['Cargo 3.5t', 'VLTT', 'Minicar 9p', 'M915 Conteneur'];
const ETATS         = ['OK', 'Risque', 'Panne'];
const EMPTY_ADD     = { type: 'Cargo 3.5t', etat: 'OK', km: 0 };

export default function FleetManager() {
  const {
    sieges, vehicles,
    showFleetManager, setShowFleetManager,
    addVehicle, updateVehicle, removeVehicle,
    kmWarnThreshold, kmCriticalThreshold, setKmThresholds,
  } = useStore();

  const [activeSiege,   setActiveSiege]   = useState(sieges[0]?.ville ?? '');
  const [editingId,     setEditingId]     = useState(null);
  const [editData,      setEditData]      = useState({});
  const [showAddForm,   setShowAddForm]   = useState(false);
  const [addForm,       setAddForm]       = useState({ ...EMPTY_ADD });
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showSettings,  setShowSettings]  = useState(false);
  const [localWarn,     setLocalWarn]     = useState(kmWarnThreshold);
  const [localCrit,     setLocalCrit]     = useState(kmCriticalThreshold);

  if (!showFleetManager) return null;

  const flotte = vehicles.filter(v => v.siege === activeSiege);
  const stats  = { OK: 0, Risque: 0, Panne: 0, transit: 0 };
  flotte.forEach(v => {
    if (v.en_transit) stats.transit++;
    else stats[v.etat] = (stats[v.etat] ?? 0) + 1;
  });

  function kmBarColor(km) {
    if (km >= kmCriticalThreshold) return 'bg-red-500';
    if (km >= kmWarnThreshold)     return 'bg-amber-500';
    return 'bg-emerald-500';
  }

  function handleAdd(e) {
    e.preventDefault();
    addVehicle({ ...addForm, siege: activeSiege });
    setAddForm({ ...EMPTY_ADD });
    setShowAddForm(false);
  }

  function startEdit(v) {
    setEditingId(v.id);
    setEditData({ type: v.type, etat: v.etat, km: v.km_depuis_derniere_maintenance });
  }

  function saveEdit(id) {
    updateVehicle(id, {
      type: editData.type,
      etat: editData.etat,
      km_depuis_derniere_maintenance: Number(editData.km),
    });
    setEditingId(null);
  }

  function handleDelete(id) {
    if (confirmDelete === id) {
      removeVehicle(id);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete(prev => prev === id ? null : prev), 3000);
    }
  }

  function applyThresholds() {
    setKmThresholds(localWarn, localCrit);
    setShowSettings(false);
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800 text-white">
        <div>
          <h2 className="text-sm font-bold">🛠 Gestion de la Flotte</h2>
          <p className="text-[11px] text-slate-400 mt-0.5">{vehicles.length} véhicules · {sieges.length} sièges</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowSettings(v => !v)}
            className={`text-xs px-2 py-1 rounded font-medium ${showSettings ? 'bg-amber-500 text-white' : 'bg-slate-600 hover:bg-slate-500 text-slate-200'}`}
            title="Seuils km">
            ⚙ Seuils km
          </button>
          <button onClick={() => { setShowAddForm(v => !v); setEditingId(null); }}
            className="text-xs px-2.5 py-1 rounded bg-blue-500 hover:bg-blue-600 text-white font-medium">
            {showAddForm ? '✕ Annuler' : '+ Ajouter'}
          </button>
          <button onClick={() => { setShowFleetManager(false); setEditingId(null); setShowAddForm(false); setShowSettings(false); }}
            className="text-slate-400 hover:text-white text-lg leading-none" aria-label="Fermer">✕</button>
        </div>
      </div>

      {/* ── Paramètres seuils km ── */}
      {showSettings && (
        <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 space-y-3">
          <p className="text-xs font-semibold text-amber-800">Seuils kilométriques de risque</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-slate-600 flex justify-between mb-1">
                <span>🟡 Avertissement (orange)</span>
                <strong>{localWarn} km</strong>
              </label>
              <input type="range" min="500" max="4500" step="100" value={localWarn}
                onChange={e => setLocalWarn(Number(e.target.value))}
                className="w-full accent-amber-500" />
            </div>
            <div>
              <label className="text-[10px] text-slate-600 flex justify-between mb-1">
                <span>🔴 Critique (Risque)</span>
                <strong>{localCrit} km</strong>
              </label>
              <input type="range" min="1000" max="5000" step="100" value={localCrit}
                onChange={e => setLocalCrit(Number(e.target.value))}
                className="w-full accent-red-500" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={applyThresholds}
              className="text-xs px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-700 text-white font-semibold">
              ✓ Appliquer et recalculer
            </button>
            <button onClick={() => setShowSettings(false)}
              className="text-xs px-3 py-1.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-700">
              Annuler
            </button>
          </div>
          <p className="text-[10px] text-amber-700">
            Actuels : 🟡 {kmWarnThreshold} km · 🔴 {kmCriticalThreshold} km
          </p>
        </div>
      )}

      {/* ── Formulaire ajout ── */}
      {showAddForm && (
        <form onSubmit={handleAdd} className="px-4 py-3 bg-blue-50 border-b border-blue-100">
          <p className="text-[11px] font-semibold text-blue-700 mb-2">
            Nouveau véhicule → <strong>{activeSiege}</strong>
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <label className="text-[10px] text-slate-500 block mb-0.5">Type</label>
              <select value={addForm.type} onChange={e => setAddForm(f => ({ ...f, type: e.target.value }))}
                className="w-full text-xs border border-slate-300 rounded px-2 py-1.5 bg-white">
                {VEHICLE_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 block mb-0.5">État</label>
              <select value={addForm.etat} onChange={e => setAddForm(f => ({ ...f, etat: e.target.value }))}
                className="w-full text-xs border border-slate-300 rounded px-2 py-1.5 bg-white">
                {ETATS.map(e => <option key={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 block mb-0.5">Km depuis maint.</label>
              <input type="number" min="0" max="9999" step="50" value={addForm.km}
                onChange={e => setAddForm(f => ({ ...f, km: e.target.value }))}
                className="w-full text-xs border border-slate-300 rounded px-2 py-1.5" />
            </div>
            <div className="flex items-end">
              <button type="submit" className="w-full text-xs py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold">
                ✓ Ajouter
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ── Onglets sièges ── */}
      <div className="flex gap-0 border-b border-slate-200 overflow-x-auto bg-white">
        {sieges.map(s => {
          const nb = vehicles.filter(v => v.siege === s.ville).length;
          return (
            <button key={s.id}
              onClick={() => { setActiveSiege(s.ville); setEditingId(null); setShowAddForm(false); }}
              className={`flex-shrink-0 text-xs px-3 py-2 border-b-2 transition-colors ${
                activeSiege === s.ville
                  ? 'border-blue-600 text-blue-700 font-semibold bg-blue-50'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}>
              {s.ville} <span className="opacity-60">({nb})</span>
            </button>
          );
        })}
      </div>

      {/* Stats siège */}
      <div className="grid grid-cols-4 gap-2 px-4 py-2 bg-slate-50 border-b border-slate-100 text-center text-[11px]">
        {[
          { label: 'OK',      val: stats.OK,      cls: 'text-emerald-700' },
          { label: 'Risque',  val: stats.Risque,  cls: 'text-amber-600' },
          { label: 'Panne',   val: stats.Panne,   cls: 'text-red-600' },
          { label: 'Transit', val: stats.transit, cls: 'text-purple-600' },
        ].map(c => (
          <div key={c.label}>
            <div className={`text-base font-bold ${c.cls}`}>{c.val}</div>
            <div className="text-slate-500">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Tableau */}
      <div className="overflow-x-auto max-h-72 overflow-y-auto">
        {flotte.length === 0 ? (
          <div className="text-center text-slate-400 py-8 text-sm">Aucun véhicule à {activeSiege}.</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-slate-50 sticky top-0 border-b border-slate-200">
              <tr className="text-slate-600 text-left">
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">État</th>
                <th className="px-3 py-2">Km</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {flotte.map(v => (
                <tr key={v.id} className={`border-t border-slate-100 ${editingId === v.id ? 'bg-yellow-50' : 'hover:bg-slate-50'}`}>
                  {editingId === v.id ? (
                    <>
                      <td className="px-3 py-1.5 font-mono text-slate-500">{v.id}</td>
                      <td className="px-3 py-1.5">
                        <select value={editData.type} onChange={e => setEditData(d => ({ ...d, type: e.target.value }))}
                          className="border border-slate-300 rounded px-1.5 py-1 text-xs w-full bg-white">
                          {VEHICLE_TYPES.map(t => <option key={t}>{t}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <select value={editData.etat} onChange={e => setEditData(d => ({ ...d, etat: e.target.value }))}
                          className="border border-slate-300 rounded px-1.5 py-1 text-xs w-full bg-white">
                          {ETATS.map(e => <option key={e}>{e}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <input type="number" min="0" max="9999" step="50" value={editData.km}
                          onChange={e => setEditData(d => ({ ...d, km: e.target.value }))}
                          className="border border-slate-300 rounded px-1.5 py-1 text-xs w-20" />
                      </td>
                      <td className="px-3 py-1.5 text-right space-x-1">
                        <button onClick={() => saveEdit(v.id)} className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[11px]">✓</button>
                        <button onClick={() => setEditingId(null)} className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 text-[11px]">✕</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-1.5 font-mono font-semibold text-slate-700">
                        {v.id}
                        {v.en_transit && <span className="ml-1 px-1 py-0.5 rounded text-[9px] bg-purple-100 text-purple-700">transit</span>}
                        {v.onLoan && <span className="ml-1 px-1 py-0.5 rounded text-[9px] bg-orange-100 text-orange-700" title={`Appartient à ${v.loanFrom}`}>prêt·{v.loanFrom}</span>}
                      </td>
                      <td className="px-3 py-1.5 text-slate-600">{v.type}</td>
                      <td className="px-3 py-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          v.etat === 'OK' ? 'bg-emerald-100 text-emerald-700'
                          : v.etat === 'Risque' ? 'bg-amber-100 text-amber-700'
                          : 'bg-red-100 text-red-700'
                        }`}>{v.etat}</span>
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <div className="w-12 h-1.5 bg-slate-100 rounded overflow-hidden">
                            <div className={`h-full rounded ${kmBarColor(v.km_depuis_derniere_maintenance)}`}
                              style={{ width: `${Math.min(100, v.km_depuis_derniere_maintenance / (kmCriticalThreshold / 100))}%` }} />
                          </div>
                          <span className={`text-[10px] font-medium ${
                            v.km_depuis_derniere_maintenance >= kmCriticalThreshold ? 'text-red-600'
                            : v.km_depuis_derniere_maintenance >= kmWarnThreshold ? 'text-amber-600'
                            : 'text-slate-500'
                          }`}>{v.km_depuis_derniere_maintenance}</span>
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-right space-x-1">
                        <button onClick={() => startEdit(v)} disabled={v.en_transit}
                          className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40 text-[11px]">Modifier</button>
                        <button onClick={() => handleDelete(v.id)} disabled={v.en_transit}
                          className={`px-2 py-0.5 rounded text-[11px] disabled:opacity-40 ${
                            confirmDelete === v.id ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600 hover:bg-red-100'
                          }`}>
                          {confirmDelete === v.id ? '⚠ Confirmer' : 'Supprimer'}
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
