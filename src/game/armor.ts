// L'ARMURE ROYALE — combinaison en nano-alliage : exposition, inspection, transformation, capacités, personnalisation.
import * as THREE from "three";
import { G, bus, clamp, damp } from "../core";
import { Humanoid } from "./humanoid";
import { armorPattern, tex } from "../world/materials";

export type Pattern = "lines" | "hex" | "chevron";
export interface ArmorStyle {
  primary: string;
  glow: string;
  pattern: Pattern;
  intensity: number;
  effect: "steady" | "pulse" | "flow";
}

export const VARIANTS: Record<string, { name: string; style: ArmorStyle; how: string }> = {
  royal: { name: "Armure Royale", style: { primary: "#0b0b12", glow: "#2a8cff", pattern: "lines", intensity: 1.6, effect: "pulse" }, how: "Armure de départ" },
  onyx: { name: "Armure Onyx", style: { primary: "#050507", glow: "#8a5cff", pattern: "hex", intensity: 1.8, effect: "flow" }, how: "Archives royales (niveau 4)" },
  aurora: { name: "Armure Aurora", style: { primary: "#c8ccd6", glow: "#00e5ff", pattern: "chevron", intensity: 1.5, effect: "pulse" }, how: "Coffre du laboratoire (niveau 5)" },
  solar: { name: "Armure Solaire", style: { primary: "#3a2a0a", glow: "#ffb347", pattern: "lines", intensity: 2, effect: "flow" }, how: "Parcours d'anneaux en Royal Talon" },
  tempest: { name: "Armure Tempête", style: { primary: "#1c2030", glow: "#e8f4ff", pattern: "hex", intensity: 1.7, effect: "steady" }, how: "Cache de la base secrète" },
  ivory: { name: "Armure Ivoire", style: { primary: "#efeae0", glow: "#d8b25a", pattern: "chevron", intensity: 1.4, effect: "steady" }, how: "Explorer les 6 environnements" }
};

const patterns: Record<Pattern, THREE.Texture> = {} as any;
function pat(p: Pattern) {
  return (patterns[p] ||= armorPattern(p));
}

/** Pièces d'armure posées sur un Humanoid. */
export class ArmorSet {
  plate: THREE.MeshStandardMaterial;
  under: THREE.MeshStandardMaterial;
  eyes: THREE.MeshStandardMaterial;
  group: THREE.Object3D[] = [];
  helmet = new THREE.Group();
  planes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)];

  constructor(public body: Humanoid, style: ArmorStyle) {
    this.plate = new THREE.MeshStandardMaterial({ metalness: 0.92, roughness: 0.28, clippingPlanes: this.planes });
    this.under = new THREE.MeshStandardMaterial({ color: 0x07070a, metalness: 0.6, roughness: 0.55, emissive: 0xffffff, emissiveMap: tex.hexGlow, emissiveIntensity: 0.05, clippingPlanes: this.planes });
    this.eyes = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffffff, emissiveIntensity: 3, clippingPlanes: this.planes });
    this.applyStyle(style);
    const b = body;
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
      const me = new THREE.Mesh(geo, m);
      me.position.set(x, y, z);
      me.scale.set(sx, sy, sz);
      me.castShadow = true;
      parent.add(me);
      this.group.push(me);
      return me;
    };
    // combinaison
    add(b.torso, new THREE.CapsuleGeometry(0.205, 0.36, 4, 14), this.under, 0, 0.3, 0, 1.17, 1.02, 0.8);
    add(b.hips, new THREE.BoxGeometry(0.39, 0.23, 0.25), this.under);
    // plastron
    const chest = add(b.torso, new THREE.SphereGeometry(0.24, 20, 14, 0, Math.PI * 2, 0, Math.PI / 1.6), this.plate, 0, 0.42, -0.02, 1.05, 0.95, 0.72);
    chest.rotation.x = Math.PI;
    add(b.torso, new THREE.OctahedronGeometry(0.07), this.eyes, 0, 0.42, -0.19, 1, 1.3, 0.5);
    add(b.torso, new THREE.BoxGeometry(0.42, 0.06, 0.28), this.plate, 0, 0.05, 0);
    // épaulières
    for (const s of [-1, 1]) add(b.torso, new THREE.SphereGeometry(0.12, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), this.plate, s * 0.27, 0.53, 0, 1.2, 0.8, 1.1);
    // bras et jambes
    for (const limb of [b.armL, b.armR]) {
      add(limb.upper, new THREE.CapsuleGeometry(0.065, 0.2, 4, 10), this.under, 0, -0.15, 0);
      add(limb.lower, new THREE.CapsuleGeometry(0.068, 0.2, 4, 10), this.plate, 0, -0.14, 0);
      add(limb.lower, new THREE.SphereGeometry(0.07, 10, 8), this.plate, 0, -0.32, 0, 1, 0.8, 1.2);
    }
    for (const limb of [b.legL, b.legR]) {
      add(limb.upper, new THREE.CapsuleGeometry(0.088, 0.3, 4, 10), this.under, 0, -0.22, 0);
      add(limb.upper, new THREE.BoxGeometry(0.16, 0.22, 0.05), this.plate, 0, -0.2, -0.08);
      add(limb.lower, new THREE.CapsuleGeometry(0.08, 0.3, 4, 10), this.plate, 0, -0.22, 0);
      add(limb.lower, new THREE.BoxGeometry(0.14, 0.1, 0.3), this.plate, 0, -0.44, -0.05);
    }
    // casque / masque rétractable
    b.head.add(this.helmet);
    this.helmet.position.y = 0.14;
    const hm = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
      const me = new THREE.Mesh(geo, m);
      me.position.set(x, y, z);
      me.scale.set(sx, sy, sz);
      this.helmet.add(me);
      this.group.push(me);
      return me;
    };
    hm(new THREE.SphereGeometry(0.155, 22, 18), this.plate, 0, 0.01, 0, 0.98, 1.12, 1.06);
    const ear = (s: number) => hm(new THREE.ConeGeometry(0.035, 0.09, 4), this.plate, s * 0.08, 0.17, 0.01);
    ear(-1).rotation.z = 0.3;
    ear(1).rotation.z = -0.3;
    for (const s of [-1, 1]) {
      const eye = hm(new THREE.BoxGeometry(0.07, 0.018, 0.02), this.eyes, s * 0.052, 0.035, -0.148);
      eye.rotation.z = s * -0.25;
    }
    hm(new THREE.BoxGeometry(0.02, 0.18, 0.02), this.eyes, 0, 0.06, -0.15, 1, 1, 1).scale.set(0.6, 1, 1);
  }

  applyStyle(st: ArmorStyle) {
    this.plate.color.set(st.primary);
    this.plate.emissive.set(st.glow);
    this.plate.emissiveMap = pat(st.pattern);
    this.plate.needsUpdate = true;
    this.under.emissive.set(st.glow);
    this.eyes.emissive.set(st.glow).lerp(new THREE.Color(0xffffff), 0.4);
  }

  /** Fenêtre de matérialisation autour de y (monde), rayon r. */
  setWindow(centerY: number, r: number) {
    this.planes[0].constant = -(centerY - r);
    this.planes[1].constant = centerY + r;
  }

  setVisible(v: boolean) {
    this.group.forEach((m) => (m.visible = v));
  }
}

export class ArmorSystem {
  style: ArmorStyle = { ...VARIANTS.royal.style };
  worn = false;
  maskUp = true; // masque déployé
  displayActive = false;
  energy = 1;
  display = new Humanoid(0x111111, 0x222222);
  displaySet!: ArmorSet;
  playerSet!: ArmorSet;
  private transform: { t: number; dir: 1 | -1 } | null = null;
  private particles!: THREE.Points;
  private ringA!: THREE.Mesh;
  private ringB!: THREE.Mesh;
  private shield!: THREE.Mesh;
  private shieldT = 0;
  private boostT = 0;
  private pulses: { mesh: THREE.Mesh; t: number }[] = [];
  vision = false;
  private maskT = 1;
  private inspectYaw = 0;
  private inspectPitch = 0.15;
  private inspectDist = 4.2;
  private prevView: "first" | "third" = "third";
  private cases: { set: ArmorSet; id: string; body: Humanoid }[] = [];

  build() {
    const pos = G.palace.armorPedestal;
    this.display.root.position.copy(pos);
    this.display.root.rotation.y = 0;
    this.display.pose();
    this.display.meshes.forEach((m) => (m.visible = false));
    G.palace.interiors[5].add(this.display.root);
    this.displaySet = new ArmorSet(this.display, this.style);
    this.playerSet = new ArmorSet(G.player.body, this.style);
    this.playerSet.setVisible(false);
    this.displaySet.setWindow(0, 1e4);

    // vitrines
    const ids = Object.keys(VARIANTS).filter((k) => k !== "royal");
    G.palace.armorCases.forEach((c, i) => {
      const id = ids[i];
      if (!id) return;
      const body = new Humanoid(0x111111, 0x222222);
      body.meshes.forEach((m) => (m.visible = false));
      body.pose();
      body.root.position.copy(c.pos);
      body.root.rotation.y = c.yaw;
      body.root.scale.setScalar(1.05);
      G.palace.interiors[5].add(body.root);
      const set = new ArmorSet(body, VARIANTS[id].style);
      set.setWindow(0, 1e4);
      this.cases.push({ set, id, body });
      G.interact.add({
        id: `case-${id}`,
        pos: c.pos.clone().add(new THREE.Vector3(c.pos.x < 0 ? 1.8 : -1.8, 0.6, 0)),
        radius: 2.8,
        label: () => (G.missions.state.armors.includes(id) ? `Appliquer le style « ${VARIANTS[id].name} »` : `${VARIANTS[id].name} — verrouillée (${VARIANTS[id].how})`),
        action: () => {
          if (!G.missions.state.armors.includes(id)) return bus.emit("toast", { text: `🔒 ${VARIANTS[id].name} : ${VARIANTS[id].how}.`, kind: "warn" });
          this.setStyle({ ...VARIANTS[id].style });
          bus.emit("toast", { text: `Style « ${VARIANTS[id].name} » appliqué à l'Armure Royale.` });
        }
      });
    });

    // effets
    const N = 1200;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.particles = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x6fd0ff, size: 0.05, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.particles.frustumCulled = false;
    G.scene.add(this.particles);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x6fd0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.ringA = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.015, 6, 48), ringMat);
    this.ringB = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.015, 6, 48), ringMat);
    this.ringA.rotation.x = this.ringB.rotation.x = Math.PI / 2;
    G.scene.add(this.ringA, this.ringB);
    const sm = new THREE.MeshBasicMaterial({ map: tex.hexGlow, color: 0x4fc8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(1.6, 32, 20), sm);
    this.shield.visible = false;
    G.scene.add(this.shield);

    G.interact.add({
      id: "armor-display",
      pos: pos.clone().add(new THREE.Vector3(0, 0, -2.6)),
      radius: 4,
      enabled: () => G.mode === "foot",
      label: () => (this.worn ? "Remettre l'armure sur son socle" : "Inspecter l'Armure Royale"),
      action: () => (this.worn ? this.remove() : this.inspect())
    });
  }

  setStyle(st: ArmorStyle) {
    this.style = st;
    this.displaySet.applyStyle(st);
    this.playerSet.applyStyle(st);
    bus.emit("armor:style", st);
    bus.emit("save");
  }

  // ---------------------------------------------------------------- inspection
  inspect() {
    if (G.mode !== "foot") return;
    G.mode = "inspect";
    G.input.unlock();
    this.inspectYaw = 0;
    bus.emit("ui:armor", true);
    bus.emit("mode");
  }
  endInspect() {
    if (G.mode !== "inspect") return;
    G.mode = "foot";
    bus.emit("ui:armor", false);
    bus.emit("mode");
  }
  activateDisplay() {
    this.displayActive = !this.displayActive;
    G.audio.tone(this.displayActive ? 440 : 220, 0.6, "sawtooth", 0.05, this.displayActive ? 880 : 110);
    bus.emit("toast", { text: this.displayActive ? "⚡ Armure activée : circuits d'énergie en ligne." : "Armure en veille." });
    if (this.displayActive) bus.emit("mission", { type: "armor-activate" });
  }

  // ---------------------------------------------------------------- transformation
  equip() {
    if (this.worn || this.transform) return;
    if (G.mode === "inspect") this.endInspect();
    if (G.mode === "ship") return bus.emit("toast", { text: "Sortez du vaisseau pour revêtir l'armure.", kind: "warn" });
    this.worn = true;
    this.maskUp = true;
    this.maskT = 1;
    this.transform = { t: 0, dir: 1 };
    this.prevView = G.player.view;
    G.player.view = "third";
    this.playerSet.setVisible(true);
    this.playerSet.applyStyle(this.style);
    G.audio.armorOn();
    bus.emit("toast", { text: "Nano-alliage en déploiement…" });
  }

  remove() {
    if (!this.worn || this.transform) return;
    this.transform = { t: 1, dir: -1 };
    G.audio.whoosh(1.2, 3000, 200, 0.18);
  }

  toggleMask() {
    if (!this.worn) return bus.emit("toast", { text: "Revêtez d'abord l'armure.", kind: "warn" });
    this.maskUp = !this.maskUp;
    G.audio.whoosh(0.4, this.maskUp ? 600 : 2400, this.maskUp ? 2400 : 600, 0.12);
  }

  onVehicle(inVehicle: boolean) {
    void inVehicle;
  }

  // ---------------------------------------------------------------- capacités
  ability(name: string) {
    if (!this.worn) {
      bus.emit("toast", { text: "Capacité indisponible : l'armure n'est pas portée.", kind: "warn" });
      return false;
    }
    const cost: Record<string, number> = { pulse: 0.35, shield: 0.3, boost: 0.25, vision: 0 };
    if (name === "shield" && !G.missions.state.tech.includes("nano")) {
      bus.emit("toast", { text: "Bouclier : analysez le Nano-tissage au laboratoire (niveau 5).", kind: "warn" });
      return false;
    }
    if ((cost[name] ?? 0) > this.energy) {
      bus.emit("toast", { text: "Énergie de l'armure insuffisante.", kind: "warn" });
      return false;
    }
    this.energy -= cost[name] ?? 0;
    const p = G.player.position;
    if (name === "pulse") {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshBasicMaterial({ color: this.style.glow, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.position.set(p.x, p.y + 1, p.z);
      G.scene.add(m);
      this.pulses.push({ mesh: m, t: 0 });
      G.audio.pulse();
      bus.emit("shake", 0.5);
    } else if (name === "shield") {
      this.shieldT = 6;
      G.audio.tone(300, 0.8, "triangle", 0.1, 900);
    } else if (name === "boost") {
      this.boostT = 8;
      G.audio.whoosh(0.8, 400, 3000, 0.15);
    } else if (name === "vision") {
      this.vision = !this.vision;
      document.body.classList.toggle("vision", this.vision);
    } else return false;
    bus.emit("mission", { type: "ability", name });
    return true;
  }

  // ---------------------------------------------------------------- boucle
  update(dt: number, t: number) {
    const inp = G.input;
    // inspection : caméra orbitale
    if (G.mode === "inspect") {
      const look = inp.consumeMouse();
      this.inspectYaw -= look.x * 1.5;
      this.inspectPitch = clamp(this.inspectPitch + look.y, -0.3, 0.9);
      this.inspectDist = clamp(this.inspectDist + inp.wheel * 0.3, 2.2, 7);
      this.inspectYaw += dt * 0.15;
      const c = G.palace.armorPedestal.clone().add(new THREE.Vector3(0, 1.1, 0));
      G.camera.position.set(c.x + Math.sin(this.inspectYaw) * Math.cos(this.inspectPitch) * this.inspectDist, c.y + Math.sin(this.inspectPitch) * this.inspectDist, c.z - Math.cos(this.inspectYaw) * Math.cos(this.inspectPitch) * this.inspectDist);
      G.camera.lookAt(c);
      if (inp.hit("Escape", "KeyQ")) this.endInspect();
    }

    // touches de capacités
    if (G.mode === "foot" && this.worn && !this.transform) {
      if (inp.hit("Digit1")) this.ability("pulse");
      if (inp.hit("Digit2")) this.ability("shield");
      if (inp.hit("Digit3")) this.ability("boost");
      if (inp.hit("Digit4")) this.ability("vision");
      if (inp.hit("KeyX")) this.toggleMask();
    }

    this.energy = Math.min(1, this.energy + dt * 0.05);
    const body = G.player.body;
    const feet = G.player.position.y;

    // transformation : fenêtre de découpe + nanites + anneaux
    const pm = this.particles.material as THREE.PointsMaterial;
    if (this.transform) {
      const tr = this.transform;
      tr.t = clamp(tr.t + (dt / 2.4) * tr.dir, 0, 1);
      const e = tr.t * tr.t * (3 - 2 * tr.t);
      const center = feet + 1.25;
      const r = e * 1.3;
      this.playerSet.setWindow(center, r);
      // l'armure du socle se dissout en miroir
      this.displaySet.setWindow(G.palace.armorPedestal.y + 1.25, (1 - e) * 1.3 + (G.palace.interiors[5].visible ? 0 : 0));
      this.ringA.position.set(G.player.position.x, center + r, G.player.position.z);
      this.ringB.position.set(G.player.position.x, center - r, G.player.position.z);
      (this.ringA.material as THREE.MeshBasicMaterial).opacity = r > 0.02 && r < 1.28 ? 0.9 : 0;
      (this.ringA.material as THREE.MeshBasicMaterial).color.set(this.style.glow);
      pm.opacity = Math.sin(e * Math.PI) * 0.9;
      pm.color.set(this.style.glow);
      const arr = this.particles.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < arr.length / 3; i++) {
        const a = i * 0.37 + t * 4;
        const rad = 0.3 + (1 - e) * (1.5 + ((i * 13) % 10) / 10);
        arr[i * 3] = G.player.position.x + Math.cos(a) * rad;
        arr[i * 3 + 1] = feet + ((i * 7) % 100) / 52;
        arr[i * 3 + 2] = G.player.position.z + Math.sin(a) * rad;
      }
      this.particles.geometry.attributes.position.needsUpdate = true;
      if ((tr.dir === 1 && tr.t >= 1) || (tr.dir === -1 && tr.t <= 0)) {
        if (tr.dir === -1) {
          this.worn = false;
          this.playerSet.setVisible(false);
          this.displaySet.setWindow(0, 1e4);
          this.shieldT = this.boostT = 0;
          if (this.vision) this.ability("vision");
          this.vision = false;
          document.body.classList.remove("vision");
          bus.emit("toast", { text: "Armure retournée sur son socle." });
        } else {
          this.playerSet.setWindow(0, 1e4);
          bus.emit("toast", { text: "🛡 Armure Royale déployée. 1 Impulsion · 2 Bouclier · 3 Surcharge · 4 Vision · X Masque" });
          bus.emit("mission", { type: "armor-equip" });
        }
        G.player.view = this.prevView;
        this.transform = null;
        pm.opacity = 0;
        (this.ringA.material as THREE.MeshBasicMaterial).opacity = 0;
      }
    }

    // masque rétractable
    this.maskT = damp(this.maskT, this.maskUp ? 1 : 0, 8, dt);
    this.playerSet.helmet.scale.set(0.6 + 0.4 * this.maskT, Math.max(0.01, this.maskT), 0.6 + 0.4 * this.maskT);
    this.playerSet.helmet.position.y = 0.14 - (1 - this.maskT) * 0.12;
    this.playerSet.helmet.visible = this.worn && this.maskT > 0.03;
    if (this.worn) body.skin.color.setHex(0x6b4630);

    // luminescence (effet choisi)
    const st = this.style;
    const k = st.effect === "pulse" ? 0.65 + 0.35 * Math.sin(t * 3) : st.effect === "flow" ? 1 : 1;
    const boostGlow = this.boostT > 0 ? 1.8 : 1;
    this.playerSet.plate.emissiveIntensity = st.intensity * k * boostGlow * 0.6;
    this.playerSet.under.emissiveIntensity = 0.06 + (this.boostT > 0 ? 0.3 : 0);
    this.displaySet.plate.emissiveIntensity = this.displayActive ? st.intensity * k * 0.8 : 0.12;
    this.displaySet.eyes.emissiveIntensity = this.displayActive ? 3 : 0.4;
    if (st.effect === "flow") {
      const map = this.playerSet.plate.emissiveMap;
      if (map) map.offset.y = (t * 0.25) % 1;
    }
    for (const c of this.cases) {
      const unlocked = G.missions.state.armors.includes(c.id);
      c.set.plate.emissiveIntensity = unlocked ? 0.9 + 0.3 * Math.sin(t * 2) : 0.03;
      c.set.eyes.emissiveIntensity = unlocked ? 2.5 : 0.1;
      if (!unlocked) c.set.plate.color.setHex(0x0a0a0a);
      else c.set.plate.color.set(VARIANTS[c.id].style.primary);
    }
    this.display.root.rotation.y += dt * (this.displayActive ? 0.6 : 0.15);

    // capacités en cours
    G.player.speedMul = this.boostT > 0 ? 1.7 : 1;
    G.player.jumpMul = this.boostT > 0 ? 1.9 : this.worn ? 1.25 : 1;
    if (this.boostT > 0) this.boostT -= dt;
    if (this.shieldT > 0) {
      this.shieldT -= dt;
      this.shield.visible = true;
      this.shield.position.set(G.player.position.x, G.player.position.y + 1, G.player.position.z);
      const sm = this.shield.material as THREE.MeshBasicMaterial;
      sm.color.set(st.glow);
      sm.opacity = Math.min(0.5, this.shieldT * 0.5) * (0.8 + 0.2 * Math.sin(t * 10));
      this.shield.rotation.y += dt;
    } else this.shield.visible = false;
    for (const p of this.pulses) {
      p.t += dt;
      p.mesh.scale.setScalar(1 + p.t * 30);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.6 - p.t * 0.9);
    }
    this.pulses = this.pulses.filter((p) => {
      if (p.t > 0.8) {
        G.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        return false;
      }
      return true;
    });
    if (this.vision) G.renderer.toneMappingExposure *= 1.6;
  }
}
