// LE ROYAUME EN GÉANT : la Couronne colossale au-dessus du palais royal, les Hyper-tours de la
// ville futuriste (600 à 900 m) et la Nouvelle Métropole à l'est de l'autoroute.
import * as THREE from "three";
import { G } from "../core";
import { mat, tex } from "./materials";
import { ZONES } from "./terrain";

/** Hyper-tours de la ville futuriste (la ville laisse ces emplacements libres). */
export const HYPER = [0, 1, 2, 3, 4, 5].map((k) => {
  const a = (k / 6) * Math.PI * 2 + 0.4;
  return { x: 1625 + Math.cos(a) * 330, z: Math.sin(a) * 330, h: 620 + ((k * 97) % 5) * 70 };
});

/** La Couronne : 4 pylônes de 260 m autour du palais, anneau d'or, arches et joyau flottant. */
export function buildPalaceCrown() {
  const g = new THREE.Group();
  G.scene.add(g);
  const white = new THREE.MeshStandardMaterial({ color: 0xe8eaf0, metalness: 0.4, roughness: 0.3 });
  const H = 260;
  const P = 46;
  const tops: THREE.Vector3[] = [];
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = sx * P,
        z = sz * P;
      const pylon = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 6, H, 8), white);
      pylon.position.set(x, H / 2, z);
      pylon.castShadow = true;
      g.add(pylon);
      for (let y = 30; y < H; y += 30) {
        const band = new THREE.Mesh(new THREE.TorusGeometry(6 - (y / H) * 2.6, 0.5, 6, 16), mat.gold);
        band.rotation.x = Math.PI / 2;
        band.position.set(x, y, z);
        g.add(band);
      }
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 12), mat.glowGold);
      lamp.position.set(x, H + 3, z);
      g.add(lamp);
      G.physics.addBox({ x: x - 4.5, y: 0, z: z - 4.5 }, { x: x + 4.5, y: H, z: z + 4.5 }, "crown");
      tops.push(new THREE.Vector3(x, H, z));
    }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(P * Math.SQRT2, 2.6, 12, 96), mat.gold);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = H - 8;
  g.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(P * Math.SQRT2 + 6, 0.8, 8, 96), mat.glowBlue);
  ring2.rotation.x = Math.PI / 2;
  ring2.position.y = H - 14;
  g.add(ring2);
  // fleurons de la couronne
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const f = new THREE.Mesh(new THREE.ConeGeometry(3, 18, 4), mat.gold);
    f.position.set(Math.cos(a) * P * Math.SQRT2, H + 2, Math.sin(a) * P * Math.SQRT2);
    g.add(f);
  }
  // arches vers le sommet
  const apex = new THREE.Vector3(0, H + 90, 0);
  for (const t of tops) {
    const curve = new THREE.QuadraticBezierCurve3(t, new THREE.Vector3(t.x * 0.5, H + 95, t.z * 0.5), apex);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 1.6, 8), mat.gold));
  }
  // joyau flottant + faisceau de lumière
  const jewel = new THREE.Mesh(new THREE.OctahedronGeometry(16), new THREE.MeshStandardMaterial({ color: 0x0a1a3a, emissive: 0x3fa8ff, emissiveIntensity: 2.2, metalness: 0.9, roughness: 0.1 }));
  jewel.scale.set(1, 1.6, 1);
  jewel.position.set(0, H + 130, 0);
  g.add(jewel);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 6, H + 60, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x6fd0ff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  );
  beam.position.y = 66 + (H + 60) / 2;
  g.add(beam);
  G.palace.updaters.push((dt, t) => {
    jewel.rotation.y += dt * 0.5;
    jewel.position.y = H + 130 + Math.sin(t * 0.8) * 4;
    ring2.rotation.z += dt * 0.1;
  });
  G.world.markers.push({ id: "crown", name: "Couronne du palais", pos: new THREE.Vector3(0, 0, 0), icon: "♛", visible: () => false });
}

/** Hyper-tours (6 géantes de 620 à 900 m) dans la ville futuriste. */
export function buildHyperTowers() {
  const g = new THREE.Group();
  G.scene.add(g);
  const wt = tex.window.clone();
  wt.needsUpdate = true;
  wt.repeat.set(6, 60);
  const glass = new THREE.MeshStandardMaterial({ color: 0x8aa0c8, map: wt, emissiveMap: wt, emissive: 0xffffff, emissiveIntensity: 0.45, metalness: 0.8, roughness: 0.2 });
  for (const h of HYPER) {
    const segs = 5;
    let y = 1.2;
    for (let s = 0; s < segs; s++) {
      const hh = h.h / segs;
      const r0 = 30 - s * 4.5,
        r1 = 30 - (s + 1) * 4.5 + 1;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, hh, 6), glass);
      seg.position.set(h.x, y + hh / 2, h.z);
      seg.rotation.y = s * 0.18;
      seg.castShadow = true;
      g.add(seg);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r1 + 1.5, 0.8, 6, 6), mat.glowCyan);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(h.x, y + hh, h.z);
      g.add(ring);
      y += hh;
    }
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 4, 90, 8), mat.gold);
    spire.position.set(h.x, y + 45, h.z);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 8), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff3030, emissiveIntensity: 3 }));
    tip.position.set(h.x, y + 92, h.z);
    g.add(spire, tip);
    G.physics.addBox({ x: h.x - 24, y: 0, z: h.z - 24 }, { x: h.x + 24, y: h.h, z: h.z + 24 }, "hyper");
  }
  // passerelles lumineuses entre les hyper-tours
  for (let k = 0; k < HYPER.length; k++) {
    const a = HYPER[k],
      b = HYPER[(k + 1) % HYPER.length];
    for (const y of [220, 420]) {
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const br = new THREE.Mesh(new THREE.BoxGeometry(len - 30, 3, 6), mat.glowBlue);
      br.position.set((a.x + b.x) / 2, y, (a.z + b.z) / 2);
      br.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
      g.add(br);
    }
  }
  G.world.markers.push({ id: "hyper", name: "Hyper-tours", pos: new THREE.Vector3(1625, 0, 0), icon: "▲", visible: () => false });
}

/** Nouvelle Métropole : 900 m × 2,8 km de gratte-ciel jusqu'à 800 m, à l'est de l'autoroute. */
export function buildMetropolis() {
  const m = ZONES.metro;
  const g = new THREE.Group();
  G.scene.add(g);
  // sol à avenues lumineuses
  const cv = document.createElement("canvas");
  cv.width = cv.height = 256;
  const c = cv.getContext("2d")!;
  c.fillStyle = "#121420";
  c.fillRect(0, 0, 256, 256);
  c.fillStyle = "#262a36";
  c.fillRect(0, 0, 256, 44);
  c.fillRect(0, 0, 44, 256);
  c.fillStyle = "#b46bff";
  c.fillRect(0, 21, 256, 2);
  c.fillRect(21, 0, 2, 256);
  const gt = new THREE.CanvasTexture(cv);
  gt.wrapS = gt.wrapT = THREE.RepeatWrapping;
  gt.repeat.set((m.x2 - m.x1) / 100, (m.z2 - m.z1) / 100);
  gt.colorSpace = THREE.SRGBColorSpace;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(m.x2 - m.x1, m.z2 - m.z1), new THREE.MeshStandardMaterial({ map: gt, emissiveMap: gt, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.6 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((m.x1 + m.x2) / 2, 1.3, (m.z1 + m.z2) / 2);
  ground.receiveShadow = true;
  g.add(ground);
  let seed = 4242;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const lots: { x: number; z: number; w: number; d: number; h: number }[] = [];
  for (let x = m.x1 + 50; x < m.x2 - 40; x += 100)
    for (let z = m.z1 + 50; z < m.z2 - 40; z += 100) {
      if (rnd() < 0.08) continue;
      const r = rnd();
      const h = r > 0.9 ? 560 + rnd() * 260 : r > 0.55 ? 220 + rnd() * 300 : 80 + rnd() * 140;
      lots.push({ x, z, w: 40 + rnd() * 26, d: 40 + rnd() * 26, h });
    }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const colors = [0x8a9ab8, 0x6a7898, 0xa8b0c8];
  colors.forEach((col, ci) => {
    const list = lots.filter((_, i) => i % 3 === ci);
    const wt = tex.window.clone();
    wt.needsUpdate = true;
    wt.repeat.set(5, 40);
    const mm = new THREE.MeshStandardMaterial({ color: col, map: wt, emissiveMap: wt, emissive: ci === 1 ? 0xd8b0ff : 0xffffff, emissiveIntensity: 0.45, metalness: 0.75, roughness: 0.22 });
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mm, list.length);
    list.forEach((l, i) => {
      m4.compose(new THREE.Vector3(l.x, 1.3 + l.h / 2, l.z), q, new THREE.Vector3(l.w, l.h, l.d));
      inst.setMatrixAt(i, m4);
      G.physics.addBox({ x: l.x - l.w / 2, y: 0, z: l.z - l.d / 2 }, { x: l.x + l.w / 2, y: 1.3 + l.h, z: l.z + l.d / 2 }, "building");
    });
    inst.castShadow = inst.receiveShadow = true;
    g.add(inst);
  });
  // couronnes lumineuses des plus hautes tours
  const talls = lots.filter((l) => l.h > 400);
  const crowns = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0xb46bff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }), talls.length);
  talls.forEach((l, i) => {
    m4.compose(new THREE.Vector3(l.x, 1.3 + l.h + 10, l.z), q, new THREE.Vector3(l.w * 1.05, 20, l.d * 1.05));
    crowns.setMatrixAt(i, m4);
  });
  g.add(crowns);
  // métro aérien : un anneau lumineux qui fait le tour de la métropole
  const pts = [
    new THREE.Vector3(m.x1 + 20, 90, m.z1 + 20),
    new THREE.Vector3(m.x2 - 20, 90, m.z1 + 20),
    new THREE.Vector3(m.x2 - 20, 90, m.z2 - 20),
    new THREE.Vector3(m.x1 + 20, 90, m.z2 - 20)
  ];
  const loop = new THREE.CatmullRomCurve3(pts, true, "catmullrom", 0.05);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(loop, 200, 2, 8, true), mat.glowCyan));
  const trains: THREE.Mesh[] = [];
  for (let k = 0; k < 4; k++) {
    const tr = new THREE.Mesh(new THREE.CapsuleGeometry(3, 40, 4, 8), new THREE.MeshStandardMaterial({ color: 0xf0f2f8, emissive: 0x3fc8ff, emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.3 }));
    g.add(tr);
    trains.push(tr);
  }
  const tmp = new THREE.Vector3();
  G.palace.updaters.push((_dt, t) => {
    g.visible = G.camera.position.distanceTo(new THREE.Vector3((m.x1 + m.x2) / 2, 0, 0)) < 7000;
    if (!g.visible) return;
    trains.forEach((tr, k) => {
      const u = (t * 0.012 + k / 4) % 1;
      loop.getPointAt(u, tr.position);
      tr.position.y += 5;
      loop.getTangentAt(u, tmp);
      tr.lookAt(tr.position.clone().add(tmp));
      tr.rotateX(Math.PI / 2);
    });
  });
  G.world.markers.push({ id: "metro", name: "Nouvelle Métropole", pos: new THREE.Vector3((m.x1 + m.x2) / 2, 0, 0), icon: "▦", visible: () => true });
}
