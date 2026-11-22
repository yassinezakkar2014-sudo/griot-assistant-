// GARAGE AUTOMATIQUE DU PALAIS IMPÉRIAL : on choisit sa voiture à la borne, un ascenseur la monte du
// parking souterrain, la porte se lève et la voiture sort toute seule devant le garage, prête à partir
// (avec son pilote automatique : bouton 🤖 ou touche Y une fois à bord).
import * as THREE from "three";
import { G, bus, damp } from "../core";
import { mat } from "../world/materials";
import { GARAGE } from "./autopilot";
import type { Car } from "./car";

export class ImperialGarage {
  private root = new THREE.Group();
  private lift!: THREE.Mesh;
  private door!: THREE.Mesh;
  private doorOpen = 0;
  private panel!: HTMLElement;
  private job: { car: Car; t: number } | null = null;
  private beacon!: THREE.Mesh;

  build() {
    (G.imperial?.root ?? G.scene).add(this.root);
    const { x: GX, z: GZ, y: Y } = GARAGE;
    const shell = new THREE.MeshStandardMaterial({ color: 0x1a1d26, metalness: 0.6, roughness: 0.35 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0.1, depthWrite: false });
    const floor = new THREE.MeshStandardMaterial({ color: 0x2a2e38, metalness: 0.4, roughness: 0.3 });
    const add = (m: THREE.Object3D) => (this.root.add(m), m);
    const box = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, m: THREE.Material, solid = true) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(x2 - x1, y2 - y1, z2 - z1), m);
      b.position.set(GX + (x1 + x2) / 2, Y + (y1 + y2) / 2, GZ + (z1 + z2) / 2);
      b.castShadow = b.receiveShadow = true;
      add(b);
      if (solid) G.physics.addBox({ x: GX + x1, y: Y + y1, z: GZ + z1 }, { x: GX + x2, y: Y + y2, z: GZ + z2 }, "garage");
      return b;
    };
    // hall : 100 × 80 m, 22 m de haut, porte de 28 m sur la façade ouest (vers l'avenue)
    box(-50, 0, -40, 50, 0.25, 40, floor, false);
    box(-50, 0, -40, 50, 22, -38, shell);
    box(-50, 0, 38, 50, 22, 40, shell);
    box(48, 0, -40, 50, 22, 40, shell);
    box(-50, 0, -40, -48, 22, -14, shell);
    box(-50, 0, 14, -48, 22, 40, shell);
    box(-50, 12, -14, -48, 22, 14, shell);
    box(-52, 22, -42, 52, 23.5, 42, mat.gold, false);
    box(-50, 23.5, -40, 50, 24, 40, glass, false);
    // enseigne
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(40, 5), new THREE.MeshBasicMaterial({ map: signTexture("♛ GARAGE IMPÉRIAL") }));
    sign.position.set(GX - 50.6, Y + 17, GZ);
    sign.rotation.y = -Math.PI / 2;
    add(sign);
    // porte (se lève)
    this.door = box(-49.6, 0, -14, -48.4, 12, 14, new THREE.MeshStandardMaterial({ color: 0x0a1424, emissive: 0x2a6aa8, emissiveIntensity: 0.6, metalness: 0.8, roughness: 0.2 }), false);
    // vitrines : voitures de collection sur trois étages (silhouettes lumineuses)
    for (let lvl = 0; lvl < 3; lvl++) {
      box(20, 5 + lvl * 5.5, -36, 46, 5.4 + lvl * 5.5, 36, glass, false);
      for (let k = 0; k < 6; k++) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.3, 2), new THREE.MeshStandardMaterial({ color: [0xb8913a, 0x07070a, 0xe9e5dc, 0x6e0812, 0x0b1a3c, 0xb7bcc6][(k + lvl) % 6], metalness: 0.8, roughness: 0.2 }));
        c.position.set(GX + 33, Y + 6.1 + lvl * 5.5, GZ - 30 + k * 12);
        add(c);
      }
    }
    // ascenseur à voitures : plate-forme lumineuse au centre
    const pit = new THREE.Mesh(new THREE.CircleGeometry(7.5, 48), new THREE.MeshBasicMaterial({ color: 0x050608 }));
    pit.rotation.x = -Math.PI / 2;
    pit.position.set(GX - 10, Y + 0.27, GZ);
    add(pit);
    this.lift = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 0.5, 48), new THREE.MeshStandardMaterial({ color: 0x3a3f4a, metalness: 0.9, roughness: 0.2 }));
    this.lift.position.set(GX - 10, Y + 0.05, GZ);
    add(this.lift);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(7.2, 0.18, 8, 64), mat.glowCyan);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(GX - 10, Y + 0.35, GZ);
    add(ring);
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 20, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0x5fd0ff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    this.beacon.position.set(GX - 10, Y + 10, GZ);
    add(this.beacon);
    // bornes (dedans et dehors)
    for (const [bx, bz] of [[-40, 20], [-60, 20]]) {
      box(bx - 0.6, 0, bz - 0.6, bx + 0.6, 1.4, bz + 0.6, mat.graphite);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.7), mat.glowCyan);
      scr.position.set(GX + bx - 0.62, Y + 1.25, GZ + bz);
      scr.rotation.y = -Math.PI / 2;
      add(scr);
      G.interact.add({
        id: `imperial-garage-${bx}`,
        pos: new THREE.Vector3(GX + bx, Y + 1, GZ + bz),
        radius: 3.5,
        enabled: () => G.mode === "foot",
        label: () => "🚗 Garage automatique : sortir une voiture",
        action: () => this.openPanel()
      });
    }
    // panneau de choix
    this.panel = document.createElement("div");
    this.panel.className = "garage-panel";
    this.panel.hidden = true;
    document.body.appendChild(this.panel);
    this.panel.onclick = (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-car]");
      if ((e.target as HTMLElement).closest("[data-close]")) this.panel.hidden = true;
      if (el) {
        this.panel.hidden = true;
        bus.emit("toast", { text: this.deliver(el.dataset.car!) });
      }
    };
    G.world.markers.push({ id: "imperial-garage", name: "Garage impérial", pos: new THREE.Vector3(GX, Y, GZ), icon: "🚗", visible: () => true });
    G.palace.updaters.push((dt) => this.update(dt));
  }

  openPanel() {
    const cars = G.cars.cars;
    this.panel.innerHTML = `<div class="gp-title">♛ Garage impérial — choisissez votre voiture</div>
      <div class="gp-grid">${cars
        .map((c) => {
          const busy = c === G.cars.active || !!c.remoteBy;
          return `<button data-car="${c.def.id}" ${busy ? "disabled" : ""}><i style="background:#${c.def.color.toString(16).padStart(6, "0")}"></i>${c.def.name}${busy ? " (occupée)" : ""}</button>`;
        })
        .join("")}</div>
      <p>La voiture monte par l'ascenseur et sort toute seule. À bord : 🤖 pilote automatique (touche Y).</p>
      <button class="gp-close" data-close="1">Fermer</button>`;
    this.panel.hidden = false;
    G.input.unlock();
  }

  /** Sort une voiture du garage (id ou texte). */
  deliver(text: string): string {
    if (this.job) return "Une voiture est déjà en train de sortir.";
    const car = G.cars.cars.find((c) => c.def.id === text) ?? G.cars.nearest(G.player.position, text);
    if (!car || car === G.cars.active || car.remoteBy) return "Cette voiture n'est pas disponible.";
    const { x: GX, z: GZ, y: Y } = GARAGE;
    car.spin = 0;
    car.speed = 0;
    if (car.phys) car.phys.enabled = false;
    car.yaw = Math.PI / 2; // nez vers l'ouest (la porte)
    car.root.position.set(GX - 10, Y - 7, GZ);
    this.job = { car, t: 0 };
    G.audio.whoosh(2.5, 80, 260, 0.12);
    return `🚗 ${car.def.name} : l'ascenseur la monte, elle sort du garage impérial…`;
  }

  private update(dt: number) {
    const { x: GX, z: GZ, y: Y } = GARAGE;
    const near = G.camera.position.distanceToSquared(new THREE.Vector3(GX, Y, GZ)) < 200 * 200;
    const j = this.job;
    let wantDoor = near && Math.abs(G.player.position.x - (GX - 49)) < 18 && Math.abs(G.player.position.z - GZ) < 16 ? 1 : 0;
    (this.beacon.material as THREE.MeshBasicMaterial).opacity = 0;
    if (j) {
      j.t += dt;
      const car = j.car;
      const p = car.root.position;
      if (j.t < 4) {
        // montée de l'ascenseur
        const u = j.t / 4;
        const y = Y - 7 + (7.3 + 0.05) * (u * u * (3 - 2 * u));
        p.set(GX - 10, y, GZ);
        this.lift.position.y = y - 0.25;
        (this.beacon.material as THREE.MeshBasicMaterial).opacity = 0.18 * Math.sin(u * Math.PI);
        if (Math.floor(j.t * 2) !== Math.floor((j.t - dt) * 2)) G.audio.tone(520 + j.t * 60, 0.08, "sine", 0.04);
      } else if (j.t < 4.6) {
        car.setEngine(true);
        car.doorTarget = 0;
      } else if (j.t < 9) {
        // la voiture sort seule
        wantDoor = 1;
        const u = Math.min(1, (j.t - 4.6) / 4.4);
        const e = u * u * (3 - 2 * u);
        const x0 = GX - 10,
          x1 = GX - 78;
        const nx = x0 + (x1 - x0) * e;
        car.speed = ((x0 - x1) / 4.4) * 6 * u * (1 - u);
        p.set(nx, G.physics.ground(nx, Y + 2, GZ, 2.5).y, GZ);
        this.lift.position.y = damp(this.lift.position.y, Y + 0.05, 2, dt);
      } else {
        car.speed = 0;
        p.y = G.physics.ground(p.x, Y + 2, p.z, 2.5).y;
        G.cars.park(car);
        car.doorTarget = 1;
        this.job = null;
        bus.emit("toast", { text: `✅ ${car.def.name} est prête devant le garage. Montez (E), puis 🤖 Pilote automatique.` });
        G.audio.tone(880, 0.2, "sine", 0.08);
      }
    }
    this.doorOpen = damp(this.doorOpen, wantDoor, 3, dt);
    this.door.position.y = Y + 6 + this.doorOpen * 11.5;
  }
}

function signTexture(text: string) {
  const cv = document.createElement("canvas");
  cv.width = 1024;
  cv.height = 128;
  const c = cv.getContext("2d")!;
  c.fillStyle = "#0b1a3a";
  c.fillRect(0, 0, 1024, 128);
  c.fillStyle = "#ffd27a";
  c.font = "bold 70px Georgia, serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(text, 512, 68);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** PORTAILS ROYAUX : l'ancien palais (portail nord) ⇄ le Palais Impérial (entrée de l'avenue), en un instant. */
export function buildPortals() {
  const ends = [
    { id: "old", name: "l'ancien palais", pos: new THREE.Vector3(46, 0, 360) },
    { id: "imp", name: "le Palais Impérial", pos: new THREE.Vector3(GARAGE.x - 600 - 46, 0, GARAGE.z + 300 - 1300) }
  ];
  const ringM = new THREE.MeshStandardMaterial({ color: 0x1a1406, emissive: 0xffc861, emissiveIntensity: 1.6, metalness: 0.9, roughness: 0.2 });
  const veilM = new THREE.MeshBasicMaterial({ color: 0x6fd8ff, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
  const veils: THREE.Mesh[] = [];
  for (const e of ends) {
    e.pos.y = G.physics.ground(e.pos.x, 2000, e.pos.z, 3000).y;
    const g = new THREE.Group();
    g.position.copy(e.pos);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.45, 16, 64), ringM);
    ring.position.y = 4.6;
    const veil = new THREE.Mesh(new THREE.CircleGeometry(3.9, 48), veilM);
    veil.position.y = 4.6;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.4, 0.5, 32), mat.marble);
    g.add(ring, veil, base);
    G.scene.add(g);
    veils.push(veil);
    const other = ends.find((o) => o !== e)!;
    G.interact.add({
      id: "portal-" + e.id,
      pos: e.pos.clone().add(new THREE.Vector3(0, 1, 0)),
      radius: 4.5,
      enabled: () => G.mode === "foot",
      label: () => `🌀 Portail royal → ${other.name}`,
      action: () => {
        bus.emit("fade");
        G.audio.whoosh(0.8, 200, 2000, 0.15);
        G.player.teleport(other.pos.clone().add(new THREE.Vector3(0, 0.2, 7)), other.id === "imp" ? Math.PI : 0);
      }
    });
    G.world.markers.push({ id: "portal-" + e.id, name: `Portail royal (${e.name})`, pos: e.pos.clone(), icon: "🌀", visible: () => true });
  }
  G.palace.updaters.push((dt, t) => {
    for (const v of veils) {
      v.rotation.z += dt * 0.8;
      (v.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(t * 3) * 0.12;
    }
  });
}
