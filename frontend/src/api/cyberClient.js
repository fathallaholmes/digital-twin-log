// /frontend/src/api/cyberClient.js
// Wrapper vers les endpoints /cyber/* de la couche acquisition de données.

const BASE = 'http://localhost:8000';

function authHeaders() {
  const token = localStorage.getItem('dt_token') ?? '';
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

async function _request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: authHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? 'Erreur API cyber');
  }
  return res.json();
}

export const cyberApi = {
  // Stats & registre
  stats:           ()                  => _request('GET',  '/cyber/stats'),
  vehicles:        (siege)             => _request('GET', `/cyber/vehicles${siege ? `?siege=${siege}` : ''}`),
  vehicle:         (id)                => _request('GET', `/cyber/vehicles/${id}`),
  drivers:         (siege, profile)    => {
    const params = new URLSearchParams();
    if (siege)   params.set('siege', siege);
    if (profile) params.set('profile', profile);
    return _request('GET', `/cyber/drivers${params.toString() ? '?' + params : ''}`);
  },

  // Lecture par véhicule
  vehicleObd:      (id, limit = 100)   => _request('GET', `/cyber/vehicles/${id}/obd?limit=${limit}`),
  vehicleGps:      (id, limit = 200)   => _request('GET', `/cyber/vehicles/${id}/gps?limit=${limit}`),
  vehicleEvents:   (id, limit = 100)   => _request('GET', `/cyber/vehicles/${id}/events?limit=${limit}`),
  vehicleTimeline: (id, daysBack = 30) => _request('GET', `/cyber/vehicles/${id}/timeline?days_back=${daysBack}`),

  // Listes opérationnelles
  breakdowns:      (status, limit = 100) => {
    const q = status ? `?status=${status}&limit=${limit}` : `?limit=${limit}`;
    return _request('GET', `/cyber/breakdowns${q}`);
  },
  missions:        (status, limit = 100) => {
    const q = status ? `?status=${status}&limit=${limit}` : `?limit=${limit}`;
    return _request('GET', `/cyber/missions${q}`);
  },

  // Saisies conducteur
  reportRefuel:    (data) => _request('POST', '/cyber/report/refuel',  data),
  reportIncident:  (data) => _request('POST', '/cyber/report/incident', data),
  reportOdometer:  (data) => _request('POST', '/cyber/report/odometer', data),

  // Saisies chef de parc
  declareBreakdown:   (data)         => _request('POST', '/cyber/manage/breakdown', data),
  updateBreakdown:    (id, data)     => _request('PUT', `/cyber/manage/breakdown/${id}`, data),
  declareMaintenance: (data)         => _request('POST', '/cyber/manage/maintenance', data),
  createMission:      (data)         => _request('POST', '/cyber/manage/mission', data),
  updateMission:      (id, data)     => _request('PUT', `/cyber/manage/mission/${id}`, data),

  // Pilotage simulateur
  simulatorStart:  (intervalS = 5)   => _request('POST', `/cyber/simulator/start?interval_s=${intervalS}`),
  simulatorStop:   ()                => _request('POST',  '/cyber/simulator/stop'),
  simulatorStatus: ()                => _request('GET',   '/cyber/simulator/status'),

  // Seed (admin)
  seed:            (daysBack = 90, purge = false) =>
    _request('POST', `/cyber/seed?days_back=${daysBack}&purge=${purge}`),
};
