// RÉALISME : reflets du vrai ciel (carte d'environnement recalculée selon l'heure), océan brillant,
// texture de détail du sol (herbe, terre, roche), herbe qui ondule au vent autour du joueur,
// grands nuages dans le ciel et éclat du soleil (lens flare).
import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { Lensflare, LensflareElement } from "three/examples/jsm/objects/Lensflare.js";
import { G } from "../core";
import { ZONES, SEA, WORLD } from "../world/terrain";
import { EARTH, inAirport, COUNTRIES, MOUNTAIN } from "../world/countryData";

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export class Realism {
  private pmrem!: THREE.PMREMGenerator;
  private skyScene = new THREE.Scene();
  private sky = new Sky();
  private envRT: THREE.WebGLRenderTarget | null = null;
  private lastSun = new THREE.Vector3(9, 9, 9);
  private grass!: THREE.InstancedMesh;
  private grassAt = V3(1e9, 0, 1e9);
  private grassTime = { value: 0 };
  private clouds: THREE.Sprite[] = [];
  private cloudMat!: THREE.SpriteMaterial;
  private flareLight!: THREE.PointLight;

  build(renderer: THREE.WebGLRenderer) {
    // ---- reflets du ciel réel
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.sky.scale.setScalar(1000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 6;
    u.rayleigh.value = 1.6;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.8;
    this.skyScene.add(this.sky);

    // ---- océan plus réaliste (reflets du ciel, brillance)
    const t = G.world.terrain;
    t.waterMat.roughness = 0.1;
    t.waterMat.metalness = 0;
    t.waterMat.color.setHex(0x0b3f6e);
    t.waterMat.envMapIntensity = 0.7;
    t.waterMat.normalScale.set(0.5, 0.5);
    t.waterMat.needsUpdate = true;

    // ---- texture de détail du sol (variations d'herbe/terre/roche), sur les deux maillages
    const det = detailTexture();
    const mat = t.mesh.material as THREE.MeshStandardMaterial;
    const near = mat.clone();
    near.map = det.color;
    near.normalMap = det.normal;
    near.normalScale = new THREE.Vector2(0.6, 0.6);
    near.map.repeat.set(WORLD / 7, WORLD / 7);
    near.normalMap.repeat.copy(near.map.repeat);
    t.mesh.material = near;
    const far = mat.clone();
    far.map = det.color.clone();
    far.map.repeat.set(EARTH / 40, EARTH / 40);
    far.map.needsUpdate = true;
    t.outerMesh.material = far;

    // ---- herbe autour du joueur (ondule au vent)
    this.buildGrass();
    // ---- nuages
    this.buildClouds();
    // ---- éclat du soleil
    const flare = new Lensflare();
    flare.addElement(new LensflareElement(glowTex(256, "255,240,210"), 380, 0, new THREE.Color(1, 0.95, 0.85)));
    flare.addElement(new LensflareElement(glowTex(64, "160,200,255"), 60, 0.6));
    flare.addElement(new LensflareElement(glowTex(64, "255,210,160"), 90, 0.75));
    flare.addElement(new LensflareElement(glowTex(64, "180,255,220"), 50, 0.95));
    this.flareLight = new THREE.PointLight(0xffffff, 0, 1);
    this.flareLight.add(flare);
    G.scene.add(this.flareLight);

    G.palace.updaters.push((dt) => this.update(dt));
  }

  private buildGrass() {
    // touffe : 3 brins croisés, dégradé vert foncé → clair
    const blade = new THREE.PlaneGeometry(0.05, 0.55, 1, 3).translate(0, 0.275, 0);
    const parts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 9; k++) {
      const g = blade.clone();
      g.rotateZ((Math.random() - 0.5) * 0.5);
      g.rotateY((k / 9) * Math.PI * 2 + Math.random() * 0.4);
      g.translate((Math.random() - 0.5) * 0.45, 0, (Math.random() - 0.5) * 0.45);
      g.scale(1, 0.6 + Math.random() * 0.6, 1);
      parts.push(g);
    }
    const geo = mergeGeos(parts);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const h = Math.max(0, pos.getY(i));
      col.set([0.1 + h * 0.3, 0.2 + h * 0.45, 0.06 + h * 0.12], i * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85 });
    const time = this.grassTime;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = time;
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;").replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float w = sin(uTime * 1.8 + ip.x * 0.15 + ip.z * 0.11) * 0.5 + sin(uTime * 3.1 + ip.x * 0.4) * 0.15;
          transformed.x += w * position.y * position.y * 0.35;
          transformed.z += w * position.y * position.y * 0.2;
        #endif`
      );
    };
    const n = document.documentElement.classList.contains("phone") ? 1400 : G.mobile ? 2600 : 5000;
    this.grass = new THREE.InstancedMesh(geo, m, n);
    this.grass.count = 0;
    this.grass.frustumCulled = false;
    this.grass.receiveShadow = true;
    G.scene.add(this.grass);
  }

  /** Peut-on mettre de l'herbe ici ? (campagne verte, pas dans les villes, routes, bâtiments ouverts) */
  private grassOk(x: number, z: number, h: number, col: THREE.Color) {
    if (h < SEA + 1.2) return false;
    if (Math.hypot(x, z) < 330) return false; // ancien palais
    const c = ZONES.city;
    if (x > c.x1 - 40 && x < c.x2 + 40 && z > c.z1 - 40 && z < c.z2 + 40) return false;
    const mt = ZONES.metro;
    if (x > mt.x1 && x < mt.x2 && z > mt.z1 && z < mt.z2) return false;
    if (Math.hypot(x - ZONES.zuria.x, z - ZONES.zuria.z) < 420) return false;
    if (Math.hypot(x - ZONES.park.x, z - ZONES.park.z) < ZONES.park.r * 1.1) return false;
    if (inAirport(x, z, 60)) return false;
    if (Math.hypot(x - MOUNTAIN.x, z - MOUNTAIN.z) < MOUNTAIN.plateau + 50) return false; // cité impériale (pelouses déjà soignées)
    for (const k of COUNTRIES) if (Math.hypot(x - k.x, z - k.z) < k.r * 0.47) return false;
    const hw = (G.world as any).highway as { onRoad: (x: number, z: number) => boolean } | undefined;
    if (hw?.onRoad(x, z)) return false;
    if (Math.abs(x) < 30 && z > 300 && z < 4300) return false; // route impériale
    // seulement là où le sol est vert
    return col.g > col.r * 1.08 && col.g > col.b * 1.25;
  }

  private placeGrass() {
    const cam = G.camera.position;
    const t = G.world.terrain;
    const R = 48;
    const n = this.grass.instanceMatrix.count;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    let k = 0;
    let seed = (Math.floor(cam.x / 15) * 73856093) ^ (Math.floor(cam.z / 15) * 19349663);
    const rnd = () => ((seed = (seed * 16807 + 11) % 2147483647) / 2147483647 + 1) % 1;
    for (let tries = 0; tries < n * 2 && k < n; tries++) {
      const a = rnd() * Math.PI * 2,
        r = Math.sqrt(rnd()) * R;
      const x = cam.x + Math.cos(a) * r,
        z = cam.z + Math.sin(a) * r;
      const h = G.physics.terrain(x, z);
      t.colorAt(x, z, h, col);
      if (!this.grassOk(x, z, h, col)) continue;
      // pente : pas d'herbe sur les falaises
      if (Math.abs(G.physics.terrain(x + 1.5, z) - h) > 1.2 || Math.abs(G.physics.terrain(x, z + 1.5) - h) > 1.2) continue;
      q.setFromAxisAngle(V3(0, 1, 0), rnd() * Math.PI * 2);
      const s = 0.7 + rnd() * 0.6;
      m4.compose(V3(x, h - 0.05, z), q, V3(s, s, s));
      this.grass.setMatrixAt(k++, m4);
    }
    this.grass.count = k;
    this.grass.instanceMatrix.needsUpdate = true;
    this.grassAt.copy(cam);
  }

  private buildClouds() {
    this.cloudMat = new THREE.SpriteMaterial({ map: cloudTex(), transparent: true, depthWrite: false, fog: false, opacity: 0.85 });
    for (let i = 0; i < (G.mobile ? 36 : 60); i++) {
      const s = new THREE.Sprite(this.cloudMat);
      const sz = 700 + Math.random() * 1300;
      s.scale.set(sz, sz * 0.45, 1);
      s.position.set((Math.random() - 0.5) * 24000, 1300 + Math.random() * 700, (Math.random() - 0.5) * 24000);
      this.clouds.push(s);
      G.scene.add(s);
    }
  }

  private envTimer = 0;
  private update(dt: number) {
    const env = G.env as any;
    const sunDir: THREE.Vector3 = env.sunDir;
    const space = env.space as boolean;
    // carte d'environnement du ciel (recalculée quand le soleil a bougé)
    this.envTimer -= dt;
    if (!space && this.envTimer <= 0 && sunDir.distanceTo(this.lastSun) > 0.025) {
      this.envTimer = 1;
      this.lastSun.copy(sunDir);
      this.sky.material.uniforms.sunPosition.value.copy(sunDir);
      const rt = this.pmrem.fromScene(this.skyScene, 0, 0.1, 2000);
      G.scene.environment = rt.texture;
      this.envRT?.dispose();
      this.envRT = rt;
    }
    if (!space) G.scene.environmentIntensity = 0.04 + (1 - G.env.nightFactor) * 0.7;
    // herbe
    this.grassTime.value += dt;
    const cam = G.camera.position;
    const low = cam.y - G.physics.terrain(cam.x, cam.z) < 60 && !space;
    this.grass.visible = low;
    if (low && Math.hypot(cam.x - this.grassAt.x, cam.z - this.grassAt.z) > 18) this.placeGrass();
    // nuages : suivent le joueur (monde « infini »), teinte selon l'heure
    const night = G.env.nightFactor;
    const warm = clamp01(1 - Math.abs(sunDir.y - 0.08) / 0.25);
    this.cloudMat.color.setRGB(1 - night * 0.82, 1 - night * 0.8 - warm * 0.25, 1 - night * 0.7 - warm * 0.45);
    this.cloudMat.opacity = space ? 0 : 0.8;
    for (const c of this.clouds) {
      c.position.x += dt * 6;
      if (c.position.x - cam.x > 12000) c.position.x -= 24000;
      if (c.position.x - cam.x < -12000) c.position.x += 24000;
      if (c.position.z - cam.z > 12000) c.position.z -= 24000;
      if (c.position.z - cam.z < -12000) c.position.z += 24000;
    }
    // éclat du soleil (seulement de jour)
    this.flareLight.visible = !space && sunDir.y > 0.02 && night < 0.5;
    this.flareLight.position.copy(cam).addScaledVector(sunDir, 9000);
  }
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function mergeGeos(list: THREE.BufferGeometry[]) {
  const pos: number[] = [],
    nor: number[] = [],
    uv: number[] = [],
    idx: number[] = [];
  let off = 0;
  for (const g of list) {
    const p = g.attributes.position.array,
      n = g.attributes.normal.array,
      u = g.attributes.uv.array;
    pos.push(...p);
    nor.push(...n);
    uv.push(...u);
    const ix = g.index!.array;
    for (let i = 0; i < ix.length; i++) idx.push(ix[i] + off);
    off += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}

/** Texture de détail tuilable : grain d'herbe/terre (couleur ≈ 1, multipliée aux couleurs du terrain) + normal map. */
function detailTexture() {
  const S = 256;
  const h = new Float32Array(S * S);
  const rnd = mulberry(7);
  // bruit de valeur multi-octaves, tuilable
  for (const [cell, amp] of [[32, 0.5], [16, 0.3], [8, 0.2], [4, 0.12], [2, 0.08]] as [number, number][]) {
    const n = S / cell;
    const g = new Float32Array(n * n).map(() => rnd());
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const gx = x / cell,
          gy = y / cell;
        const x0 = Math.floor(gx) % n,
          y0 = Math.floor(gy) % n,
          x1 = (x0 + 1) % n,
          y1 = (y0 + 1) % n;
        const fx = gx - Math.floor(gx),
          fy = gy - Math.floor(gy);
        const sx = fx * fx * (3 - 2 * fx),
          sy = fy * fy * (3 - 2 * fy);
        const v = (g[y0 * n + x0] * (1 - sx) + g[y0 * n + x1] * sx) * (1 - sy) + (g[y1 * n + x0] * (1 - sx) + g[y1 * n + x1] * sx) * sy;
        h[y * S + x] += v * amp;
      }
  }
  const cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const c = cv.getContext("2d")!;
  const img = c.createImageData(S, S);
  const nc = document.createElement("canvas");
  nc.width = nc.height = S;
  const ncx = nc.getContext("2d")!;
  const nimg = ncx.createImageData(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const v = h[y * S + x];
      const speck = rnd() < 0.08 ? 0.08 : 0;
      const b = 0.8 + (v - 0.6) * 0.5 + speck;
      const o = (y * S + x) * 4;
      img.data[o] = clamp01(b * 1.02) * 255;
      img.data[o + 1] = clamp01(b) * 255;
      img.data[o + 2] = clamp01(b * 0.96) * 255;
      img.data[o + 3] = 255;
      const dx = h[y * S + ((x + 1) % S)] - h[y * S + ((x + S - 1) % S)];
      const dy = h[((y + 1) % S) * S + x] - h[((y + S - 1) % S) * S + x];
      const nv = V3(-dx * 3, -dy * 3, 1).normalize();
      nimg.data[o] = (nv.x * 0.5 + 0.5) * 255;
      nimg.data[o + 1] = (nv.y * 0.5 + 0.5) * 255;
      nimg.data[o + 2] = (nv.z * 0.5 + 0.5) * 255;
      nimg.data[o + 3] = 255;
    }
  c.putImageData(img, 0, 0);
  ncx.putImageData(nimg, 0, 0);
  const color = new THREE.CanvasTexture(cv);
  color.colorSpace = THREE.SRGBColorSpace;
  const normal = new THREE.CanvasTexture(nc);
  for (const tx of [color, normal]) {
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    tx.anisotropy = 4;
  }
  return { color, normal };
}

function cloudTex() {
  const S = 256;
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S / 2;
  const c = cv.getContext("2d")!;
  const rnd = mulberry(3);
  for (let i = 0; i < 26; i++) {
    const x = S * (0.18 + rnd() * 0.64),
      y = (S / 2) * (0.45 + rnd() * 0.25),
      r = S * (0.06 + rnd() * 0.12);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, S, S / 2);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTex(size: number, rgb: string) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const c = cv.getContext("2d")!;
  const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(${rgb},1)`);
  g.addColorStop(0.25, `rgba(${rgb},0.35)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(cv);
}

function mulberry(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
