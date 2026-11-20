// Terrain procédural : plateau du palais, ville (est), jungle (sud), montagnes (nord), océan (ouest).
import * as THREE from "three";

export const WORLD = 8000; // côté de la carte en mètres
export const SEA = -2;
const RES = 320; // segments de la grille

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
  city: { x1: 950, x2: 2300, z1: -850, z2: 850 },
  base: { x: 650, z: 1900, r: 160, h: 140 },
  night: { x: -650, z: -1300, r: 260 },
  /** le pays voisin, de l'autre côté de l'océan */
  zuria: { x: -2900, z: 300, r: 850 }
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
  // plateau du palais
  const dp = Math.hypot(x, z);
  h = mix(h, -0.12, 1 - smooth(ZONES.palace.r, ZONES.palace.r + 260, dp));
  return h;
}

export class Terrain {
  heights = new Float32Array((RES + 1) * (RES + 1));
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
    this.normalTex.repeat.set(300, 300);
    this.waterMat = new THREE.MeshStandardMaterial({
      color: 0x0d4f8a,
      roughness: 0.08,
      metalness: 0.2,
      normalMap: this.normalTex,
      normalScale: new THREE.Vector2(0.35, 0.35),
      transparent: true,
      opacity: 0.92
    });
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(WORLD * 3, WORLD * 3), this.waterMat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = SEA;
    scene.add(this.water);
  }

  colorAt(x: number, z: number, h: number, out: THREE.Color) {
    const c = ZONES.city;
    const inCity = x > c.x1 - 60 && x < c.x2 + 60 && z > c.z1 - 60 && z < c.z2 + 60;
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
    if (fx < 0 || fz < 0 || fx >= RES || fz >= RES) return -60;
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

  update(t: number) {
    if (this.normalTex) {
      this.normalTex.offset.set(t * 0.002, t * 0.0013);
    }
  }
}
