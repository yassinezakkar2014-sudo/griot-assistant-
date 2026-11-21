// LE TITAN — robot géant de 15 m piloté depuis l'Armure Royale. Il marche (pas qui font trembler
// le sol), saute avec ses réacteurs, tire au canon d'énergie et frappe le sol (onde de choc géante).
import * as THREE from "three";
import { G, bus, damp } from "../core";

export const TITAN_H = 15;

export class Mecha {
  root = new THREE.Group();
  active = false;
  private legs: { hip: THREE.Group; knee: THREE.Group }[] = [];
  private arms: THREE.Group[] = [];
  private jets: THREE.Mesh[] = [];
  private phase = 0;
  private lastStep = 0;
  private plate = new THREE.MeshStandardMaterial({ color: 0x2a2e38, metalness: 0.9, roughness: 0.3 });
  private glow = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff7a2a, emissiveIntensity: 2.6 });
  private dark = new THREE.MeshStandardMaterial({ color: 0x101218, metalness: 0.8, roughness: 0.4 });
  private prev = new THREE.Vector3();

  build() {
    const r = this.root;
    const P = this.plate,
      D = this.dark,
      L = this.glow;
    const box = (parent: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, y, z);
      b.castShadow = true;
      parent.add(b);
      return b;
    };
    // jambes articulées (hanche → genou)
    for (const sx of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(sx * 2.2, 7.6, 0);
      box(hip, 1.8, 4, 2.2, P, 0, -2, 0);
      box(hip, 0.15, 3, 0.15, L, sx * 0.95, -2, 1.1);
      const knee = new THREE.Group();
      knee.position.set(0, -4, 0);
      box(knee, 1.6, 3.6, 1.8, D, 0, -1.8, 0);
      box(knee, 2.6, 0.8, 3.6, P, 0, -3.6, 0.5); // pied
      box(knee, 1.9, 1, 1, P, 0, -0.2, 1.1); // genouillère
      hip.add(knee);
      r.add(hip);
      this.legs.push({ hip, knee });
      const jet = new THREE.Mesh(new THREE.ConeGeometry(0.6, 3, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffa04a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      jet.rotation.x = Math.PI;
      jet.position.set(0, -5.6, -0.3);
      jet.visible = false;
      knee.add(jet);
      this.jets.push(jet);
    }
    // bassin + torse + cockpit
    box(r, 5.6, 1.6, 3, D, 0, 8.2, 0);
    box(r, 6.4, 4.6, 4, P, 0, 11, 0);
    box(r, 4.2, 0.3, 0.2, L, 0, 11.6, 2.05);
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.9, 6), L);
    core.position.set(0, 10.4, 2.02);
    r.add(core);
    box(r, 3.2, 2, 3, D, 0, 14.2, 0.2); // tête / cockpit
    box(r, 2.6, 0.5, 0.1, new THREE.MeshStandardMaterial({ color: 0, emissive: 0x3fc8ff, emissiveIntensity: 3 }), 0, 14.4, 1.75);
    for (const sx of [-1, 1]) {
      box(r, 1.8, 1.6, 3.6, P, sx * 4.2, 13.2, 0); // épaulières
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), L);
      lamp.position.set(sx * 4.2, 14.2, 1.4);
      r.add(lamp);
      const arm = new THREE.Group();
      arm.position.set(sx * 4.4, 12.4, 0);
      box(arm, 1.4, 4, 1.6, D, 0, -2, 0);
      box(arm, 1.8, 3.2, 2, P, 0, -5.4, 0.4);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 2.2, 12), D);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, -6.4, 1.8);
      arm.add(barrel);
      const muzzle = new THREE.Mesh(new THREE.CircleGeometry(0.35, 12), L);
      muzzle.position.set(0, -6.4, 2.92);
      arm.add(muzzle);
      r.add(arm);
      this.arms.push(arm);
    }
    // antennes
    for (const sx of [-1, 1]) box(r, 0.12, 2.4, 0.12, P, sx * 1.2, 16.2, -0.6);
    r.visible = false;
    G.scene.add(r);
  }

  setColors(primary: string, glow: string) {
    this.plate.color.set(primary).offsetHSL(0, 0, 0.08);
    this.glow.emissive.set(glow);
  }

  /** Monte dans le Titan (déclenché quand l'armure « Titan » est portée). */
  enter() {
    if (this.active) return;
    this.active = true;
    this.root.visible = true;
    G.player.hideBody = true;
    G.player.camLift = 11;
    G.player.camDist = 16;
    G.player.view = "third";
    this.prev.copy(G.player.position);
    bus.emit("toast", { text: "🤖 TITAN en ligne. 5 : canon d'énergie · 1 : frappe au sol · Espace : réacteurs · « sors du Titan » pour en descendre." });
    G.audio.whoosh(1.6, 80, 600, 0.3);
    bus.emit("shake", 1);
  }

  exit() {
    if (!this.active) return;
    this.active = false;
    this.root.visible = false;
    G.player.hideBody = false;
    G.player.camLift = 0;
    G.player.camDist = 4.2;
    G.player.speedMul = 1;
  }

  /** Point de tir du canon (bras droit). */
  muzzle() {
    this.root.updateMatrixWorld();
    return this.arms[1].localToWorld(new THREE.Vector3(0, -6.4, 3.2));
  }

  update(dt: number) {
    if (!this.active) return;
    G.player.speedMul = 2.6;
    G.player.jumpMul = 2.2;
    this.drive(G.player.position, G.player.yaw + Math.PI, !G.player.onGround, dt, true);
  }

  /** Anime le robot à une position (joueur local ou distant). */
  drive(p: THREE.Vector3, yaw: number, air: boolean, dt: number, local = false) {
    this.root.visible = true;
    this.root.position.copy(p);
    this.root.rotation.y = damp(this.root.rotation.y, yaw, 10, dt);
    const v = Math.hypot(p.x - this.prev.x, p.z - this.prev.z) / Math.max(dt, 1e-3);
    this.prev.copy(p);
    this.phase += dt * Math.min(v, 30) * 0.28;
    const sw = Math.sin(this.phase) * Math.min(1, v / 6) * 0.55;
    this.legs[0].hip.rotation.x = sw;
    this.legs[1].hip.rotation.x = -sw;
    this.legs[0].knee.rotation.x = Math.max(0, -Math.sin(this.phase)) * 0.7 * Math.min(1, v / 6);
    this.legs[1].knee.rotation.x = Math.max(0, Math.sin(this.phase)) * 0.7 * Math.min(1, v / 6);
    this.arms[0].rotation.x = -sw * 0.6;
    this.arms[1].rotation.x = sw * 0.6;
    this.root.position.y = p.y + Math.abs(Math.cos(this.phase)) * 0.25 * Math.min(1, v / 6);
    this.jets.forEach((j) => {
      j.visible = air;
      j.scale.y = 0.8 + Math.random() * 0.4;
    });
    // pas lourds
    const step = Math.floor(this.phase / Math.PI);
    if (step !== this.lastStep && v > 2 && !air) {
      this.lastStep = step;
      if (local || G.player.position.distanceTo(p) < 80) {
        G.audio.tone(55, 0.25, "sine", 0.18, 30);
        bus.emit("shake", local ? 0.25 : 0.1);
      }
    }
  }
}
