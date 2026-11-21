// LE ROYAL MALL — grand centre commercial dans la ville futuriste : atrium sous verrière avec
// fontaine et palmiers, escalators, mezzanine, et 12 boutiques (dont ROYAL PHONE, la boutique de
// téléphones, et MODE ROYALE pour changer d'avatar). Tout est gratuit.
import * as THREE from "three";
import { G, bus } from "../core";
import { mat } from "./materials";

/** Emprise du centre commercial (la ville laisse cet espace libre). */
export const MALL = { x: 1250, z: -760, w: 220, d: 140 };

export function buildMall() {
  const root = new THREE.Group();
  G.scene.add(root);
  const { x: cx, z: cz, w: W, d: D } = MALL;
  const Y = 1.3;
  const H = 24;
  const x1 = cx - W / 2,
    x2 = cx + W / 2,
    z1 = cz - D / 2,
    z2 = cz + D / 2;
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xa8d8f8, transparent: true, opacity: 0.28, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false });
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f4, roughness: 0.4 });
  const floorM = new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.12, metalness: 0.15 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xc8ccd4, metalness: 0.85, roughness: 0.3 });
  const solid = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => G.physics.addBox({ x: ax, y: ay, z: az }, { x: bx, y: by, z: bz }, "mall");
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, isSolid = true) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y + h / 2, z);
    b.castShadow = b.receiveShadow = true;
    root.add(b);
    if (isSolid) solid(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2);
    return b;
  };
  // sol, plafond, verrière
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorM);
  fl.rotation.x = -Math.PI / 2;
  fl.position.set(cx, Y + 0.05, cz);
  fl.receiveShadow = true;
  root.add(fl);
  box(W, 1.2, D, white, cx, Y + H, cz, true);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.5, D * 0.45), glass);
  sky.rotation.x = Math.PI / 2;
  sky.position.set(cx, Y + H - 0.1, cz);
  root.add(sky);
  // façades vitrées + entrées (ouest et nord), montants
  const doors: [string, number][] = [["w", cz], ["n", cx]];
  for (const [side, at] of [["s", z1], ["n", z2]] as [string, number][]) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(W, H), glass);
    g.position.set(cx, Y + H / 2, at);
    root.add(g);
    const gap = doors.find((d) => d[0] === side);
    if (gap) {
      solid(x1, Y, at - 0.5, gap[1] - 8, Y + H, at + 0.5);
      solid(gap[1] + 8, Y, at - 0.5, x2, Y + H, at + 0.5);
    } else solid(x1, Y, at - 0.5, x2, Y + H, at + 0.5);
    for (let x = x1; x <= x2; x += 10) box(0.4, H, 0.4, steel, x, Y, at, false);
  }
  for (const [side, at] of [["w", x1], ["e", x2]] as [string, number][]) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(D, H), glass);
    g.position.set(at, Y + H / 2, cz);
    g.rotation.y = Math.PI / 2;
    root.add(g);
    const gap = doors.find((d) => d[0] === side);
    if (gap) {
      solid(at - 0.5, Y, z1, at + 0.5, Y + H, gap[1] - 8);
      solid(at - 0.5, Y, gap[1] + 8, at + 0.5, Y + H, z2);
    } else solid(at - 0.5, Y, z1, at + 0.5, Y + H, z2);
    for (let z = z1; z <= z2; z += 10) box(0.4, H, 0.4, steel, at, Y, z, false);
  }
  // grande enseigne
  for (const [x, z, ry] of [[x1 - 0.6, cz, -Math.PI / 2], [cx, z2 + 0.6, 0]] as [number, number, number][]) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(70, 10), new THREE.MeshBasicMaterial({ map: signTex("ROYAL MALL", "#ffd27a", "#0b1a3a", 150) }));
    s.position.set(x, Y + H - 6, z);
    s.rotation.y = ry;
    root.add(s);
  }
  // atrium : fontaine, palmiers, bancs
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(9, 9.4, 0.9, 48), white);
  basin.position.set(cx, Y + 0.45, cz);
  root.add(basin);
  solid(cx - 8.5, Y, cz - 8.5, cx + 8.5, Y + 0.9, cz + 8.5);
  const water = new THREE.Mesh(new THREE.CircleGeometry(8.4, 48), new THREE.MeshStandardMaterial({ color: 0x2ab0e8, roughness: 0.05, emissive: 0x0a4a6a, emissiveIntensity: 0.4 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(cx, Y + 0.85, cz);
  root.add(water);
  const jet = new THREE.Mesh(new THREE.ConeGeometry(1.2, 7, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
  jet.position.set(cx, Y + 4.4, cz);
  root.add(jet);
  const palmM = new THREE.MeshStandardMaterial({ color: 0x3d7a2e, flatShading: true });
  for (const [dx, dz] of [[-24, -18], [24, -18], [-24, 18], [24, 18]]) {
    box(2.4, 0.8, 2.4, white, cx + dx, Y, cz + dz);
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 9, 8), mat.wood);
    tr.position.set(cx + dx, Y + 5.2, cz + dz);
    const top = new THREE.Mesh(new THREE.ConeGeometry(3.6, 1.8, 9), palmM);
    top.position.set(cx + dx, Y + 10, cz + dz);
    root.add(tr, top);
  }
  for (const dz of [-12, 12]) for (const dx of [-14, 14]) box(5, 0.5, 1.2, mat.wood, cx + dx, Y, cz + dz);
  // mezzanine (balcon) et escalators décoratifs
  const mezz = new THREE.Mesh(new THREE.BoxGeometry(W - 60, 0.6, D - 60), white);
  mezz.position.set(cx, Y + 9, cz);
  const hole = new THREE.Mesh(new THREE.BoxGeometry(W - 110, 0.7, D - 100), new THREE.MeshBasicMaterial({ color: 0x000000, colorWrite: false }));
  hole.position.copy(mezz.position);
  root.add(mezz);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(W - 110, 1.1, 0.1), glass);
  for (const dz of [-(D - 100) / 2, (D - 100) / 2]) {
    const r = rail.clone();
    r.position.set(cx, Y + 9.85, cz + dz);
    root.add(r);
  }
  for (const sx of [-1, 1]) {
    const esc = new THREE.Mesh(new THREE.BoxGeometry(3, 0.5, 18), steel);
    esc.position.set(cx + sx * 40, Y + 4.6, cz);
    esc.rotation.x = sx * 0.5;
    root.add(esc);
    const steps = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.2, 17), new THREE.MeshStandardMaterial({ color: 0x1a1c22 }));
    steps.position.set(cx + sx * 40, Y + 4.9, cz);
    steps.rotation.x = sx * 0.5;
    root.add(steps);
  }

  // ---- boutiques le long des murs (sud et est), vitrines + enseignes
  const shops = [
    { id: "phone", name: "📱 ROYAL PHONE", color: "#1b3f8f", accent: 0x3fa8ff },
    { id: "mode", name: "👗 MODE ROYALE", color: "#8a2a6a", accent: 0xff6aa8 },
    { id: "bijoux", name: "💎 BIJOUTERIE D'OR", color: "#8a6a1a", accent: 0xffd27a },
    { id: "cafe", name: "☕ CAFÉ DU PALAIS", color: "#5a3a20", accent: 0xffb070 },
    { id: "sneakers", name: "👟 SNEAKERS", color: "#1a1a1a", accent: 0xffffff },
    { id: "tech", name: "🎧 ÉLECTRONIQUE", color: "#0a3a4a", accent: 0x3fe8d8 },
    { id: "glaces", name: "🍦 GLACIER", color: "#c86a8a", accent: 0xffd8e8 },
    { id: "jeux", name: "🎮 ARCADE", color: "#3a1a6a", accent: 0xb46bff },
    { id: "livres", name: "📚 LIBRAIRIE", color: "#2a4a2a", accent: 0x9fe89f },
    { id: "fleurs", name: "💐 FLEURISTE", color: "#4a6a2a", accent: 0xff9ab8 },
    { id: "burger", name: "🍔 FOOD COURT", color: "#a83a1a", accent: 0xffc861 },
    { id: "cinema", name: "🎬 CINÉMA", color: "#1a1a3a", accent: 0xff3030 }
  ];
  const SW = 30,
    SD = 18;
  shops.forEach((sh, i) => {
    // 6 boutiques côté sud, 6 côté est (enfilade)
    const south = i < 6;
    const k = south ? i : i - 6;
    let sx: number, sz: number, ry: number;
    if (south) {
      sx = x1 + 20 + k * SW + SW / 2;
      sz = z1 + SD / 2;
      ry = 0;
    } else {
      sx = x2 - SD / 2;
      sz = z1 + 26 + k * 18 + 9;
      ry = -Math.PI / 2;
      if (sz > z2 - 12) return;
    }
    const g = new THREE.Group();
    g.position.set(sx, Y, sz);
    g.rotation.y = ry;
    root.add(g);
    const w = south ? SW - 1 : 17;
    // cloisons et fond
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 8, SD), white);
      p.position.set((s * w) / 2, 4, 0);
      g.add(p);
    }
    // vitrine (avec ouverture de porte au centre)
    for (const s of [-1, 1]) {
      const v = new THREE.Mesh(new THREE.PlaneGeometry(w / 2 - 3, 6), glass);
      v.position.set((s * (w / 2 + 3)) / 2, 3, SD / 2);
      g.add(v);
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(w - 2, 2.2), new THREE.MeshBasicMaterial({ map: signTex(sh.name, "#ffffff", sh.color, 70) }));
    sign.position.set(0, 7, SD / 2 + 0.05);
    g.add(sign);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(w - 2, 0.15, 0.15), new THREE.MeshStandardMaterial({ color: 0, emissive: sh.accent, emissiveIntensity: 2 }));
    glow.position.set(0, 5.8, SD / 2 + 0.1);
    g.add(glow);
    // intérieur de la boutique
    const counter = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 1.1, 1.4), new THREE.MeshStandardMaterial({ color: 0x1a1c24, roughness: 0.35, metalness: 0.4 }));
    counter.position.set(0, 0.55, -SD / 2 + 4);
    g.add(counter);
    if (sh.id === "phone") {
      // téléphones exposés (écrans lumineux) + grand écran publicitaire
      for (let k2 = 0; k2 < 8; k2++) {
        const ph = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.7, 0.05), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: [0x3fa8ff, 0xff6aa8, 0xffd27a, 0x3fe8d8][k2 % 4], emissiveIntensity: 1.4 }));
        ph.position.set(-w * 0.22 + k2 * (w * 0.44) / 7, 1.5, -SD / 2 + 4);
        ph.rotation.x = -0.3;
        g.add(ph);
      }
      const ad = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), new THREE.MeshBasicMaterial({ map: signTex("ROYAL PHONE 15 · GRATUIT", "#ffffff", "#1b3f8f", 64) }));
      ad.position.set(0, 4.5, -SD / 2 + 0.3);
      g.add(ad);
      for (const s of [-1, 1]) {
        const table = new THREE.Mesh(new THREE.BoxGeometry(5, 0.9, 2.4), new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.3 }));
        table.position.set(s * 7, 0.45, 2);
        g.add(table);
        for (let k2 = 0; k2 < 3; k2++) {
          const ph = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.7), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: 0x3fa8ff, emissiveIntensity: 1 }));
          ph.position.set(s * 7 - 1.5 + k2 * 1.5, 0.92, 2);
          g.add(ph);
        }
      }
    } else if (sh.id === "mode") {
      for (let k2 = 0; k2 < 6; k2++) {
        const rack = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 0.25), new THREE.MeshStandardMaterial({ color: [0xff6aa8, 0x3fa8ff, 0xffd27a, 0x1f8a4a, 0xb46bff, 0xc0392b][k2] }));
        rack.position.set(-w * 0.3 + k2 * 1.6, 1.3, 0);
        g.add(rack);
      }
    } else if (sh.id === "burger" || sh.id === "cafe" || sh.id === "glaces") {
      for (const s of [-1, 1])
        for (const t of [-1, 1]) {
          const tb = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.08, 20), white);
          tb.position.set(s * 6, 0.85, t * 3);
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.85, 8), steel);
          leg.position.set(s * 6, 0.42, t * 3);
          g.add(tb, leg);
        }
    } else {
      for (let k2 = 0; k2 < 3; k2++) {
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.1, 1.2), white);
        shelf.position.set(0, 1 + k2 * 0.9, -SD / 2 + 1);
        g.add(shelf);
        for (let k3 = 0; k3 < 6; k3++) {
          const it = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: sh.accent, emissive: sh.accent, emissiveIntensity: 0.15 }));
          it.position.set(-w * 0.3 + k3 * (w * 0.6) / 5, 1.35 + k2 * 0.9, -SD / 2 + 1);
          g.add(it);
        }
      }
    }
    // physique : cloisons
    const wx = (lx: number, lz: number) => {
      const v = new THREE.Vector3(lx, 0, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
      return { x: sx + v.x, z: sz + v.z };
    };
    for (const s of [-1, 1]) {
      const a = wx((s * w) / 2 - 0.2, -SD / 2),
        b = wx((s * w) / 2 + 0.2, SD / 2);
      solid(Math.min(a.x, b.x), Y, Math.min(a.z, b.z), Math.max(a.x, b.x), Y + 8, Math.max(a.z, b.z));
    }
    // interactions
    const front = wx(0, SD / 2 - 3);
    const action =
      sh.id === "phone"
        ? { label: "📱 Prendre un Royal Phone (gratuit)", run: () => bus.emit("ui:phone", { gift: true }) }
        : sh.id === "mode"
          ? { label: "👗 Essayer des tenues (gratuit)", run: () => bus.emit("ui:avatar") }
          : sh.id === "cafe"
            ? { label: "☕ Prendre un café", run: () => bus.emit("toast", { text: "☕ Un café royal bien chaud, offert par la maison !" }) }
            : sh.id === "glaces"
              ? { label: "🍦 Prendre une glace", run: () => bus.emit("toast", { text: "🍦 Une glace vanille-mangue, offerte !" }) }
              : sh.id === "burger"
                ? { label: "🍔 Commander un repas", run: () => bus.emit("toast", { text: "🍔 Menu royal servi : burger, frites et jus. Gratuit !" }) }
                : sh.id === "bijoux"
                  ? {
                      label: "💎 Essayer des bijoux",
                      run: () => {
                        const l = G.player.body.look;
                        G.player.setLook({ ...l, acc: Array.from(new Set([...l.acc, "collier", "boucles", "montre"])) });
                        bus.emit("toast", { text: "💎 Collier, boucles d'oreilles et montre en or : offerts !" });
                      }
                    }
                  : { label: `Entrer : ${sh.name}`, run: () => bus.emit("toast", { text: `${sh.name} — bienvenue ! Tout est gratuit aujourd'hui.` }) };
    G.interact.add({ id: "mall-" + sh.id, pos: new THREE.Vector3(front.x, Y + 1, front.z), radius: 7, label: () => action.label, action: action.run });
  });
  // éclairage intérieur
  G.palace.zones.push({
    contains: (p) => p.x > x1 && p.x < x2 && p.z > z1 && p.z < z2 && p.y < Y + H,
    lights: [
      { pos: new THREE.Vector3(cx, Y + 18, cz), color: 0xfff4e0, intensity: 160, distance: 90 },
      { pos: new THREE.Vector3(x1 + 50, Y + 7, z1 + 20), color: 0xfff0e0, intensity: 70, distance: 50 },
      { pos: new THREE.Vector3(x1 + 140, Y + 7, z1 + 20), color: 0xfff0e0, intensity: 70, distance: 50 },
      { pos: new THREE.Vector3(x2 - 20, Y + 7, cz), color: 0xfff0e0, intensity: 70, distance: 50 }
    ]
  });
  G.palace.updaters.push((dt) => (jet.rotation.y += dt));
  G.world.markers.push({ id: "mall", name: "Royal Mall", pos: new THREE.Vector3(cx, 0, z2 + 6), icon: "🛍", visible: () => true });
}

function signTex(text: string, fg: string, bg: string, size: number) {
  const cv = document.createElement("canvas");
  cv.width = 1024;
  cv.height = 160;
  const c = cv.getContext("2d")!;
  c.fillStyle = bg;
  c.fillRect(0, 0, 1024, 160);
  c.fillStyle = fg;
  c.font = `bold ${size}px Arial`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(text, 512, 84);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
