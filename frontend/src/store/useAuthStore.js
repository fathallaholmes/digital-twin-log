// /frontend/src/store/useAuthStore.js
import { create } from 'zustand';

export const useAuthStore = create((set) => ({
  user:  JSON.parse(localStorage.getItem('dt_user') ?? 'null'),
  token: localStorage.getItem('dt_token') ?? null,

  setAuth: (user, token) => {
    localStorage.setItem('dt_user',  JSON.stringify(user));
    localStorage.setItem('dt_token', token);
    set({ user, token });
  },

  logout: () => {
    localStorage.removeItem('dt_user');
    localStorage.removeItem('dt_token');
    set({ user: null, token: null });
  },
}));
