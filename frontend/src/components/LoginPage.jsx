// /frontend/src/components/LoginPage.jsx
import { useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { api }          from '../api/apiClient';

export default function LoginPage() {
  const { setAuth } = useAuthStore();
  const [mode,     setMode]     = useState('login');   // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'register') {
        await api.register(username, password, fullName);
      }
      const data = await api.login(username, password);
      setAuth(
        { username: data.username, full_name: data.full_name, role: data.role },
        data.access_token,
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Branding */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🇲🇦</div>
          <h1 className="text-2xl font-bold text-slate-900">Digital Twin Intelligent</h1>
          <p className="text-sm text-slate-500 mt-1">Parc Automobile Maroc — MSID TA 2024-2026</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">

          {/* Tabs */}
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => { setMode('login'); setError(''); }}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                mode === 'login'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}>
              Connexion
            </button>
            <button
              onClick={() => { setMode('register'); setError(''); }}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                mode === 'register'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}>
              Créer un compte
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">

            {mode === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Nom complet
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Ex : Ahmed Benali"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Nom d'utilisateur
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                autoComplete="username"
                placeholder="Ex : ahmed.benali"
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Mot de passe
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                ⚠ {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-2.5 rounded-lg text-sm font-bold text-white transition-colors disabled:opacity-60 ${
                mode === 'login'
                  ? 'bg-slate-800 hover:bg-slate-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}>
              {loading
                ? '...'
                : mode === 'login' ? 'Se connecter' : 'Créer le compte'}
            </button>

            {mode === 'login' && (
              <p className="text-[11px] text-slate-400 text-center">
                Compte par défaut : <strong>admin</strong> / <strong>admin123</strong>
              </p>
            )}
          </form>
        </div>

        <p className="text-center text-[11px] text-slate-400 mt-4">
          TIYAOUIL Fathallah · FSR · 2024-2026
        </p>
      </div>
    </div>
  );
}
