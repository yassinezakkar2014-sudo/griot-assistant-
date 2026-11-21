// LES AÉROPORTS — piste avec tous ses marquages et balisages, taxiway, tarmac, aérogare vitrée
// (hall d'enregistrement, tableaux des départs, sièges, portes), passerelles télescopiques,
// tour de contrôle avec radar, hangars, véhicules de piste, parking, manche à air, rampes
// d'approche. Et les VOLS : embarquement, repoussage, roulage, décollage, croisière,
// approche, atterrissage, roulage jusqu'à la porte — avec trafic aérien d'ambiance.
import * as THREE from "three";
import { G, bus, clamp, damp, lerp } from "../core";
import { mat } from "../world/materials";
import { AIRPORTS, type AirportDef } from "../world/countryData";
import { buildAirliner, type Airliner } from "./airliner";

interface Port {
  def: AirportDef;
  /** passage local (piste le long de x, aérogare vers +z) → monde */
  W: (x: number, y: number, z: number) => THREE.Vector3;
  yawW: (localYaw: number) => number;
  stands: { x: number }[];
  gateStand: number; // porte réservée aux vols du joueur
  taxiZ: number;
  connectors: number[];
  hall: THREE.Vector3; // hall d'arrivée (monde)
  root: THREE.Group;
}

type Phase = "board" | "push" | "taxi" | "line" | "roll" | "climb" | "cruise" | "approach" | "flare" | "rollout" | "taxiin" | "done";

interface Flight {
  plane: Airliner;
  from: Port;
  to: Port;
  passenger: boolean;
  phase: Phase;
  path: THREE.Vector3[];
  v: number;
  yaw: number;
  pitch: number;
  roll: number;
  gear: number;
  t: number;
  pos: THREE.Vector3;
  number: string;
}

export class Airports {
  ports: Port[] = [];
  plane!: Airliner; // l'avion des vols du joueur
  traffic!: Airliner; // trafic d'ambiance
  flight: Flight | null = null;
  ambient: Flight | null = null;
  private ambientTimer = 20;
  private hud!: HTMLElement;
  private camMode = 0;
  private camPos = new THREE.Vector3();
  private camT = 0;
  private parked: Airliner[] = [];

  build() {
    for (const d of AIRPORTS) this.ports.push(this.buildPort(d));
    this.plane = buildAirliner("royal");
    G.scene.add(this.plane.root);
    this.parkAt(this.plane, this.ports[0], this.ports[0].gateStand);
    this.traffic = buildAirliner("zuria");
    this.traffic.root.visible = false;
    G.scene.add(this.traffic.root);
    this.hud = document.createElement("div");
    this.hud.className = "flight-hud";
    this.hud.hidden = true;
    document.body.appendChild(this.hud);
    this.hud.onclick = (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-f]")?.dataset.f;
      if (b === "view") this.camMode = (this.camMode + 1) % 4;
      if (b === "skip" && this.flight) this.finish(this.flight, true);
    };
    G.palace.updaters.push((dt, t) => this.update(dt, t));
  }

  // ---------------------------------------------------------------- construction d'un aéroport
  private buildPort(d: AirportDef): Port {
    const root = new THREE.Group();
    G.scene.add(root);
    const s = d.side;
    const W = (x: number, y: number, z: number) => new THREE.Vector3(d.x + x * s, d.h + y, d.z + z * s);
    const yawW = (y: number) => (s > 0 ? y : y + Math.PI);
    root.position.set(d.x, d.h, d.z);
    root.rotation.y = s > 0 ? 0 : Math.PI;
    const L = d.len;
    const big = d.big;
    const T = big ? 1200 : 460; // longueur de l'aérogare
    const A = big ? 1400 : 640; // largeur du tarmac
    const nGates = big ? 4 : 2;
    const taxiZ = 160;
    const solid = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, tag = "airport") => {
      const a = W(x1, y1, z1),
        b = W(x2, y2, z2);
      G.physics.addBox({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) }, { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) }, tag);
    };
    const flat = (w: number, d2: number, m: THREE.Material, x: number, y: number, z: number, ry = 0) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d2), m);
      p.rotation.x = -Math.PI / 2;
      p.rotation.z = ry;
      p.position.set(x, y, z);
      p.receiveShadow = true;
      root.add(p);
      return p;
    };
    const box = (w: number, h: number, dd: number, m: THREE.Material, x: number, y: number, z: number, isSolid = true) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), m);
      b.position.set(x, y + h / 2, z);
      b.castShadow = b.receiveShadow = true;
      root.add(b);
      if (isSolid) solid(x - w / 2, y, z - dd / 2, x + w / 2, y + h, z + dd / 2);
      return b;
    };
    const asphalt = new THREE.MeshStandardMaterial({ map: asphaltTex(), roughness: 0.9 });
    const concrete = new THREE.MeshStandardMaterial({ map: concreteTex(), roughness: 0.85 });
    const paintW = new THREE.MeshBasicMaterial({ color: 0xf2f2f2 });
    const paintY = new THREE.MeshBasicMaterial({ color: 0xf2c230 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x9fcfee, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false });
    const steel = new THREE.MeshStandardMaterial({ color: 0xd8dce4, metalness: 0.85, roughness: 0.3 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f3f6, roughness: 0.45 });
    const darkM = new THREE.MeshStandardMaterial({ color: 0x24262c, roughness: 0.6 });
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const inst = (geo: THREE.BufferGeometry, m: THREE.Material, pts: [number, number, number][], sc?: [number, number, number]) => {
      const im = new THREE.InstancedMesh(geo, m, pts.length);
      pts.forEach((p, i) => {
        m4.compose(new THREE.Vector3(...p), q, new THREE.Vector3(...(sc ?? [1, 1, 1])));
        im.setMatrixAt(i, m4);
      });
      root.add(im);
      return im;
    };

    // ---- piste : revêtement, axe, seuils (« touches de piano »), numéros, zones de toucher
    flat(L, 60, asphalt, 0, 0.06, 0);
    flat(L + 120, 90, new THREE.MeshStandardMaterial({ color: 0x6a6e62, roughness: 1 }), 0, 0.03, 0); // accotements
    const dash: [number, number, number][] = [];
    for (let x = -L / 2 + 160; x < L / 2 - 160; x += 60) dash.push([x, 0.08, 0]);
    inst(new THREE.PlaneGeometry(30, 0.9).rotateX(-Math.PI / 2), paintW, dash);
    for (const sz of [-1, 1]) flat(L - 10, 0.9, paintW, 0, 0.08, sz * 28.5); // bords
    for (const ex of [-1, 1]) {
      const thr: [number, number, number][] = [];
      for (let k = 0; k < 12; k++) thr.push([ex * (L / 2 - 30), 0.08, -25 + k * 4.5 + (k >= 6 ? 4.5 : 0)]);
      inst(new THREE.PlaneGeometry(30, 1.8).rotateX(-Math.PI / 2), paintW, thr);
      const zone: [number, number, number][] = [];
      for (let k = 0; k < 4; k++) for (const sz of [-1, 1]) zone.push([ex * (L / 2 - 150 - k * 150), 0.08, sz * 12]);
      inst(new THREE.PlaneGeometry(22, 3).rotateX(-Math.PI / 2), paintW, zone);
      const aim: [number, number, number][] = [[ex * (L / 2 - 330), 0.08, -10], [ex * (L / 2 - 330), 0.08, 10]];
      inst(new THREE.PlaneGeometry(50, 8).rotateX(-Math.PI / 2), paintW, aim);
      const num = flat(30, 15, new THREE.MeshBasicMaterial({ map: textTex(ex < 0 ? "09" : "27", "#f2f2f2", "rgba(0,0,0,0)", 200), transparent: true }), ex * (L / 2 - 75), 0.09, 0, ex < 0 ? -Math.PI / 2 : Math.PI / 2);
      void num;
    }
    // balisage : feux de bord (blancs), seuils (vert/rouge), rampes d'approche, PAPI
    const edge: [number, number, number][] = [];
    for (let x = -L / 2; x <= L / 2; x += 60) for (const sz of [-1, 1]) edge.push([x, 0.35, sz * 31]);
    inst(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xfff8e0, emissiveIntensity: 2.5 }), edge);
    const thrL: [number, number, number][] = [],
      endL: [number, number, number][] = [];
    for (let z = -28; z <= 28; z += 4) {
      thrL.push([-L / 2 - 2, 0.35, z]);
      endL.push([L / 2 + 2, 0.35, z]);
    }
    inst(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshStandardMaterial({ color: 0, emissive: 0x30ff60, emissiveIntensity: 3 }), thrL);
    inst(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff3030, emissiveIntensity: 3 }), endL);
    const appr: [number, number, number][] = [];
    for (const ex of [-1, 1])
      for (let k = 1; k <= 10; k++) {
        const x = ex * (L / 2 + k * 30);
        for (let z = -9; z <= 9; z += 3) appr.push([x, 1.2, z]);
      }
    inst(new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffffff, emissiveIntensity: 3 }), appr);
    const poles: [number, number, number][] = appr.filter((p) => Math.abs(p[2]) < 1).map((p) => [p[0], 0.6, 0]);
    inst(new THREE.CylinderGeometry(0.1, 0.1, 1.2, 6), steel, poles);
    for (let k = 0; k < 4; k++) {
      box(2, 1.2, 1.2, darkM, -L / 2 + 330, 0, -45 - k * 4, false);
      const pl = new THREE.Mesh(new THREE.CircleGeometry(0.4, 12), new THREE.MeshStandardMaterial({ color: 0, emissive: k < 2 ? 0xffffff : 0xff2020, emissiveIntensity: 3 }));
      pl.position.set(-L / 2 + 330 - 1.01, 0.6, -45 - k * 4);
      pl.rotation.y = -Math.PI / 2;
      root.add(pl);
    }

    // ---- taxiway + bretelles (axe jaune, feux bleus de bord)
    const connectors = [-L / 2 + 100, -L / 4, L / 4, L / 2 - 100];
    flat(L - 140, 23, asphalt, 0, 0.05, taxiZ);
    flat(L - 140, 0.4, paintY, 0, 0.08, taxiZ);
    const blue: [number, number, number][] = [];
    for (let x = -L / 2 + 70; x <= L / 2 - 70; x += 40) for (const sz of [-1, 1]) blue.push([x, 0.3, taxiZ + sz * 13]);
    for (const cx of connectors) {
      flat(23, taxiZ - 30, asphalt, cx, 0.05, (taxiZ + 30) / 2);
      flat(0.4, taxiZ - 30, paintY, cx, 0.08, (taxiZ + 30) / 2);
      for (let z = 40; z < taxiZ; z += 30) for (const sx of [-1, 1]) blue.push([cx + sx * 13, 0.3, z]);
      // panneau de bretelle
      const sgn = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.2), new THREE.MeshBasicMaterial({ map: textTex(`→ ${String.fromCharCode(65 + connectors.indexOf(cx))}`, "#111", "#f2c230", 64), side: THREE.DoubleSide }));
      sgn.position.set(cx + 18, 1.4, 50);
      root.add(sgn);
    }
    inst(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshStandardMaterial({ color: 0, emissive: 0x2a6aff, emissiveIntensity: 3 }), blue);
    // tarmac (béton) avec postes de stationnement
    flat(A, 250, concrete, 0, 0.04, 296);
    const xs: number[] = [];
    for (let k = 0; k < nGates; k++) xs.push(-((nGates - 1) * 300) / 2 / (big ? 1 : 1.5) + (k * 300) / (big ? 1 : 1.5));
    for (const x of xs) {
      flat(0.4, 120, paintY, x, 0.08, 330);
      flat(14, 0.5, paintY, x, 0.08, 392);
      const n = flat(10, 5, new THREE.MeshBasicMaterial({ map: textTex(`${xs.indexOf(x) + 1}`, "#f2c230", "rgba(0,0,0,0)", 160), transparent: true }), x + 9, 0.09, 380, Math.PI);
      void n;
    }

    // ---- aérogare (verre et acier, toit en vagues)
    const tz1 = 420,
      tz2 = 490,
      TH = big ? 24 : 14;
    flat(T, tz2 - tz1, new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.15, metalness: 0.1 }), 0, 0.12, (tz1 + tz2) / 2);
    solid(-T / 2, -2, tz1, T / 2, 0.12, tz2);
    // façades vitrées + montants
    for (const z of [tz1, tz2]) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(T, TH), glass);
      g.position.set(0, TH / 2, z);
      root.add(g);
      const mullions: [number, number, number][] = [];
      for (let x = -T / 2; x <= T / 2; x += 12) mullions.push([x, TH / 2, z]);
      inst(new THREE.BoxGeometry(0.35, TH, 0.35), steel, mullions);
    }
    for (const x of [-T / 2, T / 2]) box(1, TH, tz2 - tz1, white, x, 0, (tz1 + tz2) / 2);
    // murs physiques (côté pistes plein, côté ville avec portes)
    solid(-T / 2, 0, tz1 - 0.4, T / 2, TH, tz1 + 0.4);
    const doorsX = big ? [-400, 0, 400] : [0];
    let prev = -T / 2;
    for (const dx of doorsX) {
      solid(prev, 0, tz2 - 0.4, dx - 6, TH, tz2 + 0.4);
      const door = new THREE.Mesh(new THREE.PlaneGeometry(12, 4), new THREE.MeshStandardMaterial({ color: 0x0a1a2a, emissive: 0x3fa8ff, emissiveIntensity: 0.4, transparent: true, opacity: 0.5 }));
      door.position.set(dx, 2, tz2 + 0.3);
      root.add(door);
      prev = dx + 6;
    }
    solid(prev, 0, tz2 - 0.4, T / 2, TH, tz2 + 0.4);
    // toit ondulé
    const waves = big ? 6 : 3;
    for (let k = 0; k < waves; k++) {
      const seg = T / waves;
      const R = seg * 0.9;
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(R, R, tz2 - tz1 + 16, 40, 1, true, Math.PI - 0.45, 0.9), white);
      (roof.material as THREE.Material).side = THREE.DoubleSide;
      roof.rotation.x = Math.PI / 2;
      roof.position.set(-T / 2 + seg * (k + 0.5), TH + 4 - R, (tz1 + tz2) / 2);
      root.add(roof);
      const flatRoof = new THREE.Mesh(new THREE.BoxGeometry(seg, 1.2, tz2 - tz1 + 16), white);
      flatRoof.position.set(-T / 2 + seg * (k + 0.5), TH + 0.6, (tz1 + tz2) / 2);
      root.add(flatRoof);
      const sky = new THREE.Mesh(new THREE.BoxGeometry(seg * 0.6, 0.3, 10), glass);
      sky.position.set(-T / 2 + seg * (k + 0.5), TH + 1.3, (tz1 + tz2) / 2);
      root.add(sky);
    }
    solid(-T / 2, TH, tz1 - 8, T / 2, TH + 1.2, tz2 + 8);
    // grand nom lumineux sur la façade côté ville
    const name = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(T * 0.6, 260), Math.min(T * 0.6, 260) / 9), new THREE.MeshBasicMaterial({ map: textTex(d.name.toUpperCase(), "#ffffff", "#1b3f8f", 72) }));
    name.position.set(0, TH - 3, tz2 + 9);
    root.add(name);
    // intérieur : comptoirs d'enregistrement, écrans, tableaux des départs, sièges, portiques de sécurité
    const counter = new THREE.MeshStandardMaterial({ color: 0x2a3a5a, roughness: 0.4, metalness: 0.3 });
    const ncount = big ? 14 : 5;
    for (let k = 0; k < ncount; k++) {
      const x = -((ncount - 1) * 18) / 2 + k * 18;
      box(10, 1.1, 2, counter, x, 0.12, 470, true);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.2), new THREE.MeshBasicMaterial({ map: textTex(`ENREGISTREMENT ${k + 1}`, "#ffffff", "#1b3f8f", 44) }));
      scr.position.set(x, 3.4, 471.2);
      root.add(scr);
      const belt = new THREE.Mesh(new THREE.BoxGeometry(3, 0.5, 1.4), darkM);
      belt.position.set(x + 6, 0.37, 470);
      root.add(belt);
    }
    const board = new THREE.Mesh(new THREE.PlaneGeometry(26, 9), new THREE.MeshBasicMaterial({ map: departuresTex(d), side: THREE.DoubleSide }));
    board.position.set(0, 9, 455);
    root.add(board);
    box(1, 9, 1, steel, -12, 0.12, 455, false);
    box(1, 9, 1, steel, 12, 0.12, 455, false);
    for (let k = -2; k <= 2; k++) {
      box(3, 2.3, 0.4, darkM, k * 8, 0.12, 446, false); // portiques de sécurité
      box(0.4, 2.3, 2, darkM, k * 8 - 1.3, 0.12, 446, false);
    }
    const seats: [number, number, number][] = [];
    for (let k = 0; k < (big ? 40 : 12); k++) for (let r = 0; r < 3; r++) seats.push([-T / 2 + 30 + k * ((T - 60) / (big ? 40 : 12)), 0.55, 428 + r * 2.4]);
    inst(new THREE.BoxGeometry(5, 0.9, 0.8), new THREE.MeshStandardMaterial({ color: 0x3a4a6a, roughness: 0.7 }), seats);
    // plantes et colonnes
    const cols: [number, number, number][] = [];
    for (let x = -T / 2 + 40; x < T / 2; x += 80) cols.push([x, TH / 2, 438]);
    inst(new THREE.CylinderGeometry(0.6, 0.6, TH, 16), steel, cols);
    // éclairage intérieur
    G.palace.zones.push({
      contains: (p) => {
        const l = this.toLocal(d, p);
        return Math.abs(l.x) < T / 2 && l.z > tz1 && l.z < tz2 && l.y < TH;
      },
      lights: [-0.3, 0, 0.3].map((f) => ({ pos: W(f * T, TH - 3, 455), color: 0xfff2e0, intensity: 120, distance: 60 }))
    });

    // ---- passerelles télescopiques jusqu'aux portes des avions
    const stands = xs.map((x) => ({ x }));
    for (const x of xs) {
      const rot = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 3.6, 16), white);
      rot.position.set(x - 14, 5.6, 412);
      root.add(rot);
      const tube = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 26), new THREE.MeshStandardMaterial({ color: 0xc8ccd4, metalness: 0.6, roughness: 0.4 }));
      tube.position.set(x - 10.5, 5.6, 398);
      tube.rotation.y = -0.12;
      tube.castShadow = true;
      root.add(tube);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 4.2, 8), darkM);
      leg.position.set(x - 9.5, 2.1, 390);
      root.add(leg);
      const wheels = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 1), darkM);
      wheels.position.set(x - 9.5, 0.4, 390);
      root.add(wheels);
      const gateS = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.6), new THREE.MeshBasicMaterial({ map: textTex(`PORTE ${xs.indexOf(x) + 1}`, "#111", "#f2c230", 64), side: THREE.DoubleSide }));
      gateS.position.set(x - 14, 9, 420.6);
      root.add(gateS);
    }

    // ---- tour de contrôle + radar
    const TX = T / 2 + 130,
      TZ = 300,
      TOW = big ? 72 : 38;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(4, 6, TOW, 24), white);
    shaft.position.set(TX, TOW / 2, TZ);
    shaft.castShadow = true;
    root.add(shaft);
    solid(TX - 5, 0, TZ - 5, TX + 5, TOW, TZ + 5);
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(9, 7, 6, 8, 1, true), glass);
    cab.position.set(TX, TOW + 3, TZ);
    root.add(cab);
    const cabFloor = new THREE.Mesh(new THREE.CylinderGeometry(7, 6, 1.2, 8), darkM);
    cabFloor.position.set(TX, TOW, TZ);
    const cabRoof = new THREE.Mesh(new THREE.CylinderGeometry(9.6, 9.6, 1, 8), white);
    cabRoof.position.set(TX, TOW + 6.5, TZ);
    root.add(cabFloor, cabRoof);
    const radar = new THREE.Group();
    radar.position.set(TX, TOW + 7.6, TZ);
    const dish = new THREE.Mesh(new THREE.BoxGeometry(6, 1.4, 0.3), steel);
    dish.position.y = 1;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 2, 8), darkM);
    radar.add(dish, mast);
    root.add(radar);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff2020, emissiveIntensity: 3 }));
    beacon.position.set(TX, TOW + 10, TZ);
    root.add(beacon);

    // ---- hangars (voûtes) avec un avion en maintenance
    const nh = big ? 2 : 1;
    for (let k = 0; k < nh; k++) {
      const hx = T / 2 + 260 + k * 75,
        hz = 300;
      const vault = new THREE.Mesh(new THREE.CylinderGeometry(30, 30, 90, 32, 1, true, Math.PI / 2, Math.PI), new THREE.MeshStandardMaterial({ color: 0xb8bec8, metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide }));
      vault.rotation.x = Math.PI / 2;
      vault.position.set(hx, 0, hz);
      root.add(vault);
      solid(hx - 30, 0, hz + 42, hx + 30, 26, hz + 46);
      const inPlane = buildAirliner(k ? "zuria" : "royal");
      inPlane.root.position.set(hx, 0, hz + 5);
      inPlane.root.rotation.y = Math.PI;
      inPlane.update(0, 0, 1);
      root.add(inPlane.root);
      this.parked.push(inPlane);
    }

    // ---- véhicules de piste, manche à air, parking
    for (const x of xs) {
      // tracteur à bagages + chariots
      box(2.2, 1.4, 3, new THREE.MeshStandardMaterial({ color: 0xf2c230 }), x + 18, 0, 350, false);
      for (let k = 0; k < 3; k++) box(2, 1.2, 2.6, new THREE.MeshStandardMaterial({ color: 0x5a6a7a }), x + 18, 0.2, 354 + k * 3.4, false);
      // camion de carburant
      box(2.6, 2.4, 3, new THREE.MeshStandardMaterial({ color: 0xf0f0f0 }), x - 22, 0, 300, false);
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 7, 20), new THREE.MeshStandardMaterial({ color: 0xd8dce4, metalness: 0.8, roughness: 0.3 }));
      tank.rotation.x = Math.PI / 2;
      tank.position.set(x - 22, 1.9, 306);
      root.add(tank);
      // escalier mobile
      const st = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.3, 8), steel);
      st.position.set(x + 4, 2.2, 340);
      st.rotation.x = 0.45;
      root.add(st);
    }
    const sock = new THREE.Group();
    sock.position.set(-L / 2 + 250, 0, -60);
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 8, 8), steel);
    sp.position.y = 4;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.7, 4, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0xff6a1a, side: THREE.DoubleSide }));
    cone.rotation.z = Math.PI / 2;
    cone.position.set(2, 7.6, 0);
    sock.add(sp, cone);
    root.add(sock);
    // route d'accès et parking
    flat(T + 200, 22, asphalt, 0, 0.05, 512);
    flat(T + 200, 0.5, paintW, 0, 0.08, 512);
    flat(T, 110, asphalt, 0, 0.04, 585);
    const cars: [number, number, number][] = [];
    const lines: [number, number, number][] = [];
    for (let x = -T / 2 + 8; x < T / 2 - 8; x += 3.2)
      for (const z of [548, 566, 604, 622]) {
        lines.push([x - 1.6, 0.07, z]);
        if (Math.random() < 0.7) cars.push([x, 0.75, z]);
      }
    inst(new THREE.PlaneGeometry(0.15, 5.6).rotateX(-Math.PI / 2), paintW, lines);
    const carsM = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 1.4, 4.4), new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.6 }), cars.length);
    const col = new THREE.Color();
    cars.forEach((p, i) => {
      m4.compose(new THREE.Vector3(...p), q, new THREE.Vector3(1, 1, 1));
      carsM.setMatrixAt(i, m4);
      carsM.setColorAt(i, col.setHSL(Math.random(), 0.3 + Math.random() * 0.5, 0.25 + Math.random() * 0.5));
    });
    root.add(carsM);
    // lampadaires du parking
    const lamps: [number, number, number][] = [];
    for (let x = -T / 2; x <= T / 2; x += 60) lamps.push([x, 5, 585]);
    inst(new THREE.CylinderGeometry(0.15, 0.2, 10, 8), steel, lamps);
    inst(new THREE.BoxGeometry(2, 0.3, 0.6), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xfff0d0, emissiveIntensity: 2 }), lamps.map((p) => [p[0], 10, p[2]] as [number, number, number]));

    // ---- l'aérogare : interactions
    const hall = W(0, 0.2, 480);
    const kiosk = W(0, 0.2, 474);
    G.interact.add({ id: "airport-" + d.id, pos: kiosk.clone().add(new THREE.Vector3(0, 1, 0)), radius: 9, label: () => "✈ Comptoir : prendre un vol (gratuit)", action: () => bus.emit("ui:flight", d.id) });
    for (const dx of doorsX) G.interact.add({ id: `airport-${d.id}-door${dx}`, pos: W(dx, 1.2, tz2 + 6), radius: 6, label: () => "✈ Vols : voir les départs", action: () => bus.emit("ui:flight", d.id) });
    G.world.markers.push({ id: "airport-" + d.id, name: d.short === "Aéroport Royal" ? "Aéroport Royal" : "Aéroport — " + d.short, pos: W(0, 0, 400), icon: "✈", visible: () => true });
    const centre = W(0, 0, 250);
    G.palace.updaters.push((dt, t) => {
      root.visible = G.camera.position.distanceTo(centre) < 6500;
      if (!root.visible) return;
      radar.rotation.y += dt * 1.2;
      (beacon.material as THREE.MeshStandardMaterial).emissiveIntensity = Math.sin(t * 3) > 0 ? 3 : 0.3;
      cone.rotation.y = Math.sin(t * 0.4) * 0.5;
    });
    // avions garés aux autres portes
    const port: Port = { def: d, W, yawW, stands, gateStand: big ? 1 : 0, taxiZ, connectors, hall, root };
    stands.forEach((_, i) => {
      if (i === port.gateStand) return;
      const p = buildAirliner(i % 2 ? "princess" : "zuria");
      G.scene.add(p.root);
      this.parkAt(p, port, i);
      this.parked.push(p);
      G.palace.updaters.push(() => (p.root.visible = root.visible));
    });
    return port;
  }

  private toLocal(d: AirportDef, p: THREE.Vector3) {
    return new THREE.Vector3((p.x - d.x) * d.side, p.y - d.h, (p.z - d.z) * d.side);
  }

  private parkAt(plane: Airliner, port: Port, i: number) {
    const st = port.stands[i];
    plane.root.position.copy(port.W(st.x, 0, 352));
    plane.root.rotation.set(0, port.yawW(Math.PI), 0); // nez vers l'aérogare (+z local)
    plane.update(0, 0, 1);
  }

  // ---------------------------------------------------------------- vols
  /** Démarre un vol du joueur depuis l'aéroport `fromId` vers `toId`. */
  fly(fromId: string, toId: string): string {
    const from = this.ports.find((p) => p.def.id === fromId);
    const to = this.ports.find((p) => p.def.id === toId);
    if (!from || !to) return "Vol introuvable.";
    if (this.flight) return "Un vol est déjà en cours.";
    if (G.mode !== "foot") return "Descendez d'abord du véhicule.";
    this.parkAt(this.plane, from, from.gateStand);
    const f = this.makeFlight(this.plane, from, to, true);
    this.flight = f;
    G.mode = "cinematic";
    G.player.hideBody = true;
    this.hud.hidden = false;
    this.camPos.copy(G.camera.position);
    bus.emit("mode");
    bus.emit("fade");
    bus.emit("toast", { text: `✈ Bienvenue à bord du vol ${f.number} à destination de ${to.def.short}. Attachez vos ceintures !` });
    G.audio.tone(660, 0.3, "sine", 0.1);
    setTimeout(() => G.audio.tone(880, 0.4, "sine", 0.1), 300);
    return `Embarquement immédiat : vol ${f.number} vers ${to.def.short}.`;
  }

  private makeFlight(plane: Airliner, from: Port, to: Port, passenger: boolean): Flight {
    const st = from.stands[from.gateStand];
    const W = from.W;
    const L = from.def.len;
    const path = [W(st.x, 0, 300), W(st.x, 0, from.taxiZ), W(from.connectors[0], 0, from.taxiZ), W(from.connectors[0], 0, 0), W(L / 2, 0, 0)];
    return {
      plane,
      from,
      to,
      passenger,
      phase: passenger ? "board" : "line",
      path,
      v: 0,
      yaw: plane.root.rotation.y,
      pitch: 0,
      roll: 0,
      gear: 1,
      t: 0,
      pos: plane.root.position.clone(),
      number: (from.def.id === "royal" ? "RA " : "PA ") + (100 + Math.floor(Math.random() * 800))
    };
  }

  private finish(f: Flight, skip = false) {
    const to = f.to;
    if (skip || f.phase !== "done") this.parkAt(f.plane, to, to.gateStand);
    if (f.passenger) {
      this.flight = null;
      this.hud.hidden = true;
      G.mode = "foot";
      G.player.hideBody = false;
      G.player.teleport(to.hall.clone(), to.yawW(0));
      bus.emit("mode");
      bus.emit("toast", { text: `🛬 Bienvenue à ${to.def.short} ! Merci d'avoir voyagé avec Royal Airways.` });
    }
  }

  /** Avance la position/orientation de l'avion vers une cible au sol. */
  private steerGround(f: Flight, target: THREE.Vector3, speed: number, dt: number, reverse = false) {
    const to = target.clone().sub(f.pos);
    to.y = 0;
    const d = to.length();
    f.v = damp(f.v, speed, 1.5, dt);
    const step = Math.min(d, f.v * dt);
    if (d > 0.01) f.pos.addScaledVector(to.normalize(), step);
    if (!reverse && d > 1) {
      const want = Math.atan2(-to.x, -to.z);
      let dy = want - f.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      f.yaw += clamp(dy, -dt * 1.3, dt * 1.3);
    }
    f.pos.y = G.physics.terrain(f.pos.x, f.pos.z);
    return d < 2;
  }

  private stepFlight(f: Flight, dt: number, t: number) {
    f.t += dt;
    const p = f.plane;
    const fromW = f.from.W,
      toW = f.to.W;
    const Lt = f.to.def.len;
    const thrA = toW(-Lt / 2, 0, 0),
      thrB = toW(Lt / 2, 0, 0);
    const rwDir = thrB.clone().sub(thrA).normalize();
    const approachStart = thrA.clone().addScaledVector(rwDir, -6000);
    approachStart.y = f.to.def.h + 330;
    switch (f.phase) {
      case "board":
        if (f.t > 4) (f.phase = "push"), (f.t = 0);
        break;
      case "push":
        if (this.steerGround(f, f.path[0], 3, dt, true)) {
          f.path.shift();
          f.phase = "taxi";
        }
        break;
      case "taxi":
        if (this.steerGround(f, f.path[0], 24, dt)) {
          f.path.shift();
          if (f.path.length === 1) {
            f.phase = "line";
            f.t = 0;
          }
        }
        break;
      case "line": {
        // alignement sur la piste puis plein gaz
        const L = f.from.def.len;
        const a = fromW(-L / 2 + 100, 0, 0),
          b = fromW(L / 2, 0, 0);
        const dir = b.clone().sub(a).normalize();
        if (!f.passenger && f.t < 0.05) f.pos.copy(a);
        const want = Math.atan2(-dir.x, -dir.z);
        let dy = want - f.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        f.yaw += clamp(dy, -dt * 0.8, dt * 0.8);
        if (Math.abs(dy) < 0.02 && f.t > 1.5) {
          f.phase = "roll";
          f.t = 0;
          G.audio.whoosh(4, 120, 900, f.passenger ? 0.25 : 0.06);
        }
        break;
      }
      case "roll": {
        f.v += 3.6 * dt;
        const fwd = new THREE.Vector3(-Math.sin(f.yaw), 0, -Math.cos(f.yaw));
        f.pos.addScaledVector(fwd, f.v * dt);
        f.pos.y = G.physics.terrain(f.pos.x, f.pos.z);
        if (f.v > 78) {
          f.phase = "climb";
          f.t = 0;
        }
        break;
      }
      case "climb":
      case "cruise": {
        const target = f.phase === "climb" ? approachStart : approachStart;
        const to = target.clone().sub(f.pos);
        const horiz = Math.hypot(to.x, to.z);
        const want = Math.atan2(-to.x, -to.z);
        let dy = want - f.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        const climbing = f.phase === "climb";
        const turn = climbing && f.t < 8 ? 0 : clamp(dy, -dt * 0.22, dt * 0.22);
        f.yaw += turn;
        f.roll = damp(f.roll, -clamp(dy, -0.5, 0.5) * (climbing && f.t < 8 ? 0 : 1), 1.5, dt);
        const cruiseAlt = Math.max(f.from.def.h, f.to.def.h) + (horiz > 6000 ? 1500 : 330 + horiz * 0.2);
        const vyWant = clamp((cruiseAlt - f.pos.y) * 0.25, -18, 22);
        f.v = damp(f.v, climbing ? 140 : horiz > 4000 ? 260 : 120, 0.25, dt);
        const vy = damp(0, vyWant, 1, 1);
        f.pitch = damp(f.pitch, Math.atan2(vy, f.v) + (climbing && f.t < 6 ? 0.12 : 0), 1.5, dt);
        f.pos.addScaledVector(new THREE.Vector3(-Math.sin(f.yaw), 0, -Math.cos(f.yaw)), f.v * dt);
        f.pos.y += vy * dt;
        if (f.pos.y > f.from.def.h + 60) f.gear = Math.max(0, f.gear - dt * 0.4);
        if (climbing && f.t > 14) f.phase = "cruise";
        if (horiz < 1400 && f.phase === "cruise") {
          f.phase = "approach";
          f.t = 0;
          if (!f.passenger) f.plane.root.visible = true;
        }
        if (!f.passenger && f.phase === "cruise" && f.from === f.to && f.t > 25) f.phase = "done";
        break;
      }
      case "approach": {
        // descente stabilisée dans l'axe (~3°), train sorti
        const touch = thrA.clone().addScaledVector(rwDir, 250);
        const to = touch.clone().sub(f.pos);
        const horiz = Math.hypot(to.x, to.z);
        // poursuite d'un point de l'axe de piste 1,5 km devant : alignement en douceur
        const along = f.pos.clone().sub(thrA).dot(rwDir);
        const aim = thrA.clone().addScaledVector(rwDir, Math.min(along + 1500, 250));
        const toAim = aim.sub(f.pos);
        const want = Math.atan2(-toAim.x, -toAim.z);
        let dy = want - f.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        f.yaw += clamp(dy, -dt * 0.3, dt * 0.3);
        f.roll = damp(f.roll, -clamp(dy, -0.4, 0.4), 2, dt);
        f.v = damp(f.v, 82, 0.4, dt);
        const glide = f.to.def.h + horiz * Math.tan(0.052);
        const vy = clamp((glide - f.pos.y) * 0.6, -14, 4);
        f.pitch = damp(f.pitch, 0.06, 1, dt);
        f.pos.addScaledVector(new THREE.Vector3(-Math.sin(f.yaw), 0, -Math.cos(f.yaw)), f.v * dt);
        f.pos.y += vy * dt;
        f.gear = Math.min(1, f.gear + dt * 0.3);
        if (horiz < 40 || f.pos.y <= f.to.def.h + 0.3) {
          f.phase = "rollout";
          f.pos.y = f.to.def.h;
          f.t = 0;
          G.audio.tone(90, 0.4, "sawtooth", 0.08, 50);
          bus.emit("shake", 0.3);
        }
        break;
      }
      case "rollout": {
        f.v = Math.max(14, f.v - 4.2 * dt);
        f.pitch = damp(f.pitch, 0, 2, dt);
        f.roll = damp(f.roll, 0, 2, dt);
        f.pos.addScaledVector(new THREE.Vector3(-Math.sin(f.yaw), 0, -Math.cos(f.yaw)), f.v * dt);
        f.pos.y = G.physics.terrain(f.pos.x, f.pos.z);
        const along = f.pos.clone().sub(thrA).dot(rwDir);
        const exitX = f.to.connectors[2] + Lt / 2; // distance depuis le seuil A
        if (along > exitX - 20 && f.v <= 15) {
          const st = f.to.stands[f.to.gateStand];
          f.path = [toW(f.to.connectors[2], 0, 0), toW(f.to.connectors[2], 0, f.to.taxiZ), toW(st.x, 0, f.to.taxiZ), toW(st.x, 0, 300), toW(st.x, 0, 352)];
          f.phase = "taxiin";
        }
        break;
      }
      case "taxiin":
        if (this.steerGround(f, f.path[0], f.path.length === 1 ? 5 : 22, dt)) {
          f.path.shift();
          if (!f.path.length) {
            f.phase = "done";
            const st = f.to.stands[f.to.gateStand];
            f.pos.copy(toW(st.x, 0, 352));
            f.yaw = f.to.yawW(Math.PI);
          }
        }
        break;
    }
    p.root.position.copy(f.pos);
    p.root.rotation.set(0, 0, 0);
    p.root.rotation.order = "YXZ";
    p.root.rotation.set(f.pitch, f.yaw, f.roll);
    p.update(dt, t, f.gear);
  }

  // ---------------------------------------------------------------- caméra et HUD de vol
  private flightCamera(f: Flight, dt: number) {
    const p = f.plane.root;
    p.updateMatrixWorld();
    this.camT += dt;
    let want: THREE.Vector3, look: THREE.Vector3;
    const mode = this.camMode;
    if (mode === 0) {
      // extérieur : derrière et au-dessus
      want = p.localToWorld(new THREE.Vector3(0, 14, 70));
      look = p.localToWorld(new THREE.Vector3(0, 4, -20));
    } else if (mode === 1) {
      // hublot : vue sur l'aile et le réacteur
      want = p.localToWorld(new THREE.Vector3(1.6, 3.6, 2.5));
      look = p.localToWorld(new THREE.Vector3(14, 1.6, 4));
    } else if (mode === 2) {
      // poste de pilotage
      want = p.localToWorld(new THREE.Vector3(0, 3.9, -16.6));
      look = p.localToWorld(new THREE.Vector3(0, 3.2, -60));
    } else {
      // cinématique : de côté, en orbite lente
      const a = this.camT * 0.15;
      want = p.localToWorld(new THREE.Vector3(Math.cos(a) * 60, 10, Math.sin(a) * 60));
      look = p.position.clone();
    }
    if (mode === 1 || mode === 2 || this.camPos.distanceTo(want) > 400) this.camPos.copy(want);
    else this.camPos.lerp(want, 1 - Math.exp(-dt * 4));
    G.camera.position.copy(this.camPos);
    if (mode === 2) G.camera.up.copy(new THREE.Vector3(0, 1, 0).applyQuaternion(p.quaternion));
    else G.camera.up.set(0, 1, 0);
    G.camera.lookAt(look);
    G.camera.up.set(0, 1, 0);
    G.player.position.copy(p.position);
    const alt = Math.max(0, Math.round(f.pos.y - G.physics.terrain(f.pos.x, f.pos.z)));
    const kmh = Math.round(f.v * 3.6);
    const label: Record<Phase, string> = {
      board: "Embarquement…",
      push: "Repoussage",
      taxi: "Roulage vers la piste",
      line: "Alignement sur la piste",
      roll: "Décollage !",
      climb: "Montée",
      cruise: "Croisière",
      approach: "Approche finale",
      flare: "Arrondi",
      rollout: "Atterrissage",
      taxiin: "Roulage vers la porte",
      done: "Arrivée"
    };
    const dist = Math.round(f.pos.distanceTo(f.to.W(0, 0, 0)) / 100) / 10;
    this.hud.innerHTML = `<div class="fh-row"><b>✈ ${f.number}</b> · Royal Airways · ➜ ${f.to.def.short}</div>
      <div class="fh-row"><span>${label[f.phase]}</span><span>ALT ${alt} m</span><span>${kmh} km/h</span><span>${dist} km</span></div>
      <div class="fh-row"><button data-f="view">🎥 Vue : ${["Extérieur", "Hublot", "Cockpit", "Cinéma"][mode]}</button><button data-f="skip">⏩ Arriver</button></div>`;
  }

  update(dt: number, t: number) {
    for (const p of this.parked) if (p.root.visible) p.update(dt, t, 1);
    const f = this.flight;
    if (f) {
      this.stepFlight(f, dt, t);
      if (G.input.hit("KeyV")) this.camMode = (this.camMode + 1) % 4;
      this.flightCamera(f, dt);
      if (f.phase === "done") this.finish(f);
    } else this.plane.update(dt, t, 1);
    // trafic d'ambiance à l'aéroport royal : décollages réguliers
    const home = this.ports[0];
    if (!this.ambient) {
      this.ambientTimer -= dt;
      if (this.ambientTimer < 0 && G.camera.position.distanceTo(home.W(0, 0, 0)) < 6000) {
        this.traffic.root.visible = true;
        const a = this.makeFlight(this.traffic, home, home, false);
        a.pos.copy(home.W(-home.def.len / 2 + 100, 0, 0));
        a.yaw = home.yawW(-Math.PI / 2);
        a.phase = "line";
        this.ambient = a;
      }
    } else {
      this.stepFlight(this.ambient, dt, t);
      if (this.ambient.phase === "cruise" && this.ambient.t > 22) {
        this.traffic.root.visible = false;
        this.ambient = null;
        this.ambientTimer = 45;
      }
    }
  }
}

// ---------------------------------------------------------------- textures
function asphaltTex() {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 256;
  const c = cv.getContext("2d")!;
  c.fillStyle = "#2a2c30";
  c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3000; i++) {
    c.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`;
    c.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5);
  }
  for (let i = 0; i < 12; i++) {
    c.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.08})`;
    c.fillRect(Math.random() * 256, 0, 6 + Math.random() * 20, 256); // traces de pneus
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(60, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function concreteTex() {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 256;
  const c = cv.getContext("2d")!;
  c.fillStyle = "#a8aaa6";
  c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2500; i++) {
    c.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`;
    c.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  c.strokeStyle = "rgba(60,60,60,0.5)";
  c.lineWidth = 2;
  c.strokeRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(60, 12);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function textTex(text: string, fg: string, bg: string, size = 64) {
  const cv = document.createElement("canvas");
  cv.width = 1024;
  cv.height = Math.round(size * 1.8);
  const c = cv.getContext("2d")!;
  c.fillStyle = bg;
  c.fillRect(0, 0, cv.width, cv.height);
  c.fillStyle = fg;
  c.font = `bold ${size}px Arial`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(text, 512, cv.height / 2);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function departuresTex(d: AirportDef) {
  const cv = document.createElement("canvas");
  cv.width = 1024;
  cv.height = 360;
  const c = cv.getContext("2d")!;
  c.fillStyle = "#0a0f1a";
  c.fillRect(0, 0, 1024, 360);
  c.fillStyle = "#f2c230";
  c.font = "bold 40px Arial";
  c.fillText("DÉPARTS — DEPARTURES", 24, 50);
  c.font = "28px monospace";
  const rows =
    d.id === "royal"
      ? [["RA 214", "CITÉ DES PRINCESSES", "PORTE 2", "EMBARQUEMENT"], ["RA 330", "VOL PANORAMIQUE", "PORTE 2", "À L'HEURE"], ["ZA 118", "ZURIA", "PORTE 3", "À L'HEURE"], ["PA 507", "SOLARIA", "PORTE 4", "RETARDÉ"], ["RA 902", "NORDHAVEN", "PORTE 1", "À L'HEURE"]]
      : [["PA 215", "AÉROPORT ROYAL", "PORTE 1", "EMBARQUEMENT"], ["PA 331", "VOL PANORAMIQUE", "PORTE 1", "À L'HEURE"], ["PA 640", "TROPICA", "PORTE 2", "À L'HEURE"]];
  rows.forEach((r, i) => {
    const y = 110 + i * 50;
    c.fillStyle = i % 2 ? "#121a2a" : "#0e1524";
    c.fillRect(16, y - 34, 992, 46);
    c.fillStyle = "#ffffff";
    c.fillText(r[0], 30, y);
    c.fillText(r[1], 190, y);
    c.fillText(r[2], 640, y);
    c.fillStyle = r[3] === "RETARDÉ" ? "#ff6a5a" : r[3] === "EMBARQUEMENT" ? "#5aff9a" : "#9fd8ff";
    c.fillText(r[3], 800, y);
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
void lerp;
void mat;
