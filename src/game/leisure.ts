// LOISIRS DU ROYAUME : trafic automobile sur l'autoroute, chasse au trésor, Île des Attractions
// (grande roue, montagnes russes, carrousel), yacht royal, courses contre la montre et visite guidée par GRIOT.
import * as THREE from "three";
import { G, bus, clamp, damp } from "../core";
import { mat } from "../world/materials";
import { routePaths } from "../world/expansion";
import { ZONES, SEA } from "../world/terrain";
import { IMPERIAL } from "../world/imperial";

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const groundY = (x: number, z: number, from = 3000) => G.physics.ground(x, from, z, 4000).y;
const store = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem(k);
      return v ? (JSON.parse(v) as T) : d;
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* rien */
    }
  }
};
function label(text: string, w = 18, h = 3, fg = "#ffd27a", bg = "#0b1a3a") {
  const cv = document.createElement("canvas");
  cv.width = 1024;
  cv.height = Math.round((1024 * h) / w);
  const c = cv.getContext("2d")!;
  c.fillStyle = bg;
  c.fillRect(0, 0, cv.width, cv.height);
  c.fillStyle = fg;
  c.font = `bold ${Math.round(cv.height * 0.55)}px Georgia, serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(text, 512, cv.height / 2 + 4);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }));
}

// ====================================================================== TRAFIC
export class Traffic {
  private im!: THREE.InstancedMesh;
  private cab!: THREE.InstancedMesh;
  private cars: { r: number; s: number; dir: number; v: number }[] = [];
  private paths: { pts: [number, number][]; cum: number[]; len: number }[] = [];
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();

  build() {
    for (const p of routePaths) {
      const cum = [0];
      for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
      this.paths.push({ pts: p, cum, len: cum[cum.length - 1] });
    }
    const n = 56;
    this.im = new THREE.InstancedMesh(new THREE.BoxGeometry(2, 0.9, 4.6).translate(0, 0.75, 0), new THREE.MeshStandardMaterial({ metalness: 0.7, roughness: 0.3 }), n);
    this.cab = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, 0.6, 2.3).translate(0, 1.5, 0.2), new THREE.MeshStandardMaterial({ color: 0x0c1420, metalness: 0.6, roughness: 0.15 }), n);
    const col = new THREE.Color();
    const palette = [0xf4f4f6, 0x0a0a0c, 0x8a0f18, 0x1b3f8f, 0xb8913a, 0x9aa3ad, 0x0b3a2a, 0xe0b0c8];
    for (let i = 0; i < n; i++) {
      const r = i % this.paths.length;
      this.cars.push({ r, s: Math.random() * this.paths[r].len, dir: i % 2 ? 1 : -1, v: 20 + Math.random() * 12 });
      this.im.setColorAt(i, col.setHex(palette[i % palette.length]));
    }
    this.im.castShadow = true;
    G.scene.add(this.im, this.cab);
    G.palace.updaters.push((dt) => this.update(dt));
  }

  private at(r: number, s: number) {
    const P = this.paths[r];
    s = clamp(s, 0, P.len);
    let i = 1;
    while (i < P.cum.length - 1 && P.cum[i] < s) i++;
    const a = P.pts[i - 1],
      b = P.pts[i];
    const u = (s - P.cum[i - 1]) / Math.max(0.01, P.cum[i] - P.cum[i - 1]);
    return { x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u, dx: b[0] - a[0], dz: b[1] - a[1] };
  }

  private update(dt: number) {
    const hw = (G.world as any).highway as { heightAt: (x: number, z: number) => number } | undefined;
    if (!hw || G.camera.position.lengthSq() > 9000 * 9000) return;
    this.cars.forEach((c, i) => {
      const P = this.paths[c.r];
      c.s += c.v * c.dir * dt;
      if (c.s > P.len - 2) c.dir = -1;
      if (c.s < 2) c.dir = 1;
      const p = this.at(c.r, c.s);
      const l = Math.hypot(p.dx, p.dz) || 1;
      const nx = -p.dz / l,
        nz = p.dx / l; // normale
      const lane = 4.2 * c.dir;
      const x = p.x + nx * lane,
        z = p.z + nz * lane;
      let y = hw.heightAt(x, z);
      if (!isFinite(y)) y = G.physics.terrain(x, z);
      const yaw = Math.atan2(p.dx * c.dir, p.dz * c.dir);
      this.q.setFromAxisAngle(V3(0, 1, 0), yaw);
      this.m4.compose(V3(x, y, z), this.q, V3(1, 1, 1));
      this.im.setMatrixAt(i, this.m4);
      this.cab.setMatrixAt(i, this.m4);
    });
    this.im.instanceMatrix.needsUpdate = true;
    this.cab.instanceMatrix.needsUpdate = true;
  }
}

// ====================================================================== CHASSE AU TRÉSOR
const JEWELS: { id: string; zone: string; x: number; z: number; y?: number }[] = [
  { id: "jardins", zone: "les jardins royaux", x: 60, z: -470 },
  { id: "ville", zone: "la ville futuriste", x: 1480, z: 120 },
  { id: "jungle", zone: "la jungle tropicale", x: 320, z: -1820 },
  { id: "zuria", zone: "le pays de Zuria", x: -2880, z: 460 },
  { id: "imperial", zone: "les jardins du Palais Impérial", x: -420, z: 5150 },
  { id: "ile", zone: "l'Île des Attractions", x: -1500, z: 1520 },
  { id: "base", zone: "la base secrète", x: 690, z: 1830 },
  { id: "vallee", zone: "la vallée nocturne", x: -620, z: -1260 },
  { id: "aeroport", zone: "l'Aéroport Royal", x: 2300, z: -2250 },
  { id: "metropole", zone: "la Nouvelle Métropole", x: 3480, z: 640 },
  { id: "col", zone: "la route impériale du col royal", x: 0, z: 2600 },
  { id: "marina", zone: "la marina royale", x: -860, z: 520 }
];

export class Treasure {
  found: string[] = store.get<string[]>("griot-treasure", []);
  private gems: { id: string; m: THREE.Mesh; base: number }[] = [];

  build() {
    const geo = new THREE.OctahedronGeometry(0.7, 0);
    const colors = [0xff3b6b, 0x3bd8ff, 0x7cff6b, 0xffd23b, 0xb46bff, 0xff8a3b];
    JEWELS.forEach((j, i) => {
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: colors[i % colors.length], emissive: colors[i % colors.length], emissiveIntensity: 1.4, metalness: 0.6, roughness: 0.1 }));
      m.scale.set(1, 1.5, 1);
      const y = j.y ?? groundY(j.x, j.z) + 1.4;
      m.position.set(j.x, y, j.z);
      m.visible = !this.found.includes(j.id);
      G.scene.add(m);
      this.gems.push({ id: j.id, m, base: y });
    });
    G.palace.updaters.push((dt, t) => this.update(dt, t));
  }

  start() {
    const left = JEWELS.length - this.found.length;
    if (!left) return "Vous avez déjà trouvé les 12 joyaux royaux ! Dites « recommence la chasse au trésor » pour rejouer.";
    return `Chasse au trésor royale : ${left} joyaux sont cachés dans le monde. Dites « indice » et je vous guide vers le plus proche.`;
  }

  reset() {
    this.found = [];
    store.set("griot-treasure", []);
    for (const g of this.gems) g.m.visible = true;
    return "Les 12 joyaux sont de nouveau cachés. Bonne chasse !";
  }

  hint() {
    const p = G.player.position;
    const left = JEWELS.filter((j) => !this.found.includes(j.id));
    if (!left.length) return "Tous les joyaux sont trouvés, Majesté !";
    const j = left.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    const d = Math.hypot(j.x - p.x, j.z - p.z);
    const ang = Math.atan2(j.x - p.x, -(j.z - p.z)); // 0 = nord (+z)
    const dirs = ["au nord", "au nord-est", "à l'est", "au sud-est", "au sud", "au sud-ouest", "à l'ouest", "au nord-ouest"];
    const k = Math.round((((Math.atan2(j.x - p.x, j.z - p.z) * 180) / Math.PI + 360) % 360) / 45) % 8;
    void ang;
    return d < 60 ? `Vous brûlez ! Le joyau est à ${Math.round(d)} m, ${dirs[k]}. Cherchez une pierre précieuse qui brille.` : `Le joyau le plus proche est caché dans ${j.zone}, à ${d > 1000 ? (d / 1000).toFixed(1) + " km" : Math.round(d) + " m"} ${dirs[k]}.`;
  }

  private update(dt: number, t: number) {
    const p = G.player.position;
    for (const g of this.gems) {
      if (!g.m.visible) continue;
      g.m.rotation.y += dt * 1.5;
      g.m.position.y = g.base + Math.sin(t * 2) * 0.25;
      if (G.mode === "foot" || G.mode === "car") {
        const dx = g.m.position.x - p.x,
          dz = g.m.position.z - p.z;
        if (dx * dx + dz * dz < (G.mode === "car" ? 16 : 6) && Math.abs(g.m.position.y - p.y) < 4) {
          g.m.visible = false;
          this.found.push(g.id);
          store.set("griot-treasure", this.found);
          G.audio.tone(988, 0.15, "sine", 0.1, 1480);
          const left = JEWELS.length - this.found.length;
          bus.emit("toast", { text: left ? `💎 Joyau trouvé ! Encore ${left} à découvrir (dites « indice »).` : "👑 LES 12 JOYAUX SONT À VOUS ! Trésor royal complet !" });
          if (!left) G.fireworks?.show(40);
        }
      }
    }
  }
}

// ====================================================================== ÎLE DES ATTRACTIONS
export class ThemePark {
  private wheel = new THREE.Group();
  private cabins: THREE.Object3D[] = [];
  private carousel = new THREE.Group();
  private coaster!: THREE.CatmullRomCurve3;
  private cart = new THREE.Group();
  private cartS = 0;
  private cartV = 0;
  ride: { kind: "wheel" | "coaster"; t: number; cabin?: number } | null = null;
  private exitPos = V3();
  pier = V3();
  readonly c = ZONES.park;

  build() {
    const { x: X, z: Z } = this.c;
    const Y = 3;
    const root = new THREE.Group();
    G.scene.add(root);
    // esplanade
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(250, 64), new THREE.MeshStandardMaterial({ color: 0xb9ad98, roughness: 0.85 }));
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(X, Y + 0.05, Z);
    plaza.receiveShadow = true;
    root.add(plaza);
    // portique d'entrée
    const sign = label("✨ PARC ROYAL ✨", 30, 5);
    sign.position.set(X + 200, Y + 14, Z);
    sign.rotation.y = Math.PI / 2;
    root.add(sign);
    for (const dz of [-16, 16]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.2, 16, 16), mat.gold);
      col.position.set(X + 200, Y + 8, Z + dz);
      root.add(col);
    }
    // ponton (arrivée en yacht)
    this.pier.set(X + this.c.r + 30, Y, Z);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(110, 1, 8), mat.wood);
    deck.position.set(X + this.c.r - 10, Y - 0.2, Z);
    root.add(deck);
    G.physics.addBox({ x: X + this.c.r - 65, y: -5, z: Z - 4 }, { x: X + this.c.r + 45, y: Y + 0.3, z: Z + 4 }, "pier");

    // ---------- grande roue (rayon 42 m)
    const WX = X - 90,
      WZ = Z - 40,
      R = 42;
    this.wheel.position.set(WX, Y + R + 8, WZ);
    root.add(this.wheel);
    const rimM = new THREE.MeshStandardMaterial({ color: 0xf4f6fa, metalness: 0.6, roughness: 0.3 });
    for (const off of [-2.2, 2.2]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.4, 8, 96), rimM);
      rim.position.z = off;
      this.wheel.add(rim);
      const bulbs = new THREE.Mesh(new THREE.TorusGeometry(R + 0.6, 0.25, 6, 96), mat.glowCyan);
      bulbs.position.z = off;
      this.wheel.add(bulbs);
    }
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, R * 2, 6), rimM);
      spoke.rotation.z = a;
      this.wheel.add(spoke);
      const cab = new THREE.Group();
      const shell = new THREE.Mesh(new THREE.SphereGeometry(2.4, 16, 12), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(k / 16, 0.7, 0.55), metalness: 0.4, roughness: 0.3, transparent: true, opacity: 0.85 }));
      shell.scale.set(1, 1.1, 1);
      cab.add(shell);
      cab.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
      this.wheel.add(cab);
      this.cabins.push(cab);
    }
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.1, Math.hypot(R + 8, 18), 10), rimM);
      leg.position.set(WX + sx * 9, Y + (R + 8) / 2, WZ - 4.5);
      leg.rotation.z = sx * Math.atan2(18, R + 8);
      root.add(leg);
      const leg2 = leg.clone();
      leg2.position.z = WZ + 4.5;
      root.add(leg2);
    }
    G.interact.add({ id: "park-wheel", pos: V3(WX, Y + 1, WZ + 8), radius: 5, enabled: () => G.mode === "foot", label: () => "🎡 Monter dans la grande roue", action: () => this.start("wheel") });

    // ---------- carrousel
    this.carousel.position.set(X + 70, Y, Z + 80);
    root.add(this.carousel);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 1, 32), mat.gold);
    base.position.y = 0.5;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(14, 6, 32), new THREE.MeshStandardMaterial({ color: 0xc82a4a, roughness: 0.5 }));
    roof.position.y = 10;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 8, 16), mat.marble);
    pole.position.y = 4.5;
    this.carousel.add(base, roof, pole);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const horse = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 2.4), new THREE.MeshStandardMaterial({ color: k % 2 ? 0xffffff : 0xffd27a, metalness: 0.3 }));
      horse.position.set(Math.cos(a) * 9, 3, Math.sin(a) * 9);
      horse.rotation.y = -a;
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 7, 6), mat.gold);
      rod.position.set(Math.cos(a) * 9, 4.5, Math.sin(a) * 9);
      this.carousel.add(horse, rod);
    }
    G.physics.addBox({ x: X + 58, y: Y, z: Z + 68 }, { x: X + 82, y: Y + 1, z: Z + 92 }, "carousel");

    // ---------- montagnes russes : circuit fermé autour de l'île
    const pts: THREE.Vector3[] = [];
    const NP = 28;
    for (let k = 0; k < NP; k++) {
      const a = (k / NP) * Math.PI * 2;
      const r = 205 + Math.sin(a * 3) * 35;
      const h = k === 0 || k === 1 || k === NP - 1 ? 6 : k === 3 ? 48 : 10 + Math.abs(Math.sin(a * 2.5)) * 30 + (k % 5 === 0 ? 10 : 0);
      pts.push(V3(X + Math.cos(a) * r, Y + h, Z + Math.sin(a) * r));
    }
    this.coaster = new THREE.CatmullRomCurve3(pts, true, "centripetal");
    const railM = new THREE.MeshStandardMaterial({ color: 0xd8203a, metalness: 0.6, roughness: 0.3 });
    const L = this.coaster.getLength();
    const segs = Math.ceil(L / 3);
    const left: THREE.Vector3[] = [],
      right: THREE.Vector3[] = [];
    const supports: THREE.Vector3[] = [];
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const p = this.coaster.getPointAt(u);
      const tg = this.coaster.getTangentAt(u);
      const side = V3(-tg.z, 0, tg.x).normalize().multiplyScalar(0.9);
      left.push(p.clone().add(side));
      right.push(p.clone().sub(side));
      if (i % 4 === 0) supports.push(p);
    }
    for (const line of [left, right]) root.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(line, true), segs * 2, 0.22, 6, true), railM));
    const sup = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.4, 1, 6), new THREE.MeshStandardMaterial({ color: 0xf0f0f0, metalness: 0.5 }), supports.length);
    const m4 = new THREE.Matrix4();
    supports.forEach((p, i) => {
      const h = p.y - Y;
      m4.compose(V3(p.x, Y + h / 2, p.z), new THREE.Quaternion(), V3(1, h, 1));
      sup.setMatrixAt(i, m4);
    });
    root.add(sup);
    // wagon
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1, 4.5), new THREE.MeshStandardMaterial({ color: 0xffd23b, metalness: 0.5, roughness: 0.3 }));
    body.position.y = 0.9;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 1), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
    seat.position.set(0, 1.6, 0.8);
    this.cart.add(body, seat);
    root.add(this.cart);
    const st = this.coaster.getPointAt(0);
    const station = new THREE.Mesh(new THREE.BoxGeometry(14, 0.6, 12), mat.marble);
    station.position.set(st.x, st.y - 0.6, st.z);
    root.add(station);
    G.physics.addBox({ x: st.x - 7, y: Y, z: st.z - 6 }, { x: st.x + 7, y: st.y - 0.3, z: st.z + 6 }, "coaster-station");
    G.interact.add({ id: "park-coaster", pos: () => st.clone().add(V3(0, 0, 0)), radius: 7, enabled: () => G.mode === "foot", label: () => "🎢 Monter dans les montagnes russes", action: () => this.start("coaster") });
    // escalier vers la station
    for (let k = 0; k < 6; k++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(4, 0.5, 2), mat.marble);
      const y = Y + (k + 1) * ((st.y - 0.3 - Y) / 6);
      const dir = V3(X, 0, Z).sub(V3(st.x, 0, st.z)).normalize();
      const pos = V3(st.x, 0, st.z).addScaledVector(dir, 8 + (5 - k) * 2);
      s.position.set(pos.x, y - 0.25, pos.z);
      root.add(s);
      G.physics.addBox({ x: pos.x - 2, y: y - 0.5, z: pos.z - 1 }, { x: pos.x + 2, y, z: pos.z + 1 }, "stairs");
    }
    // lampions
    const bulbs: THREE.Vector3[] = [];
    for (let k = 0; k < 60; k++) {
      const a = (k / 60) * Math.PI * 2;
      bulbs.push(V3(X + Math.cos(a) * 240, Y + 5, Z + Math.sin(a) * 240));
    }
    const lamp = new THREE.InstancedMesh(new THREE.SphereGeometry(0.6, 8, 6), mat.glowGold, bulbs.length);
    bulbs.forEach((b, i) => {
      m4.makeTranslation(b.x, b.y, b.z);
      lamp.setMatrixAt(i, m4);
    });
    root.add(lamp);

    G.world.markers.push({ id: "park", name: "Île des Attractions", pos: V3(X, 0, Z), icon: "🎡", visible: () => true });
    G.palace.updaters.push((dt, t) => this.update(dt, t));
  }

  private start(kind: "wheel" | "coaster") {
    if (this.ride) return;
    this.exitPos.copy(G.player.position);
    this.ride = { kind, t: 0, cabin: 0 };
    if (kind === "coaster") {
      this.cartS = 0;
      this.cartV = 4;
    } else {
      // la cabine la plus basse
      let best = 0,
        by = Infinity;
      this.cabins.forEach((c, i) => {
        const y = c.getWorldPosition(V3()).y;
        if (y < by) (by = y), (best = i);
      });
      this.ride.cabin = best;
    }
    G.mode = "ride" as any;
    bus.emit("mode");
    bus.emit("toast", { text: kind === "coaster" ? "🎢 Accrochez-vous ! (F pour descendre à l'arrivée)" : "🎡 Bonne balade dans la grande roue ! (F pour descendre)" });
    G.audio.tone(660, 0.2, "sine", 0.08, 880);
  }

  stop() {
    if (!this.ride) return;
    this.ride = null;
    G.mode = "foot";
    G.player.teleport(this.exitPos.clone(), G.player.yaw);
    bus.emit("mode");
  }

  private update(dt: number, t: number) {
    const near = G.camera.position.distanceToSquared(V3(this.c.x, 0, this.c.z)) < 3000 * 3000;
    if (!near && !this.ride) return;
    this.wheel.rotation.z += dt * 0.06;
    for (const c of this.cabins) c.rotation.z = -this.wheel.rotation.z;
    this.carousel.rotation.y += dt * 0.5;
    this.carousel.children.forEach((ch, i) => {
      if (i >= 3 && (ch as THREE.Mesh).geometry?.type === "BoxGeometry") ch.position.y = 3 + Math.sin(t * 2 + i) * 0.6;
    });
    // wagon
    if (this.ride?.kind === "coaster") {
      const L = this.coaster.getLength();
      const u = (this.cartS / L) % 1;
      const tg = this.coaster.getTangentAt(u);
      // gravité le long de la pente, et remontée mécanique au début
      if (this.cartS < L * 0.12) this.cartV = Math.max(this.cartV, 6);
      this.cartV = clamp(this.cartV - tg.y * 9.8 * dt * 1.6, 6, 32);
      this.cartS += this.cartV * dt;
      if (this.cartS >= L) {
        this.cartS = 0;
        this.stop();
        bus.emit("toast", { text: "🎢 Quel tour ! Encore ? Touchez la station." });
        return;
      }
    } else if (!this.ride) this.cartS = 0;
    const L = this.coaster.getLength();
    const u = (this.cartS / L) % 1;
    const p = this.coaster.getPointAt(u);
    const tg = this.coaster.getTangentAt(u);
    this.cart.position.copy(p);
    this.cart.lookAt(p.clone().sub(tg));
    if (!this.ride) return;
    this.ride.t += dt;
    if (G.input.hit("KeyF") || G.input.hit("KeyE")) {
      if (this.ride.kind === "wheel" || this.ride.t > 2) return this.stop();
    }
    const cam = G.camera;
    G.input.consumeMouse();
    if (this.ride.kind === "coaster") {
      const eye = p.clone().add(V3(0, 2.6, 0));
      cam.position.copy(eye);
      cam.lookAt(eye.clone().add(tg.clone().multiplyScalar(10)).add(V3(0, -1, 0)));
      G.player.position.copy(p);
      if (Math.random() < dt * 2 && tg.y < -0.3) G.audio.whoosh(0.5, 900, 300, 0.05);
    } else {
      const c = this.cabins[this.ride.cabin ?? 0].getWorldPosition(V3());
      cam.position.copy(c).add(V3(0, 0.6, 4.5));
      const out = V3(Math.sin(t * 0.1) * 100, -25, 100);
      cam.lookAt(cam.position.clone().add(out));
      G.player.position.copy(c);
    }
  }
}

// ====================================================================== COURSES CONTRE LA MONTRE
interface Course {
  id: string;
  name: string;
  pts: THREE.Vector3[];
  radius: number;
  modes: string[];
}

export class Races {
  courses: Course[] = [];
  private rings: THREE.Mesh[] = [];
  run: { c: Course; i: number; t: number } | null = null;
  private hud!: HTMLElement;
  private group = new THREE.Group();

  build() {
    const road: THREE.Vector3[] = [];
    for (let z = 420; z <= 4180; z += 340) road.push(V3(0, groundY(0, z) + 4, z));
    const sky: THREE.Vector3[] = [];
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      sky.push(V3(900 + Math.cos(a) * 1300, 160 + Math.sin(a * 3) * 90 + 60, Math.sin(a) * 1300));
    }
    const sea: THREE.Vector3[] = [];
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      sea.push(V3(-7500 + Math.cos(a) * 3600, SEA + 140, 3400 + Math.sin(a) * 3600));
    }
    this.courses = [
      { id: "route", name: "Course de la Route impériale", pts: road, radius: 14, modes: ["car", "foot"] },
      { id: "ciel", name: "Anneaux du ciel (Royal Talon)", pts: sky, radius: 30, modes: ["ship"] },
      { id: "mer", name: "Régate royale (méga-yacht)", pts: sea, radius: 380, modes: ["boat"] }
    ];
    G.scene.add(this.group);
    this.hud = document.createElement("div");
    this.hud.className = "race-hud";
    this.hud.hidden = true;
    document.body.appendChild(this.hud);
    G.interact.add({ id: "race-route", pos: V3(-24, groundY(-24, 380) + 1, 380), radius: 5, enabled: () => G.mode === "foot", label: () => "🏁 Course de la Route impériale (à pied ou en voiture)", action: () => bus.emit("toast", { text: this.start("route") }) });
    const flag = label("🏁 DÉPART", 8, 2);
    flag.position.set(-24, groundY(-24, 380) + 4, 380);
    G.scene.add(flag);
    G.palace.updaters.push((dt) => this.update(dt));
  }

  start(id: string) {
    const c = this.courses.find((x) => x.id === id);
    if (!c) return `Courses : ${this.courses.map((x) => x.name).join(", ")}.`;
    this.stop();
    if (id === "ciel" && G.mode !== "ship") return "Montez d'abord dans le Royal Talon, puis dites « course aérienne ».";
    if (id === "mer" && G.mode !== "boat") return "Prenez d'abord la barre du méga-yacht (dites « yacht »), puis « régate ».";
    if (id === "route" && G.mode === "foot") G.player.teleport(V3(0, groundY(0, 360) + 0.3, 360), Math.PI);
    if (id === "route" && G.mode === "car" && G.cars.active) {
      const car = G.cars.active;
      car.pos.set(0, groundY(0, 360) + 0.2, 360);
      car.yaw = Math.PI;
      car.speed = 0;
    }
    const best = store.get<Record<string, number>>("griot-races", {})[id];
    c.pts.forEach((p, i) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(c.radius, c.radius * 0.08, 10, 48), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: i === 0 ? 0xffd23b : 0x3fa8ff, emissiveIntensity: 1.6, transparent: true, opacity: 0.85 }));
      ring.position.copy(p);
      const nxt = c.pts[(i + 1) % c.pts.length];
      ring.lookAt(nxt);
      this.group.add(ring);
      this.rings.push(ring);
    });
    this.run = { c, i: 0, t: 0 };
    this.hud.hidden = false;
    G.audio.tone(440, 0.3, "square", 0.06);
    setTimeout(() => G.audio.tone(880, 0.4, "square", 0.06), 400);
    return `🏁 ${c.name} : ${c.pts.length} anneaux. Partez !${best ? ` Record : ${best.toFixed(1)} s.` : ""}`;
  }

  stop() {
    for (const r of this.rings) {
      this.group.remove(r);
      r.geometry.dispose();
    }
    this.rings = [];
    this.run = null;
    if (this.hud) this.hud.hidden = true;
  }

  private update(dt: number) {
    const r = this.run;
    if (!r) return;
    r.t += dt;
    const p = G.mode === "ship" ? G.ship.root.position : G.mode === "car" && G.cars.active ? G.cars.active.pos : G.mode === "boat" ? G.yacht.root.position : G.player.position;
    const target = r.c.pts[r.i];
    if (p.distanceTo(target) < r.c.radius * (G.mode === "ship" ? 1.2 : 1.6)) {
      (this.rings[r.i].material as THREE.MeshStandardMaterial).emissive.setHex(0x3bff7a);
      this.rings[r.i].visible = false;
      r.i++;
      G.audio.tone(660 + r.i * 30, 0.12, "sine", 0.08);
      if (r.i >= r.c.pts.length) {
        const recs = store.get<Record<string, number>>("griot-races", {});
        const rec = !recs[r.c.id] || r.t < recs[r.c.id];
        if (rec) {
          recs[r.c.id] = r.t;
          store.set("griot-races", recs);
          G.fireworks?.show(14);
        }
        bus.emit("toast", { text: `🏁 Arrivée ! ${r.c.name} en ${r.t.toFixed(1)} s${rec ? " — 🏆 NOUVEAU RECORD !" : ` (record : ${recs[r.c.id].toFixed(1)} s)`}` });
        this.stop();
        return;
      }
      (this.rings[r.i].material as THREE.MeshStandardMaterial).emissive.setHex(0xffd23b);
    }
    const d = p.distanceTo(r.c.pts[r.i]);
    this.hud.innerHTML = `<b>🏁 ${r.c.name}</b><span>⏱ ${r.t.toFixed(1)} s</span><span>Anneau ${r.i + 1}/${r.c.pts.length} · ${Math.round(d)} m</span>`;
  }
}

// ====================================================================== VISITE GUIDÉE PAR GRIOT
const TOUR: { place: string; text: string }[] = [
  { place: "palace", text: "Bienvenue au Palais royal, le cœur du royaume : sept étages, la salle du trône, le centre de commandement et le hangar du Royal Talon." },
  { place: "gardens", text: "Voici les jardins royaux, avec leurs fontaines et leurs allées. Au nord, la route impériale monte vers la Montagne Royale." },
  { place: "city", text: "La ville futuriste : des tours de verre, la Nouvelle Métropole à l'est, et l'autoroute royale qui relie tout le royaume." },
  { place: "mall", text: "Le Royal Mall : douze boutiques, dont Royal Phone, où l'on achète son téléphone pour appeler ses amis en vidéo." },
  { place: "airport", text: "L'Aéroport Royal : des avions de ligne très détaillés, et des vols vers la Cité des Princesses ou le Palais Impérial." },
  { place: "imperial", text: "Le Palais Impérial, au sommet de la Montagne Royale : plus grand que la ville entière, avec son aéroport privé, son jet IMPERIAL ONE et son garage automatique." },
  { place: "park", text: "L'Île des Attractions : la grande roue, les montagnes russes et le carrousel. Venez-y en yacht depuis la marina royale !" },
  { place: "zuria", text: "Et voici Zuria, le pays voisin, relié par le grand pont royal. La visite est terminée, Majesté. Dites « feu d'artifice » pour fêter ça !" }
];

export class Tour {
  private step = -1;
  private timer = 0;
  active = false;

  build() {
    G.palace.updaters.push((dt) => this.update(dt));
  }

  start() {
    if (G.mode !== "foot") return "Descendez d'abord du véhicule pour la visite.";
    this.active = true;
    this.step = -1;
    this.timer = 0.1;
    return "Suivez-moi, Majesté : je vous fais visiter le royaume. Dites « stop visite » pour arrêter.";
  }

  stop() {
    if (!this.active) return "Aucune visite en cours.";
    this.active = false;
    return "Visite terminée.";
  }

  private async update(dt: number) {
    if (!this.active) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.step++;
    if (this.step >= TOUR.length) {
      this.active = false;
      G.fireworks?.show(20);
      return;
    }
    const s = TOUR[this.step];
    this.timer = 16;
    const { runAction } = await import("../ai/actions");
    await runAction("teleport", s.place);
    bus.emit("griot:say", `${this.step + 1}/${TOUR.length} — ${s.text}`);
  }
}

export const LEISURE_PLACES = {
  park: () => V3(ZONES.park.x + 150, 3.3, ZONES.park.z + 40),
  marina: () => V3(-900, 1.3, 520),
  imperial: () => V3(IMPERIAL.x, IMPERIAL.y, IMPERIAL.z)
};
void damp;
