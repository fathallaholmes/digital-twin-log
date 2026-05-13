// /frontend/src/utils/routeService.js
// Routage routier via OSRM (Open Source Routing Machine) — serveur public, sans clé API.
// Fallback silencieux vers ligne droite si le serveur est indisponible.

const OSRM = 'https://router.project-osrm.org/route/v1/driving';

// Cache module-level pour éviter les requêtes répétées
const _cache = new Map();

/**
 * Retourne les coordonnées [lat, lon][] de la route routière entre deux points GPS.
 * @param {{ lat, lon, ville }} from
 * @param {{ lat, lon, ville }} to
 * @returns {Promise<{ coords: [number,number][], distanceKm: number|null, durationMin: number|null }>}
 */
export async function fetchRoadRoute(from, to) {
  if (!from || !to || from.ville === to.ville) {
    return { coords: [], distanceKm: 0, durationMin: 0 };
  }

  const key = `${from.ville}→${to.ville}`;
  if (_cache.has(key)) return _cache.get(key);

  try {
    const url =
      `${OSRM}/${from.lon},${from.lat};${to.lon},${to.lat}` +
      `?overview=full&geometries=geojson`;

    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const route = data.routes?.[0];
    if (!route) throw new Error('No route');

    const result = {
      // OSRM retourne [lon, lat] → on inverse pour Leaflet [lat, lon]
      coords:      route.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
      distanceKm:  Math.round(route.distance / 100) / 10,   // mètres → km (1 décimale)
      durationMin: Math.round(route.duration / 60),          // secondes → minutes
    };

    _cache.set(key, result);
    return result;
  } catch (err) {
    console.warn(`[routeService] Fallback ligne droite (${from.ville}→${to.ville}) :`, err.message);
    const fallback = {
      coords:      [[from.lat, from.lon], [to.lat, to.lon]],
      distanceKm:  null,
      durationMin: null,
    };
    // On ne met PAS en cache le fallback pour réessayer la prochaine fois
    return fallback;
  }
}

export function clearRouteCache() { _cache.clear(); }
