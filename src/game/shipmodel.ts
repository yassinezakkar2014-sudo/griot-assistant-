// Modèle du Royal Talon (v2) : coque blindée gris acier, plumes métalliques en éventail,
// cellules d'énergie bleues sur les flancs. Avant = -Z. Réutilisé pour les vaisseaux des autres joueurs.
import * as THREE from "three";
import { applyPBR, panelPBR } from "../world/pbr";

export interface ShipModel {
  group: THREE.Group;
  canopy: THREE.Mesh;
  exhaust: THREE.Mesh[];
  energy: THREE.CanvasTexture;
  nozzleZ: number;
}

let energyTex: THREE.CanvasTexture | null = null;
/** Texture « électrique » des cellules d'énergie (animée par décalage). */
function energyTexture() {
  if (energyTex) return energyTex;
  const cv = document.createElement("canvas");
  cv.width = 128;
  cv.height = 512;
  const c = cv.getContext("2d")!;
  const g = c.createLinearGradient(0, 0, 128, 0);
  g.addColorStop(0, "#0a2a6a");
  g.addColorStop(0.5, "#1e78ff");
  g.addColorStop(1, "#0a2a6a");
  c.fillStyle = g;
  c.fillRect(0, 0, 128, 512);
  c.strokeStyle = "#cfefff";
  c.shadowColor = "#7fd4ff";
  c.shadowBlur = 8;
  for (let k = 0; k < 26; k++) {
    c.lineWidth = 1 + Math.random() * 2;
    c.beginPath();
    let x = Math.random() * 128,
      y = Math.random() * 512;
    c.moveTo(x, y);
    for (let i = 0; i < 6; i++) {
      x = Math.max(4, Math.min(124, x + (Math.random() - 0.5) * 50));
      y += 10 + Math.random() * 25;
      c.lineTo(x, y);
    }
    c.stroke();
  }
  energyTex = new THREE.CanvasTexture(cv);
  energyTex.wrapS = energyTex.wrapT = THREE.RepeatWrapping;
  energyTex.colorSpace = THREE.SRGBColorSpace;
  return energyTex;
}

export function buildShipModel(lightMat: THREE.Material, engineGlow: THREE.Material): ShipModel {
  const g = new THREE.Group();
  const hull = applyPBR(new THREE.MeshPhysicalMaterial({ color: 0x41454e, metalness: 0.88, clearcoat: 0.5, clearcoatRoughness: 0.2 }), panelPBR(), 0.55, 3) as THREE.MeshPhysicalMaterial;
  const plate = applyPBR(new THREE.MeshPhysicalMaterial({ color: 0x5c616c, metalness: 0.9, clearcoat: 0.6, clearcoatRoughness: 0.15 }), panelPBR(), 0.45, 2) as THREE.MeshPhysicalMaterial;
  const dark = new THREE.MeshStandardMaterial({ color: 0x15171c, metalness: 0.8, roughness: 0.45 });
  const rib = new THREE.MeshStandardMaterial({ color: 0x9aa0aa, metalness: 1, roughness: 0.25 });
  const tex = energyTexture();
  const energy = new THREE.MeshStandardMaterial({ color: 0x0a1a3a, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 2.2, map: tex });
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    const me = new THREE.Mesh(geo, m);
    me.position.set(x, y, z);
    me.rotation.set(rx, ry, rz);
    me.scale.set(sx, sy, sz);
    me.castShadow = true;
    g.add(me);
    return me;
  };

  // coque principale, aplatie et allongée
  add(new THREE.SphereGeometry(1, 48, 24), hull, 0, 0.9, 0, 0, 0, 0, 3.4, 0.95, 6.1);
  // pont supérieur en plaques superposées
  add(new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), plate, 0, 1.25, 0.8, 0, 0, 0, 2.5, 0.75, 4.3);
  for (const s of [-1, 1])
    for (let k = 0; k < 4; k++) {
      add(new THREE.BoxGeometry(1.5, 0.12, 1.25), k % 2 ? plate : hull, s * 1.35, 1.55 - k * 0.04, -0.6 + k * 1.25, 0, 0, s * -0.32);
      add(new THREE.BoxGeometry(0.5, 0.04, 0.08), lightMat, s * 1.2, 1.66 - k * 0.04, -1.1 + k * 1.25, 0, 0, s * -0.32);
    }
  // proue : plaques en coin de part et d'autre du nez
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(1.9, 0.38, 3.2), plate, s * 1.35, 0.95, -4.3, 0, s * 0.42, s * 0.12);
    add(new THREE.BoxGeometry(0.06, 0.06, 2.6), lightMat, s * 1.95, 1.18, -4.1, 0, s * 0.42, 0);
  }
  add(new THREE.BoxGeometry(1.4, 0.3, 1.6), dark, 0, 0.55, -5.3, 0.25, 0, 0);
  // poste de pilotage : verrière teintée (invisible de l'intérieur)
  // verrière bulle panoramique (invisible de l'intérieur) + cuve de la cabine
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ color: 0x0c1824, metalness: 0.5, roughness: 0.04, transparent: true, opacity: 0.62, side: THREE.FrontSide, depthWrite: false, clearcoat: 1 })
  );
  canopy.scale.set(1.15, 0.85, 2.05);
  canopy.position.set(0, 1.55, -2.0);
  g.add(canopy);
  const tub = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x14171d, metalness: 0.7, roughness: 0.45, side: THREE.BackSide }));
  tub.scale.set(1.12, 0.55, 2.0);
  tub.position.set(0, 1.56, -2.0);
  g.add(tub);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 8, 64), rib);
  rim.rotation.x = Math.PI / 2;
  rim.scale.set(1.16, 2.06, 1);
  rim.position.set(0, 1.56, -2.0);
  g.add(rim);

  // cellules d'énergie latérales (les panneaux bleus électriques)
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(1.1, 1.15, 6.6), dark, s * 3.2, 0.7, -0.7, 0, s * 0.07, 0);
    add(new THREE.BoxGeometry(0.14, 0.8, 6.0), energy, s * 3.78, 0.85, -0.75, 0, s * 0.07, 0);
    add(new THREE.BoxGeometry(0.12, 0.42, 5.2), energy, s * 3.72, 0.12, -0.7, 0, s * 0.07, 0);
    for (let k = 0; k < 8; k++) add(new THREE.BoxGeometry(0.2, 1.35, 0.08), rib, s * 3.82 - s * Math.sin(0.07) * 0, 0.55, -3.6 + k * 0.82, 0, s * 0.07, 0);
    add(new THREE.BoxGeometry(0.22, 0.08, 6.4), rib, s * 3.82, 1.27, -0.75, 0, s * 0.07, 0);
    add(new THREE.BoxGeometry(0.22, 0.08, 6.4), rib, s * 3.8, -0.15, -0.75, 0, s * 0.07, 0);
  }

  // plumes en éventail (deux rangées par côté), de l'arrière vers les flancs
  const blade = new THREE.BoxGeometry(0.18, 0.05, 1);
  for (const s of [-1, 1]) {
    const cx = s * 1.1,
      cz = 1.6;
    for (let row = 0; row < 2; row++) {
      const n = row ? 13 : 17;
      for (let i = 0; i < n; i++) {
        const th = -0.25 + (i / (n - 1)) * 1.75; // de « vers l'extérieur » à « vers l'arrière »
        const d = new THREE.Vector3(s * Math.cos(th), 0, Math.sin(th));
        const len = (row ? 2.0 : 3.1) * (1 - Math.abs(i / (n - 1) - 0.45) * 0.35);
        const r = (row ? 2.9 : 3.3) + len / 2;
        const me = new THREE.Mesh(blade, row ? hull : plate);
        me.scale.set(1, 1, len);
        me.position.set(cx + d.x * r, 1.05 + row * 0.22 + (1 - Math.abs(th - 0.6)) * 0.15, cz + d.z * r);
        me.lookAt(me.position.clone().add(d));
        me.rotateX(-0.22 - row * 0.1);
        me.castShadow = true;
        g.add(me);
      }
    }
    // arc lumineux le long de la coque
    const arc = new THREE.Mesh(new THREE.TorusGeometry(1, 0.025, 6, 64, Math.PI * 0.55), lightMat);
    arc.rotation.x = Math.PI / 2;
    arc.rotation.z = s > 0 ? -Math.PI * 0.62 : Math.PI * 1.07;
    arc.scale.set(3.42, 6.12, 1);
    arc.position.y = 1.0;
    g.add(arc);
  }
  // crête dorsale de pointes
  for (let k = 0; k < 5; k++) add(new THREE.ConeGeometry(0.09, 1.4 - k * 0.15, 6), plate, 0, 2.05 + k * 0.02, 1.2 + k * 0.7, 1.15, 0, 0);

  // bloc moteur arrière + tuyères
  add(new THREE.BoxGeometry(2.8, 0.95, 1.4), dark, 0, 0.85, 5.7);
  const exhaust: THREE.Mesh[] = [];
  const nozzleZ = 6.42;
  for (const x of [-0.75, 0.75]) {
    add(new THREE.CylinderGeometry(0.4, 0.48, 0.5, 20), rib, x, 0.85, 6.3, Math.PI / 2);
    const noz = new THREE.Mesh(new THREE.CircleGeometry(0.36, 24), engineGlow);
    noz.position.set(x, 0.85, nozzleZ + 0.15);
    g.add(noz);
    const plume = new THREE.Mesh(
      new THREE.ConeGeometry(0.36, 4, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x5fc8ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    plume.rotation.x = -Math.PI / 2;
    plume.position.set(x, 0.85, nozzleZ + 2);
    plume.visible = false;
    g.add(plume);
    exhaust.push(plume);
  }
  return { group: g, canopy, exhaust, energy: tex, nozzleZ };
}

// ---------------------------------------------------------------- camouflage (mode furtif)
/** Horloge partagée de l'effet (mise à jour par le vaisseau). */
export const cloakTime = { value: 0 };
let cloak: THREE.ShaderMaterial | null = null;
/** Matériau « invisible » : seuls les contours scintillent (effet de Fresnel + lignes de balayage). */
export function cloakMaterial() {
  if (cloak) return cloak;
  cloak = new THREE.ShaderMaterial({
    uniforms: { uTime: cloakTime, uColor: { value: new THREE.Color(0x7fdcff) } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying float vY;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        vY = (modelMatrix * vec4(position, 1.0)).y;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uColor;
      varying vec3 vN; varying vec3 vV; varying float vY;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.0);
        float scan = 1.0 - smoothstep(0.0, 0.08, abs(fract(vY * 0.05 - uTime * 0.4) - 0.5));
        float a = f * 0.45 + 0.015 + scan * 0.06;
        gl_FragColor = vec4(uColor * (0.4 + f * 1.4), a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  return cloak;
}

// ---------------------------------------------------------------- petit vaisseau de Zuria
/** « Faucon de Zuria » : petit vaisseau d'environ 10 m, coque ivoire et bronze, ailes en delta,
 *  deux réacteurs latéraux. Même gabarit de cockpit que le Royal Talon (verrière autour de z = -2). */
export function buildSmallShipModel(lightMat: THREE.Material, engineGlow: THREE.Material, colors: { hull?: number; trim?: number } = {}): ShipModel {
  const g = new THREE.Group();
  const ivory = applyPBR(new THREE.MeshPhysicalMaterial({ color: colors.hull ?? 0xe9e0cc, metalness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.1 }), panelPBR(), 0.35, 2) as THREE.MeshPhysicalMaterial;
  const bronze = new THREE.MeshStandardMaterial({ color: colors.trim ?? 0xa8743a, metalness: 0.95, roughness: 0.28 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1d1a17, metalness: 0.6, roughness: 0.5 });
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    const me = new THREE.Mesh(geo, m);
    me.position.set(x, y, z);
    me.rotation.set(rx, ry, rz);
    me.scale.set(sx, sy, sz);
    me.castShadow = true;
    g.add(me);
    return me;
  };
  // fuselage effilé
  add(new THREE.SphereGeometry(1, 40, 20), ivory, 0, 1.0, 0, 0, 0, 0, 1.35, 0.85, 4.6);
  add(new THREE.ConeGeometry(0.75, 2.4, 24), ivory, 0, 0.95, -5.4, -Math.PI / 2, 0, 0, 1, 1, 0.55);
  add(new THREE.BoxGeometry(0.08, 0.06, 7), lightMat, 0, 1.82, -0.5);
  // ailes delta avec bords d'attaque en bronze
  for (const sx of [-1, 1]) {
    const w = new THREE.Shape();
    w.moveTo(sx * 1.1, -1.8);
    w.lineTo(sx * 5.2, 2.6);
    w.lineTo(sx * 4.9, 3.3);
    w.lineTo(sx * 1.1, 3.0);
    const wg = new THREE.ExtrudeGeometry(w, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1 });
    wg.rotateX(Math.PI / 2);
    wg.translate(0, 0.75, 0);
    const wing = new THREE.Mesh(wg, ivory);
    wing.castShadow = true;
    g.add(wing);
    const edge = add(new THREE.BoxGeometry(0.1, 0.1, 5.9), bronze, sx * 3.15, 0.72, 0.4, 0, sx * -0.75, 0);
    edge.castShadow = true;
    add(new THREE.BoxGeometry(0.05, 0.05, 1), lightMat, sx * 5.0, 0.78, 3.0);
    // réacteur latéral
    add(new THREE.CylinderGeometry(0.42, 0.5, 3.0, 20), bronze, sx * 1.6, 0.85, 2.8, Math.PI / 2);
    add(new THREE.TorusGeometry(0.44, 0.06, 8, 24), dark, sx * 1.6, 0.85, 4.3);
  }
  // dérive
  add(new THREE.BoxGeometry(0.12, 1.4, 1.8), ivory, 0, 1.9, 3.2, -0.35);
  add(new THREE.BoxGeometry(0.14, 0.2, 1.6), bronze, 0, 2.55, 3.45, -0.35);
  // verrière + cuve (même gabarit que le Royal Talon pour le cockpit intérieur)
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ color: 0x3a2a12, metalness: 0.5, roughness: 0.05, transparent: true, opacity: 0.55, side: THREE.FrontSide, depthWrite: false, clearcoat: 1 })
  );
  canopy.scale.set(1.0, 0.8, 1.9);
  canopy.position.set(0, 1.55, -2.0);
  g.add(canopy);
  const tub = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a2018, metalness: 0.4, roughness: 0.5, side: THREE.BackSide }));
  tub.scale.set(0.98, 0.55, 1.85);
  tub.position.set(0, 1.56, -2.0);
  g.add(tub);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 8, 48), bronze);
  rim.rotation.x = Math.PI / 2;
  rim.scale.set(1.01, 1.91, 1);
  rim.position.set(0, 1.56, -2.0);
  g.add(rim);
  // tuyères + flammes
  const exhaust: THREE.Mesh[] = [];
  const nozzleZ = 4.35;
  for (const x of [-1.6, 1.6]) {
    const noz = new THREE.Mesh(new THREE.CircleGeometry(0.36, 24), engineGlow);
    noz.position.set(x, 0.85, nozzleZ);
    g.add(noz);
    const plume = new THREE.Mesh(
      new THREE.ConeGeometry(0.34, 3.2, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffa04a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    plume.rotation.x = -Math.PI / 2;
    plume.position.set(x, 0.85, nozzleZ + 1.6);
    plume.visible = false;
    g.add(plume);
    exhaust.push(plume);
  }
  return { group: g, canopy, exhaust, energy: energyTexture(), nozzleZ };
}
