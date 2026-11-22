// Les pays du grand monde (noms et styles originaux). Données pures : utilisées par le terrain
// (continents, couleurs du sol) et par le constructeur des pays (palais, villes).

export type CountryStyle = "desert" | "snow" | "jade" | "ocean" | "volcano" | "forest" | "pyramid" | "crystal" | "redhills" | "savanna" | "royal";

export interface CountryDef {
  id: string;
  name: string;
  x: number;
  z: number;
  /** rayon des terres */
  r: number;
  style: CountryStyle;
  /** hauteur du plateau de la capitale */
  base: number;
  /** relief des collines */
  hills: number;
  /** couleur du sol (r, g, b) */
  ground: [number, number, number];
  desc: string;
  /** rayon laissé libre au centre (grand palais sur mesure) */
  clear?: number;
}

/** Côté de la carte du grand monde (m). Le cœur du royaume (8 km) est au centre. */
export const EARTH = 64000;

export const COUNTRIES: CountryDef[] = [
  { id: "solaria", name: "Solaria", x: 9000, z: -6000, r: 2600, style: "desert", base: 8, hills: 60, ground: [0.82, 0.66, 0.4], desc: "désert doré, palais à dômes de grès" },
  { id: "nordhaven", name: "Nordhaven", x: -1500, z: 10800, r: 2400, style: "snow", base: 10, hills: 260, ground: [0.9, 0.92, 0.96], desc: "pays des neiges, maisons de bois aux toits pointus" },
  { id: "jadea", name: "Jadéa", x: 11500, z: 8200, r: 2500, style: "jade", base: 8, hills: 120, ground: [0.2, 0.46, 0.28], desc: "collines de jade, tours à toits étagés" },
  { id: "oceane", name: "Océane", x: -9800, z: -8500, r: 2100, style: "ocean", base: 5, hills: 30, ground: [0.62, 0.7, 0.42], desc: "archipel aux maisons blanches et toits bleus" },
  { id: "vulkara", name: "Vulkara", x: -10500, z: 5200, r: 2200, style: "volcano", base: 9, hills: 90, ground: [0.17, 0.14, 0.14], desc: "terre de basalte, volcan et rivières de lave" },
  { id: "sylvanie", name: "Sylvanie", x: 2500, z: -11000, r: 2600, style: "forest", base: 8, hills: 110, ground: [0.1, 0.34, 0.12], desc: "forêt d'arbres géants et cabanes perchées" },
  { id: "kemetia", name: "Kemetia", x: 12500, z: -500, r: 2000, style: "pyramid", base: 7, hills: 40, ground: [0.86, 0.72, 0.44], desc: "sables d'or et grandes pyramides" },
  { id: "cristallis", name: "Cristallis", x: -11800, z: -1200, r: 2000, style: "crystal", base: 6, hills: 50, ground: [0.6, 0.62, 0.72], desc: "cité de cristal lumineuse" },
  { id: "ambrelune", name: "Ambrelune", x: 4500, z: 12000, r: 2200, style: "redhills", base: 8, hills: 140, ground: [0.56, 0.27, 0.16], desc: "collines rouges et villages en terre cuite" },
  { id: "savanor", name: "Savanor", x: -6000, z: -12500, r: 2300, style: "savanna", base: 6, hills: 45, ground: [0.6, 0.5, 0.24], desc: "grande savane et cases rondes" },
  // ---- les terres lointaines (deuxième anneau, 20 à 28 km du palais)
  { id: "glacea", name: "Glacéa", x: -21000, z: 19000, r: 3200, style: "snow", base: 12, hills: 320, ground: [0.93, 0.95, 1], desc: "empire des glaces et des aurores" },
  { id: "sahrane", name: "Sahrane", x: 22000, z: -19000, r: 3400, style: "desert", base: 8, hills: 90, ground: [0.86, 0.62, 0.36], desc: "mer de dunes et oasis royales" },
  { id: "tropica", name: "Tropica", x: 1000, z: -25000, r: 3000, style: "ocean", base: 5, hills: 60, ground: [0.42, 0.66, 0.3], desc: "îles tropicales et lagons turquoise" },
  { id: "mirabel", name: "Mirabel", x: 24000, z: 15000, r: 3200, style: "jade", base: 8, hills: 160, ground: [0.24, 0.52, 0.32], desc: "terrasses de jade et cascades" },
  { id: "pyros", name: "Pyros", x: -25000, z: -5000, r: 3000, style: "volcano", base: 9, hills: 110, ground: [0.2, 0.12, 0.1], desc: "royaume de feu aux trois volcans" },
  { id: "verdania", name: "Verdania", x: -9000, z: 25000, r: 3300, style: "forest", base: 8, hills: 140, ground: [0.08, 0.3, 0.1], desc: "forêt primaire aux arbres de 200 m" },
  { id: "orakis", name: "Orakis", x: 27000, z: -1500, r: 2800, style: "pyramid", base: 7, hills: 50, ground: [0.9, 0.76, 0.48], desc: "vallée des mille pyramides" },
  { id: "lumina", name: "Lumina", x: 10000, z: 25500, r: 3000, style: "crystal", base: 6, hills: 70, ground: [0.66, 0.64, 0.8], desc: "capitale de lumière et de cristal" },
  { id: "rubis", name: "Rubis", x: -20500, z: -21000, r: 3100, style: "redhills", base: 8, hills: 180, ground: [0.6, 0.22, 0.14], desc: "canyons rouges et citadelles" },
  { id: "princesses", name: "Cité des Princesses", x: 7000, z: -15500, r: 2400, style: "royal", base: 8, hills: 70, ground: [0.34, 0.6, 0.3], desc: "la grande cité royale et le Palais des Princesses", clear: 240 },
  { id: "zambara", name: "Zambara", x: 13000, z: -25500, r: 3000, style: "savanna", base: 6, hills: 55, ground: [0.66, 0.54, 0.26], desc: "grandes plaines et villages royaux" }
];

export function countryAt(x: number, z: number, margin = 1): CountryDef | null {
  for (const c of COUNTRIES) if (Math.hypot(x - c.x, z - c.z) < c.r * margin) return c;
  return null;
}

/** Aéroports : piste est-ouest, aérogare du côté `side` (+1 = nord, −1 = sud). Zones aplanies par le terrain. */
export interface AirportDef {
  id: string;
  name: string;
  short: string;
  x: number; // centre de la piste
  z: number;
  h: number; // altitude du terrain aplani
  len: number; // longueur de piste
  side: 1 | -1;
  big: boolean;
}
export const AIRPORTS: AirportDef[] = [
  { id: "royal", name: "Aéroport Royal International", short: "Aéroport Royal", x: 2050, z: -2750, h: 6, len: 2500, side: 1, big: true },
  { id: "princesses", name: "Aéroport de la Cité des Princesses", short: "Cité des Princesses", x: 6800, z: -13900, h: 8, len: 1600, side: -1, big: false }
];
/** Emprise (rectangle monde) d'un aéroport, marges comprises. */
export function airportRect(a: AirportDef, margin = 0) {
  const half = a.len / 2 + 320 + margin;
  const z1 = a.side > 0 ? a.z - 60 - margin : a.z - 660 - margin;
  const z2 = a.side > 0 ? a.z + 660 + margin : a.z + 60 + margin;
  return { x1: a.x - half, x2: a.x + half, z1, z2 };
}
export function inAirport(x: number, z: number, margin = 40) {
  for (const a of AIRPORTS) {
    const r = airportRect(a, margin);
    if (x > r.x1 && x < r.x2 && z > r.z1 && z < r.z2) return a;
  }
  return null;
}

/** La MONTAGNE ROYALE : île-montagne au nord-est du royaume ; le Palais Impérial couvre son plateau sommital. */
export const MOUNTAIN = { x: 5600, z: 6000, r: 2500, plateau: 1450, top: 600 };
export function onMountain(x: number, z: number, margin = 1) {
  return Math.hypot(x - MOUNTAIN.x, z - MOUNTAIN.z) < MOUNTAIN.r * margin;
}
