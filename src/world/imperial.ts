// LE PALAIS IMPÉRIAL DE LA MONTAGNE ROYALE — sur le plateau sommital (600 m) d'une île-montagne :
// ~6,6 km² (plus que la ville futuriste et la Nouvelle Métropole réunies). Remparts et tours, grande
// avenue, bassins, jardins, pavillons, cité noble, et le Grand Palais à gradins (dômes d'or, tours de
// 240 m, flèche de 480 m) avec un intérieur aménagé : hall, salle du trône, salon, cinéma, salle de
// banquet, grande cuisine, bibliothèque, spa avec piscine, suite royale et chambres d'invités.
// Le palais entier peut devenir FURTIF (vague d'invisibilité).
import * as THREE from "three";
import { G, bus } from "../core";
import { mat } from "./materials";
import { wallX, wallZ } from "./build";
import { MOUNTAIN, inAirport } from "./countryData";
import { furniture } from "../game/deco";
import { cloakMaterial } from "../game/shipmodel";

export const IMPERIAL = { x: MOUNTAIN.x, z: MOUNTAIN.z, y: MOUNTAIN.top };

export class ImperialPalace {
  root = new THREE.Group();
  stealth = false;
  private originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private sweep: { on: boolean; t: number; parts: { m: THREE.Mesh; x: number }[]; wall: THREE.Mesh } | null = null;
  pad = new THREE.Vector3();
  front = new THREE.Vector3();

  build() {
    const r = this.root;
    G.scene.add(r);
    const C = new THREE.Vector3(IMPERIAL.x, IMPERIAL.y, IMPERIAL.z);
    const Y = C.y;
    const W = (x: number, y: number, z: number) => new THREE.Vector3(C.x + x, Y + y, C.z + z);
    const stone = new THREE.MeshStandardMaterial({ color: 0xf1ece2, roughness: 0.55 });
    const stone2 = new THREE.MeshStandardMaterial({ color: 0xe2d9c8, roughness: 0.6 });
    const marble = mat.marble;
    const gold = mat.gold;
    const glowGold = mat.glowGold;
    const water = new THREE.MeshStandardMaterial({ color: 0x2a9ad8, roughness: 0.05, metalness: 0.3, emissive: 0x0a3a5a, emissiveIntensity: 0.35, transparent: true, opacity: 0.9 });
    const hedge = mat.hedge;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const add = (o: THREE.Object3D) => {
      o.traverse((m) => {
        if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).castShadow = (m as THREE.Mesh).receiveShadow = true;
      });
      r.add(o);
      return o;
    };
    const solid = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) =>
      G.physics.addBox({ x: C.x + Math.min(x1, x2), y: Y + Math.min(y1, y2), z: C.z + Math.min(z1, z2) }, { x: C.x + Math.max(x1, x2), y: Y + Math.max(y1, y2), z: C.z + Math.max(z1, z2) }, "imperial");
    const box = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, m: THREE.Material, isSolid = true) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(x2 - x1, y2 - y1, z2 - z1), m);
      b.position.copy(W((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2));
      add(b);
      if (isSolid) solid(x1, y1, z1, x2, y2, z2);
      return b;
    };
    const cyl = (rad: number, h: number, m: THREE.Material, x: number, y: number, z: number, seg = 24, rTop = rad, isSolid = true) => {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rad, h, seg), m);
      c.position.copy(W(x, y + h / 2, z));
      add(c);
      if (isSolid) solid(x - rad * 0.75, y, z - rad * 0.75, x + rad * 0.75, y + h, z + rad * 0.75);
      return c;
    };
    const dome = (rad: number, m: THREE.Material, x: number, y: number, z: number) => {
      const d = new THREE.Mesh(new THREE.SphereGeometry(rad, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), m);
      d.position.copy(W(x, y, z));
      add(d);
      return d;
    };
    const inst = (geo: THREE.BufferGeometry, m: THREE.Material, items: { p: [number, number, number]; s?: [number, number, number]; ry?: number }[]) => {
      const im = new THREE.InstancedMesh(geo, m, Math.max(1, items.length));
      items.forEach((it, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.ry ?? 0);
        m4.compose(v.copy(W(...it.p)), q, sc.set(...(it.s ?? [1, 1, 1])));
        im.setMatrixAt(i, m4);
      });
      im.count = items.length;
      im.castShadow = im.receiveShadow = true;
      r.add(im);
      return im;
    };
    let seed = 777;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

    // ================================================================ REMPARTS ET TOURS
    const RR = MOUNTAIN.plateau - 60;
    const NSEG = 140;
    const walls: { p: [number, number, number]; s: [number, number, number]; ry: number }[] = [];
    const towers: { p: [number, number, number] }[] = [];
    for (let k = 0; k < NSEG; k++) {
      const a0 = (k / NSEG) * Math.PI * 2,
        a1 = ((k + 1) / NSEG) * Math.PI * 2;
      const am = (a0 + a1) / 2;
      // grande porte au sud (vers le royaume)
      const gate = Math.abs(Math.atan2(Math.sin(am + Math.PI / 2), Math.cos(am + Math.PI / 2))) < 0.03;
      // pas de tour dans l'ouverture de la grande porte (la route impériale y entre)
      const nearGate = Math.abs(Math.atan2(Math.sin(a0 + Math.PI / 2), Math.cos(a0 + Math.PI / 2))) < 0.07;
      if (k % 7 === 0 && !nearGate) towers.push({ p: [Math.cos(a0) * RR, 0, Math.sin(a0) * RR] });
      if (gate) continue;
      const x0 = Math.cos(a0) * RR,
        z0 = Math.sin(a0) * RR,
        x1 = Math.cos(a1) * RR,
        z1 = Math.sin(a1) * RR;
      const len = Math.hypot(x1 - x0, z1 - z0);
      walls.push({ p: [(x0 + x1) / 2, 22, (z0 + z1) / 2], s: [len + 1, 44, 9], ry: -Math.atan2(z1 - z0, x1 - x0) });
      for (let u = 0; u <= 1; u += 0.125) solid(x0 + (x1 - x0) * u - 5, 0, z0 + (z1 - z0) * u - 5, x0 + (x1 - x0) * u + 5, 44, z0 + (z1 - z0) * u + 5);
    }
    inst(new THREE.BoxGeometry(1, 1, 1), stone2, walls);
    const crenels: { p: [number, number, number]; s: [number, number, number]; ry: number }[] = [];
    for (const w of walls) for (let k = -3; k <= 3; k++) crenels.push({ p: [w.p[0] + Math.cos(-w.ry) * k * (w.s[0] / 7), 46, w.p[2] + Math.sin(-w.ry) * k * (w.s[0] / 7)], s: [4, 4, 9.5], ry: w.ry });
    inst(new THREE.BoxGeometry(1, 1, 1), stone2, crenels);
    inst(new THREE.CylinderGeometry(16, 18, 1, 24), stone, towers.map((t) => ({ p: [t.p[0], 37, t.p[2]] as [number, number, number], s: [1, 74, 1] as [number, number, number] })));
    inst(new THREE.ConeGeometry(19, 30, 24), gold, towers.map((t) => ({ p: [t.p[0], 89, t.p[2]] as [number, number, number] })));
    for (const t of towers) solid(t.p[0] - 13, 0, t.p[2] - 13, t.p[0] + 13, 74, t.p[2] + 13);
    // porte monumentale
    for (const sx of [-1, 1]) {
      cyl(20, 110, stone, sx * 46, 0, -RR, 24);
      cyl(23, 34, gold, sx * 46, 110, -RR, 24, 2, false);
    }
    box(-46, 70, -RR - 8, 46, 92, -RR + 8, stone);
    const gateSign = new THREE.Mesh(new THREE.PlaneGeometry(80, 12), new THREE.MeshBasicMaterial({ map: signTex("PALAIS IMPÉRIAL", "#ffd27a", "#0b1a3a") }));
    gateSign.position.copy(W(0, 80, -RR - 8.2));
    gateSign.rotation.y = Math.PI;
    r.add(gateSign);

    // ================================================================ GRANDE AVENUE, BASSINS, STATUES
    const AV0 = -RR + 10,
      AV1 = -270;
    const avenue = new THREE.Mesh(new THREE.PlaneGeometry(60, AV1 - AV0), new THREE.MeshStandardMaterial({ color: 0xece4d4, roughness: 0.45 }));
    avenue.rotation.x = -Math.PI / 2;
    avenue.position.copy(W(0, 0.12, (AV0 + AV1) / 2));
    r.add(avenue);
    for (const sx of [-1, 1]) {
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(36, AV1 - AV0 - 120), water);
      pool.rotation.x = -Math.PI / 2;
      pool.position.copy(W(sx * 62, 0.3, (AV0 + AV1) / 2));
      r.add(pool);
      box(sx * 62 - 19, 0, AV0 + 60, sx * 62 - 17, 0.8, AV1 - 60, stone, false);
      box(sx * 62 + 17, 0, AV0 + 60, sx * 62 + 19, 0.8, AV1 - 60, stone, false);
    }
    const lamps: { p: [number, number, number] }[] = [];
    const statues: { p: [number, number, number]; ry: number }[] = [];
    for (let z = AV0 + 40; z < AV1; z += 45)
      for (const sx of [-1, 1]) {
        lamps.push({ p: [sx * 34, 0, z] });
        if (Math.round(z / 45) % 3 === 0) statues.push({ p: [sx * 90, 0, z], ry: sx > 0 ? -Math.PI / 2 : Math.PI / 2 });
      }
    inst(new THREE.CylinderGeometry(0.25, 0.35, 12, 8).translate(0, 6, 0), gold, lamps);
    inst(new THREE.SphereGeometry(1.2, 12, 8).translate(0, 12.5, 0), glowGold, lamps);
    inst(new THREE.BoxGeometry(5, 4, 5).translate(0, 2, 0), marble, statues);
    inst(new THREE.CylinderGeometry(1.2, 1.6, 9, 12).translate(0, 8.5, 0), gold, statues);
    inst(new THREE.SphereGeometry(1.5, 16, 12).translate(0, 14.4, 0), gold, statues);
    // fontaines monumentales
    for (const [fx, fz] of [[0, -900], [0, -560], [-500, 300], [500, 300], [-700, -500], [700, -500], [0, 700], [-850, 650], [850, 650]]) {
      if (inAirport(C.x + fx, C.z + fz, 40)) continue;
      cyl(22, 2.5, stone, fx, 0, fz, 48);
      const w = new THREE.Mesh(new THREE.CircleGeometry(20.5, 48), water);
      w.rotation.x = -Math.PI / 2;
      w.position.copy(W(fx, 2.3, fz));
      r.add(w);
      cyl(2.4, 12, stone, fx, 2, fz, 16, 2.4, false);
      cyl(8, 1.5, gold, fx, 14, fz, 24, 8, false);
      const jet = new THREE.Mesh(new THREE.ConeGeometry(3, 18, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
      jet.position.copy(W(fx, 24, fz));
      r.add(jet);
    }

    // ================================================================ JARDINS (haies, arbres, parterres de fleurs)
    const hedges: { p: [number, number, number]; s: [number, number, number] }[] = [];
    const trees: { p: [number, number, number]; s: [number, number, number] }[] = [];
    const flowers: { p: [number, number, number]; s: [number, number, number] }[] = [];
    const inPalace = (x: number, z: number, m = 0) => Math.abs(x) < 430 + m && z > -300 - m && z < 280 + m;
    const onAvenue = (x: number, z: number, m = 0) => (Math.abs(x) < 110 + m && z < -250) || !!inAirport(C.x + x, C.z + z, m) || (Math.abs(x - 560) < 90 + m && Math.abs(z + 700) < 90 + m) || (Math.abs(x + 560) < 70 + m && Math.abs(z + 640) < 90 + m) || (Math.abs(x - 600) < 150 + m && Math.abs(z + 300) < 120 + m);
    for (let k = 0; k < 2400; k++) {
      const a = rnd() * Math.PI * 2,
        d = 200 + Math.sqrt(rnd()) * (RR - 260);
      const x = Math.cos(a) * d,
        z = Math.sin(a) * d;
      if (inPalace(x, z, 30) || onAvenue(x, z, 20)) continue;
      const kind = rnd();
      if (kind < 0.45) trees.push({ p: [x, 0, z], s: [1 + rnd(), 1 + rnd() * 0.8, 1 + rnd()] });
      else if (kind < 0.75) hedges.push({ p: [x, 1, z], s: [8 + rnd() * 14, 2, 2] });
      else flowers.push({ p: [x, 0.4, z], s: [4 + rnd() * 6, 0.8, 4 + rnd() * 6] });
    }
    inst(new THREE.BoxGeometry(1, 1, 1), hedge, hedges);
    inst(new THREE.CylinderGeometry(0.35, 0.5, 6, 6).translate(0, 3, 0), mat.wood, trees);
    inst(new THREE.IcosahedronGeometry(3.2, 0).translate(0, 8, 0), new THREE.MeshStandardMaterial({ color: 0x2f6a2a, flatShading: true, roughness: 0.9 }), trees);
    const fl = inst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.8 }), flowers);
    const col = new THREE.Color();
    flowers.forEach((_, i) => fl.setColorAt(i, col.setHSL([0.95, 0.12, 0.8, 0.02][i % 4], 0.8, 0.6)));

    // ================================================================ PAVILLONS ET CITÉ NOBLE
    const pav: { p: [number, number, number]; s: [number, number, number] }[] = [];
    const pavDomes: { p: [number, number, number]; s: [number, number, number] }[] = [];
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2 + 0.2;
      const x = Math.cos(a) * 820,
        z = Math.sin(a) * 820;
      if (onAvenue(x, z, 60)) continue;
      pav.push({ p: [x, 16, z], s: [90, 32, 64] });
      pavDomes.push({ p: [x, 32, z], s: [1, 1, 1] });
      solid(x - 45, 0, z - 32, x + 45, 32, z + 32);
    }
    inst(new THREE.BoxGeometry(1, 1, 1), stone, pav);
    inst(new THREE.SphereGeometry(22, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), gold, pavDomes);
    const houses: { p: [number, number, number]; s: [number, number, number] }[] = [];
    const roofs: { p: [number, number, number]; s: [number, number, number] }[] = [];
    for (let k = 0; k < 3000 && houses.length < 520; k++) {
      const a = rnd() * Math.PI * 2,
        d = 470 + rnd() * (RR - 540);
      const x = Math.cos(a) * d,
        z = Math.sin(a) * d;
      if (onAvenue(x, z, 40) || inPalace(x, z, 60)) continue;
      if (pav.some((p) => Math.abs(p.p[0] - x) < 75 && Math.abs(p.p[2] - z) < 60)) continue;
      const w = 18 + rnd() * 16,
        d2 = 18 + rnd() * 16,
        h = 12 + rnd() * 16;
      if (houses.some((hh) => Math.abs(hh.p[0] - x) < (hh.s[0] + w) / 2 + 10 && Math.abs(hh.p[2] - z) < (hh.s[2] + d2) / 2 + 10)) continue;
      houses.push({ p: [x, h / 2, z], s: [w, h, d2] });
      roofs.push({ p: [x, h + 3, z], s: [w * 0.75, 6, d2 * 0.75] });
      solid(x - w / 2, 0, z - d2 / 2, x + w / 2, h, z + d2 / 2);
    }
    inst(new THREE.BoxGeometry(1, 1, 1), stone2, houses);
    inst(new THREE.ConeGeometry(0.75, 1, 4).rotateY(Math.PI / 4), new THREE.MeshStandardMaterial({ color: 0x1f3f8f, roughness: 0.5 }), roofs);

    // ================================================================ LE GRAND PALAIS (à gradins)
    const PX = 380,
      PZ1 = -230,
      PZ2 = 230;
    // intérieur aménagé (bloc avant, au centre) : x −130…130, z −230…−30, hauteur 10
    const IX = 130,
      IZ1 = -230,
      IZ2 = -30,
      IH = 10;
    // niveau 1 (30 m) autour du bloc intérieur
    box(-PX, 0, PZ1, -IX, 30, PZ2, stone);
    box(IX, 0, PZ1, PX, 30, PZ2, stone);
    box(-IX, 0, IZ2, IX, 30, PZ2, stone);
    box(-IX, IH, IZ1, IX, 30, IZ2, stone); // au-dessus de l'intérieur
    // colonnade du niveau 1
    const cols: { p: [number, number, number] }[] = [];
    for (let x = -PX + 6; x <= PX - 6; x += 12) for (const z of [PZ1 - 8, PZ2 + 8]) if (!(z < 0 && Math.abs(x) < 16)) cols.push({ p: [x, 13, z] });
    for (let z = PZ1; z <= PZ2; z += 12) for (const x of [-PX - 8, PX + 8]) cols.push({ p: [x, 13, z] });
    inst(new THREE.CylinderGeometry(1.6, 1.8, 26, 16), marble, cols);
    box(-PX - 12, 26, PZ1 - 12, PX + 12, 30, PZ2 + 12, stone2, false);
    // niveaux 2 et 3
    box(-280, 30, -170, 280, 62, 170, stone2);
    box(-180, 62, -110, 180, 92, 110, stone);
    const bands: [number, number, number, number, number][] = [
      [-PX - 12, 30, PZ1 - 12, PX + 12, 31.2],
      [-281, 62, -171, 281, 63.2],
      [-181, 92, -111, 181, 93.2]
    ];
    for (const [x1, y1, z1, x2, y2] of bands) box(x1, y1, z1, x2, y2, -z1, gold, false);
    // dômes d'or
    dome(95, gold, 0, 93, 0);
    for (const [dx, dz] of [[-230, -130], [230, -130], [-230, 130], [230, 130]]) {
      cyl(30, 10, stone, dx, 62, dz, 32, 30, false);
      dome(30, gold, dx, 72, dz);
    }
    // tours d'angle (240 m) et flèche centrale (480 m)
    for (const [tx, tz] of [[-410, -260], [410, -260], [-410, 260], [410, 260]]) {
      cyl(24, 240, stone, tx, 0, tz, 32, 18);
      cyl(20, 50, gold, tx, 240, tz, 32, 1, false);
      const b = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 12), glowGold);
      b.position.copy(W(tx, 294, tz));
      r.add(b);
    }
    cyl(10, 300, gold, 0, 185, 0, 24, 2, false);
    const jewel = new THREE.Mesh(new THREE.OctahedronGeometry(14), new THREE.MeshStandardMaterial({ color: 0x0a1a3a, emissive: 0x3fa8ff, emissiveIntensity: 2.2, metalness: 0.9, roughness: 0.1 }));
    jewel.scale.set(1, 1.6, 1);
    jewel.position.copy(W(0, 505, 0));
    r.add(jewel);
    // escalier d'honneur et grande porte
    for (let k = 0; k < 4; k++) box(-30, 0, PZ1 - 26 + k * 5, 30, 0.6 + k * 0.0, PZ1 - 21 + k * 5, marble, false);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(14, 9), new THREE.MeshStandardMaterial({ color: 0x0a1a2a, emissive: 0xffc861, emissiveIntensity: 0.5, transparent: true, opacity: 0.55 }));
    door.position.copy(W(0, 4.5, PZ1 - 0.6));
    r.add(door);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(90, 12), new THREE.MeshBasicMaterial({ map: signTex("♛  PALAIS IMPÉRIAL  ♛", "#ffd27a", "#0b1a3a") }));
    sign.position.copy(W(0, 20, PZ1 - 12.5));
    sign.rotation.y = Math.PI;
    r.add(sign);

    // ================================================================ INTÉRIEUR AMÉNAGÉ
    this.buildInterior(W, solid, add, IX, IZ1, IZ2, IH);

    // ================================================================ aire du Royal Talon, accès
    this.pad.copy(W(560, 0.4, -700));
    cyl(62, 0.4, new THREE.MeshStandardMaterial({ color: 0x2a2e38, metalness: 0.5, roughness: 0.5 }), 560, 0, -700, 64);
    const ring = new THREE.Mesh(new THREE.RingGeometry(58, 61, 96), glowGold);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(W(560, 0.45, -700));
    r.add(ring);
    this.front.copy(W(0, 0.3, -320));

    G.world.markers.push({ id: "imperial", name: "Palais Impérial", pos: W(0, 0, 0), icon: "♛", visible: () => true });
    G.interact.add({
      id: "imperial-cloak",
      pos: W(0, 1, -170),
      radius: 8,
      label: () => (this.stealth ? "✨ Rendre le palais visible" : "👁‍🗨 Rendre le palais furtif"),
      action: () => this.setStealth(!this.stealth)
    });
    const centre = W(0, 0, 0);
    G.palace.updaters.push((dt, t) => {
      r.visible = G.camera.position.distanceTo(centre) < 11000;
      if (!r.visible) return;
      jewel.rotation.y += dt * 0.5;
      jewel.position.y = Y + 505 + Math.sin(t * 0.8) * 4;
      this.updateSweep(dt);
    });
  }

  // ---------------------------------------------------------------- intérieur
  private buildInterior(
    W: (x: number, y: number, z: number) => THREE.Vector3,
    solid: (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) => void,
    add: (o: THREE.Object3D) => THREE.Object3D,
    IX: number,
    IZ1: number,
    IZ2: number,
    IH: number
  ) {
    const r = this.root;
    const C = W(0, 0, 0);
    const wall = new THREE.MeshStandardMaterial({ color: 0xf6f1e8, roughness: 0.6 });
    const floorM = new THREE.MeshStandardMaterial({ color: 0xe8dcc8, roughness: 0.18, metalness: 0.1 });
    const flr = new THREE.Mesh(new THREE.PlaneGeometry(IX * 2, IZ2 - IZ1), floorM);
    flr.rotation.x = -Math.PI / 2;
    flr.position.copy(W(0, 0.08, (IZ1 + IZ2) / 2));
    r.add(flr);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(IX * 2, IZ2 - IZ1), new THREE.MeshStandardMaterial({ color: 0xfaf6ee, side: THREE.DoubleSide }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.copy(W(0, IH - 0.05, (IZ1 + IZ2) / 2));
    r.add(ceil);
    const g = new THREE.Group();
    g.position.copy(C);
    r.add(g);
    // murs extérieurs du bloc (porte principale au sud) — les murs sont construits en coordonnées monde
    const X = (x: number) => C.x + x,
      Zz = (z: number) => C.z + z,
      Y0 = C.y;
    const D = (c: number, w = 4) => ({ c, w, h: 4.2 });
    wallX(r, Zz(IZ1), X(-IX), X(IX), Y0, IH, wall, [D(X(0), 10)]);
    wallX(r, Zz(IZ2), X(-IX), X(IX), Y0, IH, wall, []);
    wallZ(r, X(-IX), Zz(IZ1), Zz(IZ2), Y0, IH, wall, []);
    wallZ(r, X(IX), Zz(IZ1), Zz(IZ2), Y0, IH, wall, []);
    // couloirs : est-ouest (z −140…−130) et (z −80…−72)
    // rangée sud (z −230…−140) : cinéma | salon | HALL | banquet | cuisine
    wallX(r, Zz(-140), X(-IX), X(IX), Y0, IH, wall, [D(X(-105)), D(X(-50)), D(X(0), 10), D(X(50)), D(X(105))]);
    for (const x of [-80, -20, 20, 80]) wallZ(r, X(x), Zz(IZ1), Zz(-140), Y0, IH, wall, []);
    // rangée centrale (z −130…−80) : spa/piscine | SALLE DU TRÔNE | bibliothèque
    wallX(r, Zz(-130), X(-IX), X(IX), Y0, IH, wall, [D(X(-90)), D(X(0), 10), D(X(90))]);
    wallX(r, Zz(-80), X(-IX), X(IX), Y0, IH, wall, [D(X(-90)), D(X(0), 6), D(X(90))]);
    for (const x of [-50, 50]) wallZ(r, X(x), Zz(-130), Zz(-80), Y0, IH, wall, []);
    // rangée nord (z −72…−30) : 6 chambres dont la suite royale
    wallX(r, Zz(-72), X(-IX), X(IX), Y0, IH, wall, [D(X(-112)), D(X(-77)), D(X(-20), 6), D(X(40)), D(X(77)), D(X(112))]);
    for (const x of [-95, -60, 20, 60, 95]) wallZ(r, X(x), Zz(-72), Zz(IZ2), Y0, IH, wall, []);

    const F = (kind: Parameters<typeof furniture>[0], x: number, z: number, ry = 0, s = 1.4) => g.add(furniture(kind, x, 0, z, ry, s));
    const B = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, m: THREE.Material, isSolid = true) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(x2 - x1, y2 - y1, z2 - z1), m);
      b.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
      b.castShadow = b.receiveShadow = true;
      g.add(b);
      if (isSolid) solid(x1, y1, z1, x2, y2, z2);
      return b;
    };
    const label = (text: string, x: number, z: number) => {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.6), new THREE.MeshBasicMaterial({ map: signTex(text, "#5a3a10", "#f6ecd8") }));
      s.position.set(x, 7.6, z);
      s.rotation.y = Math.PI;
      g.add(s);
    };
    const chand = (x: number, z: number) => {
      const c = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.18, 8, 32), mat.glowGold);
      c.rotation.x = Math.PI / 2;
      c.position.set(x, IH - 1.6, z);
      g.add(c);
    };
    const carpet = (x1: number, z1: number, x2: number, z2: number, color: number) => {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(x2 - x1, z2 - z1), new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
      c.rotation.x = -Math.PI / 2;
      c.position.set((x1 + x2) / 2, 0.12, (z1 + z2) / 2);
      g.add(c);
    };
    // tableaux encadrés (paysages du royaume)
    const painting = (x: number, z: number, tint: number, ry = Math.PI) => {
      const fr = new THREE.Mesh(new THREE.BoxGeometry(5.4, 3.6, 0.15), mat.gold);
      fr.position.set(x, 4.6, z);
      fr.rotation.y = ry;
      const cvs = document.createElement("canvas");
      cvs.width = 256;
      cvs.height = 160;
      const c2 = cvs.getContext("2d")!;
      const grd = c2.createLinearGradient(0, 0, 0, 160);
      grd.addColorStop(0, "#" + new THREE.Color(tint).offsetHSL(0, 0, 0.35).getHexString());
      grd.addColorStop(1, "#f6d8a0");
      c2.fillStyle = grd;
      c2.fillRect(0, 0, 256, 160);
      c2.fillStyle = "#" + new THREE.Color(tint).getHexString();
      c2.beginPath();
      c2.moveTo(0, 130);
      for (let k = 0; k <= 8; k++) c2.lineTo(k * 32, 90 + Math.sin(k * 1.7 + tint) * 30);
      c2.lineTo(256, 160);
      c2.lineTo(0, 160);
      c2.fill();
      c2.fillStyle = "#fff6d8";
      c2.beginPath();
      c2.arc(190, 45, 18, 0, Math.PI * 2);
      c2.fill();
      const tx = new THREE.CanvasTexture(cvs);
      tx.colorSpace = THREE.SRGBColorSpace;
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(5, 3.2), new THREE.MeshBasicMaterial({ map: tx }));
      pic.position.set(0, 0, 0.09);
      fr.add(pic);
      g.add(fr);
    };
    const darkM = new THREE.MeshStandardMaterial({ color: 0x1a1c24, roughness: 0.4, metalness: 0.3 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xc8ccd4, metalness: 0.9, roughness: 0.25 });
    const wood = mat.wood;
    const white = new THREE.MeshStandardMaterial({ color: 0xf6f6f6, roughness: 0.3 });

    // ---- HALL D'ENTRÉE
    carpet(-6, -228, 6, -142, 0x8a1f1a);
    F("fontaine", 0, -190, 0, 2.2);
    F("statue", -14, -215, 0, 1.6);
    F("statue", 14, -215, 0, 1.6);
    for (const z of [-220, -195, -165]) for (const x of [-17, 17]) F("colonne", x, z, 0, 1.6);
    chand(0, -170);
    chand(0, -210);
    // ---- SALON
    label("SALON", -50, -141);
    carpet(-75, -200, -25, -160, 0x1b2a4a);
    F("canape", -50, -185, 0, 1.4);
    F("canape", -62, -172, Math.PI / 2, 1.4);
    F("canape", -38, -172, -Math.PI / 2, 1.4);
    F("table", -50, -172, 0, 0.6);
    F("tele", -50, -158, Math.PI, 1.6);
    F("piano", -72, -215, 0.4, 1.3);
    F("aquarium", -30, -222, 0, 1.6);
    F("bibliotheque", -77, -195, Math.PI / 2, 1.4);
    F("lampe", -70, -160, 0, 1.4);
    F("plante", -25, -150, 0, 1.6);
    F("tapis", -50, -172, 0, 2.4);
    F("lampe", -30, -195, 0, 1.4);
    painting(-50, -229.3, 0x1e3a8a, 0);
    painting(-79.4, -175, 0x1f6b4a, -Math.PI / 2);
    chand(-50, -185);
    // ---- CINÉMA
    label("CINÉMA", -105, -141);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(40, 6), new THREE.MeshBasicMaterial({ map: signTex("🎬  CINÉMA IMPÉRIAL", "#ffffff", "#2a0a3a") }));
    screen.position.set(-105, 5, -229.4);
    g.add(screen);
    for (let row = 0; row < 4; row++) for (let k = 0; k < 6; k++) B(-127 + k * 7.5, 0, -215 + row * 15, -122 + k * 7.5, 1 + row * 0.3, -211 + row * 15, new THREE.MeshStandardMaterial({ color: 0x8a1f2a, roughness: 0.9 }), false);
    // ---- SALLE DE BANQUET
    label("SALLE DE BANQUET", 50, -141);
    B(35, 0.85, -220, 65, 1, -150, wood, true);
    for (let z = -215; z < -150; z += 5) for (const x of [32, 68]) B(x - 0.8, 0, z - 0.8, x + 0.8, 1.6, z + 0.8, new THREE.MeshStandardMaterial({ color: 0x5a1f3a }), false);
    for (let z = -210; z < -150; z += 15) F("lampe", 50, z, 0, 0.5);
    chand(50, -200);
    chand(50, -165);
    // ---- GRANDE CUISINE
    label("CUISINE IMPÉRIALE", 105, -141);
    B(81, 0, -229, 129, 1, -226, white); // plans de travail (fond)
    B(81, 1, -229, 129, 1.08, -226, darkM, false);
    B(126, 0, -225, 129, 1, -150, white); // plan latéral
    B(126, 1, -225, 129, 1.08, -150, darkM, false);
    B(95, 0, -200, 115, 1, -185, white); // îlot central
    B(94.5, 1, -200.5, 115.5, 1.1, -184.5, new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.15, metalness: 0.2 }), false);
    for (const x of [86, 94, 102]) {
      B(x, 0, -229, x + 6, 1.02, -226.5, steel, false); // fours
      for (const dx of [1.5, 4.5]) for (const dz of [-228.2, -227.2]) {
        const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 16), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff3a10, emissiveIntensity: 0.6 }));
        burner.position.set(x + dx, 1.1, dz);
        g.add(burner);
      }
      B(x, 4, -229, x + 6, 5, -226, steel, false); // hottes
    }
    for (const x of [110, 116, 122]) B(x, 0, -229, x + 5, 3.4, -226.6, steel); // frigos
    B(126, 2.6, -225, 129, 3.6, -150, wood, false); // étagères
    for (let z = -222; z < -152; z += 4) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.45, 0.6, 14), steel);
      pot.position.set(127.5, 3.9, z);
      g.add(pot);
    }
    // deuxième îlot avec tabourets, cave à vin, machine à café, fruits
    B(95, 0, -175, 115, 1, -168, white);
    B(94.5, 1, -175.5, 115.5, 1.1, -167.5, new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.3 }), false);
    for (let k = 0; k < 6; k++) {
      const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.25, 1.1, 14), steel);
      stool.position.set(97 + k * 3.3, 0.55, -166);
      g.add(stool);
    }
    B(81, 0, -170, 83, 3.4, -150, new THREE.MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.4 })); // cave à vin
    for (let k = 0; k < 18; k++) {
      const bt = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8), new THREE.MeshStandardMaterial({ color: [0x4a0a1a, 0x1a3a1a, 0xd8c070][k % 3], roughness: 0.2 }));
      bt.rotation.z = Math.PI / 2;
      bt.position.set(83.2, 0.6 + (k % 6) * 0.5, -168 + Math.floor(k / 6) * 6);
      g.add(bt);
    }
    B(122, 1.08, -200, 124, 1.9, -198, darkM, false); // machine à café
    for (let k = 0; k < 7; k++) {
      const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), new THREE.MeshStandardMaterial({ color: [0xe67e22, 0xc0392b, 0xf1c40f, 0x27ae60, 0x8e44ad, 0xe74c3c, 0xf39c12][k] }));
      fruit.position.set(103 + Math.cos(k) * 0.9, 1.35, -171 + Math.sin(k) * 0.9);
      g.add(fruit);
    }
    F("plante", 84, -145, 0, 1.6);
    F("plante", 126, -145, 0, 1.6);
    painting(105, -140.7, 0xd8a12a);
    const sink = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 2), steel);
    sink.position.set(105, 1.05, -192.5);
    g.add(sink);
    for (const [x, z] of [[85, -165], [100, -160], [115, -165]]) {
      B(x - 2, 0.85, z - 2, x + 2, 0.95, z + 2, wood, true); // tables du petit-déjeuner
    }
    G.interact.add({
      id: "imperial-kitchen",
      pos: W(105, 1, -205),
      radius: 9,
      label: () => "🍳 Cuisiner un repas impérial",
      action: () => {
        const meals = ["un thieboudienne royal", "un mafé au poulet", "des pastels et alloco", "un couscous royal", "un festin de brochettes et fruits", "des crêpes au chocolat"];
        bus.emit("toast", { text: `🍳 Le chef impérial vous prépare ${meals[Math.floor(Math.random() * meals.length)]}. Bon appétit, Majesté !` });
        G.audio.confirm();
      }
    });
    // ---- SPA & PISCINE INTÉRIEURE
    label("SPA & PISCINE", -90, -131);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(50, 26), new THREE.MeshStandardMaterial({ color: 0x2ab0e8, roughness: 0.05, emissive: 0x0a4a6a, emissiveIntensity: 0.5, transparent: true, opacity: 0.85 }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(-90, 0.2, -105);
    g.add(pool);
    for (let k = 0; k < 5; k++) B(-122 + k * 7, 0, -127, -117 + k * 7, 0.5, -124, new THREE.MeshStandardMaterial({ color: 0xf2c8d6 }), false);
    F("plante", -125, -85, 0, 1.6);
    F("plante", -55, -85, 0, 1.6);
    // ---- SALLE DU TRÔNE
    label("SALLE DU TRÔNE", 0, -131);
    carpet(-5, -129, 5, -84, 0x8a1f1a);
    B(-12, 0, -92, 12, 1.2, -82, new THREE.MeshStandardMaterial({ color: 0xd8b25a, metalness: 0.6, roughness: 0.3 }));
    F("trone", 0, -86, Math.PI, 2.2);
    for (const z of [-125, -112, -99]) for (const x of [-30, 30]) F("colonne", x, z, 0, 1.6);
    for (const x of [-46, 46]) F("drapeau", x, -100, 0, 1.6);
    chand(0, -115);
    chand(0, -95);
    G.interact.add({ id: "imperial-throne", pos: W(0, 1.2, -94), radius: 5, label: () => "👑 S'asseoir sur le trône impérial", action: () => G.player.sit(W(0, 1.2 + 1.2, -85), Math.PI) });
    // ---- BIBLIOTHÈQUE & SALON DE MUSIQUE
    label("BIBLIOTHÈQUE", 90, -131);
    for (const z of [-126, -110, -94]) F("bibliotheque", 128, z, -Math.PI / 2, 1.5);
    for (const x of [60, 75]) F("bibliotheque", x, -128, 0, 1.5);
    F("piano", 80, -100, -0.5, 1.4);
    F("canape", 100, -95, Math.PI, 1.4);
    F("lampe", 115, -88, 0, 1.4);
    carpet(70, -115, 120, -85, 0x2a4a2a);
    // ---- CHAMBRES (dont la suite royale)
    const bedroom = (x1: number, x2: number, name: string, color: number, royal = false) => {
      const cx = (x1 + x2) / 2;
      label(name, cx, -73);
      carpet(x1 + 4, -66, x2 - 4, -36, color);
      F("lit", cx, -38, Math.PI, royal ? 2.6 : 2.0);
      F("table", x2 - 6, -52, Math.PI / 2, 0.7); // bureau
      F("lampe", x2 - 4, -48, 0, 0.7);
      F("bibliotheque", x1 + 2, -62, Math.PI / 2, 1.2);
      F("plante", x1 + 3, -36, 0, 1.4);
      painting(cx, -30.6, color);
      painting(x1 + 0.6, -55, color, Math.PI / 2);
      F("lampe", cx - (royal ? 9 : 6), -36, 0, 0.9);
      F("lampe", cx + (royal ? 9 : 6), -36, 0, 0.9);
      F("bibliotheque", x1 + 2, -50, Math.PI / 2, 1.2); // armoire / dressing
      F("canape", cx, -62, 0, royal ? 1.4 : 1.1);
      F("tele", cx, -70.5, 0, royal ? 1.4 : 1);
      F("plante", x2 - 3, -68, 0, 1.2);
      if (royal) {
        F("statue", x1 + 6, -68, 0, 1.2);
        F("aquarium", x2 - 6, -45, -Math.PI / 2, 1.4);
        // salle de bain de la suite
        const tub = new THREE.Mesh(new THREE.BoxGeometry(8, 1.2, 4), white);
        tub.position.set(x2 - 8, 0.6, -60);
        g.add(tub);
        const bw = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 3.4), new THREE.MeshStandardMaterial({ color: 0x5ac8f0, emissive: 0x0a3a5a, emissiveIntensity: 0.4 }));
        bw.rotation.x = -Math.PI / 2;
        bw.position.set(x2 - 8, 1.21, -60);
        g.add(bw);
        chand(cx, -50);
      }
      G.interact.add({
        id: `imperial-bed-${name}`,
        pos: W(cx, 1, -46),
        radius: royal ? 6 : 4.5,
        label: () => `😴 Dormir — ${name}`,
        action: () => {
          bus.emit("fade");
          G.env.setHour(8);
          G.player.sit(W(cx, 1.6, -40), Math.PI);
          bus.emit("toast", { text: `😴 Nuit paisible dans ${name}… ☀️ Bonjour, Majesté !` });
        }
      });
    };
    bedroom(-130, -95, "Chambre Émeraude", 0x1f6b4a);
    bedroom(-95, -60, "Chambre Saphir", 0x1e3a8a);
    bedroom(-60, 20, "Suite Royale", 0x6a1f3a, true);
    bedroom(20, 60, "Chambre Rubis", 0x8a1f2a);
    bedroom(60, 95, "Chambre Améthyste", 0x5a2a8a);
    bedroom(95, 130, "Chambre Or", 0x8a6a1a);
    // éclairage intérieur
    G.palace.zones.push({
      contains: (p) => Math.abs(p.x - C.x) < IX && p.z > C.z + IZ1 && p.z < C.z + IZ2 && p.y < C.y + IH + 2 && p.y > C.y - 5,
      lights: [
        { pos: W(0, 8, -185), color: 0xfff0d8, intensity: 90, distance: 60 },
        { pos: W(-60, 8, -185), color: 0xfff0d8, intensity: 70, distance: 50 },
        { pos: W(80, 8, -185), color: 0xfff0d8, intensity: 70, distance: 50 },
        { pos: W(0, 8, -105), color: 0xffd8a0, intensity: 90, distance: 60 },
        { pos: W(-80, 8, -50), color: 0xffe8d0, intensity: 70, distance: 60 },
        { pos: W(60, 8, -50), color: 0xffe8d0, intensity: 70, distance: 60 }
      ]
    });
    void add;
  }

  // ---------------------------------------------------------------- mode furtif du palais
  /** Vague d'invisibilité d'ouest en est sur tout le palais (environ 4 s). */
  setStealth(on: boolean) {
    if (on === this.stealth || this.sweep) return;
    this.stealth = on;
    const parts: { m: THREE.Mesh; x: number }[] = [];
    const c = new THREE.Vector3();
    const box = new THREE.Box3();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.userData.fx) return;
      if ((m as any).isInstancedMesh) c.copy(this.root.position).setX(IMPERIAL.x + (Math.random() - 0.5) * 2600);
      else box.setFromObject(m).getCenter(c);
      if (on) this.originals.set(m, m.material);
      parts.push({ m, x: c.x });
    });
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(3200, 700),
      new THREE.MeshBasicMaterial({ color: on ? 0x7fdcff : 0xffd27a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    wall.rotation.y = Math.PI / 2;
    wall.userData.fx = true;
    this.root.add(wall);
    this.sweep = { on, t: 0, parts, wall };
    G.audio.whoosh(3, on ? 2400 : 120, on ? 100 : 2400, 0.3);
    bus.emit("cloak:fx", on);
    bus.emit("shake", 0.4);
    bus.emit("toast", { text: on ? "👁‍🗨 Le Palais Impérial devient furtif… il disparaît du paysage." : "✨ Le Palais Impérial réapparaît dans toute sa splendeur." });
  }

  private updateSweep(dt: number) {
    const s = this.sweep;
    if (!s) return;
    s.t += dt;
    const k = Math.min(1, s.t / 4);
    const x = IMPERIAL.x - 1500 + 3000 * k;
    s.wall.position.set(x, IMPERIAL.y + 250, IMPERIAL.z);
    (s.wall.material as THREE.MeshBasicMaterial).opacity = 0.35 * (1 - Math.max(0, k - 0.9) * 10);
    const cloak = cloakMaterial();
    for (const p of s.parts) {
      if (p.x > x) continue;
      if (s.on) p.m.material = cloak;
      else if (this.originals.has(p.m)) p.m.material = this.originals.get(p.m)!;
    }
    if (k >= 1) {
      this.root.remove(s.wall);
      s.wall.geometry.dispose();
      if (!s.on) this.originals.clear();
      this.sweep = null;
    }
  }
}

function signTex(text: string, fg: string, bg: string) {
  const cv = document.createElement("canvas");
  cv.width = 1024;
  cv.height = 160;
  const c = cv.getContext("2d")!;
  c.fillStyle = bg;
  c.fillRect(0, 0, 1024, 160);
  c.fillStyle = fg;
  c.font = "bold 72px Georgia, serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(text, 512, 84);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
