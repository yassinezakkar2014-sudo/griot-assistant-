// Contrôleur du personnage : WASD, course, saut, collisions, vue 1re / 3e personne, s'asseoir.
import * as THREE from "three";
import { G, bus, clamp, damp } from "../core";
import { Humanoid } from "./humanoid";

const UP = new THREE.Vector3(0, 1, 0);

export class Player {
  body = new Humanoid();
  position = new THREE.Vector3(0, 0, -24);
  velocity = new THREE.Vector3();
  yaw = Math.PI;
  pitch = -0.05;
  onGround = true;
  view: "first" | "third" = "third";
  camDist = 4.2;
  radius = 0.38;
  height = 1.8;
  sitting: { pos: THREE.Vector3; yaw: number } | null = null;
  speedMul = 1;
  jumpMul = 1;
  private groundBody: import("../engine/physics").Body | null = null;
  private camPos = new THREE.Vector3();
  private moveSpeed = 0;
  lastFloor = -2;

  init() {
    G.scene.add(this.body.root);
    this.camPos.copy(this.position);
  }

  setOutfit(color: number) {
    this.body.outfit.color.setHex(color);
  }

  teleport(pos: THREE.Vector3, yaw?: number) {
    bus.emit("fade");
    this.sitting = null;
    this.position.copy(pos);
    this.position.y += 0.05;
    this.velocity.set(0, 0, 0);
    if (yaw !== undefined) this.yaw = yaw;
    this.pitch = -0.05;
    this.groundBody = null;
    this.snapCamera();
  }

  sit(pos: THREE.Vector3, yaw: number) {
    this.sitting = { pos: pos.clone(), yaw };
    this.yaw = yaw;
    this.velocity.set(0, 0, 0);
    bus.emit("toast", { text: "Assis. Appuyez sur une touche de déplacement pour vous lever." });
  }

  stand() {
    if (!this.sitting) return;
    const fwd = new THREE.Vector3(-Math.sin(this.sitting.yaw), 0, -Math.cos(this.sitting.yaw));
    this.position.copy(this.sitting.pos).addScaledVector(fwd, 1.4);
    this.position.y = G.physics.ground(this.position.x, this.sitting.pos.y + 0.5, this.position.z, 1.2).y;
    this.sitting = null;
  }

  snapCamera() {
    this.camPos.copy(this.position);
  }

  update(dt: number) {
    const inp = G.input;
    if (G.mode !== "foot") {
      this.body.root.visible = false;
      return;
    }
    const look = inp.consumeMouse();
    this.yaw -= look.x;
    this.pitch = clamp(this.pitch - look.y, -1.35, 1.2);
    if (inp.wheel) this.camDist = clamp(this.camDist + inp.wheel * 0.6, 1.8, 9);
    if (inp.hit("KeyV")) this.toggleView();

    if (this.sitting) {
      if (inp.down("KeyW", "KeyA", "KeyS", "KeyD", "Space") || Math.abs(inp.touchMove.x) + Math.abs(inp.touchMove.y) > 0.3) this.stand();
      else {
        this.position.copy(this.sitting.pos).add(new THREE.Vector3(0, -0.5, 0));
        this.body.root.position.copy(this.position);
        this.body.root.rotation.y = this.sitting.yaw;
        this.body.animate(dt, 0, false, true);
        this.updateCamera(dt);
        return;
      }
    }

    // --- déplacement ---
    const fwdIn = inp.axis(["KeyS", "ArrowDown"], ["KeyW", "ArrowUp"]) + -inp.touchMove.y;
    const sideIn = inp.axis(["KeyA", "ArrowLeft"], ["KeyD", "ArrowRight"]) + inp.touchMove.x;
    const run = inp.down("ShiftLeft", "ShiftRight", "TouchRun");
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3().crossVectors(fwd, UP);
    const wish = new THREE.Vector3().addScaledVector(fwd, fwdIn).addScaledVector(right, sideIn);
    if (wish.lengthSq() > 1) wish.normalize();
    const maxSpeed = (run ? 8.5 : 4.6) * this.speedMul;
    const accel = this.onGround ? 14 : 4;
    this.velocity.x = damp(this.velocity.x, wish.x * maxSpeed, accel, dt);
    this.velocity.z = damp(this.velocity.z, wish.z * maxSpeed, accel, dt);

    if (this.onGround && inp.hit("Space", "TouchJump")) {
      this.velocity.y = 8 * this.jumpMul;
      this.onGround = false;
    }
    this.velocity.y -= 24 * dt;
    if (this.velocity.y < -60) this.velocity.y = -60;

    // plates-formes mobiles (ascenseur)
    if (this.groundBody && this.onGround) {
      this.position.x += this.groundBody.dx;
      this.position.z += this.groundBody.dz;
      if (this.groundBody.dy) this.position.y += this.groundBody.dy;
    }

    const p = this.position;
    p.x += this.velocity.x * dt;
    p.z += this.velocity.z * dt;
    G.physics.resolve(p, this.radius, this.height);

    p.y += this.velocity.y * dt;
    const g = G.physics.ground(p.x, Math.max(p.y, p.y - this.velocity.y * dt), p.z, 0.6, this.radius);
    if (p.y <= g.y + 0.02 && this.velocity.y <= 0) {
      // descente douce des marches
      p.y = g.y;
      this.velocity.y = 0;
      this.onGround = true;
      this.groundBody = g.body;
    } else if (this.onGround && p.y - g.y < 0.45 && this.velocity.y <= 0) {
      p.y = g.y;
      this.velocity.y = 0;
      this.groundBody = g.body;
    } else {
      this.onGround = false;
      this.groundBody = null;
    }
    const ceil = G.physics.ceiling(p.x, p.y + this.height, p.z);
    if (p.y + this.height > ceil && this.velocity.y > 0) {
      p.y = ceil - this.height;
      this.velocity.y = 0;
    }
    // filet de sécurité
    if (p.y < -80) this.teleport(G.palace.spots.gardens.pos, Math.PI);
    if (Math.abs(p.x) > 15800 || Math.abs(p.z) > 15800) {
      p.x = clamp(p.x, -15800, 15800);
      p.z = clamp(p.z, -15800, 15800);
    }

    this.moveSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const r = this.body.root;
    r.position.copy(p);
    if (this.moveSpeed > 0.3) {
      const target = Math.atan2(-this.velocity.x, -this.velocity.z);
      let d = target - r.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      r.rotation.y += d * Math.min(1, dt * 12);
    }
    this.body.animate(dt, this.moveSpeed, !this.onGround);
    this.updateCamera(dt);

    // détection d'étage pour la mission de visite
    const f = G.palace.floorAt(p);
    if (f !== this.lastFloor) {
      this.lastFloor = f;
      if (f >= 0) bus.emit("mission", { type: "floor", floor: f });
      bus.emit("zone");
    }
  }

  toggleView() {
    this.view = this.view === "first" ? "third" : "first";
    bus.emit("toast", { text: this.view === "first" ? "Vue à la première personne" : "Vue à la troisième personne" });
  }

  private updateCamera(dt: number) {
    const cam = G.camera;
    const head = new THREE.Vector3(this.position.x, this.position.y + (this.sitting ? 1.15 : 1.62), this.position.z);
    this.camPos.lerp(head, 1 - Math.exp(-dt * 25));
    const dir = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
    if (this.view === "first") {
      this.body.root.visible = false;
      cam.position.copy(this.camPos);
      cam.lookAt(this.camPos.clone().add(dir));
    } else {
      this.body.root.visible = true;
      const pivot = this.camPos.clone().add(new THREE.Vector3(0, 0.15, 0));
      let dist = this.camDist;
      const probe = new THREE.Vector3();
      for (let d = 0.4; d <= this.camDist; d += 0.3) {
        probe.copy(pivot).addScaledVector(dir, -d);
        if (G.physics.pointInSolid(probe, 0.15) || probe.y < G.physics.terrain(probe.x, probe.z) + 0.3) {
          dist = Math.max(0.4, d - 0.35);
          break;
        }
      }
      // léger décalage d'épaule
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      cam.position.copy(pivot).addScaledVector(dir, -dist).addScaledVector(right, dist > 1.5 ? 0.45 : 0);
      cam.lookAt(pivot.clone().addScaledVector(dir, 3).addScaledVector(right, 0.45));
    }
  }

  forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
}
