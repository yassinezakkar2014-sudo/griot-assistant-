// LA SUITE ROYALE DU MÉGA-YACHT : une vraie cabine de luxe où l'on entre et se promène — parquet en
// bois, boiseries, plafond à spots, grande baie vitrée qui montre la mer EN DIRECT (caméra sur le
// flanc du yacht), salon avec canapé et écran géant, piano, bar avec tabourets, chambre avec grand lit,
// salle de bain en marbre avec baignoire. On dort (passe à la nuit / au matin), on se sert un verre,
// on s'assoit face à la mer. La porte ramène sur le pont.
import * as THREE from "three";
import { G, bus } from "../core";
import { mat } from "../world/materials";
import { wallX, wallZ } from "../world/build";
import { furniture } from "./deco";

/** Pièce de poche, très haut au-dessus du monde (au-dessus des nuages). */
export const YCABIN = new THREE.Vector3(3500, 2600, 3500);
const HW = 8; // demi-largeur (x)
const HD = 13; // demi-longueur (z)
const HH = 3.4; // hauteur sous plafond

export class YachtCabin {
  root = new THREE.Group();
  inside = false;
  private rt = new THREE.WebGLRenderTarget(1024, 384, { type: THREE.HalfFloatType });
  private cam = new THREE.PerspectiveCamera(55, 1024 / 384, 2, 30000);
  private frame = 0;
  private tvMat!: THREE.MeshStandardMaterial;
  private tvTex!: THREE.CanvasTexture;
  private tvCtx!: CanvasRenderingContext2D;

  build() {
    const r = this.root;
    G.scene.add(r);
    const { x: ox, y: oy, z: oz } = YCABIN;
    const W = (x: number, y: number, z: number) => new THREE.Vector3(ox + x, oy + y, oz + z);
    const panel = new THREE.MeshStandardMaterial({ color: 0xf1ebe0, roughness: 0.6 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4428, roughness: 0.45, metalness: 0.05 });
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x3a2416, roughness: 0.4 });
    const marble = mat.marble;
    const gold = mat.gold;
    const navy = new THREE.MeshStandardMaterial({ color: 0x14244a, roughness: 0.8 });
    const solid = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) => G.physics.addBox({ x: ox + x1, y: oy + y1, z: oz + z1 }, { x: ox + x2, y: oy + y2, z: oz + z2 }, "ycabin");
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, isSolid = false) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.copy(W(x, y + h / 2, z));
      b.castShadow = b.receiveShadow = true;
      r.add(b);
      if (isSolid) solid(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2);
      return b;
    };
    const add = (o: THREE.Object3D) => (r.add(o), o);

    // ---- coque de la pièce
    box(HW * 2 + 1, 1, HD * 2 + 1, darkWood, 0, -1, 0, true); // sol porteur
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, HD * 2), new THREE.MeshStandardMaterial({ map: parquet(), roughness: 0.35, metalness: 0.05 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.copy(W(0, 0.02, 0));
    floor.receiveShadow = true;
    r.add(floor);
    box(HW * 2, 0.4, HD * 2, panel, 0, HH, 0, true); // plafond
    // murs : côté +x = grande baie vitrée (muret + montants), côté −x = boiseries
    wallZ(r, ox - HW, oz - HD, oz + HD, oy, HH, panel, [], 0.3);
    wallX(r, oz - HD, ox - HW, ox + HW, oy, HH, panel, [{ c: ox + HW - 2, w: 1.6, h: 2.4 }], 0.3); // porte vers le pont
    wallX(r, oz + HD, ox - HW, ox + HW, oy, HH, panel, [], 0.3);
    box(0.3, 0.7, HD * 2, panel, HW, 0, 0, true); // muret sous la baie
    box(0.3, 0.3, HD * 2, panel, HW, HH - 0.3, 0, true);
    solid(HW - 0.15, 0, -HD, HW + 0.3, HH, HD); // la vitre arrête le joueur
    for (let z = -HD; z <= HD; z += 3.25) box(0.18, HH, 0.18, darkWood, HW - 0.05, 0, z);
    // la baie montre la mer en direct
    const view = new THREE.Mesh(new THREE.PlaneGeometry(HD * 2 - 0.4, HH - 1.0), new THREE.MeshBasicMaterial({ map: this.rt.texture, toneMapped: false }));
    view.position.copy(W(HW + 0.05, 0.7 + (HH - 1.0) / 2, 0));
    view.rotation.y = -Math.PI / 2;
    r.add(view);
    // boiseries + plinthes dorées sur le mur gauche
    for (let z = -HD + 1.5; z < HD; z += 3) box(0.06, 2.2, 2.4, wood, -HW + 0.18, 0.5, z);
    box(0.08, 0.12, HD * 2, gold, -HW + 0.2, 0.05, 0);
    box(0.08, 0.06, HD * 2, gold, -HW + 0.2, 2.8, 0);
    // plafond : spots + corniche lumineuse
    const spot = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xfff1d6, emissiveIntensity: 2 });
    for (let x = -HW + 2; x < HW; x += 4)
      for (let z = -HD + 2; z < HD; z += 3.5) {
        const s = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), spot);
        s.position.copy(W(x, HH - 0.01, z));
        s.rotation.x = Math.PI / 2;
        r.add(s);
      }
    box(HW * 2 - 0.6, 0.05, 0.08, mat.glowGold, 0, HH - 0.25, -HD + 0.25);
    box(HW * 2 - 0.6, 0.05, 0.08, mat.glowGold, 0, HH - 0.25, HD - 0.25);

    // ---- SALON (z −13 … −2)
    add(furniture("tapis", ox + 2, oy + 0.03, oz - 7, 0, 1.4));
    add(furniture("canape", ox + 2, oy, oz - 4.3, Math.PI, 1.2));
    add(furniture("canape", ox - 1.6, oy, oz - 7.5, Math.PI / 2, 1.1));
    solid(-0.5, 0, -5, 4.2, 0.9, -3.7);
    box(2.2, 0.42, 1.1, darkWood, 2, 0, -7.3, true); // table basse
    box(2.3, 0.04, 1.2, marble, 2, 0.42, -7.3);
    add(furniture("plante", ox + HW - 1, oy, oz - HD + 1));
    add(furniture("plante", ox - HW + 1, oy, oz - 3));
    add(furniture("lampe", ox - HW + 1, oy, oz - 11));
    // écran géant sur le mur du fond (TV allumable)
    const tv = document.createElement("canvas");
    tv.width = 512;
    tv.height = 288;
    this.tvCtx = tv.getContext("2d")!;
    this.tvTex = new THREE.CanvasTexture(tv);
    this.tvTex.colorSpace = THREE.SRGBColorSpace;
    this.tvMat = new THREE.MeshStandardMaterial({ color: 0x050608, emissive: 0xffffff, emissiveMap: this.tvTex, emissiveIntensity: 0, roughness: 0.2 });
    box(4.6, 2.7, 0.12, darkWood, 2, 0.9, -HD + 0.25);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(4.3, 2.4), this.tvMat);
    screen.position.copy(W(2, 0.9 + 1.35, -HD + 0.33));
    r.add(screen);
    this.drawTv(0);
    add(furniture("piano", ox - 5, oy, oz - 10.5, 0.4));
    solid(-6, 0, -11.8, -4, 1, -9.2);

    // ---- BAR (z −1 … 2)
    box(0.9, 1.1, 5, darkWood, -4.6, 0, 0.5, true);
    box(1.1, 0.06, 5.2, marble, -4.6, 1.1, 0.5);
    box(0.4, 2.2, 5, wood, -HW + 0.4, 0.4, 0.5);
    for (let k = 0; k < 10; k++) {
      const bt = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.32, 10), new THREE.MeshStandardMaterial({ color: [0x2a6a3a, 0x8a1a2a, 0xd8b25a, 0x1a3a8a, 0xe8e8e8][k % 5], metalness: 0.2, roughness: 0.1, transparent: true, opacity: 0.85 }));
      bt.position.copy(W(-HW + 0.45, 1.0 + (k % 2) * 0.6, -1.5 + (k >> 1) * 0.9));
      r.add(bt);
    }
    for (let k = 0; k < 4; k++) {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.22, 0.08, 20), new THREE.MeshStandardMaterial({ color: 0x8a2a2a, roughness: 0.6 }));
      st.position.copy(W(-3.6, 0.8, -1.2 + k * 1.2));
      r.add(st);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.8, 8), gold);
      leg.position.copy(W(-3.6, 0.4, -1.2 + k * 1.2));
      r.add(leg);
    }
    // ---- cloison de la chambre (porte au centre)
    wallX(r, oz + 3, ox - HW, ox + HW, oy, HH, panel, [{ c: ox + 1.5, w: 1.8, h: 2.5 }], 0.25);
    // ---- CHAMBRE (z 3 … 13)
    add(furniture("lit", ox + 2.5, oy, oz + 9.5, Math.PI, 1.25));
    solid(0.8, 0, 7.6, 4.2, 0.8, 11.4);
    box(3.6, 2.2, 0.25, wood, 2.5, 0.2, HD - 0.3); // tête de lit capitonnée
    box(3.2, 1.6, 0.1, navy, 2.5, 0.5, HD - 0.45);
    for (const sx of [-1, 1]) {
      box(0.7, 0.6, 0.6, darkWood, 2.5 + sx * 2.3, 0, 11.8, true);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), mat.glowWhite);
      lamp.position.copy(W(2.5 + sx * 2.3, 0.85, 11.8));
      r.add(lamp);
    }
    box(0.7, 2.4, 3.6, wood, -HW + 0.4, 0, 6.5, true); // dressing
    add(furniture("tapis", ox + 2.5, oy + 0.03, oz + 8, Math.PI / 2, 1.1));
    // ---- SALLE DE BAIN en marbre (coin z 9 … 13, x −8 … −3)
    box(0.2, HH, 4.2, panel, -3.2, 0, 10.9, true);
    const tub = box(1.6, 0.6, 2.6, marble, -6.3, 0, 11, true);
    void tub;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.3), new THREE.MeshStandardMaterial({ color: 0x2ab0e8, emissive: 0x0a4a6a, emissiveIntensity: 0.4, roughness: 0.05, transparent: true, opacity: 0.85 }));
    water.rotation.x = -Math.PI / 2;
    water.position.copy(W(-6.3, 0.58, 11));
    r.add(water);
    box(1.2, 0.85, 0.6, marble, -4.3, 0, 12.5, true);
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.9), new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 1, roughness: 0.02 }));
    mirror.position.copy(W(-4.3, 1.6, 12.78));
    mirror.rotation.y = Math.PI;
    r.add(mirror);

    // ---- interactions
    const ia = (id: string, x: number, z: number, radius: number, label: string, action: () => void) =>
      G.interact.add({ id: "ycabin-" + id, pos: W(x, 1, z), radius, enabled: () => this.inside && G.mode === "foot", label: () => label, action });
    ia("door", HW - 2, -HD + 0.8, 2.2, "🚪 Sortir sur le pont du yacht", () => this.exit());
    ia("tv", 2, -HD + 2, 3, "📺 Allumer / changer la chaîne", () => this.toggleTv());
    ia("sofa", 2, -4.6, 2, "🛋 S'asseoir face à la mer", () => G.player.sit(W(2, 0.95, -4.6), Math.PI / 2 + Math.PI));
    ia("bar", -3.6, 0.5, 2.2, "🍹 Se servir un cocktail", () => {
      const d = ["un mocktail à la mangue", "un jus de bissap glacé", "une limonade à la menthe", "un smoothie fraise-banane"];
      bus.emit("toast", { text: `🍹 Le barman vous sert ${d[Math.floor(Math.random() * d.length)]}.` });
      G.audio.tone(1400, 0.08, "sine", 0.06, 1800);
    });
    ia("bed", 2.5, 7.2, 2.4, "😴 Dormir (passer à la nuit / au matin)", () => {
      bus.emit("fade");
      const night = G.env.nightFactor > 0.5;
      setTimeout(() => G.env.setHour(night ? 8 : 22), 300);
      bus.emit("toast", { text: night ? "☀️ Bonjour Majesté ! Le soleil se lève sur la mer." : "🌙 Bonne nuit, Majesté. Les étoiles brillent sur l'océan." });
    });
    ia("piano", -5, -9, 2.2, "🎹 Jouer du piano", () => {
      const notes = [523, 659, 784, 1046, 784, 659, 523];
      notes.forEach((f, i) => setTimeout(() => G.audio.tone(f, 0.35, "triangle", 0.07), i * 220));
    });
    ia("bath", -6.3, 9.4, 2, "🛁 Prendre un bain", () => bus.emit("toast", { text: "🛁 Un bain chaud parfumé au jasmin. Quel luxe !" }));

    G.palace.updaters.push(() => this.update());
  }

  /** Entre dans la suite (depuis la barre ou le pont du yacht). */
  enter() {
    const y = G.yacht;
    if (y.active) y.leaveHelmForCabin();
    this.inside = true;
    y.onDeck = false;
    G.mode = "foot";
    bus.emit("fade");
    G.player.teleport(new THREE.Vector3(YCABIN.x + HW - 2, YCABIN.y + 0.1, YCABIN.z - HD + 2), Math.PI);
    bus.emit("mode");
    bus.emit("toast", { text: "🛏 Suite royale de l'Étoile Royale : salon, bar, chambre et salle de bain. La baie vitrée montre la mer en direct." });
  }

  exit() {
    this.inside = false;
    G.yacht.toDeckFromCabin();
  }

  private toggleTv() {
    this.channel = (this.channel + 1) % 4;
    this.drawTv(this.channel);
    this.tvMat.emissiveIntensity = 1.1;
  }
  private channel = 0;

  private drawTv(ch: number) {
    const c = this.tvCtx;
    const g = c.createLinearGradient(0, 0, 0, 288);
    const sets = [
      ["#0b2a5a", "#3fa8ff", "OCÉAN — documentaire"],
      ["#3a0b4a", "#ff6ac8", "CONCERT ROYAL"],
      ["#0b3a1a", "#7cff6b", "FOOT — finale"],
      ["#4a2a0b", "#ffd27a", "INFOS DU ROYAUME"]
    ][ch];
    g.addColorStop(0, sets[0]);
    g.addColorStop(1, "#000");
    c.fillStyle = g;
    c.fillRect(0, 0, 512, 288);
    c.fillStyle = sets[1];
    c.font = "bold 34px Arial";
    c.textAlign = "center";
    c.fillText(sets[2], 256, 150);
    c.font = "18px Arial";
    c.fillText("♛ ÉTOILE ROYALE TV", 256, 270);
    this.tvTex.needsUpdate = true;
  }

  private update() {
    if (!this.inside) return;
    if (G.player.position.distanceTo(YCABIN) > 60) {
      this.inside = false;
      return;
    }
    if (++this.frame % 3) return;
    // vue en direct depuis le flanc tribord du yacht, vers le large
    const y = G.yacht;
    const eye = y.localToWorld(new THREE.Vector3(275, 95, -300));
    const look = y.localToWorld(new THREE.Vector3(1400, 40, -300));
    this.cam.position.copy(eye);
    this.cam.lookAt(look);
    const rd = G.renderer;
    const au = rd.shadowMap.autoUpdate;
    rd.shadowMap.autoUpdate = false;
    const prev = rd.getRenderTarget();
    rd.setRenderTarget(this.rt);
    rd.render(G.scene, this.cam);
    rd.setRenderTarget(prev);
    rd.shadowMap.autoUpdate = au;
  }
}

function parquet() {
  const cv = document.createElement("canvas");
  cv.width = 512;
  cv.height = 512;
  const c = cv.getContext("2d")!;
  for (let row = 0; row < 16; row++)
    for (let k = -1; k < 4; k++) {
      const off = (row % 2) * 64;
      const l = 40 + ((row * 7 + k * 13) % 9) * 3;
      c.fillStyle = `hsl(28, ${45 + ((row + k) % 3) * 5}%, ${l}%)`;
      c.fillRect(k * 128 + off, row * 32, 127, 31);
      c.fillStyle = "rgba(0,0,0,0.08)";
      for (let g = 0; g < 6; g++) c.fillRect(k * 128 + off + 4, row * 32 + 4 + g * 4.5, 118, 1);
    }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 6);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
