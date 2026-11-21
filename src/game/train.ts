// LE TRAIN ROYAL — train à grande vitesse sur viaduc (jusqu'à 340 km/h) : Zuria ⇄ pont ⇄ palais ⇄
// ville futuriste. Gares avec quai, verrière et ascenseur ; on monte
// à bord depuis la gare (ou à la voix : « prends le train pour Zuria »), caméra de voyage, arrivée en gare.
import * as THREE from "three";
import { G, bus, clamp, normalize } from "../core";
import { mat } from "../world/materials";
import { SEA } from "../world/terrain";

interface Station {
  id: string;
  name: string;
  s: number; // abscisse le long de la voie
  pos: THREE.Vector3; // point du quai sur la voie
  ground: THREE.Vector3; // accès au sol (ascenseur)
}

const ROUTE: [number, number, string?][] = [
  [-2700, 300, "Zuria"],
  [-2450, 210],
  [-2200, 120],
  [-1800, 10],
  [-1300, -130],
  [-980, -175],
  [-700, -290],
  [-420, -420],
  [-200, -440, "Palais royal"],
  [150, -440],
  [500, -390],
  [760, -220],
  [850, 70, "Ville futuriste"]
];
const ABOVE = 30; // hauteur de la voie au-dessus du sol / de la mer
const CAR = 26;
const CARS = 5;

export class Train {
  curve!: THREE.CatmullRomCurve3;
  length = 0;
  stations: Station[] = [];
  root = new THREE.Group();
  cars: THREE.Group[] = [];
  s = 0; // position de la tête
  v = 0;
  private dir = 1;
  private dwell = 6;
  ride: { to: Station; from: Station } | null = null;
  private hud!: HTMLElement;
  private camT = 0;
  private camPos = new THREE.Vector3();
  private table: { s: number; y: number }[] = [];

  build() {
    G.scene.add(this.root);
    const hw = (G.world as any).highway as { onRoad: (x: number, z: number) => boolean } | undefined;
    const ground = (x: number, z: number) => Math.max(G.physics.terrain(x, z), SEA);
    // voie : courbe lissée, hauteur constante au-dessus du relief (lissée)
    const pts = ROUTE.map(([x, z]) => new THREE.Vector3(x, 0, z));
    const flat = new THREE.CatmullRomCurve3(pts, false, "centripetal");
    const n = Math.ceil(flat.getLength() / 8);
    const samples = flat.getSpacedPoints(n);
    const raw = samples.map((p) => ground(p.x, p.z) + ABOVE);
    const ys = raw.map((_, i) => {
      let m = -Infinity;
      for (let k = -10; k <= 10; k++) m = Math.max(m, raw[Math.min(raw.length - 1, Math.max(0, i + k))]);
      return m;
    });
    samples.forEach((p, i) => (p.y = ys[i]));
    this.curve = new THREE.CatmullRomCurve3(samples, false, "centripetal");
    this.length = this.curve.getLength();
    // tablier + rails + guide lumineux (instanciés par tronçons de 8 m)
    const seg = Math.ceil(this.length / 8);
    const deck = new THREE.InstancedMesh(new THREE.BoxGeometry(6, 1.2, 8.3), new THREE.MeshStandardMaterial({ color: 0xd8dce4, metalness: 0.4, roughness: 0.4 }), seg);
    const glow = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.12, 8.3), mat.glowCyan, seg);
    const pil = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1.4, 1, 10), new THREE.MeshStandardMaterial({ color: 0xc8ccd6, roughness: 0.6 }), seg);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    let pc = 0;
    for (let i = 0; i < seg; i++) {
      const u = (i + 0.5) / seg;
      const p = this.curve.getPointAt(u);
      const t = this.curve.getTangentAt(u);
      q.setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), t, up));
      m4.compose(p.clone().add(new THREE.Vector3(0, -0.9, 0)), q, new THREE.Vector3(1, 1, 1));
      deck.setMatrixAt(i, m4);
      m4.compose(p.clone().add(new THREE.Vector3(0, -0.25, 0)), q, new THREE.Vector3(1, 1, 1));
      glow.setMatrixAt(i, m4);
      if (i % 8 === 0) {
        const g = G.physics.terrain(p.x, p.z);
        if (!hw?.onRoad(p.x, p.z) && !G.physics.pointInSolid(new THREE.Vector3(p.x, g + 2, p.z))) {
          const base = Math.min(g, SEA) - 6;
          const h = p.y - 1.5 - base;
          m4.compose(new THREE.Vector3(p.x, base + h / 2, p.z), new THREE.Quaternion(), new THREE.Vector3(1, h, 1));
          pil.setMatrixAt(pc++, m4);
        }
      }
      this.table.push({ s: u * this.length, y: p.y });
    }
    pil.count = pc;
    deck.receiveShadow = true;
    pil.castShadow = true;
    this.root.add(deck, glow, pil);
    // gares
    for (const [x, z, name] of ROUTE) {
      if (!name) continue;
      const s = this.nearestS(new THREE.Vector3(x, 0, z));
      this.addStation(name, s);
    }
    // rame : 5 voitures blanc et or
    const body = new THREE.MeshStandardMaterial({ color: 0xf4f6fa, metalness: 0.5, roughness: 0.25 });
    const win = new THREE.MeshStandardMaterial({ color: 0x0a1424, emissive: 0x3fa8ff, emissiveIntensity: 0.9, metalness: 0.8, roughness: 0.1 });
    for (let k = 0; k < CARS; k++) {
      const c = new THREE.Group();
      const shell = new THREE.Mesh(new THREE.CapsuleGeometry(1.9, CAR - 4, 6, 18), body);
      shell.rotation.x = Math.PI / 2;
      shell.scale.set(1, 1, 1.1);
      shell.position.y = 2.2;
      shell.castShadow = true;
      c.add(shell);
      for (const sx of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, CAR - 6), win);
        w.position.set(sx * 1.88, 2.7, 0);
        c.add(w);
      }
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.18, CAR - 3), mat.gold);
      stripe.position.y = 1.6;
      c.add(stripe);
      if (k === 0) {
        const nose = new THREE.Mesh(new THREE.ConeGeometry(1.9, 7, 18), body);
        nose.rotation.x = -Math.PI / 2;
        nose.position.set(0, 2.2, -CAR / 2 - 2.6);
        nose.scale.set(1, 1, 0.6);
        const light = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), mat.glowWhite);
        light.position.set(0, 1.9, -CAR / 2 - 5.2);
        c.add(nose, light);
      }
      if (k === CARS - 1) {
        const tail = new THREE.Mesh(new THREE.ConeGeometry(1.9, 6, 18), body);
        tail.rotation.x = Math.PI / 2;
        tail.position.set(0, 2.2, CAR / 2 + 2.2);
        tail.scale.set(1, 1, 0.6);
        c.add(tail);
      }
      this.root.add(c);
      this.cars.push(c);
    }
    this.s = this.stations[0].s;
    // HUD de voyage
    this.hud = document.createElement("div");
    this.hud.className = "train-hud";
    this.hud.hidden = true;
    document.body.appendChild(this.hud);
    G.palace.updaters.push((dt) => this.update(dt));
    G.world.markers.push({ id: "train", name: "Train royal", pos: this.stations[1].pos.clone(), icon: "🚄", visible: () => false });
  }

  private nearestS(p: THREE.Vector3) {
    let best = 0,
      bd = Infinity;
    for (let i = 0; i <= 400; i++) {
      const u = i / 400;
      const q = this.curve.getPointAt(u);
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < bd) {
        bd = d;
        best = u * this.length;
      }
    }
    return best;
  }

  private addStation(name: string, s: number) {
    const u = s / this.length;
    const p = this.curve.getPointAt(u);
    const t = this.curve.getTangentAt(u);
    const side = new THREE.Vector3(-t.z, 0, t.x).normalize();
    const g = new THREE.Group();
    const yaw = Math.atan2(t.x, t.z);
    // quai + verrière
    const plat = new THREE.Mesh(new THREE.BoxGeometry(9, 1, 150), new THREE.MeshStandardMaterial({ color: 0x2a2e38, metalness: 0.4, roughness: 0.5 }));
    plat.position.set(0, -1, 0);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 150), mat.glowGold);
    edge.position.set(-4.3, -0.46, 0);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 150, 24, 1, true, 0, Math.PI), new THREE.MeshPhysicalMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
    roof.rotation.z = Math.PI / 2;
    roof.rotation.y = Math.PI / 2;
    roof.position.set(-3, 3.5, 0);
    g.add(plat, edge, roof);
    // panneau
    const cv = document.createElement("canvas");
    cv.width = 1024;
    cv.height = 200;
    const c = cv.getContext("2d")!;
    c.fillStyle = "#0b2a4a";
    c.fillRect(0, 0, 1024, 200);
    c.fillStyle = "#ffd27a";
    c.font = "bold 90px Arial";
    c.textAlign = "center";
    c.fillText(`🚄 GARE — ${name.toUpperCase()}`, 512, 130);
    const tx = new THREE.CanvasTexture(cv);
    tx.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 3.1), new THREE.MeshBasicMaterial({ map: tx, side: THREE.DoubleSide }));
    sign.position.set(4.5, 5.5, 0);
    sign.rotation.y = Math.PI / 2;
    g.add(sign);
    // tour d'ascenseur vitrée jusqu'au sol
    const groundY = G.physics.terrain(p.x + side.x * 14, p.z + side.z * 14);
    const towerH = p.y - groundY;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, towerH, 16), new THREE.MeshPhysicalMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.3, roughness: 0.05 }));
    tower.position.set(9, -towerH / 2, 0);
    g.add(tower);
    g.position.copy(p).addScaledVector(side, 5.5);
    g.rotation.y = yaw;
    this.root.add(g);
    // physique du quai
    const center = p.clone().addScaledVector(side, 5.5);
    const ext = Math.abs(t.x) > Math.abs(t.z) ? { x: 75, z: 4.5 } : { x: 4.5, z: 75 };
    G.physics.addBox({ x: center.x - ext.x, y: p.y - 1.5, z: center.z - ext.z }, { x: center.x + ext.x, y: p.y - 0.5, z: center.z + ext.z }, "station");
    const groundPt = new THREE.Vector3(p.x + side.x * 14, groundY, p.z + side.z * 14);
    const st: Station = { id: normalize(name), name, s, pos: p.clone(), ground: groundPt };
    this.stations.push(st);
    G.interact.add({
      id: "train-" + st.id,
      pos: groundPt.clone(),
      radius: 7,
      label: () => `🚄 Prendre le train (gare ${name})`,
      action: () => bus.emit("ui:train", st.id)
    });
    G.world.markers.push({ id: "gare-" + st.id, name: `Gare — ${name}`, pos: groundPt.clone(), icon: "🚄", visible: () => true });
  }

  /** Monte dans le train vers une destination (texte libre ou id de gare). */
  rideTo(text: string): string {
    const n = normalize(text);
    const to = this.stations.find((s) => n.includes(s.id) || n.includes(s.id.split(" ")[0])) ?? (/ville|city/.test(n) ? this.stations.find((s) => /ville/.test(s.id)) : /palais|maison/.test(n) ? this.stations.find((s) => /palais/.test(s.id)) : null);
    if (!to) return `Gares du train royal : ${this.stations.map((s) => s.name).join(", ")}. Dites par exemple « prends le train pour Zuria ».`;
    if (G.mode !== "foot") return "Descendez d'abord du véhicule.";
    const p = G.player.position;
    const from = this.stations.reduce((a, b) => (a.ground.distanceTo(p) < b.ground.distanceTo(p) ? a : b));
    if (from === to) return `Vous êtes déjà à la gare ${to.name}.`;
    this.start(from, to);
    return `En voiture ! Train royal de ${from.name} à ${to.name}.`;
  }

  private start(from: Station, to: Station) {
    this.ride = { from, to };
    this.s = from.s;
    this.dir = to.s > from.s ? 1 : -1;
    this.v = 0;
    this.dwell = 0;
    G.mode = "cinematic";
    G.player.hideBody = true;
    this.camT = 0;
    this.camPos.copy(G.camera.position);
    this.hud.hidden = false;
    bus.emit("mode");
    bus.emit("fade");
    G.audio.whoosh(1.4, 200, 1400, 0.2);
  }

  private arrive() {
    const to = this.ride!.to;
    this.ride = null;
    this.hud.hidden = true;
    G.mode = "foot";
    G.player.hideBody = false;
    G.player.teleport(to.ground.clone().add(new THREE.Vector3(0, 0.2, 0)));
    bus.emit("mode");
    bus.emit("toast", { text: `🚄 Arrivée en gare : ${to.name}.` });
  }

  private place() {
    const tmp = new THREE.Vector3();
    for (let k = 0; k < CARS; k++) {
      const sk = clamp(this.s - this.dir * k * (CAR + 1.5), 0, this.length);
      const u = sk / this.length;
      const p = this.curve.getPointAt(u);
      this.curve.getTangentAt(u, tmp);
      const c = this.cars[k];
      c.position.copy(p);
      c.lookAt(p.clone().addScaledVector(tmp, -this.dir));
    }
  }

  update(dt: number) {
    const first = this.stations[0].s,
      last = this.stations[this.stations.length - 1].s;
    const VMAX = 95; // ≈ 340 km/h
    if (this.ride) {
      const target = this.ride.to.s;
      const left = (target - this.s) * this.dir;
      const brake = Math.sqrt(Math.max(0, 2 * 2.2 * left));
      this.v = Math.min(VMAX, this.v + 6 * dt, brake);
      this.s += this.dir * Math.max(this.v, left > 1 ? 2 : 0) * dt;
      this.place();
      if (left <= 0.5) {
        this.s = target;
        this.place();
        this.arrive();
        return;
      }
      // caméra de voyage : de côté, puis derrière
      this.camT += dt;
      const head = this.cars[0];
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(head.quaternion);
      const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const a = Math.sin(this.camT * 0.12);
      const want = head.position.clone().addScaledVector(fwd, -40 - 20 * a).addScaledVector(side, 22 * Math.cos(this.camT * 0.12)).add(new THREE.Vector3(0, 10, 0));
      this.camPos.lerp(want, 1 - Math.exp(-dt * 3));
      G.camera.position.copy(this.camPos);
      G.camera.lookAt(head.position.clone().addScaledVector(fwd, 30));
      G.player.position.copy(head.position);
      const kmh = Math.round(this.v * 3.6);
      this.hud.innerHTML = `🚄 <b>Train royal</b> · ${kmh} km/h · ➜ ${this.ride.to.name} <small>${Math.max(0, Math.round(left))} m</small>`;
      return;
    }
    // sans passager : navette automatique entre les terminus
    if (this.dwell > 0) {
      this.dwell -= dt;
      this.place();
      return;
    }
    const target = this.dir > 0 ? last : first;
    const left = (target - this.s) * this.dir;
    const brake = Math.sqrt(Math.max(0, 2 * 2.2 * left));
    this.v = Math.min(VMAX, this.v + 6 * dt, brake);
    this.s += this.dir * Math.max(this.v, left > 1 ? 2 : 0) * dt;
    if (left <= 0.5) {
      this.s = target;
      this.dir *= -1;
      this.v = 0;
      this.dwell = 12;
    }
    this.place();
  }
}
