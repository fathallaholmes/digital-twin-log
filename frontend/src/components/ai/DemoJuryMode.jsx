// /frontend/src/components/ai/DemoJuryMode.jsx
// Mode plein écran "Présentation jury" — 6 slides comparant la gestion
// SANS IA vs AVEC IA, avec compteurs animés et narration NLG.

import { useState, useEffect, useRef } from 'react';
import { aiApi } from '../../api/aiClient';

// ── Hook : animation d'un compteur de 0 à `target` en `duration` ms ────────────
function useAnimatedCounter(target, duration = 1800, dependency = null) {
  const [value, setValue] = useState(0);
  const rafRef = useRef(null);
  const startRef = useRef(null);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    startRef.current = null;
    function tick(now) {
      if (!startRef.current) startRef.current = now;
      const elapsed = now - startRef.current;
      const t = Math.min(1, elapsed / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line
  }, [target, duration, dependency]);

  return value;
}

// ── Slide 1 : Intro ───────────────────────────────────────────────────────────
function SlideIntro({ onStart }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <div className="text-7xl mb-6">🇲🇦</div>
      <h1 className="text-5xl font-bold text-white mb-3">Digital Twin Intelligent</h1>
      <p className="text-xl text-slate-300 mb-2">Parc Automobile Multi-Sites — Maroc</p>
      <p className="text-sm text-slate-500 mb-12">TIYAOUIL Fathallah · MSID TA · FSR · 2024-2026</p>

      <div className="grid grid-cols-4 gap-6 mb-12">
        <StatBlock value={5}  label="Sièges" emoji="🏛"/>
        <StatBlock value={75} label="Véhicules" emoji="🚚"/>
        <StatBlock value={5}  label="Modèles ML" emoji="🧠"/>
        <StatBlock value={35} label="Endpoints API" emoji="🔌"/>
      </div>

      <button onClick={onStart}
        className="px-8 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-lg font-bold shadow-2xl transition-all transform hover:scale-105">
        ▶ Démarrer la démonstration
      </button>
    </div>
  );
}

function StatBlock({ value, label, emoji }) {
  const v = useAnimatedCounter(value, 1500);
  return (
    <div className="bg-white/5 backdrop-blur rounded-xl p-5 border border-white/10">
      <div className="text-3xl mb-1">{emoji}</div>
      <div className="text-4xl font-bold text-white">{Math.round(v)}</div>
      <div className="text-xs text-slate-400 uppercase tracking-wider mt-1">{label}</div>
    </div>
  );
}

// ── Slide générique : Avant / Après ───────────────────────────────────────────
function SlideComparison({ title, subtitle, beforeLabel, beforeValue, beforeUnit, beforeContext,
                            afterLabel, afterValue, afterUnit, afterContext, gainPct, gainLabel,
                            badge, nlgQuote }) {
  const beforeAnim = useAnimatedCounter(beforeValue, 1500);
  const afterAnim  = useAnimatedCounter(afterValue,  2200);
  const gainAnim   = useAnimatedCounter(gainPct,     2500);

  return (
    <div className="flex flex-col h-full p-12 text-white">
      <div className="text-center mb-8">
        <p className="text-sm text-blue-400 uppercase tracking-widest font-bold mb-2">{badge}</p>
        <h2 className="text-4xl font-bold mb-2">{title}</h2>
        <p className="text-slate-400 text-sm">{subtitle}</p>
      </div>

      <div className="grid grid-cols-2 gap-8 flex-1 items-center">
        {/* SANS IA */}
        <div className="bg-red-900/20 border border-red-700/40 rounded-2xl p-8 text-center">
          <p className="text-xs uppercase tracking-widest text-red-400 font-bold mb-2">❌ Sans IA</p>
          <p className="text-lg text-slate-300 mb-4">{beforeLabel}</p>
          <p className="text-6xl font-bold text-red-300">
            {Math.round(beforeAnim).toLocaleString('fr-FR')}
            <span className="text-2xl text-red-400 ml-2">{beforeUnit}</span>
          </p>
          <p className="text-xs text-slate-400 mt-3 italic">{beforeContext}</p>
        </div>

        {/* AVEC IA */}
        <div className="bg-emerald-900/20 border border-emerald-500/50 rounded-2xl p-8 text-center shadow-2xl shadow-emerald-500/20">
          <p className="text-xs uppercase tracking-widest text-emerald-400 font-bold mb-2">✓ Avec IA</p>
          <p className="text-lg text-slate-300 mb-4">{afterLabel}</p>
          <p className="text-6xl font-bold text-emerald-300">
            {Math.round(afterAnim).toLocaleString('fr-FR')}
            <span className="text-2xl text-emerald-400 ml-2">{afterUnit}</span>
          </p>
          <p className="text-xs text-slate-400 mt-3 italic">{afterContext}</p>
        </div>
      </div>

      {/* Gain badge */}
      <div className="text-center mt-8">
        <div className="inline-block bg-gradient-to-r from-emerald-600 to-cyan-600 px-8 py-3 rounded-full shadow-xl">
          <span className="text-3xl font-bold text-white">{Math.round(gainAnim)}%</span>
          <span className="text-sm text-emerald-100 ml-2 font-medium">{gainLabel}</span>
        </div>
      </div>

      {/* Narration NLG */}
      {nlgQuote && (
        <div className="mt-6 mx-auto max-w-3xl bg-blue-950/40 border-l-4 border-blue-400 px-5 py-3 rounded-r-lg">
          <p className="text-xs text-blue-300 uppercase tracking-wider font-semibold mb-1">🧠 Narration IA</p>
          <p className="text-sm text-slate-200 italic">{nlgQuote}</p>
        </div>
      )}
    </div>
  );
}

// ── Slide synthèse finale ─────────────────────────────────────────────────────
function SlideSynthesis() {
  const k1 = useAnimatedCounter(76, 2000);
  const k2 = useAnimatedCounter(90, 2000);
  const k3 = useAnimatedCounter(76, 2000);
  const k4 = useAnimatedCounter(5,  2000);

  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-12">
      <p className="text-xs text-blue-400 uppercase tracking-widest font-bold mb-2">Synthèse globale</p>
      <h2 className="text-5xl font-bold text-white mb-12">L'impact de l'IA sur le parc</h2>

      <div className="grid grid-cols-2 gap-8 max-w-4xl mb-12">
        <BigKpi value={k1} unit="%" label="Réduction distance + CO₂"        emoji="🌍" color="from-emerald-500 to-teal-500"/>
        <BigKpi value={k2} unit="%" label="Recall pannes (RandomForest)"     emoji="🔧" color="from-orange-500 to-red-500"/>
        <BigKpi value={k3} unit="%" label="Anomalies conducteur captées"     emoji="⚠️" color="from-amber-500 to-yellow-500"/>
        <BigKpi value={k4} unit="ms" label="Inférence what-if (LightGBM)"    emoji="⚡" color="from-cyan-500 to-blue-500"/>
      </div>

      <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl px-8 py-5 max-w-2xl">
        <p className="text-sm text-slate-300 leading-relaxed">
          Le jumeau numérique transforme la flotte d'un système <strong className="text-red-400">réactif</strong>
          {' '}en système <strong className="text-emerald-400">prédictif et auto-optimisé</strong>,
          {' '}grâce à 5 modèles ML, OR-Tools VRP et un moteur de recommandation contextuel.
        </p>
      </div>

      <p className="mt-12 text-2xl text-white font-light">Merci de votre attention 🙏</p>
      <p className="mt-2 text-sm text-slate-500">Questions ?</p>
    </div>
  );
}

function BigKpi({ value, unit, label, emoji, color }) {
  return (
    <div className={`bg-gradient-to-br ${color} rounded-2xl p-6 text-white shadow-2xl`}>
      <div className="text-4xl mb-2">{emoji}</div>
      <div className="text-5xl font-bold">
        {Math.round(value)}<span className="text-2xl ml-1">{unit}</span>
      </div>
      <p className="text-sm opacity-90 mt-1">{label}</p>
    </div>
  );
}

// ── Définition des slides ─────────────────────────────────────────────────────
const SLIDES = [
  { type: 'intro' },
  {
    type: 'comparison',
    badge: 'Bloc B — Maintenance prédictive',
    title: 'Anticiper les pannes avant qu\'elles ne surviennent',
    subtitle: 'Random Forest entraîné sur 11 250 sessions étiquetées',
    beforeLabel: 'Pannes imprévues / an',
    beforeValue: 14, beforeUnit: '',
    beforeContext: 'Détection au moment de la panne — immobilisation 4 jours',
    afterLabel: 'Pannes anticipées 30j avant',
    afterValue: 13, afterUnit: '',
    afterContext: 'Recall 90.5 % · ROC-AUC 0.986 — planification proactive',
    gainPct: 90, gainLabel: 'de pannes captées avant qu\'elles ne surviennent',
    nlgQuote: 'Le jumeau détecte un risque de panne courroie de distribution à 68 % sur V031 dans les 30 prochains jours → Inspection sous 7 jours.',
  },
  {
    type: 'comparison',
    badge: 'Bloc C — Détection d\'anomalies',
    title: 'Identifier les conducteurs à risque',
    subtitle: 'Isolation Forest non supervisé sur 11 146 sessions journalières',
    beforeLabel: 'Conducteurs agressifs identifiés',
    beforeValue: 0, beforeUnit: '/15',
    beforeContext: 'Aucun système systématique d\'évaluation comportementale',
    afterLabel: 'Profils agressifs détectés',
    afterValue: 15, afterUnit: '/15',
    afterContext: '100 % des conducteurs agressifs trouvés (confiance > 70 %)',
    gainPct: 100, gainLabel: 'de précision sur la détection agressive',
    nlgQuote: 'Anomalie V018 (conducteur agressif) : freinages brusques 6.7× au-dessus de la moyenne → Formation éco-conduite recommandée.',
  },
  {
    type: 'comparison',
    badge: 'Bloc D — What-If Simulator',
    title: 'Tester des scénarios en temps réel',
    subtitle: 'Surrogate LightGBM (R² 0.95-0.99) vs simulation complète',
    beforeLabel: 'Durée d\'analyse d\'un scénario',
    beforeValue: 3500, beforeUnit: 'ms',
    beforeContext: 'Simulation complète — 1 scénario par minute',
    afterLabel: 'Inférence surrogate',
    afterValue: 5, afterUnit: 'ms',
    afterContext: '700× plus rapide — curseurs UI temps réel',
    gainPct: 99, gainLabel: 'de réduction du temps d\'analyse',
    nlgQuote: 'Scénario "Réorganisation" vs "Actuel" : délai -13.6 %, CO₂ stable, taux panne +9 %.',
  },
  {
    type: 'comparison',
    badge: 'Bloc E — Optimisation OR-Tools VRP',
    title: 'Minimiser distance, temps, CO₂',
    subtitle: '10 missions / 6 véhicules — Multi-dépôts pickup-and-delivery',
    beforeLabel: 'Distance stratégie naïve',
    beforeValue: 5840, beforeUnit: 'km',
    beforeContext: '1 mission = 1 trajet aller-retour, 6 véhicules mobilisés',
    afterLabel: 'Distance OR-Tools',
    afterValue: 1390, afterUnit: 'km',
    afterContext: '1 seul véhicule, regroupement par proximité géographique',
    gainPct: 76, gainLabel: 'de réduction distance + CO₂',
    nlgQuote: 'Tournées optimisées : 10 missions réparties sur 1 véhicule (au lieu de 6). Gain : -76 % distance, -76 % CO₂.',
  },
  {
    type: 'comparison',
    badge: 'Bloc F — Recommendation Engine',
    title: 'De l\'alerte brute à l\'action concrète',
    subtitle: '5 règles métier + bandit ε-greedy apprenant des feedbacks',
    beforeLabel: 'Actions à prendre suite alertes',
    beforeValue: 75, beforeUnit: '%',
    beforeContext: 'Alertes brutes — interprétation manuelle par le gestionnaire',
    afterLabel: 'Recommandations actionnables',
    afterValue: 100, afterUnit: '%',
    afterContext: 'Chaque alerte → action concrète + apprentissage continu',
    gainPct: 100, gainLabel: 'des alertes traduites en actions exécutables',
    nlgQuote: 'Formation sécurité conducteur V018 : programmer session éco-conduite + audit conducteur — score bandit 1.0.',
  },
  { type: 'synthesis' },
];

// ── Composant principal ───────────────────────────────────────────────────────
export default function DemoJuryMode({ onClose }) {
  const [idx, setIdx] = useState(0);
  const slide = SLIDES[idx];

  // Navigation clavier
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
        setIdx(i => Math.min(SLIDES.length - 1, i + 1));
      } else if (e.key === 'ArrowLeft') {
        setIdx(i => Math.max(0, i - 1));
      } else if (e.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 overflow-hidden">

      {/* Header overlay */}
      <div className="absolute top-0 left-0 right-0 px-6 py-3 flex items-center justify-between text-white z-10">
        <div className="flex items-center gap-3">
          <span className="text-xs px-3 py-1 rounded-full bg-blue-600 font-bold uppercase tracking-wider">
            Mode Présentation
          </span>
          <span className="text-xs text-slate-400">
            Slide {idx + 1} / {SLIDES.length}
          </span>
        </div>
        <button onClick={onClose}
          className="text-xs px-4 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 transition-colors font-medium">
          ✕ Quitter (Esc)
        </button>
      </div>

      {/* Contenu de la slide */}
      <div className="h-full pt-14 pb-20">
        {slide.type === 'intro' && (
          <SlideIntro onStart={() => setIdx(1)} />
        )}
        {slide.type === 'comparison' && (
          <SlideComparison key={idx} {...slide}/>
        )}
        {slide.type === 'synthesis' && (
          <SlideSynthesis />
        )}
      </div>

      {/* Footer navigation */}
      <div className="absolute bottom-0 left-0 right-0 px-6 py-4 flex items-center justify-between bg-slate-950/50 backdrop-blur">
        <button onClick={() => setIdx(i => Math.max(0, i - 1))}
          disabled={idx === 0}
          className="px-4 py-2 text-xs rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-white">
          ← Précédent
        </button>

        {/* Dots */}
        <div className="flex gap-2">
          {SLIDES.map((_, i) => (
            <button key={i}
              onClick={() => setIdx(i)}
              className={`h-2 rounded-full transition-all ${
                i === idx ? 'bg-blue-400 w-8'
                          : i < idx ? 'bg-slate-500 w-2 hover:bg-slate-400'
                                    : 'bg-slate-700 w-2 hover:bg-slate-500'
              }`}/>
          ))}
        </div>

        <button onClick={() => setIdx(i => Math.min(SLIDES.length - 1, i + 1))}
          disabled={idx === SLIDES.length - 1}
          className="px-4 py-2 text-xs rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-30 text-white font-semibold">
          Suivant →
        </button>
      </div>

      <div className="absolute bottom-2 right-6 text-[10px] text-slate-600">
        ← → pour naviguer · Esc pour quitter
      </div>
    </div>
  );
}
