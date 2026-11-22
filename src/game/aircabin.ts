// LA CABINE DE L'AVION DE LIGNE — on voyage DEDANS : allée centrale, première classe (fauteuils-lits),
// office avec boissons, classe économique 3-3 avec écrans, coffres à bagages, hublots qui montrent le
// vrai vol (caméra sur l'aile), toilettes, porte avant du cockpit. Les amis qui prennent le même vol
// sont dans la même cabine : on se voit, on se parle, on s'assoit côte à côte.
import * as THREE from "three";
import { G, bus } from "../core";
import { mat } from "../world/materials";
import { wallX, wallZ } from "../world/build";

export const AIRCABIN = new THREE.Vector3(-3500, 900, -3500);
const HW = 2.6; // demi-largeur intérieure
const Z1 = -20,
  Z2 = 20;
const HH = 2.7;

export class AirCabin {
  root = new THREE.Group();
  inside = false;
  /** source de la vue des hublots : l'avion du vol (le nôtre ou celui d'un ami) */
  plane: (() => THREE.Object3D | null) | null = null;
  /** vol d'un ami (id de l'hôte) */
  guestOf: string | null = null;
  arrived = false;
  private rt = new THREE.WebGLRenderTarget(512, 256, { type: THREE.HalfFloatType });
  private cam = new THREE.PerspectiveCamera(70, 2, 1, 9000);
  private frame = 0;
  private seats: THREE.Vector3[] = [];

  build() {
    const r = this.root;
    G.scene.add(r);
    const { x: ox, y: oy, z: oz } = AIRCABIN;
    const panel = new THREE.MeshStandardMaterial({ color: 0xeef0f4, roughness: 0.5 });
    const carpetM = new THREE.MeshStandardMaterial({ color: 0x24305a, roughness: 0.95 });
    const fabric = new THREE.MeshStandardMaterial({ color: 0x1b3f8f, roughness: 0.85 });
    const leather = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.5 });
    const cover = new THREE.MeshStandardMaterial({ color: 0xf4f4f8, roughness: 0.8 });
    const darkM = new THREE.MeshStandardMaterial({ color: 0x1a1c22, roughness: 0.5 });
    const solid = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) => G.physics.addBox({ x: ox + x1, y: oy + y1, z: oz + z1 }, { x: ox + x2, y: oy + y2, z: oz + z2 }, "aircabin");
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, isSolid = false) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(ox + x, oy + y + h / 2, oz + z);
      r.add(b);
      if (isSolid) solid(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2);
      return b;
    };
    // coque : plancher, plafond voûté, parois, cloisons
    box(HW * 2 + 1, 1, Z2 - Z1 + 1, panel, 0, -1, 0, true);
    box(HW * 2, 0.6, Z2 - Z1, panel, 0, HH + 0.4, 0, true);
    wallZ(r, ox - HW, oz + Z1, oz + Z2, oy, HH + 0.4, panel, [], 0.3);
    wallZ(r, ox + HW, oz + Z1, oz + Z2, oy, HH + 0.4, panel, [], 0.3);
    wallX(r, oz + Z1, ox - HW, ox + HW, oy, HH + 0.4, panel, [], 0.3);
    wallX(r, oz + Z2, ox - HW, ox + HW, oy, HH + 0.4, panel, [], 0.3);
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, Z2 - Z1), carpetM);
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(ox, oy + 0.02, oz);
    r.add(carpet);
    const aisle = new THREE.Mesh(new THREE.PlaneGeometry(0.06, Z2 - Z1 - 2), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffc861, emissiveIntensity: 1.2 }));
    aisle.rotation.x = -Math.PI / 2;
    for (const sx of [-0.35, 0.35]) {
      const a = aisle.clone();
      a.position.set(ox + sx, oy + 0.03, oz);
      r.add(a);
    }
    // coffres à bagages + bandeau lumineux
    for (const sx of [-1, 1]) {
      box(0.9, 0.55, Z2 - Z1 - 6, panel, sx * (HW - 0.5), 1.95, 1);
      box(0.04, 0.04, Z2 - Z1 - 6, mat.glowWhite, sx * (HW - 0.95), 1.92, 1);
    }
    // hublots (vue en direct du vol)
    const winM = new THREE.MeshBasicMaterial({ map: this.rt.texture });
    const winR = new THREE.MeshBasicMaterial({ map: this.rt.texture, side: THREE.DoubleSide });
    for (let z = Z1 + 3; z < Z2 - 3; z += 1.2)
      for (const sx of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.CircleGeometry(0.22, 20), sx > 0 ? winM : winR);
        w.scale.set(1, 1.35, 1);
        w.position.set(ox + sx * (HW - 0.16), oy + 1.35, oz + z);
        w.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
        if (sx < 0) w.scale.x = -1;
        r.add(w);
      }
    // ---- première classe : 4 fauteuils-lits (z −18 … −10)
    for (const z of [-16.5, -12.5])
      for (const sx of [-1, 1]) {
        const x = sx * 1.6;
        box(1.1, 0.5, 1.9, leather, x, 0, z, true);
        box(1.1, 0.9, 0.25, leather, x, 0.5, z + 0.85);
        box(0.25, 1.1, 2.2, darkM, x + sx * 0.7, 0, z);
        const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.38), new THREE.MeshStandardMaterial({ color: 0, emissive: 0x3fa8ff, emissiveIntensity: 1 }));
        scr.position.set(ox + x, oy + 1.2, oz + z - 1.05);
        r.add(scr);
        this.seats.push(new THREE.Vector3(ox + x, oy + 0.5 + 0.75, oz + z));
      }
    const fcSign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.3), new THREE.MeshBasicMaterial({ map: tex("PREMIÈRE CLASSE", "#d8b25a", "#0b1a3a") }));
    fcSign.position.set(ox, oy + 2.5, oz - 9.6);
    fcSign.rotation.y = Math.PI;
    r.add(fcSign);
    // ---- office (boissons) z −9.5 … −7
    box(1.6, 1, 1.6, panel, -1.7, 0, -8.3, true);
    box(1.6, 1, 1.6, panel, 1.7, 0, -8.3, true);
    box(1.6, 0.05, 1.6, darkM, -1.7, 1, -8.3);
    for (let k = 0; k < 4; k++) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.12, 10), new THREE.MeshStandardMaterial({ color: [0xffffff, 0xd8a12a, 0xc0392b, 0x1f8a4a][k] }));
      cup.position.set(ox - 2.1 + k * 0.25, oy + 1.1, oz - 8.3);
      r.add(cup);
    }
    const drinks = ["un jus d'orange", "un thé à la menthe", "un café", "une eau gazeuse", "un jus de bissap", "un chocolat chaud"];
    let dk = 0;
    G.interact.add({
      id: "aircabin-galley",
      pos: new THREE.Vector3(ox, oy + 1, oz - 8.3),
      radius: 2.6,
      enabled: () => this.inside,
      label: () => "🥤 Demander une boisson",
      action: () => bus.emit("toast", { text: `🥤 L'équipage vous sert ${drinks[dk++ % drinks.length]}. Bon vol !` })
    });
    // ---- classe économique 3-3 (z −6 … 16) : sièges instanciés
    const rows: number[] = [];
    for (let z = -5.5; z < 16; z += 0.95) rows.push(z);
    const xs = [-2.15, -1.6, -1.05, 1.05, 1.6, 2.15];
    const N = rows.length * xs.length;
    const base = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.45, 0.5), fabric, N);
    const back = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.75, 0.12), fabric, N);
    const head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.2, 0.13), cover, N);
    const scr = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.26, 0.17), new THREE.MeshStandardMaterial({ color: 0, emissive: 0x3fa8ff, emissiveIntensity: 0.9 }), N);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    let i = 0;
    for (const z of rows)
      for (const x of xs) {
        m4.compose(new THREE.Vector3(ox + x, oy + 0.42, oz + z), q, one);
        base.setMatrixAt(i, m4);
        m4.compose(new THREE.Vector3(ox + x, oy + 0.95, oz + z + 0.25), q, one);
        back.setMatrixAt(i, m4);
        m4.compose(new THREE.Vector3(ox + x, oy + 1.33, oz + z + 0.25), q, one);
        head.setMatrixAt(i, m4);
        m4.compose(new THREE.Vector3(ox + x, oy + 1.05, oz + z + 0.32), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI), one);
        scr.setMatrixAt(i, m4);
        this.seats.push(new THREE.Vector3(ox + x, oy + 0.65 + 0.75, oz + z));
        i++;
      }
    r.add(base, back, head, scr);
    for (const z of rows) for (const side of [-1, 1]) solid(side < 0 ? -HW : 0.8, 0, z - 0.25, side < 0 ? -0.8 : HW, 0.65, z + 0.25);
    // ---- toilettes + porte de sortie (arrière)
    box(1.6, HH, 1.8, panel, -1.7, 0, 18.6, true);
    const lav = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.3), new THREE.MeshBasicMaterial({ map: tex("🚻 TOILETTES", "#ffffff", "#2a4a6a") }));
    lav.position.set(ox - 1.7, oy + 2.1, oz + 17.68);
    lav.rotation.y = Math.PI;
    r.add(lav);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1, 2), new THREE.MeshStandardMaterial({ color: 0xc8ccd4, emissive: 0x30c85a, emissiveIntensity: 0 }));
    door.position.set(ox + HW - 0.17, oy + 1, oz + 18.5);
    door.rotation.y = -Math.PI / 2;
    r.add(door);
    G.interact.add({
      id: "aircabin-exit",
      pos: new THREE.Vector3(ox + HW - 0.6, oy + 1, oz + 18.5),
      radius: 2.6,
      enabled: () => this.inside,
      label: () => (this.arrived ? "🛬 Descendre de l'avion" : "🚪 Porte (verrouillée pendant le vol)"),
      action: () => (this.arrived ? bus.emit("aircabin:leave") : bus.emit("toast", { text: "La porte reste fermée pendant le vol. Installez-vous et profitez du voyage !" }))
    });
    G.palace.updaters.push(() => ((door.material as THREE.MeshStandardMaterial).emissiveIntensity = this.arrived ? 0.8 : 0));
    // ---- cockpit (porte avant)
    const cdoor = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2), new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.4 }));
    cdoor.position.set(ox, oy + 1, oz + Z1 + 0.17);
    r.add(cdoor);
    G.interact.add({
      id: "aircabin-cockpit",
      pos: new THREE.Vector3(ox, oy + 1, oz + Z1 + 1),
      radius: 2.4,
      enabled: () => this.inside,
      label: () => "🧑‍✈️ Visiter le cockpit (vue des pilotes)",
      action: () => bus.emit("aircabin:view", 2)
    });
    // ---- s'asseoir
    G.interact.add({
      id: "aircabin-seat",
      pos: () => this.nearestSeat()?.clone().setY(oy + 1) ?? new THREE.Vector3(),
      radius: 1.6,
      enabled: () => this.inside && !!this.nearestSeat(),
      label: () => "💺 S'asseoir",
      action: () => {
        const s = this.nearestSeat();
        if (s) G.player.sit(s, 0);
      }
    });
    // éclairage de la cabine
    G.palace.zones.push({
      contains: (p) => Math.abs(p.x - ox) < HW + 1 && p.z > oz + Z1 - 1 && p.z < oz + Z2 + 1 && Math.abs(p.y - oy) < 6,
      lights: [
        { pos: new THREE.Vector3(ox, oy + 2.4, oz - 14), color: 0xfff0d8, intensity: 25, distance: 14 },
        { pos: new THREE.Vector3(ox, oy + 2.4, oz - 2), color: 0xf4f6ff, intensity: 25, distance: 14 },
        { pos: new THREE.Vector3(ox, oy + 2.4, oz + 10), color: 0xf4f6ff, intensity: 25, distance: 14 }
      ]
    });
    G.palace.updaters.push(() => this.update());
  }

  private nearestSeat() {
    const p = G.player.position;
    let best: THREE.Vector3 | null = null,
      bd = 1.4;
    for (const s of this.seats) {
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  /** Embarque dans la cabine (vol du joueur ou vol d'un ami). */
  enter(plane: () => THREE.Object3D | null, guestOf: string | null = null) {
    this.plane = plane;
    this.guestOf = guestOf;
    this.arrived = false;
    this.inside = true;
    G.mode = "foot";
    G.player.hideBody = false;
    const seat = this.seats[4 + Math.floor(Math.random() * 12)];
    G.player.teleport(new THREE.Vector3(AIRCABIN.x, AIRCABIN.y, AIRCABIN.z + Z2 - 3), 0);
    if (seat) setTimeout(() => this.inside && G.player.sit(seat, 0), 600);
    bus.emit("mode");
  }

  leave() {
    this.inside = false;
    this.plane = null;
    this.guestOf = null;
    this.arrived = false;
  }

  private update() {
    if (!this.inside) return;
    if (G.player.position.distanceTo(AIRCABIN) > 60 && G.mode === "foot") return this.leave();
    if (++this.frame % 3) return;
    const p = this.plane?.();
    if (!p) return;
    // caméra sur le flanc droit : vue sur l'aile et le réacteur
    p.updateMatrixWorld();
    this.cam.position.copy(p.localToWorld(new THREE.Vector3(2.3, 3.4, 1.5)));
    this.cam.lookAt(p.localToWorld(new THREE.Vector3(16, 1.8, 6)));
    const r = G.renderer;
    const au = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.rt);
    r.render(G.scene, this.cam);
    r.setRenderTarget(prev);
    r.shadowMap.autoUpdate = au;
  }
}

function tex(text: string, fg: string, bg: string) {
  const cv = document.createElement("canvas");
  cv.width = 512;
  cv.height = 96;
  const c = cv.getContext("2d")!;
  c.fillStyle = bg;
  c.fillRect(0, 0, 512, 96);
  c.fillStyle = fg;
  c.font = "bold 44px Arial";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(text, 256, 50);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
