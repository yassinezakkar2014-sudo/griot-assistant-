// Le monde extérieur : jardins royaux, ville futuriste, jungle, montagnes, océan, base secrète,
// vallée nocturne bioluminescente, éclats de données et parcours d'anneaux.
import * as THREE from "three";
import { G, bus, nextFrame } from "../core";
import { mat, tex } from "./materials";
import { block, cyl, span, glowLine } from "./build";
import { Terrain, ZONES, SEA, WORLD, fbm } from "./terrain";

export interface Marker {
  id: string;
  name: string;
  pos: THREE.Vector3;
  icon: string;
  visible: () => boolean;
}

export class World {
  terrain = new Terrain();
  root = new THREE.Group();
  mapCanvas!: HTMLCanvasElement;
  markers: Marker[] = [];
  gardenLights: { pos: THREE.Vector3; color: number; intensity: number; distance?: number }[] = [];
  shards: { id: string; name: string; mesh: THREE.Object3D; pos: THREE.Vector3 }[] = [];
  rings: { mesh: THREE.Mesh; pos: THREE.Vector3; normal: THREE.Vector3 }[] = [];
  traffic!: THREE.InstancedMesh;
  private trafficLanes: { r: number; y: number; speed: number; phase: number; cx: number; cz: number }[] = [];
  private fountains: { points: THREE.Points; vel: Float32Array; origin: THREE.Vector3 }[] = [];
  private animated: ((dt: number, t: number) => void)[] = [];
  cityWindowMats: THREE.MeshStandardMaterial[] = [];
  glowPlants: THREE.MeshStandardMaterial[] = [];
  radar!: THREE.Object3D;

  async build(onProgress: (p: number, label: string) => void) {
    G.scene.add(this.root);
    await this.terrain.build(G.scene, (p) => onProgress(p * 0.4, "Génération du terrain"));
    G.physics.terrain = this.terrain.height;
    G.physics.waterLevel = SEA;
    onProgress(0.42, "Jardins royaux");
    await nextFrame();
    this.gardens();
    onProgress(0.5, "Ville futuriste");
    await nextFrame();
    this.city();
    onProgress(0.62, "Jungle tropicale");
    await nextFrame();
    this.jungle();
    onProgress(0.72, "Base secrète");
    await nextFrame();
    this.secretBase();
    this.nightValley();
    onProgress(0.8, "Éclats de données & anneaux");
    await nextFrame();
    this.shardsAndRings();
    this.buildMap();
    this.markers.push(
      { id: "palace", name: "Palais royal", pos: new THREE.Vector3(0, 0, 0), icon: "♛", visible: () => true },
      { id: "city", name: "Ville futuriste", pos: new THREE.Vector3(1600, 0, 0), icon: "▦", visible: () => true },
      { id: "jungle", name: "Jungle tropicale", pos: new THREE.Vector3(200, 0, -1700), icon: "♣", visible: () => true },
      { id: "mountains", name: "Montagnes", pos: new THREE.Vector3(-300, 0, 2400), icon: "▲", visible: () => true },
      { id: "ocean", name: "Océan", pos: new THREE.Vector3(-2200, 0, 0), icon: "≈", visible: () => true },
      { id: "night", name: "Vallée nocturne", pos: new THREE.Vector3(ZONES.night.x, 0, ZONES.night.z), icon: "✦", visible: () => true },
      { id: "base", name: "Base secrète", pos: new THREE.Vector3(ZONES.base.x, 0, ZONES.base.z), icon: "◈", visible: () => G.missions.flag("base-found") }
    );
  }

  // ---------------------------------------------------------------- JARDINS
  private gardens() {
    const g = this.root;
    // allée centrale
    span(g, -4, 0, -260, 4, 0.03, -44, mat.marble, { solid: false });
    glowLine(g, -4.1, 0.04, -260, -4.05, 0.05, -44, mat.glowBlue, 0.04);
    glowLine(g, 4.05, 0.04, -260, 4.1, 0.05, -44, mat.glowBlue, 0.04);
    // grande fontaine
    this.fountain(new THREE.Vector3(0, 0, -110), 14, true);
    this.fountain(new THREE.Vector3(-60, 0, -75), 6, false);
    this.fountain(new THREE.Vector3(60, 0, -75), 6, false);
    // bassin miroir
    span(g, -10, 0, -230, 10, 0.5, -229.5, mat.marble);
    span(g, -10, 0, -160.5, 10, 0.5, -160, mat.marble);
    span(g, -10.5, 0, -230, -10, 0.5, -160, mat.marble);
    span(g, 10, 0, -230, 10.5, 0.5, -160, mat.marble);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(20, 70), new THREE.MeshStandardMaterial({ color: 0x0a3060, roughness: 0.02, metalness: 0.6 }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.3, -195);
    g.add(pool);
    // haies & parterres
    for (const s of [-1, 1]) {
      for (let k = 0; k < 6; k++) {
        const z = -50 - k * 32;
        block(g, 26, 1.4, 1.6, mat.hedge, s * 24, 0, z);
        block(g, 1.6, 1.4, 20, mat.hedge, s * 37, 0, z - 11);
        const flower = new THREE.Mesh(new THREE.BoxGeometry(22, 0.14, 16), new THREE.MeshStandardMaterial({ color: [0x5a3a9a, 0x2a5aa0, 0xb89a5a][k % 3], roughness: 0.95 }));
        flower.position.set(s * 24, 0.05, z - 11);
        g.add(flower);
      }
      // lampadaires
      for (let k = 0; k < 10; k++) {
        const z = -48 - k * 22;
        cyl(g, 0.15, 5, mat.black, s * 7, 0, z, { seg: 8 });
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), mat.glowCyan);
        bulb.position.set(s * 7, 5.2, z);
        g.add(bulb);
      }
    }
    // arbres du parc
    const trunkGeo = new THREE.CylinderGeometry(0.4, 0.6, 5, 8);
    const crownGeo = new THREE.IcosahedronGeometry(3.4, 1);
    const n = 70;
    const trunks = new THREE.InstancedMesh(trunkGeo, mat.wood, n);
    const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: 0x2d6e35, roughness: 0.9, flatShading: true }), n);
    const m4 = new THREE.Matrix4();
    let c = 0;
    for (let i = 0; i < n; i++) {
      const s = i % 2 ? 1 : -1;
      const x = s * (60 + Math.random() * 140);
      const z = -40 - Math.random() * 230;
      if (Math.abs(x) < 70 && z > -90) continue;
      const sc = 0.8 + Math.random() * 0.6;
      m4.compose(new THREE.Vector3(x, 2.5 * sc, z), new THREE.Quaternion(), new THREE.Vector3(sc, sc, sc));
      trunks.setMatrixAt(c, m4);
      m4.compose(new THREE.Vector3(x, 6.5 * sc, z), new THREE.Quaternion(), new THREE.Vector3(sc, sc * 1.1, sc));
      crowns.setMatrixAt(c, m4);
      G.physics.addBox({ x: x - 0.6, y: 0, z: z - 0.6 }, { x: x + 0.6, y: 8, z: z + 0.6 });
      c++;
    }
    trunks.count = crowns.count = c;
    crowns.castShadow = trunks.castShadow = true;
    g.add(trunks, crowns);
    // portail
    for (const x of [-9, 9]) {
      cyl(g, 1.2, 12, mat.marble, x, 0, -262);
      cyl(g, 1.5, 0.8, mat.gold, x, 12, -262, { solid: false });
    }
    span(g, -10.5, 12.8, -263, 10.5, 14, -261, mat.gold, { solid: false });
    glowLine(g, -9, 12.6, -261, 9, 12.7, -260.9, mat.glowBlue, 0.08);

    this.gardenLights.push(
      { pos: new THREE.Vector3(0, 6, -110), color: 0x5fd0ff, intensity: 220, distance: 40 },
      { pos: new THREE.Vector3(-60, 4, -75), color: 0x5fd0ff, intensity: 80, distance: 20 },
      { pos: new THREE.Vector3(60, 4, -75), color: 0x5fd0ff, intensity: 80, distance: 20 }
    );
  }

  private fountain(o: THREE.Vector3, r: number, big: boolean) {
    const g = this.root;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.6, 12, 64), mat.marble);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(o.x, 0.6, o.z);
    ring.castShadow = ring.receiveShadow = true;
    g.add(ring);
    const water = new THREE.Mesh(new THREE.CircleGeometry(r, 48), new THREE.MeshStandardMaterial({ color: 0x0f5fa8, emissive: 0x0a4a8a, emissiveIntensity: 0.6, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.85 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(o.x, 0.5, o.z);
    g.add(water);
    // collisions : anneau de boîtes
    const segs = 16;
    for (let k = 0; k < segs; k++) {
      const a = (k / segs) * Math.PI * 2;
      const x = o.x + Math.cos(a) * r,
        z = o.z + Math.sin(a) * r;
      const w = (Math.PI * 2 * r) / segs / 1.4;
      G.physics.addBox({ x: x - w / 2, y: 0, z: z - w / 2 }, { x: x + w / 2, y: 1.2, z: z + w / 2 });
    }
    if (big) {
      cyl(g, 2.5, 2.5, mat.marble, o.x, 0, o.z);
      cyl(g, 4, 0.4, mat.gold, o.x, 2.5, o.z, { solid: false });
      cyl(g, 1, 3, mat.marble, o.x, 2.9, o.z, { solid: false });
      cyl(g, 2.4, 0.3, mat.gold, o.x, 5.9, o.z, { solid: false });
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.9, 24, 16), mat.glowCyan);
      orb.position.set(o.x, 7, o.z);
      g.add(orb);
    } else cyl(g, 0.8, 2.2, mat.marble, o.x, 0, o.z);
    // jets d'eau en particules
    const N = big ? 1400 : 500;
    const pos = new Float32Array(N * 3);
    const vel = new Float32Array(N * 3);
    const origin = new THREE.Vector3(o.x, big ? 6.2 : 2.3, o.z);
    for (let i = 0; i < N; i++) this.resetDrop(pos, vel, i, origin, big, Math.random() * 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xbfe9ff, size: big ? 0.22 : 0.16, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts.frustumCulled = false;
    g.add(pts);
    this.fountains.push({ points: pts, vel, origin });
    (pts.userData as any).big = big;
  }

  private resetDrop(pos: Float32Array, vel: Float32Array, i: number, o: THREE.Vector3, big: boolean, age = 0) {
    const a = Math.random() * Math.PI * 2;
    const sp = big ? 3 + Math.random() * 2.5 : 1.5 + Math.random() * 1.5;
    vel[i * 3] = Math.cos(a) * sp;
    vel[i * 3 + 1] = (big ? 7 : 4) + Math.random() * 2;
    vel[i * 3 + 2] = Math.sin(a) * sp;
    pos[i * 3] = o.x + vel[i * 3] * age * 0.2;
    pos[i * 3 + 1] = o.y;
    pos[i * 3 + 2] = o.z + vel[i * 3 + 2] * age * 0.2;
  }

  // ---------------------------------------------------------------- VILLE
  private city() {
    const c = ZONES.city;
    const g = this.root;
    // sol de la ville avec avenues lumineuses
    const cv = document.createElement("canvas");
    cv.width = cv.height = 256;
    const cx = cv.getContext("2d")!;
    cx.fillStyle = "#14161c";
    cx.fillRect(0, 0, 256, 256);
    cx.fillStyle = "#2a2e38";
    cx.fillRect(0, 0, 256, 40);
    cx.fillRect(0, 0, 40, 256);
    cx.fillStyle = "#3fc8ff";
    cx.fillRect(0, 19, 256, 2);
    cx.fillRect(19, 0, 2, 256);
    const gt = new THREE.CanvasTexture(cv);
    gt.wrapS = gt.wrapT = THREE.RepeatWrapping;
    gt.repeat.set((c.x2 - c.x1) / 90, (c.z2 - c.z1) / 90);
    gt.colorSpace = THREE.SRGBColorSpace;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(c.x2 - c.x1, c.z2 - c.z1),
      new THREE.MeshStandardMaterial({ map: gt, emissiveMap: gt, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.6, metalness: 0.2 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set((c.x1 + c.x2) / 2, 1.25, (c.z1 + c.z2) / 2);
    ground.receiveShadow = true;
    g.add(ground);

    // immeubles instanciés (3 classes de hauteur pour l'échelle des fenêtres)
    const classes = [
      { min: 20, max: 60, rep: [3, 5] },
      { min: 60, max: 160, rep: [4, 14] },
      { min: 160, max: 380, rep: [5, 32] }
    ];
    const lots: { x: number; z: number; w: number; d: number; h: number; cls: number }[] = [];
    for (let x = c.x1 + 45; x < c.x2 - 40; x += 90)
      for (let z = c.z1 + 45; z < c.z2 - 40; z += 90) {
        const distC = Math.hypot(x - 1625, z) / 900;
        for (let k = 0; k < 2; k++) {
          if (Math.random() < 0.15) continue;
          const w = 22 + Math.random() * 22,
            d = 22 + Math.random() * 22;
          const ox = (k ? 1 : -1) * (Math.random() * 12);
          const r = Math.random();
          const tall = r > 0.82 + distC * 0.25;
          const h = tall ? 160 + Math.random() * 220 : r > 0.4 ? 60 + Math.random() * 100 : 20 + Math.random() * 40;
          lots.push({ x: x + ox, z: z + (k ? 14 : -14), w: k ? w * 0.7 : w, d: k ? d * 0.6 : d, h, cls: h > 160 ? 2 : h > 60 ? 1 : 0 });
          if (tall) break;
        }
      }
    const m4 = new THREE.Matrix4();
    classes.forEach((cl, ci) => {
      const list = lots.filter((l) => l.cls === ci);
      const wt = tex.window.clone();
      wt.needsUpdate = true;
      wt.repeat.set(cl.rep[0], cl.rep[1]);
      const m = new THREE.MeshStandardMaterial({ color: 0x9aa4b8, map: wt, emissiveMap: wt, emissive: 0xffffff, emissiveIntensity: 0.4, roughness: 0.25, metalness: 0.7 });
      this.cityWindowMats.push(m);
      const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), m, list.length);
      list.forEach((l, i) => {
        m4.compose(new THREE.Vector3(l.x, 1.2 + l.h / 2, l.z), new THREE.Quaternion(), new THREE.Vector3(l.w, l.h, l.d));
        inst.setMatrixAt(i, m4);
        G.physics.addBox({ x: l.x - l.w / 2, y: 0, z: l.z - l.d / 2 }, { x: l.x + l.w / 2, y: 1.2 + l.h, z: l.z + l.d / 2 }, "building");
      });
      inst.castShadow = true;
      inst.receiveShadow = true;
      g.add(inst);
    });
    // sommets dorés et antennes des tours
    const talls = lots.filter((l) => l.cls === 2);
    const crown = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 1, 1, 6), mat.gold, talls.length);
    const tips = new THREE.InstancedMesh(new THREE.SphereGeometry(1.6, 8, 6), mat.glowBlue, talls.length);
    talls.forEach((l, i) => {
      m4.compose(new THREE.Vector3(l.x, 1.2 + l.h + 15, l.z), new THREE.Quaternion(), new THREE.Vector3(l.w * 0.4, 30, l.d * 0.4));
      crown.setMatrixAt(i, m4);
      m4.compose(new THREE.Vector3(l.x, 1.2 + l.h + 31, l.z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
      tips.setMatrixAt(i, m4);
    });
    g.add(crown, tips);
    // tour centrale (éclat de données sur le toit)
    const tower = new THREE.Group();
    tower.position.set(1625, 1.2, 0);
    const tb = new THREE.Mesh(new THREE.CylinderGeometry(18, 26, 420, 6), new THREE.MeshStandardMaterial({ color: 0x1a2236, metalness: 0.9, roughness: 0.2, emissive: 0x0a2a4a, emissiveIntensity: 0.6 }));
    tb.position.y = 210;
    tower.add(tb);
    for (let k = 1; k < 14; k++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(27 - k * 0.6, 0.6, 6, 6), mat.glowCyan);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = k * 30;
      tower.add(ring);
    }
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(24, 18, 4, 6), mat.gold);
    roof.position.y = 422;
    tower.add(roof);
    g.add(tower);
    G.physics.addBox({ x: 1625 - 20, y: 0, z: -20 }, { x: 1625 + 20, y: 424.2, z: 20 }, "tower");
    // plate-forme sur le toit
    G.physics.addBox({ x: 1625 - 22, y: 420, z: -22 }, { x: 1625 + 22, y: 424.2, z: 22 }, "tower-roof");
    // trafic aérien
    const N = 160;
    this.traffic = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.8, 3, 2, 6), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffe08a, emissiveIntensity: 3 }), N);
    this.traffic.frustumCulled = false;
    for (let i = 0; i < N; i++)
      this.trafficLanes.push({ r: 150 + Math.random() * 550, y: 50 + Math.random() * 160, speed: (Math.random() < 0.5 ? -1 : 1) * (0.05 + Math.random() * 0.08), phase: Math.random() * Math.PI * 2, cx: 1625, cz: 0 });
    g.add(this.traffic);
    // panneaux holographiques
    const holoMats = [0x3fc8ff, 0x8a5cff, 0xffc861].map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
    lots
      .filter((l) => l.cls === 1)
      .slice(0, 30)
      .forEach((l, i) => {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(l.w * 0.8, 12), holoMats[i % 3]);
        p.position.set(l.x, l.h * 0.7, l.z - l.d / 2 - 1);
        g.add(p);
      });
  }

  // ---------------------------------------------------------------- JUNGLE
  private jungle() {
    const g = this.root;
    const N = 3200;
    const trunkGeo = new THREE.CylinderGeometry(0.5, 0.9, 1, 6);
    trunkGeo.translate(0, 0.5, 0);
    const crownGeo = new THREE.IcosahedronGeometry(1, 0);
    const trunks = new THREE.InstancedMesh(trunkGeo, mat.wood, N);
    const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: 0x1c5a26, roughness: 0.9, flatShading: true }), N);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    let c = 0;
    for (let tries = 0; tries < N * 4 && c < N; tries++) {
      const x = -1100 + Math.random() * 2600;
      const z = -650 - Math.random() * 3000;
      const h = this.terrain.height(x, z);
      if (h < SEA + 2 || h > 240) continue;
      if (fbm(x * 0.004, z * 0.004) < 0.42) continue;
      const nd = Math.hypot(x - ZONES.night.x, z - ZONES.night.z);
      if (nd < ZONES.night.r * 0.8) continue;
      const th = 10 + Math.random() * 16;
      m4.compose(new THREE.Vector3(x, h - 0.5, z), q, new THREE.Vector3(1, th, 1));
      trunks.setMatrixAt(c, m4);
      const s = 5 + Math.random() * 6;
      q.setFromEuler(new THREE.Euler(0, Math.random() * 6, 0));
      m4.compose(new THREE.Vector3(x, h + th, z), q, new THREE.Vector3(s, s * 0.7, s));
      crowns.setMatrixAt(c, m4);
      crowns.setColorAt(c, col.setHSL(0.3 + Math.random() * 0.08, 0.6, 0.18 + Math.random() * 0.12));
      q.identity();
      c++;
    }
    trunks.count = crowns.count = c;
    trunks.castShadow = crowns.castShadow = true;
    g.add(trunks, crowns);
    // palmiers sur la plage ouest
    const palms = new THREE.InstancedMesh(new THREE.ConeGeometry(4, 2, 7), new THREE.MeshStandardMaterial({ color: 0x2f8a3a, flatShading: true }), 300);
    const ptr = new THREE.InstancedMesh(trunkGeo, mat.wood, 300);
    let pc = 0;
    for (let tries = 0; tries < 4000 && pc < 300; tries++) {
      const x = -900 - Math.random() * 500;
      const z = -1500 + Math.random() * 3000;
      const h = this.terrain.height(x, z);
      if (h < SEA + 0.5 || h > SEA + 12) continue;
      const th = 8 + Math.random() * 5;
      m4.compose(new THREE.Vector3(x, h, z), q, new THREE.Vector3(0.5, th, 0.5));
      ptr.setMatrixAt(pc, m4);
      m4.compose(new THREE.Vector3(x, h + th, z), q, new THREE.Vector3(1, 1, 1));
      palms.setMatrixAt(pc, m4);
      pc++;
    }
    palms.count = ptr.count = pc;
    g.add(palms, ptr);
    // temple ancien (éclat de données)
    const tx = 300,
      tz = -1900;
    const th = this.terrain.height(tx, tz);
    const stone = new THREE.MeshStandardMaterial({ color: 0x6f6a58, roughness: 0.95 });
    for (let k = 0; k < 5; k++) block(g, 40 - k * 7, 5, 40 - k * 7, stone, tx, th - 2 + k * 5, tz);
    for (let k = 0; k < 5; k++) glowLine(g, tx - (20 - k * 3.5), th + 2.6 + k * 5, tz - (20 - k * 3.5) - 0.05, tx + (20 - k * 3.5), th + 2.7 + k * 5, tz - (20 - k * 3.5), mat.glowCyan, 0.05);
    this.markers.push({ id: "temple", name: "Temple ancien", pos: new THREE.Vector3(tx, 0, tz), icon: "⌂", visible: () => true });
  }

  // ---------------------------------------------------------------- BASE SECRÈTE
  private secretBase() {
    const b = ZONES.base;
    const g = new THREE.Group();
    const y = b.h;
    this.root.add(g);
    // piste d'atterrissage
    cyl(g, 22, 0.6, mat.darkFloor, b.x, y, b.z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(20, 0.3, 8, 64), mat.glowCyan);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(b.x, y + 0.65, b.z);
    g.add(ring);
    // bunker
    const bx = b.x + 50,
      bz = b.z + 20;
    span(g, bx - 18, y, bz - 14, bx + 18, y + 12, bz + 14, mat.graphite);
    span(g, bx - 19, y + 12, bz - 15, bx + 19, y + 13, bz + 15, mat.black);
    glowLine(g, bx - 18.1, y + 6, bz - 14.1, bx + 18.1, y + 6.1, bz - 14.05, mat.glowBlue, 0.1);
    const blast = new THREE.Mesh(new THREE.BoxGeometry(12, 9, 0.6), new THREE.MeshStandardMaterial({ color: 0x0a0d14, metalness: 0.9, roughness: 0.3, emissive: 0x00e5ff, emissiveIntensity: 0.15 }));
    blast.position.set(bx, y + 4.5, bz - 14.3);
    g.add(blast);
    // dôme
    const dome = new THREE.Mesh(new THREE.SphereGeometry(14, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a3348, metalness: 0.7, roughness: 0.3 }));
    dome.position.set(b.x - 45, y, b.z + 30);
    g.add(dome);
    G.physics.addBox({ x: b.x - 55, y, z: b.z + 20 }, { x: b.x - 35, y: y + 12, z: b.z + 40 });
    // antenne + radar
    cyl(g, 0.8, 40, mat.silver, b.x - 30, y, b.z - 40);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff2a3a, emissiveIntensity: 4 }));
    beacon.position.set(b.x - 30, y + 41, b.z - 40);
    g.add(beacon);
    const radar = new THREE.Group();
    const dish = new THREE.Mesh(new THREE.SphereGeometry(5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 3), mat.silver);
    dish.rotation.x = Math.PI / 2.4;
    radar.add(dish);
    radar.position.set(b.x + 40, y + 16, b.z - 30);
    cyl(g, 0.6, 16, mat.silver, b.x + 40, y, b.z - 30);
    g.add(radar);
    this.radar = radar;
    this.animated.push((_dt, t) => {
      radar.rotation.y = t * 0.6;
      (beacon.material as THREE.MeshStandardMaterial).emissiveIntensity = Math.sin(t * 4) > 0 ? 4 : 0.2;
    });
    // lumières de périmètre
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2, 6), mat.glowBlue);
      l.position.set(b.x + Math.cos(a) * 26, y + 1, b.z + Math.sin(a) * 26);
      g.add(l);
    }
    // cache technologique
    const cache = new THREE.Mesh(new THREE.OctahedronGeometry(1.4), mat.glowGold);
    cache.position.set(bx, y + 2, bz - 17);
    g.add(cache);
    this.animated.push((_dt, t) => {
      cache.rotation.y = t;
      cache.visible = !G.missions.flag("base-cache");
    });
    G.interact.add({
      id: "base-cache",
      pos: new THREE.Vector3(bx, y + 1, bz - 17),
      radius: 4,
      enabled: () => !G.missions.flag("base-cache"),
      label: () => "Récupérer la cache technologique",
      action: () => bus.emit("mission", { type: "armor-found", id: "tempest", flag: "base-cache" })
    });
  }

  // ---------------------------------------------------------------- VALLÉE NOCTURNE
  private nightValley() {
    const n = ZONES.night;
    const N = 900;
    const crystalMat = new THREE.MeshStandardMaterial({ color: 0x05101a, emissive: 0x3fe0ff, emissiveIntensity: 1.6, roughness: 0.2, metalness: 0.3 });
    const mushMat = new THREE.MeshStandardMaterial({ color: 0x10051a, emissive: 0xb060ff, emissiveIntensity: 1.4, roughness: 0.6 });
    this.glowPlants.push(crystalMat, mushMat);
    const crystals = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), crystalMat, N);
    const mush = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mushMat, N);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2,
        r = Math.sqrt(Math.random()) * n.r;
      const x = n.x + Math.cos(a) * r,
        z = n.z + Math.sin(a) * r;
      const h = this.terrain.height(x, z);
      const s = 0.5 + Math.random() * 2;
      q.setFromEuler(new THREE.Euler(Math.random() * 0.5, Math.random() * 6, Math.random() * 0.5));
      m4.compose(new THREE.Vector3(x, h + s, z), q, new THREE.Vector3(s * 0.5, s * 2, s * 0.5));
      crystals.setMatrixAt(i, m4);
      const x2 = n.x + Math.cos(a + 1) * r * 0.9,
        z2 = n.z + Math.sin(a + 1) * r * 0.9;
      const s2 = 0.4 + Math.random() * 1.4;
      m4.compose(new THREE.Vector3(x2, this.terrain.height(x2, z2), z2), new THREE.Quaternion(), new THREE.Vector3(s2, s2 * 0.6, s2));
      mush.setMatrixAt(i, m4);
    }
    this.root.add(crystals, mush);
    // lucioles
    const F = 1500;
    const fp = new Float32Array(F * 3);
    for (let i = 0; i < F; i++) {
      const a = Math.random() * Math.PI * 2,
        r = Math.sqrt(Math.random()) * n.r;
      const x = n.x + Math.cos(a) * r,
        z = n.z + Math.sin(a) * r;
      fp.set([x, this.terrain.height(x, z) + 1 + Math.random() * 10, z], i * 3);
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute("position", new THREE.BufferAttribute(fp, 3));
    const flies = new THREE.Points(fg, new THREE.PointsMaterial({ color: 0xc8ff7a, size: 0.5, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.root.add(flies);
    const base = fp.slice();
    this.animated.push((_dt, t) => {
      if (G.camera.position.distanceTo(new THREE.Vector3(n.x, 0, n.z)) > 1500) return;
      const arr = fg.attributes.position.array as Float32Array;
      for (let i = 0; i < F; i++) {
        arr[i * 3] = base[i * 3] + Math.sin(t * 0.7 + i) * 1.5;
        arr[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 1.1 + i * 0.3) * 0.8;
      }
      fg.attributes.position.needsUpdate = true;
      (flies.material as THREE.PointsMaterial).opacity = 0.4 + 0.5 * G.env.nightFactor;
    });
  }

  // ---------------------------------------------------------------- ÉCLATS & ANNEAUX
  private shardsAndRings() {
    // point culminant des montagnes autour de (-300, 2600)
    let peak = new THREE.Vector3(-300, 0, 2600);
    for (let i = 0; i < 400; i++) {
      const x = -700 + Math.random() * 800,
        z = 2200 + Math.random() * 800;
      const h = this.terrain.height(x, z);
      if (h > peak.y) peak.set(x, h, z);
    }
    const defs = [
      { id: "shard-city", name: "Éclat de la Tour", pos: new THREE.Vector3(1625, 424.2 + 2.5, 0) },
      { id: "shard-temple", name: "Éclat du Temple", pos: new THREE.Vector3(300, this.terrain.height(300, -1900) - 2 + 25 + 2.5, -1900) },
      { id: "shard-peak", name: "Éclat du Sommet", pos: peak.clone().add(new THREE.Vector3(0, 3, 0)) }
    ];
    for (const d of defs) {
      const grp = new THREE.Group();
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1.4), new THREE.MeshStandardMaterial({ color: 0, emissive: 0x3fe0ff, emissiveIntensity: 3 }));
      crystal.scale.y = 1.8;
      const halo = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.08, 8, 48), mat.glowGold);
      grp.add(crystal, halo);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 300, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x3fe0ff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
      beam.position.y = 150;
      grp.add(beam);
      grp.position.copy(d.pos);
      this.root.add(grp);
      this.shards.push({ ...d, mesh: grp });
      this.markers.push({ id: d.id, name: d.name, pos: d.pos, icon: "◆", visible: () => !G.missions.state.shards.includes(d.id) });
    }
    // parcours d'anneaux autour du palais
    const ringPts = [
      [0, 80, -150], [180, 110, -260], [380, 150, -150], [480, 180, 120], [300, 140, 360], [0, 120, 420], [-300, 100, 260], [-260, 90, -80]
    ];
    ringPts.forEach((p, i) => {
      const pos = new THREE.Vector3(...(p as [number, number, number]));
      const next = new THREE.Vector3(...(ringPts[(i + 1) % ringPts.length] as [number, number, number]));
      const prev = new THREE.Vector3(...(ringPts[(i - 1 + ringPts.length) % ringPts.length] as [number, number, number]));
      const normal = next.clone().sub(prev).normalize();
      const m = new THREE.Mesh(new THREE.TorusGeometry(14, 0.8, 10, 48), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffc861, emissiveIntensity: 2.5 }));
      m.position.copy(pos);
      m.scale.setScalar(2.6); // anneaux à la taille du vaisseau géant
      m.lookAt(pos.clone().add(normal));
      this.root.add(m);
      this.rings.push({ mesh: m, pos, normal });
    });
  }

  // ---------------------------------------------------------------- CARTE
  private buildMap() {
    const S = 512;
    const cv = document.createElement("canvas");
    cv.width = cv.height = S;
    const c = cv.getContext("2d")!;
    const img = c.createImageData(S, S);
    const col = new THREE.Color();
    for (let j = 0; j < S; j++)
      for (let i = 0; i < S; i++) {
        const x = -WORLD / 2 + (i / S) * WORLD;
        const z = -WORLD / 2 + (j / S) * WORLD;
        const h = this.terrain.height(x, z);
        if (h < SEA) col.setRGB(0.05, 0.2, 0.42).lerp(new THREE.Color(0.02, 0.08, 0.2), Math.min(1, (SEA - h) / 40));
        else this.terrain.colorAt(x, z, h, col);
        const shade = 0.75 + Math.min(0.35, h / 1600);
        const o = ((S - 1 - j) * S + i) * 4; // nord (+z) en haut
        img.data[o] = col.r * 255 * shade;
        img.data[o + 1] = col.g * 255 * shade;
        img.data[o + 2] = col.b * 255 * shade;
        img.data[o + 3] = 255;
      }
    c.putImageData(img, 0, 0);
    c.fillStyle = "#ffd27a";
    c.fillRect(S / 2 - 3, S / 2 - 3, 6, 6);
    this.mapCanvas = cv;
  }

  /** Coordonnées monde → pixels carte (nord en haut). */
  toMap(x: number, z: number, size: number): [number, number] {
    return [((x + WORLD / 2) / WORLD) * size, (1 - (z + WORLD / 2) / WORLD) * size];
  }

  zoneName(p: THREE.Vector3): string {
    const c = ZONES.city;
    if (G.palace.inside(p)) {
      const f = G.palace.floorAt(p);
      return `Palais — Niveau ${f + 1}`;
    }
    if (Math.hypot(p.x - ZONES.zuria.x, p.z - ZONES.zuria.z) < ZONES.zuria.r) {
      const dz = Math.hypot(p.x - ZONES.zuria.x, p.z - ZONES.zuria.z);
      return dz < 45 ? "Palais de Zuria" : dz < 420 ? "Ville de Zuria" : "Pays de Zuria";
    }
    if (p.x > 60 && p.x < 184 && p.z > -34 && p.z < 62) return "Garage royal";
    if (p.x > -150 && p.x < -60 && p.z > -40 && p.z < 20) return "Galerie royale";
    if (Math.abs(p.z + 20) < 4 && Math.abs(p.x) > 32 && Math.abs(p.x) < 61) return "Galerie vitrée du palais";
    if (Math.hypot(p.x - ZONES.base.x, p.z - ZONES.base.z) < ZONES.base.r * 1.5) return "Base secrète";
    if (Math.hypot(p.x - ZONES.night.x, p.z - ZONES.night.z) < ZONES.night.r * 1.3) return "Vallée nocturne";
    if (Math.hypot(p.x, p.z) < 300) return p.z < -40 ? "Jardins royaux" : "Domaine du palais";
    if (p.x > c.x1 - 100 && p.x < c.x2 + 100 && p.z > c.z1 - 100 && p.z < c.z2 + 100) return "Ville futuriste";
    if (this.terrain.height(p.x, p.z) < SEA - 1) return "Océan";
    if (p.z > 650) return "Montagnes";
    if (p.z < -450) return "Jungle tropicale";
    if (p.x < -600) return "Côte ouest";
    return "Plaines du royaume";
  }

  update(dt: number, t: number) {
    this.terrain.update(t);
    // fontaines
    const near = G.camera.position.length() < 600;
    for (const f of this.fountains) {
      f.points.visible = near;
      if (!near) continue;
      const pos = f.points.geometry.attributes.position.array as Float32Array;
      const big = (f.points.userData as any).big;
      for (let i = 0; i < pos.length / 3; i++) {
        f.vel[i * 3 + 1] -= 9.8 * dt;
        pos[i * 3] += f.vel[i * 3] * dt;
        pos[i * 3 + 1] += f.vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += f.vel[i * 3 + 2] * dt;
        if (pos[i * 3 + 1] < 0.5) this.resetDrop(pos, f.vel, i, f.origin, big);
      }
      f.points.geometry.attributes.position.needsUpdate = true;
    }
    // trafic
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    this.trafficLanes.forEach((l, i) => {
      const a = l.phase + t * l.speed;
      const x = l.cx + Math.cos(a) * l.r,
        z = l.cz + Math.sin(a) * l.r * 0.8;
      q.setFromAxisAngle(up, -a + (l.speed > 0 ? 0 : Math.PI));
      q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)));
      m4.compose(new THREE.Vector3(x, l.y, z), q, new THREE.Vector3(1, 1, 1));
      this.traffic.setMatrixAt(i, m4);
    });
    this.traffic.instanceMatrix.needsUpdate = true;
    // éclats
    for (const s of this.shards) {
      s.mesh.visible = !G.missions.state.shards.includes(s.id);
      s.mesh.rotation.y = t * 0.8;
    }
    // intensité nocturne
    const nf = G.env.nightFactor;
    for (const m of this.cityWindowMats) m.emissiveIntensity = 0.25 + nf * 1.6;
    for (const m of this.glowPlants) m.emissiveIntensity = 0.35 + nf * 0.9;
    for (const a of this.animated) a(dt, t);
  }
}
