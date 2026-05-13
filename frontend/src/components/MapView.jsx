// /frontend/src/components/MapView.jsx
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useStore } from '../store/useStore';
import { iplColor } from '../utils/iplCalculator';
import { fetchRoadRoute } from '../utils/routeService';

const MOROCCO_GEOJSON_URL =
  'https://raw.githubusercontent.com/omarouhra/morocco-geojson/main/morocco.geojson';

export default function MapView() {
  const mapRef        = useRef(null);
  const containerRef  = useRef(null);
  const markersRef    = useRef({});
  const proposalRef   = useRef(null);   // ligne proposition IA (orange)
  const activeLines   = useRef({});     // lignes ordres actifs (bleu)
  const proposalKeyRef = useRef(null);  // clé courante pour ignorer les fetch obsolètes

  // Cache des géométries routières déjà récupérées
  const [routeCache, setRouteCache] = useState({});

  const sieges         = useStore(s => s.sieges);
  const vehicles       = useStore(s => s.vehicles);
  const ipl            = useStore(s => s.ipl);
  const setSelectedSiege = useStore(s => s.setSelectedSiege);
  const selectedSiege  = useStore(s => s.selectedSiege);
  const transportOrders = useStore(s => s.transportOrders);
  const pendingOrder   = useStore(s => s.pendingOrder);

  // ── Init carte ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = L.map(containerRef.current, {
      center: [32.5, -6.5], zoom: 6, zoomControl: true,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OSM &copy; CARTO',
      subdomains: 'abcd', maxZoom: 19,
    }).addTo(map);

    fetch(MOROCCO_GEOJSON_URL)
      .then(r => { if (!r.ok) throw new Error('GeoJSON'); return r.json(); })
      .then(data => L.geoJSON(data, {
        style: { color: '#2c3e50', weight: 1.8, fillColor: '#ecf0f1', fillOpacity: 0.25 },
      }).addTo(map))
      .catch(err => console.log('[MapView] GeoJSON non chargé (fallback OK) :', err.message));

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // ── Marqueurs sièges ──────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    sieges.forEach(siege => {
      const ville      = siege.ville;
      const iplVal     = ipl[ville] ?? 0;
      const color      = iplColor(iplVal);
      const flotte     = vehicles.filter(v => v.siege === ville);
      const ok         = flotte.filter(v => v.etat === 'OK' && !v.en_transit).length;
      const transit    = flotte.filter(v => v.en_transit).length;
      const total      = flotte.length;
      const isSelected = selectedSiege === ville;

      const icon = L.divIcon({
        className: 'siege-marker',
        html: `<div style="
          background:${color};width:${isSelected ? 30 : 22}px;height:${isSelected ? 30 : 22}px;
          border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);
          display:flex;align-items:center;justify-content:center;
          color:white;font-weight:bold;font-size:11px;font-family:sans-serif;
        ">${siege.id.slice(1)}</div>`,
        iconSize: [30, 30], iconAnchor: [15, 15],
      });

      const popup = `
        <div style="font-family:sans-serif;min-width:180px">
          <strong style="font-size:14px">${ville}</strong><br/>
          <span style="color:#666;font-size:11px">${siege.role}</span>
          <hr style="margin:6px 0;border:none;border-top:1px solid #eee"/>
          <div>IPL : <strong style="color:${color}">${iplVal}%</strong></div>
          <div>Véhicules OK : ${ok}/${total}${transit ? ` · <span style="color:#7c3aed">${transit} en transit</span>` : ''}</div>
        </div>`;

      const tooltip = `IPL: ${iplVal}% · ${ok}/${total} OK`;

      if (markersRef.current[ville]) {
        markersRef.current[ville].setIcon(icon);
        markersRef.current[ville].setPopupContent(popup);
        markersRef.current[ville].setTooltipContent(tooltip);
      } else {
        const m = L.marker([siege.lat, siege.lon], { icon })
          .addTo(map).bindPopup(popup)
          .bindTooltip(tooltip, { direction: 'top', offset: [0, -12] });
        m.on('click', () => setSelectedSiege(ville));
        markersRef.current[ville] = m;
      }
    });
  }, [sieges, vehicles, ipl, selectedSiege, setSelectedSiege]);

  // ── Pré-fetch des routes pour la proposition et les ordres actifs ─────────
  useEffect(() => {
    const toFetch = [];

    if (pendingOrder) {
      const k = `${pendingOrder.fromSiege}→${pendingOrder.toSiege}`;
      if (!routeCache[k]) toFetch.push({ from: pendingOrder.fromSiege, to: pendingOrder.toSiege });
    }

    transportOrders.filter(o => o.status === 'active').forEach(o => {
      const k = `${o.fromSiege}→${o.toSiege}`;
      if (!routeCache[k]) toFetch.push({ from: o.fromSiege, to: o.toSiege });
    });

    toFetch.forEach(({ from, to }) => {
      const fromSiege = sieges.find(s => s.ville === from);
      const toSiege   = sieges.find(s => s.ville === to);
      if (!fromSiege || !toSiege) return;

      const key = `${from}→${to}`;
      fetchRoadRoute(fromSiege, toSiege).then(route => {
        setRouteCache(prev => ({ ...prev, [key]: route }));
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOrder?.fromSiege, pendingOrder?.toSiege, transportOrders.length, sieges]);

  // ── Ligne proposition IA (orange pointillé) ───────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (proposalRef.current) { proposalRef.current.remove(); proposalRef.current = null; }
    if (!pendingOrder) return;

    const key    = `${pendingOrder.fromSiege}→${pendingOrder.toSiege}`;
    const cached = routeCache[key];
    if (!cached) return; // sera re-déclenché quand routeCache se mettra à jour

    const distInfo = cached.distanceKm ? ` · ${cached.distanceKm} km` : '';
    const durInfo  = cached.durationMin ? ` (${cached.durationMin} min)` : '';

    const line = L.polyline(cached.coords, {
      color: '#f59e0b', weight: 4, dashArray: '12 7', opacity: 0.95,
    }).addTo(map);

    line.bindTooltip(
      `<b>Option ${pendingOrder.rank}/${pendingOrder.totalCandidates}</b><br/>` +
      `${pendingOrder.vehicleId} — ${pendingOrder.vehicleType}<br/>` +
      `${pendingOrder.fromSiege} → ${pendingOrder.toSiege}` +
      `${distInfo}${durInfo}`,
      { direction: 'center', permanent: true, className: 'route-tooltip-proposal' }
    );

    proposalRef.current = line;
  }, [pendingOrder, routeCache, sieges]);

  // ── Lignes ordres actifs (bleu pointillé) ─────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    Object.values(activeLines.current).forEach(l => l.remove());
    activeLines.current = {};

    transportOrders.filter(o => o.status === 'active').forEach(order => {
      const key    = `${order.fromSiege}→${order.toSiege}`;
      const cached = routeCache[key];
      if (!cached) return;

      const distInfo = cached.distanceKm ? ` · ${cached.distanceKm} km` : '';
      const lineColor = order.isReturn ? '#10b981' : '#6366f1';
      const line = L.polyline(cached.coords, {
        color: lineColor, weight: 2.5, dashArray: '6 5', opacity: 0.85,
      }).addTo(map);

      line.bindTooltip(
        `${order.id} · ${order.vehicleId}<br/>` +
        `${order.fromSiege} → ${order.toSiege}${distInfo}<br/>` +
        `Mission : ${order.missionType}`,
        { direction: 'center' }
      );

      activeLines.current[order.id] = line;
    });
  }, [transportOrders, routeCache, sieges]);

  // cleanup
  useEffect(() => () => { proposalRef.current?.remove(); }, []);

  return (
    <div className="h-full w-full rounded-lg overflow-hidden border border-slate-200 shadow-sm">
      <div ref={containerRef} className="h-full w-full" style={{ minHeight: 420 }} />
    </div>
  );
}
