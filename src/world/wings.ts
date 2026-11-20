// LES AILES DU PALAIS : à l'est le Garage royal (voitures Adamas), à l'ouest la Galerie royale.
// Reliées au Grand Hall par des galeries vitrées. Une route part du garage vers la ville.
import * as THREE from "three";
import { G, bus } from "../core";
import { mat } from "./materials";
import { box, span, cyl, wallX, wallZ, glassWall, glowLine, emblemTexture, plane } from "./build";
import { Door } from "./door";
import { applyPBR, concretePBR } from "./pbr";
import type { Palace } from "./palace";

export const GARAGE = { x1: 60, x2: 184, z1: -34, z2: 62, h: 15 };
export const GALLERY = { x1: -150, x2: -60, z1: -40, z2: 20, h: 14 };

export interface WingInfo {
  carSlots: { pos: THREE.Vector3; yaw: number; spin?: boolean }[];
  garageSpot: THREE.Vector3;
  gallerySpot: THREE.Vector3;
}

export function buildWings(p: Palace): WingInfo {
  const root = new THREE.Group();
  G.scene.add(root);
  corridor(root, 1);
  corridor(root, -1);
  const slots = garage(root, p);
  gallery(root, p);
  road(root);
  // affichage seulement à proximité
  p.updaters.push(() => {
    root.visible = G.camera.position.distanceTo(new THREE.Vector3(60, 0, 0)) < 900;
  });
  return { carSlots: slots, garageSpot: new THREE.Vector3(76, 0, 14), gallerySpot: new THREE.Vector3(-70, 0, -20) };
}

/** Galerie vitrée entre le Grand Hall (arche à z = -20) et une aile. */
function corridor(root: THREE.Group, side: 1 | -1) {
  const x1 = side * 32.3,
    x2 = side * 60.3;
  const [a, b] = side > 0 ? [x1, x2] : [x2, x1];
  span(root, a, -0.5, -23.5, b, 0.02, -16.5, mat.floor);
  span(root, a, 7, -23.6, b, 7.6, -16.4, mat.marble);
  span(root, a, 7.6, -23.7, b, 7.8, -16.3, mat.gold, { solid: false });
  glassWall(root, "x", -23.5, a, b, 0, 7, [], 7);
  glassWall(root, "x", -16.5, a, b, 0, 7, [], 7);
  glowLine(root, a, 6.9, -20.05, b, 6.95, -19.95, mat.glowCyan, 0.05);
  span(root, a, 0.021, -21.5, b, 0.03, -18.5, mat.fabric, { solid: false });
}

// ---------------------------------------------------------------- GARAGE ROYAL
function garage(root: THREE.Group, p: Palace) {
  const { x1, x2, z1, z2, h } = GARAGE;
  const g = new THREE.Group();
  root.add(g);
  // béton ciré poli, plafond technique, murs en panneaux clairs
  const floorMat = applyPBR(new THREE.MeshStandardMaterial({ color: 0x3a3d44, metalness: 0.15 }), concretePBR(), 0.12);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xc9ccd3, roughness: 0.5, metalness: 0.05 });
  span(g, x1, -0.5, z1, x2, 0.02, z2, floorMat);
  span(g, x1, h, z1, x2, h + 0.8, z2, mat.marble);
  // façades : ouest (vers le palais) avec arche, sud vitrée, nord pleine, est avec grande porte
  wallZ(g, x1, z1, z2, 0, h, mat.marble, [{ c: -20, w: 6, h: 7 }]);
  wallX(g, z2, x1, x2, 0, h, wallMat);
  glassWall(g, "x", z1, x1, x2, 0, h, [], 12);
  wallZ(g, x2, z1, z2, 0, h, mat.marble, [{ c: 14, w: 18, h: 7.5 }]);
  // bandeaux dorés extérieurs
  for (const [ax, az, bx, bz] of [[x1 - 0.5, z1 - 0.6, x2 + 0.5, z1 - 0.3], [x1 - 0.5, z2 + 0.3, x2 + 0.5, z2 + 0.6]]) span(g, ax, h - 0.6, az, bx, h, bz, mat.gold, { solid: false });
  // enseigne
  const sign = new THREE.MeshStandardMaterial({ map: emblemTexture("GARAGE"), emissive: 0xffffff, emissiveMap: emblemTexture("GARAGE"), emissiveIntensity: 0.4 });
  plane(g, 3.4, 10, sign, (x1 + x2) / 2, 8, z1 - 0.7, Math.PI);
  // piliers + rampes lumineuses au plafond
  for (let x = x1 + 12; x < x2 - 5; x += 24)
    for (const z of [-8, 34]) {
      cyl(g, 0.7, h, wallMat, x, 0, z, { seg: 20 });
      glowLine(g, x - 0.72, 0.1, z - 0.05, x - 0.7, h - 0.2, z + 0.05, mat.glowBlue, 0.04);
    }
  for (let z = z1 + 6; z < z2; z += 9) glowLine(g, x1 + 4, h - 0.08, z, x2 - 4, h - 0.05, z + 0.5, mat.glowWhite, 0.02);
  // marquage au sol de l'allée centrale
  for (let x = x1 + 6; x < x2 - 4; x += 6) glowLine(g, x, 0.025, 13.9, x + 3, 0.03, 14.1, mat.glowCyan, 0.01);
  // plateformes des voitures (2 rangées de 4)
  const slots: { pos: THREE.Vector3; yaw: number; spin?: boolean }[] = [];
  const xs = [82, 106, 130, 154];
  for (const [i, x] of xs.entries())
    for (const [row, z] of [[0, -6], [1, 34]] as [number, number][]) {
      const spin = i === 1;
      cyl(g, 4.2, 0.22, mat.black, x, 0, z, { seg: 48 });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.05, 8, 96), spin ? mat.glowGold : mat.glowCyan);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, 0.23, z);
      g.add(ring);
      slots.push({ pos: new THREE.Vector3(x, 0.22, z), yaw: row === 0 ? -Math.PI / 2 + 0.35 : -Math.PI / 2 - 0.35, spin });
    }
  // porte du garage (rideau qui monte)
  const door = p.addDoor(new Door("door-cargarage", "Porte du garage royal", new THREE.Vector3(x2, 1, 14)));
  const leaf = box(g, 0.4, 7.5, 18, mat.graphite, x2 - 0.5, 3.75, 14, { solid: false });
  for (let k = -3; k <= 3; k++) glowLine(leaf, -0.25, k, -8.8, -0.21, k + 0.05, 8.8, mat.glowBlue, 0.04);
  door.addLeaf(leaf, new THREE.Vector3(0, 7.3, 0));
  door.speed = 0.6;
  for (const [cx, label] of [[x2 - 3, "intérieur"], [x2 + 3, "extérieur"]] as [number, string][]) {
    box(g, 0.6, 1.2, 0.6, mat.black, cx, 0.6, 25, { solid: true });
    G.interact.add({
      id: "cargarage-console-" + label,
      pos: new THREE.Vector3(cx, 1, 25),
      radius: 3,
      label: () => (door.isOpen ? "Fermer la porte du garage" : "Ouvrir la porte du garage"),
      action: () => door.toggle()
    });
  }
  // éclairage du garage
  p.zones.push({
    contains: (q) => q.x > x1 && q.x < x2 && q.z > z1 && q.z < z2 && q.y < h,
    lights: [
      { pos: new THREE.Vector3(94, 11, -6), color: 0xfff4e6, intensity: 520, distance: 40 },
      { pos: new THREE.Vector3(142, 11, -6), color: 0xfff4e6, intensity: 520, distance: 40 },
      { pos: new THREE.Vector3(94, 11, 34), color: 0xfff4e6, intensity: 520, distance: 40 },
      { pos: new THREE.Vector3(142, 11, 34), color: 0xfff4e6, intensity: 520, distance: 40 },
      { pos: new THREE.Vector3(70, 6, 14), color: 0x8fd0ff, intensity: 160, distance: 30 },
      { pos: new THREE.Vector3(176, 6, 14), color: 0x8fd0ff, intensity: 160, distance: 30 }
    ]
  });
  bus.emit("wing:garage");
  return slots;
}

// ---------------------------------------------------------------- GALERIE ROYALE
function gallery(root: THREE.Group, p: Palace) {
  const { x1, x2, z1, z2, h } = GALLERY;
  const g = new THREE.Group();
  root.add(g);
  span(g, x1, -0.5, z1, x2, 0.02, z2, mat.floor);
  span(g, x1, h, z1, x2, h + 0.8, z2, mat.marble);
  wallZ(g, x2, z1, z2, 0, h, mat.marble, [{ c: -20, w: 6, h: 7 }]);
  wallZ(g, x1, z1, z2, 0, h, mat.marble);
  wallX(g, z2, x1, x2, 0, h, mat.marble);
  glassWall(g, "x", z1, x1, x2, 0, h, [], 10);
  // colonnade intérieure + œuvres holographiques sur socles
  for (let x = x1 + 12; x < x2 - 5; x += 14) {
    for (const z of [-30, 10]) {
      cyl(g, 0.9, h, mat.marble, x, 0, z, { seg: 24 });
      cyl(g, 1.2, 0.5, mat.gold, x, 0, z, { solid: false });
      cyl(g, 1.25, 0.6, mat.gold, x, h - 0.6, z, { solid: false });
    }
    cyl(g, 1.3, 1.1, mat.black, x + 7, 0, -10);
    const art = new THREE.Mesh(x % 28 ? new THREE.TorusKnotGeometry(0.8, 0.22, 120, 14, 2, 5) : new THREE.IcosahedronGeometry(1, 1), x % 28 ? mat.gold : mat.holoWire);
    art.position.set(x + 7, 2.6, -10);
    g.add(art);
    p.spinners.push({ obj: art, speed: new THREE.Vector3(0.1, 0.4, 0), bob: 0.15, baseY: 2.6 });
  }
  const chand = new THREE.Mesh(new THREE.TorusGeometry(10, 0.15, 8, 96), mat.glowWhite);
  chand.rotation.x = Math.PI / 2;
  chand.position.set((x1 + x2) / 2, h - 1.5, -10);
  g.add(chand);
  const em = new THREE.MeshStandardMaterial({ map: emblemTexture("GALERIE"), emissive: 0xffffff, emissiveMap: emblemTexture("GALERIE"), emissiveIntensity: 0.3 });
  plane(g, 4, 12, em, x1 + 0.4, 7, -10, Math.PI / 2);
  p.zones.push({
    contains: (q) => q.x > x1 && q.x < x2 && q.z > z1 && q.z < z2 && q.y < h,
    lights: [
      { pos: new THREE.Vector3(-80, 10, -10), color: 0xffe2b0, intensity: 380, distance: 40 },
      { pos: new THREE.Vector3(-115, 10, -10), color: 0xffe2b0, intensity: 380, distance: 40 },
      { pos: new THREE.Vector3((x1 + x2) / 2, 12, -10), color: 0xbfe6ff, intensity: 300, distance: 45 }
    ]
  });
}

// ---------------------------------------------------------------- ROUTE VERS LA VILLE
function road(root: THREE.Group) {
  const pts: THREE.Vector3[] = [];
  for (let x = 184; x <= 960; x += 8) pts.push(new THREE.Vector3(x, 0, 14));
  const half = 7;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  pts.forEach((pt, i) => {
    const y = G.physics.terrain(pt.x, pt.z) + 0.08;
    pos.push(pt.x, y, pt.z - half, pt.x, y, pt.z + half);
    uv.push(i * 0.5, 0, i * 0.5, 1);
    if (i) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const cv = document.createElement("canvas");
  cv.width = 64;
  cv.height = 256;
  const c = cv.getContext("2d")!;
  c.fillStyle = "#1d1f24";
  c.fillRect(0, 0, 64, 256);
  c.fillStyle = "#d8b25a";
  c.fillRect(0, 124, 32, 8);
  c.fillStyle = "#dfe6ee";
  c.fillRect(0, 8, 64, 5);
  c.fillRect(0, 243, 64, 5);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }));
  m.receiveShadow = true;
  root.add(m);
}
