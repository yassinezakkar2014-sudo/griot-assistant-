// LA CABINE DU ROYAL TALON — un vrai petit appartement à l'intérieur du vaisseau géant :
// sas d'entrée, salon (canapé, grande télé à chaînes), bar-cuisine, chambre (lit, dressing),
// couloir vers le poste de pilotage. Les hublots montrent la vraie vue extérieure du vaisseau
// (caméra embarquée rendue en texture). La cabine est construite dans une « poche » de la carte,
// loin du monde, ce qui permet d'y marcher normalement avec la physique du jeu.
import * as THREE from "three";
import { G, bus } from "../core";
import { mat, HoloScreen } from "../world/materials";
import { block, span, wallX, wallZ, plane } from "../world/build";
import type { Ship } from "./ship";

/** Origine de la cabine (hors de la zone jouable). */
export const CABIN = new THREE.Vector3(3500, 900, -3500);
const X = 7; // demi-largeur
const Z1 = -20, // avant (poste de pilotage)
  Z2 = 20; // arrière (sas)
const H = 3.6;

export class Cabin {
  root = new THREE.Group();
  inside = false;
  private ship!: Ship;
  private rt = new THREE.WebGLRenderTarget(512, 256, { type: THREE.HalfFloatType });
  private cam = new THREE.PerspectiveCamera(78, 2, 1, 6000);
  private frame = 0;
  private tv!: HoloScreen;
  private tvMesh!: THREE.Mesh;
  private tvMat!: THREE.MeshBasicMaterial;
  /** 0 = éteinte, 1 = GRIOT TV, 2 = vue extérieure, 3 = aquarium */
  channel = 0;
  private mood = 0;
  private lights: { pos: THREE.Vector3; color: number; intensity: number; distance?: number }[] = [];
  private stripMat = new THREE.MeshStandardMaterial({ color: 0, emissive: 0x3fc8ff, emissiveIntensity: 1.6 });

  build(ship: Ship) {
    this.ship = ship;
    const r = this.root;
    G.scene.add(r);
    const o = CABIN;
    const ox = o.x,
      oy = o.y,
      oz = o.z;
    const hull = new THREE.MeshStandardMaterial({ color: 0x2a2e38, metalness: 0.85, roughness: 0.32 });
    const panel = new THREE.MeshStandardMaterial({ color: 0x3a3f4b, metalness: 0.7, roughness: 0.4 });
    const floorM = new THREE.MeshStandardMaterial({ color: 0x4a3426, roughness: 0.55, metalness: 0.05 }); // parquet sombre
    const carpet = new THREE.MeshStandardMaterial({ color: 0x1b2a4a, roughness: 0.95 });
    const leather = new THREE.MeshStandardMaterial({ color: 0x1a1b20, roughness: 0.5, metalness: 0.1 });
    const linen = new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.9 });
    const purple = new THREE.MeshStandardMaterial({ color: 0x3a1f5c, roughness: 0.8 });
    const marble = mat.marble;

    // coque : sol, plafond, murs
    span(r, ox - X - 1, oy - 1, oz + Z1 - 1, ox + X + 1, oy, oz + Z2 + 1, floorM);
    span(r, ox - X - 1, oy + H, oz + Z1 - 1, ox + X + 1, oy + H + 0.6, oz + Z2 + 1, panel);
    wallZ(r, ox - X, oz + Z1, oz + Z2, oy, H, hull, [], 0.6);
    wallZ(r, ox + X, oz + Z1, oz + Z2, oy, H, hull, [], 0.6);
    wallX(r, oz + Z1, ox - X, ox + X, oy, H, hull, [], 0.6);
    wallX(r, oz + Z2, ox - X, ox + X, oy, H, hull, [], 0.6);
    // cloisons : sas | salon | chambre | couloir du cockpit (passages au centre)
    wallX(r, oz + 13, ox - X, ox + X, oy, H, panel, [{ c: ox, w: 2.6, h: 2.8 }], 0.3);
    wallX(r, oz - 4, ox - X, ox + X, oy, H, panel, [{ c: ox - 3.5, w: 2, h: 2.6 }], 0.3);
    wallX(r, oz - 14, ox - X, ox + X, oy, H, panel, [{ c: ox, w: 2.2, h: 2.6 }], 0.3);
    // nervures de coque lumineuses le long du plafond
    for (const sx of [-1, 1]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, Z2 - Z1 - 1), this.stripMat);
      strip.position.set(ox + sx * (X - 0.35), oy + H - 0.08, oz);
      r.add(strip);
    }
    for (let z = Z1 + 2; z < Z2; z += 4) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(2 * X - 0.6, 0.18, 0.3), hull);
      rib.position.set(ox, oy + H - 0.1, oz + z);
      r.add(rib);
    }

    // hublots : vue extérieure en direct (même texture, miroir pour le côté droit)
    const winL = new THREE.MeshBasicMaterial({ map: this.rt.texture });
    const winR = new THREE.MeshBasicMaterial({ map: this.rt.texture, side: THREE.DoubleSide });
    for (const z of [-17, -10, -1, 5, 10]) {
      for (const sx of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), sx < 0 ? winL : winR);
        w.position.set(ox + sx * (X - 0.31), oy + 1.75, oz + z);
        w.rotation.y = sx < 0 ? Math.PI / 2 : -Math.PI / 2;
        if (sx > 0) w.scale.x = -1;
        const frame = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 40), mat.silver);
        frame.scale.set(1.36, 0.72, 1);
        frame.position.copy(w.position);
        frame.rotation.y = w.rotation.y;
        r.add(w, frame);
      }
    }

    // ---- SAS D'ENTRÉE (arrière)
    const hatch = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.8, 0.2), mat.glowCyan);
    hatch.position.set(ox, oy + 1.4, oz + Z2 - 0.32);
    r.add(hatch);
    const emblem = new THREE.Mesh(new THREE.CircleGeometry(0.6, 6), mat.glowGold);
    emblem.position.set(ox, oy + 3.1, oz + Z2 - 0.33);
    emblem.rotation.y = Math.PI;
    r.add(emblem);
    for (const sx of [-1, 1]) {
      // casiers à armure / combinaisons
      block(r, 1.4, 2.6, 0.8, panel, ox + sx * 5, oy, oz + Z2 - 1);
      const glow = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.05), this.stripMat);
      glow.position.set(ox + sx * 5, oy + 2.2, oz + Z2 - 1.42);
      r.add(glow);
    }
    G.interact.add({
      id: "cabin-exit",
      pos: new THREE.Vector3(ox, oy + 1, oz + Z2 - 1.5),
      radius: 3.2,
      enabled: () => this.inside,
      label: () => "Sortir du Royal Talon",
      action: () => this.exit()
    });

    // ---- SALON : tapis, canapé en L, table basse, grande télé
    span(r, ox - 6, oy, oz + 0, ox + 3, oy + 0.03, oz + 11, carpet, { solid: false });
    // canapé face au mur droit (télé)
    span(r, ox - 4.2, oy, oz + 1.5, ox - 3.2, oy + 0.45, oz + 10, leather);
    span(r, ox - 5, oy, oz + 1.5, ox - 4.2, oy + 1.1, oz + 10, leather, { solid: false });
    span(r, ox - 4.2, oy, oz + 9.2, ox - 1.4, oy + 0.45, oz + 10, leather);
    for (const z of [3, 5.5, 8]) {
      const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.5, 1.6), purple);
      cushion.position.set(ox - 4.6, oy + 0.85, oz + z);
      cushion.rotation.z = -0.2;
      r.add(cushion);
    }
    // table basse en marbre
    span(r, ox - 2.2, oy, oz + 4, ox - 0.4, oy + 0.42, oz + 7.5, marble);
    const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.35, 12), mat.gold);
    vase.position.set(ox - 1.3, oy + 0.6, oz + 5.7);
    r.add(vase);
    // télé géante sur le mur droit
    this.tv = new HoloScreen(640, 360, (c, w, h, t) => this.drawTV(c, w, h, t));
    this.tvMat = this.tv.material;
    this.tvMat.transparent = false;
    this.tvMat.opacity = 1;
    span(r, ox + X - 0.5, oy + 0.9, oz + 2.2, ox + X - 0.32, oy + 3.1, oz + 8.8, mat.black, { solid: false });
    this.tvMesh = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 2.0), this.tvMat);
    this.tvMesh.position.set(ox + X - 0.52, oy + 2, oz + 5.5);
    this.tvMesh.rotation.y = -Math.PI / 2;
    r.add(this.tvMesh);
    span(r, ox + X - 1.1, oy, oz + 2.5, ox + X - 0.3, oy + 0.55, oz + 8.5, mat.graphite); // meuble télé
    G.interact.add({
      id: "cabin-tv",
      pos: new THREE.Vector3(ox + X - 1.6, oy + 1, oz + 5.5),
      radius: 4.5,
      enabled: () => this.inside,
      label: () => ["Allumer la télé", "Chaîne suivante : vue extérieure", "Chaîne suivante : aquarium", "Éteindre la télé"][this.channel],
      action: () => this.setChannel((this.channel + 1) % 4)
    });
    G.interact.add({
      id: "cabin-sofa",
      pos: new THREE.Vector3(ox - 3, oy + 1, oz + 5.5),
      radius: 2.6,
      enabled: () => this.inside,
      label: () => "S'asseoir dans le canapé",
      action: () => G.player.sit(new THREE.Vector3(ox - 3.7, oy + 0.45 + 0.75, oz + 5.5), -Math.PI / 2)
    });

    // ---- BAR-CUISINE (côté gauche du salon, vers le sas)
    span(r, ox - X + 0.3, oy, oz + 11, ox - 1, oy + 1.0, oz + 12.6, marble); // comptoir
    span(r, ox - X + 0.3, oy + 1.0, oz + 11, ox - 1, oy + 1.06, oz + 12.6, mat.black, { solid: false });
    for (const x of [-5, -3.5, -2]) {
      const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.18, 0.8, 14), mat.silver);
      stool.position.set(ox + x, oy + 0.4, oz + 10.3);
      r.add(stool);
    }
    block(r, 1.2, 2.4, 0.9, mat.silver, ox + 5.6, oy, oz + 12.2); // frigo
    const fridgeLed = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.6, 0.05), this.stripMat);
    fridgeLed.position.set(ox + 5.0, oy + 1.3, oz + 11.7);
    r.add(fridgeLed);
    const drinks = ["un jus de bissap bien frais", "une eau pétillante", "un café royal", "un chocolat chaud"];
    let d = 0;
    G.interact.add({
      id: "cabin-fridge",
      pos: new THREE.Vector3(ox + 5.6, oy + 1, oz + 11),
      radius: 2.6,
      enabled: () => this.inside,
      label: () => "Prendre une boisson",
      action: () => {
        bus.emit("toast", { text: `🥤 Vous prenez ${drinks[d++ % drinks.length]}.` });
        G.audio.confirm();
      }
    });
    G.interact.add({
      id: "cabin-mood",
      pos: new THREE.Vector3(ox - 3, oy + 1, oz + 11),
      radius: 2.4,
      enabled: () => this.inside,
      label: () => "Changer l'ambiance lumineuse",
      action: () => this.setMood(this.mood + 1)
    });

    // ---- CHAMBRE (z -14 … -4)
    span(r, ox - X + 0.3, oy, oz - 12.5, ox - 2.5, oy + 0.55, oz - 7, linen); // lit king size
    span(r, ox - X + 0.3, oy, oz - 12.5, ox - X + 0.6, oy + 1.6, oz - 7, leather, { solid: false }); // tête de lit
    span(r, ox - X + 0.6, oy + 0.55, oz - 12.3, ox - 3.2, oy + 0.62, oz - 7.2, purple, { solid: false }); // couverture
    for (const z of [-11.2, -8.3]) {
      const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 1.5), linen);
      pillow.position.set(ox - X + 1.2, oy + 0.72, oz + z);
      r.add(pillow);
    }
    for (const z of [-13.3, -6.2]) {
      block(r, 0.8, 0.6, 0.7, mat.wood, ox - X + 0.8, oy, oz + z);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), mat.glowGold);
      lamp.position.set(ox - X + 0.8, oy + 0.85, oz + z);
      r.add(lamp);
    }
    // dressing + miroir
    block(r, 0.8, 3, 4.5, mat.wood, ox + X - 0.7, oy, oz - 9.5);
    for (const z of [-11, -8]) {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.6, 0.04), mat.gold);
      handle.position.set(ox + X - 1.12, oy + 1.4, oz + z);
      r.add(handle);
    }
    plane(r, 1.2, 2.2, new THREE.MeshStandardMaterial({ color: 0xcfe0ff, metalness: 1, roughness: 0.04 }), ox + 1.5, oy + 1.5, oz - 4.17, Math.PI);
    span(r, ox - 2.4, oy, oz - 12, ox + 3, oy + 0.02, oz - 6, carpet, { solid: false });
    G.interact.add({
      id: "cabin-bed",
      pos: new THREE.Vector3(ox - 3.6, oy + 1, oz - 9.7),
      radius: 3.2,
      enabled: () => this.inside,
      label: () => "Dormir jusqu'au matin",
      action: () => {
        bus.emit("fade");
        const h = G.env.hour;
        G.env.setHour(h >= 5 && h < 12 ? h + 2 : 7);
        G.player.sit(new THREE.Vector3(ox - 4.5, oy + 0.55 + 0.75, oz - 9.7), -Math.PI / 2);
        bus.emit("toast", { text: "😴 Bonne nuit, Majesté… Le Royal Talon veille sur vous. ☀️ Bonjour !" });
      }
    });
    G.interact.add({
      id: "cabin-wardrobe",
      pos: new THREE.Vector3(ox + X - 1.6, oy + 1, oz - 9.5),
      radius: 2.6,
      enabled: () => this.inside,
      label: () => "Changer de tenue",
      action: () => {
        const outfits = [0x1b2a4a, 0x5a1f3a, 0x1f4a2a, 0x2a2a2a, 0x8a6a2a];
        G.player.setOutfit(outfits[Math.floor(Math.random() * outfits.length)]);
        bus.emit("toast", { text: "👔 Nouvelle tenue." });
      }
    });

    // ---- COULOIR DU COCKPIT (avant)
    const console_ = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 0.8), mat.graphite);
    console_.position.set(ox, oy + 0.5, oz + Z1 + 1);
    r.add(console_);
    const map = new THREE.Mesh(new THREE.CircleGeometry(0.9, 6), mat.holo);
    map.rotation.x = -Math.PI / 2;
    map.position.set(ox, oy + 1.05, oz + Z1 + 1);
    r.add(map);
    G.interact.add({
      id: "cabin-cockpit",
      pos: new THREE.Vector3(ox, oy + 1, oz + Z1 + 2.4),
      radius: 3.2,
      enabled: () => this.inside,
      label: () => "Prendre les commandes (poste de pilotage)",
      action: () => this.toCockpit()
    });

    // éclairage intérieur (lumières de zone du palais)
    this.setMood(0, true);
    G.palace.zones.push({
      contains: (p) => Math.abs(p.x - ox) < X + 2 && p.z > oz + Z1 - 2 && p.z < oz + Z2 + 2 && Math.abs(p.y - oy) < 10,
      lights: this.lights
    });
    G.palace.updaters.push((_dt, t) => this.update(t));
  }

  private setMood(n: number, silent = false) {
    this.mood = n % 3;
    const o = CABIN;
    const palette = [
      [0xffd2a0, 0xffe6c4, 0xffb070, 0x9fd8ff],
      [0x3fa8ff, 0x6fd0ff, 0x2a6aff, 0x9f7aff],
      [0xff4ab0, 0x9f4aff, 0xff8a4a, 0x4a8aff]
    ][this.mood];
    const pts = [
      new THREE.Vector3(o.x, o.y + 3, o.z + 6),
      new THREE.Vector3(o.x, o.y + 3, o.z + 16),
      new THREE.Vector3(o.x - 2, o.y + 3, o.z - 9),
      new THREE.Vector3(o.x, o.y + 3, o.z - 17)
    ];
    this.lights.length = 0;
    pts.forEach((p, i) => this.lights.push({ pos: p, color: palette[i], intensity: 70, distance: 18 }));
    this.stripMat.emissive.setHex([0x3fc8ff, 0x2a6aff, 0xff4ab0][this.mood]);
    if (!silent) bus.emit("toast", { text: ["💡 Ambiance chaleureuse", "💡 Ambiance bleu nuit", "💡 Ambiance soirée"][this.mood] });
  }

  setChannel(c: number) {
    this.channel = c;
    this.tvMat.map = c === 2 ? this.rt.texture : this.tv.texture;
    this.tvMat.needsUpdate = true;
    if (c === 0) bus.emit("toast", { text: "📺 Télé éteinte." });
    else bus.emit("toast", { text: ["", "📺 GRIOT TV — le journal du royaume", "📺 Caméra extérieure du Royal Talon", "📺 Aquarium royal"][c] });
  }

  private drawTV(c: CanvasRenderingContext2D, w: number, h: number, t: number) {
    c.fillStyle = "#000";
    c.fillRect(0, 0, w, h);
    if (this.channel === 1) {
      const g = c.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#0b1a3a");
      g.addColorStop(1, "#3a1050");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#ffc861";
      c.font = "bold 38px Arial";
      c.fillText("GRIOT TV", 28, 58);
      c.fillStyle = "#fff";
      c.font = "24px Arial";
      const hh = G.env.hour;
      c.fillText(`Heure du royaume : ${Math.floor(hh)}h${String(Math.floor((hh % 1) * 60)).padStart(2, "0")}`, 28, 110);
      const s = this.ship;
      c.fillText(`Royal Talon : ${s.landed ? "au sol" : "en vol"} · énergie ${Math.round(s.energy * 100)} %`, 28, 150);
      c.fillText(`Joueurs connectés : ${G.net?.peers?.size ?? 0}`, 28, 190);
      c.fillText("Météo : ciel dégagé sur le royaume et sur Zuria", 28, 230);
      // bandeau défilant
      c.fillStyle = "#c0392b";
      c.fillRect(0, h - 58, w, 58);
      c.fillStyle = "#fff";
      c.font = "bold 26px Arial";
      const msg = "  ★ Le grand pont royal relie désormais le royaume au pays de Zuria  ★  Nouvelle cabine du Royal Talon : salon, chambre, cuisine  ★  THINK. SPEAK. RULE.  ";
      const tw = c.measureText(msg).width;
      const x = -((t * 90) % tw);
      c.fillText(msg, x, h - 20);
      c.fillText(msg, x + tw, h - 20);
    } else if (this.channel === 3) {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#0a5a8a");
      g.addColorStop(1, "#03203a");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 9; i++) {
        const fx = ((t * (30 + i * 9) + i * 140) % (w + 120)) - 60;
        const fy = 60 + ((i * 53) % (h - 120)) + Math.sin(t * 2 + i) * 14;
        c.fillStyle = ["#ff8a3a", "#ffd23a", "#3affd2", "#ff4a8a"][i % 4];
        c.beginPath();
        c.ellipse(fx, fy, 26, 13, 0, 0, Math.PI * 2);
        c.fill();
        c.beginPath();
        c.moveTo(fx - 24, fy);
        c.lineTo(fx - 44, fy - 12);
        c.lineTo(fx - 44, fy + 12);
        c.fill();
      }
      c.fillStyle = "rgba(255,255,255,0.5)";
      for (let i = 0; i < 25; i++) {
        const bx = (i * 97) % w,
          by = h - ((t * 40 + i * 37) % h);
        c.beginPath();
        c.arc(bx, by, 3 + (i % 3), 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = "#c2a36a";
      c.fillRect(0, h - 30, w, 30);
    }
  }

  private update(t: number) {
    this.check();
    if (!this.inside) return;
    this.frame++;
    if (this.channel === 1 || this.channel === 3) {
      if (this.frame % 3 === 0) this.tv.refresh(t);
    }
    if (this.frame % 3 === 0) this.renderOutside();
  }

  /** Caméra extérieure : depuis le flanc gauche du vaisseau, vers l'extérieur. */
  private renderOutside() {
    const s = this.ship;
    const r = G.renderer;
    s.root.updateMatrixWorld();
    this.cam.position.copy(s.root.localToWorld(s.V(-7, 0.9, 0)));
    this.cam.lookAt(s.root.localToWorld(s.V(-60, 0.2, 2)));
    const vis = s.root.visible;
    const au = r.shadowMap.autoUpdate;
    s.root.visible = false;
    r.shadowMap.autoUpdate = false;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.rt);
    r.render(G.scene, this.cam);
    r.setRenderTarget(prev);
    r.shadowMap.autoUpdate = au;
    s.root.visible = vis;
  }

  /** Entrée dans la cabine (vaisseau posé). */
  enter() {
    const s = this.ship;
    if (G.mode === "ship") {
      if (!s.landed) {
        bus.emit("toast", { text: "Posez d'abord le Royal Talon (H) pour aller dans la cabine.", kind: "warn" });
        return false;
      }
      s.exit();
    }
    if (G.mode !== "foot") return false;
    this.inside = true;
    G.player.teleport(new THREE.Vector3(CABIN.x, CABIN.y, CABIN.z + Z2 - 3), 0);
    this.renderOutside();
    bus.emit("toast", { text: "🛋️ Bienvenue à bord : salon, télé, cuisine, chambre. Le poste de pilotage est tout à l'avant." });
    G.audio.whoosh(0.6, 300, 900, 0.12);
    return true;
  }

  /** Sortie par le sas arrière, au pied du vaisseau. */
  exit() {
    const s = this.ship;
    this.inside = false;
    const back = s.root.position.clone().add(new THREE.Vector3(0, 0, 8.6 * s.S).applyAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw));
    back.y = G.physics.ground(back.x, s.root.position.y, back.z, 2).y;
    G.player.teleport(back, s.yaw + Math.PI);
  }

  /** Du couloir de la cabine au siège du pilote. */
  toCockpit() {
    const s = this.ship;
    this.inside = false;
    const side = s.root.position.clone().add(new THREE.Vector3(-5.8 * s.S, 0, -2.5 * s.S).applyAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw));
    side.y = G.physics.ground(side.x, s.root.position.y, side.z, 2).y;
    G.player.teleport(side, s.yaw);
    // la caméra part de l'intérieur du vaisseau (pas de travelling depuis la cabine)
    G.camera.position.copy(s.root.localToWorld(s.V(0, 1.9, 0.5)));
    if (!s.ready) s.prepare();
    s.board();
  }

  /** Sécurité : si le joueur quitte la cabine autrement (téléportation…), on n'est plus « dedans ». */
  check() {
    if (this.inside && G.player.position.distanceTo(CABIN) > 60) this.inside = false;
  }
}
