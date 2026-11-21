// AGRANDISSEMENTS : l'Autoroute royale (plusieurs kilomètres, viaducs, éclairage) et les Tours royales
// jumelles reliées par une passerelle panoramique, derrière le grand palais.
import * as THREE from "three";
import { G, bus } from "../core";
import { mat, tex } from "./materials";
import { block, span } from "./build";
import { SEA } from "./terrain";

const HALF_W = 11; // demi-largeur de l'autoroute (4 voies + bandes d'arrêt)

export interface Highway {
  heightAt: (x: number, z: number) => number;
  onRoad: (x: number, z: number) => boolean;
}

/** Autoroute royale : du portail sud du palais, au sud de la ville, puis vers le nord-est ; branche ouest vers l'océan. */
export function buildHighway(): Highway {
  const routes: [number, number][][] = [
    [[0, -275], [0, -430], [280, -700], [900, -1250], [1700, -1310], [2550, -1250], [2860, -800], [2920, 0], [2900, 700], [2960, 1050]],
    // branche ouest → GRAND PONT ROYAL au-dessus de l'océan, jusqu'au marché de Zuria
    [[-275, 0], [-480, -40], [-760, -160], [-980, -240], [-1300, -210], [-1800, -70], [-2200, 50], [-2460, 135], [-2700, 178], [-2872, 185]],
    // route spéciale de l'Aéroport Royal (et de sa gare), depuis l'autoroute
    [[1700, -1310], [1750, -1600], [1820, -1900], [1850, -2108]]
  ];
  const BRIDGE_ROUTE = 1;
  const DECK = 34; // hauteur du tablier au-dessus de l'océan (les navires passent dessous)
  const bridgeTowers: THREE.Vector3[] = [];
  const bridgeDirs: THREE.Vector3[] = [];
  const segs: { ax: number; az: number; ay: number; bx: number; bz: number; by: number }[] = [];
  const grid = new Map<string, number[]>();
  const cell = 64;
  const key = (x: number, z: number) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
  const root = new THREE.Group();
  G.scene.add(root);
  const asphalt = asphaltTexture();
  const roadMat = new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.75, metalness: 0.05 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd6, metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide });
  const lamps: THREE.Vector3[] = [];
  const pillars: { p: THREE.Vector3; h: number }[] = [];
  let total = 0;

  for (const [ri, ctrl] of routes.entries()) {
    const bridge = ri === BRIDGE_ROUTE;
    const curve = new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "centripetal");
    const len = curve.getLength();
    total += len;
    const n = Math.ceil(len / 6);
    const pts = curve.getSpacedPoints(n);
    // profil en long : relief lissé, jamais sous le terrain ni sous la mer
    const raw = pts.map((p) => Math.max(G.physics.terrain(p.x, p.z), SEA + 2.5));
    // pont : au-dessus de l'eau le tablier monte à DECK m, avec de longues rampes d'accès
    const target = bridge ? raw.map((y) => (y <= SEA + 2.6 ? DECK : y)) : raw;
    const win = bridge ? 34 : 12;
    const smooth = raw.map((_, i) => {
      let s = 0,
        c = 0;
      for (let k = -win; k <= win; k++) {
        const j = Math.min(raw.length - 1, Math.max(0, i + k));
        s += target[j];
        c++;
      }
      return s / c;
    });
    const ys = smooth.map((y, i) => Math.max(y, raw[i] + 0.15) + 0.12);
    // ruban de chaussée + glissières
    const pos: number[] = [],
      uv: number[] = [],
      idx: number[] = [];
    const rail: number[] = [],
      railIdx: number[] = [];
    let v = 0;
    pts.forEach((p, i) => {
      const t = curve.getTangentAt(i / n).setY(0).normalize();
      const nx = -t.z,
        nz = t.x;
      const y = ys[i];
      if (i) v += pts[i].distanceTo(pts[i - 1]) / 12;
      pos.push(p.x + nx * HALF_W, y, p.z + nz * HALF_W, p.x - nx * HALF_W, y, p.z - nz * HALF_W);
      uv.push(0, v, 1, v);
      for (const s of [1, -1]) rail.push(p.x + nx * HALF_W * s, y + 0.1, p.z + nz * HALF_W * s, p.x + nx * HALF_W * s, y + 1.25, p.z + nz * HALF_W * s);
      if (i) {
        const a = (i - 1) * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        const r = (i - 1) * 4;
        for (const o of [0, 2]) railIdx.push(r + o, r + o + 4, r + o + 1, r + o + 1, r + o + 4, r + o + 5);
        segs.push({ ax: pts[i - 1].x, az: pts[i - 1].z, ay: ys[i - 1], bx: p.x, bz: p.z, by: y });
        const si = segs.length - 1;
        const minx = Math.min(p.x, pts[i - 1].x) - HALF_W,
          maxx = Math.max(p.x, pts[i - 1].x) + HALF_W;
        const minz = Math.min(p.z, pts[i - 1].z) - HALF_W,
          maxz = Math.max(p.z, pts[i - 1].z) + HALF_W;
        for (let cx = Math.floor(minx / cell); cx <= Math.floor(maxx / cell); cx++)
          for (let cz = Math.floor(minz / cell); cz <= Math.floor(maxz / cell); cz++) {
            const k = `${cx},${cz}`;
            if (!grid.has(k)) grid.set(k, []);
            grid.get(k)!.push(si);
          }
      }
      if (i % 10 === 0) lamps.push(new THREE.Vector3(p.x + nx * (HALF_W + 0.6) * (i % 20 ? 1 : -1), y, p.z + nz * (HALF_W + 0.6) * (i % 20 ? 1 : -1)));
      if (i % 5 === 0 && y - raw[i] > 2.5) pillars.push({ p: new THREE.Vector3(p.x, y, p.z), h: y - raw[i] + 2 });
      // garde-corps solides sur les parties en hauteur (ponts, viaducs) : on ne tombe plus
      if (i && (y - raw[i] > 1.5 || ys[i - 1] - raw[i - 1] > 1.5)) {
        const a = pts[i - 1],
          ay = ys[i - 1];
        for (let k = 0; k < 6; k++) {
          const u = k / 6;
          const x = a.x + (p.x - a.x) * u,
            z = a.z + (p.z - a.z) * u,
            yy = ay + (y - ay) * u;
          for (const sd of [1, -1]) {
            const rx = x + nx * (HALF_W + 0.25) * sd,
              rz = z + nz * (HALF_W + 0.25) * sd;
            G.physics.addBox({ x: rx - 0.3, y: yy - 0.5, z: rz - 0.3 }, { x: rx + 0.3, y: yy + 1.3, z: rz + 0.3 }, "rail");
          }
        }
      }
      if (bridge && i % 55 === 27 && y > DECK - 1 && raw[i] <= SEA + 2.6) {
        bridgeTowers.push(new THREE.Vector3(p.x, y, p.z));
        bridgeDirs.push(new THREE.Vector3(nx, 0, nz));
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const road = new THREE.Mesh(geo, roadMat);
    road.receiveShadow = true;
    root.add(road);
    // épaisseur du tablier (vue de dessous sur les viaducs)
    const under = new THREE.Mesh(geo.clone().translate(0, -0.9, 0), new THREE.MeshStandardMaterial({ color: 0x3a3d44, side: THREE.BackSide }));
    root.add(under);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute("position", new THREE.Float32BufferAttribute(rail, 3));
    rg.setIndex(railIdx);
    rg.computeVertexNormals();
    root.add(new THREE.Mesh(rg, railMat));
  }

  // lampadaires (instanciés)
  const poleGeo = new THREE.CylinderGeometry(0.15, 0.22, 10, 8).translate(0, 5, 0);
  const headGeo = new THREE.BoxGeometry(2.4, 0.25, 0.6);
  const poles = new THREE.InstancedMesh(poleGeo, mat.graphite, lamps.length);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ color: 0, emissive: 0xfff0d0, emissiveIntensity: 1 }), lamps.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  lamps.forEach((l, i) => {
    m4.compose(l, q, new THREE.Vector3(1, 1, 1));
    poles.setMatrixAt(i, m4);
    m4.compose(l.clone().add(new THREE.Vector3(0, 10, 0)), q, new THREE.Vector3(1, 1, 1));
    heads.setMatrixAt(i, m4);
  });
  root.add(poles, heads);
  // piles de viaduc
  const pil = new THREE.InstancedMesh(new THREE.BoxGeometry(3.2, 1, 3.2), new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.7 }), Math.max(1, pillars.length));
  pillars.forEach((pp, i) => {
    m4.compose(pp.p.clone().add(new THREE.Vector3(0, -pp.h / 2 - 0.9, 0)), q, new THREE.Vector3(1, pp.h, 1));
    pil.setMatrixAt(i, m4);
  });
  pil.count = pillars.length;
  root.add(pil);
  buildBridgeTowers(root, bridgeTowers, bridgeDirs);

  // portique d'entrée
  const sign = document.createElement("canvas");
  sign.width = 1024;
  sign.height = 160;
  const c = sign.getContext("2d")!;
  c.fillStyle = "#0b3a6a";
  c.fillRect(0, 0, 1024, 160);
  c.strokeStyle = "#fff";
  c.lineWidth = 6;
  c.strokeRect(8, 8, 1008, 144);
  c.fillStyle = "#fff";
  c.font = "bold 64px Arial";
  c.fillText("A1  AUTOROUTE ROYALE", 40, 82);
  c.font = "36px Arial";
  c.fillText("Ville  ·  Montagnes  ·  ✈ Aéroport  ·  Pont → Zuria ↰", 40, 132);
  const st = new THREE.CanvasTexture(sign);
  st.colorSpace = THREE.SRGBColorSpace;
  const gy = G.physics.terrain(0, -360) + 0.1;
  for (const x of [-12.5, 12.5]) block(root, 0.8, 9, 0.8, mat.graphite, x, gy, -360);
  span(root, -13, gy + 9, -360.4, 13, gy + 9.6, -359.6, mat.graphite, { solid: false });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(18, 2.8), new THREE.MeshBasicMaterial({ map: st, side: THREE.DoubleSide }));
  board.position.set(0, gy + 8, -360.5);
  root.add(board);

  // hauteur praticable de la chaussée (voitures et piétons roulent sur les viaducs)
  const heightAt = (x: number, z: number) => {
    const list = grid.get(key(x, z));
    if (!list) return -Infinity;
    let best = -Infinity;
    for (const i of list) {
      const s = segs[i];
      const dx = s.bx - s.ax,
        dz = s.bz - s.az;
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / l2));
      const px = s.ax + dx * t,
        pz = s.az + dz * t;
      if ((x - px) ** 2 + (z - pz) ** 2 < HALF_W * HALF_W) best = Math.max(best, s.ay + (s.by - s.ay) * t);
    }
    return best;
  };
  G.physics.surfaces.push(heightAt);
  G.world.markers.push({ id: "highway", name: "Autoroute royale", pos: new THREE.Vector3(1700, 0, -1310), icon: "═", visible: () => true });
  bus.emit("highway", Math.round(total));
  return { heightAt, onRoad: (x, z) => heightAt(x, z) > -Infinity };
}

/** Pylônes du pont suspendu (blancs et or), câbles porteurs dorés, suspentes, feux de balisage. */
function buildBridgeTowers(root: THREE.Group, towers: THREE.Vector3[], dirs: THREE.Vector3[]) {
  if (!towers.length) return;
  const TH = 62; // hauteur des pylônes au-dessus du tablier
  const off = HALF_W + 2;
  const white = new THREE.MeshStandardMaterial({ color: 0xe8eaf0, roughness: 0.4, metalness: 0.2 });
  const cableMat = new THREE.MeshStandardMaterial({ color: 0xd8b25a, metalness: 1, roughness: 0.25 });
  const beacon = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff3030, emissiveIntensity: 3 });
  const tops: THREE.Vector3[][] = [[], []];
  towers.forEach((t, k) => {
    const n = dirs[k];
    [-1, 1].forEach((sd, si) => {
      const x = t.x + n.x * off * sd,
        z = t.z + n.z * off * sd;
      const base = SEA - 6;
      const h = t.y + TH - base;
      const leg = new THREE.Mesh(new THREE.BoxGeometry(3.4, h, 3.4), white);
      leg.position.set(x, base + h / 2, z);
      leg.castShadow = true;
      root.add(leg);
      G.physics.addBox({ x: x - 1.7, y: base, z: z - 1.7 }, { x: x + 1.7, y: t.y + TH, z: z + 1.7 }, "bridge");
      const cap = new THREE.Mesh(new THREE.ConeGeometry(2.4, 6, 4), mat.gold);
      cap.position.set(x, t.y + TH + 3, z);
      cap.rotation.y = Math.PI / 4;
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), beacon);
      lamp.position.set(x, t.y + TH + 6.6, z);
      root.add(cap, lamp);
      tops[si].push(new THREE.Vector3(x, t.y + TH, z));
    });
    // traverses entre les deux pylônes (au-dessus de la circulation)
    for (const hy of [TH * 0.55, TH - 3]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(off * 2, 2.2, 2.4), white);
      beam.position.set(t.x, t.y + hy, t.z);
      beam.rotation.y = Math.atan2(-n.z, n.x);
      root.add(beam);
    }
    // portique doré « PONT ROYAL »
    const arch = new THREE.Mesh(new THREE.TorusGeometry(off - 1, 0.5, 8, 40, Math.PI), mat.gold);
    arch.position.set(t.x, t.y + TH * 0.55 - 1, t.z);
    arch.rotation.y = Math.atan2(-n.z, n.x);
    arch.rotation.z = Math.PI;
    root.add(arch);
  });
  // câbles porteurs : du sol des culées aux sommets, avec une flèche entre pylônes
  const hangers: number[] = [];
  for (const side of tops) {
    for (let k = 0; k < side.length - 1; k++) {
      const a = side[k],
        b = side[k + 1];
      if (a.distanceTo(b) > 520) continue;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 24; i++) {
        const u = i / 24;
        const p = a.clone().lerp(b, u);
        p.y -= (TH - 6) * 4 * u * (1 - u);
        pts.push(p);
        if (i > 0 && i < 24) hangers.push(p.x, p.y, p.z, p.x, a.y - TH + 1, p.z);
      }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.45, 6), cableMat);
      root.add(tube);
    }
  }
  const hg = new THREE.BufferGeometry();
  hg.setAttribute("position", new THREE.Float32BufferAttribute(hangers, 3));
  root.add(new THREE.LineSegments(hg, new THREE.LineBasicMaterial({ color: 0xd8b25a })));
  G.world.markers.push({ id: "bridge", name: "Pont royal de Zuria", pos: towers[Math.floor(towers.length / 2)].clone(), icon: "⌒", visible: () => true });
}

function asphaltTexture() {
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 128;
  const c = cv.getContext("2d")!;
  c.fillStyle = "#202329";
  c.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 900; i++) {
    c.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    c.fillRect(Math.random() * 256, Math.random() * 128, 2, 2);
  }
  c.fillStyle = "#e9edf2";
  c.fillRect(10, 0, 4, 128); // bord gauche
  c.fillRect(242, 0, 4, 128); // bord droit
  c.fillStyle = "#d8b25a";
  c.fillRect(125, 0, 3, 128);
  c.fillRect(130, 0, 3, 128); // terre-plein central (double ligne)
  c.fillStyle = "#e9edf2";
  for (const x of [68, 188]) c.fillRect(x, 0, 3, 64); // voies (pointillés)
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ---------------------------------------------------------------- TOURS ROYALES
/** Deux gratte-ciel de 260 m derrière le palais, reliés à 220 m par une passerelle panoramique accessible. */
export function buildRoyalTowers() {
  const root = new THREE.Group();
  G.scene.add(root);
  const H = 260,
    W = 30,
    BRIDGE_Y = 220;
  const glassTex = tex.window.clone();
  glassTex.needsUpdate = true;
  glassTex.repeat.set(6, 40);
  const glass = new THREE.MeshStandardMaterial({ color: 0xb8c8e0, map: glassTex, emissiveMap: glassTex, emissive: 0xffffff, emissiveIntensity: 0.5, metalness: 0.8, roughness: 0.15 });
  const towers = [-110, 110].map((x) => new THREE.Vector3(x, 0, 110));
  for (const t of towers) {
    block(root, W, H, W, glass, t.x, -2, t.z);
    // arêtes dorées, couronne et flèche
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) block(root, 1.2, H + 2, 1.2, mat.gold, t.x + (sx * W) / 2, -2, t.z + (sz * W) / 2, { solid: false });
    for (let y = 40; y < H; y += 40) span(root, t.x - W / 2 - 0.4, y, t.z - W / 2 - 0.4, t.x + W / 2 + 0.4, y + 0.8, t.z + W / 2 + 0.4, mat.gold, { solid: false });
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(4, W * 0.62, 26, 4, 1), mat.gold);
    crown.rotation.y = Math.PI / 4;
    crown.position.set(t.x, H + 11, t.z);
    root.add(crown);
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 1.2, 40, 8), mat.silver);
    spire.position.set(t.x, H + 44, t.z);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 8), mat.glowBlue);
    beacon.position.set(t.x, H + 65, t.z);
    root.add(spire, beacon);
    // entrée + ascenseur panoramique
    const door = new THREE.Mesh(new THREE.BoxGeometry(8, 7, 0.4), mat.glowCyan);
    door.position.set(t.x, 3.5, t.z - W / 2 - 0.25);
    root.add(door);
    G.interact.add({
      id: "tower-lift-" + t.x,
      pos: new THREE.Vector3(t.x, 1, t.z - W / 2 - 2),
      radius: 5,
      label: () => "Ascenseur panoramique → passerelle à 220 m",
      action: () => {
        G.audio.whoosh(2, 200, 2400, 0.2);
        G.player.teleport(new THREE.Vector3(t.x * 0.55, BRIDGE_Y + 0.6, t.z), t.x < 0 ? -Math.PI / 2 : Math.PI / 2);
        bus.emit("toast", { text: "🏙 Passerelle des Tours royales — 220 m au-dessus du palais." });
      }
    });
  }
  // passerelle vitrée praticable
  const bx1 = towers[0].x + W / 2,
    bx2 = towers[1].x - W / 2;
  span(root, bx1, BRIDGE_Y - 1.2, 104, bx2, BRIDGE_Y + 0.6, 116, mat.floor);
  span(root, bx1, BRIDGE_Y + 6, 104, bx2, BRIDGE_Y + 6.6, 116, mat.marble);
  for (const z of [104, 116]) {
    span(root, bx1, BRIDGE_Y + 0.6, z - 0.1, bx2, BRIDGE_Y + 6, z + 0.1, mat.glass, { shadow: false, uv: false });
    span(root, bx1, BRIDGE_Y + 0.6, z - 0.15, bx2, BRIDGE_Y + 0.8, z + 0.15, mat.gold, { solid: false });
  }
  for (let x = bx1 + 10; x < bx2; x += 20) block(root, 0.6, 5.4, 12, mat.gold, x, BRIDGE_Y + 0.6, 110, { solid: false });
  // retour au sol
  for (const t of towers) {
    const x = t.x * 0.55;
    G.interact.add({
      id: "tower-down-" + t.x,
      pos: new THREE.Vector3(x, BRIDGE_Y + 1, t.z),
      radius: 4,
      label: () => "Redescendre (ascenseur panoramique)",
      action: () => {
        G.audio.whoosh(2, 2400, 200, 0.2);
        G.player.teleport(new THREE.Vector3(t.x, 0.2, t.z - W / 2 - 5), Math.PI);
      }
    });
  }
  G.world.markers.push({ id: "towers", name: "Tours royales", pos: new THREE.Vector3(0, 0, 110), icon: "▥", visible: () => true });
  G.palace.updaters.push(() => {
    glass.emissiveIntensity = 0.3 + G.env.nightFactor * 1.4;
  });
}
