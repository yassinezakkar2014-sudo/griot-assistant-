// Personnage articulé construit en primitives (joueur + mannequins d'armure).
import * as THREE from "three";

export interface Limb {
  upper: THREE.Group;
  lower: THREE.Group;
}

export class Humanoid {
  root = new THREE.Group();
  hips = new THREE.Group();
  torso = new THREE.Group();
  head = new THREE.Group();
  armL: Limb;
  armR: Limb;
  legL: Limb;
  legR: Limb;
  outfit: THREE.MeshStandardMaterial;
  skin: THREE.MeshStandardMaterial;
  meshes: THREE.Mesh[] = [];
  private phase = 0;

  constructor(outfitColor = 0x1e4fd8, skinColor = 0x6b4630) {
    this.outfit = new THREE.MeshStandardMaterial({ color: outfitColor, roughness: 0.75 });
    this.skin = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.6 });
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const me = new THREE.Mesh(geo, m);
      me.position.set(x, y, z);
      me.castShadow = true;
      parent.add(me);
      this.meshes.push(me);
      return me;
    };
    this.root.add(this.hips);
    this.hips.position.y = 0.95;
    add(this.hips, new THREE.BoxGeometry(0.36, 0.2, 0.22), this.outfit, 0, 0, 0);
    this.hips.add(this.torso);
    this.torso.position.y = 0.1;
    add(this.torso, new THREE.CapsuleGeometry(0.19, 0.34, 4, 12), this.outfit, 0, 0.3, 0).scale.set(1.15, 1, 0.75);
    add(this.torso, new THREE.BoxGeometry(0.06, 0.38, 0.02), new THREE.MeshStandardMaterial({ color: 0xd8b25a, metalness: 1, roughness: 0.3 }), 0, 0.32, -0.15);
    this.torso.add(this.head);
    this.head.position.y = 0.66;
    add(this.head, new THREE.CylinderGeometry(0.06, 0.07, 0.1, 10), this.skin, 0, 0, 0);
    add(this.head, new THREE.SphereGeometry(0.13, 20, 16), this.skin, 0, 0.14, 0).scale.set(0.95, 1.1, 1);
    add(this.head, new THREE.SphereGeometry(0.135, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.2), new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.9 }), 0, 0.17, 0.01);
    const mkLimb = (parent: THREE.Object3D, x: number, y: number, len1: number, len2: number, r: number, lowerMat: THREE.Material): Limb => {
      const upper = new THREE.Group();
      upper.position.set(x, y, 0);
      parent.add(upper);
      add(upper, new THREE.CapsuleGeometry(r, len1 - r * 2, 4, 10), this.outfit, 0, -len1 / 2, 0);
      const lower = new THREE.Group();
      lower.position.y = -len1;
      upper.add(lower);
      add(lower, new THREE.CapsuleGeometry(r * 0.9, len2 - r * 2, 4, 10), lowerMat, 0, -len2 / 2, 0);
      return { upper, lower };
    };
    this.armL = mkLimb(this.torso, -0.27, 0.5, 0.3, 0.3, 0.055, this.skin);
    this.armR = mkLimb(this.torso, 0.27, 0.5, 0.3, 0.3, 0.055, this.skin);
    this.legL = mkLimb(this.hips, -0.1, -0.05, 0.45, 0.45, 0.075, this.outfit);
    this.legR = mkLimb(this.hips, 0.1, -0.05, 0.45, 0.45, 0.075, this.outfit);
    // chaussures
    for (const l of [this.legL, this.legR]) add(l.lower, new THREE.BoxGeometry(0.12, 0.08, 0.26), new THREE.MeshStandardMaterial({ color: 0x0b0b0f, roughness: 0.5 }), 0, -0.44, -0.05);
  }

  /** Animation procédurale : speed en m/s, airborne pour le saut. */
  animate(dt: number, speed: number, airborne: boolean, sitting = false) {
    if (sitting) {
      this.legL.upper.rotation.x = this.legR.upper.rotation.x = Math.PI / 2;
      this.legL.lower.rotation.x = this.legR.lower.rotation.x = -Math.PI / 2;
      this.armL.upper.rotation.x = this.armR.upper.rotation.x = 0.3;
      this.armL.lower.rotation.x = this.armR.lower.rotation.x = 0.9;
      this.hips.position.y = 0.5;
      return;
    }
    this.hips.position.y = 0.95;
    this.phase += dt * (2 + speed * 1.4);
    const amp = Math.min(1, speed / 6) * 0.75;
    const s = Math.sin(this.phase);
    if (airborne) {
      this.legL.upper.rotation.x = 0.6;
      this.legR.upper.rotation.x = -0.2;
      this.legL.lower.rotation.x = -0.9;
      this.legR.lower.rotation.x = -0.3;
      this.armL.upper.rotation.x = this.armR.upper.rotation.x = 0.5;
      this.armL.upper.rotation.z = 0.5;
      this.armR.upper.rotation.z = -0.5;
      return;
    }
    this.legL.upper.rotation.x = s * amp;
    this.legR.upper.rotation.x = -s * amp;
    this.legL.lower.rotation.x = -Math.max(0, -s) * amp * 1.2;
    this.legR.lower.rotation.x = -Math.max(0, s) * amp * 1.2;
    this.armL.upper.rotation.x = -s * amp * 0.8;
    this.armR.upper.rotation.x = s * amp * 0.8;
    this.armL.lower.rotation.x = this.armR.lower.rotation.x = 0.25 + amp * 0.3;
    this.armL.upper.rotation.z = 0.08;
    this.armR.upper.rotation.z = -0.08;
    this.torso.rotation.y = s * amp * 0.12;
    this.hips.position.y = 0.95 + Math.abs(Math.cos(this.phase)) * amp * 0.05;
  }

  /** Pose d'exposition (mannequin). */
  pose() {
    this.armL.upper.rotation.z = 0.25;
    this.armR.upper.rotation.z = -0.25;
    this.armL.lower.rotation.x = this.armR.lower.rotation.x = 0.15;
  }
}
