// /frontend/src/api/apiClient.js
// Wrapper fetch vers le backend FastAPI avec injection automatique du JWT.

const BASE = 'http://localhost:8000';

function getToken() {
  return localStorage.getItem('dt_token') ?? '';
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? 'Erreur serveur');
  }
  return res.json();
}

export const api = {
  get:    (path)        => request('GET',    path),
  post:   (path, body)  => request('POST',   path, body),
  put:    (path, body)  => request('PUT',    path, body),
  delete: (path)        => request('DELETE', path),

  // Auth
  login:    (username, password) => {
    const form = new URLSearchParams({ username, password });
    return fetch(`${BASE}/auth/login`, {
      method: 'POST',
      body: form,
    }).then(async r => {
      if (!r.ok) {
        const e = await r.json().catch(() => ({ detail: r.statusText }));
        throw new Error(e.detail ?? 'Erreur login');
      }
      return r.json();
    });
  },
  register: (username, password, full_name) =>
    request('POST', '/auth/register', { username, password, full_name }),
  me:       () => request('GET', '/auth/me'),

  // Shared state
  getSharedState: ()           => request('GET',  '/shared/state'),
  pushEvent:      (type, payload) => request('POST', '/shared/push', { type, payload }),

  // WebSocket URL
  wsUrl: () => `ws://localhost:8000/ws?token=${getToken()}`,
};
