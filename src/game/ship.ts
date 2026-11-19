// LE ROYAL TALON — vaisseau personnel : modèle, cockpit holographique, physique de vol, pilote automatique.
import * as THREE from "three";
import { G, bus, clamp, damp, lerp } from "../core";
import { mat, HoloScreen } from "../world/materials";

export type ShipView = "cockpit" | "chase" | "cinematic";

const GEAR = 1.35; // hauteur du centre au-dessus du sol (train sorti)

export class Ship {
  root = new THREE.Group();
  model = new THREE.Group();
  cockpit = new THREE.Group();
  canopy!: THREE.Mesh;
  gear: THREE.Object3D[] = [];
  exhaust: THREE.Mesh[] = [];
  engineGlow: THREE.MeshStandardMaterial;
  lightMat: THREE.MeshStandardMaterial;
  dash!: HoloScreen;

  // état
  engines = false;
  lights = false;
  ready = false;
  landed = true;
  throttle = 0;
  speed = 0;
  vy = 0;
  yaw = 0;
  pitch = 0;
  roll = 0;
  energy = 1;
  view: ShipView = "chase";
  autopilot: { points: THREE.Vector3[]; label: string; land?: boolean } | null = null;
  private gearT = 1;
  private canopyT = 0;
  private canopyTarget = 0;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private cineAngle = 0;
  private ringIndex = 0;
  private bumpCooldown = 0;

  constructor() {
    this.engineGlow = new THREE.MeshStandardMaterial({ color: 0, emissive: 0x2a9dff, emissiveIntensity: 0 });
    this.lightMat = new THREE.MeshStandardMaterial({ color: 0x050810, emissive: 0x3fc8ff, emissiveIntensity: 0.05 });
  }

  build() {
    const shipMat = new THREE.MeshStandardMaterial({ color: 0x0a0b10, metalness: 0.92, roughness: 0.28 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x23262f, metalness: 0.95, roughness: 0.2 });
    const m = this.model;
    // fuselage (vue de dessus, extrudé)
    const hull = new THREE.Shape();
    const hp: [number, number][] = [[0, -7.4], [0.9, -4.5], [1.7, -1.2], [2.1, 2.6], [1.4, 6.4], [0, 5.6]];
    hull.moveTo(hp[0][0], hp[0][1]);
    hp.slice(1).forEach(([x, z]) => hull.lineTo(x, z));
    [...hp].reverse().slice(1).forEach(([x, z]) => hull.lineTo(-x, z));
    const hullGeo = new THREE.ExtrudeGeometry(hull, { depth: 1.1, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.35, bevelSegments: 3 });
    hullGeo.rotateX(Math.PI / 2);
    hullGeo.translate(0, 1.0, 0);
    const hullMesh = new THREE.Mesh(hullGeo, shipMat);
    hullMesh.castShadow = true;
    m.add(hullMesh);
    // dorsale
    const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 8, 6), trimMat);
    spine.rotation.x = Math.PI / 2;
    spine.position.set(0, 1.15, 1.8);
    spine.scale.set(1, 1, 0.5);
    m.add(spine);
    // ailes en serre (pointes recourbées vers l'avant)
    for (const s of [-1, 1]) {
      const w = new THREE.Shape();
      const wp: [number, number][] = [[1.6, -1.4], [4.2, 0.2], [7.0, 1.2], [7.9, -2.6], [7.3, -1.9], [6.6, 1.6], [6.1, 3.0], [2.0, 4.0]];
      w.moveTo(s * wp[0][0], wp[0][1]);
      wp.slice(1).forEach(([x, z]) => w.lineTo(s * x, z));
      const wg = new THREE.ExtrudeGeometry(w, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1 });
      wg.rotateX(Math.PI / 2);
      wg.translate(0, 0.55, 0);
      const wing = new THREE.Mesh(wg, shipMat);
      wing.castShadow = true;
      wing.rotation.z = s * -0.06;
      m.add(wing);
      // liseré lumineux sur le bord d'attaque
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 3.4), this.lightMat);
      edge.position.set(s * 5.6, 0.5, -0.4);
      edge.rotation.y = s * -1.1;
      m.add(edge);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.4, 6), this.lightMat);
      tip.rotation.x = -Math.PI / 2;
      tip.position.set(s * 7.75, 0.45, -2.6);
      m.add(tip);
      // réacteurs
      const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.75, 3.2, 20), trimMat);
      eng.rotation.x = Math.PI / 2;
      eng.position.set(s * 1.35, 0.75, 5.4);
      m.add(eng);
      const nozzle = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), this.engineGlow);
      nozzle.position.set(s * 1.35, 0.75, 7.02);
      m.add(nozzle);
      const plume = new THREE.Mesh(
        new THREE.ConeGeometry(0.5, 4, 16, 1, true),
        new THREE.MeshBasicMaterial({ color: 0x5fc8ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      );
      plume.rotation.x = -Math.PI / 2;
      plume.position.set(s * 1.35, 0.75, 9);
      plume.visible = false;
      m.add(plume);
      this.exhaust.push(plume);
      // lignes lumineuses latérales
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 6), this.lightMat);
      side.position.set(s * 1.9, 1.0, 0.8);
      side.rotation.y = s * 0.08;
      m.add(side);
    }
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 4), this.lightMat);
    nose.position.set(0, 1.55, -4.6);
    nose.rotation.x = 0.18;
    m.add(nose);
    // verrière
    this.canopy = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshPhysicalMaterial({ color: 0x3fa8ff, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.38, side: THREE.FrontSide, depthWrite: false })
    );
    this.canopy.scale.set(0.95, 0.75, 2.3);
    this.canopy.position.set(0, 1.55, -2.4);
    m.add(this.canopy);
    // cockpit intérieur
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.2), new THREE.MeshStandardMaterial({ color: 0x1a1d2a, roughness: 0.8 }));
    seat.position.set(0, 1.8, -1.2);
    this.cockpit.add(seat);
    this.dash = new HoloScreen(512, 200, (c, w, h) => this.drawDash(c, w, h));
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.58), this.dash.material);
    dash.position.set(0, 1.55, -3.35);
    dash.rotation.x = -0.6;
    this.cockpit.add(dash);
    const dashBody = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.25, 0.6), trimMat);
    dashBody.position.set(0, 1.38, -3.4);
    this.cockpit.add(dashBody);
    const yoke = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 8, 24, Math.PI), mat.silver);
    yoke.position.set(0, 1.55, -2.9);
    yoke.rotation.z = Math.PI;
    this.cockpit.add(yoke);
    this.cockpit.visible = false;
    m.add(this.cockpit);
    // train d'atterrissage
    for (const [x, z] of [[0, -4.5], [-1.6, 3], [1.6, 3]]) {
      const strut = new THREE.Group();
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 8), mat.silver);
      leg.position.y = -0.55;
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.1, 12), mat.graphite);
      pad.position.y = -1.1;
      strut.add(leg, pad);
      strut.position.set(x, 0.3, z);
      m.add(strut);
      this.gear.push(strut);
    }
    m.position.y = -0.3;
    this.root.add(m);
    // volume de collision du vaisseau (le joueur ne le traverse pas)
    const hullBox = new THREE.Mesh(new THREE.BoxGeometry(5, 2.2, 13), new THREE.MeshBasicMaterial({ visible: false }));
    hullBox.position.set(0, 0.6, -0.5);
    this.root.add(hullBox);
    G.scene.add(this.root);
    this.park();
    G.physics.addDynamic(hullBox, "ship");

    G.interact.add({
      id: "ship",
      pos: () => this.root.position.clone().add(new THREE.Vector3(-2.6, -1, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw)),
      radius: 6,
      enabled: () => G.mode === "foot",
      label: () => "Entrer dans le cockpit du Royal Talon",
      action: () => this.board()
    });
  }

  /** Remet le vaisseau à son emplacement de hangar. */
  park() {
    this.root.position.copy(G.palace.shipSpawn).add(new THREE.Vector3(0, GEAR, 0));
    this.yaw = 0;
    this.pitch = this.roll = 0;
    this.speed = this.vy = this.throttle = 0;
    this.landed = true;
    this.applyOrientation();
  }

  private applyOrientation() {
    this.root.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, this.roll, "YXZ"));
  }

  forward() {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(this.root.quaternion);
  }

  isInHangar() {
    const p = this.root.position;
    return Math.abs(p.x) < 31 && p.z > -32 && p.z < 31 && p.y > 55 && p.y < 66;
  }

  // ---------------------------------------------------------------- actions
  prepare() {
    this.ready = true;
    this.setLights(true);
    G.palace.doors.get("door-hangar")?.open();
    bus.emit("toast", { text: "🛩 Royal Talon : diagnostics OK, plein d'énergie, portes du hangar ouvertes." });
    bus.emit("mission", { type: "ship-ready" });
  }

  setLights(on: boolean) {
    this.lights = on;
  }

  /** Entrée dans le cockpit (séquence cinématique). */
  board(): Promise<void> {
    return new Promise((resolve) => {
      if (G.mode === "ship") return resolve();
      // si le joueur est loin, il est d'abord conduit au vaisseau
      if (G.player.position.distanceTo(this.root.position) > 12) {
        const side = this.root.position.clone().add(new THREE.Vector3(-4, -GEAR, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw));
        G.player.teleport(side, this.yaw - Math.PI / 2);
      }
      G.mode = "cinematic";
      G.armor.onVehicle(true);
      this.canopyTarget = 1;
      const from = G.camera.position.clone();
      const fromQ = G.camera.quaternion.clone();
      const start = performance.now();
      const step = () => {
        const t = Math.min(1, (performance.now() - start) / 1800);
        const e = t * t * (3 - 2 * t);
        const seatPos = this.root.localToWorld(new THREE.Vector3(0, 2.05, -1.6));
        const lookAt = this.root.localToWorld(new THREE.Vector3(0, 1.7, -12));
        const mid = this.root.localToWorld(new THREE.Vector3(-5, 5, 2));
        const p1 = from.clone().lerp(mid, e);
        G.camera.position.copy(p1.lerp(seatPos, e));
        const m4 = new THREE.Matrix4().lookAt(G.camera.position, lookAt, new THREE.Vector3(0, 1, 0));
        G.camera.quaternion.copy(fromQ).slerp(new THREE.Quaternion().setFromRotationMatrix(m4), e);
        if (t < 1) requestAnimationFrame(step);
        else {
          this.canopyTarget = 0;
          G.mode = "ship";
          this.view = "cockpit";
          this.camPos.copy(G.camera.position);
          bus.emit("toast", { text: "Aux commandes. R : moteurs · Espace : monter · W/S : poussée · V : vue · F : sortir" });
          bus.emit("mode");
          resolve();
        }
      };
      step();
    });
  }

  startEngines(on = true) {
    if (on === this.engines) return;
    this.engines = on;
    if (on) {
      this.setLights(true);
      G.audio.unlock();
      G.audio.setEngine(0.1);
      G.audio.whoosh(2.2, 80, 1200, 0.2);
      bus.emit("toast", { text: "🔥 Moteurs démarrés." });
      bus.emit("mission", { type: "engines" });
    } else {
      G.audio.setEngine(null);
      this.throttle = 0;
      bus.emit("toast", { text: "Moteurs coupés." });
    }
  }

  takeoff() {
    if (G.mode !== "ship") return;
    if (!this.engines) this.startEngines(true);
    const p = this.root.position.clone();
    if (this.isInHangar()) {
      G.palace.doors.get("door-hangar")?.open();
      this.autopilot = {
        label: "Décollage",
        points: [new THREE.Vector3(p.x, 59.5, p.z), new THREE.Vector3(0, 60, -40), new THREE.Vector3(0, 90, -160)]
      };
    } else {
      const g = G.physics.ground(p.x, p.y, p.z).y;
      this.autopilot = { label: "Décollage", points: [new THREE.Vector3(p.x, g + 40, p.z)] };
    }
    this.landed = false;
  }

  /** Vol automatique vers une destination (utilisé par GRIOT). */
  flyTo(dest: THREE.Vector3, label: string) {
    const p = this.root.position;
    const pts: THREE.Vector3[] = [];
    if (this.isInHangar()) {
      G.palace.doors.get("door-hangar")?.open();
      pts.push(new THREE.Vector3(p.x, 59.5, p.z), new THREE.Vector3(0, 60, -40), new THREE.Vector3(0, 110, -160));
    } else if (this.landed) pts.push(new THREE.Vector3(p.x, p.y + 40, p.z));
    const cruise = Math.max(dest.y + 120, 180);
    pts.push(new THREE.Vector3(dest.x, cruise, dest.z));
    this.autopilot = { points: pts, label };
    this.landed = false;
    if (!this.engines) this.startEngines(true);
  }

  land() {
    const p = this.root.position;
    const g = G.physics.ground(p.x, p.y - GEAR, p.z, 0.5).y;
    this.autopilot = { label: "Atterrissage", points: [new THREE.Vector3(p.x, g + GEAR, p.z)], land: true };
  }

  exit() {
    if (G.mode !== "ship") return;
    const pp = this.root.position;
    const agl = pp.y - GEAR - G.physics.ground(pp.x, pp.y - GEAR + 0.6, pp.z, 0.6).y;
    if (!this.landed && (this.speed > 4 || agl > 4)) {
      bus.emit("toast", { text: "Atterrissez d'abord (H : atterrissage automatique).", kind: "warn" });
      return;
    }
    const side = this.root.position.clone().add(new THREE.Vector3(-4.2, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw));
    side.y = G.physics.ground(side.x, this.root.position.y, side.z, 2).y;
    G.mode = "foot";
    G.armor.onVehicle(false);
    this.cockpit.visible = false;
    this.throttle = 0;
    G.player.teleport(side, this.yaw);
    bus.emit("mode");
  }

  // ---------------------------------------------------------------- simulation
  update(dt: number, t: number) {
    // animations visuelles
    this.gearT = damp(this.gearT, this.landed || this.root.position.y - G.physics.ground(this.root.position.x, this.root.position.y - GEAR, this.root.position.z, 0.5).y < 12 ? 1 : 0, 3, dt);
    this.gear.forEach((g) => (g.scale.y = Math.max(0.05, this.gearT)));
    this.canopyT = damp(this.canopyT, this.canopyTarget, 4, dt);
    this.canopy.position.y = 1.55 + this.canopyT * 0.8;
    this.canopy.rotation.x = -this.canopyT * 0.5;
    this.lightMat.emissiveIntensity = this.lights ? 2.2 + Math.sin(t * 2) * 0.3 : 0.05;
    const thrVis = this.engines ? 0.35 + this.throttle * 0.65 : 0;
    this.engineGlow.emissiveIntensity = this.engines ? 1.5 + this.throttle * 5 : 0;
    this.exhaust.forEach((e) => {
      e.visible = this.engines;
      e.scale.set(1, thrVis * (1 + Math.random() * 0.1) * (G.input.down("ShiftLeft") && this.canBoost() ? 1.8 : 1), 1);
      e.position.z = 7 + 2 * e.scale.y;
    });

    if (G.mode !== "ship") {
      this.updateIdleGround();
      return;
    }
    const inp = G.input;
    if (inp.hit("KeyR")) this.startEngines(!this.engines);
    if (inp.hit("KeyL")) this.setLights(!this.lights);
    if (inp.hit("KeyV")) this.cycleView();
    if (inp.hit("KeyF")) return this.exit();
    if (inp.hit("KeyH")) this.land();

    const look = inp.consumeMouse();
    const thrIn = inp.axis(["KeyS"], ["KeyW"]) + (inp.down("TouchThrottleUp") ? 1 : 0) - (inp.down("TouchThrottleDown") ? 1 : 0);
    const yawIn = inp.axis(["KeyD"], ["KeyA"]) - inp.touchMove.x;
    const rollIn = inp.axis(["KeyE"], ["KeyQ"]);
    const pitchIn = inp.axis(["ArrowDown"], ["ArrowUp"]) - look.y * 18 + -inp.touchMove.y * 0.8;
    const liftIn = inp.axis(["KeyC", "ControlLeft", "TouchDown"], ["Space", "TouchUp"]);
    const manual = Math.abs(thrIn) + Math.abs(yawIn) + Math.abs(pitchIn) + Math.abs(liftIn) + Math.abs(rollIn) > 0.05;
    if (manual && this.autopilot) {
      this.autopilot = null;
      bus.emit("toast", { text: "Pilote automatique désengagé." });
    }

    const tech = G.missions.state.tech;
    const maxSpeed = 140 * (tech.includes("fusion") ? 1.25 : 1);
    const boost = inp.down("ShiftLeft", "ShiftRight") && this.canBoost();
    if (boost) this.energy = Math.max(0, this.energy - dt * 0.08);
    else this.energy = Math.min(1, this.energy + dt * 0.03);

    let yawRate = 0,
      pitchTarget = this.pitch,
      vyTarget = 0;
    if (this.autopilot) {
      const ap = this.autopilot;
      const target = ap.points[0];
      const p = this.root.position;
      const to = target.clone().sub(p);
      const horiz = Math.hypot(to.x, to.z);
      const desiredYaw = Math.atan2(-to.x, -to.z);
      let dy = desiredYaw - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      yawRate = clamp(dy * 1.5, -0.9, 0.9);
      const slow = this.isInHangar() || p.z > -60 && Math.hypot(p.x, p.z) < 60;
      const cruise = slow ? 14 : horiz > 600 ? maxSpeed : Math.max(25, horiz * 0.25);
      this.throttle = damp(this.throttle, horiz > 6 && !ap.land ? cruise / maxSpeed : 0, 2, dt);
      if (Math.abs(dy) > 0.6 && horiz > 6) this.throttle = Math.min(this.throttle, horiz < 120 ? 0.02 : 0.12);
      if (ap.land || horiz < 6) yawRate = 0;
      vyTarget = clamp(to.y * 0.8, ap.land ? -30 : -25, 30);
      if (ap.land && to.y > -8) vyTarget = Math.min(vyTarget, -3);
      pitchTarget = 0;
      if (ap.land ? this.landed : to.length() < (slow ? 5 : 40)) {
        ap.points.shift();
        if (!ap.points.length) {
          if (ap.land) bus.emit("toast", { text: "Atterrissage terminé." });
          else if (ap.label !== "Décollage") bus.emit("griot:say", { text: `${ap.label} : nous y sommes. Reprenez les commandes, ou dites « atterris ».` });
          bus.emit("autopilot:done", ap.label);
          this.autopilot = null;
          this.throttle = 0;
        }
      }
    } else {
      this.throttle = clamp(this.throttle + thrIn * dt * 0.45, 0, 1);
      yawRate = yawIn * (this.landed ? 0.7 : 0.95);
      pitchTarget = clamp(this.pitch + pitchIn * dt * 1.1, -1.1, 1.1);
      vyTarget = liftIn * 20;
      if (Math.abs(pitchIn) < 0.01 && !this.landed) pitchTarget = damp(this.pitch, 0, 0.15, dt);
    }

    if (!this.engines) {
      this.throttle = 0;
      vyTarget = this.landed ? 0 : -30;
    }
    const target = this.throttle * maxSpeed * (boost ? 1.8 : 1);
    this.speed = damp(this.speed, this.landed ? Math.min(target, 10) : target, this.engines ? 0.9 : 0.3, dt);
    this.vy = damp(this.vy, vyTarget, this.engines ? 2.5 : 0.8, dt);
    this.yaw += yawRate * dt;
    this.pitch = this.landed ? damp(this.pitch, 0, 6, dt) : pitchTarget;
    const rollTarget = this.landed ? 0 : -yawRate * 0.7 + rollIn * 0.9;
    this.roll = damp(this.roll, rollTarget, 3, dt);
    if (this.landed && this.engines && (vyTarget > 1 || this.speed > 6)) this.landed = false;
    if (this.landed && !this.engines) this.speed = damp(this.speed, 0, 3, dt);
    this.applyOrientation();

    // intégration + collisions
    const prev = this.root.position.clone();
    const vel = this.forward().multiplyScalar(this.speed).add(new THREE.Vector3(0, this.vy, 0));
    const p = this.root.position;
    p.addScaledVector(vel, dt);
    p.y = Math.min(p.y, 2600);
    if (Math.abs(p.x) > 3800 || Math.abs(p.z) > 3800) {
      p.x = clamp(p.x, -3800, 3800);
      p.z = clamp(p.z, -3800, 3800);
      this.yaw += Math.PI * dt;
    }
    this.bumpCooldown -= dt;
    const hit = this.collides();
    if (hit) {
      p.copy(prev);
      // déjà en contact (immobile contre un obstacle) : on se dégage latéralement
      const still = this.collides();
      if (still) {
        const c = still.box.getCenter(new THREE.Vector3());
        const away = p.clone().sub(c).setY(0);
        if (away.lengthSq() < 1e-4) away.set(1, 0, 0);
        p.addScaledVector(away.normalize(), 1.5);
        p.y += 0.3;
      }
      if (this.speed > 20 && this.bumpCooldown <= 0) {
        bus.emit("toast", { text: "⚠ Impact ! Boucliers absorbés.", kind: "warn" });
        G.audio.whoosh(0.4, 200, 80, 0.3);
        bus.emit("shake", 0.6);
      }
      this.speed *= -0.25;
      this.vy = Math.max(0, this.vy);
      if (this.autopilot && this.bumpCooldown <= 0 && this.autopilot.points.length < 8) this.autopilot.points.unshift(p.clone().add(new THREE.Vector3(0, 25, 0)));
      this.bumpCooldown = 1;
    }
    const g = G.physics.ground(p.x, p.y - GEAR + 0.6, p.z, 0.6).y;
    if (p.y < g + GEAR) {
      const impact = -this.vy;
      p.y = g + GEAR;
      if (this.vy < 0) this.vy = 0;
      if (!this.landed && this.speed < 45 && Math.abs(this.pitch) < 0.5) {
        this.landed = true;
        this.pitch = this.roll = 0;
        if (impact > 12) bus.emit("shake", 0.4);
        bus.emit("mission", { type: "landed", pos: p.clone() });
      } else if (!this.landed) {
        this.pitch = Math.max(this.pitch, 0.15);
        if (this.speed > 45 && this.bumpCooldown <= 0) {
          bus.emit("toast", { text: "⚠ Rase-mottes ! Redressez.", kind: "warn" });
          this.bumpCooldown = 1;
        }
      }
    }
    G.audio.setEngine(this.engines ? this.throttle + (boost ? 0.4 : 0) : null);
    this.checkRings();
    if (!this.landed && p.y > 300) bus.emit("mission", { type: "altitude", y: p.y });
    this.updateCamera(dt);
    if (this.view === "cockpit" && Math.floor(t * 10) !== Math.floor((t - dt) * 10)) this.dash.refresh(t);
  }

  canBoost() {
    return G.missions.state.tech.includes("gravity") && this.energy > 0.05;
  }

  private updateIdleGround() {
    // vaisseau garé : reste posé
    if (!this.landed) {
      const p = this.root.position;
      const g = G.physics.ground(p.x, p.y - GEAR + 0.6, p.z, 0.6).y;
      p.y = Math.max(g + GEAR, p.y - 9 * (1 / 60));
      if (p.y <= g + GEAR + 0.01) this.landed = true;
    }
  }

  private samples = [new THREE.Vector3(0, 0.6, -7.2), new THREE.Vector3(0, 0.6, 6.4), new THREE.Vector3(-7.6, 0.4, -1.5), new THREE.Vector3(7.6, 0.4, -1.5), new THREE.Vector3(0, 2.1, -1.5), new THREE.Vector3(-4, 0.5, 2), new THREE.Vector3(4, 0.5, 2)];
  private collides() {
    this.root.updateMatrixWorld();
    for (const s of this.samples) {
      const w = this.root.localToWorld(s.clone());
      const b = G.physics.pointInSolid(w);
      if (b) return b;
    }
    return null;
  }

  private checkRings() {
    const rings = G.world.rings;
    if (!rings.length || G.missions.isDone("rings")) return;
    const r = rings[this.ringIndex % rings.length];
    const d = this.root.position.clone().sub(r.pos);
    if (d.length() < 15 && Math.abs(d.dot(r.normal)) < 6) {
      (r.mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x3fff9a);
      this.ringIndex++;
      G.audio.confirm();
      bus.emit("mission", { type: "ring", index: this.ringIndex, total: rings.length });
    }
    rings.forEach((rr, i) => {
      const m = rr.mesh.material as THREE.MeshStandardMaterial;
      if (i >= this.ringIndex) m.emissive.setHex(i === this.ringIndex ? 0xffc861 : 0x8a6a2a);
    });
  }

  cycleView() {
    this.view = this.view === "cockpit" ? "chase" : this.view === "chase" ? "cinematic" : "cockpit";
    bus.emit("toast", { text: { cockpit: "Vue cockpit", chase: "Vue extérieure (3e personne)", cinematic: "Vue cinématique" }[this.view] });
  }

  private updateCamera(dt: number) {
    const cam = G.camera;
    this.cockpit.visible = this.view === "cockpit";
    if (this.view === "cockpit") {
      cam.position.copy(this.root.localToWorld(new THREE.Vector3(0, 2.05, -1.6)));
      cam.quaternion.copy(this.root.quaternion);
      cam.rotateX(-0.08);
      return;
    }
    if (this.view === "chase") {
      const yawQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch * 0.5, this.yaw, 0, "YXZ"));
      const back = new THREE.Vector3(0, 4.5, 19 + this.speed * 0.03).applyQuaternion(yawQ);
      const want = this.root.position.clone().add(back);
      this.camPos.lerp(want, 1 - Math.exp(-dt * 6));
      const g = G.physics.terrain(this.camPos.x, this.camPos.z);
      if (this.camPos.y < g + 1.5) this.camPos.y = g + 1.5;
      this.camLook.lerp(this.root.position.clone().add(this.forward().multiplyScalar(10)), 1 - Math.exp(-dt * 10));
      cam.position.copy(this.camPos);
      cam.lookAt(this.camLook);
      return;
    }
    this.cineAngle += dt * 0.25;
    const r = 26;
    const want = this.root.position.clone().add(new THREE.Vector3(Math.cos(this.cineAngle) * r, 6 + Math.sin(this.cineAngle * 0.7) * 3, Math.sin(this.cineAngle) * r));
    this.camPos.lerp(want, 1 - Math.exp(-dt * 3));
    cam.position.copy(this.camPos);
    cam.lookAt(this.root.position);
  }

  private drawDash(c: CanvasRenderingContext2D, w: number, h: number) {
    c.clearRect(0, 0, w, h);
    c.fillStyle = "rgba(0,20,40,.85)";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = "#3fc8ff";
    c.lineWidth = 2;
    c.strokeRect(2, 2, w - 4, h - 4);
    c.fillStyle = "#bff0ff";
    c.font = "bold 26px Orbitron, Arial";
    c.fillText(`${Math.round(Math.abs(this.speed) * 3.6)} km/h`, 18, 44);
    c.fillText(`ALT ${Math.round(this.root.position.y)} m`, 18, 84);
    c.font = "18px Arial";
    c.fillText(this.engines ? "MOTEURS : EN MARCHE" : "MOTEURS : ARRÊT", 18, 124);
    c.fillText(`ÉNERGIE ${Math.round(this.energy * 100)} %`, 18, 154);
    // horizon artificiel
    const cx = w - 110,
      cy = h / 2;
    c.save();
    c.beginPath();
    c.arc(cx, cy, 80, 0, Math.PI * 2);
    c.clip();
    c.translate(cx, cy);
    c.rotate(-this.roll);
    c.fillStyle = "#123a66";
    c.fillRect(-120, -120 + this.pitch * 90, 240, 120);
    c.fillStyle = "#3a2a14";
    c.fillRect(-120, this.pitch * 90, 240, 120);
    c.strokeStyle = "#fff";
    c.beginPath();
    c.moveTo(-120, this.pitch * 90);
    c.lineTo(120, this.pitch * 90);
    c.stroke();
    c.restore();
    c.strokeStyle = "#ffd27a";
    c.beginPath();
    c.moveTo(cx - 40, cy);
    c.lineTo(cx - 10, cy);
    c.moveTo(cx + 10, cy);
    c.lineTo(cx + 40, cy);
    c.stroke();
    c.fillStyle = "rgba(63,200,255,.4)";
    c.fillRect(18, h - 26, (w - 260) * this.throttle, 10);
    void lerp;
  }
}
