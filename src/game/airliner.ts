// AVION DE LIGNE « ROYAL AIRWAYS » — modèle détaillé (~40 m) : fuselage profilé avec hublots,
// portes, poste de pilotage, livrée, ailes en flèche avec volets et winglets, deux réacteurs
// (entrée d'air, soufflante, cône d'éjection), empennage avec logo, train d'atterrissage complet,
// feux de navigation, anticollision et strobes. Le nez pointe vers −z.
import * as THREE from "three";

export interface Airliner {
  root: THREE.Group;
  fans: THREE.Object3D[];
  gear: THREE.Group;
  beacons: THREE.Mesh[];
  strobes: THREE.Mesh[];
  update(dt: number, t: number, gearDown: number): void;
}

export interface Livery {
  name: string;
  body: string;
  stripe: string;
  accent: string;
  tail: string;
  logo: string;
}

export const LIVERIES: Record<string, Livery> = {
  royal: { name: "ROYAL AIRWAYS", body: "#f7f8fb", stripe: "#1b3f8f", accent: "#d8b25a", tail: "#1b3f8f", logo: "♛" },
  princess: { name: "PRINCESS AIR", body: "#fbf6fa", stripe: "#9a4ac8", accent: "#2ab8b0", tail: "#9a4ac8", logo: "♥" },
  zuria: { name: "ZURIA AIRLINES", body: "#fbf8f2", stripe: "#a8743a", accent: "#1f6b4a", tail: "#1f6b4a", logo: "✺" }
};

function fuselageTexture(l: Livery) {
  const W = 2048,
    H = 1024;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const c = cv.getContext("2d")!;
  // u (horizontal) = tour du fuselage : 0 dessous, 0,25 flanc droit, 0,5 dessus, 0,75 flanc gauche
  // v (vertical, inversé) = longueur : bas du canvas = nez, haut = queue
  c.fillStyle = l.body;
  c.fillRect(0, 0, W, H);
  // ventre gris
  c.fillStyle = "#c9ced8";
  c.fillRect(0, 0, W * 0.12, H);
  c.fillRect(W * 0.88, 0, W * 0.12, H);
  const Y = (v: number) => (1 - v) * H; // v → pixel
  for (const side of [0.25, 0.75]) {
    const sgn = side < 0.5 ? 1 : -1;
    const ux = (u: number) => u * W;
    // bandes de livrée sous les hublots
    c.fillStyle = l.stripe;
    c.fillRect(ux(side - sgn * 0.035) - 14, Y(0.98), 28, H * 0.9);
    c.fillStyle = l.accent;
    c.fillRect(ux(side - sgn * 0.055) - 5, Y(0.98), 10, H * 0.9);
    // hublots
    c.fillStyle = "#1a2433";
    for (let v = 0.16; v < 0.86; v += 0.0105) {
      if (Math.abs(v - 0.5) < 0.012) continue; // sorties au-dessus des ailes
      c.beginPath();
      c.ellipse(ux(side + sgn * 0.022), Y(v), 6, 8, 0, 0, Math.PI * 2);
      c.fill();
    }
    // portes (contours)
    c.strokeStyle = "#7a8494";
    c.lineWidth = 3;
    for (const v of [0.11, 0.5, 0.9]) {
      const w = v === 0.5 ? 14 : 24;
      c.strokeRect(ux(side + sgn * 0.012) - w / 2, Y(v) - 22, w, 44);
    }
    // nom de la compagnie
    c.save();
    c.translate(ux(side + sgn * 0.06), Y(0.42));
    c.rotate(sgn > 0 ? Math.PI / 2 : -Math.PI / 2);
    c.fillStyle = l.stripe;
    c.font = "bold 46px Arial";
    c.textAlign = "center";
    c.fillText(l.name, 0, 16);
    c.restore();
  }
  // poste de pilotage
  c.fillStyle = "#0d141f";
  for (const [u, w] of [[0.42, 0.035], [0.5, 0.04], [0.58, 0.035]] as number[][]) c.fillRect(u * W - (w * W) / 2, Y(0.055), w * W, 26);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function tailTexture(l: Livery) {
  const cv = document.createElement("canvas");
  cv.width = 512;
  cv.height = 512;
  const c = cv.getContext("2d")!;
  c.fillStyle = l.tail;
  c.fillRect(0, 0, 512, 512);
  c.fillStyle = l.accent;
  c.fillRect(0, 380, 512, 30);
  c.fillStyle = "#ffffff";
  c.font = "bold 260px Georgia, serif";
  c.textAlign = "center";
  c.fillText(l.logo, 256, 320);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const cache = new Map<string, { fus: THREE.Texture; tail: THREE.Texture }>();

export function buildAirliner(livery: keyof typeof LIVERIES = "royal"): Airliner {
  const L = LIVERIES[livery];
  if (!cache.has(livery)) cache.set(livery, { fus: fuselageTexture(L), tail: tailTexture(L) });
  const tx = cache.get(livery)!;
  const root = new THREE.Group();
  const body = new THREE.MeshPhysicalMaterial({ map: tx.fus, metalness: 0.35, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  const paint = new THREE.MeshPhysicalMaterial({ color: L.body, metalness: 0.35, roughness: 0.3, clearcoat: 0.7 });
  const grey = new THREE.MeshStandardMaterial({ color: 0xb8bec8, metalness: 0.7, roughness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1d24, metalness: 0.5, roughness: 0.5 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xd8dce4, metalness: 1, roughness: 0.18 });
  const tire = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  const tailM = new THREE.MeshPhysicalMaterial({ map: tx.tail, metalness: 0.3, roughness: 0.3, clearcoat: 0.6, side: THREE.DoubleSide });
  const stripeM = new THREE.MeshStandardMaterial({ color: L.stripe, metalness: 0.3, roughness: 0.35 });
  const add = (o: THREE.Object3D, parent: THREE.Object3D = root) => {
    o.traverse((m) => {
      if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).castShadow = true;
    });
    parent.add(o);
    return o;
  };

  // ---- fuselage (profil tourné) : nez à z = −19, queue à z = +19
  const prof: THREE.Vector2[] = [];
  const LEN = 38,
    R = 2.0;
  for (let i = 0; i <= 60; i++) {
    const y = (i / 60) * LEN;
    let r: number;
    if (y < 5.5) r = R * Math.pow(Math.sin(((y / 5.5) * Math.PI) / 2), 0.62);
    else if (y < 27) r = R;
    else r = R - (R - 0.45) * Math.pow((y - 27) / (LEN - 27), 1.4);
    prof.push(new THREE.Vector2(Math.max(0.001, r), y));
  }
  const fg = new THREE.LatheGeometry(prof, 64);
  fg.rotateX(Math.PI / 2); // axe le long de +z (nez à z = 0, queue à z = 38)
  fg.translate(0, 0, -LEN / 2);
  const fus = new THREE.Mesh(fg, body);
  fus.position.y = 3.2;
  add(fus);
  // remontée de la queue (cône de queue relevé)
  const tc = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4, 24), paint);
  tc.rotation.x = Math.PI / 2 + 0.25;
  tc.position.set(0, 4.0, LEN / 2 + 0.8);
  add(tc);
  // carénage aile/fuselage (ventre)
  const fair = new THREE.Mesh(new THREE.CapsuleGeometry(1.4, 7, 6, 16), grey);
  fair.rotation.x = Math.PI / 2;
  fair.scale.set(1.5, 1, 0.55);
  fair.position.set(0, 1.85, 0.6);
  add(fair);

  // ---- ailes en flèche (avec volets, ailerons, winglets, feux)
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, -3.2);
  wingShape.lineTo(17, 4.6);
  wingShape.lineTo(17, 6.2);
  wingShape.lineTo(0, 4.4);
  wingShape.closePath();
  const navR = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff2020, emissiveIntensity: 3 });
  const navG = new THREE.MeshStandardMaterial({ color: 0, emissive: 0x20ff40, emissiveIntensity: 3 });
  const strobeM = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffffff, emissiveIntensity: 0 });
  const strobes: THREE.Mesh[] = [];
  const fans: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    const wg = new THREE.ExtrudeGeometry(wingShape, { depth: 0.28, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2 });
    wg.rotateX(Math.PI / 2);
    if (sx < 0) wg.scale(-1, 1, 1);
    const w = new THREE.Mesh(wg, paint);
    w.position.set(sx * 1.3, 2.1, -0.4);
    w.rotation.z = sx * 0.06; // dièdre
    add(w);
    if (sx < 0) {
      // l'échelle négative inverse les faces : on retourne l'ordre
      (w.material as THREE.Material).side = THREE.DoubleSide;
    }
    // volets et ailerons (bord de fuite)
    for (let k = 0; k < 4; k++) {
      const s0 = 2 + k * 3.6;
      const f = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.06, 0.9), grey);
      const sc = s0 + 1.6;
      f.position.set(sx * (1.3 + sc), 2.12 + sc * 0.06, -0.4 + 4.4 + (sc / 17) * 1.8 - 0.42);
      f.rotation.y = -sx * 0.105;
      add(f);
    }
    // winglet
    const wl = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.4, 1.4), stripeM);
    wl.position.set(sx * 18.35, 3.55, 5.0);
    wl.rotation.z = -sx * 0.25;
    add(wl);
    const nav = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), sx < 0 ? navR : navG);
    nav.position.set(sx * 18.3, 2.35, 4.4);
    root.add(nav);
    const st = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), strobeM);
    st.position.set(sx * 18.3, 2.35, 5.2);
    root.add(st);
    strobes.push(st);
    // ---- réacteur
    const eng = new THREE.Group();
    eng.position.set(sx * 6.2, 1.55, -2.6);
    const nac = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.05, 4.6, 40, 1, true), paint);
    nac.rotation.x = Math.PI / 2;
    (nac.material as THREE.Material).side = THREE.DoubleSide;
    const lip = new THREE.Mesh(new THREE.TorusGeometry(1.22, 0.12, 12, 40), metal);
    lip.position.z = -2.3;
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.12, 1.6, 32, 1, true), dark);
    inner.rotation.x = Math.PI / 2;
    inner.position.z = -1.5;
    (inner.material as THREE.Material).side = THREE.BackSide;
    const fan = new THREE.Group();
    fan.position.z = -1.9;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.08, 32), dark);
    disc.rotation.y = Math.PI;
    fan.add(disc);
    for (let b = 0; b < 18; b++) {
      const bl = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.0, 0.03), metal);
      bl.position.set(Math.cos((b / 18) * Math.PI * 2) * 0.55, Math.sin((b / 18) * Math.PI * 2) * 0.55, -0.02);
      bl.rotation.z = (b / 18) * Math.PI * 2 + Math.PI / 2;
      bl.rotation.y = 0.5;
      fan.add(bl);
    }
    const spin = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.7, 20), metal);
    spin.rotation.x = -Math.PI / 2;
    spin.position.z = -0.35;
    fan.add(spin);
    const swirl = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    swirl.position.set(0.12, 0, -0.71);
    swirl.rotation.y = Math.PI;
    fan.add(swirl);
    fans.push(fan);
    const exh = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.6, 24), grey);
    exh.rotation.x = Math.PI / 2;
    exh.position.z = 2.9;
    const exRing = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.8, 32, 1, true), metal);
    exRing.rotation.x = Math.PI / 2;
    exRing.position.z = 2.5;
    (exRing.material as THREE.Material).side = THREE.DoubleSide;
    eng.add(nac, lip, inner, fan, exh, exRing);
    add(eng);
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.9, 4.2), paint);
    pylon.position.set(sx * 6.2, 2.4, -1.4);
    add(pylon);
  }

  // ---- empennage
  const fin = new THREE.Shape();
  fin.moveTo(0, 0);
  fin.lineTo(5.6, 0);
  fin.lineTo(7.4, 7.4);
  fin.lineTo(5.2, 7.4);
  fin.closePath();
  const fing = new THREE.ExtrudeGeometry(fin, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1 });
  fing.rotateY(-Math.PI / 2);
  fing.translate(0.15, 0, 0);
  // UV simples (projection latérale) pour le logo
  const pos = fing.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getZ(i) / 7.4;
    uv[i * 2 + 1] = pos.getY(i) / 7.4;
  }
  fing.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  const finM = new THREE.Mesh(fing, tailM);
  finM.position.set(0, 4.6, 12.0);
  add(finM);
  for (const sx of [-1, 1]) {
    const hs = new THREE.Shape();
    hs.moveTo(0, 0);
    hs.lineTo(6.4, 2.6);
    hs.lineTo(6.4, 3.8);
    hs.lineTo(0, 3.4);
    hs.closePath();
    const hg = new THREE.ExtrudeGeometry(hs, { depth: 0.16, bevelEnabled: false });
    hg.rotateX(Math.PI / 2);
    if (sx < 0) hg.scale(-1, 1, 1);
    const h = new THREE.Mesh(hg, new THREE.MeshPhysicalMaterial({ color: L.body, metalness: 0.35, roughness: 0.3, side: THREE.DoubleSide }));
    h.position.set(sx * 0.6, 4.3, 14.6);
    h.rotation.z = sx * 0.1;
    add(h);
  }
  const tailStrobe = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), strobeM);
  tailStrobe.position.set(0, 4.2, 20.3);
  root.add(tailStrobe);
  strobes.push(tailStrobe);
  // feux anticollision (rouges, clignotants)
  const beaconM = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff1010, emissiveIntensity: 0 });
  const beacons = [0, 1].map((k) => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), beaconM);
    b.position.set(0, k ? 5.25 : 1.15, -1);
    root.add(b);
    return b;
  });
  // phares d'atterrissage
  const landM = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xfff4d8, emissiveIntensity: 2.5 });
  for (const sx of [-1, 1]) {
    const lp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), landM);
    lp.position.set(sx * 2.6, 2.05, -1.6);
    root.add(lp);
  }

  // ---- train d'atterrissage
  const gear = new THREE.Group();
  const leg = (x: number, z: number, h: number, wheels: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, h, 10), metal);
    strut.position.y = h / 2 + 0.5;
    g.add(strut);
    const rows = wheels > 2 ? 2 : 1;
    for (let r = 0; r < rows; r++)
      for (const sx of [-1, 1]) {
        const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.42, 20), tire);
        wh.rotation.z = Math.PI / 2;
        wh.position.set(sx * 0.36, 0.55, (r - (rows - 1) / 2) * 1.3);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.44, 14), metal);
        hub.rotation.z = Math.PI / 2;
        hub.position.copy(wh.position);
        g.add(wh, hub);
      }
    if (rows > 1) {
      const bogie = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 1.7), metal);
      bogie.position.y = 0.6;
      g.add(bogie);
    }
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.05, h * 0.8, 1.1), paint);
    door.position.set(0.5, h * 0.6 + 0.5, 0);
    g.add(door);
    gear.add(g);
  };
  leg(0, -14.5, 1.6, 2);
  leg(-2.6, 1.2, 1.4, 4);
  leg(2.6, 1.2, 1.4, 4);
  gear.traverse((m) => {
    if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).castShadow = true;
  });
  root.add(gear);

  return {
    root,
    fans,
    gear,
    beacons,
    strobes,
    update(dt: number, t: number, gearDown: number) {
      for (const f of fans) f.rotation.z += dt * 30;
      beaconM.emissiveIntensity = Math.sin(t * 6) > 0.6 ? 4 : 0;
      strobeM.emissiveIntensity = (t * 1.1) % 1 < 0.06 ? 8 : 0;
      gear.scale.y = Math.max(0.02, gearDown);
      gear.position.y = (1 - gearDown) * 1.4;
    }
  };
}
