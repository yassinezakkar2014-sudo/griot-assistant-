// Les pays du grand monde (noms et styles originaux). Données pures : utilisées par le terrain
// (continents, couleurs du sol) et par le constructeur des pays (palais, villes).

export type CountryStyle = "desert" | "snow" | "jade" | "ocean" | "volcano" | "forest" | "pyramid" | "crystal" | "redhills" | "savanna";

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
}

/** Côté de la carte du grand monde (m). Le cœur du royaume (8 km) est au centre. */
export const EARTH = 32000;

export const COUNTRIES: CountryDef[] = [
  { id: "solaria", name: "Solaria", x: 9000, z: -6000, r: 2600, style: "desert", base: 8, hills: 60, ground: [0.82, 0.66, 0.4], desc: "désert doré, palais à dômes de grès" },
  { id: "nordhaven", name: "Nordhaven", x: -1500, z: 10800, r: 2400, style: "snow", base: 10, hills: 260, ground: [0.9, 0.92, 0.96], desc: "pays des neiges, maisons de bois aux toits pointus" },
  { id: "jadea", name: "Jadéa", x: 9800, z: 6800, r: 2500, style: "jade", base: 8, hills: 120, ground: [0.2, 0.46, 0.28], desc: "collines de jade, tours à toits étagés" },
  { id: "oceane", name: "Océane", x: -9800, z: -8500, r: 2100, style: "ocean", base: 5, hills: 30, ground: [0.62, 0.7, 0.42], desc: "archipel aux maisons blanches et toits bleus" },
  { id: "vulkara", name: "Vulkara", x: -10500, z: 5200, r: 2200, style: "volcano", base: 9, hills: 90, ground: [0.17, 0.14, 0.14], desc: "terre de basalte, volcan et rivières de lave" },
  { id: "sylvanie", name: "Sylvanie", x: 2500, z: -11000, r: 2600, style: "forest", base: 8, hills: 110, ground: [0.1, 0.34, 0.12], desc: "forêt d'arbres géants et cabanes perchées" },
  { id: "kemetia", name: "Kemetia", x: 12500, z: -500, r: 2000, style: "pyramid", base: 7, hills: 40, ground: [0.86, 0.72, 0.44], desc: "sables d'or et grandes pyramides" },
  { id: "cristallis", name: "Cristallis", x: -11800, z: -1200, r: 2000, style: "crystal", base: 6, hills: 50, ground: [0.6, 0.62, 0.72], desc: "cité de cristal lumineuse" },
  { id: "ambrelune", name: "Ambrelune", x: 4500, z: 12000, r: 2200, style: "redhills", base: 8, hills: 140, ground: [0.56, 0.27, 0.16], desc: "collines rouges et villages en terre cuite" },
  { id: "savanor", name: "Savanor", x: -6000, z: -12500, r: 2300, style: "savanna", base: 6, hills: 45, ground: [0.6, 0.5, 0.24], desc: "grande savane et cases rondes" }
];

export function countryAt(x: number, z: number, margin = 1): CountryDef | null {
  for (const c of COUNTRIES) if (Math.hypot(x - c.x, z - c.z) < c.r * margin) return c;
  return null;
}
