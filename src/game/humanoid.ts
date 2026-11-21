// Personnage articulé (joueur, autres joueurs, mannequins d'armure) : silhouette réaliste,
// visage (yeux, iris, sourcils, nez, bouche, oreilles), mains, coiffures, tenues et accessoires.
import * as THREE from "three";

export interface Limb {
  upper: THREE.Group;
  lower: THREE.Group;
}

export type Hair = "court" | "afro" | "tresses" | "locks" | "long" | "chignon" | "rase" | "boucle" | "queue" | "degrade";
export type Top = "tshirt" | "veste" | "costume" | "sweat" | "robe" | "boubou" | "maillot";
export interface Look {
  skin: number;
  hair: Hair;
  hairColor: number;
  top: Top;
  topColor: number;
  pants: number;
  shoes: number;
  eyes: number;
  build: "fin" | "normal" | "costaud";
  height: number;
  acc: string[];
}

export const DEFAULT_LOOK: Look = { skin: 0x6b4630, hair: "degrade", hairColor: 0x121212, top: "tshirt", topColor: 0x1e4fd8, pants: 0x1a2236, shoes: 0x0b0b0f, eyes: 0x3a2414, build: "normal", height: 1, acc: [] };

export class Humanoid {
  root = new THREE.Group();
  hips = new THREE.Group();
  torso = new THREE.Group();
  head = new THREE.Group();
  armL: Limb;
  armR: Limb;
  legL: Limb;
  legR: Limb;
  /** haut (couleur de la tenue) */
  outfit: THREE.MeshStandardMaterial;
  skin: THREE.MeshStandardMaterial;
  pants: THREE.MeshStandardMaterial;
  shoes: THREE.MeshStandardMaterial;
  hairMat = new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.85 });
  iris = new THREE.MeshStandardMaterial({ color: 0x3a2414, roughness: 0.3 });
  meshes: THREE.Mesh[] = [];
  look: Look = { ...DEFAULT_LOOK };
  private phase = 0;
  private hairG = new THREE.Group();
  private styleG = new THREE.Group();
  private accG = new THREE.Group();
  private skirt: THREE.Mesh | null = null;

  constructor(outfitColor = 0x1e4fd8, skinColor = 0x6b4630) {
    this.outfit = new THREE.MeshStandardMaterial({ color: outfitColor, roughness: 0.75 });
    this.skin = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.55 });
    this.pants = new THREE.MeshStandardMaterial({ color: 0x1a2236, roughness: 0.8 });
    this.shoes = new THREE.MeshStandardMaterial({ color: 0x0b0b0f, roughness: 0.45 });
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => this.addMesh(parent, geo, m, x, y, z);
    this.root.add(this.hips);
    this.hips.position.y = 0.95;
    add(this.hips, new THREE.CapsuleGeometry(0.15, 0.08, 4, 12), this.pants, 0, 0, 0).scale.set(1.2, 1, 0.8);
    // ceinture
    add(this.hips, new THREE.CylinderGeometry(0.185, 0.185, 0.04, 20), new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.5 }), 0, 0.08, 0).scale.set(1, 1, 0.72);
    this.hips.add(this.torso);
    this.torso.position.y = 0.1;
    // buste : torse en V (épaules larges, taille fine)
    add(this.torso, new THREE.CylinderGeometry(0.2, 0.16, 0.42, 18), this.outfit, 0, 0.22, 0).scale.set(1.15, 1, 0.68);
    add(this.torso, new THREE.SphereGeometry(0.21, 20, 14), this.outfit, 0, 0.44, 0).scale.set(1.12, 0.62, 0.7);
    // cou + tête
    this.torso.add(this.head);
    this.head.position.y = 0.66;
    add(this.head, new THREE.CylinderGeometry(0.052, 0.06, 0.12, 12), this.skin, 0, -0.02, 0);
    add(this.head, new THREE.SphereGeometry(0.12, 28, 22), this.skin, 0, 0.14, 0).scale.set(0.88, 1.08, 0.98);
    add(this.head, new THREE.SphereGeometry(0.085, 20, 14), this.skin, 0, 0.075, -0.035).scale.set(0.95, 0.75, 1); // mâchoire
    // visage (vers -z)
    const white = new THREE.MeshStandardMaterial({ color: 0xf4f2ee, roughness: 0.3 });
    const brow = new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.9 });
    for (const s of [-1, 1]) {
      add(this.head, new THREE.SphereGeometry(0.019, 12, 10), white, s * 0.042, 0.155, -0.1).scale.set(1.2, 0.85, 0.6);
      add(this.head, new THREE.SphereGeometry(0.011, 10, 8), this.iris, s * 0.042, 0.155, -0.111);
      add(this.head, new THREE.BoxGeometry(0.04, 0.009, 0.012), brow, s * 0.043, 0.185, -0.103).rotation.z = s * -0.12;
      add(this.head, new THREE.SphereGeometry(0.024, 10, 8), this.skin, s * 0.112, 0.14, 0.005).scale.set(0.5, 1, 0.8); // oreilles
    }
    add(this.head, new THREE.ConeGeometry(0.018, 0.05, 10), this.skin, 0, 0.125, -0.115).rotation.x = -Math.PI / 2 + 0.35; // nez
    add(this.head, new THREE.TorusGeometry(0.022, 0.006, 6, 16, Math.PI), new THREE.MeshStandardMaterial({ color: 0x6a2a24, roughness: 0.6 }), 0, 0.09, -0.1).rotation.z = Math.PI; // bouche
    this.head.add(this.hairG, this.accG);
    this.torso.add(this.styleG);
    const mkLimb = (parent: THREE.Object3D, x: number, y: number, len1: number, len2: number, r: number, upperMat: THREE.Material, lowerMat: THREE.Material): Limb => {
      const upper = new THREE.Group();
      upper.position.set(x, y, 0);
      parent.add(upper);
      add(upper, new THREE.CapsuleGeometry(r, len1 - r * 2, 4, 12), upperMat, 0, -len1 / 2, 0);
      const lower = new THREE.Group();
      lower.position.y = -len1;
      upper.add(lower);
      add(lower, new THREE.CapsuleGeometry(r * 0.85, len2 - r * 2, 4, 12), lowerMat, 0, -len2 / 2, 0);
      return { upper, lower };
    };
    this.armL = mkLimb(this.torso, -0.27, 0.5, 0.3, 0.3, 0.052, this.outfit, this.skin);
    this.armR = mkLimb(this.torso, 0.27, 0.5, 0.3, 0.3, 0.052, this.outfit, this.skin);
    this.legL = mkLimb(this.hips, -0.1, -0.05, 0.45, 0.45, 0.078, this.pants, this.pants);
    this.legR = mkLimb(this.hips, 0.1, -0.05, 0.45, 0.45, 0.078, this.pants, this.pants);
    // mains et chaussures
    for (const a of [this.armL, this.armR]) {
      add(a.lower, new THREE.SphereGeometry(0.045, 12, 10), this.skin, 0, -0.32, 0).scale.set(0.8, 1.15, 0.6);
      add(a.lower, new THREE.CapsuleGeometry(0.012, 0.03, 3, 6), this.skin, 0.035, -0.31, -0.02).rotation.z = 0.6; // pouce
    }
    for (const l of [this.legL, this.legR]) {
      add(l.lower, new THREE.BoxGeometry(0.115, 0.075, 0.27), this.shoes, 0, -0.44, -0.05);
      add(l.lower, new THREE.BoxGeometry(0.12, 0.02, 0.28), new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.6 }), 0, -0.475, -0.05); // semelle
    }
    this.look.topColor = outfitColor;
    this.look.skin = skinColor;
    this.applyLook(this.look);
  }

  private addMesh(parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
    const me = new THREE.Mesh(geo, m);
    me.position.set(x, y, z);
    me.castShadow = true;
    parent.add(me);
    this.meshes.push(me);
    return me;
  }

  private clear(g: THREE.Group) {
    for (const c of [...g.children]) {
      g.remove(c);
      this.meshes = this.meshes.filter((m) => m !== c);
    }
  }

  /** Applique une apparence complète (coiffure, tenue, accessoires, morphologie). */
  applyLook(l: Look) {
    this.look = { ...l, acc: [...(l.acc ?? [])] };
    this.skin.color.setHex(l.skin);
    this.outfit.color.setHex(l.topColor);
    this.pants.color.setHex(l.pants);
    this.shoes.color.setHex(l.shoes);
    this.hairMat.color.setHex(l.hairColor);
    this.iris.color.setHex(l.eyes);
    const H = this.hairMat;
    const add = (g: THREE.Group, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => this.addMesh(g, geo, m, x, y, z);
    // ---- coiffure
    this.clear(this.hairG);
    const cap = (s = 1, y = 0.17) => {
      const m = add(this.hairG, new THREE.SphereGeometry(0.128, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2.1), H, 0, y, 0.008);
      m.scale.set(0.93 * s, 1.08 * s, 1.03 * s);
      return m;
    };
    switch (l.hair) {
      case "rase":
        cap(1.0, 0.165).scale.y = 0.9;
        break;
      case "degrade":
        cap(1.02);
        break;
      case "court":
        cap(1.06);
        add(this.hairG, new THREE.BoxGeometry(0.2, 0.04, 0.06), H, 0, 0.24, -0.08).rotation.x = 0.3;
        break;
      case "afro":
        add(this.hairG, new THREE.SphereGeometry(0.19, 22, 18), H, 0, 0.22, 0.03).scale.set(1, 0.92, 1);
        break;
      case "boucle":
        cap(1.04);
        for (let k = 0; k < 22; k++) {
          const a = (k / 22) * Math.PI * 2,
            b = 0.25 + (k % 3) * 0.3;
          add(this.hairG, new THREE.SphereGeometry(0.035, 8, 6), H, Math.cos(a) * 0.11 * Math.cos(b), 0.19 + Math.sin(b) * 0.1, Math.sin(a) * 0.12 * Math.cos(b) + 0.01);
        }
        break;
      case "tresses":
      case "locks": {
        cap(1.04);
        const n = l.hair === "locks" ? 14 : 10;
        for (let k = 0; k < n; k++) {
          const a = Math.PI * 0.15 + (k / (n - 1)) * Math.PI * 0.7;
          const len = l.hair === "locks" ? 0.3 : 0.38;
          const br = add(this.hairG, new THREE.CapsuleGeometry(l.hair === "locks" ? 0.016 : 0.013, len, 3, 6), H, Math.cos(a) * 0.11, 0.08, Math.sin(a) * 0.1 + 0.02);
          br.rotation.x = 0.25;
        }
        break;
      }
      case "long":
        cap(1.05);
        add(this.hairG, new THREE.BoxGeometry(0.25, 0.36, 0.1), H, 0, 0.0, 0.08);
        for (const s of [-1, 1]) add(this.hairG, new THREE.BoxGeometry(0.05, 0.28, 0.12), H, s * 0.115, 0.04, -0.005);
        break;
      case "chignon":
        cap(1.04);
        add(this.hairG, new THREE.SphereGeometry(0.075, 16, 12), H, 0, 0.29, 0.07);
        break;
      case "queue":
        cap(1.04);
        add(this.hairG, new THREE.CapsuleGeometry(0.035, 0.22, 4, 8), H, 0, 0.08, 0.14).rotation.x = 0.35;
        break;
    }
    // ---- style de tenue
    this.clear(this.styleG);
    if (this.skirt) {
      this.hips.remove(this.skirt);
      this.meshes = this.meshes.filter((m) => m !== this.skirt);
      this.skirt = null;
    }
    const top = this.outfit;
    if (l.top === "veste" || l.top === "costume") {
      const jacket = new THREE.MeshStandardMaterial({ color: new THREE.Color(l.topColor).multiplyScalar(0.55), roughness: 0.6 });
      for (const s of [-1, 1]) add(this.styleG, new THREE.BoxGeometry(0.11, 0.42, 0.02), jacket, s * 0.13, 0.24, -0.13).rotation.z = s * 0.08;
      add(this.styleG, new THREE.BoxGeometry(0.1, 0.25, 0.01), new THREE.MeshStandardMaterial({ color: 0xf6f6f6 }), 0, 0.33, -0.135);
      if (l.top === "costume") add(this.styleG, new THREE.BoxGeometry(0.035, 0.22, 0.012), new THREE.MeshStandardMaterial({ color: 0x8a1f2a }), 0, 0.3, -0.142);
    }
    if (l.top === "sweat") add(this.styleG, new THREE.TorusGeometry(0.1, 0.035, 8, 20, Math.PI), top, 0, 0.56, 0.06).rotation.x = -0.4;
    if (l.top === "maillot") {
      const num = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), new THREE.MeshBasicMaterial({ map: numTex(), transparent: true }));
      num.position.set(0, 0.32, 0.138);
      num.rotation.y = Math.PI;
      this.styleG.add(num);
      this.meshes.push(num);
    }
    if (l.top === "robe" || l.top === "boubou") {
      this.skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.19, l.top === "boubou" ? 0.36 : 0.3, l.top === "boubou" ? 0.95 : 0.55, 24, 1, true), top);
      (this.skirt.material as THREE.Material).side = THREE.DoubleSide;
      this.skirt.position.y = l.top === "boubou" ? -0.42 : -0.22;
      this.skirt.castShadow = true;
      this.hips.add(this.skirt);
      this.meshes.push(this.skirt);
      if (l.top === "boubou") for (const s of [-1, 1]) add(this.styleG, new THREE.BoxGeometry(0.06, 0.02, 0.24), new THREE.MeshStandardMaterial({ color: 0xd8b25a, metalness: 0.8, roughness: 0.3 }), s * 0.05, 0.47, -0.12);
    }
    // ---- accessoires
    this.clear(this.accG);
    const gold = new THREE.MeshStandardMaterial({ color: 0xd8b25a, metalness: 1, roughness: 0.25 });
    if (l.acc.includes("lunettes"))
      for (const s of [-1, 1]) {
        add(this.accG, new THREE.TorusGeometry(0.025, 0.005, 6, 16), new THREE.MeshStandardMaterial({ color: 0x111111 }), s * 0.042, 0.155, -0.118);
        add(this.accG, new THREE.CircleGeometry(0.023, 16), new THREE.MeshStandardMaterial({ color: 0x0a0a14, transparent: true, opacity: 0.7, side: THREE.DoubleSide }), s * 0.042, 0.155, -0.119);
      }
    if (l.acc.includes("couronne")) {
      add(this.accG, new THREE.CylinderGeometry(0.1, 0.095, 0.05, 20, 1, true), gold, 0, 0.3, 0.01);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        add(this.accG, new THREE.ConeGeometry(0.015, 0.05, 4), gold, Math.cos(a) * 0.1, 0.345, Math.sin(a) * 0.1 + 0.01);
      }
    }
    if (l.acc.includes("casquette")) {
      const capM = new THREE.MeshStandardMaterial({ color: l.topColor, roughness: 0.7 });
      add(this.accG, new THREE.SphereGeometry(0.135, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), capM, 0, 0.19, 0.01).scale.set(0.95, 0.85, 1.02);
      add(this.accG, new THREE.CylinderGeometry(0.09, 0.09, 0.01, 20, 1, false, 0, Math.PI), capM, 0, 0.2, -0.1).rotation.y = Math.PI / 2;
    }
    if (l.acc.includes("boucles")) for (const s of [-1, 1]) add(this.accG, new THREE.TorusGeometry(0.014, 0.004, 6, 12), gold, s * 0.118, 0.11, 0);
    if (l.acc.includes("barbe")) add(this.accG, new THREE.SphereGeometry(0.075, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), this.hairMat, 0, 0.1, -0.04).scale.set(1.05, 0.9, 0.9);
    if (l.acc.includes("collier")) add(this.styleG, new THREE.TorusGeometry(0.075, 0.008, 6, 24), gold, 0, 0.6, -0.02).rotation.x = Math.PI / 2 - 0.3;
    if (l.acc.includes("montre")) add(this.armL.lower, new THREE.CylinderGeometry(0.045, 0.045, 0.03, 14), gold, 0, -0.26, 0);
    // ---- morphologie
    const w = l.build === "fin" ? 0.9 : l.build === "costaud" ? 1.16 : 1;
    const h = Math.max(0.85, Math.min(1.12, l.height || 1));
    this.root.scale.set(w * h, h, w * h);
  }

  /** Animation procédurale : speed en m/s, airborne pour le saut. */
  animate(dt: number, speed: number, airborne: boolean, sitting = false) {
    if (sitting) {
      this.legL.upper.rotation.x = this.legR.upper.rotation.x = Math.PI / 2;
      this.legL.lower.rotation.x = this.legR.lower.rotation.x = -Math.PI / 2;
      this.armL.upper.rotation.x = this.armR.upper.rotation.x = 0.3;
      this.armL.lower.rotation.x = this.armR.lower.rotation.x = 0.9;
      this.hips.position.y = 0.5;
      return;
    }
    this.hips.position.y = 0.95;
    this.phase += dt * (2 + speed * 1.4);
    const amp = Math.min(1, speed / 6) * 0.75;
    const s = Math.sin(this.phase);
    if (airborne) {
      this.legL.upper.rotation.x = 0.6;
      this.legR.upper.rotation.x = -0.2;
      this.legL.lower.rotation.x = -0.9;
      this.legR.lower.rotation.x = -0.3;
      this.armL.upper.rotation.x = this.armR.upper.rotation.x = 0.5;
      this.armL.upper.rotation.z = 0.5;
      this.armR.upper.rotation.z = -0.5;
      return;
    }
    // respiration à l'arrêt
    const breathe = Math.sin(performance.now() / 700) * 0.008 * (1 - amp);
    this.torso.scale.set(1, 1 + breathe, 1 + breathe);
    this.legL.upper.rotation.x = s * amp;
    this.legR.upper.rotation.x = -s * amp;
    this.legL.lower.rotation.x = -Math.max(0, -s) * amp * 1.2;
    this.legR.lower.rotation.x = -Math.max(0, s) * amp * 1.2;
    this.armL.upper.rotation.x = -s * amp * 0.8;
    this.armR.upper.rotation.x = s * amp * 0.8;
    this.armL.lower.rotation.x = this.armR.lower.rotation.x = 0.25 + amp * 0.3;
    this.armL.upper.rotation.z = 0.08;
    this.armR.upper.rotation.z = -0.08;
    this.torso.rotation.y = s * amp * 0.12;
    this.head.rotation.y = -s * amp * 0.06;
    this.hips.position.y = 0.95 + Math.abs(Math.cos(this.phase)) * amp * 0.05;
  }

  /** Pose d'exposition (mannequin). */
  pose() {
    this.armL.upper.rotation.z = 0.25;
    this.armR.upper.rotation.z = -0.25;
    this.armL.lower.rotation.x = this.armR.lower.rotation.x = 0.15;
  }
}

let _num: THREE.Texture | null = null;
function numTex() {
  if (_num) return _num;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.font = "bold 52px Arial";
  g.textAlign = "center";
  g.fillText("10", 32, 50);
  _num = new THREE.CanvasTexture(c);
  return _num;
}

/** Avatars prêts à l'emploi (personnages originaux). */
export const PRESETS: { name: string; look: Look }[] = [
  { name: "Le Roi", look: { skin: 0x5a3a26, hair: "degrade", hairColor: 0x0d0d0d, top: "boubou", topColor: 0x1e3a8a, pants: 0x1e3a8a, shoes: 0x2a1a10, eyes: 0x2a1a10, build: "costaud", height: 1.06, acc: ["couronne", "barbe", "collier"] } },
  { name: "La Reine", look: { skin: 0x6b4630, hair: "chignon", hairColor: 0x120c08, top: "robe", topColor: 0x7a1f5a, pants: 0x6b4630, shoes: 0xd8b25a, eyes: 0x3a2414, build: "fin", height: 1.0, acc: ["couronne", "boucles", "collier"] } },
  { name: "Prince sportif", look: { skin: 0x7a5038, hair: "court", hairColor: 0x1a120c, top: "maillot", topColor: 0x1f8a4a, pants: 0xf0f0f0, shoes: 0xf0f0f0, eyes: 0x2a1a10, build: "normal", height: 1.02, acc: [] } },
  { name: "Princesse", look: { skin: 0x8a5a3a, hair: "tresses", hairColor: 0x0d0a08, top: "robe", topColor: 0xb46bff, pants: 0x8a5a3a, shoes: 0xf2c8d6, eyes: 0x3a2414, build: "fin", height: 0.96, acc: ["boucles", "collier"] } },
  { name: "Homme d'affaires", look: { skin: 0xc8946a, hair: "court", hairColor: 0x3a2414, top: "costume", topColor: 0x2a2e3a, pants: 0x1a1c24, shoes: 0x0b0b0f, eyes: 0x2a5a8a, build: "normal", height: 1.03, acc: ["montre"] } },
  { name: "Artiste", look: { skin: 0x4a2e1e, hair: "locks", hairColor: 0x2a1a10, top: "sweat", topColor: 0xd8a12a, pants: 0x2a3a5a, shoes: 0xc0392b, eyes: 0x2a1a10, build: "fin", height: 1.0, acc: ["lunettes"] } },
  { name: "Afro groove", look: { skin: 0x5a3a26, hair: "afro", hairColor: 0x0d0d0d, top: "veste", topColor: 0xc0392b, pants: 0x0d0d14, shoes: 0xf0f0f0, eyes: 0x2a1a10, build: "normal", height: 1.0, acc: ["collier"] } },
  { name: "Exploratrice", look: { skin: 0xe8b89a, hair: "queue", hairColor: 0x8a5a2a, top: "veste", topColor: 0x5a6a3a, pants: 0x4a3a2a, shoes: 0x3a2a1a, eyes: 0x2a7a4a, build: "fin", height: 0.98, acc: ["casquette"] } },
  { name: "Géant costaud", look: { skin: 0x3a2418, hair: "rase", hairColor: 0x0d0d0d, top: "tshirt", topColor: 0x111111, pants: 0x2a2a2a, shoes: 0x111111, eyes: 0x2a1a10, build: "costaud", height: 1.12, acc: ["barbe", "lunettes"] } },
  { name: "Étudiante", look: { skin: 0xd8a888, hair: "long", hairColor: 0x2a1a10, top: "sweat", topColor: 0x3fa8ff, pants: 0x1a2a4a, shoes: 0xf0f0f0, eyes: 0x3a2414, build: "fin", height: 0.95, acc: ["boucles"] } },
  { name: "Bouclé cool", look: { skin: 0x9a6a48, hair: "boucle", hairColor: 0x1a120c, top: "tshirt", topColor: 0xf0f0f0, pants: 0x3a5a8a, shoes: 0x111111, eyes: 0x2a1a10, build: "normal", height: 1.0, acc: ["montre"] } },
  { name: "Garde royal", look: { skin: 0x6b4630, hair: "rase", hairColor: 0x0d0d0d, top: "costume", topColor: 0x8a1f2a, pants: 0x0d0d14, shoes: 0x0b0b0f, eyes: 0x2a1a10, build: "costaud", height: 1.08, acc: [] } }
];
