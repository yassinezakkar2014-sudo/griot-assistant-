// Cartes PBR procédurales (relief + rugosité) : donnent du grain réaliste aux matériaux
// sans aucun fichier à télécharger. Calculées une fois au chargement.
import * as THREE from "three";

type HeightFn = (x: number, y: number, s: number) => number; // 0..1

function hash(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x: number, y: number, p: number) {
  const xi = Math.floor(x),
    yi = Math.floor(y);
  const xf = x - xi,
    yf = y - yi;
  const u = xf * xf * (3 - 2 * xf),
    v = yf * yf * (3 - 2 * yf);
  const w = (a: number) => ((a % p) + p) % p; // pavable
  const a = hash(w(xi), w(yi)),
    b = hash(w(xi + 1), w(yi)),
    c = hash(w(xi), w(yi + 1)),
    d = hash(w(xi + 1), w(yi + 1));
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbmTile(x: number, y: number, s: number, base = 8, oct = 4) {
  let sum = 0,
    amp = 0.5,
    f = base;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise((x / s) * f, (y / s) * f, f);
    f *= 2;
    amp *= 0.5;
  }
  return sum;
}

function bake(size: number, height: HeightFn, strength: number, rough: (h: number, x: number, y: number) => number) {
  const H = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) H[y * size + x] = height(x, y, size);
  const nc = document.createElement("canvas"),
    rc = document.createElement("canvas");
  nc.width = nc.height = rc.width = rc.height = size;
  const n = nc.getContext("2d")!.createImageData(size, size);
  const r = rc.getContext("2d")!.createImageData(size, size);
  const at = (x: number, y: number) => H[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const o = (y * size + x) * 4;
      n.data[o] = (-dx / l) * 127 + 128;
      n.data[o + 1] = (dy / l) * 127 + 128;
      n.data[o + 2] = (1 / l) * 127 + 128;
      n.data[o + 3] = 255;
      const rv = Math.max(0, Math.min(1, rough(H[y * size + x], x, y))) * 255;
      r.data[o] = r.data[o + 1] = r.data[o + 2] = rv;
      r.data[o + 3] = 255;
    }
  nc.getContext("2d")!.putImageData(n, 0, 0);
  rc.getContext("2d")!.putImageData(r, 0, 0);
  const mk = (c: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  };
  return { normal: mk(nc), rough: mk(rc) };
}

const cache = new Map<string, { normal: THREE.Texture; rough: THREE.Texture }>();
function get(key: string, make: () => { normal: THREE.Texture; rough: THREE.Texture }) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key)!;
}

/** Marbre poli : veines légèrement en creux, rugosité variable. */
export const marblePBR = () =>
  get("marble", () =>
    bake(256, (x, y, s) => {
      const v = Math.abs(Math.sin((x / s) * 6.283 * 2 + fbmTile(x, y, s, 4, 5) * 9));
      return 1 - Math.pow(1 - v, 6) * 0.6 + fbmTile(x, y, s, 32, 2) * 0.05;
    }, 2.2, (h) => 0.12 + (1 - h) * 0.3)
  );

/** Dalles : joints creusés, polissage irrégulier. */
export const tilePBR = () =>
  get("tile", () =>
    bake(256, (x, y, s) => {
      const gx = Math.min(x, s - 1 - x),
        gy = Math.min(y, s - 1 - y);
      const joint = Math.min(gx, gy) < 3 ? 0 : 1;
      return joint * (0.95 + fbmTile(x, y, s, 16, 3) * 0.05);
    }, 4, (h, x, y) => (h < 0.5 ? 0.7 : 0.08 + fbmTile(x, y, 256, 6, 3) * 0.18))
  );

/** Béton ciré (garage) : micro-relief, reflets doux. */
export const concretePBR = () =>
  get("concrete", () => bake(256, (x, y, s) => fbmTile(x, y, s, 48, 3), 1.2, (h) => 0.22 + h * 0.2));

/** Métal brossé : stries horizontales fines. */
export const brushedPBR = () =>
  get("brushed", () => bake(256, (x, y, s) => vnoise((x / s) * 4, (y / s) * 180, 4) * 0.6 + vnoise((x / s) * 64, (y / s) * 256, 64) * 0.4, 1.2, (h) => 0.18 + h * 0.18));

/** Panneaux techniques (hangar, cockpit) : plaques, rivets. */
export const panelPBR = () =>
  get("panel", () =>
    bake(256, (x, y, s) => {
      const px = x % 128,
        py = y % 64;
      const seam = px < 2 || py < 2 ? 0 : 1;
      const rivet = (Math.hypot(px - 8, py - 8) < 3 || Math.hypot(px - 120, py - 8) < 3) ? 1.3 : 1;
      return seam * rivet * (0.97 + fbmTile(x, y, s, 24, 2) * 0.03);
    }, 3, (h) => (h < 0.5 ? 0.8 : 0.32))
  );

/** Cuir (sièges) : grain organique. */
export const leatherPBR = () => get("leather", () => bake(128, (x, y, s) => Math.pow(fbmTile(x, y, s, 24, 3), 1.5), 3, (h) => 0.45 + h * 0.3));

/** Applique relief + rugosité à un matériau standard existant. */
export function applyPBR(m: THREE.MeshStandardMaterial, maps: { normal: THREE.Texture; rough: THREE.Texture }, normalScale = 0.6, repeat?: number) {
  const n = repeat ? maps.normal.clone() : maps.normal;
  const r = repeat ? maps.rough.clone() : maps.rough;
  if (repeat) {
    n.repeat.set(repeat, repeat);
    r.repeat.set(repeat, repeat);
    n.needsUpdate = r.needsUpdate = true;
  }
  m.normalMap = n;
  m.normalScale.set(normalScale, normalScale);
  m.roughnessMap = r;
  m.roughness = 1;
  m.needsUpdate = true;
  return m;
}
