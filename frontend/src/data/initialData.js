// /frontend/src/data/initialData.js
// 5 sièges + 75 véhicules (15 par siège, 4 types)

export const SIEGES = [
  { id: 'S1', ville: 'Tanger',     lat: 35.7595, lon: -5.8340, role: 'Port / Industrie',     iplInitial: 35, commandes: 18, retards: 4 },
  { id: 'S2', ville: 'Rabat',      lat: 34.0209, lon: -6.8416, role: 'Capitale / Admin',     iplInitial: 30, commandes: 15, retards: 3 },
  { id: 'S3', ville: 'Casablanca', lat: 33.5731, lon: -7.5898, role: 'Hub principal',        iplInitial: 45, commandes: 25, retards: 6 },
  { id: 'S4', ville: 'Errachidia', lat: 31.9317, lon: -4.4243, role: 'Sud / Semi-désert',    iplInitial: 25, commandes: 12, retards: 2 },
  { id: 'S5', ville: 'Agadir',     lat: 30.4278, lon: -9.5981, role: 'Tourisme / Pêche',     iplInitial: 38, commandes: 17, retards: 4 },
];

// Composition flotte par siège : 6 cargo + 4 VLTT + 3 minicar + 2 M915 = 15
const COMPOSITION = [
  { type: 'Cargo 3.5t',     qty: 6 },
  { type: 'VLTT',           qty: 4 },
  { type: 'Minicar 9p',     qty: 3 },
  { type: 'M915 Conteneur', qty: 2 },
];

function generateFleet() {
  const vehicles = [];
  let counter = 1;
  SIEGES.forEach(siege => {
    COMPOSITION.forEach(({ type, qty }) => {
      for (let i = 0; i < qty; i++) {
        const km = Math.floor(Math.random() * 5000);
        // Quelques véhicules en "Risque" si km > 4000
        const etat = km > 4500 ? 'Risque' : 'OK';
        vehicles.push({
          id: `V${String(counter).padStart(3, '0')}`,
          type,
          siege: siege.ville,
          etat,
          position: { lat: siege.lat, lon: siege.lon },
          km_depuis_derniere_maintenance: km,
          temps_estime_reparation: 0,
          en_transit: false,
        });
        counter++;
      }
    });
  });
  return vehicles;
}

export const INITIAL_VEHICLES = generateFleet();

// Sanity : VLTT à Errachidia
export const VLTT_ERRACHIDIA_COUNT = INITIAL_VEHICLES.filter(
  v => v.siege === 'Errachidia' && v.type === 'VLTT'
).length; // = 4

export const TOTAL_VEHICLES = INITIAL_VEHICLES.length; // = 75
