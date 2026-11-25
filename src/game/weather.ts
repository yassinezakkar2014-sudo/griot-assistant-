// MÉTÉO ET FEUX D'ARTIFICE : pluie, neige, orage (éclairs et tonnerre), aurores boréales,
// et grands feux d'artifice au-dessus du Palais Impérial (ou devant le joueur).
import * as THREE from "three";
import { G, bus } from "../core";
import { IMPERIAL } from "../world/imperial";

export type WeatherKind = "clear" | "rain" | "snow" | "storm" | "aurora";
const N = 5000;

export class Weather {
  kind: WeatherKind = "clear";
  private rain!: THREE.LineSegments;
  private snow!: THREE.Points;
  private aurora!: THREE.Mesh;
  private flash = 0;
  private nextBolt = 4;
  private seed = new Float32Array(N * 3);

  build() {
    for (let i = 0; i < N; i++) {
      this.seed[i * 3] = (Math.random() - 0.5) * 160;
      this.seed[i * 3 + 1] = Math.random() * 90;
      this.seed[i * 3 + 2] = (Math.random() - 0.5) * 160;
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(N * 6), 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xaecbe6, transparent: true, opacity: 0.55, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    this.snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, transparent: true, opacity: 0.9, depthWrite: false }));
    this.snow.frustumCulled = false;
    this.snow.visible = false;
    // aurore boréale : grand rideau ondulant dans le ciel
    const ag = new THREE.PlaneGeometry(9000, 1400, 120, 1);
    this.aurora = new THREE.Mesh(
      ag,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        fog: false,
        uniforms: { t: { value: 0 }, a: { value: 0 } },
        vertexShader: `uniform float t; varying vec2 vUv; void main(){ vUv = uv; vec3 p = position; p.z += sin(p.x*0.0015 + t*0.3)*420.0 + sin(p.x*0.004 - t*0.5)*120.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.0); }`,
        fragmentShader: `uniform float t; uniform float a; varying vec2 vUv; void main(){ float band = smoothstep(0.0,0.35,vUv.y)*(1.0-smoothstep(0.45,1.0,vUv.y)); float rays = 0.55+0.45*sin(vUv.x*260.0+t*1.7)*sin(vUv.x*73.0-t*0.9); vec3 c = mix(vec3(0.1,1.0,0.55), vec3(0.6,0.3,1.0), smoothstep(0.3,1.0,vUv.y)); gl_FragColor = vec4(c, band*rays*a*0.75); }`
      })
    );
    this.aurora.visible = false;
    G.scene.add(this.rain, this.snow, this.aurora);
    G.palace.updaters.push((dt, t) => this.update(dt, t));
  }

  set(kind: WeatherKind) {
    this.kind = kind;
    this.rain.visible = kind === "rain" || kind === "storm";
    this.snow.visible = kind === "snow";
    this.aurora.visible = kind === "aurora";
    if (kind === "aurora" && G.env.nightFactor < 0.6) G.env.setHour(23);
    const label = { clear: "☀️ Beau temps", rain: "🌧️ Pluie", snow: "❄️ Neige", storm: "⛈️ Orage", aurora: "🌌 Aurore boréale" }[kind];
    bus.emit("toast", { text: label });
  }

  private update(dt: number, t: number) {
    if (this.kind === "clear") return;
    const env = G.env as any;
    const cam = G.camera.position;
    if (this.kind === "rain" || this.kind === "storm" || this.kind === "snow") {
      // ciel couvert
      env.sun.intensity *= this.kind === "snow" ? 0.55 : 0.3;
      env.hemi.intensity *= 0.75;
      env.fog.density *= this.kind === "snow" ? 3 : 2.4;
    }
    if (this.rain.visible) {
      const a = this.rain.geometry.attributes.position as THREE.BufferAttribute;
      const arr = a.array as Float32Array;
      for (let i = 0; i < N; i++) {
        let y = this.seed[i * 3 + 1] - dt * 38;
        if (y < 0) y += 90;
        this.seed[i * 3 + 1] = y;
        const x = cam.x + wrap(this.seed[i * 3] - cam.x),
          z = cam.z + wrap(this.seed[i * 3 + 2] - cam.z),
          yy = cam.y - 30 + y;
        arr.set([x, yy, z, x + 0.15, yy - 1.4, z], i * 6);
      }
      a.needsUpdate = true;
    }
    if (this.snow.visible) {
      const a = this.snow.geometry.attributes.position as THREE.BufferAttribute;
      const arr = a.array as Float32Array;
      for (let i = 0; i < N; i++) {
        let y = this.seed[i * 3 + 1] - dt * 2.2;
        if (y < 0) y += 90;
        this.seed[i * 3 + 1] = y;
        this.seed[i * 3] += Math.sin(t + i) * dt * 0.6;
        arr[i * 3] = cam.x + wrap(this.seed[i * 3] - cam.x);
        arr[i * 3 + 1] = cam.y - 30 + y;
        arr[i * 3 + 2] = cam.z + wrap(this.seed[i * 3 + 2] - cam.z);
      }
      a.needsUpdate = true;
    }
    if (this.kind === "storm") {
      this.nextBolt -= dt;
      if (this.nextBolt < 0) {
        this.nextBolt = 4 + Math.random() * 8;
        this.flash = 1;
        setTimeout(() => G.audio.whoosh(2.2, 90, 28, 0.35), 400 + Math.random() * 1200);
      }
      if (this.flash > 0) {
        env.hemi.intensity += 4 * this.flash * (Math.random() > 0.3 ? 1 : 0.2);
        this.flash = Math.max(0, this.flash - dt * 3);
      }
    }
    if (this.aurora.visible) {
      const m = this.aurora.material as THREE.ShaderMaterial;
      m.uniforms.t.value = t;
      m.uniforms.a.value = Math.min(1, G.env.nightFactor * 1.4);
      this.aurora.position.set(cam.x, cam.y + 1500, cam.z - 3500);
    }
  }
}

const wrap = (d: number) => ((((d + 80) % 160) + 160) % 160) - 80;

// ---------------------------------------------------------------- feux d'artifice
interface Burst {
  pts: THREE.Points;
  vel: Float32Array;
  life: number;
  rocket: THREE.Vector3 | null;
  target: THREE.Vector3;
  color: THREE.Color;
}

export class Fireworks {
  private bursts: Burst[] = [];
  private queue = 0;
  private timer = 0;
  private center = new THREE.Vector3();

  build() {
    G.palace.updaters.push((dt) => this.update(dt));
  }

  /** Lance un spectacle de `n` fusées. */
  show(n = 30) {
    const imp = new THREE.Vector3(IMPERIAL.x, IMPERIAL.y, IMPERIAL.z);
    if (G.camera.position.distanceTo(imp) < 6000) this.center.copy(imp).add(new THREE.Vector3(0, 0, -200));
    else {
      const f = new THREE.Vector3();
      G.camera.getWorldDirection(f);
      f.y = 0;
      f.normalize();
      this.center.copy(G.camera.position).addScaledVector(f, 450);
      this.center.y = G.physics.terrain(this.center.x, this.center.z);
    }
    this.queue += n;
    this.timer = 0;
    if (G.env.nightFactor < 0.5) bus.emit("toast", { text: "🎆 Feu d'artifice ! (encore plus beau la nuit : dites « mets la nuit »)" });
    else bus.emit("toast", { text: "🎆 Feu d'artifice royal !" });
  }

  private launch() {
    const M = 140;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(M * 3), 3));
    const color = new THREE.Color().setHSL(Math.random(), 1, 0.6);
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color, size: 5, sizeAttenuation: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    pts.frustumCulled = false;
    G.scene.add(pts);
    const start = this.center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 500, 0, (Math.random() - 0.5) * 300));
    const target = start.clone().add(new THREE.Vector3(0, 220 + Math.random() * 180, 0));
    const vel = new Float32Array(M * 3);
    this.bursts.push({ pts, vel, life: 4, rocket: start, target, color });
    G.audio.whoosh(0.9, 400, 1400, 0.05);
  }

  private update(dt: number) {
    if (this.queue > 0) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = 0.35 + Math.random() * 0.6;
        this.queue--;
        this.launch();
      }
    }
    for (let k = this.bursts.length - 1; k >= 0; k--) {
      const b = this.bursts[k];
      const a = b.pts.geometry.attributes.position as THREE.BufferAttribute;
      const arr = a.array as Float32Array;
      const M = arr.length / 3;
      if (b.rocket) {
        b.rocket.y += dt * 260;
        for (let i = 0; i < M; i++) arr.set([b.rocket.x, b.rocket.y - i * 0.05, b.rocket.z], i * 3);
        (b.pts.material as THREE.PointsMaterial).size = 3;
        if (b.rocket.y >= b.target.y) {
          // explosion
          for (let i = 0; i < M; i++) {
            const u = Math.random() * 2 - 1,
              th = Math.random() * Math.PI * 2,
              s = Math.sqrt(1 - u * u),
              sp = 60 + Math.random() * 30;
            b.vel.set([Math.cos(th) * s * sp, u * sp, Math.sin(th) * s * sp], i * 3);
          }
          b.rocket = null;
          (b.pts.material as THREE.PointsMaterial).size = 6;
          G.audio.tone(90 + Math.random() * 60, 0.5, "sawtooth", 0.07, 40);
        }
      } else {
        b.life -= dt;
        for (let i = 0; i < M; i++) {
          b.vel[i * 3 + 1] -= 30 * dt;
          b.vel[i * 3] *= 1 - dt * 0.9;
          b.vel[i * 3 + 1] *= 1 - dt * 0.9;
          b.vel[i * 3 + 2] *= 1 - dt * 0.9;
          arr[i * 3] += b.vel[i * 3] * dt;
          arr[i * 3 + 1] += b.vel[i * 3 + 1] * dt;
          arr[i * 3 + 2] += b.vel[i * 3 + 2] * dt;
        }
        (b.pts.material as THREE.PointsMaterial).opacity = Math.max(0, Math.min(1, b.life / 1.5));
        if (b.life <= 0) {
          G.scene.remove(b.pts);
          b.pts.geometry.dispose();
          (b.pts.material as THREE.Material).dispose();
          this.bursts.splice(k, 1);
          continue;
        }
      }
      a.needsUpdate = true;
    }
  }
}
