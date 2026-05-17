// /frontend/src/api/aiClient.js
// Wrapper fetch dédié aux endpoints /ai/* du module ai_extensions.

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
    throw new Error(err.detail ?? 'Erreur API IA');
  }
  return res.json();
}

export const aiApi = {
  // IoT
  iotSnapshot:        (vid)      => _request('GET', `/ai/iot/snapshot?vehicle_id=${vid}`),
  iotSnapshotAll:     (ids)      => _request('GET', `/ai/iot/snapshot/all${ids ? `?vehicle_ids=${ids.join(',')}` : ''}`),
  iotHistorical:      (vid, days = 30, kind = 'obd') =>
    _request('GET', `/ai/iot/historical?vehicle_id=${vid}&days=${days}&kind=${kind}`),
  iotBreakdowns:      ()         => _request('GET', '/ai/iot/breakdowns'),
  iotDatasetStats:    ()         => _request('GET', '/ai/iot/dataset/stats'),
  iotProfiles:        ()         => _request('GET', '/ai/iot/profiles'),

  // Maintenance prédictive
  predictMaintenance:        (vid)        => _request('POST', '/ai/predict/maintenance', { vehicle_id: vid }),
  predictMaintenanceAll:     (minRisk = 'faible') =>
    _request('GET', `/ai/predict/maintenance/all?min_risk=${encodeURIComponent(minRisk)}`),
  predictMaintenanceTrain:   ()           => _request('POST', '/ai/predict/maintenance/train'),
  predictMaintenanceInfo:    ()           => _request('GET', '/ai/predict/maintenance/model-info'),

  // Détection d'anomalies
  anomalyScan:    (daysBack = 14, maxResults = 50) =>
    _request('GET', `/ai/anomaly/scan?days_back=${daysBack}&max_results=${maxResults}`),
  anomalyVehicle: (vid)             => _request('GET', `/ai/anomaly/vehicle/${vid}`),
  anomalyScore:   (features)        => _request('POST', '/ai/anomaly/score', features),
  anomalyTrain:   (contamination=0.05) =>
    _request('POST', `/ai/anomaly/train?contamination=${contamination}`),
  anomalyInfo:    ()                => _request('GET', '/ai/anomaly/info'),

  // What-If Simulator
  whatifBaseline:  (n = 15) => _request('GET',  `/ai/whatif/baseline?n_per_siege=${n}`),
  whatifSimulate:  (config, demandMultiplier = 1.0) =>
    _request('POST', '/ai/whatif/simulate', { config, demand_multiplier: demandMultiplier }),
  whatifCompare:   (configA, configB, demandMultiplier = 1.0, labelA='Actuel', labelB='Proposé') =>
    _request('POST', '/ai/whatif/compare', {
      config_a: configA, config_b: configB,
      demand_multiplier: demandMultiplier,
      label_a: labelA, label_b: labelB,
    }),
  whatifTrain:     (nSamples = 5000) =>
    _request('POST', `/ai/whatif/train?n_samples=${nSamples}`),
  whatifInfo:      ()        => _request('GET', '/ai/whatif/info'),

  // Route Optimization (OR-Tools VRP)
  optimizeRoutes:   (missions, vehicles, opts = {}) =>
    _request('POST', '/ai/optimize/routes', {
      missions, vehicles,
      departure_hour:     opts.departureHour    ?? 9,
      weight_distance:    opts.weightDistance   ?? 0.4,
      weight_time:        opts.weightTime       ?? 0.4,
      weight_co2:         opts.weightCo2        ?? 0.2,
      time_limit_seconds: opts.timeLimitSeconds ?? 3,
    }),
  optimizeDemo:     (nMissions = 10, nVehicles = 6, hour = 9) =>
    _request('GET', `/ai/optimize/demo?n_missions=${nMissions}&n_vehicles=${nVehicles}&hour=${hour}`),
  optimizeMatrix:   (hour = 9) =>
    _request('GET', `/ai/optimize/distance-matrix?hour=${hour}`),

  // Recommendation engine + bandit
  recommendList:        (daysBack = 14, max = 20) =>
    _request('GET', `/ai/recommend/list?days_back=${daysBack}&max_results=${max}`),
  recommendFeedback:    (recId, feedback) =>
    _request('POST', '/ai/recommend/feedback', { recommendation_id: recId, feedback }),
  recommendBanditStats: () => _request('GET', '/ai/recommend/bandit-stats'),
  recommendBanditReset: () => _request('POST', '/ai/recommend/bandit-reset'),

  // NLG
  nlgBanner:  (max = 5) => _request('GET', `/ai/nlg/banner?max_items=${max}`),
  nlgNarrate: (kind, payload, level = 'card') =>
    _request('POST', '/ai/nlg/narrate', { kind, payload, level }),
};
