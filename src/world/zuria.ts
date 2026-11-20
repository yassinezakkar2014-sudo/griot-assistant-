// LE PAYS DE ZURIA — royaume voisin sur une grande île de savane, de l'autre côté de l'océan (ouest).
// Palais plus petit, en terre ocre façon architecture sahélienne (contreforts, poutres de bois
// saillantes, pinacles), une salle du trône, une cour avec bassin et palmiers, une aire pour
// le petit vaisseau « Faucon de Zuria ». Pas de garage.
import * as THREE from "three";
import { G } from "../core";
import { mat } from "./materials";
import { block, span, cyl, wallX, wallZ, glowLine, plane } from "./build";
import { Door } from "./door";
import { ZONES } from "./terrain";
import { applyPBR, concretePBR } from "./pbr";
import { makeThrone } from "./floors";
import type { Palace } from "./palace";

export interface ZuriaInfo {
  pad: THREE.Vector3;
  front: THREE.Vector3;
}

export function buildZuria(p: Palace): ZuriaInfo {
  const c = ZONES.zuria;
  const cx = c.x,
    cz = c.z;
  const y0 = 4.5; // niveau du sol du palais (marche franchissable depuis la savane)
  const root = new THREE.Group();
  G.scene.add(root);
  const adobe = applyPBR(new THREE.MeshStandardMaterial({ color: 0xc58457 }), concretePBR(), 0.9, 2);
  const adobeDark = applyPBR(new THREE.MeshStandardMaterial({ color: 0xa86a42 }), concretePBR(), 0.9, 2);
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.85 });
  const tile = applyPBR(new THREE.MeshStandardMaterial({ color: 0xd9a066 }), concretePBR(), 0.3, 6);
  const rug = new THREE.MeshStandardMaterial({ color: 0x8a1f1a, roughness: 0.95 });
  const lantern = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffa04a, emissiveIntensity: 2.4 });

  // socle + palais (36 × 28 m, 12 m de haut)
  const W = 18,
    D = 14,
    H = 12;
  span(root, cx - W - 6, 3.5, cz - D - 16, cx + W + 6, y0, cz + D + 4, adobeDark);
  span(root, cx - W, y0 - 0.1, cz - D, cx + W, y0, cz + D, tile, { solid: false });
  wallX(root, cz - D, cx - W, cx + W, y0, H, adobe, [{ c: cx, w: 5, h: 6.5 }], 1.2);
  wallX(root, cz + D, cx - W, cx + W, y0, H, adobe, [], 1.2);
  wallZ(root, cx - W, cz - D, cz + D, y0, H, adobe, [], 1.2);
  wallZ(root, cx + W, cz - D, cz + D, y0, H, adobe, [], 1.2);
  span(root, cx - W - 0.6, y0 + H, cz - D - 0.6, cx + W + 0.6, y0 + H + 0.8, cz + D + 0.6, adobeDark);
  // contreforts à pinacles + poutres de bois (toron) sur les façades
  const faces: [number, number, number, number, "x" | "z"][] = [
    [cx - W, cz - D - 0.7, cx + W, cz - D - 0.7, "x"],
    [cx - W, cz + D + 0.7, cx + W, cz + D + 0.7, "x"],
    [cx - W - 0.7, cz - D, cx - W - 0.7, cz + D, "z"],
    [cx + W + 0.7, cz - D, cx + W + 0.7, cz + D, "z"]
  ];
  for (const [x1, z1, x2, z2, ax] of faces) {
    const len = ax === "x" ? x2 - x1 : z2 - z1;
    const n = Math.round(len / 4);
    for (let i = 0; i <= n; i++) {
      const x = ax === "x" ? x1 + (len * i) / n : x1;
      const z = ax === "x" ? z1 : z1 + (len * i) / n;
      if (ax === "x" && Math.abs(x - cx) < 3.5 && z < cz) continue; // dégagement de la porte
      block(root, 1.2, H + 2.2, 1.2, adobe, x, y0, z);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.75, 2.6, 6), adobe);
      cone.position.set(x, y0 + H + 3.5, z);
      root.add(cone);
      const egg = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mat.gold);
      egg.position.set(x, y0 + H + 4.9, z);
      root.add(egg);
      if (i < n)
        for (const hy of [4.5, 8.5, 11.2]) {
          const mx = ax === "x" ? x + len / n / 2 : x;
          const mz = ax === "x" ? z : z + len / n / 2;
          const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.6, 6), wood);
          beam.position.set(mx, y0 + hy, mz);
          if (ax === "x") beam.rotation.x = Math.PI / 2;
          else beam.rotation.z = Math.PI / 2;
          root.add(beam);
        }
    }
  }
  // tours rondes à l'avant
  for (const sx of [-1, 1]) {
    cyl(root, 4, H + 7, adobe, cx + sx * (W + 3), y0, cz - D - 3, { seg: 24 });
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 6, 24), adobeDark);
    roof.position.set(cx + sx * (W + 3), y0 + H + 10, cz - D - 3);
    root.add(roof);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), mat.gold);
    tip.position.set(cx + sx * (W + 3), y0 + H + 13.2, cz - D - 3);
    root.add(tip);
    for (const hy of [6, 11, 16]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(4.05, 0.1, 6, 32), wood);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(cx + sx * (W + 3), y0 + hy, cz - D - 3);
      root.add(ring);
    }
  }
  // porte en bois sculpté (deux battants)
  const door = p.addDoor(new Door("door-zuria", "Porte du palais de Zuria", new THREE.Vector3(cx, y0 + 1, cz - D)));
  for (const side of [-1, 1]) {
    const leaf = new THREE.Group();
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.5, 6.5, 0.3), wood);
    leaf.add(panel);
    for (let k = 0; k < 4; k++) {
      const stud = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.12, 0.35), mat.gold);
      stud.position.y = -2.4 + k * 1.6;
      leaf.add(stud);
    }
    leaf.position.set(cx + side * 1.25, y0 + 3.25, cz - D);
    root.add(leaf);
    door.addLeaf(leaf, new THREE.Vector3(side * 2.3, 0, 0));
  }
  door.speed = 0.8;
  door.autoCloseAfter = 25;
  G.interact.add({
    id: "door-zuria",
    pos: new THREE.Vector3(cx, y0 + 1.2, cz - D),
    radius: 5,
    label: () => (door.isOpen ? "Fermer la porte du palais de Zuria" : "Ouvrir la porte du palais de Zuria"),
    action: () => door.toggle()
  });
  // salle du trône : piliers, tapis, lanternes, trône doré
  for (const sx of [-1, 1])
    for (let z = cz - D + 5; z < cz + D - 3; z += 6) {
      block(root, 1.4, H, 1.4, adobe, cx + sx * 7, y0, z);
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), lantern);
      l.position.set(cx + sx * 6.1, y0 + 4, z);
      root.add(l);
    }
  span(root, cx - 2, y0, cz - D + 1, cx + 2, y0 + 0.03, cz + D - 5, rug, { solid: false });
  span(root, cx - 5, y0, cz + D - 6, cx + 5, y0 + 0.8, cz + D - 1, adobeDark);
  const throne = makeThrone(1.2);
  throne.position.set(cx, y0 + 0.8, cz + D - 3.5);
  root.add(throne);
  G.physics.addBox(new THREE.Vector3(cx - 1.5, y0 + 0.8, cz + D - 4.8), new THREE.Vector3(cx + 1.5, y0 + 6, cz + D - 2));
  G.interact.add({
    id: "zuria-throne",
    pos: new THREE.Vector3(cx, y0 + 0.8, cz + D - 6),
    radius: 3,
    label: () => "S'asseoir sur le trône de Zuria",
    action: () => G.player.sit(new THREE.Vector3(cx, y0 + 0.8 + 0.75, cz + D - 4), 0)
  });
  const banner = new THREE.MeshStandardMaterial({ color: 0x1f6b4a, roughness: 0.9 });
  for (const sx of [-1, 1]) plane(root, 2.4, 7, banner, cx + sx * 4.5, y0 + 6, cz + D - 0.7, Math.PI);
  // cour : bassin, palmiers, lanternes
  span(root, cx - 6, y0, cz - D - 13, cx + 6, y0 + 0.5, cz - D - 12.6, adobeDark);
  span(root, cx - 6, y0, cz - D - 7.4, cx + 6, y0 + 0.5, cz - D - 7, adobeDark);
  span(root, cx - 6.4, y0, cz - D - 13, cx - 6, y0 + 0.5, cz - D - 7, adobeDark);
  span(root, cx + 6, y0, cz - D - 13, cx + 6.4, y0 + 0.5, cz - D - 7, adobeDark);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(12, 5.6), new THREE.MeshStandardMaterial({ color: 0x0e5a7a, roughness: 0.04, metalness: 0.4, emissive: 0x062a3a }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(cx, y0 + 0.35, cz - D - 10);
  root.add(water);
  const palmTrunk = new THREE.CylinderGeometry(0.25, 0.4, 9, 8);
  const palmTop = new THREE.ConeGeometry(3.2, 1.6, 9);
  const palmMat = new THREE.MeshStandardMaterial({ color: 0x3d7a2e, flatShading: true });
  for (const [px, pz] of [[-14, -22], [14, -22], [-24, -6], [24, -6], [-24, 10], [24, 10]]) {
    const t = new THREE.Mesh(palmTrunk, wood);
    t.position.set(cx + px, y0 + 4.5, cz + pz);
    const top = new THREE.Mesh(palmTop, palmMat);
    top.position.set(cx + px, y0 + 9.2, cz + pz);
    root.add(t, top);
  }
  // aire du petit vaisseau, à l'est du palais
  const pad = new THREE.Vector3(cx + 62, 4.2, cz - 6);
  cyl(root, 13, 0.3, adobeDark, pad.x, 3.9, pad.z, { seg: 48 });
  const ring = new THREE.Mesh(new THREE.RingGeometry(11.6, 12, 64), lantern);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(pad.x, 4.22, pad.z);
  root.add(ring);
  glowLine(root, pad.x - 0.3, 4.22, pad.z - 10, pad.x + 0.3, 4.23, pad.z + 10, lantern, 0.01);
  // éclairage intérieur chaleureux
  p.zones.push({
    contains: (q) => Math.abs(q.x - cx) < W && Math.abs(q.z - cz) < D && q.y < y0 + H,
    lights: [
      { pos: new THREE.Vector3(cx, y0 + 9, cz - 6), color: 0xffb070, intensity: 260, distance: 30 },
      { pos: new THREE.Vector3(cx, y0 + 8, cz + 8), color: 0xffd28a, intensity: 220, distance: 26 },
      { pos: new THREE.Vector3(cx - 12, y0 + 6, cz), color: 0xff9a4a, intensity: 120, distance: 20 },
      { pos: new THREE.Vector3(cx + 12, y0 + 6, cz), color: 0xff9a4a, intensity: 120, distance: 20 }
    ]
  });
  buildTown(root, cx, cz);
  // affichage seulement à proximité
  p.updaters.push(() => {
    root.visible = G.camera.position.distanceTo(new THREE.Vector3(cx, 0, cz)) < 2600;
  });
  G.world.markers.push({ id: "zuria", name: "Pays de Zuria", pos: new THREE.Vector3(cx, 0, cz), icon: "✺", visible: () => true });
  return { pad, front: new THREE.Vector3(cx, y0, cz - D - 18) };
}

// ---------------------------------------------------------------- LA VILLE DE ZURIA
/** Ville en terre autour du palais : maisons à toit plat, tours, place du marché, puits, lanternes. */
function buildTown(root: THREE.Group, cx: number, cz: number) {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const ground = (x: number, z: number) => G.physics.terrain(x, z);
  const colors = [0xc58457, 0xb8784c, 0xd29a68, 0xa96e45];
  const houses: { x: number; z: number; w: number; d: number; h: number; y: number; c: number; tower: boolean }[] = [];
  const market = new THREE.Vector3(cx, 0, cz - 115);
  const blocked = (x: number, z: number, r: number) =>
    (Math.abs(x - cx) < 46 + r && z > cz - 52 - r && z < cz + 32 + r) || // palais + cour
    Math.hypot(x - (cx + 62), z - (cz - 6)) < 22 + r || // aire du vaisseau
    Math.hypot(x - market.x, z - market.z) < 24 + r || // place du marché
    (Math.abs(x - cx) < 5 + r && z < cz - 50 && z > market.z - 10); // rue principale
  for (let tries = 0; tries < 2600 && houses.length < 170; tries++) {
    const a = rnd() * Math.PI * 2,
      r = 70 + Math.pow(rnd(), 0.8) * 330;
    const x = cx + Math.cos(a) * r,
      z = cz + Math.sin(a) * r;
    const w = 6 + rnd() * 8,
      d = 6 + rnd() * 8;
    const rad = Math.hypot(w, d) / 2;
    if (blocked(x, z, rad)) continue;
    if (houses.some((h) => Math.abs(h.x - x) < (h.w + w) / 2 + 3 && Math.abs(h.z - z) < (h.d + d) / 2 + 3)) continue;
    const y = ground(x, z);
    if (y < 0) continue;
    const tower = rnd() < 0.08;
    houses.push({ x, z, w: tower ? 6 : w, d: tower ? 6 : d, h: tower ? 16 + rnd() * 8 : 4 + rnd() * 5, y, c: Math.floor(rnd() * colors.length), tower });
  }
  // maisons instanciées par couleur (une seule géométrie, peu d'appels de rendu)
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  colors.forEach((col, ci) => {
    const list = houses.filter((h) => h.c === ci);
    const matC = applyPBR(new THREE.MeshStandardMaterial({ color: col }), concretePBR(), 0.8, 2);
    const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), matC, list.length);
    const roofs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), matC, list.length);
    list.forEach((h, i) => {
      m4.compose(new THREE.Vector3(h.x, h.y + h.h / 2 - 1.5, h.z), q, new THREE.Vector3(h.w, h.h + 3, h.d));
      walls.setMatrixAt(i, m4);
      m4.compose(new THREE.Vector3(h.x, h.y + h.h + 0.25, h.z), q, new THREE.Vector3(h.w + 0.5, 0.5, h.d + 0.5));
      roofs.setMatrixAt(i, m4);
    });
    walls.castShadow = walls.receiveShadow = true;
    root.add(walls, roofs);
  });
  // portes, fenêtres, poutres et pinacles des tours
  const doorM = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 2.4, 0.2), new THREE.MeshStandardMaterial({ color: 0x3a2414, roughness: 0.8 }), houses.length);
  const winM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.9, 0.2), new THREE.MeshStandardMaterial({ color: 0x1a0f08, emissive: 0xffa04a, emissiveIntensity: 0.6 }), houses.length * 2);
  const beamM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 5).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5a3a22 }), houses.length * 3);
  let wi = 0,
    bi = 0;
  houses.forEach((h, i) => {
    // façade tournée vers le palais
    const toward = Math.abs(h.x - cx) > Math.abs(h.z - cz) ? (h.x > cx ? -1 : 1) : 0;
    const zSide = toward === 0 ? (h.z > cz ? -1 : 1) : 0;
    const fx = h.x + (toward * h.w) / 2 + toward * 0.05,
      fz = h.z + (zSide * h.d) / 2 + zSide * 0.05;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), toward ? Math.PI / 2 : 0);
    m4.compose(new THREE.Vector3(fx, h.y + 1.2, fz), q, new THREE.Vector3(1, 1, 1));
    doorM.setMatrixAt(i, m4);
    for (const off of [-1, 1]) {
      const px = toward ? fx : fx + off * (h.w / 4),
        pz = toward ? fz + off * (h.d / 4) : fz;
      m4.compose(new THREE.Vector3(px, h.y + Math.min(h.h - 1.2, 3.4), pz), q, new THREE.Vector3(1, 1, 1));
      winM.setMatrixAt(wi++, m4);
    }
    for (let k = 0; k < 3; k++) {
      const px = toward ? fx : fx + (k - 1) * (h.w / 3.2),
        pz = toward ? fz + (k - 1) * (h.d / 3.2) : fz;
      m4.compose(new THREE.Vector3(px, h.y + h.h - 0.8, pz), q, new THREE.Vector3(1, 1, 1));
      beamM.setMatrixAt(bi++, m4);
    }
    q.identity();
    G.physics.addBox({ x: h.x - h.w / 2, y: h.y - 3, z: h.z - h.d / 2 }, { x: h.x + h.w / 2, y: h.y + h.h + 0.5, z: h.z + h.d / 2 });
    if (h.tower) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(2.4, 4, 8), new THREE.MeshStandardMaterial({ color: colors[h.c] }));
      cone.position.set(h.x, h.y + h.h + 2.5, h.z);
      const egg = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), mat.gold);
      egg.position.set(h.x, h.y + h.h + 4.8, h.z);
      root.add(cone, egg);
    }
  });
  winM.count = wi;
  beamM.count = bi;
  root.add(doorM, winM, beamM);
  // rue principale (terre battue) du palais au marché
  const street = new THREE.Mesh(new THREE.PlaneGeometry(9, Math.abs(cz - 50 - market.z) + 10), new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 1 }));
  street.rotation.x = -Math.PI / 2;
  street.position.set(cx, ground(cx, (cz - 50 + market.z) / 2) + 0.08, (cz - 50 + market.z) / 2);
  root.add(street);
  // place du marché : étals à auvents colorés, puits, lanternes
  const my = ground(market.x, market.z);
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(24, 24, 0.3, 40), new THREE.MeshStandardMaterial({ color: 0xb48a5e, roughness: 0.95 }));
  plaza.position.set(market.x, my + 0.05, market.z);
  plaza.receiveShadow = true;
  root.add(plaza);
  const awnings = [0xc0392b, 0x1f6b4a, 0xd8a12a, 0x2a4f8a, 0x8a2a6a];
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const sx = market.x + Math.cos(a) * 16,
      sz = market.z + Math.sin(a) * 16;
    const stall = new THREE.Group();
    const table = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 1.6), new THREE.MeshStandardMaterial({ color: 0x5a3a22 }));
    table.position.y = 0.5;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.1, 2.4), new THREE.MeshStandardMaterial({ color: awnings[k % awnings.length], side: THREE.DoubleSide }));
    roof.position.y = 2.6;
    roof.rotation.x = 0.2;
    for (const px of [-1.6, 1.6]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), new THREE.MeshStandardMaterial({ color: 0x5a3a22 }));
      pole.position.set(px, 1.3, 1);
      stall.add(pole);
    }
    for (let f = 0; f < 4; f++) {
      const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshStandardMaterial({ color: [0xe67e22, 0xc0392b, 0xf1c40f, 0x27ae60][f] }));
      fruit.position.set(-1 + f * 0.65, 1.15, 0);
      stall.add(fruit);
    }
    stall.add(table, roof);
    stall.position.set(sx, my, sz);
    stall.lookAt(market.x, my, market.z);
    root.add(stall);
    G.physics.addBox({ x: sx - 1.5, y: my, z: sz - 1.5 }, { x: sx + 1.5, y: my + 1, z: sz + 1.5 });
  }
  const well = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 1, 20), new THREE.MeshStandardMaterial({ color: 0x9a6a42 }));
  well.position.set(market.x, my + 0.5, market.z);
  root.add(well);
  G.physics.addBox({ x: market.x - 1.6, y: my, z: market.z - 1.6 }, { x: market.x + 1.6, y: my + 1, z: market.z + 1.6 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffa04a, emissiveIntensity: 2.2 });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.2;
    const lx = market.x + Math.cos(a) * 22,
      lz = market.z + Math.sin(a) * 22;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 3.5, 6), new THREE.MeshStandardMaterial({ color: 0x2a1a10 }));
    pole.position.set(lx, my + 1.75, lz);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), lampMat);
    lamp.position.set(lx, my + 3.7, lz);
    root.add(pole, lamp);
  }
  G.world.markers.push({ id: "zuria-market", name: "Marché de Zuria", pos: market.clone(), icon: "⌂", visible: () => true });
}
