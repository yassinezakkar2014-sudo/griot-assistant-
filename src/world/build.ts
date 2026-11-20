// Outils de construction : boîtes avec UV à l'échelle du monde + colliders automatiques.
import * as THREE from "three";
import { G } from "../core";
import { mat } from "./materials";

export const TILE = 4; // mètres par répétition de texture

/** Recalcule les UV d'une BoxGeometry pour que la texture garde une taille constante en mètres. */
export function worldUV(geo: THREE.BufferGeometry, w: number, h: number, d: number, tile = TILE) {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const dims: [number, number][] = [
    [d, h], [d, h], // ±x
    [w, d], [w, d], // ±y
    [w, h], [w, h] // ±z
  ];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = dims[f];
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * su) / tile, (uv.getY(i) * sv) / tile);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

export interface BoxOpts {
  solid?: boolean;
  shadow?: boolean;
  tag?: string;
  uv?: boolean;
}

/** Boîte centrée en (x, y, z) — y est le CENTRE. */
export function box(parent: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, o: BoxOpts = {}) {
  const geo = new THREE.BoxGeometry(w, h, d);
  if (o.uv !== false) worldUV(geo, w, h, d);
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  if (o.shadow !== false) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  parent.add(mesh);
  if (o.solid !== false) G.physics.addBox({ x: x - w / 2, y: y - h / 2, z: z - d / 2 }, { x: x + w / 2, y: y + h / 2, z: z + d / 2 }, o.tag);
  return mesh;
}

/** Boîte posée au sol : y = bas de la boîte. */
export function block(parent: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, o: BoxOpts = {}) {
  return box(parent, w, h, d, m, x, y + h / 2, z, o);
}

/** Boîte définie par ses bornes. */
export function span(parent: THREE.Object3D, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, m: THREE.Material, o: BoxOpts = {}) {
  return box(parent, Math.abs(x2 - x1), Math.abs(y2 - y1), Math.abs(z2 - z1), m, (x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2, o);
}

export function cyl(parent: THREE.Object3D, r: number, h: number, m: THREE.Material, x: number, y: number, z: number, o: BoxOpts & { seg?: number; r2?: number } = {}) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(o.r2 ?? r, r, h, o.seg ?? 32), m);
  mesh.position.set(x, y + h / 2, z);
  if (o.shadow !== false) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  parent.add(mesh);
  if (o.solid !== false) {
    const rr = Math.max(r, o.r2 ?? r) * 0.88;
    G.physics.addBox({ x: x - rr, y, z: z - rr }, { x: x + rr, y: y + h, z: z + rr }, o.tag);
  }
  return mesh;
}

export interface Gap {
  c: number; // centre le long du mur
  w: number;
  h: number;
}

/** Mur le long de X (à z constant) avec ouvertures. */
export function wallX(parent: THREE.Object3D, z: number, x1: number, x2: number, y0: number, h: number, m: THREE.Material, gaps: Gap[] = [], t = 0.6) {
  let cur = x1;
  for (const g of [...gaps].sort((a, b) => a.c - b.c)) {
    const a = g.c - g.w / 2,
      b = g.c + g.w / 2;
    if (a > cur) span(parent, cur, y0, z - t / 2, a, y0 + h, z + t / 2, m);
    if (g.h < h) span(parent, a, y0 + g.h, z - t / 2, b, y0 + h, z + t / 2, m);
    cur = b;
  }
  if (x2 > cur) span(parent, cur, y0, z - t / 2, x2, y0 + h, z + t / 2, m);
}

/** Mur le long de Z (à x constant) avec ouvertures. */
export function wallZ(parent: THREE.Object3D, x: number, z1: number, z2: number, y0: number, h: number, m: THREE.Material, gaps: Gap[] = [], t = 0.6) {
  let cur = z1;
  for (const g of [...gaps].sort((a, b) => a.c - b.c)) {
    const a = g.c - g.w / 2,
      b = g.c + g.w / 2;
    if (a > cur) span(parent, x - t / 2, y0, cur, x + t / 2, y0 + h, a, m);
    if (g.h < h) span(parent, x - t / 2, y0 + g.h, a, x + t / 2, y0 + h, b, m);
    cur = b;
  }
  if (z2 > cur) span(parent, x - t / 2, y0, cur, x + t / 2, y0 + h, z2, m);
}

/** Façade vitrée panoramique : piliers de marbre + vitres + linteau doré. axis 'x' = mur à z constant. */
export function glassWall(parent: THREE.Object3D, axis: "x" | "z", at: number, from: number, to: number, y0: number, h: number, gaps: Gap[] = [], pillarEvery = 8) {
  const pillar = 1.1;
  const segs: [number, number][] = [];
  let cur = from;
  for (const g of [...gaps].sort((a, b) => a.c - b.c)) {
    segs.push([cur, g.c - g.w / 2]);
    // linteau au-dessus de la porte
    if (axis === "x") span(parent, g.c - g.w / 2, y0 + g.h, at - 0.1, g.c + g.w / 2, y0 + h, at + 0.1, mat.glass, { shadow: false });
    else span(parent, at - 0.1, y0 + g.h, g.c - g.w / 2, at + 0.1, y0 + h, g.c + g.w / 2, mat.glass, { shadow: false });
    cur = g.c + g.w / 2;
  }
  segs.push([cur, to]);
  for (const [a, b] of segs) {
    if (b - a < 0.2) continue;
    const n = Math.max(1, Math.round((b - a) / pillarEvery));
    for (let i = 0; i <= n; i++) {
      const p = a + ((b - a) * i) / n;
      const c = Math.min(Math.max(p, a + pillar / 2), b - pillar / 2);
      if (axis === "x") box(parent, pillar, h, 0.9, mat.marble, c, y0 + h / 2, at);
      else box(parent, 0.9, h, pillar, mat.marble, at, y0 + h / 2, c);
    }
    if (axis === "x") {
      span(parent, a, y0, at - 0.05, b, y0 + h, at + 0.05, mat.glass, { shadow: false, uv: false });
      span(parent, a, y0 + h - 0.35, at - 0.5, b, y0 + h, at + 0.5, mat.gold, { solid: false });
    } else {
      span(parent, at - 0.05, y0, a, at + 0.05, y0 + h, b, mat.glass, { shadow: false, uv: false });
      span(parent, at - 0.5, y0 + h - 0.35, a, at + 0.5, y0 + h, b, mat.gold, { solid: false });
    }
  }
}

/** Ligne lumineuse décorative (sans collision). */
export function glowLine(parent: THREE.Object3D, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, m: THREE.Material = mat.glowBlue, thick = 0.06) {
  return span(parent, x1, y1, z1, x2 === x1 ? x1 + thick : x2, y2 === y1 ? y1 + thick : y2, z2 === z1 ? z1 + thick : z2, m, { solid: false, shadow: false, uv: false });
}

export function plane(parent: THREE.Object3D, w: number, h: number, m: THREE.Material, x: number, y: number, z: number, ry = 0, rx = 0) {
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  p.position.set(x, y, z);
  p.rotation.set(rx, ry, 0, "YXZ");
  parent.add(p);
  return p;
}

/** Emblème royal original (couronne géométrique + GRIOT). */
export function emblemTexture(text = "GRIOT") {
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 768;
  const c = cv.getContext("2d")!;
  const grd = c.createLinearGradient(0, 0, 0, 768);
  grd.addColorStop(0, "#0a1630");
  grd.addColorStop(1, "#050812");
  c.fillStyle = grd;
  c.fillRect(0, 0, 256, 768);
  c.strokeStyle = "#d8b25a";
  c.lineWidth = 6;
  c.strokeRect(10, 10, 236, 748);
  c.fillStyle = "#d8b25a";
  c.beginPath();
  c.moveTo(48, 300);
  c.lineTo(48, 200);
  c.lineTo(88, 250);
  c.lineTo(128, 160);
  c.lineTo(168, 250);
  c.lineTo(208, 200);
  c.lineTo(208, 300);
  c.closePath();
  c.fill();
  c.fillStyle = "#3fc8ff";
  c.beginPath();
  c.arc(128, 400, 44, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#0a1630";
  c.beginPath();
  c.arc(128, 400, 28, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#e9f6ff";
  c.font = "bold 40px Orbitron, Arial";
  c.textAlign = "center";
  c.fillText(text, 128, 540);
  c.fillStyle = "#3fc8ff";
  c.font = "18px Orbitron, Arial";
  c.fillText("THINK · SPEAK · RULE", 128, 590);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
