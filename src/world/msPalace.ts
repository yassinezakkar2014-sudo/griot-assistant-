// LE PALAIS DES PRINCESSES — grand palais blanc, rose et or, au cœur de leur cité.
// Hall à fontaine, salon avec écran géant, cuisine et salle à manger, deux grandes chambres
// (chambre Améthyste à l'ouest, chambre Turquoise à l'est) avec salle de bain et dressing, cinéma,
// spa avec jacuzzi et salle de sport, piscine à débordement avec plongeoir, transats et palmiers.
import * as THREE from "three";
import { G, bus } from "../core";
import { mat } from "./materials";
import { wallX, wallZ } from "./build";
import { COUNTRIES } from "./countryData";

export function buildMSPalace() {
  const c = COUNTRIES.find((k) => k.id === "princesses");
  if (!c) return;
  const cx = c.x,
    cz = c.z;
  const root = new THREE.Group();
  G.scene.add(root);
  const y0 = G.physics.terrain(cx, cz);
  const Y = y0 + 1.2; // sol du palais
  const H = 9;
  const white = new THREE.MeshStandardMaterial({ color: 0xeee8e0, roughness: 0.5, metalness: 0.05 });
  const rose = new THREE.MeshStandardMaterial({ color: 0xf2c8d6, roughness: 0.5 });
  const marble = new THREE.MeshStandardMaterial({ color: 0xe6ded4, roughness: 0.3, metalness: 0.1, map: mat.marble.map ?? null });
  const gold = mat.gold;
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.25, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false });
  const water = new THREE.MeshStandardMaterial({ color: 0x2ab0e8, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.82, emissive: 0x0a4a6a, emissiveIntensity: 0.4 });
  const violet = new THREE.MeshStandardMaterial({ color: 0x8a4ab8, roughness: 0.8 });
  const turq = new THREE.MeshStandardMaterial({ color: 0x2ab8b0, roughness: 0.8 });
  const linen = new THREE.MeshStandardMaterial({ color: 0xfaf6ee, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1b20, roughness: 0.5 });
  const wood = mat.wood;

  const add = (o: THREE.Object3D) => {
    o.traverse((m) => {
      if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).castShadow = (m as THREE.Mesh).receiveShadow = true;
    });
    root.add(o);
    return o;
  };
  /** boîte en coordonnées locales (x, z relatifs au centre ; y relatif au sol du palais) */
  const B = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, m: THREE.Material, solid = true) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(x2 - x1, y2 - y1, z2 - z1), m);
    b.position.set(cx + (x1 + x2) / 2, Y + (y1 + y2) / 2, cz + (z1 + z2) / 2);
    add(b);
    if (solid) G.physics.addBox({ x: cx + x1, y: Y + y1, z: cz + z1 }, { x: cx + x2, y: Y + y2, z: cz + z2 }, "ms");
    return b;
  };
  const sign = (text: string, x: number, y: number, z: number, ry: number, w = 10, color = "#d8b25a") => {
    const cv = document.createElement("canvas");
    cv.width = 1024;
    cv.height = 180;
    const g = cv.getContext("2d")!;
    g.fillStyle = "rgba(255,255,255,0.92)";
    g.fillRect(0, 0, 1024, 180);
    g.strokeStyle = color;
    g.lineWidth = 10;
    g.strokeRect(6, 6, 1012, 168);
    g.fillStyle = color;
    g.font = "italic bold 70px Georgia, serif";
    g.textAlign = "center";
    g.fillText(text, 512, 112);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, (w * 180) / 1024), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }));
    m.position.set(cx + x, Y + y, cz + z);
    m.rotation.y = ry;
    root.add(m);
  };

  // ---------------------------------------------------------------- socle, sol, toit
  B(-78, -1.2 - 2, -28, 78, 0, 98, white); // socle (dessus = sol du palais)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(140, 110), marble);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, Y + 0.02, cz + 35);
  root.add(floor);
  // marches d'entrée (au sud)
  for (let k = 0; k < 3; k++) B(-14, -1.2 + k * 0.4 - 2, -28 - (3 - k) * 1.4, 14, -0.8 + k * 0.4, -28, white);
  B(-70, H, -20, 70, H + 0.8, 90, white, false); // toit
  // corniche dorée
  B(-71, H + 0.8, -21, 71, H + 1.2, -20, gold, false);
  // façade : colonnes et grande porte
  for (let x = -66; x <= 66; x += 12) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1, H, 20), white);
    col.position.set(cx + x, Y + H / 2, cz - 23);
    add(col);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 2.4), gold);
    cap.position.set(cx + x, Y + H - 0.25, cz - 23);
    root.add(cap);
  }
  B(-71, H - 0.2, -25, 71, H + 0.8, -21, white, false); // portique
  // dôme rose et or au-dessus du hall
  const dome = new THREE.Mesh(new THREE.SphereGeometry(16, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), rose);
  dome.position.set(cx, Y + H + 0.8, cz + 5);
  add(dome);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(1.4, 6, 16), gold);
  tip.position.set(cx, Y + H + 0.8 + 16 + 3, cz + 5);
  root.add(tip);
  // tourelles d'angle
  for (const sx of [-1, 1])
    for (const sz of [-20, 90]) {
      const tw = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.5, H + 8, 24), white);
      tw.position.set(cx + sx * 70, Y + (H + 8) / 2, cz + sz);
      add(tw);
      G.physics.addBox({ x: cx + sx * 70 - 4, y: Y, z: cz + sz - 4 }, { x: cx + sx * 70 + 4, y: Y + H + 8, z: cz + sz + 4 }, "ms");
      const rf = new THREE.Mesh(new THREE.ConeGeometry(6.2, 9, 24), rose);
      rf.position.set(cx + sx * 70, Y + H + 8 + 4.5, cz + sz);
      root.add(rf);
    }
  sign("Palais des Princesses", 0, H + 3.4, -25.6, Math.PI, 30);

  // ---------------------------------------------------------------- murs et pièces
  const D = { w: 4, h: 4.2 }; // passages
  // enceinte (porte principale au sud)
  wallX(root, cz - 20, cx - 70, cx + 70, Y, H, white, [{ c: cx, w: 8, h: 6.5 }]);
  wallX(root, cz + 90, cx - 70, cx + 70, Y, H, white, [{ c: cx, w: 10, h: 5 }]); // baie vers la piscine
  wallZ(root, cx - 70, cz - 20, cz + 90, Y, H, white, []);
  wallZ(root, cx + 70, cz - 20, cz + 90, Y, H, white, []);
  // ailes : séparation hall/ailes (x = ±20)
  for (const sx of [-1, 1]) wallZ(root, cx + sx * 20, cz - 20, cz + 90, Y, H, white, [{ c: cz + 0, ...D }, { c: cz + 27, ...D }, { c: cz + 65, ...D }]);
  // pièces du centre : hall | salon | cuisine
  wallX(root, cz + 25, cx - 20, cx + 20, Y, H, white, [{ c: cx, w: 10, h: 6 }]);
  wallX(root, cz + 60, cx - 20, cx + 20, Y, H, white, [{ c: cx - 8, ...D }, { c: cx + 8, ...D }]);
  // ailes : cinéma/spa | salles de bain | chambres
  for (const sx of [-1, 1]) {
    wallX(root, cz + 15, sx < 0 ? cx - 70 : cx + 20, sx < 0 ? cx - 20 : cx + 70, Y, H, white, [{ c: cx + sx * 45, ...D }]);
    wallX(root, cz + 40, sx < 0 ? cx - 70 : cx + 20, sx < 0 ? cx - 20 : cx + 70, Y, H, white, [{ c: cx + sx * 30, ...D }]);
  }

  // ---------------------------------------------------------------- HALL : fontaine + escalier décoratif
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.2, 0.8, 40), white);
  basin.position.set(cx, Y + 0.4, cz + 4);
  add(basin);
  G.physics.addBox({ x: cx - 4.2, y: Y, z: cz - 0.2 }, { x: cx + 4.2, y: Y + 0.8, z: cz + 8.2 }, "ms");
  const fw = new THREE.Mesh(new THREE.CircleGeometry(4.6, 40), water);
  fw.rotation.x = -Math.PI / 2;
  fw.position.set(cx, Y + 0.75, cz + 4);
  root.add(fw);
  const statue = new THREE.Mesh(new THREE.TorusKnotGeometry(1.2, 0.35, 120, 16), gold);
  statue.position.set(cx, Y + 3.2, cz + 4);
  root.add(statue);
  const carpetM = new THREE.MeshStandardMaterial({ color: 0xc83a6a, roughness: 0.95 });
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(4, 13), carpetM);
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.set(cx, Y + 0.04, cz - 12);
  root.add(carpet);
  const chand = new THREE.Mesh(new THREE.TorusGeometry(3, 0.25, 8, 40), mat.glowGold);
  chand.rotation.x = Math.PI / 2;
  chand.position.set(cx, Y + H - 1.6, cz + 4);
  root.add(chand);

  // ---------------------------------------------------------------- SALON
  for (const sx of [-1, 1]) {
    B(sx * 12 - 1.2, 0, 32, sx * 12 + 1.2, 0.5, 50, violet);
    B(sx * 13.4 - 0.4, 0, 32, sx * 13.4 + 0.4, 1.3, 50, violet, false);
  }
  B(-4, 0, 38, 4, 0.45, 44, marble);
  B(-5.6, 1.2, 59, 5.6, 6.6, 59.6, dark, false); // écran géant (entre les deux portes)
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 4.6), new THREE.MeshBasicMaterial({ map: welcomeTex() }));
  screen.position.set(cx, Y + 3.9, cz + 58.9);
  screen.rotation.y = Math.PI;
  root.add(screen);
  G.interact.add({ id: "ms-sofa", pos: new THREE.Vector3(cx - 10, Y + 1, cz + 41), radius: 4, label: () => "S'asseoir dans le salon", action: () => G.player.sit(new THREE.Vector3(cx - 12, Y + 0.5 + 0.75, cz + 41), -Math.PI / 2) });

  // ---------------------------------------------------------------- CUISINE + SALLE À MANGER
  B(-18, 0, 84, 18, 1.0, 88, marble); // plan de travail
  B(-18, 1.0, 84, 18, 1.05, 88, dark, false);
  B(-6, 0, 70, 6, 0.85, 76, wood); // table
  for (let k = -2; k <= 2; k++) for (const sz of [68.5, 77.5]) B(k * 2.4 - 0.4, 0, sz - 0.4, k * 2.4 + 0.4, 0.5, sz + 0.4, rose, false);
  B(14, 0, 62, 18, 2.6, 66, mat.silver); // frigo
  G.interact.add({ id: "ms-kitchen", pos: new THREE.Vector3(cx, Y + 1, cz + 82), radius: 5, label: () => "Préparer un repas", action: () => bus.emit("toast", { text: "🍽️ Un délicieux repas est servi pour les princesses !" }) });

  // ---------------------------------------------------------------- CHAMBRES (Améthyste à l'ouest, Turquoise à l'est)
  const bedroom = (sx: number, who: string, theme: THREE.Material, accent: string) => {
    const bx = sx * 45;
    B(bx - 5, 0, 76, bx + 5, 0.7, 88, wood); // lit king size
    B(bx - 4.8, 0.7, 76.2, bx + 4.8, 1.0, 87.8, linen, false);
    B(bx - 4.8, 1.0, 76.2, bx + 4.8, 1.08, 82, theme, false); // couverture
    B(bx - 5, 0, 88, bx + 5, 3.4, 88.6, theme, false); // tête de lit
    for (const ox of [-2.3, 2.3]) B(bx + ox - 1.6, 1.0, 85.8, bx + ox + 1.6, 1.5, 87.4, linen, false); // oreillers
    for (const ox of [-7, 7]) {
      B(bx + ox - 1, 0, 85, bx + ox + 1, 1, 87, wood);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), mat.glowGold);
      lamp.position.set(cx + bx + ox, Y + 1.5, cz + 86);
      root.add(lamp);
    }
    const rug = new THREE.Mesh(new THREE.CircleGeometry(7, 40), theme);
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(cx + bx, Y + 0.04, cz + 70);
    root.add(rug);
    B(bx + sx * 22 - 1, 0, 50, bx + sx * 22 + 1, 3.2, 64, wood); // dressing
    B(bx - sx * 18 - 2.5, 0, 44, bx - sx * 18 + 2.5, 0.9, 46.5, gold); // coiffeuse
    const mirror = new THREE.Mesh(new THREE.CircleGeometry(1.4, 32), new THREE.MeshStandardMaterial({ color: 0xdfe8ff, metalness: 1, roughness: 0.03 }));
    mirror.position.set(cx + bx - sx * 18, Y + 2.6, cz + 40.7);
    root.add(mirror);
    // grande baie vitrée
    const win = new THREE.Mesh(new THREE.PlaneGeometry(14, 5), glass);
    win.position.set(cx + sx * 69.6, Y + 4, cz + 65);
    win.rotation.y = Math.PI / 2;
    root.add(win);
    sign(`Chambre ${who}`, bx, 7, 40.7, 0, 12, accent);
    G.interact.add({
      id: "ms-bed-" + sx,
      pos: new THREE.Vector3(cx + bx, Y + 1, cz + 74),
      radius: 4,
      label: () => `Dormir (chambre ${who})`,
      action: () => {
        bus.emit("fade");
        G.env.setHour(8);
        G.player.sit(new THREE.Vector3(cx + bx, Y + 1.1 + 0.75, cz + 80), Math.PI);
        bus.emit("toast", { text: `😴 Bonne nuit dans la chambre ${who}… ☀️ Bonjour !` });
      }
    });
    // salle de bain : baignoire + vasque
    B(bx - 6, 0, 18, bx + 6, 1, 24, white);
    const bath = new THREE.Mesh(new THREE.PlaneGeometry(11, 5), water);
    bath.rotation.x = -Math.PI / 2;
    bath.position.set(cx + bx, Y + 1.02, cz + 21);
    root.add(bath);
    B(bx + sx * 18 - 1.5, 0, 34, bx + sx * 18 + 1.5, 1, 39, marble);
    sign(`Salle de bain — ${who}`, bx, 7, 15.3, 0, 10, accent);
  };
  bedroom(-1, "Améthyste", violet, "#8a4ab8");
  bedroom(1, "Turquoise", turq, "#1f9a94");

  // ---------------------------------------------------------------- CINÉMA (aile ouest)
  B(-68, 1, -19.4, -22, 8, -19, dark, false);
  const film = new THREE.Mesh(new THREE.PlaneGeometry(40, 6), new THREE.MeshBasicMaterial({ map: welcomeTex("🎬 Cinéma des Princesses") }));
  film.position.set(cx - 45, Y + 4.5, cz - 18.9);
  root.add(film);
  for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) B(-60 + k * 6.5, r * 0.4, -6 + r * 6, -55.5 + k * 6.5, 0.9 + r * 0.4, -3 + r * 6, new THREE.MeshStandardMaterial({ color: 0x8a1f2a, roughness: 0.9 }), false);
  G.interact.add({ id: "ms-cinema", pos: new THREE.Vector3(cx - 45, Y + 1, cz + 2), radius: 6, label: () => "Regarder un film", action: () => G.player.sit(new THREE.Vector3(cx - 45, Y + 1.3 + 0.75, cz + 6), Math.PI) });
  sign("Cinéma", -45, 7.4, 14.7, Math.PI, 8);

  // ---------------------------------------------------------------- SPA + SALLE DE SPORT (aile est)
  const jac = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.9, 32), white);
  jac.position.set(cx + 34, Y + 0.45, cz);
  add(jac);
  G.physics.addBox({ x: cx + 30.5, y: Y, z: cz - 3.5 }, { x: cx + 37.5, y: Y + 0.9, z: cz + 3.5 }, "ms");
  const jw = new THREE.Mesh(new THREE.CircleGeometry(3.6, 32), water);
  jw.rotation.x = -Math.PI / 2;
  jw.position.set(cx + 34, Y + 0.85, cz);
  root.add(jw);
  for (let k = 0; k < 3; k++) {
    B(52 + k * 5, 0, -12, 54 + k * 5, 1.2, -6, dark); // appareils de sport
    B(52 + k * 5, 1.2, -12, 54 + k * 5, 1.4, -10, mat.silver, false);
  }
  G.interact.add({ id: "ms-jacuzzi", pos: new THREE.Vector3(cx + 34, Y + 1, cz - 5), radius: 5, label: () => "Se détendre dans le jacuzzi", action: () => { G.player.sit(new THREE.Vector3(cx + 34, Y + 0.6 + 0.75, cz), 0); bus.emit("toast", { text: "🫧 Bulles chaudes… détente totale." }); } });
  sign("Spa & sport", 45, 7.4, 14.7, Math.PI, 9);

  // ---------------------------------------------------------------- PISCINE À DÉBORDEMENT (au nord)
  B(-55, -1.2 - 2, 90, 55, 0, 100, white); // terrasse sud de la piscine
  B(-55, -1.2 - 2, 130, 55, 0, 142, white); // terrasse nord
  B(-55, -1.2 - 2, 100, -40, 0, 130, white);
  B(40, -1.2 - 2, 100, 55, 0, 130, white);
  // bassin (fond 2 m plus bas) + marches pour sortir
  B(-40, -2.4, 100, 40, -2.2, 130, new THREE.MeshStandardMaterial({ color: 0x5ac8f0, roughness: 0.4 }));
  for (let k = 0; k < 4; k++) B(36 + k, -2.2, 100, 40, -1.7 + k * 0.5, 108, white); // marches (de plus en plus hautes vers le bord)
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(80, 30), water);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(cx, Y - 0.25, cz + 115);
  root.add(pool);
  // plongeoir, transats, parasols, palmiers
  B(-38, 0, 100, -34, 0.5, 106, mat.silver);
  B(-37, 1.5, 100, -35, 1.7, 108, white, false);
  for (let k = 0; k < 6; k++) {
    const x = -48 + (k % 2) * 96 - (k % 2 ? 6 : 0);
    const z = 104 + Math.floor(k / 2) * 9;
    B(x - 1, 0, z - 2.5, x + 1, 0.5, z + 2.5, k % 2 ? turq : violet, false);
    const um = new THREE.Mesh(new THREE.ConeGeometry(2.8, 1, 16), k % 2 ? turq : rose);
    um.position.set(cx + x + (k % 2 ? -3 : 3), Y + 3.2, cz + z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 8), mat.silver);
    pole.position.set(cx + x + (k % 2 ? -3 : 3), Y + 1.5, cz + z);
    root.add(um, pole);
  }
  const palmM = new THREE.MeshStandardMaterial({ color: 0x3d7a2e, flatShading: true });
  for (const [x, z] of [[-60, 95], [60, 95], [-60, 136], [60, 136], [-30, 140], [30, 140]]) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 10, 8), wood);
    trunk.position.set(cx + x, Y + 5, cz + z);
    const top = new THREE.Mesh(new THREE.ConeGeometry(3.5, 1.6, 9), palmM);
    top.position.set(cx + x, Y + 10.2, cz + z);
    root.add(trunk, top);
  }
  sign("Piscine des Princesses", 0, 4, 141.5, Math.PI, 16, "#1f9ad8");
  G.interact.add({
    id: "ms-pool",
    pos: new THREE.Vector3(cx - 36, Y + 1, cz + 99),
    radius: 5,
    label: () => "Plonger dans la piscine",
    action: () => {
      G.player.teleport(new THREE.Vector3(cx - 30, Y - 2.2, cz + 112), 0);
      bus.emit("toast", { text: "💦 Plouf ! L'eau est parfaite. (Les marches pour sortir sont à l'est du bassin.)" });
      G.audio.whoosh(0.6, 1400, 200, 0.2);
    }
  });

  // ---------------------------------------------------------------- jardins et allée d'honneur (au sud)
  const hedge = new THREE.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 0.95 });
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 6; k++) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(10, 1.6, 2), hedge);
      h.position.set(cx + sx * 20, y0 + 0.8, cz - 40 - k * 8);
      root.add(h);
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), new THREE.MeshStandardMaterial({ color: [0xff6aa8, 0xffd23a, 0xb46bff][k % 3] }));
      fl.position.set(cx + sx * 26, y0 + 0.6, cz - 40 - k * 8);
      root.add(fl);
    }
  }

  // ---------------------------------------------------------------- éclairage intérieur
  G.palace.zones.push({
    contains: (p) => p.x > cx - 72 && p.x < cx + 72 && p.z > cz - 22 && p.z < cz + 92 && p.y < Y + H + 2,
    lights: [
      { pos: new THREE.Vector3(cx, Y + 7, cz + 4), color: 0xffe0c0, intensity: 60, distance: 30 },
      { pos: new THREE.Vector3(cx, Y + 7, cz + 42), color: 0xffd8e8, intensity: 55, distance: 28 },
      { pos: new THREE.Vector3(cx - 45, Y + 7, cz + 70), color: 0xe0c8ff, intensity: 55, distance: 30 },
      { pos: new THREE.Vector3(cx + 45, Y + 7, cz + 70), color: 0xc8fff4, intensity: 55, distance: 30 },
      { pos: new THREE.Vector3(cx - 45, Y + 7, cz), color: 0xff9ab8, intensity: 45, distance: 26 },
      { pos: new THREE.Vector3(cx + 45, Y + 7, cz), color: 0x9fe8ff, intensity: 45, distance: 26 }
    ]
  });
  const centre = new THREE.Vector3(cx, y0, cz);
  root.visible = false;
  G.palace.updaters.push((_dt, t) => {
    root.visible = G.camera.position.distanceTo(centre) < 4500;
    if (root.visible) statue.rotation.y = t * 0.4;
  });
  G.world.markers.push({ id: "ms-palace", name: "Palais des Princesses", pos: centre.clone(), icon: "♥", visible: () => true });
}

function welcomeTex(text = "Bienvenue au Palais des Princesses ♥") {
  const cv = document.createElement("canvas");
  cv.width = 1024;
  cv.height = 240;
  const g = cv.getContext("2d")!;
  const gr = g.createLinearGradient(0, 0, 1024, 240);
  gr.addColorStop(0, "#3a1050");
  gr.addColorStop(1, "#0a4a6a");
  g.fillStyle = gr;
  g.fillRect(0, 0, 1024, 240);
  g.fillStyle = "#ffd27a";
  g.font = "bold 64px Georgia, serif";
  g.textAlign = "center";
  g.fillText(text, 512, 140);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
