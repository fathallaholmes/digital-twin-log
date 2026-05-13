// /frontend/src/hooks/useBackendSync.js
// Synchronise l'état local (Zustand) avec le backend en temps réel via WebSocket.
// - Pousse les changements locaux (ordres, événements) vers le backend.
// - Applique les changements distants (autres utilisateurs) au store local.

import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useStore }     from '../store/useStore';
import { api }          from '../api/apiClient';

export function useBackendSync() {
  const { user, token } = useAuthStore();
  const wsRef           = useRef(null);
  const applyingRemote  = useRef(false);   // évite les boucles push↔apply
  const prevOrders      = useRef([]);
  const prevEvents      = useRef([]);

  // ── Appliquer un événement distant au store local ──────────────────────────
  const applyRemote = useCallback((subtype, payload, author) => {
    applyingRemote.current = true;
    try {
      const s = useStore.getState();
      switch (subtype) {

        case 'transport_order': {
          // Ajouter l'ordre s'il n'existe pas déjà
          if (!s.transportOrders.find(o => o.id === payload.id)) {
            useStore.setState(st => ({
              transportOrders: [...st.transportOrders, payload],
            }));
          }
          break;
        }

        case 'order_status': {
          useStore.setState(st => ({
            transportOrders: st.transportOrders.map(o =>
              o.id === payload.id ? { ...o, ...payload } : o
            ),
          }));
          break;
        }

        case 'event_log': {
          const msg = `🌐 [${author}] ${payload.message}`;
          useStore.setState(st => ({ events: [...st.events, msg] }));
          break;
        }

        case 'scenario': {
          // Notifier via events log (les scénarios sont récupérés via /shared/state)
          useStore.setState(st => ({
            events: [...st.events, `🌐 [${author}] a sauvegardé le scénario "${payload.name}"`],
          }));
          break;
        }

        default:
          break;
      }
    } finally {
      applyingRemote.current = false;
    }
  }, []);

  // ── Pousser un événement vers le backend ───────────────────────────────────
  const pushEvent = useCallback(async (type, payload) => {
    if (!user) return;
    try {
      await api.pushEvent(type, payload);
    } catch {
      // Silencieux si le backend est indisponible
    }
  }, [user]);

  // ── Connexion WebSocket ────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !token) return;

    // Charger l'état partagé initial
    api.getSharedState().then(state => {
      if (!state) return;
      applyingRemote.current = true;
      try {
        // Fusionner les ordres distants (sans écraser les locaux existants)
        const localOrders = useStore.getState().transportOrders;
        const remoteOrders = (state.transport_orders ?? []).filter(
          ro => !localOrders.find(lo => lo.id === ro.id)
        );
        if (remoteOrders.length > 0) {
          useStore.setState(st => ({
            transportOrders: [...st.transportOrders, ...remoteOrders],
          }));
        }
        // Fusionner les événements distants
        const remoteEvents = (state.events ?? []).filter(e => e.startsWith('🌐'));
        if (remoteEvents.length > 0) {
          useStore.setState(st => ({
            events: [...new Set([...st.events, ...remoteEvents])],
          }));
        }
      } finally {
        applyingRemote.current = false;
      }
      // Initialiser les refs avec l'état courant après merge
      prevOrders.current = useStore.getState().transportOrders;
      prevEvents.current = useStore.getState().events;
    }).catch(() => {});

    // Ouvrir WebSocket
    const ws = new WebSocket(api.wsUrl());
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'shared_event') {
          applyRemote(msg.subtype, msg.payload, msg.author);
        }
        // online_users / user_joined / user_left → géré par CollabIndicator
      } catch { /* ignore */ }
    };

    // Keepalive toutes les 25s
    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send('ping');
    }, 25000);

    return () => {
      clearInterval(ping);
      ws.close();
      wsRef.current = null;
    };
  }, [user, token, applyRemote]);

  // ── Observer les changements locaux et les pousser ─────────────────────────
  useEffect(() => {
    if (!user) return;

    const unsub = useStore.subscribe((state, prev) => {
      if (applyingRemote.current) return;

      // Nouvel ordre de transport confirmé
      if (state.transportOrders.length > prev.transportOrders.length) {
        const newOrders = state.transportOrders.slice(prev.transportOrders.length);
        newOrders.forEach(o => pushEvent('transport_order', o));
      }

      // Changement de statut d'un ordre existant
      if (state.transportOrders.length === prev.transportOrders.length) {
        state.transportOrders.forEach(o => {
          const p = prev.transportOrders.find(x => x.id === o.id);
          if (p && p.status !== o.status) {
            pushEvent('order_status', { id: o.id, status: o.status });
          }
        });
      }

      // Nouveaux événements dans le journal
      if (state.events.length > prev.events.length) {
        const newEvts = state.events.slice(prev.events.length);
        newEvts.forEach(msg => pushEvent('event_log', { message: msg }));
      }
    });

    return unsub;
  }, [user, pushEvent]);

  return { pushEvent, ws: wsRef };
}
