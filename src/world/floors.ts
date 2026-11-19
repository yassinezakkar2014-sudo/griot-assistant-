// Aménagement intérieur des 7 étages du palais.
import * as THREE from "three";
import { G, bus } from "../core";
import { mat, HoloScreen, holoFrame } from "./materials";
import { box, block, span, cyl, wallX, wallZ, glowLine, plane, emblemTexture } from "./build";
import { Door } from "./door";
import type { Palace } from "./palace";
import { BASE, FLOORS } from "./palace";

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function buildFloors(p: Palace) {
  hall(p);
  throneRoom(p);
  quarters(p);
  command(p);
  lab(p);
  armory(p);
  hangar(p);
  // le premier passage à un étage compte pour la mission d'exploration
}

// ------------------------------------------------------------------ éléments réutilisables
export function makeThrone(scale = 1) {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rz = 0) => {
    const me = new THREE.Mesh(geo, m);
    me.position.set(x, y, z);
    me.rotation.z = rz;
    me.castShadow = me.receiveShadow = true;
    g.add(me);
    return me;
  };
  add(new THREE.BoxGeometry(2.4, 0.5, 2), mat.black, 0, 0.25, 0);
  add(new THREE.BoxGeometry(2.2, 0.25, 1.8), mat.fabric, 0, 0.62, 0.05);
  add(new THREE.BoxGeometry(2.4, 3.6, 0.35), mat.black, 0, 2.3, 0.85);
  add(new THREE.BoxGeometry(2, 3.1, 0.1), mat.fabric, 0, 2.3, 0.66);
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.35, 0.9, 1.9), mat.gold, s * 1.25, 0.95, 0);
    add(new THREE.BoxGeometry(0.05, 3.4, 0.05), mat.glowBlue, s * 1.05, 2.3, 0.62);
  }
  // éventail de lames dorées au sommet
  for (let k = -4; k <= 4; k++) {
    const blade = add(new THREE.BoxGeometry(0.22, 2.2, 0.12), k % 2 ? mat.gold : mat.silver, Math.sin(k * 0.22) * 1.3, 4.4 + Math.cos(k * 0.22) * 0.6, 0.9, -k * 0.22);
    blade.position.y -= Math.abs(k) * 0.08;
  }
  const gem = add(new THREE.OctahedronGeometry(0.28), mat.glowCyan, 0, 4.1, 0.6);
  gem.scale.y = 1.6;
  g.scale.setScalar(scale);
  return g;
}

function makeStatue() {
  const g = new THREE.Group();
  const m = (geo: THREE.BufferGeometry, ma: THREE.Material, y: number, x = 0, z = 0) => {
    const me = new THREE.Mesh(geo, ma);
    me.position.set(x, y, z);
    me.castShadow = true;
    g.add(me);
    return me;
  };
  m(new THREE.BoxGeometry(2.2, 1.2, 2.2), mat.marble, 0.6);
  m(new THREE.BoxGeometry(2.4, 0.15, 2.4), mat.gold, 1.25);
  m(new THREE.CylinderGeometry(0.55, 0.9, 2.6, 16), mat.silver, 2.6);
  m(new THREE.CylinderGeometry(0.62, 0.5, 1.2, 16), mat.silver, 4.4);
  m(new THREE.SphereGeometry(0.36, 20, 16), mat.gold, 5.35);
  const crown = m(new THREE.CylinderGeometry(0.32, 0.38, 0.3, 8, 1, true), mat.gold, 5.75);
  crown.scale.set(1, 1, 1);
  const spear = m(new THREE.CylinderGeometry(0.05, 0.05, 5.2, 8), mat.gold, 3.9, 0.9, 0.2);
  spear.rotation.z = 0.05;
  m(new THREE.ConeGeometry(0.14, 0.6, 8), mat.glowCyan, 6.7, 0.95, 0.2);
  m(new THREE.BoxGeometry(0.05, 0.05, 0.05), mat.glowCyan, 5.4, 0.15, -0.3).scale.set(4, 1, 1);
  return g;
}

function holoEmblem(r = 3) {
  const g = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r - k * 0.7, 0.04, 8, 96), mat.holo);
    ring.rotation.x = Math.PI / 2 + k * 0.5;
    ring.rotation.y = k * 0.7;
    g.add(ring);
  }
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.3, 1), mat.holoWire);
  g.add(core);
  return g;
}

function screenAt(p: Palace, floor: number, w: number, h: number, pos: THREE.Vector3, ry: number, fps: number, draw: (c: CanvasRenderingContext2D, w: number, h: number, t: number) => void) {
  const s = new HoloScreen(1024, Math.round((1024 * h) / w), draw);
  const m = plane(p.interiors[floor], w, h, s.material, pos.x, pos.y, pos.z, ry);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, h + 0.3, 0.08), mat.black);
  frame.position.copy(m.position);
  frame.rotation.copy(m.rotation);
  frame.translateZ(-0.06);
  p.interiors[floor].add(frame);
  p.screens.push({ screen: s, floor, fps, last: -1 });
  return s;
}

function sofa(parent: THREE.Object3D, x: number, y: number, z: number, ry: number, len = 3) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  const a = new THREE.Mesh(new THREE.BoxGeometry(len, 0.45, 1), mat.fabric);
  a.position.y = 0.3;
  const b = new THREE.Mesh(new THREE.BoxGeometry(len, 0.8, 0.25), mat.fabric);
  b.position.set(0, 0.75, 0.45);
  const l = new THREE.Mesh(new THREE.BoxGeometry(len + 0.1, 0.06, 1.05), mat.glowBlue);
  l.position.y = 0.05;
  g.add(a, b, l);
  parent.add(g);
  g.updateMatrixWorld(true);
  G.physics.addMesh(a);
  return g;
}

function stdLights(p: Palace, f: number, list: [number, number, number, number, number][]) {
  p.floorLights[f] = list.map(([x, dy, z, color, intensity]) => ({ pos: V(x, BASE[f] + dy, z), color, intensity, distance: 34 }));
}

// ------------------------------------------------------------------ 1. GRAND HALL
function hall(p: Palace) {
  const g = p.interiors[0];
  const y = BASE[0];
  // colonnes géantes
  for (const x of [-14, 14])
    for (const z of [-22, -12, -2, 8]) {
      cyl(g, 1.1, 13.5, mat.marble, x, y, z, { seg: 28 });
      cyl(g, 1.45, 0.6, mat.gold, x, y, z, { solid: false });
      cyl(g, 1.55, 0.7, mat.gold, x, y + 12.8, z, { solid: false });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.13, 0.05, 6, 32), mat.glowBlue);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, y + 3, z);
      g.add(ring);
    }
  // tapis royal
  span(g, -3, y, -31.5, 3, y + 0.02, 0, mat.fabric, { solid: false });
  glowLine(g, -3.1, y + 0.025, -31.5, -3.04, y + 0.025, 0, mat.glowGold, 0.03);
  glowLine(g, 3.04, y + 0.025, -31.5, 3.1, y + 0.025, 0, mat.glowGold, 0.03);
  // escalier monumental (16 marches) vers l'estrade
  for (let k = 0; k < 16; k++) {
    const top = 0.2 * (k + 1);
    const z0 = k * 0.875;
    span(g, -6, y, z0, 6, y + top, z0 + 0.875, mat.marble);
    glowLine(g, -6, y + top - 0.04, z0 - 0.01, 6, y + top - 0.04, z0 - 0.01, mat.glowBlue, 0.03);
  }
  for (const s of [-1, 1]) {
    // rampes dorées
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 15.6), mat.gold);
    rail.position.set(s * 6.1, y + 2.6, 7);
    rail.rotation.x = -Math.atan2(3.2, 14);
    g.add(rail);
  }
  span(g, -10, y, 14, 10, y + 3.2, 21, mat.marble);
  glowLine(g, -10, y + 3.17, 13.98, 10, y + 3.17, 13.98, mat.glowGold, 0.04);
  const throne = makeThrone(1.1);
  throne.position.set(0, y + 3.2, 18.6);
  g.add(throne);
  G.physics.addBox(V(-1.4, y + 3.2, 17.4), V(1.4, y + 7, 19.8));
  G.interact.add({
    id: "hall-throne",
    pos: V(0, y + 3.2, 17),
    radius: 3,
    label: () => "S'asseoir sur le trône du Hall",
    action: () => G.player.sit(V(0, y + 3.2 + 0.7, 17.9), 0)
  });
  // statues
  for (const [x, z] of [[-22, -20], [22, -20], [-22, 6], [22, 6]]) {
    const s = makeStatue();
    s.position.set(x, y, z);
    s.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
    g.add(s);
    G.physics.addBox(V(x - 1.1, y, z - 1.1), V(x + 1.1, y + 6, z + 1.1));
  }
  // emblème holographique & lustre
  const em = holoEmblem(3.2);
  em.position.set(0, y + 9, 4);
  g.add(em);
  p.spinners.push({ obj: em, speed: V(0, 0.4, 0), bob: 0.3, baseY: y + 9 });
  const chand = new THREE.Mesh(new THREE.TorusGeometry(8, 0.12, 8, 96), mat.glowWhite);
  chand.rotation.x = Math.PI / 2;
  chand.position.set(0, y + 13, -10);
  g.add(chand);
  const chand2 = new THREE.Mesh(new THREE.TorusGeometry(5, 0.08, 8, 96), mat.glowCyan);
  chand2.rotation.x = Math.PI / 2;
  chand2.position.set(0, y + 12.4, -10);
  g.add(chand2);
  // bannières
  const em2 = new THREE.MeshStandardMaterial({ map: emblemTexture(), roughness: 0.7, emissive: 0xffffff, emissiveMap: emblemTexture(), emissiveIntensity: 0.25 });
  for (const x of [-31.6, 31.6]) for (const z of [-26, 14]) plane(g, 3, 9, em2, x, y + 7, z, x < 0 ? Math.PI / 2 : -Math.PI / 2);
  // écrans holographiques
  screenAt(p, 0, 11, 6.2, V(-31.3, y + 6.5, -6), Math.PI / 2, 1, (c, w, h, t) => {
    holoFrame(c, w, h, "BIENVENUE AU PALAIS");
    c.fillStyle = "#e6f7ff";
    c.font = "bold 64px Orbitron, Arial";
    c.fillText("GRIOT", 40, 170);
    c.font = "32px Orbitron, Arial";
    c.fillStyle = "#4fd2ff";
    c.fillText("THINK. SPEAK. RULE.", 40, 220);
    c.font = "26px Arial";
    c.fillStyle = "#bff0ff";
    const lines = ["Dites « GRIOT » ou appuyez sur T pour parler.", "Ascenseur : au fond du hall.", "Armurerie : niveau 6 · Hangar : niveau 7.", `Heure du royaume : ${fmtHour(G.env?.hour ?? 0)}`];
    lines.forEach((l, i) => c.fillText(l, 40, 300 + i * 44));
    c.fillStyle = `rgba(79,210,255,${0.4 + 0.3 * Math.sin(t * 2)})`;
    c.fillRect(40, h - 60, (w - 80) * ((t * 0.1) % 1), 6);
  });
  screenAt(p, 0, 11, 6.2, V(31.3, y + 6.5, -6), -Math.PI / 2, 1, (c, w, h) => {
    holoFrame(c, w, h, "ÉTAT DU ROYAUME");
    const m = G.missions;
    const rows: [string, string][] = [
      ["Souverain", m ? m.rankName() : "—"],
      ["Niveau", m ? String(m.level()) : "1"],
      ["Éclats royaux", m ? String(m.state.credits) : "0"],
      ["Missions accomplies", m ? `${m.completedCount()} / ${m.defs.length}` : "0"],
      ["Armures débloquées", m ? String(m.state.armors.length) : "1"],
      ["Royal Talon", G.ship ? (G.ship.engines ? "MOTEURS EN MARCHE" : G.ship.ready ? "PRÊT AU DÉCOLLAGE" : "EN HANGAR") : "—"]
    ];
    c.font = "30px Arial";
    rows.forEach(([k, v], i) => {
      c.fillStyle = "#7fbfe0";
      c.fillText(k, 40, 130 + i * 62);
      c.fillStyle = "#ffffff";
      c.fillText(v, 520, 130 + i * 62);
    });
  });
  stdLights(p, 0, [
    [0, 11, -20, 0xbfe6ff, 260],
    [0, 11, -2, 0xbfe6ff, 220],
    [0, 9, 17, 0xffd28a, 180],
    [-22, 8, -6, 0x5fb8ff, 140],
    [22, 8, -6, 0x5fb8ff, 140],
    [0, 4, 26, 0x9fe6ff, 60]
  ]);
}

// ------------------------------------------------------------------ 2. SALLE DU TRÔNE
function throneRoom(p: Palace) {
  const f = 1;
  const g = p.interiors[f];
  const y = BASE[f];
  span(g, -2.5, y, -31.5, 2.5, y + 0.02, 4, mat.fabric, { solid: false });
  glowLine(g, -2.6, y + 0.025, -31.5, -2.55, y + 0.025, 4, mat.glowBlue, 0.03);
  glowLine(g, 2.55, y + 0.025, -31.5, 2.6, y + 0.025, 4, mat.glowBlue, 0.03);
  span(g, -8, y, 4, 8, y + 0.4, 17, mat.marble);
  span(g, -7, y, 5, 7, y + 0.8, 16.5, mat.marble);
  span(g, -6, y, 6, 6, y + 1.2, 16, mat.marble);
  glowLine(g, -8, y + 0.37, 3.98, 8, y + 0.37, 3.98, mat.glowGold, 0.03);
  glowLine(g, -7, y + 0.77, 4.98, 7, y + 0.77, 4.98, mat.glowGold, 0.03);
  glowLine(g, -6, y + 1.17, 5.98, 6, y + 1.17, 5.98, mat.glowGold, 0.03);
  const throne = makeThrone(1.5);
  throne.position.set(0, y + 1.2, 12);
  g.add(throne);
  G.physics.addBox(V(-1.9, y + 1.2, 10.4), V(1.9, y + 8, 13.6));
  G.interact.add({
    id: "royal-throne",
    pos: V(0, y + 1.2, 9.6),
    radius: 3.2,
    label: () => "S'asseoir sur le Trône royal (gérer l'univers)",
    action: () => {
      G.player.sit(V(0, y + 1.2 + 0.95, 11.3), 0);
      bus.emit("ui:kingdom");
    }
  });
  // table holographique du royaume
  cyl(g, 2.4, 1, mat.black, 0, y, -8);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.42, 0.06, 8, 64), mat.glowCyan);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, y + 1, -8);
  g.add(ring);
  const globe = new THREE.Mesh(new THREE.SphereGeometry(1.4, 24, 16), mat.holoWire);
  globe.position.set(0, y + 2.9, -8);
  g.add(globe);
  const globe2 = new THREE.Mesh(new THREE.SphereGeometry(1.2, 24, 16), mat.holo);
  globe2.position.copy(globe.position);
  g.add(globe2);
  p.spinners.push({ obj: globe, speed: V(0, 0.3, 0) });
  G.interact.add({ id: "kingdom-table", pos: V(0, y + 1, -8), radius: 4, label: () => "Interface du royaume", action: () => bus.emit("ui:kingdom") });
  // piliers à bandes lumineuses + bannières
  const em = new THREE.MeshStandardMaterial({ map: emblemTexture("ROYAUME"), roughness: 0.7, emissive: 0xffffff, emissiveMap: emblemTexture("ROYAUME"), emissiveIntensity: 0.25 });
  for (const x of [-24, 24])
    for (const z of [-24, -14, -4, 6, 16]) {
      span(g, x - 0.8, y, z - 0.8, x + 0.8, y + 9.5, z + 0.8, mat.marble);
      glowLine(g, x - 0.82, y, z - 0.1, x - 0.8, y + 9.5, z + 0.1, mat.glowBlue, 0.05);
      glowLine(g, x + 0.8, y, z - 0.1, x + 0.82, y + 9.5, z + 0.1, mat.glowBlue, 0.05);
      if (z < 16) plane(g, 2.2, 6.6, em, x + (x < 0 ? 0.85 : -0.85), y + 5, z + 5, x < 0 ? Math.PI / 2 : -Math.PI / 2);
    }
  stdLights(p, f, [
    [0, 8, -20, 0xcfe8ff, 200],
    [0, 8, 0, 0xcfe8ff, 200],
    [0, 7, 12, 0xffd28a, 220],
    [-18, 6, 0, 0x4fa8ff, 120],
    [18, 6, 0, 0x4fa8ff, 120],
    [0, 4, -8, 0x00e5ff, 60]
  ]);
}

// ------------------------------------------------------------------ 3. QUARTIERS PRIVÉS
function quarters(p: Palace) {
  const f = 2;
  const g = p.interiors[f];
  const y = BASE[f];
  const h = FLOORS[f].h - 0.5;
  wallZ(g, -8, -31.7, 22.8, y, h, mat.white, [{ c: -16, w: 2.4, h: 3 }, { c: 11, w: 2.4, h: 3 }], 0.3);
  wallZ(g, 8, -31.7, 22.8, y, h, mat.white, [{ c: -16, w: 2.4, h: 3 }, { c: 11, w: 2.4, h: 3 }], 0.3);
  wallX(g, 0, -31.7, -8, y, h, mat.white, [], 0.3);
  wallX(g, 0, 8, 31.7, y, h, mat.white, [], 0.3);
  const rooms: [string, string, number, number][] = [
    ["bedroom", "Chambre royale", -8, -16],
    ["dressing", "Dressing", -8, 11],
    ["cinema", "Salle de cinéma", 8, -16],
    ["spa", "Salle de détente", 8, 11]
  ];
  for (const [id, label, x, z] of rooms) {
    const d = p.addDoor(new Door(`door-${id}`, label, V(x, y + 1, z)));
    const leaf = box(g, 0.12, 3, 2.4, mat.silver, x, y + 1.5, z, { solid: false });
    glowLine(leaf, -0.08, 1.35, -1.1, 0.08, 1.4, 1.1, mat.glowCyan, 0.04);
    d.addLeaf(leaf, V(0, 0, 2.45));
    d.autoCloseAfter = 12;
    G.interact.add({ id: `door-${id}`, pos: V(x, y + 1.2, z), radius: 3, label: () => `${d.isOpen ? "Fermer" : "Ouvrir"} : ${label}`, action: () => d.toggle() });
  }
  // chambre
  block(g, 6.4, 0.6, 5.4, mat.black, -26, y, -16);
  block(g, 6, 0.45, 5, mat.white, -26, y + 0.6, -16, { solid: false });
  block(g, 0.4, 2.8, 5.6, mat.fabric, -29.4, y, -16);
  glowLine(g, -29.2, y + 2.8, -18.8, -29.15, y + 2.85, -13.2, mat.glowBlue, 0.05);
  glowLine(g, -29.2, y + 0.02, -18.8, -22.8, y + 0.05, -18.75, mat.glowBlue, 0.04);
  for (const z of [-17.3, -14.7]) block(g, 1, 0.3, 1.8, mat.white, -28.4, y + 1.05, z, { solid: false });
  block(g, 3.2, 0.12, 5.2, mat.fabric, -24, y + 1.05, -16, { solid: false });
  for (const z of [-20, -12]) {
    block(g, 1, 0.7, 1, mat.black, -29, y, z);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), mat.glowGold);
    lamp.position.set(-29, y + 1, z);
    g.add(lamp);
  }
  G.interact.add({
    id: "bed",
    pos: V(-24, y + 0.6, -16),
    radius: 3.5,
    label: () => "Se reposer (passer au matin & sauvegarder)",
    action: () => bus.emit("sleep")
  });
  // dressing : tenues
  const outfits: [string, number][] = [
    ["Bleu royal", 0x1e4fd8],
    ["Minuit", 0x14182a],
    ["Blanc & or", 0xe8e4d8],
    ["Pourpre", 0x5b1e7a],
    ["Émeraude", 0x0f6b4a],
    ["Cramoisi", 0x8a1a2a]
  ];
  span(g, -31.5, y + 2.6, 3, -31.3, y + 2.7, 20, mat.silver, { solid: false });
  outfits.forEach(([name, color], i) => {
    const z = 4.5 + i * 2.6;
    const cm = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.1, 4, 12), cm);
    body.position.set(-30.8, y + 1.75, z);
    g.add(body);
    const hanger = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 6, 16, Math.PI), mat.gold);
    hanger.position.set(-30.8, y + 2.5, z);
    g.add(hanger);
    G.interact.add({
      id: `outfit-${i}`,
      pos: V(-30.2, y + 1.5, z),
      radius: 2.4,
      label: () => `Porter la tenue « ${name} »`,
      action: () => {
        G.player.setOutfit(color);
        bus.emit("toast", { text: `Tenue « ${name} » équipée.` });
        bus.emit("save");
      }
    });
  });
  const mirror = plane(g, 3, 5, new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.02 }), -9, y + 2.8, 6, -Math.PI / 2);
  mirror.position.x = -8.3;
  // cinéma
  let filmOn = false;
  let filmT = 0;
  const film = screenAt(p, f, 14, 7.6, V(31.4, y + 4, -16), -Math.PI / 2, 24, (c, w, h, t) => {
    if (!filmOn) {
      holoFrame(c, w, h, "CINÉMA ROYAL");
      c.fillStyle = "#bff0ff";
      c.font = "40px Arial";
      c.fillText("Console au fond de la salle : [E] Lancer la projection", 40, h / 2);
      return;
    }
    filmT = t;
    drawFilm(c, w, h, filmT);
  });
  film.material.opacity = 1;
  for (let r = 0; r < 3; r++)
    for (let k = 0; k < 4; k++) {
      const z = -21 + k * 3.2;
      const x = 14 + r * 3.5;
      block(g, 1.4, 0.5, 1.4, mat.fabric, x, y + r * 0.0, z);
      block(g, 0.3, 1.2, 1.4, mat.fabric, x - 0.7, y, z, { solid: false });
    }
  block(g, 1.2, 1.1, 0.8, mat.black, 10, y, -26);
  G.interact.add({
    id: "cinema",
    pos: V(10, y + 1, -26),
    radius: 3,
    label: () => (filmOn ? "Arrêter la projection" : "Lancer la projection"),
    action: () => {
      filmOn = !filmOn;
      bus.emit("toast", { text: filmOn ? "🎬 Projection : « Le Royaume vu du ciel »" : "Projection terminée." });
      if (filmOn) bus.emit("mission", { type: "cinema" });
    }
  });
  // spa / détente
  span(g, 13.5, y, 5.5, 28.5, y + 0.5, 6, mat.marble);
  span(g, 13.5, y, 18, 28.5, y + 0.5, 18.5, mat.marble);
  span(g, 13.5, y, 6, 14, y + 0.5, 18, mat.marble);
  span(g, 28, y, 6, 28.5, y + 0.5, 18, mat.marble);
  const water = new THREE.Mesh(new THREE.BoxGeometry(14, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0x0a3a6a, emissive: 0x0a6aa8, emissiveIntensity: 0.8, roughness: 0.05, transparent: true, opacity: 0.85 }));
  water.position.set(21, y + 0.3, 12);
  g.add(water);
  for (const z of [8, 13]) {
    block(g, 1, 0.4, 3, mat.white, 10.5, y, z + 1);
  }
  const plantM = new THREE.MeshStandardMaterial({ color: 0x1f7a3a, roughness: 0.8 });
  for (const [x, z] of [[30, 2], [30, 21], [10, 21]]) {
    cyl(g, 0.5, 0.8, mat.black, x, y, z);
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), plantM);
    leaves.position.set(x, y + 1.6, z);
    g.add(leaves);
  }
  G.interact.add({
    id: "spa",
    pos: V(14.5, y + 0.6, 12),
    radius: 3,
    label: () => "Se détendre (ambiance musicale)",
    action: () => {
      const on = G.audio.toggleAmbient();
      bus.emit("toast", { text: on ? "🎵 Ambiance de détente activée." : "Ambiance coupée." });
    }
  });
  // salon central
  sofa(g, -4, y, -20, Math.PI / 2);
  sofa(g, 4, y, -20, -Math.PI / 2);
  sofa(g, 0, y, -14, 0, 4);
  const fire = new THREE.Group();
  for (let k = 0; k < 14; k++) {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.2, 6), k % 2 ? mat.glowBlue : mat.glowCyan);
    flame.position.set((Math.random() - 0.5) * 1.4, 0.6, (Math.random() - 0.5) * 1.4);
    fire.add(flame);
  }
  fire.position.set(0, y + 0.4, -20);
  g.add(fire);
  cyl(g, 1.2, 0.4, mat.black, 0, y, -20);
  p.updaters.push((_dt, t) => {
    if (!p.interiors[f].visible) return;
    fire.children.forEach((c, i) => {
      c.scale.y = 0.6 + 0.5 * Math.abs(Math.sin(t * 3 + i));
    });
  });
  G.interact.add({
    id: "lounge-music",
    pos: V(0, y + 0.6, -20),
    radius: 3.2,
    label: () => "Système audio du salon",
    action: () => {
      const on = G.audio.toggleAmbient();
      bus.emit("toast", { text: on ? "🎵 Musique d'ambiance." : "Silence." });
    }
  });
  stdLights(p, f, [
    [0, 6, -18, 0xffe2b0, 140],
    [-20, 6, -16, 0xffd8a8, 120],
    [20, 6, -16, 0x6fb8ff, 90],
    [-20, 6, 11, 0xffffff, 110],
    [21, 6, 12, 0x3fc8ff, 120],
    [0, 6, 10, 0xffe2b0, 90]
  ]);
}

function drawFilm(c: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const sky = c.createLinearGradient(0, 0, 0, h);
  const phase = (t * 0.05) % 1;
  sky.addColorStop(0, `hsl(${220 + phase * 60},70%,${10 + phase * 25}%)`);
  sky.addColorStop(1, `hsl(${20 + phase * 20},80%,${30 + phase * 20}%)`);
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h);
  // étoiles en vitesse lumière
  c.strokeStyle = "rgba(255,255,255,.7)";
  for (let i = 0; i < 80; i++) {
    const a = i * 2.39996;
    const r = ((t * 120 + i * 37) % 700) + 10;
    const x = w / 2 + Math.cos(a) * r;
    const y = h / 2.5 + Math.sin(a) * r * 0.55;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + Math.cos(a) * r * 0.08, y + Math.sin(a) * r * 0.045);
    c.stroke();
  }
  // silhouettes de la ville
  for (let layer = 0; layer < 3; layer++) {
    c.fillStyle = ["#0b1430", "#081022", "#04070f"][layer];
    const speed = (layer + 1) * 40;
    for (let i = 0; i < 30; i++) {
      const bw = 40 + ((i * 53) % 60);
      const x = ((i * 90 - t * speed) % (w + 200) + w + 200) % (w + 200) - 100;
      const bh = 60 + ((i * 97 + layer * 31) % 180) + layer * 40;
      c.fillRect(x, h - bh, bw, bh);
      c.fillStyle = "#ffd27a";
      for (let k = 0; k < 4; k++) c.fillRect(x + 8 + k * 8, h - bh + 14, 3, 4);
      c.fillStyle = ["#0b1430", "#081022", "#04070f"][layer];
    }
  }
  // vaisseau
  const sx = w * 0.5 + Math.sin(t * 0.7) * 200;
  const sy = h * 0.4 + Math.cos(t * 0.9) * 50;
  c.fillStyle = "#05060a";
  c.beginPath();
  c.moveTo(sx + 70, sy);
  c.lineTo(sx - 60, sy - 30);
  c.lineTo(sx - 40, sy);
  c.lineTo(sx - 60, sy + 30);
  c.closePath();
  c.fill();
  c.fillStyle = "#4fd2ff";
  c.fillRect(sx - 64, sy - 4, 14, 8);
  c.fillStyle = "rgba(255,255,255,.9)";
  c.font = "bold 46px Orbitron, Arial";
  c.textAlign = "center";
  if (t % 30 < 6) c.fillText("LE ROYAUME VU DU CIEL", w / 2, 90);
  c.textAlign = "left";
}

// ------------------------------------------------------------------ 4. CENTRE DE COMMANDEMENT
function command(p: Palace) {
  const f = 3;
  const g = p.interiors[f];
  const y = BASE[f];
  const h = FLOORS[f].h - 0.5;
  // estrade centrale + consoles en anneau
  cyl(g, 6.5, 0.35, mat.black, 0, y, -4);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(6.5, 0.07, 8, 96), mat.glowCyan);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, y + 0.36, -4);
  g.add(ring);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const cx = Math.cos(a) * 5;
    const cz = -4 + Math.sin(a) * 5;
    const con = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 0.8), mat.graphite);
    con.position.set(cx, y + 0.9, cz);
    con.lookAt(0, y + 0.9, -4);
    g.add(con);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.6), mat.holo);
    scr.position.set(cx * 0.94, y + 1.65, -4 + (cz + 4) * 0.94);
    scr.lookAt(0, y + 1.4, -4);
    g.add(scr);
    G.physics.addBox(V(cx - 0.7, y, cz - 0.7), V(cx + 0.7, y + 1.45, cz + 0.7));
  }
  // carte holographique horizontale
  const mapScreen = new HoloScreen(512, 512, (c, w, hh) => {
    c.clearRect(0, 0, w, hh);
    if (G.world?.mapCanvas) {
      c.globalAlpha = 0.9;
      c.drawImage(G.world.mapCanvas, 0, 0, w, hh);
      c.globalAlpha = 1;
    }
    const pp = G.mode === "ship" ? G.ship.root.position : G.player.position;
    const [mx, my] = G.world ? G.world.toMap(pp.x, pp.z, w) : [w / 2, hh / 2];
    c.fillStyle = "#ffd27a";
    c.beginPath();
    c.arc(mx, my, 8, 0, Math.PI * 2);
    c.fill();
  });
  const mapMesh = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), mapScreen.material);
  mapMesh.rotation.x = -Math.PI / 2;
  mapMesh.position.set(0, y + 1.6, -4);
  g.add(mapMesh);
  p.screens.push({ screen: mapScreen, floor: f, fps: 2, last: -1 });
  G.interact.add({ id: "command-console", pos: V(0, y + 0.5, -4), radius: 7.5, label: () => "Ouvrir le centre de commandement", action: () => bus.emit("ui:command") });

  // écrans géants
  screenAt(p, f, 13, 6.2, V(-31.3, y + 4, -14), Math.PI / 2, 2, (c, w, hh) => {
    holoFrame(c, w, hh, "CARTE DU ROYAUME");
    if (G.world?.mapCanvas) c.drawImage(G.world.mapCanvas, 30, 60, hh - 90, hh - 90);
    const legend = ["Palais royal", "Ville futuriste (est)", "Jungle tropicale (sud)", "Montagnes (nord)", "Océan (ouest)", G.missions?.flag("base-found") ? "Base secrète : localisée" : "Base secrète : ???"];
    c.font = "30px Arial";
    legend.forEach((l, i) => {
      c.fillStyle = "#bff0ff";
      c.fillText("◆ " + l, hh, 120 + i * 56);
    });
  });
  screenAt(p, f, 12, 6.2, V(-31.3, y + 4, -0.5), Math.PI / 2, 1, (c, w, hh) => {
    holoFrame(c, w, hh, "MISSIONS");
    c.font = "28px Arial";
    (G.missions?.defs ?? []).forEach((m, i) => {
      const done = G.missions.isDone(m.id);
      c.fillStyle = done ? "#7dffb0" : "#e6f7ff";
      c.fillText(`${done ? "✔" : "◇"} ${m.title}`, 40, 110 + i * 50);
      c.fillStyle = "#7fbfe0";
      c.fillText(done ? "Accomplie" : G.missions.progressText(m.id), 640, 110 + i * 50);
    });
  });
  screenAt(p, f, 13, 6.2, V(31.3, y + 4, -14), -Math.PI / 2, 4, (c, w, hh, t) => {
    holoFrame(c, w, hh, "SYSTÈMES DU ROYAUME");
    const sys: [string, number][] = [
      ["Réseau énergétique", 0.92 + Math.sin(t) * 0.03],
      ["Bouclier du palais", 1],
      ["Royal Talon — énergie", G.ship ? G.ship.energy : 1],
      ["Armure — nano-alliage", G.armor ? G.armor.energy : 1],
      ["Liaison GRIOT", 0.99],
      ["Défense aérienne", 0.86 + Math.sin(t * 0.7) * 0.05]
    ];
    c.font = "28px Arial";
    sys.forEach(([k, v], i) => {
      const yy = 120 + i * 60;
      c.fillStyle = "#bff0ff";
      c.fillText(k, 40, yy);
      c.fillStyle = "rgba(79,210,255,.2)";
      c.fillRect(470, yy - 22, 480, 24);
      c.fillStyle = v > 0.3 ? "#4fd2ff" : "#ff6a7a";
      c.fillRect(470, yy - 22, 480 * Math.max(0, Math.min(1, v)), 24);
    });
  });
  screenAt(p, f, 13, 6.2, V(31.3, y + 4, 4), -Math.PI / 2, 0.5, (c, w, hh) => {
    holoFrame(c, w, hh, "PROJETS");
    const list = (window as any).__griotProjects as { name: string; status: string; tasks: { done: boolean }[] }[] | undefined;
    c.font = "28px Arial";
    if (!list || !list.length) {
      c.fillStyle = "#bff0ff";
      c.fillText("Aucun projet enregistré.", 40, 130);
      c.fillText("Dites : « GRIOT, crée le projet … »", 40, 180);
      return;
    }
    list.slice(0, 8).forEach((pr, i) => {
      const done = pr.tasks.filter((t) => t.done).length;
      c.fillStyle = "#e6f7ff";
      c.fillText(`◆ ${pr.name}`, 40, 120 + i * 52);
      c.fillStyle = "#7fbfe0";
      c.fillText(`${pr.status} · ${done}/${pr.tasks.length} tâches`, 600, 120 + i * 52);
    });
  });
  // archives secrètes (pièce verrouillée)
  wallZ(g, -16, 8, 22.8, y, h, mat.silver, [{ c: 15.5, w: 2.6, h: 3 }], 0.4);
  wallX(g, 8, -31.7, -16, y, h, mat.silver, [], 0.4);
  const ad = p.addDoor(new Door("door-archives", "Archives royales", V(-16, y + 1, 15.5)));
  const leaf = box(g, 0.25, 3, 2.6, mat.gold, -16, y + 1.5, 15.5, { solid: false });
  glowLine(leaf, -0.15, -1.3, -0.05, 0.15, 1.3, 0.05, mat.glowCyan, 0.05);
  ad.addLeaf(leaf, V(0, 0, 2.6));
  ad.locked = true;
  ad.lockedReason = "rassemblez les 3 Éclats de données du royaume.";
  G.interact.add({
    id: "door-archives",
    pos: V(-16, y + 1.2, 15.5),
    radius: 3,
    label: () => (ad.locked ? "Archives royales — verrouillées" : ad.isOpen ? "Fermer les archives" : "Ouvrir les archives"),
    action: () => ad.toggle()
  });
  // contenu des archives
  const capsule = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 3.2, 24, 1, true), mat.glass);
  capsule.position.set(-26, y + 1.9, 15.5);
  g.add(capsule);
  cyl(g, 1.4, 0.3, mat.gold, -26, y, 15.5);
  const onyx = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.4, 4, 16), new THREE.MeshStandardMaterial({ color: 0x050505, metalness: 1, roughness: 0.25, emissive: 0x8a5cff, emissiveIntensity: 0.4 }));
  onyx.position.set(-26, y + 1.7, 15.5);
  g.add(onyx);
  G.interact.add({
    id: "onyx",
    pos: V(-26, y + 1, 15.5),
    radius: 3,
    enabled: () => !G.missions.state.armors.includes("onyx"),
    label: () => "Récupérer l'Armure Onyx",
    action: () => bus.emit("mission", { type: "armor-found", id: "onyx" })
  });
  const lore = screenAt(p, f, 5, 3, V(-31.3, y + 3, 15.5), Math.PI / 2, 0.2, (c, w, hh) => {
    holoFrame(c, w, hh, "ARCHIVES ROYALES");
    c.fillStyle = "#e6f7ff";
    c.font = "34px Arial";
    ["Les griots gardaient la mémoire des royaumes.", "Ils racontaient, conseillaient, guidaient.", "Aujourd'hui, GRIOT veille sur le vôtre."].forEach((l, i) => c.fillText(l, 40, 160 + i * 70));
  });
  lore.material.opacity = 0.95;
  stdLights(p, f, [
    [0, 6, -4, 0x4fd2ff, 200],
    [-22, 6, -6, 0x3f8cff, 140],
    [22, 6, -6, 0x3f8cff, 140],
    [0, 6, -24, 0xbfe6ff, 120],
    [-24, 5, 15, 0x8a5cff, 90],
    [12, 6, 14, 0xbfe6ff, 90]
  ]);
}

// ------------------------------------------------------------------ 5. LABORATOIRE
export const PROTOTYPES = [
  { id: "fusion", name: "Réacteur à fusion compact", reward: "Vitesse max du Royal Talon +25 %", x: -18 },
  { id: "gravity", name: "Propulseur gravitationnel", reward: "Post-combustion du Royal Talon (Maj)", x: 0 },
  { id: "nano", name: "Nano-tissage adaptatif", reward: "Capacité d'armure : Bouclier (touche 2)", x: 18 }
];

function lab(p: Palace) {
  const f = 4;
  const g = p.interiors[f];
  const y = BASE[f];
  const h = FLOORS[f].h - 0.5;
  // établis
  for (const [x, z] of [[-18, 4], [0, 4], [18, 4], [-18, 12]]) {
    block(g, 7, 1, 2, mat.white, x, y, z);
    glowLine(g, x - 3.5, y + 1, z - 1.01, x + 3.5, y + 1.02, z - 1, mat.glowCyan, 0.03);
    for (let k = 0; k < 3; k++) {
      const tool = new THREE.Mesh(k === 1 ? new THREE.TorusGeometry(0.25, 0.08, 8, 16) : new THREE.BoxGeometry(0.6, 0.25, 0.4), k === 1 ? mat.gold : mat.graphite);
      tool.position.set(x - 2 + k * 2, y + 1.2, z);
      g.add(tool);
    }
  }
  // prototypes holographiques
  for (const pr of PROTOTYPES) {
    cyl(g, 1.4, 0.9, mat.black, pr.x, y, -14);
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.42, 0.05, 8, 48), mat.glowCyan);
    r.rotation.x = Math.PI / 2;
    r.position.set(pr.x, y + 0.9, -14);
    g.add(r);
    let holo: THREE.Object3D;
    if (pr.id === "fusion") holo = new THREE.Mesh(new THREE.TorusKnotGeometry(0.8, 0.22, 128, 16), mat.holoWire);
    else if (pr.id === "gravity") {
      holo = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const t = new THREE.Mesh(new THREE.TorusGeometry(0.4 + k * 0.3, 0.03, 6, 48), mat.holo);
        t.rotation.x = k * 0.8;
        holo.add(t);
      }
    } else {
      const geo = new THREE.BufferGeometry();
      const pts = new Float32Array(600 * 3);
      for (let i = 0; i < 600; i++) {
        const v = new THREE.Vector3().randomDirection().multiplyScalar(0.6 + Math.random() * 0.5);
        pts.set([v.x, v.y, v.z], i * 3);
      }
      geo.setAttribute("position", new THREE.BufferAttribute(pts, 3));
      holo = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x6fe0ff, size: 0.06, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    }
    holo.position.set(pr.x, y + 2.4, -14);
    g.add(holo);
    p.spinners.push({ obj: holo, speed: V(0.2, 0.7, 0), bob: 0.15, baseY: y + 2.4 });
    G.interact.add({
      id: `proto-${pr.id}`,
      pos: V(pr.x, y + 1, -14),
      radius: 3.2,
      label: () => (G.missions.state.tech.includes(pr.id) ? `${pr.name} — analysé ✔` : `Analyser : ${pr.name}`),
      action: () => bus.emit("research", pr)
    });
  }
  // cuves lumineuses
  for (const x of [-26, -20, 20, 26]) {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 5, 24, 1, true), mat.glass);
    tube.position.set(x, y + 2.7, -26);
    g.add(tube);
    cyl(g, 1.05, 0.4, mat.silver, x, y, -26);
    cyl(g, 1.05, 0.4, mat.silver, x, y + 5.1, -26, { solid: false });
    const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 4.2, 24), new THREE.MeshStandardMaterial({ color: 0x002030, emissive: x < 0 ? 0x00c8ff : 0x8a5cff, emissiveIntensity: 1.4, transparent: true, opacity: 0.6 }));
    liquid.position.set(x, y + 2.5, -26);
    g.add(liquid);
  }
  // bras robotisé animé
  const arm = new THREE.Group();
  arm.position.set(0, y + 1, 12);
  const s1 = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 1.8, 12), mat.silver);
  s1.position.y = 0.9;
  const joint = new THREE.Group();
  joint.position.y = 1.8;
  const s2 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.6, 0.25), mat.graphite);
  s2.position.y = 0.8;
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), mat.glowCyan);
  tip.position.y = 1.6;
  joint.add(s2, tip);
  arm.add(s1, joint);
  g.add(arm);
  p.updaters.push((_dt, t) => {
    arm.rotation.y = Math.sin(t * 0.6) * 1.2;
    joint.rotation.z = -0.6 + Math.sin(t * 1.3) * 0.5;
  });
  // coffre des prototypes
  wallZ(g, 16, 8, 22.8, y, h, mat.graphite, [{ c: 16, w: 2.8, h: 3 }], 0.5);
  wallX(g, 7.75, 16, 31.7, y, h, mat.graphite, [], 0.5);
  const vd = p.addDoor(new Door("door-vault", "Coffre des prototypes", V(16, y + 1, 16)));
  const vleaf = box(g, 0.35, 3, 2.8, mat.black, 16, y + 1.5, 16, { solid: false });
  glowLine(vleaf, -0.2, -0.05, -1.3, 0.2, 0.05, 1.3, mat.glowGold, 0.05);
  vd.addLeaf(vleaf, V(0, 3.05, 0));
  vd.locked = true;
  vd.lockedReason = "analysez les 3 prototypes du laboratoire.";
  G.interact.add({ id: "door-vault", pos: V(16, y + 1.2, 16), radius: 3, label: () => (vd.locked ? "Coffre — verrouillé" : vd.isOpen ? "Fermer le coffre" : "Ouvrir le coffre"), action: () => vd.toggle() });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 2), mat.glowGold);
  core.position.set(25, y + 1.8, 16);
  g.add(core);
  cyl(g, 1, 1, mat.black, 25, y, 16);
  p.spinners.push({ obj: core, speed: V(0.4, 0.9, 0), bob: 0.2, baseY: y + 1.9 });
  G.interact.add({
    id: "energy-core",
    pos: V(25, y + 1, 16),
    radius: 3,
    enabled: () => !G.missions.flag("core"),
    label: () => "Prendre le Cœur d'énergie royal",
    action: () => {
      core.visible = false;
      bus.emit("mission", { type: "core" });
    }
  });
  p.updaters.push(() => {
    if (G.missions?.flag("core")) core.visible = false;
  });
  stdLights(p, f, [
    [-18, 6, -14, 0x4fd2ff, 150],
    [0, 6, -14, 0x4fd2ff, 150],
    [18, 6, -14, 0x8a5cff, 150],
    [0, 6, 8, 0xffffff, 160],
    [-22, 5, -24, 0x00c8ff, 100],
    [24, 5, 16, 0xffc861, 100]
  ]);
}

// ------------------------------------------------------------------ 6. ARMURERIE
export const GADGETS = [
  { name: "Gantelets à impulsion", desc: "Concentrent l'énergie cinétique absorbée par l'armure en une onde de choc (capacité 1)." },
  { name: "Disque-bouclier", desc: "Déploie un dôme d'énergie hexagonal pendant quelques secondes (capacité 2)." },
  { name: "Drone éclaireur", desc: "Petit drone de reconnaissance relié à GRIOT : il cartographie les zones survolées." },
  { name: "Visière tactique", desc: "Vision nocturne et surlignage des éléments interactifs (capacité 4)." }
];

function armory(p: Palace) {
  const f = 5;
  const g = p.interiors[f];
  const y = BASE[f];
  cyl(g, 2.6, 0.6, mat.black, 0, y, -4);
  const r = new THREE.Mesh(new THREE.TorusGeometry(2.62, 0.07, 8, 64), mat.glowBlue);
  r.rotation.x = Math.PI / 2;
  r.position.set(0, y + 0.6, -4);
  g.add(r);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.3, 0.5, 12), mat.glowWhite);
    lamp.position.set(Math.cos(a) * 3.4, y + 0.25, -4 + Math.sin(a) * 3.4);
    g.add(lamp);
  }
  // vitrines d'armures (contenu géré par le système d'armure)
  for (const x of [-27, 27])
    for (const z of [-20, -6, 8]) {
      cyl(g, 1.5, 0.4, mat.gold, x, y, z);
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 3.4, 24, 1, true), mat.glass);
      glass.position.set(x, y + 2.1, z);
      g.add(glass);
      cyl(g, 1.5, 0.3, mat.gold, x, y + 3.8, z, { solid: false });
      p.armorCases.push({ pos: V(x, y + 0.4, z), yaw: x < 0 ? Math.PI / 2 : -Math.PI / 2 });
    }
  // râtelier de gadgets
  block(g, 14, 1, 1.6, mat.graphite, -14, y, 20);
  GADGETS.forEach((gd, i) => {
    const x = -19.5 + i * 3.6;
    let mesh: THREE.Mesh;
    if (i === 0) mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.5, 4, 12), mat.glowBlue);
    else if (i === 1) mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.08, 24), mat.glowCyan);
    else if (i === 2) mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), mat.silver);
    else mesh = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 8, 24, Math.PI), mat.glowGold);
    mesh.position.set(x, y + 1.6, 20);
    g.add(mesh);
    p.spinners.push({ obj: mesh, speed: V(0, 1, 0), bob: 0.08, baseY: y + 1.6 });
    G.interact.add({
      id: `gadget-${i}`,
      pos: V(x, y + 1, 19),
      radius: 2,
      label: () => `Examiner : ${gd.name}`,
      action: () => bus.emit("griot:say", { text: `${gd.name}. ${gd.desc}` })
    });
  });
  // moto antigravité sur plateau tournant
  const turntable = new THREE.Group();
  turntable.position.set(18, y, 16);
  const tt = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.3, 48), mat.black);
  tt.position.y = 0.15;
  turntable.add(tt);
  const bike = makeHoverBike();
  bike.position.y = 1;
  turntable.add(bike);
  g.add(turntable);
  G.physics.addBox(V(15, y, 13), V(21, y + 0.3, 19));
  p.updaters.push((dt, t) => {
    turntable.rotation.y += dt * 0.3;
    bike.position.y = 1 + Math.sin(t * 2) * 0.08;
  });
  G.interact.add({
    id: "hover-bike",
    pos: V(18, y + 1, 16),
    radius: 3.8,
    label: () => "Moto antigravité « Éclair » — fiche technique",
    action: () => bus.emit("griot:say", { text: "La moto antigravité Éclair : propulsion magnétique, 320 kilomètres heure, en cours d'homologation par le laboratoire. Le Royal Talon reste votre véhicule principal, au hangar du niveau 7." })
  });
  stdLights(p, f, [
    [0, 6.5, -4, 0xffffff, 260],
    [-24, 6, -6, 0x4fa8ff, 120],
    [24, 6, -6, 0x4fa8ff, 120],
    [-14, 5, 18, 0x00e5ff, 90],
    [18, 5, 16, 0x8a5cff, 100],
    [0, 6, -24, 0xbfe6ff, 100]
  ]);
}

export function makeHoverBike() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 2.2, 6, 16), mat.black);
  body.rotation.z = Math.PI / 2;
  g.add(body);
  for (const x of [-1.3, 1.3]) {
    const pod = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.12, 10, 24), mat.silver);
    pod.position.x = x;
    pod.rotation.x = Math.PI / 2;
    pod.position.y = -0.3;
    g.add(pod);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.4, 24), mat.glowCyan);
    glow.rotation.x = Math.PI / 2;
    glow.position.set(x, -0.35, 0);
    g.add(glow);
  }
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.15, 0.5), mat.fabric);
  seat.position.set(-0.2, 0.45, 0);
  g.add(seat);
  const shield = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.6), mat.glass);
  shield.position.set(0.9, 0.55, 0);
  shield.rotation.z = -0.5;
  g.add(shield);
  return g;
}

// ------------------------------------------------------------------ 7. HANGAR
function hangar(p: Palace) {
  const f = 6;
  const g = p.interiors[f];
  const y = BASE[f];
  const pad = new THREE.Mesh(new THREE.RingGeometry(7, 7.4, 64), mat.glowCyan);
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(0, y + 0.02, -4);
  g.add(pad);
  const pad2 = new THREE.Mesh(new THREE.RingGeometry(4, 4.15, 64), mat.glowBlue);
  pad2.rotation.x = -Math.PI / 2;
  pad2.position.set(0, y + 0.02, -4);
  g.add(pad2);
  for (const x of [-29, 29]) for (let z = -28; z <= 20; z += 8) glowLine(g, x, y + 0.5, z, x + 0.1, y + 9, z + 0.1, mat.glowBlue, 0.1);
  // porte du hangar (deux battants géants)
  const hd = p.addDoor(new Door("door-hangar", "Portes du hangar", V(0, y + 1, -32)));
  for (const side of [-1, 1]) {
    const leaf = box(g, 13, 8, 0.5, mat.graphite, side * 6.5, y + 4, -31.2, { solid: false });
    for (let k = -2; k <= 2; k++) glowLine(leaf, -6.3, k * 1.5, -0.3, 6.3, k * 1.5 + 0.06, -0.3, mat.glowBlue, 0.06);
    glowLine(leaf, -side * 6.4, -3.9, 0.26, -side * 6.4 + 0.08, 3.9, 0.26, mat.glowCyan, 0.06);
    hd.addLeaf(leaf, V(side * 12.6, 0, 0));
  }
  hd.speed = 0.5;
  block(g, 1.4, 1.2, 0.8, mat.black, -15.5, y, -29);
  const btn = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.6), mat.holo);
  btn.position.set(-15.5, y + 1.6, -28.9);
  btn.rotation.x = -0.4;
  g.add(btn);
  G.interact.add({
    id: "hangar-console",
    pos: V(-15.5, y + 1, -28.5),
    radius: 3,
    label: () => (hd.isOpen ? "Fermer les portes du hangar" : "Ouvrir les portes du hangar"),
    action: () => hd.toggle()
  });
  // navette secondaire (en développement) & motos
  const shuttle = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(2, 7, 8, 16), mat.white);
  hull.rotation.x = Math.PI / 2;
  hull.scale.set(1, 1, 0.7);
  shuttle.add(hull);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(9, 0.3, 3), mat.silver);
  fin.position.set(0, -0.4, 2);
  shuttle.add(fin);
  const win = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat.glass);
  win.position.set(0, 0.8, -3);
  shuttle.add(win);
  shuttle.position.set(-20, y + 2.2, 16);
  g.add(shuttle);
  G.physics.addBox(V(-24.5, y, 10), V(-15.5, y + 4, 22));
  G.interact.add({
    id: "shuttle",
    pos: V(-20, y + 1, 9),
    radius: 4,
    label: () => "Navette diplomatique « Zénith » (en construction)",
    action: () => bus.emit("griot:say", { text: "La navette Zénith est encore en construction au hangar. Les ingénieurs du laboratoire attendent le Cœur d'énergie royal pour terminer ses moteurs." })
  });
  for (const z of [12, 18]) {
    const b = makeHoverBike();
    b.position.set(22, y + 1, z);
    g.add(b);
  }
  // robots de maintenance
  for (const [x, z] of [[8, 4], [-8, 6]]) {
    const bot = new THREE.Group();
    const bb = new THREE.Mesh(new THREE.BoxGeometry(1, 0.8, 1), mat.silver);
    bb.position.y = 0.6;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), mat.glowCyan);
    eye.position.set(0, 0.8, -0.5);
    bot.add(bb, eye);
    bot.position.set(x, y, z);
    g.add(bot);
    p.updaters.push((_dt, t) => {
      bot.position.x = x + Math.sin(t * 0.4 + z) * 2;
      bot.rotation.y = Math.cos(t * 0.4 + z) > 0 ? Math.PI / 2 : -Math.PI / 2;
    });
  }
  stdLights(p, f, [
    [0, 8.5, -4, 0xffffff, 320],
    [-18, 8, -16, 0x4fa8ff, 140],
    [18, 8, -16, 0x4fa8ff, 140],
    [-18, 8, 14, 0xbfe6ff, 120],
    [18, 8, 14, 0xbfe6ff, 120],
    [0, 8, 20, 0x00e5ff, 80]
  ]);
}

export function fmtHour(h: number) {
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
