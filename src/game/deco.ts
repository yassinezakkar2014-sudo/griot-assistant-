// L'ATELIER ROYAL — personnalisation du palais : thèmes de couleurs (marbre, sols, or, lumières)
// et meubles/objets à poser où l'on veut (canapé, trône, statue, fontaine, piano, aquarium…).
// Tout est sauvegardé sur l'appareil et partagé avec les joueurs connectés en multijoueur.
import * as THREE from "three";
import { G, bus } from "../core";
import { mat } from "../world/materials";
import type { Body } from "../engine/physics";

export const THEMES: Record<string, { name: string; marble: number; floor: number; gold: number; white: number; tint: number | null }> = {
  royal: { name: "Blanc royal (origine)", marble: 0xd9dbe2, floor: 0xcfd2da, gold: 0xd8b25a, white: 0xd8dce4, tint: null },
  imperial: { name: "Or impérial", marble: 0xf2dca0, floor: 0xe8c878, gold: 0xffd24a, white: 0xf4e4b8, tint: 0xffd08a },
  noir: { name: "Noir & or", marble: 0x2a2a30, floor: 0x18181c, gold: 0xe8c060, white: 0x3a3a42, tint: 0xffc070 },
  jade: { name: "Jade", marble: 0x8ac8a8, floor: 0x5a9a7a, gold: 0xd8b25a, white: 0xc8e8d8, tint: 0x9fffd0 },
  rose: { name: "Rose quartz", marble: 0xf0c8d4, floor: 0xe0a8bc, gold: 0xf0c8a0, white: 0xfae0e8, tint: 0xffb0d0 },
  glace: { name: "Palais de glace", marble: 0xd8ecff, floor: 0xb8d8f8, gold: 0xc8e8ff, white: 0xeef6ff, tint: 0x9fd8ff },
  rubis: { name: "Rubis royal", marble: 0x8a1f2a, floor: 0x5a1018, gold: 0xf0c050, white: 0xb8404a, tint: 0xff8a7a }
};

type Kind = "canape" | "trone" | "statue" | "fontaine" | "plante" | "lampe" | "piano" | "aquarium" | "bibliotheque" | "tele" | "tapis" | "colonne" | "arbre" | "drapeau" | "lit" | "table";
export const ITEMS: Record<Kind, { name: string; icon: string; size: [number, number, number] | null }> = {
  canape: { name: "Canapé", icon: "🛋️", size: [2.6, 0.9, 1] },
  trone: { name: "Trône", icon: "👑", size: [1.4, 2.6, 1.2] },
  statue: { name: "Statue dorée", icon: "🗿", size: [1.2, 4, 1.2] },
  fontaine: { name: "Fontaine", icon: "⛲", size: [4, 1, 4] },
  plante: { name: "Plante", icon: "🪴", size: null },
  lampe: { name: "Lampe", icon: "💡", size: null },
  piano: { name: "Piano à queue", icon: "🎹", size: [1.6, 1, 2.2] },
  aquarium: { name: "Aquarium", icon: "🐠", size: [3, 2, 1] },
  bibliotheque: { name: "Bibliothèque", icon: "📚", size: [2.4, 2.8, 0.6] },
  tele: { name: "Écran géant", icon: "📺", size: [3.6, 2.4, 0.4] },
  tapis: { name: "Tapis royal", icon: "🟥", size: null },
  colonne: { name: "Colonne", icon: "🏛️", size: [1, 5, 1] },
  arbre: { name: "Arbre", icon: "🌳", size: [1, 6, 1] },
  drapeau: { name: "Drapeau royal", icon: "🚩", size: null },
  lit: { name: "Lit royal", icon: "🛏️", size: [2.2, 0.8, 2.6] },
  table: { name: "Table de banquet", icon: "🍽️", size: [4, 0.9, 1.4] }
};

interface Item {
  id: number;
  kind: Kind;
  x: number;
  y: number;
  z: number;
  r: number;
  obj?: THREE.Object3D;
  body?: Body;
}

const KEY = "griot-deco";

export class Deco {
  theme = "royal";
  items: Item[] = [];
  /** horodatage de la dernière modification (le plus récent gagne en multijoueur) */
  version = 0;
  private next = 1;
  private fishes: THREE.Object3D[] = [];
  private waters: THREE.Mesh[] = [];

  build() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || "null");
      if (d) this.load(d, false);
    } catch {}
    G.palace.updaters.push((dt, t) => {
      for (const f of this.fishes) {
        f.position.x = Math.sin(t * 0.8 + f.userData.p) * 1.1;
        f.rotation.y = Math.cos(t * 0.8 + f.userData.p) > 0 ? 0 : Math.PI;
      }
      for (const w of this.waters) w.rotation.y += dt * 0.6;
    });
  }

  // ---------------------------------------------------------------- thèmes
  setTheme(id: string, silent = false) {
    const th = THEMES[id];
    if (!th) return false;
    this.theme = id;
    mat.marble.color.setHex(th.marble);
    mat.floor.color.setHex(th.floor);
    mat.gold.color.setHex(th.gold);
    mat.white.color.setHex(th.white);
    G.palace.tint = th.tint;
    if (!silent) {
      this.touch();
      bus.emit("toast", { text: `🎨 Thème du palais : ${th.name}` });
    }
    return true;
  }

  // ---------------------------------------------------------------- objets
  /** Pose un objet devant le joueur (ou à une position donnée). */
  place(kind: Kind, at?: { x: number; y: number; z: number; r: number }, silent = false) {
    if (!ITEMS[kind]) return null;
    let x: number, y: number, z: number, r: number;
    if (at) ({ x, y, z, r } = at);
    else {
      const p = G.player.position;
      const fx = -Math.sin(G.player.yaw),
        fz = -Math.cos(G.player.yaw);
      const d = kind === "fontaine" || kind === "table" ? 4.5 : 2.8;
      x = p.x + fx * d;
      z = p.z + fz * d;
      y = G.physics.ground(x, p.y + 1, z, 1.5).y;
      r = G.player.yaw + Math.PI;
    }
    const it: Item = { id: this.next++, kind, x, y, z, r };
    this.spawn(it);
    this.items.push(it);
    if (!silent) {
      this.touch();
      bus.emit("toast", { text: `${ITEMS[kind].icon} ${ITEMS[kind].name} posé. (« enlève l'objet » pour le retirer, « tourne l'objet » pour le pivoter)` });
      G.audio.confirm();
    }
    return it;
  }

  private nearest(max = 6) {
    const p = G.player.position;
    let best: Item | null = null,
      bd = max;
    for (const it of this.items) {
      const d = Math.hypot(it.x - p.x, it.z - p.z) + Math.abs(it.y - p.y) * 0.5;
      if (d < bd) {
        bd = d;
        best = it;
      }
    }
    return best;
  }

  removeNearest() {
    const it = this.nearest();
    if (!it) return false;
    this.despawn(it);
    this.items = this.items.filter((x) => x !== it);
    this.touch();
    bus.emit("toast", { text: `🗑️ ${ITEMS[it.kind].name} retiré.` });
    return true;
  }

  rotateNearest() {
    const it = this.nearest();
    if (!it) return false;
    it.r += Math.PI / 4;
    this.despawn(it);
    this.spawn(it);
    this.touch();
    return true;
  }

  clear() {
    this.items.forEach((it) => this.despawn(it));
    this.items = [];
    this.touch();
  }

  private despawn(it: Item) {
    if (it.obj) G.scene.remove(it.obj);
    if (it.body) it.body.enabled = false;
    this.fishes = this.fishes.filter((f) => f.parent?.parent !== it.obj && f.parent !== it.obj);
  }

  private spawn(it: Item) {
    const o = this.model(it.kind);
    o.position.set(it.x, it.y, it.z);
    o.rotation.y = it.r;
    o.traverse((m) => {
      if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).castShadow = true;
    });
    G.scene.add(o);
    it.obj = o;
    const s = ITEMS[it.kind].size;
    if (s) {
      const turned = Math.abs(Math.sin(it.r)) > 0.7;
      const hx = (turned ? s[2] : s[0]) / 2,
        hz = (turned ? s[0] : s[2]) / 2;
      it.body = G.physics.addBox({ x: it.x - hx, y: it.y, z: it.z - hz }, { x: it.x + hx, y: it.y + s[1], z: it.z + hz }, "deco");
    }
  }

  private model(kind: Kind): THREE.Group {
    const g = new THREE.Group();
    const B = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, y + h / 2, z);
      g.add(b);
      return b;
    };
    const C = (r: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, r2 = r, seg = 20) => {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, h, seg), m);
      c.position.set(x, y + h / 2, z);
      g.add(c);
      return c;
    };
    const velvet = new THREE.MeshStandardMaterial({ color: 0x5a1a7a, roughness: 0.85 });
    const leather = new THREE.MeshStandardMaterial({ color: 0x1a1b20, roughness: 0.5 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a2a18, roughness: 0.5 });
    const green = new THREE.MeshStandardMaterial({ color: 0x2f6a2a, roughness: 0.9, flatShading: true });
    switch (kind) {
      case "canape":
        B(2.6, 0.45, 1, velvet);
        B(2.6, 0.9, 0.25, velvet, 0, 0, -0.38);
        B(0.25, 0.7, 1, velvet, -1.18);
        B(0.25, 0.7, 1, velvet, 1.18);
        break;
      case "trone":
        B(1.4, 0.6, 1.2, mat.gold);
        B(1.2, 0.15, 1, velvet, 0, 0.6);
        B(1.4, 2.6, 0.2, mat.gold, 0, 0, -0.5);
        C(0.18, 0.3, mat.glowGold, 0, 2.6, -0.5);
        break;
      case "statue":
        C(0.6, 0.8, mat.marble, 0, 0, 0, 0.6, 8);
        C(0.3, 1.6, mat.gold, 0, 0.8, 0, 0.42);
        {
          const h = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), mat.gold);
          h.position.y = 2.7;
          g.add(h);
          const cr = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.25, 8, 1, true), mat.gold);
          cr.position.y = 3.05;
          g.add(cr);
          for (const sx of [-1, 1]) {
            const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 8), mat.gold);
            arm.position.set(sx * 0.45, 2.0, 0);
            arm.rotation.z = sx * 0.5;
            g.add(arm);
          }
        }
        break;
      case "fontaine": {
        C(2, 0.7, mat.marble, 0, 0, 0, 2, 32);
        const w = new THREE.Mesh(new THREE.CircleGeometry(1.8, 32), new THREE.MeshStandardMaterial({ color: 0x2a7fd0, roughness: 0.05, metalness: 0.3, emissive: 0x0a2a4a }));
        w.rotation.x = -Math.PI / 2;
        w.position.y = 0.66;
        g.add(w);
        this.waters.push(w);
        C(0.25, 1.8, mat.marble, 0, 0.7);
        C(0.8, 0.2, mat.gold, 0, 2.4, 0, 0.8);
        const jet = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.45 }));
        jet.position.y = 3.1;
        g.add(jet);
        break;
      }
      case "plante":
        C(0.35, 0.6, mat.white, 0, 0, 0, 0.45, 12);
        for (let k = 0; k < 5; k++) {
          const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), green);
          l.position.set(Math.cos(k) * 0.3, 1 + k * 0.18, Math.sin(k * 1.7) * 0.3);
          g.add(l);
        }
        break;
      case "lampe":
        C(0.25, 0.1, mat.gold);
        C(0.04, 1.6, mat.gold, 0, 0.1);
        C(0.45, 0.5, new THREE.MeshStandardMaterial({ color: 0xfff0d0, emissive: 0xffc870, emissiveIntensity: 1.6 }), 0, 1.6, 0, 0.25, 16);
        break;
      case "piano":
        B(1.6, 0.25, 2.2, leather, 0, 0.75);
        B(1.5, 0.08, 0.3, mat.white, 0, 0.85, 1.0);
        for (const [x, z] of [[-0.6, -0.9], [0.6, -0.9], [0, 0.9]]) C(0.06, 0.75, leather, x, 0, z);
        {
          const lid = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.04, 2.1), leather);
          lid.position.set(-0.3, 1.4, 0);
          lid.rotation.z = 0.6;
          g.add(lid);
        }
        break;
      case "aquarium": {
        B(3, 0.6, 1, wood);
        const glass = new THREE.Mesh(new THREE.BoxGeometry(3, 1.4, 1), new THREE.MeshPhysicalMaterial({ color: 0x5ab8e8, transparent: true, opacity: 0.35, roughness: 0.05, emissive: 0x0a3a5a }));
        glass.position.y = 1.3;
        g.add(glass);
        for (let k = 0; k < 6; k++) {
          const f = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.25, 6).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: [0xff8a3a, 0xffd23a, 0x3affd2][k % 3], emissive: 0x331100 }));
          const holder = new THREE.Group();
          holder.position.set(0, 0.9 + (k % 3) * 0.3, -0.3 + (k % 2) * 0.5);
          f.userData.p = k * 1.3;
          holder.add(f);
          g.add(holder);
          this.fishes.push(f);
        }
        break;
      }
      case "bibliotheque":
        B(2.4, 2.8, 0.6, wood);
        for (let s = 0; s < 4; s++)
          for (let k = 0; k < 10; k++) {
            const bk = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.45, 0.4), new THREE.MeshStandardMaterial({ color: [0x8a1f1a, 0x1f4a8a, 0x1f6b4a, 0xd8b25a][(k + s) % 4] }));
            bk.position.set(-1 + k * 0.22, 0.3 + s * 0.65, 0.12);
            g.add(bk);
          }
        break;
      case "tele": {
        B(3.6, 0.5, 0.6, leather);
        const scr = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.9), new THREE.MeshBasicMaterial({ color: 0x3fa8ff }));
        scr.position.set(0, 1.6, 0.05);
        g.add(scr);
        B(3.6, 2.0, 0.08, leather, 0, 0.6, -0.02);
        break;
      }
      case "tapis": {
        const t = new THREE.Mesh(new THREE.PlaneGeometry(4, 6), new THREE.MeshStandardMaterial({ color: 0x8a1f1a, roughness: 0.95 }));
        t.rotation.x = -Math.PI / 2;
        t.position.y = 0.03;
        g.add(t);
        const bd = new THREE.Mesh(new THREE.RingGeometry(1.7, 1.85, 4, 1), mat.gold);
        bd.rotation.x = -Math.PI / 2;
        bd.rotation.z = Math.PI / 4;
        bd.scale.set(1, 1.5, 1);
        bd.position.y = 0.04;
        g.add(bd);
        break;
      }
      case "colonne":
        C(0.6, 0.3, mat.marble, 0, 0, 0, 0.6, 8);
        C(0.42, 4.4, mat.marble, 0, 0.3, 0, 0.42, 16);
        C(0.6, 0.3, mat.gold, 0, 4.7, 0, 0.6, 8);
        break;
      case "arbre":
        C(0.25, 3, wood, 0, 0, 0, 0.18, 8);
        for (let k = 0; k < 4; k++) {
          const l = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4 - k * 0.15, 0), green);
          l.position.set(Math.cos(k * 2) * 0.5, 3.2 + k * 0.7, Math.sin(k * 2) * 0.5);
          g.add(l);
        }
        break;
      case "drapeau": {
        C(0.06, 5, mat.silver);
        const f = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4), new THREE.MeshStandardMaterial({ color: 0x1e4aa8, emissive: 0x0a1a4a, side: THREE.DoubleSide }));
        f.position.set(1.15, 4.3, 0);
        g.add(f);
        const crest = new THREE.Mesh(new THREE.CircleGeometry(0.35, 6), mat.glowGold);
        crest.position.set(1.15, 4.3, 0.01);
        g.add(crest);
        break;
      }
      case "lit":
        B(2.2, 0.5, 2.6, wood);
        B(2.1, 0.2, 2.5, new THREE.MeshStandardMaterial({ color: 0xe8e2d6 }), 0, 0.5);
        B(2.2, 1.6, 0.15, mat.gold, 0, 0, -1.3);
        B(2.1, 0.08, 1.6, velvet, 0, 0.7, 0.4);
        break;
      case "table":
        B(4, 0.1, 1.4, wood, 0, 0.8);
        for (const [x, z] of [[-1.8, -0.55], [1.8, -0.55], [-1.8, 0.55], [1.8, 0.55]]) B(0.12, 0.8, 0.12, wood, x, 0, z);
        for (let k = -1; k <= 1; k++) C(0.06, 0.4, mat.gold, k * 1.2, 0.9);
        break;
    }
    return g;
  }

  // ---------------------------------------------------------------- sauvegarde + multijoueur
  private touch() {
    this.version = Date.now();
    try {
      localStorage.setItem(KEY, JSON.stringify(this.compact()));
    } catch {}
  }

  compact(): { v: number; t: string; i: [Kind, number, number, number, number][] } {
    return { v: this.version, t: this.theme, i: this.items.map((it) => [it.kind, +it.x.toFixed(2), +it.y.toFixed(2), +it.z.toFixed(2), +it.r.toFixed(3)] as [Kind, number, number, number, number]) };
  }

  /** Applique une décoration (sauvegarde locale ou reçue d'un autre joueur). */
  load(d: { v: number; t: string; i: [Kind, number, number, number, number][] }, remote = true) {
    if (!d || typeof d !== "object" || !Array.isArray(d.i)) return;
    this.items.forEach((it) => this.despawn(it));
    this.items = [];
    for (const [kind, x, y, z, r] of d.i.slice(0, 200)) if (ITEMS[kind] && [x, y, z, r].every(Number.isFinite)) this.place(kind, { x, y, z, r }, true);
    if (THEMES[d.t]) this.setTheme(d.t, true);
    this.version = Number(d.v) || 0;
    if (remote) {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.compact()));
      } catch {}
      bus.emit("toast", { text: "🎨 La décoration du palais a été mise à jour par un autre joueur." });
    }
  }
}

/** Reconnaît un objet dans une phrase (« pose une statue », « mets un piano »…). */
export function kindFromText(n: string): Kind | null {
  const map: [RegExp, Kind][] = [
    [/canape|sofa/, "canape"],
    [/trone/, "trone"],
    [/statue/, "statue"],
    [/fontaine/, "fontaine"],
    [/plante|pot de fleur|fleur/, "plante"],
    [/lampe|lumiere|lampadaire/, "lampe"],
    [/piano/, "piano"],
    [/aquarium|poisson/, "aquarium"],
    [/biblioth|livres/, "bibliotheque"],
    [/tele|ecran|television/, "tele"],
    [/tapis/, "tapis"],
    [/colonne|pilier/, "colonne"],
    [/arbre/, "arbre"],
    [/drapeau/, "drapeau"],
    [/\blit\b/, "lit"],
    [/table/, "table"]
  ];
  for (const [re, k] of map) if (re.test(n)) return k;
  return null;
}
