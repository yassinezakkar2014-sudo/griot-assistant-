// MONUMENTS des nouvelles destinations : Paris (tour de fer, arc de triomphe, pyramide de verre, Seine),
// Séoul (tour sur la colline, gratte-ciel lumineux, porte du palais, fleuve et pont), Suisse (grand sommet
// pyramidal, lac, téléphérique, chalets) et Santorin (église aux dômes bleus, moulins, falaise blanche).
import * as THREE from "three";
import { G } from "../core";
import { COUNTRIES } from "./countryData";
import { mat } from "./materials";

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const std = (color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, ...o });

export function buildLandmarks() {
  for (const c of COUNTRIES) {
    const root = new THREE.Group();
    const at = (dx: number, dz: number) => {
      const x = c.x + dx,
        z = c.z + dz;
      return V3(x, G.physics.terrain(x, z), z);
    };
    const add = (o: THREE.Object3D) => {
      o.traverse((m) => {
        if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).castShadow = (m as THREE.Mesh).receiveShadow = true;
      });
      root.add(o);
      return o;
    };
    const solid = (p: THREE.Vector3, w: number, h: number, d: number) => G.physics.addBox({ x: p.x - w / 2, y: p.y, z: p.z - d / 2 }, { x: p.x + w / 2, y: p.y + h, z: p.z + d / 2 }, "landmark");
    const mark = (name: string, p: THREE.Vector3, icon: string) => G.world.markers.push({ id: `lm-${c.id}-${name}`, name: `${name} (${c.name})`, pos: p.clone(), icon, visible: () => true });
    if (c.style === "paris") paris(c.x, c.z);
    else if (c.style === "seoul") seoul();
    else if (c.style === "alps") alps();
    else if (c.style === "santorin") santorin();
    else continue;
    G.scene.add(root);
    const center = V3(c.x, 0, c.z);
    G.palace.updaters.push(() => (root.visible = G.camera.position.distanceToSquared(center) < 16000 * 16000));

    // ------------------------------------------------------------ PARIS
    function paris(cx: number, cz: number) {
      void cx;
      void cz;
      const iron = std(0x6b5a45, { metalness: 0.6, roughness: 0.45 });
      // tour de fer : 4 piliers inclinés, 3 plateformes, flèche (≈ 300 m)
      const b = at(-320, 260);
      const tower = new THREE.Group();
      tower.position.copy(b);
      const leg = (sx: number, sz: number) => {
        const pts: THREE.Vector3[] = [];
        for (let k = 0; k <= 12; k++) {
          const u = k / 12;
          const spread = 62 * Math.pow(1 - u, 1.8);
          pts.push(V3(sx * spread, u * 120, sz * spread));
        }
        const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 5.5, 6), iron);
        tower.add(tube);
      };
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) leg(sx, sz);
      // arches entre les piliers
      for (let k = 0; k < 4; k++) {
        const arch = new THREE.Mesh(new THREE.TorusGeometry(42, 2.2, 6, 24, Math.PI), iron);
        arch.rotation.y = (k * Math.PI) / 2;
        arch.position.set(Math.sin((k * Math.PI) / 2) * 50, 18, Math.cos((k * Math.PI) / 2) * 50);
        arch.rotation.z = 0;
        tower.add(arch);
      }
      const deck = (y: number, w: number) => {
        const d = new THREE.Mesh(new THREE.BoxGeometry(w, 4, w), iron);
        d.position.y = y;
        tower.add(d);
      };
      deck(58, 70);
      deck(118, 40);
      // partie haute en treillis : 4 montants qui convergent
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const pts = [V3(sx * 16, 120, sz * 16), V3(sx * 9, 180, sz * 9), V3(sx * 4, 250, sz * 4), V3(0, 280, 0)];
        tower.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 2.4, 6), iron));
      }
      // croisillons du treillis
      for (let y = 10; y < 270; y += 9) {
        const u = y / 280;
        const s = y < 120 ? 62 * Math.pow(1 - y / 120, 1.8) + 14 : 16 * (1 - (y - 120) / 160) + 2;
        for (let k = 0; k < 4; k++) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(s * 2, 0.8, 0.8), iron);
          bar.position.set(k < 2 ? 0 : (k === 2 ? 1 : -1) * s, y, k < 2 ? (k === 0 ? 1 : -1) * s : 0);
          if (k >= 2) bar.rotation.y = Math.PI / 2;
          tower.add(bar);
        }
        void u;
      }
      deck(278, 10);
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.6, 40, 8), iron);
      spire.position.y = 300;
      tower.add(spire);
      // illumination dorée la nuit
      const glow = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 8), mat.glowGold);
      glow.position.y = 322;
      tower.add(glow);
      add(tower);
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) solid(V3(b.x + sx * 60, b.y, b.z + sz * 60), 12, 40, 12);
      mark("Tour de fer", b, "🗼");
      // arc de triomphe
      const a = at(300, -300);
      const stone = std(0xe8dcc0);
      const arc = new THREE.Group();
      arc.position.copy(a);
      for (const sx of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(16, 34, 22), stone);
        p.position.set(sx * 14, 17, 0);
        arc.add(p);
        solid(V3(a.x + sx * 14, a.y, a.z), 16, 34, 22);
      }
      const top = new THREE.Mesh(new THREE.BoxGeometry(46, 16, 22), stone);
      top.position.y = 42;
      arc.add(top);
      const vault = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 22, 24, 1, false, 0, Math.PI), stone);
      vault.rotation.z = Math.PI / 2;
      vault.rotation.y = Math.PI / 2;
      vault.position.y = 34;
      arc.add(vault);
      add(arc);
      mark("Arc de triomphe", a, "⛩");
      // pyramide de verre
      const pp = at(-300, -330);
      const glass = new THREE.MeshPhysicalMaterial({ color: 0xbfe0ff, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
      const pyr = new THREE.Mesh(new THREE.ConeGeometry(26, 24, 4, 1), glass);
      pyr.rotation.y = Math.PI / 4;
      pyr.position.set(pp.x, pp.y + 12, pp.z);
      add(pyr);
      const frame = new THREE.Mesh(new THREE.ConeGeometry(26.2, 24.2, 4, 4), new THREE.MeshBasicMaterial({ color: 0x404850, wireframe: true }));
      frame.rotation.y = Math.PI / 4;
      frame.position.copy(pyr.position);
      root.add(frame);
      const court = new THREE.Mesh(new THREE.BoxGeometry(140, 1, 100), std(0xd8ccb0));
      court.position.set(pp.x, pp.y + 0.3, pp.z);
      add(court);
      mark("Pyramide de verre", pp, "◆");
      // la Seine (au nord de la ville) avec un pont
      const sy = Math.max(1, G.physics.terrain(c.x, c.z + 1250)) + 0.2;
      const river = new THREE.Mesh(new THREE.PlaneGeometry(2600, 70), std(0x2f6f9a, { roughness: 0.1, metalness: 0.3 }));
      river.rotation.x = -Math.PI / 2;
      river.position.set(c.x, sy, c.z + 1250);
      add(river);
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(24, 2, 90), stone);
      bridge.position.set(c.x, sy + 4, c.z + 1250);
      add(bridge);
    }

    // ------------------------------------------------------------ SÉOUL
    function seoul() {
      // tour sur la colline (≈ 240 m)
      const t = at(380, 300);
      const hill = new THREE.Mesh(new THREE.ConeGeometry(110, 60, 32), std(0x2f6a2a, { flatShading: true }));
      hill.position.set(t.x, t.y + 30, t.z);
      add(hill);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(5, 8, 180, 16), std(0xeef2f6, { metalness: 0.4 }));
      shaft.position.set(t.x, t.y + 60 + 90, t.z);
      add(shaft);
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(16, 12, 18, 24), std(0xd8dde6, { metalness: 0.5 }));
      pod.position.set(t.x, t.y + 60 + 160, t.z);
      add(pod);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(16.5, 1, 8, 48), new THREE.MeshStandardMaterial({ color: 0, emissive: 0x5fd0ff, emissiveIntensity: 2 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(t.x, t.y + 60 + 152, t.z);
      root.add(ring);
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 2, 60, 8), std(0xd0283a));
      ant.position.set(t.x, t.y + 60 + 200, t.z);
      add(ant);
      solid(t, 40, 60, 40);
      mark("Tour de la colline", t, "🗼");
      // porte du palais traditionnel : socle de pierre + toit à double avancée
      const g = at(-320, -300);
      const stone = std(0x9a948a);
      const base = new THREE.Mesh(new THREE.BoxGeometry(70, 14, 22), stone);
      base.position.set(g.x, g.y + 7, g.z);
      add(base);
      solid(V3(g.x - 22, g.y, g.z), 26, 14, 22);
      solid(V3(g.x + 22, g.y, g.z), 26, 14, 22);
      const wood = std(0x8a2a22);
      for (let k = -3; k <= 3; k++) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 12, 10), wood);
        col.position.set(g.x + k * 9, g.y + 20, g.z);
        add(col);
      }
      const roofM = std(0x2a2e36);
      for (const [y, w, d] of [[27, 82, 30], [36, 66, 22]]) {
        const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 1, 1, 4, 1).rotateY(Math.PI / 4), roofM);
        roof.scale.set(w, 8, d);
        roof.position.set(g.x, g.y + y, g.z);
        add(roof);
      }
      const paint = new THREE.Mesh(new THREE.BoxGeometry(64, 3, 18), std(0x2a8a6a));
      paint.position.set(g.x, g.y + 25, g.z);
      add(paint);
      mark("Porte du palais", g, "⛩");
      // gratte-ciel lumineux (néons)
      const neon = [0xff3b8a, 0x3bd8ff, 0x7cff6b, 0xffd23b];
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        const p = at(Math.cos(a) * 620, Math.sin(a) * 620);
        const h = 160 + ((k * 37) % 140);
        const sky = new THREE.Mesh(new THREE.BoxGeometry(34, h, 34), std(0x1a2436, { metalness: 0.7, roughness: 0.15, emissive: 0x16304a, emissiveIntensity: 0.5 }));
        sky.position.set(p.x, p.y + h / 2, p.z);
        add(sky);
        solid(p, 34, h, 34);
        const band = new THREE.Mesh(new THREE.BoxGeometry(35, 2, 35), new THREE.MeshStandardMaterial({ color: 0, emissive: neon[k % 4], emissiveIntensity: 2.2 }));
        band.position.set(p.x, p.y + h - 6, p.z);
        root.add(band);
      }
      // fleuve Han et pont à arches
      const ry = Math.max(1, G.physics.terrain(c.x, c.z - 1250)) + 0.2;
      const river = new THREE.Mesh(new THREE.PlaneGeometry(3000, 160), std(0x2f6f9a, { roughness: 0.1, metalness: 0.3 }));
      river.rotation.x = -Math.PI / 2;
      river.position.set(c.x, ry, c.z - 1250);
      add(river);
      const br = new THREE.Mesh(new THREE.BoxGeometry(26, 3, 200), std(0xb8bcc4));
      br.position.set(c.x, ry + 10, c.z - 1250);
      add(br);
      for (const sz of [-60, 0, 60]) {
        const arch = new THREE.Mesh(new THREE.TorusGeometry(28, 1.2, 8, 24, Math.PI), std(0x3a6ad0));
        arch.position.set(c.x + 13, ry + 10, c.z - 1250 + sz);
        arch.rotation.y = Math.PI / 2;
        root.add(arch);
      }
    }

    // ------------------------------------------------------------ SUISSE
    function alps() {
      // grand sommet pyramidal enneigé
      const m = at(-360, 320);
      const rock = new THREE.Mesh(new THREE.ConeGeometry(240, 760, 5, 3), std(0x7a7470, { flatShading: true }));
      rock.position.set(m.x, m.y + 380, m.z);
      rock.rotation.y = 0.3;
      rock.rotation.z = 0.06;
      add(rock);
      const snow = new THREE.Mesh(new THREE.ConeGeometry(118, 380, 5, 2), std(0xf4f6fa, { flatShading: true }));
      snow.position.set(m.x + 6, m.y + 380 + 190 + 2, m.z);
      snow.rotation.copy(rock.rotation);
      add(snow);
      solid(m, 300, 200, 300);
      mark("Grand sommet", m, "🏔");
      // lac
      const ly = Math.max(1, G.physics.terrain(c.x + 500, c.z - 500)) + 0.3;
      const lake = new THREE.Mesh(new THREE.CircleGeometry(260, 64), std(0x2a7ab8, { roughness: 0.05, metalness: 0.3 }));
      lake.rotation.x = -Math.PI / 2;
      lake.position.set(c.x + 520, ly, c.z - 520);
      add(lake);
      mark("Lac alpin", lake.position, "≈");
      // téléphérique : câble et cabine qui monte au sommet
      const s0 = at(-120, 80).add(V3(0, 6, 0));
      const s1 = V3(m.x + 60, m.y + 420, m.z - 40);
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, s0.distanceTo(s1), 6), std(0x222222));
      cable.position.copy(s0).add(s1).multiplyScalar(0.5);
      cable.lookAt(s1);
      cable.rotateX(Math.PI / 2);
      root.add(cable);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 8), std(0xd0202a, { metalness: 0.4 }));
      root.add(cabin);
      G.palace.updaters.push((_dt, tt) => {
        if (!root.visible) return;
        const u = (Math.sin(tt * 0.05) + 1) / 2;
        cabin.position.copy(s0).lerp(s1, u).add(V3(0, -4, 0));
      });
      // drapeau rouge à croix blanche
      const fl = flagTex();
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ map: fl, side: THREE.DoubleSide }));
      const fp = at(60, -160);
      flag.position.set(fp.x, fp.y + 28, fp.z);
      add(flag);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 36, 8), mat.silver);
      pole.position.set(fp.x - 7.5, fp.y + 18, fp.z);
      add(pole);
    }

    // ------------------------------------------------------------ SANTORIN
    function santorin() {
      // église blanche aux dômes bleus
      const e = at(300, 260);
      const white = std(0xffffff, { roughness: 0.55 });
      const blue = std(0x1f5fd0, { roughness: 0.35, metalness: 0.2 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(30, 16, 22), white);
      body.position.set(e.x, e.y + 8, e.z);
      add(body);
      solid(e, 30, 16, 22);
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 6, 24), white);
      drum.position.set(e.x, e.y + 19, e.z);
      add(drum);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(8.4, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), blue);
      dome.position.set(e.x, e.y + 22, e.z);
      add(dome);
      const bell = new THREE.Mesh(new THREE.BoxGeometry(6, 10, 4), white);
      bell.position.set(e.x - 18, e.y + 14, e.z);
      add(bell);
      const cross = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4, 0.6), std(0xd8b25a));
      cross.position.set(e.x, e.y + 32, e.z);
      add(cross);
      mark("Église aux dômes bleus", e, "⛪");
      // moulins à vent
      const sails: THREE.Group[] = [];
      for (let k = 0; k < 3; k++) {
        const w = at(-280 + k * 40, 300 + k * 10);
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(5, 6, 14, 20), white);
        tower.position.set(w.x, w.y + 7, w.z);
        add(tower);
        solid(w, 10, 14, 10);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(6, 6, 20), std(0x7a5a3a));
        cap.position.set(w.x, w.y + 17, w.z);
        add(cap);
        const s = new THREE.Group();
        s.position.set(w.x, w.y + 15, w.z - 6.5);
        for (let b = 0; b < 4; b++) {
          const blade = new THREE.Mesh(new THREE.BoxGeometry(1.2, 13, 0.3), std(0xf0eadc));
          blade.position.y = 6.5;
          const arm = new THREE.Group();
          arm.rotation.z = (b * Math.PI) / 2;
          arm.add(blade);
          s.add(arm);
        }
        add(s);
        sails.push(s);
      }
      G.palace.updaters.push((dt) => {
        if (root.visible) for (const s of sails) s.rotation.z += dt * 0.8;
      });
      mark("Moulins", at(-240, 310), "✺");
      // escaliers blancs vers la mer sur la falaise ouest
      for (let k = 0; k < 40; k++) {
        const p = at(-c.r * 0.6 - k * 6, 0);
        const step = new THREE.Mesh(new THREE.BoxGeometry(6, 1, 8), white);
        step.position.set(p.x, p.y + 0.5, p.z);
        root.add(step);
      }
    }
  }
}

function flagTex() {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const c = cv.getContext("2d")!;
  c.fillStyle = "#d0202a";
  c.fillRect(0, 0, 128, 128);
  c.fillStyle = "#fff";
  c.fillRect(52, 24, 24, 80);
  c.fillRect(24, 52, 80, 24);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
