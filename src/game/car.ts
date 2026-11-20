// VOITURES DE LUXE « ADAMAS » — modèles détaillés (peinture vernie, chromes, vitres, intérieur cuir),
// portes animées, montée à bord, moteur, phares, conduite (vue extérieure ou intérieure).
// Designs originaux : aucune marque ni logo existant.
import * as THREE from "three";
import { G, bus, clamp, damp } from "../core";
import type { Body } from "../engine/physics";
import { applyPBR, leatherPBR } from "../world/pbr";

export type CarStyle = "sedan" | "suv" | "coupe";
interface Spec {
  L: number; W: number; clr: number; hoodF: number; belt: number;
  xw0: number; xw1: number; roof: number; xr1: number; xr0: number; trunkY: number; R: number; doors: 2 | 4;
}
const SPECS: Record<CarStyle, Spec> = {
  sedan: { L: 5.4, W: 1.98, clr: 0.32, hoodF: 0.84, belt: 1.03, xw0: 1.15, xw1: 0.42, roof: 1.47, xr1: -1.0, xr0: -1.95, trunkY: 0.99, R: 0.38, doors: 4 },
  suv: { L: 5.25, W: 2.05, clr: 0.42, hoodF: 1.08, belt: 1.25, xw0: 1.45, xw1: 0.95, roof: 1.9, xr1: -2.25, xr0: -2.5, trunkY: 1.22, R: 0.44, doors: 4 },
  coupe: { L: 4.85, W: 1.98, clr: 0.28, hoodF: 0.66, belt: 0.86, xw0: 0.9, xw1: 0.1, roof: 1.25, xr1: -0.9, xr0: -2.0, trunkY: 0.84, R: 0.37, doors: 2 }
};

export interface CarDef {
  id: string;
  name: string;
  style: CarStyle;
  color: number;
  interior: number;
}

const chrome = new THREE.MeshStandardMaterial({ color: 0xe8ecf2, metalness: 1, roughness: 0.07 });
const rubber = new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.85 });
const trimBlack = new THREE.MeshStandardMaterial({ color: 0x08080a, metalness: 0.4, roughness: 0.35 });
const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x0d1820, metalness: 0.2, roughness: 0.02, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false, clearcoat: 1 });
const caliper = new THREE.MeshStandardMaterial({ color: 0xb8892a, metalness: 0.6, roughness: 0.3 });


/** Transforme un profil latéral (x = avant, y = haut) extrudé sur la largeur en géométrie orientée -Z = avant. */
function profileGeo(pts: [number, number][], depth: number, bevel = 0.06) {
  const sh = new THREE.Shape();
  sh.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) sh.lineTo(x, y);
  const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 8 });
  geo.translate(0, 0, -depth / 2);
  geo.rotateY(Math.PI / 2);
  return geo;
}

/** Plaque mince entre deux points du profil (pare-brise, lunette arrière, montants). */
function slab(a: [number, number], b: [number, number], width: number, thick: number, m: THREE.Material) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const me = new THREE.Mesh(new THREE.BoxGeometry(width, thick, len), m);
  me.position.set(0, (a[1] + b[1]) / 2, -(a[0] + b[0]) / 2);
  me.rotation.x = Math.atan2(-dy, -dx) + Math.PI;
  return me;
}

function screenTexture(name: string) {
  const cv = document.createElement("canvas");
  cv.width = 512;
  cv.height = 160;
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  const draw = (speed: number, on: boolean) => {
    const c = cv.getContext("2d")!;
    const g = c.createLinearGradient(0, 0, 512, 0);
    g.addColorStop(0, "#02060f");
    g.addColorStop(1, "#071a33");
    c.fillStyle = g;
    c.fillRect(0, 0, 512, 160);
    c.fillStyle = on ? "#bfe9ff" : "#3a5a78";
    c.font = "bold 64px Arial";
    c.fillText(on ? String(Math.round(Math.abs(speed) * 3.6)) : "—", 30, 90);
    c.font = "22px Arial";
    c.fillText(on ? "km/h" : "MOTEUR À L'ARRÊT", 30, 130);
    c.textAlign = "right";
    c.font = "bold 30px Arial";
    c.fillStyle = "#d8b25a";
    c.fillText("ADAMAS", 490, 60);
    c.font = "20px Arial";
    c.fillStyle = "#8fb8d8";
    c.fillText(name, 490, 100);
    c.fillText(on ? "◉ PRÊTE" : "○ VEILLE", 490, 135);
    t.needsUpdate = true;
  };
  return { t, draw };
}

export class Car {
  root = new THREE.Group();
  body = new THREE.Group(); // inclinaison visuelle
  doors: { pivot: THREE.Group; side: number }[] = [];
  wheels: THREE.Group[] = [];
  steerPivots: THREE.Group[] = [];
  headMat = new THREE.MeshStandardMaterial({ color: 0x0, emissive: 0xffffff, emissiveIntensity: 0.15 });
  tailMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff1020, emissiveIntensity: 0.3 });
  ambientMat = new THREE.MeshStandardMaterial({ color: 0x0, emissive: 0x3fa8ff, emissiveIntensity: 0.4 });
  spec: Spec;
  screen: ReturnType<typeof screenTexture>;
  doorT = 0;
  doorTarget = 0;
  engine = false;
  speed = 0;
  steer = 0;
  yaw = 0;
  spin = 0; // plateau tournant
  phys: Body | null = null;
  /** conduite par un autre joueur (id) */
  remoteBy: string | null = null;
  netTarget = new THREE.Vector3();
  netYaw = 0;
  driverHead: THREE.Vector3;
  driverSide: THREE.Vector3;

  constructor(public def: CarDef) {
    const s = (this.spec = SPECS[def.style]);
    const paint = new THREE.MeshPhysicalMaterial({ color: def.color, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.03 });
    const leather = applyPBR(new THREE.MeshStandardMaterial({ color: def.interior }), leatherPBR(), 0.4);
    const L = s.L,
      W = s.W;
    const add = (m: THREE.Mesh, parent: THREE.Object3D = this.body) => {
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    this.root.add(this.body);

    // caisse basse jusqu'à la ligne de ceinture
    add(new THREE.Mesh(profileGeo([[-L / 2 + 0.12, s.clr], [L / 2 - 0.15, s.clr], [L / 2, s.clr + 0.22], [L / 2 - 0.03, s.hoodF], [s.xw0, s.belt], [s.xr0, s.belt], [-L / 2 + 0.04, s.trunkY], [-L / 2, s.clr + 0.25]], W - 0.12, 0.06), paint));
    // pavillon, montants, vitres
    const roofLen = s.xw1 - s.xr1;
    add(new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 0.07, roofLen), paint)).position.set(0, s.roof, -(s.xw1 + s.xr1) / 2);
    add(slab([s.xw0, s.belt], [s.xw1, s.roof], W - 0.3, 0.02, glassMat));
    add(slab([s.xr1, s.roof], [s.xr0, s.belt], W - 0.3, 0.02, glassMat));
    for (const sx of [-1, 1]) {
      const a = add(slab([s.xw0, s.belt], [s.xw1, s.roof], 0.09, 0.09, paint));
      a.position.x = sx * (W / 2 - 0.12);
      const c = add(slab([s.xr1, s.roof], [s.xr0, s.belt], 0.12, 0.09, paint));
      c.position.x = sx * (W / 2 - 0.12);
    }
    const xb = s.doors === 4 ? (s.xw0 + s.xr0) / 2 + 0.15 : s.xr0 + 0.35;
    for (const sx of [-1, 1]) {
      if (s.doors === 4) {
        const bp = add(new THREE.Mesh(new THREE.BoxGeometry(0.08, s.roof - s.belt, 0.12), trimBlack));
        bp.position.set(sx * (W / 2 - 0.1), (s.roof + s.belt) / 2, -xb);
      }
    }
    // calandre chromée, phares, feux
    const grille = add(new THREE.Mesh(new THREE.BoxGeometry(0.75, s.hoodF - s.clr - 0.3, 0.05), chrome));
    grille.position.set(0, (s.hoodF + s.clr + 0.18) / 2, -L / 2 - 0.005);
    for (let k = -4; k <= 4; k++) {
      const bar = add(new THREE.Mesh(new THREE.BoxGeometry(0.03, s.hoodF - s.clr - 0.36, 0.04), trimBlack));
      bar.position.set(k * 0.08, grille.position.y, -L / 2 - 0.02);
    }
    for (const sx of [-1, 1]) {
      const hl = add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.06), this.headMat));
      hl.position.set(sx * (W / 2 - 0.36), s.hoodF - 0.1, -L / 2 + 0.03);
      const drl = add(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.015, 0.05), this.headMat));
      drl.position.set(sx * (W / 2 - 0.36), s.hoodF - 0.17, -L / 2 + 0.035);
      const mirror = add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.1), paint));
      mirror.position.set(sx * (W / 2 + 0.06), s.belt + 0.06, -(s.xw0 - 0.15));
    }
    const tail = add(new THREE.Mesh(new THREE.BoxGeometry(W - 0.3, 0.05, 0.05), this.tailMat));
    tail.position.set(0, s.trunkY - 0.1, L / 2 + 0.01);
    const chromeStrip = add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, L - 0.8), chrome));
    for (const sx of [-1, 1]) {
      const cs = sx < 0 ? chromeStrip : add(chromeStrip.clone() as THREE.Mesh);
      cs.position.set(sx * (W / 2 - 0.03), s.belt - 0.01, 0);
    }
    // portes (pivot à l'avant, s'ouvrent vers l'extérieur) avec leur vitre
    const doorSegs: [number, number][] = s.doors === 4 ? [[s.xw0 - 0.02, xb + 0.02], [xb - 0.02, s.xr0 + 0.08]] : [[s.xw0 - 0.02, s.xr0 + 0.3]];
    for (const sx of [-1, 1])
      doorSegs.forEach(([xf, xr], i) => {
        const pivot = new THREE.Group();
        pivot.position.set(sx * (W / 2 - 0.02), 0, -xf);
        const panel = new THREE.Mesh(profileGeo([[xf, s.clr + 0.12], [xr, s.clr + 0.12], [xr, s.belt - 0.02], [xf, s.belt - 0.02]], 0.05, 0.01), paint);
        panel.position.set(0, 0, xf);
        const top: [number, number][] =
          s.doors === 2
            ? [[s.xw0 - 0.06, s.belt + 0.02], [s.xw1 + 0.06, s.roof - 0.06], [s.xr1 + 0.06, s.roof - 0.06], [s.xr0 + 0.1, s.belt + 0.02]]
            : i === 0
              ? [[s.xw0 - 0.06, s.belt + 0.02], [s.xw1 + 0.06, s.roof - 0.06], [xb + 0.02, s.roof - 0.06], [xb + 0.02, s.belt + 0.02]]
              : [[xb - 0.02, s.belt + 0.02], [xb - 0.02, s.roof - 0.06], [s.xr1 + 0.06, s.roof - 0.06], [s.xr0 + 0.1, s.belt + 0.02]];
        const win = new THREE.Mesh(profileGeo(top, 0.02, 0), glassMat);
        win.position.set(-sx * 0.04, 0, xf);
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.2), chrome);
        handle.position.set(sx * 0.035, s.belt - 0.15, (xf - xr) * 0.8);
        pivot.add(panel, win, handle);
        panel.castShadow = true;
        this.body.add(pivot);
        this.doors.push({ pivot, side: sx });
      });
    // roues : pneus, jantes à branches chromées, étriers
    const wb = L / 2 - 0.95;
    for (const zf of [-wb, wb])
      for (const sx of [-1, 1]) {
        const steer = new THREE.Group();
        steer.position.set(sx * (W / 2 - 0.05), s.R, zf);
        const wheel = new THREE.Group();
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(s.R, s.R, 0.27, 36), rubber);
        tire.rotation.z = Math.PI / 2;
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(s.R * 0.68, s.R * 0.68, 0.275, 36), chrome);
        rim.rotation.z = Math.PI / 2;
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(s.R * 0.5, s.R * 0.5, 0.28, 24), trimBlack);
        hub.rotation.z = Math.PI / 2;
        wheel.add(tire, rim, hub);
        for (let k = 0; k < 6; k++) {
          const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.05, s.R * 0.95), chrome);
          spoke.rotation.x = (k / 6) * Math.PI;
          wheel.add(spoke);
        }
        tire.castShadow = true;
        steer.add(wheel);
        const cal = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.2), caliper);
        cal.position.set(-sx * 0.05, 0.12, 0.12);
        steer.add(cal);
        this.root.add(steer);
        this.wheels.push(wheel);
        if (zf < 0) this.steerPivots.push(steer);
        const arch = new THREE.Mesh(new THREE.TorusGeometry(s.R + 0.09, 0.045, 6, 24, Math.PI), trimBlack);
        arch.rotation.y = Math.PI / 2;
        arch.position.set(sx * (W / 2 - 0.0), s.R, zf);
        this.body.add(arch);
      }
    // intérieur : sièges cuir, planche de bord, écran, volant, éclairage d'ambiance
    const zDash = -s.xw0 + 0.3;
    const zFront = -xb - 0.25;
    const floorY = s.clr + 0.12;
    const seat = (x: number, z: number, wide = 0.5) => {
      const g = new THREE.Group();
      const cush = new THREE.Mesh(new THREE.BoxGeometry(wide, 0.13, 0.5), leather);
      cush.position.y = 0.28;
      const back = new THREE.Mesh(new THREE.BoxGeometry(wide, 0.62, 0.12), leather);
      back.position.set(0, 0.62, 0.24);
      back.rotation.x = -0.18;
      const head = new THREE.Mesh(new THREE.BoxGeometry(wide * 0.55, 0.16, 0.1), leather);
      head.position.set(0, 1.0, 0.31);
      g.add(cush, back, head);
      g.position.set(x, floorY, z);
      this.body.add(g);
    };
    seat(-0.42, zFront);
    seat(0.42, zFront);
    if (s.doors === 4) seat(0, zFront + 1.05, W - 0.6);
    const dash = new THREE.Mesh(new THREE.BoxGeometry(W - 0.22, 0.24, 0.5), leather);
    dash.position.set(0, s.belt - 0.08, zDash);
    this.body.add(dash);
    this.screen = screenTexture(def.name);
    this.screen.draw(0, false);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.27), new THREE.MeshBasicMaterial({ map: this.screen.t, toneMapped: false }));
    scr.position.set(0, s.belt + 0.1, zDash + 0.1);
    scr.rotation.x = -0.25;
    this.body.add(scr);
    const amb = new THREE.Mesh(new THREE.BoxGeometry(W - 0.25, 0.012, 0.012), this.ambientMat);
    amb.position.set(0, s.belt - 0.2, zDash + 0.26);
    this.body.add(amb);
    const wheelS = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.025, 10, 32), leather);
    wheelS.position.set(-0.42, s.belt + 0.02, zDash + 0.42);
    wheelS.rotation.x = -0.35;
    this.body.add(wheelS);
    const console = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.25, 0.9), leather);
    console.position.set(0, floorY + 0.12, zFront - 0.15);
    this.body.add(console);
    this.driverHead = new THREE.Vector3(-0.4, floorY + 1.12, zFront + 0.2);
    this.driverSide = new THREE.Vector3(-(W / 2 + 0.9), 0, zFront - 0.3);
  }

  get pos() {
    return this.root.position;
  }

  forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  setEngine(on: boolean) {
    this.engine = on;
    this.headMat.emissiveIntensity = on ? 4 : 0.15;
    this.tailMat.emissiveIntensity = on ? 1.6 : 0.3;
    this.ambientMat.emissiveIntensity = on ? 2 : 0.4;
    this.screen.draw(this.speed, on);
  }

  update(dt: number, t: number) {
    this.doorT = damp(this.doorT, this.doorTarget, 5, dt);
    for (const d of this.doors) d.pivot.rotation.y = d.side * this.doorT * 1.05;
    if (this.spin) this.yaw += this.spin * dt;
    this.root.rotation.y = this.yaw;
    const R = this.spec.R;
    for (const w of this.wheels) w.rotation.x -= (this.speed / R) * dt;
    for (const p of this.steerPivots) p.rotation.y = this.steer;
    if (this.engine && Math.floor(t * 6) !== Math.floor((t - dt) * 6)) this.screen.draw(this.speed, true);
  }
}

// ---------------------------------------------------------------- système : garage + conduite
export const CARS: CarDef[] = [
  { id: "s-onyx", name: "Adamas S · Noir Onyx", style: "sedan", color: 0x07070a, interior: 0x6b3d22 },
  { id: "s-nacre", name: "Adamas S · Blanc Nacré", style: "sedan", color: 0xe9e5dc, interior: 0x1a1a1c },
  { id: "x-nuit", name: "Adamas X · Bleu Nuit", style: "suv", color: 0x0b1a3c, interior: 0xd9cdb6 },
  { id: "x-champagne", name: "Adamas X · Champagne", style: "suv", color: 0xa88d5c, interior: 0x2a1a12 },
  { id: "x-emeraude", name: "Adamas X · Vert Émeraude", style: "suv", color: 0x0b3a2a, interior: 0xd9cdb6 },
  { id: "gt-rubis", name: "Adamas GT · Rouge Rubis", style: "coupe", color: 0x6e0812, interior: 0x111111 },
  { id: "gt-lune", name: "Adamas GT · Argent Lunaire", style: "coupe", color: 0xb7bcc6, interior: 0x5a1a1a },
  { id: "gt-or", name: "Adamas GT · Or Royal", style: "coupe", color: 0xb8913a, interior: 0x101010 }
];

export class CarSystem {
  cars: Car[] = [];
  active: Car | null = null;
  view: "chase" | "inside" = "chase";
  private camPos = new THREE.Vector3();
  private look = { yaw: 0, pitch: 0 };
  private spot = new THREE.SpotLight(0xfff2dd, 0, 90, 0.5, 0.5, 1.5);

  build(slots: { pos: THREE.Vector3; yaw: number; spin?: boolean }[]) {
    G.scene.add(this.spot, this.spot.target);
    CARS.forEach((def, i) => {
      const slot = slots[i];
      if (!slot) return;
      const car = new Car(def);
      car.root.position.copy(slot.pos);
      car.yaw = slot.yaw;
      car.spin = slot.spin ? 0.18 : 0;
      car.root.rotation.y = car.yaw;
      G.scene.add(car.root);
      this.cars.push(car);
      this.park(car);
      G.interact.add({
        id: "car-" + def.id,
        pos: () => car.root.localToWorld(car.driverSide.clone().setY(1)),
        radius: 3.2,
        enabled: () => G.mode === "foot",
        label: () => (car.remoteBy ? `Monter en passager dans la ${def.name}` : car.doorTarget < 1 ? `Ouvrir la ${def.name}` : `Monter à bord de la ${def.name}`),
        action: () => {
          if (car.remoteBy) return G.passenger.board("car", car.remoteBy);
          if (car.doorTarget < 1) {
            car.doorTarget = 1;
            car.spin = 0;
            G.audio.tone(320, 0.15, "sine", 0.08, 260);
          } else this.board(car);
        }
      });
    });
  }

  /** Volume de collision du véhicule à l'arrêt (le joueur ne le traverse pas). */
  park(car: Car) {
    const s = car.spec;
    const c = Math.cos(car.yaw),
      sn = Math.sin(car.yaw);
    const hx = Math.abs(c) * (s.W / 2) + Math.abs(sn) * (s.L / 2);
    const hz = Math.abs(sn) * (s.W / 2) + Math.abs(c) * (s.L / 2);
    const p = car.pos;
    if (!car.phys) car.phys = G.physics.addBox({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, "car");
    car.phys.box.min.set(p.x - hx * 0.9, p.y + 0.3, p.z - hz * 0.9);
    car.phys.box.max.set(p.x + hx * 0.9, p.y + s.belt, p.z + hz * 0.9);
    car.phys.enabled = !car.spin;
  }

  board(car: Car) {
    if (G.mode !== "foot") return;
    this.active = car;
    car.spin = 0;
    if (car.phys) car.phys.enabled = false;
    G.mode = "car" as any;
    car.setEngine(true);
    G.audio.unlock();
    G.audio.setEngine(0.05);
    G.audio.whoosh(1.2, 60, 600, 0.18);
    setTimeout(() => (car.doorTarget = 0), 600);
    this.camPos.copy(G.camera.position);
    this.look.yaw = this.look.pitch = 0;
    bus.emit("mode");
    bus.emit("toast", { text: `🚗 ${car.def.name} — W/S accélérer/freiner · A/D tourner · V vue intérieure · L phares · F sortir` });
    bus.emit("mission", { type: "car" });
  }

  exit() {
    const car = this.active;
    if (!car) return;
    if (Math.abs(car.speed) > 3) return bus.emit("toast", { text: "Arrêtez la voiture avant de sortir.", kind: "warn" });
    car.speed = 0;
    car.setEngine(false);
    G.audio.setEngine(null);
    car.doorTarget = 1;
    setTimeout(() => (car.doorTarget = 0), 1800);
    const side = car.root.localToWorld(car.driverSide.clone());
    side.y = G.physics.ground(side.x, car.pos.y + 1.5, side.z, 1.6).y;
    this.active = null;
    this.spot.intensity = 0;
    this.park(car);
    G.mode = "foot";
    G.player.teleport(side, car.yaw);
    bus.emit("mode");
  }

  /** Un autre joueur conduit cette voiture : on la déplace avec lui. */
  applyRemote(id: string, peer: string, c: [string, number, number, number, number, number, number]) {
    const car = this.cars.find((x) => x.def.id === id);
    if (!car || car === this.active) return;
    if (car.remoteBy !== peer) {
      car.remoteBy = peer;
      car.spin = 0;
      if (car.phys) car.phys.enabled = false;
      car.root.position.set(c[1], c[2], c[3]);
      car.yaw = c[4];
      car.setEngine(true);
    }
    car.netTarget.set(c[1], c[2], c[3]);
    car.netYaw = c[4];
    car.speed = c[5];
  }

  releaseRemote(id: string) {
    const car = this.cars.find((x) => x.def.id === id);
    if (!car || !car.remoteBy) return;
    car.remoteBy = null;
    car.speed = 0;
    car.setEngine(false);
    this.park(car);
  }

  nearest(from: THREE.Vector3, text = "") {
    const n = text.toLowerCase();
    const norm = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const nn = norm(n);
    let best: Car | null = null,
      bestScore = 0;
    for (const c of this.cars.filter((x) => !x.remoteBy)) {
      const words = norm(c.def.name).split(/[ ·]+/).filter((w) => w.length > 1 && w !== "adamas");
      const score = words.filter((w) => new RegExp(`\\b${w}\\b`).test(nn)).length;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best) return best;
    return [...this.cars.filter((x) => !x.remoteBy)].sort((a, b) => a.pos.distanceTo(from) - b.pos.distanceTo(from))[0];
  }

  update(dt: number, t: number) {
    for (const c of this.cars) {
      if (c.remoteBy) {
        c.root.position.lerp(c.netTarget, 1 - Math.exp(-dt * 10));
        if (c.root.position.distanceTo(c.netTarget) > 40) c.root.position.copy(c.netTarget);
        let d = c.netYaw - c.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        c.yaw += d * Math.min(1, dt * 10);
      }
      c.update(dt, t);
    }
    const car = this.active;
    if (!car || (G.mode as string) !== "car") return;
    const inp = G.input;
    if (inp.hit("KeyF")) return this.exit();
    if (inp.hit("KeyV")) {
      this.view = this.view === "chase" ? "inside" : "chase";
      bus.emit("toast", { text: this.view === "inside" ? "Vue conducteur" : "Vue extérieure" });
    }
    if (inp.hit("KeyL")) car.setEngine(!car.engine || car.headMat.emissiveIntensity < 1 ? true : car.engine);
    if (inp.hit("KeyH")) G.audio.tone(392, 0.35, "square", 0.08);

    const thr = inp.axis(["KeyS", "ArrowDown"], ["KeyW", "ArrowUp"]) + -inp.touchMove.y;
    const steerIn = inp.axis(["KeyD", "ArrowRight"], ["KeyA", "ArrowLeft"]) - inp.touchMove.x;
    const boost = inp.down("ShiftLeft", "ShiftRight");
    if (thr > 0.05) car.speed += thr * (car.speed < 0 ? 18 : boost ? 13 : 8.5) * dt;
    else if (thr < -0.05) car.speed += thr * (car.speed > 0.5 ? 20 : 5) * dt;
    car.speed -= car.speed * 0.18 * dt + Math.sign(car.speed) * Math.min(Math.abs(car.speed), 0.8 * dt);
    car.speed = clamp(car.speed, -9, boost ? 80 : 62);
    const steerMax = 0.55 / (1 + Math.abs(car.speed) / 25);
    car.steer = damp(car.steer, clamp(steerIn, -1, 1) * steerMax, 6, dt);
    car.yaw += (car.speed * Math.tan(car.steer) / 3.0) * dt;

    const p = car.pos;
    const before = p.clone();
    p.addScaledVector(car.forward(), car.speed * dt);
    const probe = p.clone();
    G.physics.resolve(probe, car.spec.W * 0.55, 1.3, 0.6);
    // avant et arrière du véhicule
    const half = car.forward().multiplyScalar(car.spec.L * 0.38);
    const fp = p.clone().add(half),
      bp = p.clone().sub(half);
    const hitF = G.physics.resolve(fp, 0.9, 1.3, 0.6),
      hitB = G.physics.resolve(bp, 0.9, 1.3, 0.6);
    if (probe.distanceToSquared(p) > 1e-6 || hitF || hitB) {
      if (Math.abs(car.speed) > 12) {
        G.audio.whoosh(0.35, 300, 90, 0.3);
        bus.emit("shake", Math.min(0.8, Math.abs(car.speed) / 40));
      }
      p.copy(before);
      car.speed *= -0.2;
    }
    const g = G.physics.ground(p.x, p.y + 0.9, p.z, 0.9, 1).y;
    p.y = g > p.y ? damp(p.y, g, 25, dt) : Math.max(g, p.y - 9.8 * dt * 2);
    if (Math.abs(p.x) > 3900 || Math.abs(p.z) > 3900) car.speed = 0;
    car.body.rotation.z = damp(car.body.rotation.z, -car.steer * car.speed * 0.012, 4, dt);
    car.body.rotation.x = damp(car.body.rotation.x, clamp(thr * 0.012 * (car.speed > 0 ? 1 : 0), -0.02, 0.02), 4, dt);
    G.audio.setEngine(0.05 + Math.min(1, Math.abs(car.speed) / 60) * 0.8);
    G.player.position.copy(p);

    // phare (une seule lumière, réutilisée)
    const night = G.env.nightFactor;
    this.spot.intensity = car.engine ? 40 + night * 260 : 0;
    this.spot.position.copy(car.root.localToWorld(new THREE.Vector3(0, car.spec.hoodF, -car.spec.L / 2)));
    this.spot.target.position.copy(this.spot.position).addScaledVector(car.forward(), 20).add(new THREE.Vector3(0, -2, 0));

    // caméra
    const cam = G.camera;
    const look = inp.consumeMouse();
    if (this.view === "inside") {
      this.look.yaw = clamp(this.look.yaw - look.x, -1.6, 1.6);
      this.look.pitch = clamp(this.look.pitch - look.y, -0.6, 0.5);
      cam.position.copy(car.root.localToWorld(car.driverHead.clone()));
      const dir = new THREE.Vector3(-Math.sin(car.yaw + this.look.yaw), Math.sin(this.look.pitch), -Math.cos(car.yaw + this.look.yaw));
      cam.lookAt(cam.position.clone().add(dir));
    } else {
      this.look.yaw = damp(this.look.yaw - look.x, 0, 1.5, dt);
      const a = car.yaw + this.look.yaw;
      const want = p.clone().add(new THREE.Vector3(Math.sin(a) * 7.5, 2.6 + Math.abs(car.speed) * 0.01, Math.cos(a) * 7.5));
      this.camPos.lerp(want, 1 - Math.exp(-dt * 6));
      const gy = G.physics.terrain(this.camPos.x, this.camPos.z) + 0.6;
      if (this.camPos.y < gy) this.camPos.y = gy;
      cam.position.copy(this.camPos);
      cam.lookAt(p.clone().add(new THREE.Vector3(0, 1.1, 0)).addScaledVector(car.forward(), 3));
    }
  }
}
