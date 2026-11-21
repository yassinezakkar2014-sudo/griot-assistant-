// Physique légère : tout le monde solide est fait de boîtes alignées (AABB).
// Le sol = plus haut sommet de boîte sous le joueur (avec marche autorisée) ou le terrain.
import * as THREE from "three";

export interface Body {
  box: THREE.Box3;
  enabled: boolean;
  /** Objet suivi : la boîte est recalculée chaque frame (portes, ascenseur). */
  follow?: THREE.Object3D;
  /** Boîte locale de l'objet suivi (géométrie). */
  local?: THREE.Box3;
  tag?: string;
  /** déplacement vertical depuis la frame précédente (plates-formes mobiles) */
  dy: number;
  dx: number;
  dz: number;
  /** marque de requête (déduplication dans la grille) */
  q?: number;
}

const CELL = 64;
const ck = (ix: number, iz: number) => (ix + 4096) * 8192 + (iz + 4096);

export type HeightFn = (x: number, z: number) => number;

const tmp = new THREE.Box3();

export class Physics {
  bodies: Body[] = [];
  dynamic: Body[] = [];
  terrain: HeightFn = () => 0;
  waterLevel = -1e9;
  /** surfaces praticables hors boîtes (routes en viaduc) : hauteur ou -Infinity */
  surfaces: ((x: number, z: number) => number)[] = [];

  /** grille spatiale des boîtes statiques (des milliers de bâtiments sans ralentir) */
  private grid = new Map<number, Body[]>();
  /** boîtes mobiles ou immenses : toujours testées */
  private always: Body[] = [];
  private qid = 0;
  private cand: Body[] = [];

  private index(b: Body) {
    if (b.follow || b.tag === "car") {
      this.always.push(b);
      return;
    }
    const x0 = Math.floor(b.box.min.x / CELL),
      x1 = Math.floor(b.box.max.x / CELL),
      z0 = Math.floor(b.box.min.z / CELL),
      z1 = Math.floor(b.box.max.z / CELL);
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 400) {
      this.always.push(b);
      return;
    }
    for (let ix = x0; ix <= x1; ix++)
      for (let iz = z0; iz <= z1; iz++) {
        const k = ck(ix, iz);
        let l = this.grid.get(k);
        if (!l) this.grid.set(k, (l = []));
        l.push(b);
      }
  }

  /** Boîtes susceptibles de toucher le rectangle XZ donné. */
  near(xa: number, za: number, xb: number, zb: number): Body[] {
    const out = this.cand;
    out.length = 0;
    const q = ++this.qid;
    for (const b of this.always) {
      b.q = q;
      out.push(b);
    }
    const x0 = Math.floor(xa / CELL),
      x1 = Math.floor(xb / CELL),
      z0 = Math.floor(za / CELL),
      z1 = Math.floor(zb / CELL);
    for (let ix = x0; ix <= x1; ix++)
      for (let iz = z0; iz <= z1; iz++) {
        const l = this.grid.get(ck(ix, iz));
        if (l)
          for (const b of l)
            if (b.q !== q) {
              b.q = q;
              out.push(b);
            }
      }
    return out;
  }

  addBox(min: THREE.Vector3Like, max: THREE.Vector3Like, tag?: string): Body {
    const b: Body = { box: new THREE.Box3(new THREE.Vector3().copy(min), new THREE.Vector3().copy(max)), enabled: true, tag, dx: 0, dy: 0, dz: 0 };
    this.bodies.push(b);
    this.index(b);
    return b;
  }

  /** Collider à partir de la boîte englobante monde d'un mesh statique. */
  addMesh(obj: THREE.Object3D, tag?: string): Body {
    obj.updateWorldMatrix(true, true);
    const b: Body = { box: new THREE.Box3().setFromObject(obj), enabled: true, tag, dx: 0, dy: 0, dz: 0 };
    this.bodies.push(b);
    this.index(b);
    return b;
  }

  /** Collider qui suit un objet mobile. */
  addDynamic(obj: THREE.Object3D, tag?: string): Body {
    obj.updateWorldMatrix(true, true);
    const b: Body = { box: new THREE.Box3().setFromObject(obj), enabled: true, follow: obj, tag, dx: 0, dy: 0, dz: 0 };
    this.bodies.push(b);
    this.dynamic.push(b);
    this.index(b);
    return b;
  }

  update() {
    for (const b of this.dynamic) {
      const prev = tmp.copy(b.box);
      b.follow!.updateWorldMatrix(true, true);
      b.box.setFromObject(b.follow!);
      b.dy = b.box.max.y - prev.max.y;
      b.dx = (b.box.min.x + b.box.max.x - prev.min.x - prev.max.x) / 2;
      b.dz = (b.box.min.z + b.box.max.z - prev.min.z - prev.max.z) / 2;
    }
  }

  /** Hauteur du sol sous (x,z) pour des pieds à feetY (marche max = step). */
  ground(x: number, feetY: number, z: number, step = 0.55, radius = 0): { y: number; body: Body | null } {
    let y = this.terrain(x, z);
    if (y < this.waterLevel - 1.1) y = this.waterLevel - 1.1;
    let body: Body | null = null;
    for (const f of this.surfaces) {
      const h = f(x, z);
      if (h <= feetY + step && h > y) y = h;
    }
    const r3 = radius * 0.3;
    for (const b of this.near(x - r3, z - r3, x + r3, z + r3)) {
      if (!b.enabled) continue;
      const bx = b.box;
      if (x < bx.min.x - radius * 0.3 || x > bx.max.x + radius * 0.3 || z < bx.min.z - radius * 0.3 || z > bx.max.z + radius * 0.3) continue;
      const top = bx.max.y;
      if (top <= feetY + step && top > y) {
        y = top;
        body = b;
      }
    }
    return { y, body };
  }

  /** Repousse un cylindre (pieds -> pieds+height) hors des boîtes, dans le plan XZ. */
  resolve(pos: THREE.Vector3, radius: number, height: number, step = 0.55): boolean {
    let hit = false;
    const list = this.near(pos.x - radius - 1, pos.z - radius - 1, pos.x + radius + 1, pos.z + radius + 1).slice();
    for (let iter = 0; iter < 2; iter++) {
      for (const b of list) {
        if (!b.enabled) continue;
        const bx = b.box;
        if (bx.max.y <= pos.y + step || bx.min.y >= pos.y + height) continue;
        const cx = clampN(pos.x, bx.min.x, bx.max.x);
        const cz = clampN(pos.z, bx.min.z, bx.max.z);
        const dx = pos.x - cx;
        const dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        hit = true;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * radius;
          pos.z = cz + (dz / d) * radius;
        } else {
          // centre à l'intérieur de la boîte : sortir par l'axe le plus court
          const pen = [pos.x - bx.min.x, bx.max.x - pos.x, pos.z - bx.min.z, bx.max.z - pos.z];
          const i = pen.indexOf(Math.min(...pen));
          if (i === 0) pos.x = bx.min.x - radius;
          else if (i === 1) pos.x = bx.max.x + radius;
          else if (i === 2) pos.z = bx.min.z - radius;
          else pos.z = bx.max.z + radius;
        }
      }
    }
    return hit;
  }

  /** Plafond au-dessus d'une position (pour stopper un saut). */
  ceiling(x: number, headY: number, z: number): number {
    let c = Infinity;
    for (const b of this.near(x, z, x, z)) {
      if (!b.enabled) continue;
      const bx = b.box;
      if (x < bx.min.x || x > bx.max.x || z < bx.min.z || z > bx.max.z) continue;
      if (bx.min.y >= headY - 0.3 && bx.min.y < c) c = bx.min.y;
    }
    return c;
  }

  /** Test de point dans un solide (vaisseau). */
  pointInSolid(p: THREE.Vector3, pad = 0): Body | null {
    for (const b of this.near(p.x - pad, p.z - pad, p.x + pad, p.z + pad)) {
      if (!b.enabled || b.tag === "ship") continue;
      const bx = b.box;
      if (p.x > bx.min.x - pad && p.x < bx.max.x + pad && p.y > bx.min.y - pad && p.y < bx.max.y + pad && p.z > bx.min.z - pad && p.z < bx.max.z + pad) return b;
    }
    return null;
  }
}

function clampN(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}
