// ATTAQUES DE L'ARMURE ROYALE : rayon d'énergie (projectile qui explose à l'impact), onde de choc
// (dégâts de zone) et cibles d'entraînement holographiques qui explosent et réapparaissent.
// Aucun ennemi : uniquement des drones-cibles d'entraînement.
import * as THREE from "three";
import { G, bus } from "../core";

interface Target {
  g: THREE.Group;
  core: THREE.Mesh;
  home: THREE.Vector3;
  alive: boolean;
  respawn: number;
  phase: number;
  temp?: boolean;
}
interface Bolt {
  m: THREE.Mesh;
  v: THREE.Vector3;
  life: number;
  r: number;
}
interface Boom {
  flash: THREE.Mesh;
  pts: THREE.Points;
  vel: Float32Array;
  t: number;
}

/** Champ d'entraînement, dans la cour nord-ouest du palais. */
export const RANGE = new THREE.Vector3(-200, 0, 200);

export class Combat {
  targets: Target[] = [];
  bolts: Bolt[] = [];
  booms: Boom[] = [];
  score = 0;
  private boltGeo = new THREE.SphereGeometry(0.35, 12, 8);
  private coreGeo = new THREE.OctahedronGeometry(0.9);
  private ringGeo = new THREE.TorusGeometry(1.4, 0.07, 6, 32);
  private tmp = new THREE.Vector3();

  build() {
    // champ d'entraînement : 8 drones en cercle + socle lumineux
    const y = G.physics.terrain(RANGE.x, RANGE.z);
    const base = new THREE.Mesh(new THREE.RingGeometry(38, 40, 64), new THREE.MeshBasicMaterial({ color: 0xff7a3a, side: THREE.DoubleSide }));
    base.rotation.x = -Math.PI / 2;
    base.position.set(RANGE.x, y + 0.08, RANGE.z);
    G.scene.add(base);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      this.addTarget(new THREE.Vector3(RANGE.x + Math.cos(a) * 30, y + 3 + (k % 3) * 2.5, RANGE.z + Math.sin(a) * 30));
    }
    G.world.markers.push({ id: "range", name: "Champ d'entraînement", pos: RANGE.clone(), icon: "◎", visible: () => true });
    bus.on("armor:pulse", (d: { p: THREE.Vector3; r: number }) => this.damageArea(d.p, d.r, true));
    G.palace.updaters.push((dt, t) => this.update(dt, t));
  }

  addTarget(pos: THREE.Vector3, temp = false) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(this.coreGeo, new THREE.MeshStandardMaterial({ color: 0x220800, emissive: 0xff5a1a, emissiveIntensity: 2.4, metalness: 0.6, roughness: 0.3 }));
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xffc861 }));
    ring.rotation.x = Math.PI / 2;
    const ring2 = ring.clone();
    ring2.rotation.set(0, 0, 0);
    g.add(core, ring, ring2);
    g.position.copy(pos);
    G.scene.add(g);
    this.targets.push({ g, core, home: pos.clone(), alive: true, respawn: 0, phase: Math.random() * 6, temp });
  }

  /** Lance l'entraînement : 8 cibles autour du joueur. */
  spawnAround() {
    const p = G.player.position;
    this.targets.filter((t) => t.temp).forEach((t) => G.scene.remove(t.g));
    this.targets = this.targets.filter((t) => !t.temp);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const x = p.x + Math.cos(a) * 22,
        z = p.z + Math.sin(a) * 22;
      const y = G.physics.ground(x, p.y + 20, z, 40).y;
      this.addTarget(new THREE.Vector3(x, y + 3 + (k % 3) * 2, z), true);
    }
    bus.emit("toast", { text: "🎯 8 cibles d'entraînement autour de vous. 5 : rayon · 1 : onde de choc." });
  }

  /** Rayon d'énergie tiré depuis la main de l'armure, dans la direction visée. */
  fire(o: { from?: THREE.Vector3; scale?: number; radius?: number; color?: string } = {}) {
    const dir = new THREE.Vector3();
    G.camera.getWorldDirection(dir);
    const right = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    const from = o.from ?? G.player.position.clone().add(new THREE.Vector3(0, 1.45, 0)).addScaledVector(right, 0.45).addScaledVector(dir, 0.8);
    // visée assistée : la cible vivante la plus proche de l'axe
    let best: Target | null = null,
      bestDot = 0.985;
    for (const t of this.targets) {
      if (!t.alive) continue;
      const to = this.tmp.copy(t.g.position).sub(from);
      const d = to.length();
      if (d > (o.scale ? 420 : 260)) continue;
      const dot = to.normalize().dot(dir);
      if (dot > bestDot) {
        bestDot = dot;
        best = t;
      }
    }
    if (best) dir.copy(best.g.position).sub(from).normalize();
    const color = new THREE.Color(o.color ?? G.armor.style.glow);
    const m = new THREE.Mesh(this.boltGeo, new THREE.MeshBasicMaterial({ color, blending: THREE.AdditiveBlending, transparent: true }));
    const trail = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.02, 6, 8).rotateX(Math.PI / 2).translate(0, 0, 3), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.add(trail);
    m.position.copy(from);
    m.lookAt(from.clone().sub(dir));
    m.scale.setScalar(o.scale ?? 1);
    G.scene.add(m);
    this.bolts.push({ m, v: dir.multiplyScalar(170), life: 2.6, r: o.radius ?? 7 });
    G.audio.tone(980, 0.18, "sawtooth", 0.08, 220);
    bus.emit("shake", 0.12);
  }

  private explode(p: THREE.Vector3, big = false) {
    const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffd28a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    flash.position.copy(p);
    G.scene.add(flash);
    const N = big ? 90 : 50;
    const pos = new Float32Array(N * 3);
    const vel = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos.set([p.x, p.y, p.z], i * 3);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(8 + Math.random() * 16);
      vel.set([v.x, v.y, v.z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xff9a3a, size: 0.5, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    G.scene.add(pts);
    this.booms.push({ flash, pts, vel, t: 0 });
    G.audio.tone(120, 0.5, "square", 0.12, 40);
    G.audio.whoosh(0.5, 900, 120, 0.12);
  }

  private hit(t: Target) {
    if (!t.alive) return;
    t.alive = false;
    t.g.visible = false;
    t.respawn = 6;
    this.score++;
    this.explode(t.g.position.clone(), true);
    bus.emit("toast", { text: `💥 Cible détruite ! Score : ${this.score}` });
    bus.emit("mission", { type: "target", score: this.score });
  }

  damageArea(p: THREE.Vector3, r: number, wave = false) {
    let n = 0;
    for (const t of this.targets) if (t.alive && t.g.position.distanceTo(p) < r) {
      this.hit(t);
      n++;
    }
    if (wave && n) bus.emit("toast", { text: `⚡ Onde de choc : ${n} cible${n > 1 ? "s" : ""} détruite${n > 1 ? "s" : ""} !` });
  }

  update(dt: number, t: number) {
    for (const tg of this.targets) {
      if (!tg.alive) {
        tg.respawn -= dt;
        if (tg.respawn <= 0) {
          tg.alive = true;
          tg.g.visible = true;
          tg.g.scale.setScalar(0.01);
        }
        continue;
      }
      tg.g.scale.setScalar(Math.min(1, tg.g.scale.x + dt * 2));
      tg.g.position.y = tg.home.y + Math.sin(t * 1.6 + tg.phase) * 0.6;
      tg.g.rotation.y += dt * 1.5;
      tg.g.children[1].rotation.z += dt * 3;
    }
    for (const b of this.bolts) {
      b.life -= dt;
      const step = b.v.clone().multiplyScalar(dt);
      const n = Math.ceil(step.length() / 2);
      for (let i = 0; i < n && b.life > 0; i++) {
        b.m.position.addScaledVector(step, 1 / n);
        const p = b.m.position;
        const tg = this.targets.find((x) => x.alive && x.g.position.distanceTo(p) < 2.2 + b.r * 0.15);
        if (tg || G.physics.pointInSolid(p) || p.y < G.physics.terrain(p.x, p.z) + 0.1) {
          this.explode(p.clone(), b.r > 10);
          this.damageArea(p, b.r);
          b.life = 0;
        }
      }
    }
    this.bolts = this.bolts.filter((b) => {
      if (b.life > 0) return true;
      G.scene.remove(b.m);
      return false;
    });
    for (const bm of this.booms) {
      bm.t += dt;
      bm.flash.scale.setScalar(1 + bm.t * 14);
      (bm.flash.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - bm.t * 2.4);
      const a = bm.pts.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < a.count; i++) {
        bm.vel[i * 3 + 1] -= 18 * dt;
        a.setXYZ(i, a.getX(i) + bm.vel[i * 3] * dt, a.getY(i) + bm.vel[i * 3 + 1] * dt, a.getZ(i) + bm.vel[i * 3 + 2] * dt);
      }
      a.needsUpdate = true;
      (bm.pts.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - bm.t * 0.9);
    }
    this.booms = this.booms.filter((bm) => {
      if (bm.t < 1.2) return true;
      G.scene.remove(bm.flash, bm.pts);
      bm.pts.geometry.dispose();
      return false;
    });
  }
}
