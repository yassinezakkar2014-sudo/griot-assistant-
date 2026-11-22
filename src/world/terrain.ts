// Terrain procédural : plateau du palais, ville (est), jungle (sud), montagnes (nord), océan (ouest).
import * as THREE from "three";
import { COUNTRIES, EARTH, countryAt, AIRPORTS, airportRect, MOUNTAIN, onMountain } from "./countryData";

export const WORLD = 8000; // côté de la carte en mètres
export const SEA = -2;
const RES = 320; // segments de la grille
const ORES = 400; // grille du grand monde (160 m)

// --- bruit de valeur 2D (déterministe) ---
function hash(x: number, y: number) {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise(x: number, y: number) {
  const xi = Math.floor(x),
    yi = Math.floor(y);
  const xf = x - xi,
    yf = y - yi;
  const u = xf * xf * (3 - 2 * xf),
    v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi),
    b = hash(xi + 1, yi),
    c = hash(xi, yi + 1),
    d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, y: number, oct = 5) {
  let s = 0,
    amp = 0.5,
    f = 1;
  for (let i = 0; i < oct; i++) {
    s += amp * noise(x * f, y * f);
    f *= 2.03;
    amp *= 0.5;
  }
  return s;
}
function ridged(x: number, y: number) {
  let s = 0,
    amp = 0.5,
    f = 1;
  for (let i = 0; i < 5; i++) {
    const n = 1 - Math.abs(noise(x * f, y * f) * 2 - 1);
    s += amp * n * n;
    f *= 2.1;
    amp *= 0.5;
  }
  return s;
}
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export const ZONES = {
  palace: { x: 0, z: 0, r: 300 },
  city: { x1: 950, x2: 2500, z1: -1050, z2: 1050 },
  base: { x: 650, z: 1900, r: 160, h: 140 },
  night: { x: -650, z: -1300, r: 260 },
  /** le pays voisin, de l'autre côté de l'océan */
  zuria: { x: -2900, z: 300, r: 850 },
  /** Nouvelle Métropole : le prolongement géant de la ville futuriste, à l'est de l'autoroute */
  metro: { x1: 3050, x2: 3950, z1: -1400, z2: 1400 }
};

/** Hauteur analytique (utilisée pour générer la grille). */
export function rawHeight(x: number, z: number) {
  let h = fbm(x * 0.0018 + 3, z * 0.0018 + 7) * 34 - 6;
  // jungle : collines (sud = -z)
  const jw = smooth(-450, -1000, z);
  h += jw * fbm(x * 0.004 + 11, z * 0.004 - 5) * 60;
  // montagnes (nord = +z)
  const mw = smooth(650, 1500, z);
  h += mw * (ridged(x * 0.0011 + 2, z * 0.0011 + 9) * 820 + 40);
  // océan (ouest = -x)
  const ow = smooth(-650, -1300, x);
  h = mix(h, -48 + fbm(x * 0.003, z * 0.003) * 14, ow);
  // ville : plaine
  const c = ZONES.city;
  const cw = Math.min(smooth(c.x1 - 250, c.x1, x), 1 - smooth(c.x2, c.x2 + 250, x), smooth(c.z1 - 250, c.z1, z), 1 - smooth(c.z2, c.z2 + 250, z));
  h = mix(h, 1.2, Math.max(0, cw));
  // base secrète : cuvette aplanie dans les montagnes
  const b = ZONES.base;
  const db = Math.hypot(x - b.x, z - b.z);
  h = mix(h, b.h, 1 - smooth(b.r, b.r * 2.2, db));
  // vallée nocturne : clairière douce
  const n = ZONES.night;
  const dn = Math.hypot(x - n.x, z - n.z);
  h = mix(h, 6 + fbm(x * 0.01, z * 0.01) * 6, 1 - smooth(n.r * 0.6, n.r * 1.4, dn));
  // pays de Zuria : grande île de savane au milieu de l'océan, plateau pour son palais
  const zu = ZONES.zuria;
  const dz = Math.hypot(x - zu.x, z - zu.z);
  const island = 1 - smooth(zu.r * 0.65, zu.r, dz);
  if (island > 0) h = mix(h, 5 + fbm(x * 0.004 + 40, z * 0.004 - 7) * 40, island);
  h = mix(h, 4, 1 - smooth(170, 280, dz));
  // Nouvelle Métropole : plaine
  const mt = ZONES.metro;
  const mtw = Math.min(smooth(mt.x1 - 200, mt.x1, x), 1 - smooth(mt.x2, mt.x2 + 200, x), smooth(mt.z1 - 200, mt.z1, z), 1 - smooth(mt.z2, mt.z2 + 200, z));
  if (mtw > 0) h = mix(h, 1.2, mtw);
  // plateau du palais
  const dp = Math.hypot(x, z);
  h = mix(h, -0.12, 1 - smooth(ZONES.palace.r, ZONES.palace.r + 260, dp));
  // GRAND MONDE : au-delà du royaume, l'océan et les continents des autres pays
  const dd = Math.max(Math.abs(x), Math.abs(z));
  if (dd > 3300) h = mix(h, worldHeight(x, z), smooth(3300, 4700, dd));
  // aéroports : grande plaine parfaitement plate
  for (const a of AIRPORTS) {
    const r = airportRect(a);
    const w = Math.min(smooth(r.x1 - 300, r.x1, x), 1 - smooth(r.x2, r.x2 + 300, x), smooth(r.z1 - 300, r.z1, z), 1 - smooth(r.z2, r.z2 + 300, z));
    if (w > 0) h = mix(h, a.h, w);
  }
  return h;
}

/** Relief du grand monde : océan profond + un continent par pays (capitale sur un plateau). */
export function worldHeight(x: number, z: number) {
  let w = -70 + fbm(x * 0.0006 + 5, z * 0.0006 - 3) * 40;
  for (const c of COUNTRIES) {
    const dc = Math.hypot(x - c.x, z - c.z);
    if (dc > c.r * 1.3) continue;
    const edge = dc + (fbm(x * 0.0011 + c.x * 0.001, z * 0.0011 + c.z * 0.001) - 0.5) * c.r * 0.4;
    const land = 1 - smooth(c.r * 0.72, c.r, edge);
    if (land <= 0) continue;
    let lh = c.base + 2 + fbm(x * 0.0025 + 11, z * 0.0025 - 4) * c.hills;
    if (c.style === "snow") lh += ridged(x * 0.0013 + 4, z * 0.0013) * 520 * smooth(c.r * 0.3, c.r * 0.62, dc);
    if (c.style === "volcano") {
      const dv = Math.hypot(x - (c.x + c.r * 0.42), z - (c.z + c.r * 0.18));
      lh += Math.max(0, 640 * (1 - dv / 950)) - Math.max(0, 160 * (1 - dv / 140));
    }
    if (c.style === "forest" || c.style === "jade" || c.style === "redhills") lh += ridged(x * 0.002, z * 0.002 + 7) * c.hills * smooth(c.r * 0.4, c.r * 0.7, dc);
    lh = mix(lh, c.base, 1 - smooth(c.r * 0.3, c.r * 0.44, dc)); // plateau de la capitale
    w = mix(w, lh, land);
  }
  // Montagne Royale : falaises abruptes et plateau sommital parfaitement plat (Palais Impérial)
  const M = MOUNTAIN;
  const dm = Math.hypot(x - M.x, z - M.z);
  if (dm < M.r * 1.25) {
    const edge = dm + (fbm(x * 0.002 + 9, z * 0.002 - 3) - 0.5) * 260;
    const land = 1 - smooth(M.r * 0.86, M.r, edge);
    const slope = 1 - smooth(M.plateau + 40, M.r * 0.9, edge);
    let mh = 20 + Math.pow(slope, 0.55) * (M.top - 20) + ridged(x * 0.003, z * 0.003 + 5) * 120 * slope * (1 - slope) * 4;
    if (dm < M.plateau + 40) mh = M.top;
    w = mix(w, mh, land);
  }
  return w;
}

export class Terrain {
  heights = new Float32Array((RES + 1) * (RES + 1));
  /** grille grossière du grand monde (le cœur y est masqué, sous le maillage détaillé) */
  outer = new Float32Array((ORES + 1) * (ORES + 1));
  outerMesh!: THREE.Mesh;
  mesh!: THREE.Mesh;
  water!: THREE.Mesh;
  waterMat!: THREE.MeshStandardMaterial;
  private normalTex!: THREE.CanvasTexture;

  /** Génération par tranches pour ne pas bloquer l'affichage. */
  async build(scene: THREE.Scene, onProgress: (p: number) => void) {
    const step = WORLD / RES;
    for (let j = 0; j <= RES; j++) {
      for (let i = 0; i <= RES; i++) this.heights[j * (RES + 1) + i] = rawHeight(-WORLD / 2 + i * step, -WORLD / 2 + j * step);
      if (j % 40 === 0) {
        onProgress(j / RES);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    const geo = new THREE.PlaneGeometry(WORLD, WORLD, RES, RES);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const col = new THREE.Color();
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k),
        z = pos.getZ(k);
      const i = Math.round((x + WORLD / 2) / step),
        j = Math.round((z + WORLD / 2) / step);
      const h = this.heights[j * (RES + 1) + i];
      pos.setY(k, h);
      this.colorAt(x, z, h, col);
      colors.set([col.r, col.g, col.b], k * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    this.mesh = new THREE.Mesh(geo, m);
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);

    // grand monde : continents et océan autour du royaume (maille de 100 m)
    const ostep = EARTH / ORES;
    const half = WORLD / 2;
    for (let j = 0; j <= ORES; j++) {
      for (let i = 0; i <= ORES; i++) {
        const x = -EARTH / 2 + i * ostep,
          z = -EARTH / 2 + j * ostep;
        this.outer[j * (ORES + 1) + i] = Math.abs(x) < half - 1 && Math.abs(z) < half - 1 ? -400 : rawHeight(x, z);
      }
      if (j % 80 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    const og = new THREE.PlaneGeometry(EARTH, EARTH, ORES, ORES);
    og.rotateX(-Math.PI / 2);
    const op = og.attributes.position as THREE.BufferAttribute;
    const ocol = new Float32Array(op.count * 3);
    for (let k = 0; k < op.count; k++) {
      const x = op.getX(k),
        z = op.getZ(k);
      const i = Math.round((x + EARTH / 2) / ostep),
        j = Math.round((z + EARTH / 2) / ostep);
      const h = this.outer[j * (ORES + 1) + i];
      op.setY(k, h);
      this.colorAt(x, z, h, col);
      ocol.set([col.r, col.g, col.b], k * 3);
    }
    og.setAttribute("color", new THREE.BufferAttribute(ocol, 3));
    og.computeVertexNormals();
    this.outerMesh = new THREE.Mesh(og, m);
    this.outerMesh.receiveShadow = true;
    scene.add(this.outerMesh);

    // océan : normal map animée
    const cv = document.createElement("canvas");
    cv.width = cv.height = 256;
    const c = cv.getContext("2d")!;
    const img = c.createImageData(256, 256);
    for (let y = 0; y < 256; y++)
      for (let x = 0; x < 256; x++) {
        const nx = Math.sin((x / 256) * Math.PI * 8 + Math.sin((y / 256) * Math.PI * 4) * 2) * 0.5;
        const ny = Math.cos((y / 256) * Math.PI * 6 + Math.cos((x / 256) * Math.PI * 4) * 2) * 0.5;
        const o = (y * 256 + x) * 4;
        img.data[o] = 128 + nx * 90;
        img.data[o + 1] = 128 + ny * 90;
        img.data[o + 2] = 255;
        img.data[o + 3] = 255;
      }
    c.putImageData(img, 0, 0);
    this.normalTex = new THREE.CanvasTexture(cv);
    this.normalTex.wrapS = this.normalTex.wrapT = THREE.RepeatWrapping;
    this.normalTex.repeat.set(1500, 1500);
    this.waterMat = new THREE.MeshStandardMaterial({
      color: 0x0d4f8a,
      roughness: 0.08,
      metalness: 0.2,
      normalMap: this.normalTex,
      normalScale: new THREE.Vector2(0.35, 0.35),
      transparent: true,
      opacity: 0.92
    });
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(EARTH * 1.5, EARTH * 1.5), this.waterMat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = SEA;
    scene.add(this.water);
  }

  colorAt(x: number, z: number, h: number, out: THREE.Color) {
    if (Math.max(Math.abs(x), Math.abs(z)) > WORLD / 2 - 600) {
      const k = countryAt(x, z, 1.3);
      if (onMountain(x, z, 1.2) && h > SEA + 1.5) {
        const n = fbm(x * 0.005, z * 0.005);
        if (h >= MOUNTAIN.top - 1) out.setRGB(0.3 + n * 0.1, 0.5 + n * 0.12, 0.24); // pelouses du plateau
        else if (h > 420) out.setRGB(0.92, 0.93, 0.96);
        else if (h > 120) out.setRGB(0.42 + n * 0.1, 0.4 + n * 0.1, 0.4 + n * 0.1);
        else out.setRGB(0.25, 0.42, 0.2);
        return;
      }
      if (h < SEA + 1.5) out.setRGB(0.78, 0.72, 0.54);
      else if (k) {
        const n = fbm(x * 0.004, z * 0.004);
        out.setRGB(k.ground[0] * (0.8 + n * 0.4), k.ground[1] * (0.8 + n * 0.4), k.ground[2] * (0.8 + n * 0.4));
        if (h > 380 && k.style !== "volcano") out.setRGB(0.95, 0.96, 1);
        else if (k.style === "volcano" && h > 300) out.setRGB(0.1, 0.08, 0.08);
      } else if (h > 300) out.setRGB(0.5, 0.5, 0.52);
      else out.setRGB(0.3, 0.45, 0.22);
      if (Math.max(Math.abs(x), Math.abs(z)) > WORLD / 2) return;
    }
    const c = ZONES.city;
    const mt = ZONES.metro;
    const inCity = (x > c.x1 - 60 && x < c.x2 + 60 && z > c.z1 - 60 && z < c.z2 + 60) || (x > mt.x1 - 40 && x < mt.x2 + 40 && z > mt.z1 - 40 && z < mt.z2 + 40);
    if (h < SEA + 1.5) out.setRGB(0.76, 0.7, 0.52); // sable
    else if (Math.hypot(x - ZONES.zuria.x, z - ZONES.zuria.z) < ZONES.zuria.r) out.setRGB(0.42 + fbm(x * 0.01, z * 0.01) * 0.12, 0.36 + fbm(x * 0.013, z * 0.01) * 0.14, 0.16); // savane ocre et herbe sèche
    else if (inCity) out.setRGB(0.12, 0.13, 0.16);
    else if (h > 520) out.setRGB(0.95, 0.96, 1); // neige
    else if (h > 260) out.setRGB(0.42, 0.42, 0.44); // roche
    else if (z < -450) out.setRGB(0.09 + fbm(x * 0.02, z * 0.02) * 0.08, 0.3 + fbm(x * 0.01, z * 0.01) * 0.12, 0.1); // jungle
    else if (Math.hypot(x - ZONES.night.x, z - ZONES.night.z) < ZONES.night.r * 1.2) out.setRGB(0.05, 0.12, 0.18);
    else out.setRGB(0.22 + fbm(x * 0.01, z * 0.01) * 0.1, 0.42 + fbm(x * 0.012 + 3, z * 0.012) * 0.12, 0.18);
    if (h > 200 && h <= 260) out.lerp(new THREE.Color(0.42, 0.42, 0.44), (h - 200) / 60);
    if (Math.hypot(x, z) < 290 && !inCity) out.setRGB(0.24, 0.46, 0.2);
  }

  /** Hauteur interpolée cohérente avec le maillage. */
  height = (x: number, z: number) => {
    const step = WORLD / RES;
    const fx = (x + WORLD / 2) / step,
      fz = (z + WORLD / 2) / step;
    if (fx < 0 || fz < 0 || fx >= RES || fz >= RES) return this.outerHeight(x, z);
    const i = Math.floor(fx),
      j = Math.floor(fz);
    const tx = fx - i,
      tz = fz - j;
    const H = this.heights,
      W = RES + 1;
    const a = H[j * W + i],
      b = H[j * W + i + 1],
      c = H[(j + 1) * W + i],
      d = H[(j + 1) * W + i + 1];
    // même triangulation que PlaneGeometry (a, c, b) / (c, d, b)
    if (tx + tz <= 1) return a + (b - a) * tx + (c - a) * tz;
    return d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
  };

  /** Hauteur du grand monde (même triangulation que le maillage grossier). */
  outerHeight(x: number, z: number) {
    const step = EARTH / ORES;
    const fx = (x + EARTH / 2) / step,
      fz = (z + EARTH / 2) / step;
    if (fx < 0 || fz < 0 || fx >= ORES || fz >= ORES) return -80;
    const i = Math.floor(fx),
      j = Math.floor(fz);
    const tx = fx - i,
      tz = fz - j;
    const H = this.outer,
      W = ORES + 1;
    const a = H[j * W + i],
      b = H[j * W + i + 1],
      c = H[(j + 1) * W + i],
      d = H[(j + 1) * W + i + 1];
    if (tx + tz <= 1) return a + (b - a) * tx + (c - a) * tz;
    return d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
  }

  update(t: number) {
    if (this.normalTex) {
      this.normalTex.offset.set(t * 0.002, t * 0.0013);
    }
  }
}
