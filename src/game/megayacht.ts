// LE MÉGA-YACHT « ÉTOILE ROYALE » — 3 km de long, plus grand que le Palais Impérial : un palais flottant
// (dôme d'or, tours, piscines, jardins, héliport). On le pilote (W/S, A/D), il passe en SUPERSONIQUE (B),
// devient FURTIF (K), et VOYAGE seul vers les autres nations (auto-pilote). À l'arrêt on se promène sur le pont.
import * as THREE from "three";
import { G, bus, clamp, damp } from "../core";
import { mat } from "../world/materials";
import { SEA } from "../world/terrain";
import { COUNTRIES } from "../world/countryData";
import { cloakMaterial } from "./shipmodel";

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const L = 3000; // longueur
const B = 520; // largeur
const DECK = 62; // hauteur du pont principal au-dessus de l'eau
/** Mouillage habituel : au large, au nord-ouest du royaume. */
export const ANCHOR = V3(-3600, SEA, 3400);

/** Demi-largeur du pont à l'abscisse locale z (−L/2 = proue). */
function halfBeam(z: number) {
  const u = (z + L / 2) / L; // 0 = proue, 1 = poupe
  if (u < 0 || u > 1) return 0;
  if (u < 0.28) return (B / 2) * Math.pow(u / 0.28, 0.6);
  return (B / 2) * (u > 0.96 ? 1 - (u - 0.96) * 2 : 1);
}

interface Block {
  x1: number;
  x2: number;
  z1: number;
  z2: number;
  top: number;
  bottom: number;
}

export class Yacht {
  root = new THREE.Group();
  active = false; // à la barre
  onDeck = false;
  yaw = Math.PI / 2; // proue vers l'ouest
  private v = 0;
  private camPos = V3();
  private camMode = 0;
  supersonic = false;
  stealth = false;
  private originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private blocks: Block[] = [];
  private cone!: THREE.Mesh;
  private wake!: THREE.Mesh;
  private hud!: HTMLElement;
  private voyage: { name: string; target: THREE.Vector3; place: string | null } | null = null;
  arrivedAt: string | null = null;
  private windows!: THREE.MeshStandardMaterial;
  private helm = V3(0, DECK, -L / 2 + 640); // poste de pilotage (local), sur le pont avant

  build() {
    const r = this.root;
    const white = new THREE.MeshStandardMaterial({ color: 0xf6f7fa, metalness: 0.25, roughness: 0.3 });
    const navy = new THREE.MeshStandardMaterial({ color: 0x0b1a3c, metalness: 0.5, roughness: 0.3 });
    const gold = mat.gold;
    this.windows = new THREE.MeshStandardMaterial({ map: windowTex(), color: 0xffffff, emissive: 0xffd9a0, emissiveMap: windowTex(), emissiveIntensity: 0.2, metalness: 0.6, roughness: 0.15 });
    const add = (m: THREE.Object3D) => {
      m.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = (o as THREE.Mesh).receiveShadow = true;
      });
      r.add(m);
      return m;
    };
    // ---- coque : contour du pont extrudé vers le bas
    const sh = new THREE.Shape();
    const N = 60;
    const pts: [number, number][] = [];
    for (let i = 0; i <= N; i++) {
      const z = -L / 2 + (i / N) * L;
      pts.push([halfBeam(z), z]);
    }
    sh.moveTo(0, -L / 2);
    for (const [x, z] of pts) sh.lineTo(x, z);
    for (let i = pts.length - 1; i >= 0; i--) sh.lineTo(-pts[i][0], pts[i][1]);
    const hullGeo = new THREE.ExtrudeGeometry(sh, { depth: DECK + 40, bevelEnabled: true, bevelSize: 8, bevelThickness: 8, bevelSegments: 2, curveSegments: 4 });
    hullGeo.rotateX(Math.PI / 2); // forme (x, y=z) → plan XZ, extrusion vers le bas
    const hull = new THREE.Mesh(hullGeo, white);
    hull.position.y = DECK;
    add(hull);
    const band = new THREE.Mesh(hullGeo.clone(), navy);
    band.scale.set(1.012, 0.25, 1.004);
    band.position.y = 14;
    add(band);
    const goldLine = new THREE.Mesh(hullGeo.clone(), gold);
    goldLine.scale.set(1.016, 0.03, 1.006);
    goldLine.position.y = 32;
    add(goldLine);
    // pont en teck
    const deckGeo = new THREE.ShapeGeometry(sh);
    deckGeo.rotateX(Math.PI / 2);
    const deck = new THREE.Mesh(deckGeo, new THREE.MeshStandardMaterial({ color: 0xb88a5a, roughness: 0.7, side: THREE.DoubleSide }));
    deck.position.y = DECK + 0.3;
    add(deck);
    // ---- superstructure : 5 étages en gradins (le « palais flottant »)
    const tiers = [
      { z1: -L / 2 + 700, z2: L / 2 - 250, w: 400, h: 70 },
      { z1: -L / 2 + 820, z2: L / 2 - 420, w: 340, h: 70 },
      { z1: -L / 2 + 950, z2: L / 2 - 620, w: 280, h: 70 },
      { z1: -L / 2 + 1080, z2: L / 2 - 900, w: 210, h: 70 },
      { z1: -L / 2 + 1200, z2: L / 2 - 1200, w: 140, h: 60 }
    ];
    let y = DECK;
    for (const t of tiers) {
      const blk = new THREE.Mesh(new THREE.BoxGeometry(t.w, t.h, t.z2 - t.z1), white);
      blk.position.set(0, y + t.h / 2, (t.z1 + t.z2) / 2);
      add(blk);
      for (const sx of [-1, 1]) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(t.z2 - t.z1 - 20, t.h * 0.55), this.windows);
        win.position.set(sx * (t.w / 2 + 0.6), y + t.h * 0.5, (t.z1 + t.z2) / 2);
        win.rotation.y = sx * (Math.PI / 2);
        r.add(win);
      }
      const front = new THREE.Mesh(new THREE.PlaneGeometry(t.w - 20, t.h * 0.55), this.windows);
      front.position.set(0, y + t.h * 0.5, t.z1 - 0.6);
      front.rotation.y = Math.PI;
      r.add(front);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(t.w + 10, 2, t.z2 - t.z1 + 10), white);
      roof.position.set(0, y + t.h, (t.z1 + t.z2) / 2);
      add(roof);
      const rim = new THREE.Mesh(new THREE.BoxGeometry(t.w + 12, 1.2, t.z2 - t.z1 + 12), gold);
      rim.position.set(0, y + t.h - 1.2, (t.z1 + t.z2) / 2);
      add(rim);
      this.blocks.push({ x1: -t.w / 2, x2: t.w / 2, z1: t.z1, z2: t.z2, top: y + t.h, bottom: y });
      y += t.h;
    }
    // dôme d'or géant, tours, flèche (plus haut que le Palais Impérial)
    const top = y;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(110, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), gold);
    dome.position.set(0, top, 0);
    add(dome);
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(3, 12, 260, 16), gold);
    spire.position.set(0, top + 110 + 130, 0);
    add(spire);
    const jewel = new THREE.Mesh(new THREE.OctahedronGeometry(22), new THREE.MeshStandardMaterial({ color: 0x0a1a3a, emissive: 0x3fa8ff, emissiveIntensity: 2.5, metalness: 0.9, roughness: 0.1 }));
    jewel.scale.set(1, 1.6, 1);
    jewel.position.set(0, top + 400, 0);
    add(jewel);
    for (const [tx, tz] of [[-150, -L / 2 + 760], [150, -L / 2 + 760], [-150, L / 2 - 300], [150, L / 2 - 300]]) {
      const tw = new THREE.Mesh(new THREE.CylinderGeometry(22, 26, 300, 24), white);
      tw.position.set(tx, DECK + 150, tz);
      add(tw);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(28, 70, 24), gold);
      cap.position.set(tx, DECK + 335, tz);
      add(cap);
      this.blocks.push({ x1: tx - 22, x2: tx + 22, z1: tz - 22, z2: tz + 22, top: DECK + 300, bottom: DECK });
    }
    // proue : piscines, jardins, héliport
    const pool = (x: number, z: number, w: number, d: number) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(w, 1, d), new THREE.MeshStandardMaterial({ color: 0x2ab0e8, emissive: 0x0a4a6a, emissiveIntensity: 0.5, roughness: 0.05, metalness: 0.2 }));
      p.position.set(x, DECK + 0.6, z);
      r.add(p);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(w + 6, 0.8, d + 6), mat.marble);
      edge.position.set(x, DECK + 0.35, z);
      r.add(edge);
    };
    pool(0, -L / 2 + 560, 160, 90);
    pool(-110, L / 2 - 160, 90, 60);
    pool(110, L / 2 - 160, 90, 60);
    const garden = new THREE.Mesh(new THREE.BoxGeometry(220, 1.2, 160), mat.hedge);
    garden.position.set(0, DECK + 0.6, -L / 2 + 360);
    r.add(garden);
    const trees: THREE.Vector3[] = [];
    for (let k = 0; k < 40; k++) trees.push(V3((Math.random() - 0.5) * 200, DECK, -L / 2 + 290 + Math.random() * 140));
    const treeM = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(6, 0).translate(0, 12, 0), new THREE.MeshStandardMaterial({ color: 0x2f6a2a, flatShading: true }), trees.length);
    const m4 = new THREE.Matrix4();
    trees.forEach((t, i) => treeM.setMatrixAt(i, m4.makeTranslation(t.x, t.y, t.z)));
    r.add(treeM);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(70, 70, 1, 48), new THREE.MeshStandardMaterial({ color: 0x2a2e38, metalness: 0.5 }));
    pad.position.set(0, DECK + 0.5, L / 2 - 120 - 60);
    r.add(pad);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(64, 1.5, 8, 64), mat.glowGold);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, DECK + 1.2, L / 2 - 180);
    r.add(ring);
    // nom
    const name = nameplate("♛ ÉTOILE ROYALE");
    for (const sx of [-1, 1]) {
      const n = name.clone();
      n.position.set(sx * (halfBeam(-L / 2 + 520) + 3), DECK - 22, -L / 2 + 520);
      n.rotation.y = sx * (Math.PI / 2);
      r.add(n);
    }
    // poste de pilotage (verrière) sur l'avant du 1er étage
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(200, 20, 40), new THREE.MeshStandardMaterial({ color: 0x0a1424, metalness: 0.8, roughness: 0.05, emissive: 0x1a4a7a, emissiveIntensity: 0.4 }));
    bridge.position.set(0, DECK + 60, -L / 2 + 700 - 15);
    r.add(bridge);
    // effets : cône supersonique, sillage
    this.cone = new THREE.Mesh(new THREE.ConeGeometry(420, 1400, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0xcfeaff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.cone.rotation.x = -Math.PI / 2;
    this.cone.position.set(0, DECK, -L / 2 + 400);
    r.add(this.cone);
    this.wake = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    this.wake.rotation.x = -Math.PI / 2;
    r.add(this.wake);

    r.position.copy(ANCHOR);
    r.rotation.y = this.yaw;
    G.scene.add(r);
    // le pont est praticable (même quand le yacht a bougé) : surface + murs des étages
    G.physics.surfaces.push((x, z) => this.deckHeight(x, z));
    // marina du royaume : borne pour rejoindre le méga-yacht
    const yG = 1;
    const pier = new THREE.Mesh(new THREE.BoxGeometry(180, 1, 8), mat.wood);
    pier.position.set(-930, yG - 0.4, 520);
    G.scene.add(pier);
    G.physics.addBox({ x: -1020, y: -6, z: 516 }, { x: -840, y: yG, z: 524 }, "marina");
    G.interact.add({ id: "yacht-board", pos: V3(-1005, 1.4, 520), radius: 6, enabled: () => G.mode === "foot", label: () => "🛥️ Rejoindre le méga-yacht Étoile Royale", action: () => bus.emit("toast", { text: this.board() }) });
    G.interact.add({ id: "yacht-helm", pos: () => this.toWorld(this.helm).add(V3(0, 1, 0)), radius: 8, enabled: () => G.mode === "foot" && this.onDeck, label: () => "🧭 Prendre la barre du méga-yacht", action: () => this.takeHelm() });
    G.world.markers.push({ id: "megayacht", name: "Méga-yacht Étoile Royale", pos: this.root.position, icon: "🛥", visible: () => true });
    // HUD de pilotage
    this.hud = document.createElement("div");
    this.hud.className = "yacht-hud";
    this.hud.hidden = true;
    document.body.appendChild(this.hud);
    this.hud.onclick = (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>("[data-y]")?.dataset.y;
      if (!a) return;
      if (a === "sonic") this.setSupersonic(!this.supersonic);
      else if (a === "cloak") this.setStealth(!this.stealth);
      else if (a === "deck") this.toDeck();
      else if (a === "land") void this.disembark();
      else if (a === "view") this.camMode = (this.camMode + 1) % 3;
      else if (a === "voyage") this.voyagePanel();
      else if (a.startsWith("go:")) bus.emit("toast", { text: this.voyageTo(a.slice(3)) });
      else if (a === "close") this.renderHud();
    };
    G.palace.updaters.push((dt, t) => this.update(dt, t));
  }

  private toWorld(local: THREE.Vector3) {
    return local.clone().applyAxisAngle(V3(0, 1, 0), this.yaw).add(this.root.position);
  }
  private toLocal(x: number, z: number) {
    const dx = x - this.root.position.x,
      dz = z - this.root.position.z;
    const c = Math.cos(-this.yaw),
      s = Math.sin(-this.yaw);
    return { x: dx * c + dz * s, z: -dx * s + dz * c };
  }

  private deckHeight(x: number, z: number) {
    if (Math.abs(x - this.root.position.x) > L || Math.abs(z - this.root.position.z) > L) return -Infinity;
    const l = this.toLocal(x, z);
    if (Math.abs(l.x) > halfBeam(l.z)) return -Infinity;
    return this.root.position.y + DECK + 0.3;
  }

  // ---------------------------------------------------------------- monter, barre, pont, débarquer
  board(): string {
    if (G.mode === "boat") return "Vous êtes déjà à la barre de l'Étoile Royale.";
    if (G.mode !== "foot") return "Descendez d'abord du véhicule.";
    bus.emit("fade");
    this.onDeck = true;
    G.player.teleport(this.toWorld(this.helm.clone().add(V3(0, 0.4, 30))), this.yaw);
    setTimeout(() => this.takeHelm(), 600);
    return "Bienvenue à bord de l'Étoile Royale, le méga-yacht de 3 km ! Je vous mets à la barre. 🌍 Voyage pour visiter une autre nation.";
  }

  takeHelm() {
    if (G.mode !== "foot") return;
    this.active = true;
    this.onDeck = false;
    this.v = 0;
    G.mode = "boat" as any;
    this.camPos.copy(G.camera.position);
    G.audio.unlock();
    G.audio.setEngine(0.05);
    bus.emit("mode");
    this.renderHud();
    this.hud.hidden = false;
    bus.emit("toast", { text: "🛥️ À la barre — W/S gaz · A/D barre · B supersonique · K furtif · V vue · F pont" });
  }

  toDeck() {
    if (Math.abs(this.v) > 6 || this.voyage) return bus.emit("toast", { text: "Arrêtez d'abord le yacht pour vous promener sur le pont.", kind: "warn" });
    this.v = 0;
    this.leaveHelm();
    this.onDeck = true;
    G.player.teleport(this.toWorld(this.helm.clone().add(V3(0, 0.4, 30))), this.yaw);
    bus.emit("toast", { text: "🚶 Promenade sur le pont : piscines et jardins à la proue, héliport à la poupe. Revenez à la barre (E au poste de pilotage)." });
  }

  private leaveHelm() {
    this.active = false;
    this.hud.hidden = true;
    G.audio.setEngine(null);
    G.mode = "foot";
    if (G.camera.fov !== 70) {
      G.camera.fov = 70;
      G.camera.updateProjectionMatrix();
    }
    bus.emit("mode");
  }

  /** Débarquer : navette vers la terre la plus proche (pays d'arrivée, ou marina du royaume). */
  async disembark() {
    if (Math.abs(this.v) > 6 || this.voyage) return bus.emit("toast", { text: "Arrêtez d'abord le yacht.", kind: "warn" });
    if (this.active) this.leaveHelm();
    this.onDeck = false;
    const { runAction } = await import("../ai/actions");
    const p = this.root.position;
    const c = COUNTRIES.map((k) => ({ k, d: Math.hypot(k.x - p.x, k.z - p.z) - k.r })).sort((a, b) => a.d - b.d)[0];
    if (c && c.d < 2500) {
      await runAction("teleport", "country:" + c.k.id);
      bus.emit("toast", { text: `🛥️ La navette vous dépose à ${c.k.name}. Dites « yacht » pour remonter à bord.` });
    } else {
      bus.emit("fade");
      G.player.teleport(V3(-900, 1.3, 520), -Math.PI / 2);
      bus.emit("toast", { text: "🛥️ La navette vous dépose à la marina royale. Dites « yacht » pour remonter à bord." });
    }
  }

  // ---------------------------------------------------------------- voyages
  voyagePanel() {
    this.hud.innerHTML = `<div class="yh-title">🌍 Voyage vers…</div><div class="yh-grid">
      <button data-y="go:royaume">♛ Royaume</button>
      ${COUNTRIES.filter((c) => Math.hypot(c.x, c.z) > 5000)
        .map((c) => `<button data-y="go:${c.id}">${c.name}</button>`)
        .join("")}</div><button data-y="close">Fermer</button>`;
  }

  voyageTo(text: string): string {
    if (!this.active) {
      const msg = this.board();
      setTimeout(() => bus.emit("toast", { text: this.voyageTo(text) }), 900);
      return msg;
    }
    const n = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    let target: THREE.Vector3;
    let name: string;
    let place: string | null = null;
    if (/royaume|maison|home|palais|marina/.test(n)) {
      target = ANCHOR.clone();
      name = "le Royaume";
    } else {
      const c = COUNTRIES.find((k) => n.includes(k.id) || n.includes(k.name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()));
      if (!c) return `Nations : ${COUNTRIES.map((k) => k.name).join(", ")}.`;
      // point au large de la côte, du côté où l'on arrive
      const p = this.root.position;
      const dir = V3(p.x - c.x, 0, p.z - c.z).normalize();
      target = V3(c.x, SEA, c.z).addScaledVector(dir, c.r + 1900);
      name = c.name;
      place = "country:" + c.id;
    }
    this.voyage = { name, target, place };
    this.arrivedAt = null;
    const km = this.root.position.distanceTo(target) / 1000;
    if (km > 3 && !this.supersonic) this.setSupersonic(true);
    this.renderHud();
    return `Cap sur ${name} : ${km.toFixed(1)} km${km > 3 ? " en supersonique" : ""} !`;
  }

  // ---------------------------------------------------------------- supersonique et furtif
  setSupersonic(on: boolean) {
    this.supersonic = on;
    if (on) {
      G.audio.whoosh(2.4, 70, 24, 0.4);
      bus.emit("shake", 0.6);
    }
    bus.emit("toast", { text: on ? "⚡ SUPERSONIQUE — jusqu'à Mach 4" : "Vitesse de croisière" });
    this.renderHud();
  }

  setStealth(on: boolean) {
    if (on === this.stealth) return;
    this.stealth = on;
    bus.emit("cloak:fx", on);
    G.audio.whoosh(1.4, on ? 1800 : 200, on ? 120 : 1600, 0.12);
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m === this.cone || m === this.wake) return;
      if (on) {
        this.originals.set(m, m.material);
        m.material = cloakMaterial();
      } else if (this.originals.has(m)) m.material = this.originals.get(m)!;
    });
    if (!on) this.originals.clear();
    this.renderHud();
  }

  private renderHud() {
    if (!this.hud) return;
    const kmh = Math.abs(this.v) * 3.6;
    const mach = Math.abs(this.v) / 343;
    this.hud.innerHTML = `<div class="yh-row"><b>🛥️ Étoile Royale</b><span>${Math.round(kmh)} km/h${mach >= 1 ? ` · Mach ${mach.toFixed(1)}` : ""}</span>${this.voyage ? `<span>➜ ${this.voyage.name} · ${(this.root.position.distanceTo(this.voyage.target) / 1000).toFixed(1)} km</span>` : this.arrivedAt ? `<span>⚓ Au large de ${this.arrivedAt}</span>` : ""}</div>
      <div class="yh-btns"><button data-y="voyage">🌍 Voyage</button><button data-y="sonic" class="${this.supersonic ? "on" : ""}">⚡ Supersonique</button><button data-y="cloak" class="${this.stealth ? "on" : ""}">👁 Furtif</button><button data-y="view">🎥 Vue</button><button data-y="deck">🚶 Pont</button><button data-y="land">🛥️ Débarquer</button></div>`;
  }

  // ---------------------------------------------------------------- mise à jour
  private hudT = 0;
  private update(dt: number, t: number) {
    const r = this.root;
    const fast = Math.abs(this.v) > 120;
    r.position.y = SEA + Math.sin(t * 0.4) * 0.8;
    r.rotation.set(0, this.yaw, Math.sin(t * 0.3) * 0.004);
    this.windows.emissiveIntensity = 0.2 + G.env.nightFactor * 1.6;
    // cône de choc et sillage
    const sonicA = clamp((Math.abs(this.v) - 300) / 300, 0, 1);
    (this.cone.material as THREE.MeshBasicMaterial).opacity = sonicA * (0.12 + Math.sin(t * 20) * 0.03);
    const wl = 400 + Math.abs(this.v) * 4;
    this.wake.scale.set(B * 0.9, wl, 1);
    this.wake.position.set(0, 1.5, L / 2 + wl / 2);
    (this.wake.material as THREE.MeshBasicMaterial).opacity = clamp(Math.abs(this.v) / 60, 0, 0.5);
    // pont : on ne traverse pas les étages
    if (this.onDeck && G.mode === "foot") this.collideDeck();
    if (!this.active) return;
    const inp = G.input;
    if (inp.hit("KeyF", "KeyE")) return this.toDeck();
    if (inp.hit("KeyB")) this.setSupersonic(!this.supersonic);
    if (inp.hit("KeyK")) this.setStealth(!this.stealth);
    if (inp.hit("KeyV")) this.camMode = (this.camMode + 1) % 3;
    const maxV = this.supersonic ? 1400 : 45;
    let steer = 0;
    if (this.voyage) {
      // pilote automatique de voyage
      const to = this.voyage.target;
      const d = Math.hypot(to.x - r.position.x, to.z - r.position.z);
      const want = Math.atan2(-(to.x - r.position.x), -(to.z - r.position.z));
      let dy = want - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw += clamp(dy, -0.5 * dt, 0.5 * dt);
      steer = clamp(dy, -1, 1);
      const vWant = Math.min(maxV, Math.max(8, d / 6)) * (Math.abs(dy) > 0.6 ? 0.3 : 1);
      this.v = damp(this.v, vWant, this.v < vWant ? 0.6 : 1.5, dt);
      if (inp.down("KeyW", "KeyS")) {
        this.voyage = null;
        bus.emit("toast", { text: "Vous reprenez la barre." });
      } else if (d < 60) {
        this.arrivedAt = this.voyage.name;
        this.voyage = null;
        this.v = 0;
        if (this.supersonic) this.setSupersonic(false);
        bus.emit("toast", { text: `⚓ Arrivée au large de ${this.arrivedAt} ! Touchez 🛥️ Débarquer pour aller à terre.` });
        G.audio.tone(784, 0.3, "sine", 0.1, 1046);
      }
    } else {
      const thr = inp.axis(["KeyS", "ArrowDown"], ["KeyW", "ArrowUp"]) - inp.touchMove.y;
      steer = inp.axis(["KeyD", "ArrowRight"], ["KeyA", "ArrowLeft"]) - inp.touchMove.x;
      this.v += thr * (this.supersonic ? 260 : 9) * dt;
      this.v -= this.v * (this.supersonic ? 0.15 : 0.12) * dt;
      this.v = clamp(this.v, -12, maxV);
      if (!this.supersonic && this.v > 45) this.v = damp(this.v, 45, 1, dt);
      this.yaw += steer * dt * 0.12 * clamp(Math.abs(this.v) / 15, 0.15, 1) * Math.sign(this.v || 1) * (fast ? 0.5 : 1);
    }
    const fwd = V3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const next = r.position.clone().addScaledVector(fwd, this.v * dt);
    // échouage : hors voyage, on vérifie la profondeur sous la proue et les flancs
    let ground = false;
    if (!this.voyage && Math.abs(this.v) < 400) {
      for (const [lx, lz] of [[0, -L / 2], [B / 2, -L / 4], [-B / 2, -L / 4], [B / 2, L / 3], [-B / 2, L / 3], [0, L / 2]]) {
        const w = V3(lx, 0, lz * Math.sign(this.v || 1)).applyAxisAngle(V3(0, 1, 0), this.yaw).add(next);
        if (G.physics.terrain(w.x, w.z) > SEA - 4) ground = true;
      }
    }
    if (ground) {
      this.v *= -0.2;
      bus.emit("shake", 0.4);
      bus.emit("toast", { text: "⚠ Trop près de la côte : l'Étoile Royale a besoin d'eau profonde.", kind: "warn" });
    } else r.position.x = next.x, r.position.z = next.z;
    if (Math.abs(r.position.x) > 31000 || Math.abs(r.position.z) > 31000) this.v = 0;
    G.player.position.copy(this.toWorld(this.helm.clone().add(V3(0, 2, 0))));
    G.audio.setEngine(0.05 + Math.min(1, Math.abs(this.v) / (this.supersonic ? 1000 : 45)) * 0.8);
    if (this.supersonic && Math.abs(this.v) > 343 && Math.random() < dt * 0.3) G.audio.whoosh(1.6, 80, 30, 0.2);
    // caméra
    inp.consumeMouse();
    const back = this.camMode === 0 ? 3600 : this.camMode === 1 ? 0 : 2200;
    let want: THREE.Vector3, look: THREE.Vector3;
    if (this.camMode === 1) {
      want = this.toWorld(V3(0, DECK + 75, -L / 2 + 680));
      look = want.clone().addScaledVector(fwd, 400).add(V3(0, -40, 0));
    } else if (this.camMode === 2) {
      want = r.position.clone().add(V3(0, 500, 0)).add(V3(fwd.z, 0, -fwd.x).multiplyScalar(back));
      look = r.position.clone().add(V3(0, 120, 0));
    } else {
      want = r.position.clone().addScaledVector(fwd, -back).add(V3(0, 900, 0));
      look = r.position.clone().add(V3(0, 150, 0)).addScaledVector(fwd, 600);
    }
    this.camPos.lerp(want, 1 - Math.exp(-dt * (this.camMode === 1 ? 20 : 2.5)));
    if (this.camPos.distanceTo(want) > 8000) this.camPos.copy(want);
    G.camera.position.copy(this.camPos);
    G.camera.lookAt(look);
    const fov = 60 + clamp(Math.abs(this.v) / 1400, 0, 1) * 25;
    if (Math.abs(G.camera.fov - fov) > 0.05) {
      G.camera.fov = damp(G.camera.fov, fov, 3, dt);
      G.camera.updateProjectionMatrix();
    }
    this.hudT -= dt;
    if (this.hudT < 0) {
      this.hudT = 0.25;
      if (!this.hud.querySelector(".yh-grid")) this.renderHud();
    }
  }

  /** Empêche de traverser les étages et les tours sur le pont (repoussé vers le bord le plus proche). */
  private collideDeck() {
    const p = G.player.position;
    let l = this.toLocal(p.x, p.z);
    const yl = p.y - this.root.position.y;
    if (Math.abs(l.x) > halfBeam(l.z) + 40) {
      this.onDeck = false;
      return;
    }
    for (const b of this.blocks) {
      if (yl > b.top - 1 || yl < b.bottom - 2) continue;
      const m = 0.5;
      if (l.x > b.x1 - m && l.x < b.x2 + m && l.z > b.z1 - m && l.z < b.z2 + m) {
        const opts = [
          { d: l.x - (b.x1 - m), x: b.x1 - m, z: l.z },
          { d: b.x2 + m - l.x, x: b.x2 + m, z: l.z },
          { d: l.z - (b.z1 - m), x: l.x, z: b.z1 - m },
          { d: b.z2 + m - l.z, x: l.x, z: b.z2 + m }
        ].sort((a, c) => a.d - c.d)[0];
        const w = this.toWorld(V3(opts.x, 0, opts.z));
        p.x = w.x;
        p.z = w.z;
        l = this.toLocal(p.x, p.z);
      }
    }
  }
}

function windowTex() {
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 64;
  const c = cv.getContext("2d")!;
  c.fillStyle = "#0b1626";
  c.fillRect(0, 0, 256, 64);
  for (let x = 0; x < 256; x += 16)
    for (let y = 4; y < 64; y += 20) {
      c.fillStyle = Math.random() < 0.6 ? "#ffd9a0" : "#22364f";
      c.fillRect(x + 2, y, 12, 12);
    }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(40, 2);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function nameplate(text: string) {
  const cv = document.createElement("canvas");
  cv.width = 2048;
  cv.height = 256;
  const c = cv.getContext("2d")!;
  c.fillStyle = "#d8b25a";
  c.font = "bold 170px Georgia, serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(text, 1024, 135);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(400, 50), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide }));
}
