// LE PALAIS ROYAL — 7 étages explorables, ascenseur réel, portes interactives, façade monumentale.
import * as THREE from "three";
import { G, bus } from "../core";
import { mat, HoloScreen } from "./materials";
import { box, span, cyl, wallX, wallZ, glassWall, glowLine } from "./build";
import { Door } from "./door";
import { buildFloors } from "./floors";

export const HALF = 32;
export const FLOORS = [
  { n: 1, name: "Grand Hall Royal", short: "Hall", h: 14 },
  { n: 2, name: "Salle du Trône", short: "Trône", h: 10 },
  { n: 3, name: "Quartiers privés", short: "Quartiers", h: 8 },
  { n: 4, name: "Centre de commandement", short: "Commandement", h: 8 },
  { n: 5, name: "Laboratoire technologique", short: "Laboratoire", h: 8 },
  { n: 6, name: "Armurerie royale", short: "Armurerie", h: 8 },
  { n: 7, name: "Hangar royal", short: "Hangar", h: 10 }
];
export const BASE: number[] = [];
{
  let y = 0;
  for (const f of FLOORS) {
    BASE.push(y);
    y += f.h;
  }
}
export const TOP = BASE[6] + FLOORS[6].h; // 66

export interface Spot {
  pos: THREE.Vector3;
  yaw: number;
  label: string;
}

const SHAFT = { x: 3.2, z1: 23, z2: 32 };

export class Palace {
  root = new THREE.Group();
  shell = new THREE.Group();
  interiors: THREE.Group[] = FLOORS.map(() => new THREE.Group());
  doors = new Map<string, Door>();
  screens: { screen: HoloScreen; floor: number; fps: number; last: number }[] = [];
  spinners: { obj: THREE.Object3D; speed: THREE.Vector3; bob?: number; baseY?: number }[] = [];
  floorLights: { pos: THREE.Vector3; color: number; intensity: number; distance?: number }[][] = FLOORS.map(() => []);
  updaters: ((dt: number, t: number) => void)[] = [];
  spots: Record<string, Spot> = {};
  shipSpawn = new THREE.Vector3(0, BASE[6], -4);
  armorPedestal = new THREE.Vector3(0, BASE[5] + 0.6, -4);
  armorCases: { pos: THREE.Vector3; yaw: number }[] = [];
  tint: number | null = null;
  /** zones éclairées hors du palais (garage royal, galerie) */
  zones: { contains: (p: THREE.Vector3) => boolean; lights: { pos: THREE.Vector3; color: number; intensity: number; distance?: number }[] }[] = [];
  outdoorLights: { pos: THREE.Vector3; color: number; intensity: number; distance?: number }[] = [];

  elevator = {
    cabin: new THREE.Group(),
    floor: 0,
    target: -1,
    state: "idle" as "idle" | "closing" | "moving" | "opening",
    speed: 6
  };

  build() {
    this.root.add(this.shell, ...this.interiors);
    G.scene.add(this.root);
    this.buildShell();
    this.buildElevator();
    buildFloors(this);
    this.buildSpots();
  }

  addDoor(d: Door) {
    this.doors.set(d.id, d);
    return d;
  }

  /** Index d'étage (0..6) correspondant à une hauteur, si dans l'emprise du palais. */
  floorAt(p: THREE.Vector3): number {
    if (!this.inside(p)) return -1;
    for (let i = FLOORS.length - 1; i >= 0; i--) if (p.y >= BASE[i] - 0.6) return i;
    return 0;
  }

  inside(p: THREE.Vector3) {
    return Math.abs(p.x) < HALF && Math.abs(p.z) < HALF && p.y > -1 && p.y < TOP;
  }

  // -------------------------------------------------------------- COQUE
  private buildShell() {
    const s = this.shell;
    for (let i = 0; i < FLOORS.length; i++) {
      const y0 = BASE[i];
      const h = FLOORS[i].h - 0.5;
      const floorMat = i === 6 ? mat.darkFloor : mat.floor;
      // dalle (avec trémie pour l'ascenseur)
      if (i === 0) span(s, -HALF, -0.5, -HALF, HALF, 0, HALF, floorMat);
      else {
        span(s, -HALF, y0 - 0.5, -HALF, HALF, y0, SHAFT.z1, floorMat);
        span(s, -HALF, y0 - 0.5, SHAFT.z1, -SHAFT.x, y0, HALF, floorMat);
        span(s, SHAFT.x, y0 - 0.5, SHAFT.z1, HALF, y0, HALF, floorMat);
      }
      // façade avant (z = -HALF)
      if (i === 0) wallX(s, -HALF, -HALF, HALF, y0, h, mat.marble, [{ c: 0, w: 10, h: 9 }]);
      else if (i === 6) wallX(s, -HALF, -HALF, HALF, y0, h, mat.marble, [{ c: 0, w: 26, h: 8 }]);
      else glassWall(s, "x", -HALF, -HALF, HALF, y0, h, i === 2 ? [{ c: 0, w: 4, h: 3 }] : []);
      // arrière
      wallX(s, HALF, -HALF, HALF, y0, h, mat.marble);
      // côtés
      if (i === 1 || i === 4) {
        glassWall(s, "z", -HALF, -HALF, HALF, y0, h);
        glassWall(s, "z", HALF, -HALF, HALF, y0, h);
      } else {
        // au Grand Hall : arches vers l'aile ouest (galerie) et l'aile est (garage royal)
        const arch = i === 0 ? [{ c: -20, w: 6, h: 7 }] : [];
        wallZ(s, -HALF, -HALF, HALF, y0, h, mat.marble, arch);
        wallZ(s, HALF, -HALF, HALF, y0, h, mat.marble, arch);
      }
      // gaine d'ascenseur
      wallZ(s, -SHAFT.x - 0.15, SHAFT.z1, HALF, y0, h, mat.silver, [], 0.3);
      wallZ(s, SHAFT.x + 0.15, SHAFT.z1, HALF, y0, h, mat.silver, [], 0.3);
      wallX(s, SHAFT.z1 - 0.15, -SHAFT.x - 0.3, SHAFT.x + 0.3, y0, h, mat.silver, [{ c: 0, w: 3.6, h: 3.2 }], 0.3);
      glowLine(s, -1.9, y0 + 3.25, SHAFT.z1 - 0.32, 1.9, y0 + 3.25, SHAFT.z1 - 0.32, mat.glowCyan, 0.08);
      // portes palières
      const d = this.addDoor(new Door(`lift-${i}`, `Ascenseur — niveau ${i + 1}`, new THREE.Vector3(0, y0 + 1.5, SHAFT.z1)));
      for (const side of [-1, 1]) {
        const leaf = box(s, 1.8, 3.2, 0.12, mat.silver, side * 0.9, y0 + 1.6, SHAFT.z1 - 0.38, { solid: false });
        glowLine(leaf, -0.03, -1.4, -0.07, 0.03, 1.4, -0.07, mat.glowBlue, 0.04);
        d.addLeaf(leaf, new THREE.Vector3(side * 1.75, 0, 0));
      }
      d.speed = 2;
      // bouton d'appel
      const btn = box(s, 0.25, 0.4, 0.06, mat.glowCyan, 2.6, y0 + 1.3, SHAFT.z1 - 0.34, { solid: false, shadow: false });
      btn.userData.floor = i;
      G.interact.add({
        id: `lift-call-${i}`,
        pos: new THREE.Vector3(1.5, y0 + 1.3, SHAFT.z1 - 0.6),
        radius: 3.2,
        label: () => (this.elevator.floor === i && this.elevator.state === "idle" ? "Entrer — ascenseur ouvert" : "Appeler l'ascenseur"),
        action: () => this.callElevator(i)
      });

      // bandeaux dorés + lumière bleue sur la façade
      const yb = y0 + FLOORS[i].h - 0.5;
      for (const [x1, z1, x2, z2] of [
        [-HALF - 0.6, -HALF - 0.6, HALF + 0.6, -HALF - 0.2],
        [-HALF - 0.6, HALF + 0.2, HALF + 0.6, HALF + 0.6],
        [-HALF - 0.6, -HALF - 0.6, -HALF - 0.2, HALF + 0.6],
        [HALF + 0.2, -HALF - 0.6, HALF + 0.6, HALF + 0.6]
      ]) {
        span(s, x1, yb - 0.1, z1, x2, yb + 0.5, z2, mat.gold, { solid: false });
        span(s, x1, yb - 0.25, z1, x2, yb - 0.12, z2, mat.glowBlue, { solid: false, shadow: false, uv: false });
      }
    }

    // toit
    span(s, -HALF - 1, TOP - 0.5, -HALF - 1, HALF + 1, TOP + 0.6, HALF + 1, mat.marble);
    span(s, -HALF - 1.2, TOP + 0.6, -HALF - 1.2, HALF + 1.2, TOP + 1.4, HALF + 1.2, mat.gold, { solid: false });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(16, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), mat.glass);
    dome.position.set(0, TOP + 0.6, 0);
    s.add(dome);
    const domeRibs = new THREE.Mesh(new THREE.SphereGeometry(16.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat.holoWire);
    domeRibs.position.copy(dome.position);
    s.add(domeRibs);
    cyl(s, 1.2, 36, mat.gold, 0, TOP + 0.6, 0, { r2: 0.15, solid: false });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 12), mat.glowBlue);
    beacon.position.set(0, TOP + 37, 0);
    s.add(beacon);
    this.spinners.push({ obj: domeRibs, speed: new THREE.Vector3(0, 0.05, 0) });

    // tours d'angle
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const x = sx * (HALF + 2.5),
          z = sz * (HALF + 2.5);
        cyl(s, 4.8, TOP + 8, mat.marble, x, 0, z, { seg: 40 });
        for (let k = 1; k < 7; k++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(4.85, 0.12, 8, 48), k % 2 ? mat.gold : mat.glowBlue);
          ring.rotation.x = Math.PI / 2;
          ring.position.set(x, BASE[k], z);
          s.add(ring);
        }
        cyl(s, 5.4, 1.2, mat.gold, x, TOP + 8, z, { solid: false });
        cyl(s, 3.6, 10, mat.gold, x, TOP + 9.2, z, { r2: 0.2, solid: false, seg: 24 });
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), mat.glowCyan);
        tip.position.set(x, TOP + 19.5, z);
        s.add(tip);
      }

    // portique d'entrée : colonnes monumentales
    for (const x of [-25, -19, -13, -7, 7, 13, 19, 25]) {
      cyl(s, 1.1, 13.4, mat.marble, x, 0, -HALF - 5, { seg: 28 });
      cyl(s, 1.5, 0.6, mat.gold, x, 0, -HALF - 5, { solid: false });
      cyl(s, 1.6, 0.6, mat.gold, x, 13.4, -HALF - 5, { solid: false });
    }
    span(s, -27.5, 14, -HALF - 8, 27.5, 14.8, -HALF, mat.marble);
    span(s, -27.6, 14.8, -HALF - 8.1, 27.6, 15.1, -HALF, mat.gold, { solid: false });
    glowLine(s, -27.5, 13.9, -HALF - 8.05, 27.5, 13.9, -HALF - 8.05, mat.glowBlue, 0.1);
    // emmarchement
    span(s, -30, -0.5, -HALF - 12, 30, 0.02, -HALF, mat.marble);

    // porte principale (double battant)
    const main = this.addDoor(new Door("door-main", "Grande porte du palais", new THREE.Vector3(0, 1, -HALF)));
    for (const side of [-1, 1]) {
      const leaf = box(s, 5, 9, 0.4, mat.black, side * 2.5, 4.5, -HALF, { solid: false });
      const trim = new THREE.Mesh(new THREE.BoxGeometry(4.6, 8.6, 0.45), mat.gold);
      trim.scale.set(1, 1, 0.98);
      const inner = new THREE.Mesh(new THREE.BoxGeometry(4.2, 8.2, 0.5), mat.black);
      leaf.add(trim, inner);
      glowLine(leaf, -side * 2.3, -4, -0.3, -side * 2.3 + 0.06, 4, -0.3, mat.glowBlue, 0.06);
      glowLine(leaf, -side * 2.3, -4, 0.25, -side * 2.3 + 0.06, 4, 0.25, mat.glowBlue, 0.06);
      main.addLeaf(leaf, new THREE.Vector3(side * 5, 0, 0));
    }
    main.speed = 0.9;
    G.interact.add({
      id: "door-main",
      pos: new THREE.Vector3(0, 1.2, -HALF),
      radius: 7,
      label: () => (main.isOpen ? "Fermer la grande porte" : "Ouvrir la grande porte"),
      action: () => main.toggle()
    });

    // terrasse (étage 3)
    const ty = BASE[2];
    span(s, -12, ty - 0.5, -HALF - 14, 12, ty, -HALF, mat.floor);
    for (const [x1, z1, x2, z2] of [
      [-12, -HALF - 14, 12, -HALF - 13.9],
      [-12, -HALF - 14, -11.9, -HALF],
      [11.9, -HALF - 14, 12, -HALF]
    ]) {
      span(s, x1, ty, z1, x2, ty + 1.15, z2, mat.glass, { shadow: false, uv: false });
      span(s, x1 - 0.05, ty + 1.15, z1 - 0.05, x2 + 0.05, ty + 1.25, z2 + 0.05, mat.gold, { solid: false });
    }
    const terr = this.addDoor(new Door("door-terrace", "Porte de la terrasse", new THREE.Vector3(0, ty + 1, -HALF)));
    for (const side of [-1, 1]) {
      const leaf = box(s, 2, 3, 0.1, mat.glass, side * 1, ty + 1.5, -HALF + 0.25, { solid: false, uv: false });
      glowLine(leaf, -side * 0.95, -1.5, 0, -side * 0.95 + 0.05, 1.5, 0, mat.glowGold, 0.05);
      terr.addLeaf(leaf, new THREE.Vector3(side * 2, 0, 0));
    }
    terr.autoCloseAfter = 20;
    G.interact.add({
      id: "door-terrace",
      pos: new THREE.Vector3(0, ty + 1.2, -HALF),
      radius: 4,
      label: () => (terr.isOpen ? "Fermer la terrasse" : "Ouvrir la terrasse"),
      action: () => terr.toggle()
    });

    // plate-forme de lancement (étage 7)
    const py = BASE[6];
    span(s, -16, py - 1.2, -HALF - 26, 16, py, -HALF, mat.darkFloor);
    for (let k = 0; k < 8; k++) {
      const z = -HALF - 3 - k * 3;
      glowLine(s, -0.4, py + 0.01, z, 0.4, py + 0.01, z - 1.2, mat.glowCyan, 0.02);
    }
    glowLine(s, -16, py + 0.01, -HALF - 26, -15.9, py + 0.01, -HALF, mat.glowBlue, 0.02);
    glowLine(s, 15.9, py + 0.01, -HALF - 26, 16, py + 0.01, -HALF, mat.glowBlue, 0.02);
    glowLine(s, -16, py + 0.01, -HALF - 26, 16, py + 0.01, -HALF - 25.9, mat.glowBlue, 0.02);
    for (const x of [-16, 16]) span(s, x - 0.1, py, -HALF - 26, x + 0.1, py + 1.1, -HALF, mat.glass, { shadow: false, uv: false });
    // support de la plate-forme
    for (const x of [-12, 12]) span(s, x - 1, py - 18, -HALF - 22, x + 1, py - 1.2, -HALF - 20, mat.marble);

    this.outdoorLights.push(
      { pos: new THREE.Vector3(0, 10, -HALF - 6), color: 0x8fd0ff, intensity: 120, distance: 45 },
      { pos: new THREE.Vector3(-20, 8, -HALF - 6), color: 0xffd28a, intensity: 60, distance: 30 },
      { pos: new THREE.Vector3(20, 8, -HALF - 6), color: 0xffd28a, intensity: 60, distance: 30 }
    );
  }

  // -------------------------------------------------------------- ASCENSEUR
  private buildElevator() {
    const el = this.elevator;
    const c = el.cabin;
    c.userData.dynamic = true;
    this.root.add(c);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.3, 8.8), mat.darkFloor);
    floor.position.set(0, -0.15, 27.6);
    floor.receiveShadow = true;
    c.add(floor);
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.15, 8.8), mat.silver);
    ceil.position.set(0, 3.6, 27.6);
    c.add(ceil);
    const lightPanel = new THREE.Mesh(new THREE.BoxGeometry(4, 0.05, 6), mat.glowWhite);
    lightPanel.position.set(0, 3.5, 27.6);
    c.add(lightPanel);
    for (const x of [-3.05, 3.05]) {
      const g = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.5, 8.6), mat.glass);
      g.position.set(x, 1.75, 27.6);
      c.add(g);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 8.6), mat.glowCyan);
      strip.position.set(x, 0.1, 27.6);
      c.add(strip);
    }
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 0.1), mat.black);
    panel.position.set(0, 1.5, 31.8);
    c.add(panel);
    const screen = new HoloScreen(256, 384, (ctx, w, h) => {
      ctx.fillStyle = "#020a18";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#4fd2ff";
      ctx.font = "bold 120px Orbitron, Arial";
      ctx.textAlign = "center";
      ctx.fillText(String((this.elevator?.floor ?? 0) + 1), w / 2, 160);
      ctx.font = "22px Orbitron, Arial";
      ctx.fillStyle = "#bff0ff";
      const name = FLOORS[this.elevator?.floor ?? 0].short.toUpperCase();
      ctx.fillText(name, w / 2, 210);
      ctx.fillStyle = "rgba(79,210,255,.6)";
      ctx.fillText("[E] CHOISIR L'ÉTAGE", w / 2, 330);
    });
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.5), screen.material);
    sm.position.set(0, 1.5, 31.74);
    sm.rotation.y = Math.PI;
    c.add(sm);
    this.screens.push({ screen, floor: -1, fps: 4, last: 0 });
    G.physics.addDynamic(floor, "elevator");
    c.position.y = 0;
    this.doors.get("lift-0")!.open(true);

    G.interact.add({
      id: "lift-panel",
      pos: () => new THREE.Vector3(0, c.position.y + 1.3, 30.6),
      radius: 4.5,
      enabled: () => this.playerInCabin(),
      label: () => "Choisir l'étage (touches 1-7)",
      action: () => bus.emit("ui:elevator")
    });
  }

  playerInCabin() {
    const p = G.player.position;
    return Math.abs(p.x) < 3.1 && p.z > SHAFT.z1 - 0.2 && p.z < HALF && Math.abs(p.y - this.elevator.cabin.position.y) < 1.2;
  }

  callElevator(floor: number) {
    const el = this.elevator;
    if (floor < 0 || floor > 6) return;
    if (el.state !== "idle" && el.state !== "opening") {
      el.target = floor;
      return;
    }
    if (el.floor === floor) {
      this.doors.get(`lift-${floor}`)!.open();
      return;
    }
    el.target = floor;
    el.state = "closing";
    this.doors.get(`lift-${el.floor}`)!.close();
    G.audio.confirm();
  }

  private updateElevator(dt: number) {
    const el = this.elevator;
    const cab = el.cabin;
    if (el.state === "closing") {
      if (this.doors.get(`lift-${el.floor}`)!.t <= 0) el.state = "moving";
    } else if (el.state === "moving") {
      const ty = BASE[el.target];
      const dy = ty - cab.position.y;
      const step = Math.sign(dy) * Math.min(Math.abs(dy), el.speed * dt * Math.min(1, 0.3 + Math.abs(dy) / 3));
      cab.position.y += step;
      const f = BASE.findIndex((b) => Math.abs(b - cab.position.y) < 0.5);
      if (f >= 0) el.floor = f;
      if (Math.abs(dy) < 0.01) {
        cab.position.y = ty;
        el.floor = el.target;
        el.target = -1;
        el.state = "opening";
        this.doors.get(`lift-${el.floor}`)!.open();
        G.audio.tone(1046, 0.25, "sine", 0.12);
        bus.emit("elevator:arrived", el.floor);
      }
    } else if (el.state === "opening") {
      if (this.doors.get(`lift-${el.floor}`)!.t >= 1) el.state = el.target >= 0 ? "closing" : "idle";
      if (el.state === "closing") this.doors.get(`lift-${el.floor}`)!.close();
    }
    if (this.playerInCabin() && el.state === "idle") {
      for (let i = 0; i < 7; i++) if (G.input.hit(`Digit${i + 1}`, `Numpad${i + 1}`)) this.callElevator(i);
    }
  }

  /** Déplacement rapide (commande GRIOT) : fondu + arrivée devant l'ascenseur de l'étage. */
  goToFloor(i: number) {
    const el = this.elevator;
    this.doors.get(`lift-${el.floor}`)!.close(true);
    el.cabin.position.y = BASE[i];
    el.floor = i;
    el.state = "idle";
    el.target = -1;
    this.doors.get(`lift-${i}`)!.open(true);
    const spot = Object.values(this.spots).find((s) => s.label === `floor-${i}`)!;
    G.player.teleport(spot.pos, spot.yaw);
  }

  /** Place la cabine à un étage sans téléporter le joueur (chargement de partie). */
  goToFloorSilent(i: number) {
    const el = this.elevator;
    for (let k = 0; k < 7; k++) {
      const d = this.doors.get(`lift-${k}`)!;
      d.target = d.t = k === i ? 1 : 0;
      d.leaves.forEach((l) => l.mesh.position.copy(k === i ? l.open : l.closed));
    }
    el.cabin.position.y = BASE[i];
    el.floor = i;
    el.state = "idle";
    el.target = -1;
  }

  private buildSpots() {
    const sp = (key: string, x: number, y: number, z: number, yaw: number, label = key) =>
      (this.spots[key] = { pos: new THREE.Vector3(x, y, z), yaw, label });
    sp("floor0", 0, BASE[0], -22, Math.PI, "floor-0");
    sp("floor1", 0, BASE[1], -20, Math.PI, "floor-1");
    sp("floor2", 0, BASE[2], -12, Math.PI, "floor-2");
    sp("floor3", 0, BASE[3], -16, Math.PI, "floor-3");
    sp("floor4", 0, BASE[4], -2, 0, "floor-4");
    sp("floor5", 0, BASE[5], -16, Math.PI, "floor-5");
    sp("floor6", 12, BASE[6], 14, 0.59, "floor-6");
    sp("gardens", 0, 0, -90, Math.PI, "gardens");
    sp("terrace", 0, BASE[2], -40, 0, "terrace");
    sp("platform", 0, BASE[6], -48, Math.PI, "platform");
  }

  // -------------------------------------------------------------- MISE À JOUR
  update(dt: number, t: number) {
    for (const d of this.doors.values()) d.update(dt);
    this.updateElevator(dt);
    for (const s of this.spinners) {
      s.obj.rotation.x += s.speed.x * dt;
      s.obj.rotation.y += s.speed.y * dt;
      s.obj.rotation.z += s.speed.z * dt;
      if (s.bob) s.obj.position.y = (s.baseY ?? 0) + Math.sin(t * 1.3) * s.bob;
    }
    for (const u of this.updaters) u(dt, t);

    // visibilité des intérieurs + lumières de l'étage courant
    const p = G.mode === "ship" ? G.ship.root.position : G.player.position;
    const f = this.floorAt(p);
    const near = Math.hypot(p.x, p.z) < 160 && p.y < TOP + 60;
    for (let i = 0; i < this.interiors.length; i++) {
      this.interiors[i].visible = f >= 0 ? Math.abs(i - f) <= 1 : near;
    }
    if (f >= 0) G.env.setPointLights(this.tint === null ? this.floorLights[f] : this.floorLights[f].map((l) => ({ ...l, color: this.tint! })));
    else if (this.zones.some((z) => z.contains(p))) G.env.setPointLights(this.zones.find((z) => z.contains(p))!.lights);
    else if (near) G.env.setPointLights(this.outdoorLights.concat(G.world?.gardenLights ?? []).slice(0, 6));
    else G.env.setPointLights([]);

    for (const s of this.screens) {
      if (s.floor >= 0 && !this.interiors[s.floor].visible) continue;
      if (t - s.last > 1 / s.fps) {
        s.last = t;
        s.screen.refresh(t);
      }
    }
  }
}
