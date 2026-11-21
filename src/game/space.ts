// L'ESPACE — le Royal Talon quitte l'atmosphère : la Terre ronde (avec les vrais continents du
// royaume), un ciel d'étoiles complet, la Station orbitale royale où se poser et marcher, la Lune
// et sa base royale (gravité lunaire), et des planètes lointaines.
import * as THREE from "three";
import { G, bus } from "../core";
import { mat } from "../world/materials";

export const SPACE_Y = 48000;
/** Station orbitale : pont d'appontage (dessus à STATION.y). */
export const STATION = new THREE.Vector3(0, SPACE_Y + 200, 0);
/** Lune : centre et rayon ; la base royale est posée au sommet. */
export const MOON = { c: new THREE.Vector3(9000, SPACE_Y + 1500, -14000), r: 2200 };
export const MOON_BASE = new THREE.Vector3(MOON.c.x, MOON.c.y + MOON.r, MOON.c.z);

export class Space {
  active = false;
  root = new THREE.Group();
  private earth!: THREE.Mesh;
  private clouds!: THREE.Mesh;
  private ring!: THREE.Mesh;
  private stars!: THREE.Points;
  private back = new THREE.Vector3();
  private cooldown = 0;

  build() {
    const r = this.root;
    r.visible = false;
    G.scene.add(r);
    // ---- la Terre : sphère texturée avec la carte du grand monde
    const R = 70000;
    const ec = new THREE.Vector3(0, SPACE_Y - R - 6000, 0);
    const earthTex = new THREE.CanvasTexture(this.earthCanvas());
    earthTex.colorSpace = THREE.SRGBColorSpace;
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), new THREE.MeshStandardMaterial({ map: earthTex, roughness: 0.9, metalness: 0 }));
    this.earth.position.copy(ec);
    this.earth.rotation.z = Math.PI / 2; // le royaume (centre de la carte) juste sous le vaisseau
    r.add(this.earth);
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(R * 1.006, 64, 48), new THREE.MeshStandardMaterial({ map: this.cloudTex(), transparent: true, opacity: 0.45, depthWrite: false }));
    this.clouds.position.copy(ec);
    r.add(this.clouds);
    // halo d'atmosphère : lueur bleue fine sur le bord de la planète (effet de Fresnel)
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.025, 96, 64),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.FrontSide,
        uniforms: { color: { value: new THREE.Color(0x5ab8ff) } },
        vertexShader: `varying vec3 vN; varying vec3 vV;
          void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
        fragmentShader: `uniform vec3 color; varying vec3 vN; varying vec3 vV;
          void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 4.0); gl_FragColor = vec4(color * f * 1.6, f); }`
      })
    );
    atmo.position.copy(ec);
    r.add(atmo);
    // ---- étoiles (ciel complet)
    const n = 6000;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(180000);
      pos.set([v.x, v.y, v.z], i * 3);
      const k = 0.6 + Math.random() * 0.4;
      const tint = Math.random();
      col.set(tint < 0.15 ? [k, k * 0.8, k * 0.6] : tint < 0.3 ? [k * 0.7, k * 0.8, k] : [k, k, k], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    sg.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false }));
    r.add(this.stars);
    // voie lactée : bande de petites étoiles
    const mw = new Float32Array(9000 * 3);
    for (let i = 0; i < 9000; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a), (Math.random() - 0.5) * 0.18, Math.sin(a)).normalize().applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.9).multiplyScalar(175000);
      mw.set([v.x, v.y, v.z], i * 3);
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute("position", new THREE.BufferAttribute(mw, 3));
    this.stars.add(new THREE.Points(mg, new THREE.PointsMaterial({ color: 0xb8c8ff, size: 1, sizeAttenuation: false, transparent: true, opacity: 0.55, fog: false, depthWrite: false })));
    // ---- planètes lointaines
    const mars = new THREE.Mesh(new THREE.SphereGeometry(7000, 48, 32), new THREE.MeshStandardMaterial({ map: this.planetTex(["#a0442a", "#c8643a", "#7a2a1a"], 41), roughness: 1 }));
    mars.position.set(-70000, SPACE_Y + 14000, -90000);
    r.add(mars);
    const giant = new THREE.Mesh(new THREE.SphereGeometry(18000, 64, 48), new THREE.MeshStandardMaterial({ map: this.planetTex(["#d8b890", "#b89068", "#e8d0a8", "#a07850"], 7, true), roughness: 1 }));
    giant.position.set(95000, SPACE_Y + 26000, -120000);
    const ringGeo = new THREE.RingGeometry(24000, 40000, 128);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xd8c8a8, transparent: true, opacity: 0.55, side: THREE.DoubleSide, fog: false }));
    this.ring.rotation.x = Math.PI / 2.4;
    giant.add(this.ring);
    r.add(giant);
    // ---- la Lune et sa base royale
    const moon = new THREE.Mesh(new THREE.SphereGeometry(MOON.r, 96, 64), new THREE.MeshStandardMaterial({ map: this.moonTex(), roughness: 1, metalness: 0 }));
    moon.position.copy(MOON.c);
    r.add(moon);
    this.buildMoonBase();
    // ---- Station orbitale royale
    this.buildStation();
    G.palace.updaters.push((dt, t) => this.update(dt, t));
  }

  // ---------------------------------------------------------------- textures
  private earthCanvas() {
    // la carte du grand monde au centre, entourée d'océan et d'autres continents imaginaires
    const W = 2048,
      H = 1024;
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const c = cv.getContext("2d")!;
    c.fillStyle = "#0a3a6e";
    c.fillRect(0, 0, W, H);
    let seed = 9;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 26; k++) {
      const x = rnd() * W,
        y = 120 + rnd() * (H - 240);
      c.fillStyle = ["#3a6a2a", "#8a7a48", "#2f5a28", "#a08a58"][k % 4];
      c.beginPath();
      for (let a = 0; a < Math.PI * 2; a += 0.3) {
        const rr = 40 + rnd() * 90;
        c.lineTo(x + Math.cos(a) * rr * 1.6, y + Math.sin(a) * rr);
      }
      c.fill();
    }
    // calottes polaires
    c.fillStyle = "#eef4ff";
    c.fillRect(0, 0, W, 60);
    c.fillRect(0, H - 60, W, 60);
    // le grand monde réel au point face au vaisseau (pôle de la sphère tournée)
    if (G.world.worldCanvas) c.drawImage(G.world.worldCanvas, W / 2 - 220, H / 2 - 220, 440, 440);
    return cv;
  }
  private cloudTex() {
    const cv = document.createElement("canvas");
    cv.width = 1024;
    cv.height = 512;
    const c = cv.getContext("2d")!;
    for (let i = 0; i < 700; i++) {
      const x = Math.random() * 1024,
        y = Math.random() * 512;
      const g = c.createRadialGradient(x, y, 0, x, y, 10 + Math.random() * 40);
      g.addColorStop(0, "rgba(255,255,255,0.55)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(x - 50, y - 50, 100, 100);
    }
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  private planetTex(cols: string[], s: number, bands = false) {
    const cv = document.createElement("canvas");
    cv.width = 512;
    cv.height = 256;
    const c = cv.getContext("2d")!;
    let seed = s;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let y = 0; y < 256; y += bands ? 6 : 2) {
      c.fillStyle = cols[Math.floor(rnd() * cols.length)];
      if (bands) c.fillRect(0, y, 512, 6);
      else for (let x = 0; x < 512; x += 8) {
        c.fillStyle = cols[Math.floor(rnd() * cols.length)];
        c.fillRect(x, y, 8, 2);
      }
    }
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  private moonTex() {
    const cv = document.createElement("canvas");
    cv.width = 1024;
    cv.height = 512;
    const c = cv.getContext("2d")!;
    c.fillStyle = "#9a9a9e";
    c.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 500; i++) {
      const x = Math.random() * 1024,
        y = Math.random() * 512,
        rr = 2 + Math.pow(Math.random(), 3) * 40;
      c.fillStyle = `rgba(${Math.random() < 0.5 ? "60,60,66" : "190,190,196"},${0.25 + Math.random() * 0.3})`;
      c.beginPath();
      c.arc(x, y, rr, 0, Math.PI * 2);
      c.fill();
    }
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // ---------------------------------------------------------------- station
  private buildStation() {
    const r = this.root;
    const s = STATION;
    const hull = new THREE.MeshStandardMaterial({ color: 0xe8eaf0, metalness: 0.6, roughness: 0.35 });
    // pont d'appontage (180 × 180 m) avec garde-corps
    const deck = new THREE.Mesh(new THREE.BoxGeometry(180, 6, 180), new THREE.MeshStandardMaterial({ color: 0x2a2e38, metalness: 0.6, roughness: 0.4 }));
    deck.position.set(s.x, s.y - 3, s.z);
    r.add(deck);
    G.physics.addBox({ x: s.x - 90, y: s.y - 6, z: s.z - 90 }, { x: s.x + 90, y: s.y, z: s.z + 90 }, "station");
    for (const [x1, z1, x2, z2] of [[-90, -90, 90, -89], [-90, 89, 90, 90], [-90, -90, -89, 90], [89, -90, 90, 90]]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(x2 - x1, 1.4, z2 - z1), mat.glowCyan);
      w.position.set(s.x + (x1 + x2) / 2, s.y + 0.7, s.z + (z1 + z2) / 2);
      r.add(w);
      G.physics.addBox({ x: s.x + x1, y: s.y, z: s.z + z1 }, { x: s.x + x2, y: s.y + 1.4, z: s.z + z2 }, "station");
    }
    const pad = new THREE.Mesh(new THREE.RingGeometry(46, 50, 96), mat.glowGold);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(s.x, s.y + 0.05, s.z);
    r.add(pad);
    // salle d'observation vitrée (coin du pont)
    const ox = s.x - 62,
      oz = s.z - 62;
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.2, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(22, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), glass);
    dome.position.set(ox, s.y, oz);
    r.add(dome);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const seat = new THREE.Mesh(new THREE.BoxGeometry(3, 0.8, 1.4), new THREE.MeshStandardMaterial({ color: 0x1a1b20 }));
      seat.position.set(ox + Math.cos(a) * 12, s.y + 0.4, oz + Math.sin(a) * 12);
      seat.lookAt(ox, s.y + 0.4, oz);
      r.add(seat);
    }
    const holo = new THREE.Mesh(new THREE.OctahedronGeometry(3), mat.holo);
    holo.position.set(ox, s.y + 5, oz);
    r.add(holo);
    G.interact.add({
      id: "station-view",
      pos: new THREE.Vector3(ox, s.y + 1, oz),
      radius: 14,
      enabled: () => this.active && G.mode === "foot",
      label: () => "Regarder la Terre depuis la salle d'observation",
      action: () => {
        G.player.sit(new THREE.Vector3(ox + 12, s.y + 0.8 + 0.75, oz), Math.PI / 2);
        G.player.pitch = -0.6;
        bus.emit("toast", { text: "🌍 Voici votre planète, Majesté. Tout votre royaume est là, en bas." });
      }
    });
    // anneau rotatif + rayons + axe central (au-dessus du vaisseau posé)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(260, 14, 20, 120), hull);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(s.x, s.y + 160, s.z);
    r.add(ring);
    const ringLights = new THREE.Mesh(new THREE.TorusGeometry(260, 15, 4, 120), new THREE.MeshBasicMaterial({ color: 0x6fd0ff, wireframe: true, transparent: true, opacity: 0.35 }));
    ringLights.rotation.x = Math.PI / 2;
    ringLights.position.copy(ring.position);
    r.add(ringLights);
    for (let k = 0; k < 6; k++) {
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 260, 8), hull);
      spoke.rotation.z = Math.PI / 2;
      spoke.rotation.y = (k / 6) * Math.PI;
      spoke.position.set(s.x, s.y + 160, s.z);
      r.add(spoke);
    }
    const spindle = new THREE.Mesh(new THREE.CylinderGeometry(18, 18, 160, 24), hull);
    spindle.position.set(s.x, s.y + 200, s.z);
    r.add(spindle);
    for (const sx of [-1, 1]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(220, 1, 60), new THREE.MeshStandardMaterial({ color: 0x1a2a5a, metalness: 0.8, roughness: 0.3, emissive: 0x0a1a4a }));
      panel.position.set(s.x + sx * 420, s.y + 200, s.z);
      r.add(panel);
    }
    G.palace.updaters.push((dt) => {
      if (!this.active) return;
      ring.rotation.z += dt * 0.05;
      ringLights.rotation.z += dt * 0.05;
      holo.rotation.y += dt;
    });
    G.world.markers.push({ id: "station", name: "Station orbitale royale", pos: s.clone(), icon: "✧", visible: () => this.active });
  }

  private buildMoonBase() {
    const r = this.root;
    const b = MOON_BASE;
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(160, 170, 8, 64), new THREE.MeshStandardMaterial({ color: 0x8a8a90, roughness: 1 }));
    plate.position.set(b.x, b.y - 4, b.z);
    r.add(plate);
    G.physics.addBox({ x: b.x - 150, y: b.y - 40, z: b.z - 150 }, { x: b.x + 150, y: b.y, z: b.z + 150 }, "moon");
    const domeM = new THREE.MeshPhysicalMaterial({ color: 0xe8f0ff, metalness: 0.3, roughness: 0.2, transparent: true, opacity: 0.85 });
    for (const [dx, dz, rr] of [[-60, -40, 22], [-20, -70, 14], [40, -60, 18]]) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(rr, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), domeM);
      d.position.set(b.x + dx, b.y, b.z + dz);
      r.add(d);
      G.physics.addBox({ x: b.x + dx - rr * 0.7, y: b.y, z: b.z + dz - rr * 0.7 }, { x: b.x + dx + rr * 0.7, y: b.y + rr * 0.7, z: b.z + dz + rr * 0.7 }, "moon");
    }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 8, 8), mat.silver);
    pole.position.set(b.x + 20, b.y + 4, b.z + 20);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.5), new THREE.MeshStandardMaterial({ color: 0x1e90ff, emissive: 0x0a3a8a, side: THREE.DoubleSide }));
    flag.position.set(b.x + 22, b.y + 6.6, b.z + 20);
    const pad = new THREE.Mesh(new THREE.RingGeometry(46, 50, 96), mat.glowGold);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(b.x + 50, b.y + 0.05, b.z + 50);
    r.add(pole, flag, pad);
    G.world.markers.push({ id: "moonbase", name: "Base lunaire royale", pos: b.clone(), icon: "☾", visible: () => this.active });
  }

  // ---------------------------------------------------------------- transitions
  /** Sortie de l'atmosphère : le Royal Talon arrive en orbite, face à la station. */
  enter() {
    if (this.active) return;
    const ship = G.ship;
    if (ship.opts.small) {
      bus.emit("toast", { text: "Le Faucon de Zuria ne peut pas aller dans l'espace : prenez le Royal Talon.", kind: "warn" });
      return false;
    }
    this.back.copy(ship.root.position);
    this.active = true;
    this.cooldown = 4;
    bus.emit("fade");
    ship.root.position.set(STATION.x, SPACE_Y - 400, STATION.z + 1600);
    ship.yaw = 0;
    ship.pitch = 0;
    ship.roll = 0;
    ship.landed = false;
    ship.supersonic = false;
    ship.autopilot = null;
    ship.vy = 0;
    ship.view = "chase"; // vue extérieure : le vaisseau devant la Terre et les étoiles
    this.setEnv(true);
    G.audio.whoosh(2.5, 2000, 80, 0.3);
    bus.emit("toast", { text: "🌌 Espace atteint ! La Station orbitale royale est droit devant. Dites « pose-toi sur la station » ou « emmène-moi sur la Lune »." });
    bus.emit("zone");
    return true;
  }

  /** Rentrée atmosphérique : retour au-dessus de l'endroit d'où l'on est parti. */
  exit() {
    if (!this.active) return;
    this.active = false;
    this.cooldown = 6;
    bus.emit("fade");
    const ship = G.ship;
    if (G.mode === "ship") {
      ship.root.position.set(this.back.x, 2200, this.back.z);
      ship.pitch = 0;
      ship.autopilot = null;
    } else {
      // à pied (station, Lune) : retour au palais
      G.player.teleport(G.palace.spots.gardens.pos.clone(), Math.PI);
      ship.park();
    }
    this.setEnv(false);
    G.player.gravityMul = 1;
    bus.emit("toast", { text: "🔥 Rentrée atmosphérique réussie. Bienvenue sur Terre, Majesté." });
    bus.emit("zone");
  }

  private setEnv(on: boolean) {
    this.root.visible = on;
    G.env.space = on;
    G.camera.far = on ? 260000 : 12000;
    G.camera.near = on ? 0.3 : 0.1;
    G.camera.updateProjectionMatrix();
  }

  update(dt: number, t: number) {
    this.cooldown -= dt;
    const ship = G.ship;
    const focus = G.mode === "ship" ? ship.root.position : G.player.position;
    if (!this.active) {
      // montée verticale au-dessus de 2 500 m : sortie de l'atmosphère
      if (G.mode === "ship" && !ship.opts.small && ship.root.position.y > 2450 && this.cooldown < 0 && (ship.vy > 1 || ship.pitch > 0.15)) this.enter();
      return;
    }
    this.stars.position.copy(G.camera.position);
    this.clouds.rotation.y += dt * 0.006;
    // descente sous l'orbite : rentrée atmosphérique
    if (this.cooldown < 0 && G.mode === "ship" && focus.y < SPACE_Y - 2500) this.exit();
    if (G.mode !== "ship" && focus.y < SPACE_Y - 3000) {
      // téléporté ailleurs sur Terre
      this.active = false;
      this.setEnv(false);
      G.player.gravityMul = 1;
    }
    // gravité lunaire sur la base
    G.player.gravityMul = G.mode === "foot" && focus.distanceTo(MOON_BASE) < 400 ? 0.17 : 1;
    void t;
  }

  /** Lieu de l'espace le plus proche (pour les noms de zone). */
  zone(p: THREE.Vector3) {
    if (p.distanceTo(MOON_BASE) < 600) return "Lune — Base royale";
    if (p.distanceTo(MOON.c) < MOON.r * 1.6) return "Orbite lunaire";
    if (p.distanceTo(STATION) < 600) return "Station orbitale royale";
    return "Espace — orbite terrestre";
  }
}
