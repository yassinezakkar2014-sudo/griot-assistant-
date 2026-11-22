// LE ROYAL TALON — vaisseau personnel : modèle, cockpit holographique, physique de vol, pilote automatique.
import * as THREE from "three";
import { G, bus, clamp, damp, lerp, normalize } from "../core";
import { mat, HoloScreen } from "../world/materials";
import { buildShipModel, buildSmallShipModel, cloakMaterial, cloakTime } from "./shipmodel";
import { cyl, glowLine } from "../world/build";
import { SPACE_Y } from "./space";

export type ShipView = "cockpit" | "chase" | "cinematic";

/** Échelle du Royal Talon : vaisseau colossal (~78 m de long, ~87 m d'envergure) avec une cabine habitable. */
export const SHIP_SCALE = 6;

export interface ShipOptions {
  name: string;
  scale: number;
  /** emplacement de stationnement (au sol) */
  spawn: THREE.Vector3;
  yaw?: number;
  /** petit vaisseau de Zuria (autre modèle, couleurs bronze) */
  small?: boolean;
  /** construit la plateforme royale géante */
  pad?: boolean;
  accent?: number;
  /** couleurs de la coque et des bords (petits vaisseaux) */
  hull?: number;
  trim?: number;
  /** couleur des réacteurs */
  flame?: number;
}

/** Plateforme d'atterrissage géante, dans la cour nord du palais. */
export const PAD = { x: 0, z: 150 };

export class Ship {
  root = new THREE.Group();
  model = new THREE.Group();
  cockpit = new THREE.Group();
  canopy!: THREE.Mesh;
  energyTex!: THREE.Texture;
  sand!: THREE.Points;
  sandN = 44;
  sideScreens: HoloScreen[] = [];
  orbs: THREE.Mesh[] = [];
  private sandTimer = 0;
  nozzleZ = 6.4;
  gear: THREE.Object3D[] = [];
  exhaust: THREE.Mesh[] = [];
  engineGlow: THREE.MeshStandardMaterial;
  lightMat: THREE.MeshStandardMaterial;
  dash!: HoloScreen;

  // état
  engines = false;
  lights = false;
  ready = false;
  landed = true;
  throttle = 0;
  speed = 0;
  vy = 0;
  yaw = 0;
  pitch = 0;
  roll = 0;
  energy = 1;
  view: ShipView = "chase";
  autopilot: { points: THREE.Vector3[]; label: string; land?: boolean } | null = null;
  private gearT = 1;
  private canopyT = 0;
  private canopyTarget = 0;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private cineAngle = 0;
  private ringIndex = 0;
  private bumpCooldown = 0;

  S: number;
  GEAR: number;
  name: string;
  private samples: THREE.Vector3[];

  constructor(public opts: ShipOptions = { name: "Royal Talon", scale: SHIP_SCALE, spawn: new THREE.Vector3(PAD.x, 0.15, PAD.z), pad: true }) {
    this.S = opts.scale;
    this.GEAR = 1.35 * this.S; // hauteur du centre au-dessus du sol (train sorti)
    this.name = opts.name;
    const accent = opts.accent ?? 0x3fc8ff;
    this.engineGlow = new THREE.MeshStandardMaterial({ color: 0, emissive: opts.flame ?? (opts.small ? 0xff8a2a : 0x2a9dff), emissiveIntensity: 0 });
    this.lightMat = new THREE.MeshStandardMaterial({ color: 0x050810, emissive: accent, emissiveIntensity: 0.05 });
    this.samples = [this.V(0, 0.6, -6.3), this.V(0, 0.6, 6.6), this.V(-6.4, 0.6, 2), this.V(6.4, 0.6, 2), this.V(0, 2.3, -1.5), this.V(-3.9, 0.4, -3.5), this.V(3.9, 0.4, -3.5), this.V(-3.5, 0.6, 5), this.V(3.5, 0.6, 5)];
  }

  V(x: number, y: number, z: number) {
    return new THREE.Vector3(x * this.S, y * this.S, z * this.S);
  }

  build() {
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x23262f, metalness: 0.95, roughness: 0.2 });
    const m = this.model;
    // coque du Royal Talon (modèle partagé avec les vaisseaux des autres joueurs)
    const built = this.opts.small ? buildSmallShipModel(this.lightMat, this.engineGlow, { hull: this.opts.hull, trim: this.opts.trim }) : buildShipModel(this.lightMat, this.engineGlow);
    m.add(built.group);
    this.canopy = built.canopy;
    this.exhaust = built.exhaust;
    this.energyTex = built.energy;
    this.nozzleZ = built.nozzleZ;
    // cockpit intérieur : siège sculpté, console en arc, table holographique de « sable » qui
    // reproduit le relief autour du vaisseau, écrans latéraux, sphères de pilotage lumineuses
    const leather = new THREE.MeshStandardMaterial({ color: 0x15161b, roughness: 0.55, metalness: 0.1 });
    const seatBase = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 0.62), leather);
    seatBase.position.set(0, 1.5, -1.2);
    const seatBack = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.55, 6, 16), leather);
    seatBack.scale.set(1, 1, 0.45);
    seatBack.position.set(0, 2.0, -0.92);
    seatBack.rotation.x = -0.25;
    const piping = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.012, 6, 40), this.lightMat);
    piping.scale.set(1, 1.9, 1);
    piping.position.copy(seatBack.position).add(new THREE.Vector3(0, 0, -0.14));
    piping.rotation.x = -0.25;
    this.cockpit.add(seatBase, seatBack, piping);
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.1, 14, 64, Math.PI), trimMat);
    arc.rotation.x = -Math.PI / 2;
    arc.position.set(0, 1.74, -1.62);
    const arcGlow = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.012, 6, 64, Math.PI), this.lightMat);
    arcGlow.rotation.x = -Math.PI / 2;
    arcGlow.position.set(0, 1.85, -1.62);
    this.cockpit.add(arc, arcGlow);
    // table de sable holographique
    const N = 44;
    const sandGeo = new THREE.BufferGeometry();
    sandGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * N * 3), 3));
    sandGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(N * N * 3), 3));
    this.sand = new THREE.Points(sandGeo, new THREE.PointsMaterial({ size: 0.009, vertexColors: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.sand.position.set(0, 1.9, -2.3);
    this.sandN = N;
    const plateM = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.56, 0.05, 48), trimMat);
    plateM.position.set(0, 1.86, -2.3);
    const plateRing = new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.01, 6, 64), this.lightMat);
    plateRing.rotation.x = Math.PI / 2;
    plateRing.position.set(0, 1.89, -2.3);
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 6), mat.glowGold);
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(0, 2.02, -2.3);
    // table posée plus bas et plus petite, pour garder la vue dégagée
    const table = new THREE.Group();
    table.add(this.sand, plateM, plateRing, marker);
    table.position.set(0, -0.12, -0.6);
    table.scale.setScalar(0.72);
    table.position.z = -2.3 * (1 - 0.72) - 0.15;
    table.position.y = 1.9 * (1 - 0.72) - 0.12;
    this.cockpit.add(table);
    // écran principal + écrans latéraux
    this.dash = new HoloScreen(512, 200, (c, w, h) => this.drawDash(c, w, h));
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.39), this.dash.material);
    dash.scale.setScalar(0.8);
    dash.position.set(0, 1.98, -2.9);
    dash.rotation.x = -0.3;
    this.cockpit.add(dash);
    this.sideScreens = [-1, 1].map((sx) => {
      const scr = new HoloScreen(320, 220, (c, w, h) => this.drawSide(c, w, h, sx));
      const me = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.34), scr.material);
      me.position.set(sx * 0.8, 2.05, -1.95);
      me.rotation.y = -sx * 0.75;
      this.cockpit.add(me);
      return scr;
    });
    // sphères de pilotage (réagissent aux commandes)
    this.orbs = [-1, 1].map((sx) => {
      const glass = new THREE.Mesh(new THREE.SphereGeometry(0.085, 24, 16), new THREE.MeshPhysicalMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.25, roughness: 0, metalness: 0.2 }));
      glass.position.set(sx * 0.46, 1.9, -1.52);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), this.lightMat);
      core.position.copy(glass.position);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.12, 10), trimMat);
      stem.position.copy(glass.position).add(new THREE.Vector3(0, -0.1, 0));
      this.cockpit.add(glass, core, stem);
      return core;
    });
    m.add(this.cockpit);
    // train d'atterrissage
    for (const [x, z] of [[0, -4.5], [-1.6, 3], [1.6, 3]]) {
      const strut = new THREE.Group();
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 8), mat.silver);
      leg.position.y = -0.55;
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.1, 12), mat.graphite);
      pad.position.y = -1.1;
      strut.add(leg, pad);
      strut.position.set(x, 0.3, z);
      m.add(strut);
      this.gear.push(strut);
    }
    m.position.y = -0.3 * this.S;
    m.scale.setScalar(this.S);
    this.root.add(m);
    // volume de collision du vaisseau (le joueur ne le traverse pas)
    const hullBox = new THREE.Mesh(new THREE.BoxGeometry(7.6, 2.2, 13), new THREE.MeshBasicMaterial({ visible: false }));
    hullBox.position.set(0, 0.6 * this.S, -0.5 * this.S);
    hullBox.scale.setScalar(this.S);
    this.root.add(hullBox);
    G.scene.add(this.root);
    if (this.opts.pad) this.buildPad();
    this.park();
    this.body = G.physics.addDynamic(hullBox, "ship");

    G.interact.add({
      id: this.opts.small ? "ship-" + normalize(this.name).replace(/\s+/g, "-") : "ship",
      pos: () => this.root.position.clone().add(new THREE.Vector3(-5.6 * this.S, -this.GEAR + 1, -2.5 * this.S).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw)),
      radius: 9,
      enabled: () => G.mode === "foot" && !this.friendHere,
      label: () => `Monter à bord : ${this.name}`,
      action: () => this.board()
    });
    if (!this.opts.small) this.buildRamp();
  }

  // ---------------------------------------------------------------- rampe arrière → cabine habitable
  private buildRamp() {
    const ramp = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 2.6), new THREE.MeshStandardMaterial({ color: 0x2a2e38, metalness: 0.85, roughness: 0.35 }));
    plate.position.set(0, 0, 1.3);
    ramp.add(plate);
    for (const sx of [-1, 1]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 2.6), this.lightMat);
      edge.position.set(sx * 1.08, 0.05, 1.3);
      ramp.add(edge);
    }
    ramp.position.set(0, -0.15, 6.2);
    ramp.rotation.x = 0.38;
    const door = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.2), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffd2a0, emissiveIntensity: 1.4, side: THREE.DoubleSide }));
    door.position.set(0, 0.45, 6.15);
    this.model.add(ramp, door);
    this.ramp = ramp;
    G.interact.add({
      id: "ship-cabin",
      pos: () => this.root.position.clone().add(new THREE.Vector3(0, -this.GEAR + 1, 8.6 * this.S).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw)),
      radius: 10,
      enabled: () => G.mode === "foot" && this.landed && !!G.cabin && !G.cabin.inside && !this.friendHere,
      label: () => "Entrer dans la cabine du Royal Talon (salon, chambre, télé)",
      action: () => G.cabin.enter()
    });
  }
  ramp: THREE.Object3D | null = null;
  body: import("../engine/physics").Body | null = null;
  /** le Royal Talon d'un ami est posé ici et piloté : on cache le nôtre (pas de vaisseaux superposés) */
  friendHere = false;
  private checkFriends() {
    if (this.opts.small || G.mode === "ship" || G.ship === this && G.mode === "cinematic") return (this.friendHere = false);
    let here = false;
    for (const r of G.net?.peers.values() ?? []) {
      const st = r.state;
      if (st?.s && st.m === "ship" && (st.s as number[])[9] !== 1 && r.shipGroup.position.distanceTo(this.root.position) < 60) here = true;
    }
    this.friendHere = here;
  }

  // ---------------------------------------------------------------- plateforme royale
  padLights = false;
  private padGlow = new THREE.MeshStandardMaterial({ color: 0, emissive: 0x3fc8ff, emissiveIntensity: 1 });
  private buildPad() {
    const g = new THREE.Group();
    G.scene.add(g);
    const c = PAD;
    cyl(g, 62, 0.35, mat.darkFloor, c.x, -0.2, c.z, { seg: 72 });
    for (const [r, w] of [[60, 0.5], [41, 0.3], [19, 0.25]] as [number, number][]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - w, r, 96), this.padGlow);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(c.x, 0.17, c.z);
      g.add(ring);
    }
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 3, 10), mat.black);
      post.position.set(c.x + Math.cos(a) * 62, 1.5, c.z + Math.sin(a) * 62);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), this.padGlow);
      lamp.position.set(post.position.x, 3.2, post.position.z);
      g.add(post, lamp);
    }
    for (let k = -4; k <= 4; k++) glowLine(g, c.x - 1, 0.18, c.z - 62 + 4 + (k + 4) * 7, c.x + 1, 0.19, c.z - 62 + 8 + (k + 4) * 7, mat.glowGold, 0.01);

  }

  // ---------------------------------------------------------------- mode supersonique
  supersonic = false;
  private supersonicFx: { cone: THREE.Mesh; streaks: THREE.LineSegments; booms: { m: THREE.Mesh; t: number }[] } | null = null;
  private wasSupersonicSpeed = false;

  get mach() {
    return Math.abs(this.speed) / 343;
  }

  setSupersonic(on: boolean) {
    if (on === this.supersonic) return;
    if (on && this.opts.small) return bus.emit("toast", { text: `${this.name} n'a pas de mode supersonique.`, kind: "warn" });
    if (on && this.energy < 0.15) return bus.emit("toast", { text: "Énergie insuffisante pour le mode supersonique.", kind: "warn" });
    if (on && !this.engines) this.startEngines(true);
    if (on && this.landed) return bus.emit("toast", { text: "Décollez d'abord : le mode supersonique s'enclenche en vol.", kind: "warn" });
    this.supersonic = on;
    G.audio.whoosh(1.2, on ? 200 : 2000, on ? 3000 : 150, 0.25);
    bus.emit("toast", { text: on ? "🚀 Mode supersonique : post-combustion maximale, jusqu'à Mach 2,8." : "Mode supersonique désactivé." });
  }

  private ensureFx() {
    if (this.supersonicFx) return this.supersonicFx;
    // cône de vapeur (Prandtl-Glauert) autour du fuselage
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(4.2 * this.S, 7 * this.S, 40, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    cone.rotation.x = -Math.PI / 2;
    cone.position.set(0, 0.8 * this.S, -0.5 * this.S);
    this.root.add(cone);
    // traînées de vitesse autour de la caméra
    const N = 160;
    const pos = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2,
        r = 6 + Math.random() * 30,
        z = -Math.random() * 300;
      pos.set([Math.cos(a) * r, Math.sin(a) * r, z, Math.cos(a) * r, Math.sin(a) * r, z - 12], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const streaks = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xcfefff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    streaks.frustumCulled = false;
    G.scene.add(streaks);
    return (this.supersonicFx = { cone, streaks, booms: [] });
  }

  /** Bang sonique : onde de choc visible + détonation sourde. */
  private sonicBoom() {
    const fx = this.ensureFx();
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshBasicMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.copy(this.root.position);
    G.scene.add(m);
    fx.booms.push({ m, t: 0 });
    G.audio.pulse();
    G.audio.tone(55, 1.2, "sawtooth", 0.25, 25);
    bus.emit("shake", 1.2);
    bus.emit("caption", "💥 BANG SONIQUE — Mach 1 franchi");
    bus.emit("mission", { type: "supersonic" });
  }

  private updateSupersonic(dt: number) {
    const mach = this.mach;
    const fast = mach >= 1;
    if (fast !== this.wasSupersonicSpeed) {
      this.wasSupersonicSpeed = fast;
      if (fast) this.sonicBoom();
    }
    if (this.supersonic) {
      this.energy = Math.max(0, this.energy - dt * 0.025);
      if (this.energy <= 0.03) this.setSupersonic(false);
      // sécurité : garde une marge au-dessus du relief
      const p = this.root.position;
      const g = G.physics.terrain(p.x, p.z);
      if (p.y - g < 50 && !this.landed) this.vy = Math.max(this.vy, 25);
    }
    if (!this.supersonicFx && mach < 0.7) return;
    const fx = this.ensureFx();
    const coneOp = Math.max(0, 1 - Math.abs(mach - 1) / 0.25) * 0.55;
    (fx.cone.material as THREE.MeshBasicMaterial).opacity = coneOp * (this.stealth ? 0.2 : 1);
    fx.cone.visible = coneOp > 0.01;
    const streakOp = G.mode === "ship" && G.ship === this ? Math.min(0.8, Math.max(0, mach - 0.6)) : 0;
    const sm = fx.streaks.material as THREE.LineBasicMaterial;
    sm.opacity = streakOp;
    fx.streaks.visible = streakOp > 0.01;
    if (fx.streaks.visible) {
      fx.streaks.position.copy(G.camera.position);
      fx.streaks.quaternion.copy(G.camera.quaternion);
      const arr = fx.streaks.geometry.attributes.position.array as Float32Array;
      const move = Math.abs(this.speed) * dt * 0.35;
      for (let i = 0; i < arr.length; i += 6) {
        arr[i + 2] += move;
        arr[i + 5] += move;
        if (arr[i + 2] > 5) {
          arr[i + 2] -= 300;
          arr[i + 5] -= 300;
        }
      }
      fx.streaks.geometry.attributes.position.needsUpdate = true;
    }
    for (const b of fx.booms) {
      b.t += dt;
      b.m.scale.setScalar(5 + b.t * 260);
      (b.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.5 - b.t * 0.45);
    }
    fx.booms = fx.booms.filter((b) => {
      if (b.t < 1.2) return true;
      G.scene.remove(b.m);
      b.m.geometry.dispose();
      return false;
    });
    // champ de vision élargi à grande vitesse
    if (G.mode === "ship" && G.ship === this) {
      const fov = 70 + Math.min(22, Math.max(0, mach - 0.5) * 12);
      if (Math.abs(G.camera.fov - fov) > 0.05) {
        G.camera.fov = damp(G.camera.fov, fov, 3, dt);
        G.camera.updateProjectionMatrix();
      }
    }
  }

  // ---------------------------------------------------------------- mode furtif
  stealth = false;
  private originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  setStealth(on: boolean) {
    if (on === this.stealth) return;
    if (on && this.energy < 0.1) return bus.emit("toast", { text: "Énergie insuffisante pour le mode furtif.", kind: "warn" });
    this.stealth = on;
    const cloak = cloakMaterial();
    this.model.traverse((o) => {
      const me = o as THREE.Mesh;
      if (!me.isMesh || this.isCockpitPart(me)) return;
      if (on) {
        this.originals.set(me, me.material);
        me.material = cloak;
      } else if (this.originals.has(me)) me.material = this.originals.get(me)!;
    });
    if (!on) this.originals.clear();
    G.audio.whoosh(1.4, on ? 2400 : 200, on ? 120 : 2400, 0.25);
    bus.emit("shake", 0.25);
    bus.emit("toast", { text: on ? "👁‍🗨 Mode furtif activé : le Royal Talon est invisible." : "Mode furtif désactivé." });
    bus.emit("mission", { type: "stealth" });
  }
  private isCockpitPart(o: THREE.Object3D) {
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === this.cockpit) return true;
    return false;
  }

  /** Remet le vaisseau à son emplacement de hangar. */
  park() {
    this.root.position.copy(this.opts.spawn).add(new THREE.Vector3(0, this.GEAR, 0));
    this.yaw = this.opts.yaw ?? 0;
    this.pitch = this.roll = 0;
    this.speed = this.vy = this.throttle = 0;
    this.landed = true;
    this.applyOrientation();
  }

  private applyOrientation() {
    this.root.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, this.roll, "YXZ"));
  }

  forward() {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(this.root.quaternion);
  }

  isInHangar() {
    const p = this.root.position;
    return Math.abs(p.x) < 31 && p.z > -32 && p.z < 31 && p.y > 55 && p.y < 66;
  }

  // ---------------------------------------------------------------- actions
  prepare() {
    this.ready = true;
    this.setLights(true);
    this.padLights = true;
    bus.emit("toast", { text: "🛩 Royal Talon : diagnostics OK, plein d'énergie, plateforme royale éclairée." });
    bus.emit("mission", { type: "ship-ready" });
  }

  setLights(on: boolean) {
    this.lights = on;
  }

  /** Entrée dans le cockpit (séquence cinématique). */
  board(): Promise<void> {
    return new Promise((resolve) => {
      if (G.mode === "ship") return resolve();
      G.ship = this; // ce vaisseau devient le vaisseau actif
      // si le joueur est loin, il est d'abord conduit au vaisseau
      if (G.player.position.distanceTo(this.root.position) > 12) {
        const side = this.root.position.clone().add(new THREE.Vector3(-5.8 * this.S, -this.GEAR, -2.5 * this.S).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw));
        G.player.teleport(side, this.yaw - Math.PI / 2);
      }
      G.mode = "cinematic";
      G.armor.onVehicle(true);
      this.canopyTarget = 1;
      const from = G.camera.position.clone();
      const fromQ = G.camera.quaternion.clone();
      const start = performance.now();
      const step = () => {
        const t = Math.min(1, (performance.now() - start) / 1800);
        const e = t * t * (3 - 2 * t);
        const seatPos = this.root.localToWorld(this.V(0, 1.95, -1.5));
        const lookAt = this.root.localToWorld(this.V(0, 1.7, -12));
        const mid = this.root.localToWorld(this.V(-6, 5, 2));
        const p1 = from.clone().lerp(mid, e);
        G.camera.position.copy(p1.lerp(seatPos, e));
        const m4 = new THREE.Matrix4().lookAt(G.camera.position, lookAt, new THREE.Vector3(0, 1, 0));
        G.camera.quaternion.copy(fromQ).slerp(new THREE.Quaternion().setFromRotationMatrix(m4), e);
        if (t < 1) requestAnimationFrame(step);
        else {
          this.canopyTarget = 0;
          G.mode = "ship";
          this.view = "cockpit";
          this.camPos.copy(G.camera.position);
          bus.emit("toast", { text: "Aux commandes. R : moteurs · Espace : monter · W/S : poussée · V : vue · I : cabine · O : espace · F : sortir" });
          bus.emit("mode");
          resolve();
        }
      };
      step();
    });
  }

  startEngines(on = true) {
    if (on === this.engines) return;
    this.engines = on;
    if (on) {
      this.setLights(true);
      G.audio.unlock();
      G.audio.setEngine(0.1);
      G.audio.whoosh(2.2, 80, 1200, 0.2);
      bus.emit("toast", { text: "🔥 Moteurs démarrés." });
      bus.emit("mission", { type: "engines" });
    } else {
      G.audio.setEngine(null);
      this.throttle = 0;
      bus.emit("toast", { text: "Moteurs coupés." });
    }
  }

  takeoff() {
    if (G.mode !== "ship") return;
    if (!this.engines) this.startEngines(true);
    const p = this.root.position.clone();
    if (this.isInHangar()) {
      G.palace.doors.get("door-hangar")?.open();
      this.autopilot = {
        label: "Décollage",
        points: [new THREE.Vector3(p.x, 59.5, p.z), new THREE.Vector3(0, 60, -40), new THREE.Vector3(0, 90, -160)]
      };
    } else {
      const g = G.physics.ground(p.x, p.y, p.z).y;
      this.autopilot = { label: "Décollage", points: [new THREE.Vector3(p.x, g + 70, p.z)] };
    }
    this.landed = false;
  }

  /** Vol automatique vers une destination (utilisé par GRIOT). */
  flyTo(dest: THREE.Vector3, label: string) {
    const p = this.root.position;
    const pts: THREE.Vector3[] = [];
    if (this.isInHangar()) {
      G.palace.doors.get("door-hangar")?.open();
      pts.push(new THREE.Vector3(p.x, 59.5, p.z), new THREE.Vector3(0, 60, -40), new THREE.Vector3(0, 110, -160));
    } else if (this.landed) pts.push(new THREE.Vector3(p.x, p.y + 70, p.z));
    const cruise = Math.max(dest.y + 120, 180);
    pts.push(new THREE.Vector3(dest.x, cruise, dest.z));
    this.autopilot = { points: pts, label };
    this.landed = false;
    if (!this.engines) this.startEngines(true);
  }

  land() {
    const p = this.root.position;
    const g = G.physics.ground(p.x, p.y - this.GEAR, p.z, 0.5).y;
    this.autopilot = { label: "Atterrissage", points: [new THREE.Vector3(p.x, g + this.GEAR, p.z)], land: true };
  }

  exit() {
    if (G.mode !== "ship") return;
    const pp = this.root.position;
    const agl = pp.y - this.GEAR - G.physics.ground(pp.x, pp.y - this.GEAR + 0.6, pp.z, 0.6).y;
    if (!this.landed && (this.speed > 4 || agl > 4)) {
      bus.emit("toast", { text: "Atterrissez d'abord (H : atterrissage automatique).", kind: "warn" });
      return;
    }
    const side = this.root.position.clone().add(new THREE.Vector3(-5.8 * this.S, 0, -2.5 * this.S).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw));
    side.y = G.physics.ground(side.x, this.root.position.y, side.z, 2).y;
    G.mode = "foot";
    this.supersonic = false;
    G.camera.fov = 70;
    G.camera.updateProjectionMatrix();
    G.armor.onVehicle(false);
    this.throttle = 0;
    G.player.teleport(side, this.yaw);
    bus.emit("mode");
  }

  // ---------------------------------------------------------------- simulation
  update(dt: number, t: number) {
    // animations visuelles
    this.gearT = damp(this.gearT, this.landed || this.root.position.y - G.physics.ground(this.root.position.x, this.root.position.y - this.GEAR, this.root.position.z, 0.5).y < 12 * this.S ? 1 : 0, 3, dt);
    this.gear.forEach((g) => (g.scale.y = Math.max(0.05, this.gearT)));
    if (this.ramp) this.ramp.rotation.x = damp(this.ramp.rotation.x, this.landed && G.mode !== "ship" ? 0.38 : -0.05, 3, dt);
    this.canopyT = damp(this.canopyT, this.canopyTarget, 4, dt);
    this.canopy.position.y = 1.55 + this.canopyT * 0.7;
    this.energyTex.offset.y = (t * 0.6) % 1;
    this.canopy.rotation.x = -this.canopyT * 0.5;
    this.lightMat.emissiveIntensity = this.lights ? 2.2 + Math.sin(t * 2) * 0.3 : 0.05;
    this.padGlow.emissiveIntensity = this.padLights ? 2 + Math.sin(t * 3) : 0.6;
    cloakTime.value = t;
    this.updateSupersonic(dt);
    if (this.stealth) {
      this.energy = Math.max(0, this.energy - dt * 0.015);
      if (this.energy <= 0.02) this.setStealth(false);
    }
    const thrVis = this.engines ? 0.35 + this.throttle * 0.65 : 0;
    this.engineGlow.emissiveIntensity = this.engines ? 1.5 + this.throttle * 5 : 0;
    this.exhaust.forEach((e) => {
      e.visible = this.engines && !this.stealth;
      e.scale.set(1, thrVis * (1 + Math.random() * 0.1) * (G.input.down("ShiftLeft") && this.canBoost() ? 1.8 : 1), 1);
      e.position.z = this.nozzleZ + 2 * e.scale.y;
    });

    if (G.mode !== "ship" || G.ship !== this) {
      this.updateIdleGround();
      this.checkFriends();
      this.root.visible = !this.friendHere;
      if (this.body) this.body.enabled = !this.friendHere;
      return;
    }
    this.root.visible = true;
    if (this.body) this.body.enabled = true;
    const inp = G.input;
    if (inp.hit("KeyR")) this.startEngines(!this.engines);
    if (inp.hit("KeyL")) this.setLights(!this.lights);
    if (inp.hit("KeyK")) this.setStealth(!this.stealth);
    if (inp.hit("KeyB")) this.setSupersonic(!this.supersonic);
    if (inp.hit("KeyV")) this.cycleView();
    if (inp.hit("KeyF")) return this.exit();
    if (inp.hit("KeyH")) this.land();
    if (inp.hit("KeyI") && !this.opts.small && G.cabin) return void G.cabin.enter();
    if (inp.hit("KeyO") && !this.opts.small) {
      if (G.space.active) G.space.exit();
      else G.space.enter();
    }

    const look = inp.consumeMouse();
    const thrIn = inp.axis(["KeyS"], ["KeyW"]) + (inp.down("TouchThrottleUp") ? 1 : 0) - (inp.down("TouchThrottleDown") ? 1 : 0);
    // PC : la souris fait tourner le vaisseau (gauche/droite) et le cabre (haut/bas)
    const yawIn = clamp(inp.axis(["KeyD"], ["KeyA"]) - inp.touchMove.x - look.x * 14, -1.6, 1.6);
    const rollIn = inp.axis(["KeyE"], ["KeyQ"]);
    const pitchIn = inp.axis(["ArrowDown"], ["ArrowUp"]) - look.y * 18 + -inp.touchMove.y * 0.8;
    const liftIn = inp.axis(["KeyC", "ControlLeft", "TouchDown"], ["Space", "TouchUp"]);
    const manual = Math.abs(thrIn) + Math.abs(yawIn) + Math.abs(pitchIn) + Math.abs(liftIn) + Math.abs(rollIn) > 0.05;
    if (manual && this.autopilot) {
      this.autopilot = null;
      bus.emit("toast", { text: "Pilote automatique désengagé." });
    }

    const tech = G.missions.state.tech;
    const maxSpeed = this.supersonic ? 950 : 140 * (tech.includes("fusion") ? 1.25 : 1);
    if (this.supersonic && !this.autopilot && !this.landed) this.throttle = Math.max(this.throttle, 0.9);
    const boost = inp.down("ShiftLeft", "ShiftRight") && this.canBoost();
    if (boost) this.energy = Math.max(0, this.energy - dt * 0.08);
    else this.energy = Math.min(1, this.energy + dt * 0.03);

    let yawRate = 0,
      pitchTarget = this.pitch,
      vyTarget = 0;
    if (this.autopilot) {
      const ap = this.autopilot;
      const target = ap.points[0];
      const p = this.root.position;
      const to = target.clone().sub(p);
      const horiz = Math.hypot(to.x, to.z);
      const desiredYaw = Math.atan2(-to.x, -to.z);
      let dy = desiredYaw - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      yawRate = clamp(dy * 1.5, -0.9, 0.9);
      const slow = this.isInHangar() || p.z > -60 && Math.hypot(p.x, p.z) < 60;
      const cruise = slow ? 14 : horiz > 600 ? maxSpeed : Math.max(25, horiz * 0.25);
      this.throttle = damp(this.throttle, horiz > 6 && !ap.land ? cruise / maxSpeed : 0, 2, dt);
      if (Math.abs(dy) > 0.6 && horiz > 6) this.throttle = Math.min(this.throttle, horiz < 120 ? 0.02 : 0.12);
      if (ap.land || horiz < 6) yawRate = 0;
      vyTarget = clamp(to.y * 0.8, ap.land ? -30 : -25, 30);
      if (ap.land && to.y > -8) vyTarget = Math.min(vyTarget, -3);
      pitchTarget = 0;
      if (ap.land ? this.landed : to.length() < (slow ? 5 : 40)) {
        ap.points.shift();
        if (!ap.points.length) {
          if (ap.land) bus.emit("toast", { text: "Atterrissage terminé." });
          else if (ap.label !== "Décollage") bus.emit("griot:say", { text: `${ap.label} : nous y sommes. Reprenez les commandes, ou dites « atterris ».` });
          bus.emit("autopilot:done", ap.label);
          this.autopilot = null;
          this.throttle = 0;
        }
      }
    } else {
      this.throttle = clamp(this.throttle + thrIn * dt * 0.45, 0, 1);
      yawRate = yawIn * (this.landed ? 0.7 : 0.95);
      pitchTarget = clamp(this.pitch + pitchIn * dt * 1.1, -1.1, 1.1);
      vyTarget = liftIn * 20;
      if (Math.abs(pitchIn) < 0.01 && !this.landed) pitchTarget = damp(this.pitch, 0, 0.15, dt);
    }

    if (!this.engines) {
      this.throttle = 0;
      vyTarget = this.landed ? 0 : -30;
    }
    const target = this.throttle * maxSpeed * (boost ? 1.8 : 1);
    this.speed = damp(this.speed, this.landed ? Math.min(target, 10) : target, this.engines ? (this.supersonic ? 0.45 : 0.9) : 0.3, dt);
    this.vy = damp(this.vy, vyTarget, this.engines ? 2.5 : 0.8, dt);
    this.yaw += yawRate * dt;
    this.pitch = this.landed ? damp(this.pitch, 0, 6, dt) : pitchTarget;
    const rollTarget = this.landed ? 0 : -yawRate * 0.7 + rollIn * 0.9;
    this.roll = damp(this.roll, rollTarget, 3, dt);
    if (this.landed && this.engines && (vyTarget > 1 || this.speed > 6)) this.landed = false;
    if (this.landed && !this.engines) this.speed = damp(this.speed, 0, 3, dt);
    this.applyOrientation();

    // intégration + collisions
    const prev = this.root.position.clone();
    const vel = this.forward().multiplyScalar(this.speed).add(new THREE.Vector3(0, this.vy, 0));
    const p = this.root.position;
    const steps = Math.max(1, Math.ceil((vel.length() * dt) / 6));
    let hit: ReturnType<Ship["collides"]> = null;
    for (let k = 0; k < steps && !hit; k++) {
      prev.copy(p);
      p.addScaledVector(vel, dt / steps);
      hit = this.collides();
    }
    p.y = Math.min(p.y, G.space?.active ? SPACE_Y + 8000 : 2600);
    if (Math.abs(p.x) > 31000 || Math.abs(p.z) > 31000) {
      p.x = clamp(p.x, -31000, 31000);
      p.z = clamp(p.z, -31000, 31000);
      this.yaw += Math.PI * dt;
    }
    this.bumpCooldown -= dt;
    if (hit) {
      p.copy(prev);
      // déjà en contact (immobile contre un obstacle) : on se dégage latéralement
      const still = this.collides();
      if (still) {
        const c = still.box.getCenter(new THREE.Vector3());
        const away = p.clone().sub(c).setY(0);
        if (away.lengthSq() < 1e-4) away.set(1, 0, 0);
        p.addScaledVector(away.normalize(), 1.5);
        p.y += 0.3;
      }
      if (this.speed > 20 && this.bumpCooldown <= 0) {
        bus.emit("toast", { text: "⚠ Impact ! Boucliers absorbés.", kind: "warn" });
        G.audio.whoosh(0.4, 200, 80, 0.3);
        bus.emit("shake", 0.6);
      }
      this.speed *= -0.25;
      this.vy = Math.max(0, this.vy);
      if (this.autopilot && this.bumpCooldown <= 0 && this.autopilot.points.length < 8) this.autopilot.points.unshift(p.clone().add(new THREE.Vector3(0, 25, 0)));
      this.bumpCooldown = 1;
    }
    const g = G.physics.ground(p.x, p.y - this.GEAR + 0.6, p.z, 0.6).y;
    if (p.y < g + this.GEAR) {
      const impact = -this.vy;
      p.y = g + this.GEAR;
      if (this.vy < 0) this.vy = 0;
      if (!this.landed && this.speed < 45 && Math.abs(this.pitch) < 0.5) {
        this.landed = true;
        this.pitch = this.roll = 0;
        if (impact > 12) bus.emit("shake", 0.4);
        bus.emit("mission", { type: "landed", pos: p.clone() });
      } else if (!this.landed) {
        this.pitch = Math.max(this.pitch, 0.15);
        if (this.speed > 45 && this.bumpCooldown <= 0) {
          bus.emit("toast", { text: "⚠ Rase-mottes ! Redressez.", kind: "warn" });
          this.bumpCooldown = 1;
        }
      }
    }
    G.audio.setEngine(this.engines ? (this.throttle + (boost ? 0.4 : 0)) * (this.stealth ? 0.25 : 1) : null);
    this.checkRings();
    if (!this.landed && p.y > 300) bus.emit("mission", { type: "altitude", y: p.y });
    this.updateCamera(dt);
    if (this.view === "cockpit" && Math.floor(t * 10) !== Math.floor((t - dt) * 10)) {
      this.dash.refresh(t);
      this.sideScreens.forEach((sc) => sc.refresh(t));
    }
    this.orbs[0].scale.setScalar(1 + this.throttle * 0.8);
    this.orbs[1].scale.setScalar(1 + Math.min(1, Math.abs(this.roll) * 2));
    this.sandTimer -= dt;
    if (this.view === "cockpit" && this.sandTimer <= 0) {
      this.sandTimer = 0.15;
      this.updateSand();
    }
  }

  canBoost() {
    return G.missions.state.tech.includes("gravity") && this.energy > 0.05;
  }

  private updateIdleGround() {
    // vaisseau garé : reste posé
    if (!this.landed) {
      const p = this.root.position;
      const g = G.physics.ground(p.x, p.y - this.GEAR + 0.6, p.z, 0.6).y;
      p.y = Math.max(g + this.GEAR, p.y - 9 * (1 / 60));
      if (p.y <= g + this.GEAR + 0.01) this.landed = true;
    }
  }

  private collides() {
    this.root.updateMatrixWorld();
    for (const s of this.samples) {
      const w = this.root.localToWorld(s.clone());
      const b = G.physics.pointInSolid(w);
      if (b) return b;
    }
    return null;
  }

  private checkRings() {
    const rings = G.world.rings;
    if (!rings.length || G.missions.isDone("rings")) return;
    const r = rings[this.ringIndex % rings.length];
    const d = this.root.position.clone().sub(r.pos);
    if (d.length() < 38 && Math.abs(d.dot(r.normal)) < 14) {
      (r.mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x3fff9a);
      this.ringIndex++;
      G.audio.confirm();
      bus.emit("mission", { type: "ring", index: this.ringIndex, total: rings.length });
    }
    rings.forEach((rr, i) => {
      const m = rr.mesh.material as THREE.MeshStandardMaterial;
      if (i >= this.ringIndex) m.emissive.setHex(i === this.ringIndex ? 0xffc861 : 0x8a6a2a);
    });
  }

  cycleView() {
    this.view = this.view === "cockpit" ? "chase" : this.view === "chase" ? "cinematic" : "cockpit";
    bus.emit("toast", { text: { cockpit: "Vue cockpit", chase: "Vue extérieure (3e personne)", cinematic: "Vue cinématique" }[this.view] });
  }

  private updateCamera(dt: number) {
    const cam = G.camera;
    if (this.view === "cockpit") {
      cam.position.copy(this.root.localToWorld(this.V(0, 1.95, -1.5)));
      cam.quaternion.copy(this.root.quaternion);
      cam.rotateX(-0.08);
      return;
    }
    if (this.view === "chase") {
      const yawQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch * 0.5, this.yaw, 0, "YXZ"));
      const back = new THREE.Vector3(0, 4.5 * this.S, 19 * this.S + this.speed * 0.08).applyQuaternion(yawQ);
      const want = this.root.position.clone().add(back);
      // téléportation (espace, rentrée) : la caméra saute directement au bon endroit
      if (this.camPos.distanceTo(want) > 2000) {
        this.camPos.copy(want);
        this.camLook.copy(this.root.position);
      }
      this.camPos.lerp(want, 1 - Math.exp(-dt * 6));
      const g = G.physics.terrain(this.camPos.x, this.camPos.z);
      if (this.camPos.y < g + 1.5) this.camPos.y = g + 1.5;
      this.camLook.lerp(this.root.position.clone().add(this.forward().multiplyScalar(10)), 1 - Math.exp(-dt * 10));
      cam.position.copy(this.camPos);
      cam.lookAt(this.camLook);
      return;
    }
    this.cineAngle += dt * 0.25;
    const r = 26 * this.S;
    const want = this.root.position.clone().add(new THREE.Vector3(Math.cos(this.cineAngle) * r, (6 + Math.sin(this.cineAngle * 0.7) * 3) * this.S, Math.sin(this.cineAngle) * r));
    this.camPos.lerp(want, 1 - Math.exp(-dt * 3));
    cam.position.copy(this.camPos);
    cam.lookAt(this.root.position);
  }

  /** Relief autour du vaisseau (800 m) reproduit en particules : la carte « de sable ». */
  private updateSand() {
    const N = this.sandN;
    const pos = this.sand.geometry.attributes.position as THREE.BufferAttribute;
    const col = this.sand.geometry.attributes.color as THREE.BufferAttribute;
    const p = this.root.position;
    const c = Math.cos(this.yaw),
      sn = Math.sin(this.yaw);
    const span = 900;
    let k = 0;
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1) - 0.5,
          v = j / (N - 1) - 0.5;
        const lx = u * span,
          lz = v * span;
        const wx = p.x + lx * c + lz * sn,
          wz = p.z - lx * sn + lz * c;
        const h = G.physics.terrain(wx, wz);
        const y = Math.max(-0.02, Math.min(0.22, (h + 10) / 900));
        pos.setXYZ(k, u * 0.95, y, v * 0.95);
        if (h < -2) col.setXYZ(k, 0.1, 0.45, 1);
        else if (h > 420) col.setXYZ(k, 0.95, 0.97, 1);
        else col.setXYZ(k, 0.95, 0.72 + y, 0.32);
        k++;
      }
    pos.needsUpdate = col.needsUpdate = true;
  }

  private drawSide(c: CanvasRenderingContext2D, w: number, h: number, side: number) {
    c.clearRect(0, 0, w, h);
    c.fillStyle = "rgba(0,18,36,.82)";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = "#3fc8ff";
    c.lineWidth = 2;
    c.strokeRect(2, 2, w - 4, h - 4);
    c.fillStyle = "#bff0ff";
    c.font = "bold 20px Orbitron, Arial";
    if (side < 0) {
      c.fillText("SYSTÈMES", 14, 32);
      const rows: [string, number][] = [["Énergie", this.energy], ["Poussée", this.throttle], ["Boucliers", 1], ["Train", this.landed ? 1 : 0]];
      c.font = "16px Arial";
      rows.forEach(([k, v], i) => {
        const y = 66 + i * 38;
        c.fillStyle = "#8fc8e8";
        c.fillText(k, 14, y);
        c.fillStyle = "rgba(63,200,255,.2)";
        c.fillRect(120, y - 14, 180, 14);
        c.fillStyle = "#3fc8ff";
        c.fillRect(120, y - 14, 180 * Math.max(0, Math.min(1, v)), 14);
      });
    } else {
      c.fillText("NAVIGATION", 14, 32);
      if (G.world?.mapCanvas) {
        const pp = this.root.position;
        const [mx, my] = G.world.toMap(pp.x, pp.z, 512);
        c.drawImage(G.world.mapCanvas, mx - 40, my - 30, 80, 60, 14, 44, w - 28, h - 58);
        c.fillStyle = "#ffd27a";
        c.beginPath();
        c.arc(w / 2, 44 + (h - 58) / 2, 6, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = "#bff0ff";
      c.font = "14px Arial";
      c.fillText(G.world ? G.world.zoneName(this.root.position) : "", 14, h - 10);
    }
  }

  private drawDash(c: CanvasRenderingContext2D, w: number, h: number) {
    c.clearRect(0, 0, w, h);
    c.fillStyle = "rgba(0,20,40,.85)";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = "#3fc8ff";
    c.lineWidth = 2;
    c.strokeRect(2, 2, w - 4, h - 4);
    c.fillStyle = "#bff0ff";
    c.font = "bold 26px Orbitron, Arial";
    c.fillText(`${Math.round(Math.abs(this.speed) * 3.6)} km/h`, 18, 44);
    c.fillText(`ALT ${Math.round(this.root.position.y)} m`, 18, 84);
    c.font = "18px Arial";
    c.fillText(this.engines ? "MOTEURS : EN MARCHE" : "MOTEURS : ARRÊT", 18, 124);
    c.fillText(`ÉNERGIE ${Math.round(this.energy * 100)} %`, 18, 154);
    // horizon artificiel
    const cx = w - 110,
      cy = h / 2;
    c.save();
    c.beginPath();
    c.arc(cx, cy, 80, 0, Math.PI * 2);
    c.clip();
    c.translate(cx, cy);
    c.rotate(-this.roll);
    c.fillStyle = "#123a66";
    c.fillRect(-120, -120 + this.pitch * 90, 240, 120);
    c.fillStyle = "#3a2a14";
    c.fillRect(-120, this.pitch * 90, 240, 120);
    c.strokeStyle = "#fff";
    c.beginPath();
    c.moveTo(-120, this.pitch * 90);
    c.lineTo(120, this.pitch * 90);
    c.stroke();
    c.restore();
    c.strokeStyle = "#ffd27a";
    c.beginPath();
    c.moveTo(cx - 40, cy);
    c.lineTo(cx - 10, cy);
    c.moveTo(cx + 10, cy);
    c.lineTo(cx + 40, cy);
    c.stroke();
    c.fillStyle = "rgba(63,200,255,.4)";
    c.fillRect(18, h - 26, (w - 260) * this.throttle, 10);
    void lerp;
  }
}
