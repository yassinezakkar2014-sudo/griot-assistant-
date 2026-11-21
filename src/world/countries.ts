// LES PAYS DU GRAND MONDE — chaque pays a sa capitale : un palais dans son style, une ville
// (maisons instanciées, avenues, place et monument), des arbres et une aire d'atterrissage.
// Tout est généré, original, et n'est affiché qu'à proximité pour rester fluide sur iPad.
import * as THREE from "three";
import { G } from "../core";
import { mat } from "./materials";
import { COUNTRIES, type CountryDef } from "./countryData";

interface Pal {
  wall: number[];
  roof: number;
  accent: number;
  glow: number;
}

const PALETTES: Record<CountryDef["style"], Pal> = {
  desert: { wall: [0xd9b27a, 0xc99a5e, 0xe6c896], roof: 0xe8d2a6, accent: 0x2a8a8a, glow: 0xffb050 },
  snow: { wall: [0x6a4a32, 0x7a5638, 0x8a6a4a], roof: 0x3a3f4a, accent: 0xc0392b, glow: 0xffd28a },
  jade: { wall: [0xe8e0cc, 0xd8ccb0, 0xc8b89a], roof: 0x1f6b4a, accent: 0xc0392b, glow: 0xffc861 },
  ocean: { wall: [0xf4f6f8, 0xe8eef2, 0xffffff], roof: 0x1f5fae, accent: 0x1f5fae, glow: 0x7fd8ff },
  volcano: { wall: [0x2a2626, 0x3a3434, 0x221e1e], roof: 0x141212, accent: 0xff5a1a, glow: 0xff6a20 },
  forest: { wall: [0x6a4a2e, 0x5a3e26, 0x7a5a3a], roof: 0x2f5a2a, accent: 0xd8b25a, glow: 0xb8ff8a },
  pyramid: { wall: [0xe0c08a, 0xd4b078, 0xc8a26a], roof: 0xd8b25a, accent: 0x1f4a8a, glow: 0xffd27a },
  crystal: { wall: [0xb8c8f0, 0xd0b8f0, 0xa8e0f0], roof: 0xffffff, accent: 0x8a5cff, glow: 0x9fd8ff },
  redhills: { wall: [0xb5653e, 0xa4552f, 0xc4774c], roof: 0x8a3a22, accent: 0xf1c40f, glow: 0xffa04a },
  savanna: { wall: [0xb8865a, 0xa8764a, 0xc8966a], roof: 0xc8a050, accent: 0x1f6b4a, glow: 0xffb050 }
};

export interface CountryInfo {
  def: CountryDef;
  front: THREE.Vector3;
  pad: THREE.Vector3;
}

export function buildCountries(): CountryInfo[] {
  return COUNTRIES.map((c) => buildCountry(c));
}

function std(color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...o });
}

function buildCountry(c: CountryDef): CountryInfo {
  const root = new THREE.Group();
  G.scene.add(root);
  const pal = PALETTES[c.style];
  const ground = (x: number, z: number) => G.physics.terrain(x, z);
  const cx = c.x,
    cz = c.z;
  const y0 = ground(cx, cz);
  let seed = Math.floor(Math.abs(cx * 7 + cz * 13)) % 2147483646 || 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const walls = pal.wall.map((w) => std(w));
  const roofM = std(pal.roof, { roughness: 0.6 });
  const accentM = std(pal.accent, { roughness: 0.4, metalness: 0.3 });
  const glowM = new THREE.MeshStandardMaterial({ color: 0, emissive: pal.glow, emissiveIntensity: 2 });

  const add = (m: THREE.Object3D) => {
    m.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = (o as THREE.Mesh).receiveShadow = true;
    });
    root.add(m);
    return m;
  };
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, solid = true) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y + h / 2, z);
    add(b);
    if (solid) G.physics.addBox({ x: x - w / 2, y, z: z - d / 2 }, { x: x + w / 2, y: y + h, z: z + d / 2 }, "country");
    return b;
  };
  const cyl = (r: number, h: number, m: THREE.Material, x: number, y: number, z: number, seg = 16, r2 = r, solid = true) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, h, seg), m);
    b.position.set(x, y + h / 2, z);
    add(b);
    if (solid) G.physics.addBox({ x: x - r * 0.8, y, z: z - r * 0.8 }, { x: x + r * 0.8, y: y + h, z: z + r * 0.8 }, "country");
    return b;
  };
  const cone = (r: number, h: number, m: THREE.Material, x: number, y: number, z: number, seg = 16) => {
    const k = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m);
    k.position.set(x, y + h / 2, z);
    if (seg === 4) k.rotation.y = Math.PI / 4;
    return add(k);
  };
  const dome = (r: number, m: THREE.Material, x: number, y: number, z: number) => {
    const d = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), m);
    d.position.set(x, y, z);
    return add(d);
  };

  // ---------------------------------------------------------------- socle + palais
  const W = 34,
    D = 26;
  box(W * 2 + 30, 2, D * 2 + 40, walls[2], cx, y0 - 1, cz + 4);
  const py = y0 + 1;
  const front = new THREE.Vector3(cx, py, cz - D - 22);
  switch (c.style) {
    case "desert": {
      box(W * 2, 24, D * 2, walls[0], cx, py, cz);
      cyl(16, 10, walls[1], cx, py + 24, cz, 32);
      dome(16, std(0xd8b25a, { metalness: 0.9, roughness: 0.25 }), cx, py + 34, cz);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        cyl(3.4, 58, walls[1], cx + sx * (W + 4), py, cz + sz * (D + 4), 12);
        dome(3.8, accentM, cx + sx * (W + 4), py + 58, cz + sz * (D + 4));
      }
      for (let k = -3; k <= 3; k++) box(4, 12, 0.6, glowM, cx + k * 9, py + 6, cz - D - 0.4, false);
      break;
    }
    case "snow": {
      box(W * 2, 18, D * 2, walls[0], cx, py, cz);
      // toit à deux pans (prisme triangulaire, faîte orienté est-ouest)
      const R = (D * 2 + 6) / Math.sqrt(3);
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(R, R, W * 2 + 6, 3).rotateX(-Math.PI / 2).rotateY(Math.PI / 2), roofM);
      roof.scale.set(1, 0.55, 1);
      roof.position.set(cx, py + 18 + R * 0.5 * 0.55, cz);
      add(roof);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        cyl(5, 40, walls[1], cx + sx * (W + 5), py, cz + sz * (D + 5), 12);
        cone(6.5, 18, roofM, cx + sx * (W + 5), py + 40, cz + sz * (D + 5), 12);
      }
      cone(8, 30, roofM, cx, py + 18 + D * 0.9, cz, 8);
      break;
    }
    case "jade": {
      for (let k = 0; k < 4; k++) {
        const s = 1 - k * 0.2;
        box(W * 2 * s, 12, D * 2 * s, walls[k % 3], cx, py + k * 15, cz);
        box(W * 2 * s + 14, 1.6, D * 2 * s + 14, roofM, cx, py + k * 15 + 12, cz, false);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) cone(1.4, 4, accentM, cx + sx * (W * s + 7), py + k * 15 + 12.5, cz + sz * (D * s + 7), 6);
      }
      cone(5, 16, std(0xd8b25a, { metalness: 0.9, roughness: 0.25 }), cx, py + 60, cz, 8);
      for (const sx of [-1, 1]) {
        for (let k = 0; k < 6; k++) {
          box(12 - k, 7, 12 - k, walls[0], cx + sx * (W + 26), py + k * 9, cz - D);
          box(18 - k, 1, 18 - k, roofM, cx + sx * (W + 26), py + k * 9 + 7, cz - D, false);
        }
      }
      break;
    }
    case "ocean": {
      box(W * 2, 20, D * 2, walls[0], cx, py, cz);
      dome(20, roofM, cx, py + 20, cz);
      for (const sx of [-1, 1]) {
        box(14, 30, 14, walls[1], cx + sx * (W + 10), py, cz - D + 7);
        dome(7, roofM, cx + sx * (W + 10), py + 30, cz - D + 7);
      }
      for (let k = -3; k <= 3; k++) cyl(1.2, 16, walls[2], cx + k * 9, py, cz - D - 6, 12);
      box(W * 2, 1.4, 10, walls[2], cx, py + 16, cz - D - 3, false);
      break;
    }
    case "volcano": {
      box(W * 2, 30, D * 2, walls[0], cx, py, cz);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        box(12, 62, 12, walls[1], cx + sx * (W + 2), py, cz + sz * (D + 2));
        cone(9, 22, walls[2], cx + sx * (W + 2), py + 62, cz + sz * (D + 2), 4);
      }
      for (let k = 0; k < 5; k++) box(W * 2 + 1, 0.6, 0.6, glowM, cx, py + 5 + k * 5.5, cz - D - 0.3, false);
      cone(18, 40, walls[2], cx, py + 30, cz, 4);
      break;
    }
    case "forest": {
      // palais lové autour d'un arbre colossal
      cyl(12, 150, std(0x4a3220, { roughness: 0.95 }), cx, py, cz, 20, 7);
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const s = new THREE.Mesh(new THREE.SphereGeometry(34 + rnd() * 10, 14, 10), std(0x2f6a2a, { roughness: 0.9 }));
        s.position.set(cx + Math.cos(a) * 34, py + 140 + rnd() * 26, cz + Math.sin(a) * 34);
        add(s);
      }
      const top = new THREE.Mesh(new THREE.SphereGeometry(44, 16, 12), std(0x356f2e, { roughness: 0.9 }));
      top.position.set(cx, py + 172, cz);
      add(top);
      for (const h of [20, 55, 90]) {
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(26, 26, 9, 24, 1, true), walls[0]);
        ring.position.set(cx, py + h + 4.5, cz);
        (ring.material as THREE.Material).side = THREE.DoubleSide;
        add(ring);
        const deck = new THREE.Mesh(new THREE.CylinderGeometry(28, 28, 1, 24), walls[1]);
        deck.position.set(cx, py + h, cz);
        add(deck);
        const roofR = new THREE.Mesh(new THREE.ConeGeometry(30, 8, 24, 1, true), roofM);
        roofR.position.set(cx, py + h + 13, cz);
        add(roofR);
      }
      box(W * 2, 12, D * 2, walls[0], cx, py, cz - 8);
      break;
    }
    case "pyramid": {
      for (let k = 0; k < 7; k++) box(110 - k * 15, 11, 110 - k * 15, walls[k % 3], cx, py + k * 11, cz + 30);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(10, 14, 4), std(0xd8b25a, { metalness: 1, roughness: 0.2 }));
      cap.rotation.y = Math.PI / 4;
      cap.position.set(cx, py + 77 + 7, cz + 30);
      add(cap);
      for (const sx of [-1, 1]) {
        const ob = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.4, 40, 4), walls[1]);
        ob.position.set(cx + sx * 22, py + 20, cz - 40);
        add(ob);
        G.physics.addBox({ x: cx + sx * 22 - 2, y: py, z: cz - 42 }, { x: cx + sx * 22 + 2, y: py + 40, z: cz - 38 }, "country");
        cone(1.4, 3, std(0xd8b25a, { metalness: 1, roughness: 0.2 }), cx + sx * 22, py + 40, cz - 40, 4);
      }
      box(40, 16, 20, walls[0], cx, py, cz - 18);
      break;
    }
    case "crystal": {
      const crys = new THREE.MeshPhysicalMaterial({ color: 0xbfd8ff, emissive: 0x6a7aff, emissiveIntensity: 0.5, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.85 });
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0, 14, 220, 6), crys);
      spire.position.set(cx, py + 110, cz);
      add(spire);
      G.physics.addBox({ x: cx - 10, y: py, z: cz - 10 }, { x: cx + 10, y: py + 120, z: cz + 10 }, "country");
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const h = 60 + rnd() * 60;
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0, 6 + rnd() * 4, h, 6), crys);
        p.position.set(cx + Math.cos(a) * 34, py + h / 2, cz + Math.sin(a) * 34);
        p.rotation.z = Math.cos(a) * 0.15;
        p.rotation.x = -Math.sin(a) * 0.15;
        add(p);
        G.physics.addBox({ x: p.position.x - 5, y: py, z: p.position.z - 5 }, { x: p.position.x + 5, y: py + h * 0.6, z: p.position.z + 5 }, "country");
      }
      box(W * 2, 14, D * 2, walls[0], cx, py, cz - 40);
      break;
    }
    case "redhills": {
      box(W * 2, 22, D * 2, walls[0], cx, py, cz);
      for (let k = -W; k <= W; k += 6) for (const sz of [-1, 1]) box(3, 3, 3, walls[1], cx + k, py + 22, cz + sz * D, false);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        cyl(7, 36, walls[1], cx + sx * W, py, cz + sz * D, 20);
        cone(8, 10, roofM, cx + sx * W, py + 36, cz + sz * D, 20);
      }
      box(16, 30, 16, walls[2], cx, py + 22, cz);
      break;
    }
    case "savanna": {
      cyl(30, 16, walls[0], cx, py, cz, 32);
      cone(40, 34, roofM, cx, py + 16, cz, 32);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + 0.3;
        const x = cx + Math.cos(a) * 52,
          z = cz + Math.sin(a) * 52;
        cyl(9, 8, walls[1], x, py, z, 20);
        cone(12, 12, roofM, x, py + 8, z, 20);
      }
      break;
    }
  }
  // porte d'honneur + mât au drapeau
  box(8, 11, 0.6, glowM, cx, py, front.z + 21.5, false);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 26, 8), mat.silver);
  pole.position.set(cx + 14, py + 13, front.z + 4);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(8, 5), new THREE.MeshStandardMaterial({ color: pal.accent, side: THREE.DoubleSide }));
  flag.position.set(cx + 18, py + 23.5, front.z + 4);
  add(pole);
  add(flag);
  G.palace.updaters.push((_dt, t) => {
    if (root.visible) flag.rotation.y = Math.sin(t * 2 + cx) * 0.25;
  });

  // ---------------------------------------------------------------- avenues + place
  const roadM = std(c.style === "crystal" ? 0x30344a : c.style === "volcano" ? 0x1a1414 : 0x8a7a62, { roughness: 0.95 });
  const L = c.r * 0.82;
  for (const [w, d, ox, oz] of [[16, L, 0, -L / 2 - 50], [16, L, 0, L / 2 + 50], [L, 16, -L / 2 - 50, 0], [L, 16, L / 2 + 50, 0]] as number[][]) {
    const n = 24;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n - 0.5;
      const x = cx + ox + (w > d ? t * w : 0),
        z = cz + oz + (d > w ? t * d : 0);
      const yy = Math.max(ground(x, z), 0) + 0.25;
      const hw = Math.min(w, d) / 2;
      if (w > d) pos.push(x, yy, z - hw, x, yy, z + hw);
      else pos.push(x - hw, yy, z, x + hw, yy, z);
      if (i) {
        const a = (i - 1) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const road = new THREE.Mesh(g, roadM);
    (road.material as THREE.Material).side = THREE.DoubleSide;
    road.receiveShadow = true;
    root.add(road);
  }
  // place + monument devant le palais
  const plaza = new THREE.Vector3(cx, 0, cz - D - 90);
  const plY = ground(plaza.x, plaza.z);
  const plz = new THREE.Mesh(new THREE.CylinderGeometry(30, 30, 0.5, 40), std(pal.wall[2], { roughness: 0.85 }));
  plz.position.set(plaza.x, plY + 0.1, plaza.z);
  add(plz);
  cyl(4, 3, walls[1], plaza.x, plY, plaza.z, 12);
  const monument = new THREE.Mesh(new THREE.OctahedronGeometry(3.4), glowM);
  monument.position.set(plaza.x, plY + 9, plaza.z);
  add(monument);
  G.palace.updaters.push((dt) => {
    if (root.visible) monument.rotation.y += dt * 0.8;
  });

  // ---------------------------------------------------------------- ville (maisons instanciées)
  type H = { x: number; z: number; w: number; d: number; h: number; y: number; c: number };
  const houses: H[] = [];
  const target = c.style === "crystal" ? 220 : 300;
  const rMax = c.r * 0.42;
  for (let tries = 0; tries < 6000 && houses.length < target; tries++) {
    const a = rnd() * Math.PI * 2,
      r = 95 + Math.pow(rnd(), 0.75) * (rMax - 95);
    const x = cx + Math.cos(a) * r,
      z = cz + Math.sin(a) * r;
    if (Math.abs(x - cx) < 14 || Math.abs(z - cz) < 14) continue; // avenues
    if (Math.hypot(x - plaza.x, z - plaza.z) < 40) continue;
    if (Math.hypot(x - (cx + 120), z - (cz + 120)) < 55) continue; // aire d'atterrissage
    const big = c.style === "crystal" ? rnd() < 0.35 : rnd() < 0.06;
    const w = big ? 14 + rnd() * 10 : 7 + rnd() * 8,
      d = big ? 14 + rnd() * 10 : 7 + rnd() * 8;
    if (houses.some((h) => Math.abs(h.x - x) < (h.w + w) / 2 + 4 && Math.abs(h.z - z) < (h.d + d) / 2 + 4)) continue;
    const y = ground(x, z);
    if (y < 0.5) continue;
    const h = c.style === "crystal" ? (big ? 50 + rnd() * 110 : 14 + rnd() * 26) : big ? 16 + rnd() * 14 : 4.5 + rnd() * 5;
    houses.push({ x, z, w, d, h, y, c: Math.floor(rnd() * 3) });
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const round = c.style === "savanna";
  const bodyGeo = round ? new THREE.CylinderGeometry(0.5, 0.5, 1, 16) : new THREE.BoxGeometry(1, 1, 1);
  const crystalHouse = c.style === "crystal" ? new THREE.MeshPhysicalMaterial({ color: 0xc8d8ff, emissive: 0x4a5aff, emissiveIntensity: 0.35, metalness: 0.2, roughness: 0.08 }) : null;
  for (let ci = 0; ci < 3; ci++) {
    const list = houses.filter((h) => h.c === ci);
    const inst = new THREE.InstancedMesh(bodyGeo, crystalHouse ?? walls[ci], list.length);
    list.forEach((h, i) => {
      m4.compose(new THREE.Vector3(h.x, h.y + h.h / 2 - 1, h.z), q, new THREE.Vector3(h.w, h.h + 2, h.d));
      inst.setMatrixAt(i, m4);
    });
    inst.castShadow = inst.receiveShadow = true;
    root.add(inst);
  }
  for (const h of houses) G.physics.addBox({ x: h.x - h.w / 2, y: h.y - 2, z: h.z - h.d / 2 }, { x: h.x + h.w / 2, y: h.y + h.h, z: h.z + h.d / 2 }, "house");
  // toits selon le style
  let roofGeo: THREE.BufferGeometry | null = null;
  let roofKind: "cone" | "dome" | "eave" | "spike" | null = null;
  if (c.style === "snow" || c.style === "forest") (roofGeo = new THREE.ConeGeometry(0.75, 1, 4).rotateY(Math.PI / 4)), (roofKind = "cone");
  else if (c.style === "savanna") (roofGeo = new THREE.ConeGeometry(0.7, 1, 16)), (roofKind = "cone");
  else if (c.style === "ocean" || c.style === "desert") (roofGeo = new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)), (roofKind = "dome");
  else if (c.style === "jade") (roofGeo = new THREE.BoxGeometry(1, 1, 1)), (roofKind = "eave");
  else if (c.style === "crystal") (roofGeo = new THREE.ConeGeometry(0.6, 1, 6)), (roofKind = "spike");
  if (roofGeo) {
    const list = roofKind === "dome" ? houses.filter((_, i) => i % 3 === 0) : houses;
    const inst = new THREE.InstancedMesh(roofGeo, roofKind === "spike" ? glowM : roofM, list.length);
    list.forEach((h, i) => {
      const s = Math.min(h.w, h.d);
      if (roofKind === "cone") m4.compose(new THREE.Vector3(h.x, h.y + h.h + s * 0.3, h.z), q, new THREE.Vector3(h.w * 1.05, s * 0.6, h.d * 1.05));
      else if (roofKind === "dome") m4.compose(new THREE.Vector3(h.x, h.y + h.h, h.z), q, new THREE.Vector3(s * 0.8, s * 0.6, s * 0.8));
      else if (roofKind === "eave") m4.compose(new THREE.Vector3(h.x, h.y + h.h + 0.3, h.z), q, new THREE.Vector3(h.w + 3, 0.6, h.d + 3));
      else m4.compose(new THREE.Vector3(h.x, h.y + h.h + 3, h.z), q, new THREE.Vector3(s * 0.4, 6, s * 0.4));
      inst.setMatrixAt(i, m4);
    });
    root.add(inst);
  }
  // fenêtres lumineuses (la nuit)
  const win = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x1a120a, emissive: pal.glow, emissiveIntensity: 0.8, side: THREE.DoubleSide }), houses.length);
  houses.forEach((h, i) => {
    const toward = Math.atan2(cx - h.x, cz - h.z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), toward);
    const off = new THREE.Vector3(Math.sin(toward), 0, Math.cos(toward)).multiplyScalar(Math.max(h.w, h.d) / 2 + 0.1);
    m4.compose(new THREE.Vector3(h.x, h.y + Math.min(h.h * 0.6, 3), h.z).add(off), q, new THREE.Vector3(1.4, 1.4, 1));
    win.setMatrixAt(i, m4);
  });
  q.identity();
  root.add(win);

  // ---------------------------------------------------------------- arbres
  const treeN = c.style === "forest" ? 900 : c.style === "desert" || c.style === "pyramid" ? 120 : c.style === "volcano" || c.style === "crystal" ? 60 : 380;
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.5, 1, 6), std(0x4a3220), treeN);
  const leafGeo = c.style === "snow" ? new THREE.ConeGeometry(1, 1, 7) : c.style === "desert" || c.style === "pyramid" || c.style === "ocean" ? new THREE.ConeGeometry(1, 0.3, 7) : new THREE.IcosahedronGeometry(1, 0);
  const leafCol = c.style === "snow" ? 0x1f4a32 : c.style === "volcano" ? 0x3a3a2a : c.style === "savanna" ? 0x6a7a2a : c.style === "crystal" ? 0x9fd8ff : 0x2f6a2a;
  const leaves = new THREE.InstancedMesh(leafGeo, std(leafCol, { flatShading: true, roughness: 0.9 }), treeN);
  let tn = 0;
  for (let tries = 0; tries < treeN * 6 && tn < treeN; tries++) {
    const a = rnd() * Math.PI * 2,
      r = 60 + rnd() * c.r * 0.68;
    const x = cx + Math.cos(a) * r,
      z = cz + Math.sin(a) * r;
    if (Math.abs(x - cx) < 12 || Math.abs(z - cz) < 12) continue;
    const y = ground(x, z);
    if (y < 1 || y > 360) continue;
    if (houses.some((h) => Math.abs(h.x - x) < h.w / 2 + 3 && Math.abs(h.z - z) < h.d / 2 + 3)) continue;
    const s = c.style === "forest" ? 2.5 + rnd() * 3.5 : 0.8 + rnd() * 1.2;
    m4.compose(new THREE.Vector3(x, y + 3 * s, z), q, new THREE.Vector3(s, 6 * s, s));
    trunk.setMatrixAt(tn, m4);
    m4.compose(new THREE.Vector3(x, y + 6 * s + 2 * s, z), q, new THREE.Vector3(3.2 * s, (c.style === "snow" ? 7 : 3.2) * s, 3.2 * s));
    leaves.setMatrixAt(tn, m4);
    tn++;
  }
  trunk.count = leaves.count = tn;
  trunk.castShadow = leaves.castShadow = true;
  root.add(trunk, leaves);

  // volcan : lave lumineuse dans le cratère
  if (c.style === "volcano") {
    const vx = cx + c.r * 0.42,
      vz = cz + c.r * 0.18;
    const lava = new THREE.Mesh(new THREE.CircleGeometry(120, 32), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff4a10, emissiveIntensity: 3 }));
    lava.rotation.x = -Math.PI / 2;
    lava.position.set(vx, ground(vx, vz) + 6, vz);
    root.add(lava);
    const smoke = new THREE.Mesh(new THREE.SphereGeometry(140, 16, 10), new THREE.MeshBasicMaterial({ color: 0x555050, transparent: true, opacity: 0.25, depthWrite: false }));
    smoke.position.set(vx, ground(vx, vz) + 260, vz);
    smoke.scale.set(1, 0.6, 1);
    root.add(smoke);
  }

  // ---------------------------------------------------------------- aire d'atterrissage
  const pad = new THREE.Vector3(cx + 120, 0, cz + 120);
  pad.y = ground(pad.x, pad.z);
  const pd = new THREE.Mesh(new THREE.CylinderGeometry(42, 42, 1, 48), std(0x2a2e38, { metalness: 0.5, roughness: 0.5 }));
  pd.position.set(pad.x, pad.y + 0.2, pad.z);
  add(pd);
  G.physics.addBox({ x: pad.x - 30, y: pad.y - 2, z: pad.z - 30 }, { x: pad.x + 30, y: pad.y + 0.7, z: pad.z + 30 }, "pad");
  const ring = new THREE.Mesh(new THREE.RingGeometry(39, 41, 64), glowM);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(pad.x, pad.y + 0.75, pad.z);
  root.add(ring);
  pad.y += 0.7;

  // panneau de bienvenue
  const cv = document.createElement("canvas");
  cv.width = 1024;
  cv.height = 256;
  const g2 = cv.getContext("2d")!;
  g2.fillStyle = "rgba(10,14,24,0.85)";
  g2.fillRect(0, 0, 1024, 256);
  g2.strokeStyle = "#" + pal.glow.toString(16).padStart(6, "0");
  g2.lineWidth = 8;
  g2.strokeRect(8, 8, 1008, 240);
  g2.fillStyle = "#fff";
  g2.font = "bold 96px Arial";
  g2.textAlign = "center";
  g2.fillText(c.name.toUpperCase(), 512, 120);
  g2.font = "40px Arial";
  g2.fillText(c.desc, 512, 200);
  const st = new THREE.CanvasTexture(cv);
  st.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(24, 6), new THREE.MeshBasicMaterial({ map: st, side: THREE.DoubleSide }));
  sign.position.set(plaza.x, plY + 16, plaza.z - 32);
  sign.rotation.y = Math.PI; // lisible en arrivant par le sud
  root.add(sign);

  // affichage seulement à proximité (brouillard au-delà)
  const centre = new THREE.Vector3(cx, y0, cz);
  root.visible = false;
  G.palace.updaters.push(() => {
    const d = G.camera.position.distanceTo(centre);
    root.visible = d < c.r + 4500;
  });
  G.world.markers.push({ id: c.id, name: c.name, pos: centre.clone(), icon: "✦", visible: () => true });
  return { def: c, front, pad };
}
