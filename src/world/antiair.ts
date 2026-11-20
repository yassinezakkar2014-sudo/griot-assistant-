// DÉFENSE ANTI-AÉRIENNE DU PALAIS ROYAL (pas à Zuria) : 8 tourelles sur les remparts et un radar
// sur le toit. Elles suivent les appareils en vol (les vaisseaux en mode furtif leur échappent),
// identifient les amis et signalent les appareils inconnus. Aucun ennemi : elles ne tirent
// qu'en démonstration, vers le ciel, sur demande.
import * as THREE from "three";
import { G, bus, damp } from "../core";
import { mat } from "./materials";
import { TOP } from "./palace";

interface Turret {
  root: THREE.Group;
  yawG: THREE.Group;
  pitchG: THREE.Group;
  eye: THREE.MeshStandardMaterial;
  muzzle: THREE.Vector3[];
  yaw: number;
  pitch: number;
  fireT: number;
}

const RANGE = 1600;

export class AntiAir {
  armed = true;
  turrets: Turret[] = [];
  private radar!: THREE.Group;
  private tracers: { m: THREE.Mesh; v: THREE.Vector3; t: number; burst: boolean }[] = [];
  private demoT = 0;
  private known = new Set<string>();
  lockedName = "";

  build() {
    const R = 300,
      wallTop = 48;
    const spots: [number, number][] = [[-150, -R], [150, -R], [-150, R], [150, R], [-R, -150], [-R, 150], [R, -150], [R, 150]];
    for (const [x, z] of spots) this.turrets.push(this.turret(new THREE.Vector3(x, wallTop, z)));
    // radar tournant sur le toit du palais
    const r = (this.radar = new THREE.Group());
    r.position.set(24, TOP + 0.6, 24);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 5, 12), mat.silver);
    mast.position.y = 2.5;
    const dish = new THREE.Mesh(new THREE.SphereGeometry(3.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 3), mat.silver);
    dish.position.y = 5.5;
    dish.rotation.x = Math.PI / 2.3;
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff3040, emissiveIntensity: 3 }));
    beacon.position.y = 7.6;
    r.add(mast, dish, beacon);
    G.scene.add(r);
  }

  private turret(pos: THREE.Vector3): Turret {
    const root = new THREE.Group();
    root.position.copy(pos);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.2, 1.6, 24), mat.graphite);
    base.position.y = 0.8;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.08, 6, 40), mat.glowBlue);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.6;
    root.add(base, ring);
    const yawG = new THREE.Group();
    yawG.position.y = 1.6;
    const housing = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2, 3.6), mat.black);
    housing.position.y = 1.1;
    housing.castShadow = true;
    yawG.add(housing);
    const pitchG = new THREE.Group();
    pitchG.position.set(0, 1.4, -0.6);
    const muzzle: THREE.Vector3[] = [];
    for (const sx of [-0.7, 0.7]) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 6.5, 12), mat.silver);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(sx, 0, -3.4);
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.6, 12), mat.black);
      tip.rotation.x = Math.PI / 2;
      tip.position.set(sx, 0, -6.6);
      pitchG.add(barrel, tip);
      muzzle.push(new THREE.Vector3(sx, 0, -7));
    }
    const eye = new THREE.MeshStandardMaterial({ color: 0, emissive: 0x3fc8ff, emissiveIntensity: 2.5 });
    const sensor = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), eye);
    sensor.position.set(0, 0.6, -1.9);
    pitchG.add(sensor);
    yawG.add(pitchG);
    root.add(yawG);
    G.scene.add(root);
    G.physics.addBox({ x: pos.x - 3, y: pos.y, z: pos.z - 3 }, { x: pos.x + 3, y: pos.y + 4, z: pos.z + 3 });
    return { root, yawG, pitchG, eye, muzzle, yaw: 0, pitch: 0.3, fireT: 0 };
  }

  /** Appareils visibles par le radar (les vaisseaux furtifs et posés sont ignorés). */
  private contacts() {
    const list: { id: string; name: string; pos: THREE.Vector3; friend: boolean }[] = [];
    for (const s of G.ships ?? []) if (!s.landed && !s.stealth) list.push({ id: "own:" + s.name, name: s.name, pos: s.root.position, friend: true });
    for (const [id, r] of G.net?.peers ?? []) {
      const st = r.state;
      if (st && st.s && (st.s as number[])[8] !== 1 && st.s[1] > 20) list.push({ id: "p:" + id, name: `${st.n} (joueur)`, pos: r.shipGroup.position, friend: false });
    }
    return list;
  }

  /** Salve de démonstration : traceurs et éclats dans le ciel, loin de tout appareil. */
  demo() {
    this.demoT = 4;
    bus.emit("toast", { text: "🎆 Défense anti-aérienne : tir de démonstration vers le ciel." });
  }

  update(dt: number, t: number) {
    if (!this.turrets.length) return;
    this.radar.rotation.y += dt * 1.4;
    const near = G.camera.position.length() < 2500;
    const contacts = this.armed ? this.contacts() : [];
    let lock = "";
    for (const tu of this.turrets) {
      let ty = tu.yaw + dt * 0.25,
        tp = 0.25 + Math.sin(t * 0.3 + tu.root.position.x) * 0.1;
      let best: (typeof contacts)[number] | null = null;
      let bd = RANGE;
      for (const c of contacts) {
        const d = c.pos.distanceTo(tu.root.position);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      if (this.demoT > 0) {
        ty = tu.yaw + Math.sin(t * 2 + tu.root.position.z) * 0.02;
        tp = 0.9 + Math.sin(t * 3 + tu.root.position.x) * 0.15;
      } else if (best) {
        const d = best.pos.clone().sub(tu.root.position);
        ty = Math.atan2(-d.x, -d.z);
        tp = Math.atan2(d.y, Math.hypot(d.x, d.z));
        lock = best.name + (best.friend ? " (ami)" : "");
        if (!best.friend && !this.known.has(best.id)) {
          this.known.add(best.id);
          bus.emit("toast", { text: `⚠ Défense anti-aérienne : appareil ${best.name} dans l'espace aérien royal. Suivi en cours.`, kind: "warn" });
        }
      }
      let dy = ty - tu.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      tu.yaw += dy * Math.min(1, dt * 3);
      tu.pitch = damp(tu.pitch, Math.max(-0.1, Math.min(1.3, tp)), 3, dt);
      tu.yawG.rotation.y = tu.yaw;
      tu.pitchG.rotation.x = tu.pitch;
      tu.eye.emissive.setHex(!this.armed ? 0x333333 : best ? (best.friend ? 0x3fff9a : 0xff3040) : 0x3fc8ff);
      // tir de démonstration
      if (this.demoT > 0 && near) {
        tu.fireT -= dt;
        if (tu.fireT <= 0) {
          tu.fireT = 0.12 + Math.random() * 0.1;
          tu.root.updateMatrixWorld(true);
          for (const mz of tu.muzzle) {
            const from = tu.pitchG.localToWorld(mz.clone());
            const dir = tu.pitchG.localToWorld(mz.clone().add(new THREE.Vector3(0, 0, -1))).sub(from).normalize();
            this.tracer(from, dir.multiplyScalar(420), false);
          }
          if (Math.random() < 0.3) G.audio.tone(140 + Math.random() * 60, 0.08, "square", 0.04, 60);
        }
      }
    }
    this.lockedName = lock;
    if (this.demoT > 0) this.demoT -= dt;
    // traceurs et éclats
    for (const tr of this.tracers) {
      tr.t += dt;
      if (!tr.burst) {
        tr.m.position.addScaledVector(tr.v, dt);
        tr.m.lookAt(tr.m.position.clone().add(tr.v));
        if (tr.t > 0.9 + Math.random() * 0.4) {
          tr.t = 99;
          this.tracer(tr.m.position.clone(), new THREE.Vector3(), true);
        }
      } else {
        tr.m.scale.setScalar(1 + tr.t * 18);
        (tr.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - tr.t * 1.6);
      }
    }
    this.tracers = this.tracers.filter((tr) => {
      const alive = tr.burst ? tr.t < 0.6 : tr.t < 50;
      if (!alive) G.scene.remove(tr.m);
      return alive;
    });
  }

  private static tracerGeo = new THREE.CylinderGeometry(0.12, 0.12, 6, 6).rotateX(Math.PI / 2);
  private static burstGeo = new THREE.SphereGeometry(1, 12, 8);
  private tracer(from: THREE.Vector3, v: THREE.Vector3, burst: boolean) {
    const m = new THREE.Mesh(
      burst ? AntiAir.burstGeo : AntiAir.tracerGeo,
      new THREE.MeshBasicMaterial({ color: burst ? 0xffa040 : 0xfff2a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    m.position.copy(from);
    G.scene.add(m);
    this.tracers.push({ m, v, t: 0, burst });
    if (burst && Math.random() < 0.4) G.audio.tone(70, 0.3, "sine", 0.06, 40);
  }
}
