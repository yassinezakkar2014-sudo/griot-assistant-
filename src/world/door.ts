// Portes coulissantes interactives (battants latéraux ou porte-rideau verticale).
import * as THREE from "three";
import { G, bus } from "../core";

export interface Leaf {
  mesh: THREE.Object3D;
  closed: THREE.Vector3;
  open: THREE.Vector3;
}

export class Door {
  leaves: Leaf[] = [];
  t = 0;
  target = 0;
  locked = false;
  lockedReason = "Accès verrouillé";
  speed = 1.4;
  autoCloseAfter = 0; // secondes (0 = jamais)
  private openTimer = 0;

  constructor(public id: string, public label: string, public center: THREE.Vector3) {}

  addLeaf(mesh: THREE.Object3D, offset: THREE.Vector3) {
    this.leaves.push({ mesh, closed: mesh.position.clone(), open: mesh.position.clone().add(offset) });
    G.physics.addDynamic(mesh, "door:" + this.id);
  }

  get isOpen() {
    return this.target === 1;
  }

  open(silent = false): boolean {
    if (this.locked) {
      bus.emit("toast", { text: `🔒 ${this.label} : ${this.lockedReason}`, kind: "warn" });
      return false;
    }
    if (this.target !== 1 && !silent) G.audio.door();
    this.target = 1;
    this.openTimer = 0;
    bus.emit("door", { id: this.id, open: true });
    return true;
  }

  close(silent = false) {
    if (this.target !== 0 && !silent) G.audio.door();
    this.target = 0;
    bus.emit("door", { id: this.id, open: false });
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  update(dt: number) {
    if (this.t !== this.target) {
      const step = dt * this.speed;
      this.t = this.target > this.t ? Math.min(this.target, this.t + step) : Math.max(this.target, this.t - step);
      const e = this.t * this.t * (3 - 2 * this.t);
      for (const l of this.leaves) l.mesh.position.lerpVectors(l.closed, l.open, e);
    }
    if (this.autoCloseAfter && this.target === 1) {
      this.openTimer += dt;
      if (this.openTimer > this.autoCloseAfter && G.player.position.distanceTo(this.center) > 6) this.close();
    }
  }
}
