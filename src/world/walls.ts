// LES GRANDES BARRIÈRES : remparts géants autour du domaine du palais (4 portails monumentaux)
// et enceinte de la ville avec une porte colossale fermée par une barrière d'énergie.
import * as THREE from "three";
import { G } from "../core";
import { mat, tex } from "./materials";
import { span, cyl, wallX, wallZ, glowLine } from "./build";
import { Door } from "./door";
import { ZONES } from "./terrain";
import type { Palace } from "./palace";

const R = 300; // demi-côté de l'enceinte du palais
const H = 48; // hauteur des remparts
const T = 9; // épaisseur
const GATE_W = 34;
const GATE_H = 32;

export function buildWalls(p: Palace) {
  const root = new THREE.Group();
  G.scene.add(root);
  const stone = mat.marble;
  // ---- remparts du domaine royal (carré de 600 m) avec 4 portails
  const gates: { id: string; label: string; axis: "x" | "z"; at: number; c: number }[] = [
    { id: "gate-south", label: "Portail sud (jardins)", axis: "x", at: -R, c: 0 },
    { id: "gate-north", label: "Portail nord (montagnes)", axis: "x", at: R, c: 0 },
    { id: "gate-east", label: "Portail est (route de la ville)", axis: "z", at: R, c: 14 },
    { id: "gate-west", label: "Portail ouest (océan)", axis: "z", at: -R, c: 0 }
  ];
  for (const at of [-R, R]) {
    const gx = gates.find((g) => g.axis === "x" && g.at === at)!;
    wallX(root, at, -R, R, -20, H + 20, stone, [{ c: gx.c, w: GATE_W, h: GATE_H + 20 }], T);
    const gz = gates.find((g) => g.axis === "z" && g.at === at)!;
    wallZ(root, at, -R, R, -20, H + 20, stone, [{ c: gz.c, w: GATE_W, h: GATE_H + 20 }], T);
  }
  // créneaux dorés + ligne lumineuse sur tout le chemin de ronde
  for (const at of [-R, R]) {
    span(root, -R - T, H, at - T / 2 - 0.3, R + T, H + 1.2, at + T / 2 + 0.3, mat.gold, { solid: false });
    span(root, at - T / 2 - 0.3, H, -R - T, at + T / 2 + 0.3, H + 1.2, R + T, mat.gold, { solid: false });
    glowLine(root, -R, H - 3, at - T / 2 - 0.05, R, H - 2.85, at - T / 2 - 0.02, mat.glowBlue, 0.1);
    glowLine(root, -R, H - 3, at + T / 2 + 0.02, R, H - 2.85, at + T / 2 + 0.05, mat.glowBlue, 0.1);
    glowLine(root, at - T / 2 - 0.05, H - 3, -R, at - T / 2 - 0.02, H - 2.85, R, mat.glowBlue, 0.1);
    glowLine(root, at + T / 2 + 0.02, H - 3, -R, at + T / 2 + 0.05, H - 2.85, R, mat.glowBlue, 0.1);
  }
  // tours d'angle géantes
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) tower(root, sx * R, sz * R, 14, H + 22);
  // portails : deux battants coulissants de 13 m, tours de garde, consoles
  for (const g of gates) {
    const center = g.axis === "x" ? new THREE.Vector3(g.c, 0, g.at) : new THREE.Vector3(g.at, 0, g.c);
    const d = p.addDoor(new Door(g.id, g.label, center.clone().setY(2)));
    for (const side of [-1, 1]) {
      const leaf = new THREE.Group();
      const panel = new THREE.Mesh(new THREE.BoxGeometry(GATE_W / 2, GATE_H, 1.6), mat.black);
      panel.castShadow = true;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(GATE_W / 2 - 0.6, GATE_H - 0.8, 1.7), mat.gold);
      frame.scale.set(1, 1, 1);
      const inner = new THREE.Mesh(new THREE.BoxGeometry(GATE_W / 2 - 1.6, GATE_H - 1.8, 1.8), mat.graphite);
      leaf.add(panel, frame, inner);
      for (let k = 0; k < 5; k++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.3, GATE_H - 3, 1.9), mat.glowBlue);
        bar.position.x = -GATE_W / 4 + 1.5 + k * 2.4;
        leaf.add(bar);
      }
      const emblem = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.35, 10, 48), mat.gold);
      emblem.position.set(-side * (GATE_W / 4 - 0.5), 4, 0);
      leaf.add(emblem);
      leaf.position.set(side * GATE_W / 4, GATE_H / 2, 0);
      if (g.axis === "z") {
        leaf.rotation.y = Math.PI / 2;
        leaf.position.set(0, GATE_H / 2, side * GATE_W / 4);
      }
      leaf.position.add(center);
      root.add(leaf);
      const slide = g.axis === "x" ? new THREE.Vector3(side * (GATE_W / 2 - 0.5), 0, 0) : new THREE.Vector3(0, 0, side * (GATE_W / 2 - 0.5));
      d.addLeaf(leaf, slide);
    }
    d.speed = 0.35;
    d.open(true);
    d.t = 1;
    d.leaves.forEach((l) => l.mesh.position.copy(l.open));
    // tours de garde de part et d'autre
    for (const side of [-1, 1]) {
      const off = g.axis === "x" ? new THREE.Vector3(side * (GATE_W / 2 + 7), 0, 0) : new THREE.Vector3(0, 0, side * (GATE_W / 2 + 7));
      tower(root, center.x + off.x, center.z + off.z, 7, H + 14);
    }
    // consoles (dedans / dehors)
    for (const s of [-1, 1]) {
      const pos = g.axis === "x" ? new THREE.Vector3(center.x + GATE_W / 2 + 3, 1, center.z + s * 8) : new THREE.Vector3(center.x + s * 8, 1, center.z + GATE_W / 2 + 3);
      const con = new THREE.Mesh(new THREE.BoxGeometry(1, 1.4, 1), mat.black);
      con.position.copy(pos).setY(0.7);
      root.add(con);
      G.physics.addMesh(con);
      G.interact.add({
        id: `${g.id}-console-${s}`,
        pos,
        radius: 4,
        label: () => (d.isOpen ? `Fermer : ${g.label}` : `Ouvrir : ${g.label}`),
        action: () => d.toggle()
      });
    }
  }

  // ---- enceinte de la ville (remparts de 45 m) + porte colossale sur la route
  const c = ZONES.city;
  const m = 70;
  const cx1 = c.x1 - m,
    cx2 = c.x2 + m,
    cz1 = c.z1 - m,
    cz2 = c.z2 + m;
  const CH = 70;
  const cityStone = new THREE.MeshStandardMaterial({ color: 0x23262f, metalness: 0.6, roughness: 0.4 });
  const ground = (x: number, z: number) => G.physics.terrain(x, z);
  const gy = Math.min(ground(cx1, 14), 0) - 25;
  wallZ(root, cx1, cz1, cz2, gy, CH - gy, cityStone, [{ c: 14, w: 44, h: 46 - gy }], 8);
  wallZ(root, cx2, cz1, cz2, gy, CH - gy, cityStone, [], 8);
  wallX(root, cz1, cx1, cx2, gy, CH - gy, cityStone, [], 8);
  wallX(root, cz2, cx1, cx2, gy, CH - gy, cityStone, [], 8);
  for (const [x1, z1, x2, z2] of [[cx1 - 4.2, cz1, cx1 - 4.1, cz2], [cx1 + 4.1, cz1, cx1 + 4.2, cz2], [cx2 - 4.2, cz1, cx2 - 4.1, cz2], [cx2 + 4.1, cz1, cx2 + 4.2, cz2]])
    for (const y of [12, 30]) glowLine(root, x1, y, z1, x2, y + 0.4, z2, mat.glowCyan, 0.1);
  for (const [x1, x2, z] of [[cx1, cx2, cz1 - 4.15], [cx1, cx2, cz1 + 4.15], [cx1, cx2, cz2 - 4.15], [cx1, cx2, cz2 + 4.15]])
    for (const y of [12, 30]) glowLine(root, x1, y, z - 0.05, x2, y + 0.4, z + 0.05, mat.glowCyan, 0.1);
  for (const x of [cx1, cx2]) for (const z of [cz1, cz2]) tower(root, x, z, 18, CH + 30);
  // pylônes de la porte + arche + barrière d'énergie
  for (const s of [-1, 1]) tower(root, cx1, 14 + s * 30, 10, CH + 30);
  span(root, cx1 - 7, 76, 14 - 32, cx1 + 7, 83, 14 + 32, mat.gold, { solid: false });
  glowLine(root, cx1 - 7.1, 74.5, 14 - 32, cx1 + 7.1, 75, 14 + 32, mat.glowBlue, 0.1);
  const field = new THREE.MeshBasicMaterial({ map: tex.hexGlow, color: 0x3fc8ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  (field.map as THREE.Texture).repeat.set(6, 5);
  const barrier = new THREE.Mesh(new THREE.BoxGeometry(1.2, 46, 44), field);
  barrier.position.set(cx1, ground(cx1, 14) + 23, 14);
  root.add(barrier);
  const bd = p.addDoor(new Door("gate-city", "Barrière d'énergie de la ville", new THREE.Vector3(cx1, 2, 14)));
  bd.addLeaf(barrier, new THREE.Vector3(0, -48, 0));
  bd.speed = 0.5;
  bd.open(true);
  bd.t = 1;
  barrier.position.copy(bd.leaves[0].open);
  for (const s of [-1, 1]) {
    const pos = new THREE.Vector3(cx1 - s * 10, ground(cx1 - s * 10, 40) + 1, 40);
    const con = new THREE.Mesh(new THREE.BoxGeometry(1, 1.4, 1), mat.black);
    con.position.copy(pos).setY(pos.y - 0.3);
    root.add(con);
    G.interact.add({ id: `gate-city-console-${s}`, pos, radius: 4, label: () => (bd.isOpen ? "Activer la barrière de la ville" : "Couper la barrière de la ville"), action: () => bd.toggle() });
  }
  p.updaters.push((_dt, t) => {
    (field.map as THREE.Texture).offset.y = (t * 0.15) % 1;
    field.opacity = 0.35 + 0.15 * Math.sin(t * 3);
  });
  G.world.markers.push(
    { id: "gate-city", name: "Porte de la ville", pos: new THREE.Vector3(cx1, 0, 14), icon: "⛩", visible: () => true },
    { id: "gate-east", name: "Portail est", pos: new THREE.Vector3(R, 0, 14), icon: "⛩", visible: () => true },
    { id: "gate-south", name: "Portail sud", pos: new THREE.Vector3(0, 0, -R), icon: "⛩", visible: () => true }
  );
}

/** Tour cylindrique massive avec couronne dorée et balise lumineuse. */
function tower(root: THREE.Group, x: number, z: number, r: number, h: number) {
  const base = Math.min(G.physics.terrain(x, z), 0) - 20;
  cyl(root, r, h - base, mat.marble, x, base, z, { seg: 32 });
  cyl(root, r + 1.2, 2, mat.gold, x, h, z, { solid: false, seg: 32 });
  cyl(root, r * 0.75, r * 1.2, mat.gold, x, h + 2, z, { r2: 0.5, solid: false, seg: 24 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.05, 0.25, 8, 48), mat.glowBlue);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(x, h - 6, z);
  root.add(ring);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 12), mat.glowCyan);
  beacon.position.set(x, h + 2 + r * 1.2 + 1, z);
  root.add(beacon);
}
