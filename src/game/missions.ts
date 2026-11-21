// Missions facultatives, progression (XP, rangs), récompenses et sauvegarde.
import * as THREE from "three";
import { G, bus } from "../core";
import { PROTOTYPES } from "../world/floors";
import { VARIANTS } from "./armor";

export interface MissionDef {
  id: string;
  title: string;
  desc: string;
  xp: number;
  reward: string;
  hint: string;
}

export const MISSIONS: MissionDef[] = [
  { id: "tour", title: "Visite royale", desc: "Visitez les 7 étages du palais.", xp: 150, reward: "+150 XP · 100 éclats", hint: "Utilisez l'ascenseur au fond du hall (touches 1-7 dans la cabine)." },
  { id: "armor", title: "L'Armure Royale", desc: "Activez puis revêtez l'Armure Royale à l'armurerie, et utilisez une capacité.", xp: 200, reward: "+200 XP", hint: "Niveau 6 — approchez du socle central et appuyez sur E." },
  { id: "flight", title: "Baptême de l'air", desc: "Démarrez le Royal Talon, décollez et dépassez 300 m d'altitude.", xp: 200, reward: "+200 XP", hint: "Plateforme royale derrière le palais — « GRIOT, monte dans le vaisseau »." },
  { id: "rings", title: "Tester un véhicule", desc: "Traversez les 8 anneaux dorés autour du palais en Royal Talon.", xp: 300, reward: "Armure Solaire", hint: "Suivez l'anneau doré le plus lumineux." },
  { id: "tech", title: "Découvrir une nouvelle technologie", desc: "Analysez les 3 prototypes du laboratoire puis récupérez le Cœur d'énergie dans le coffre.", xp: 300, reward: "Armure Aurora + améliorations", hint: "Niveau 5 — laboratoire technologique." },
  { id: "explorer", title: "Explorer le royaume", desc: "Visitez la ville, la jungle, les montagnes, l'océan, la vallée nocturne et la base secrète.", xp: 400, reward: "Armure Ivoire", hint: "Demandez : « GRIOT, emmène-moi explorer la ville »." },
  { id: "secret", title: "Explorer une zone secrète", desc: "Localisez la base secrète cachée dans les montagnes du nord et récupérez sa cache.", xp: 350, reward: "Armure Tempête", hint: "Un radar tourne dans une cuvette au nord-est des montagnes…" },
  { id: "shards", title: "Débloquer une nouvelle pièce", desc: "Rassemblez les 3 Éclats de données pour ouvrir les Archives royales.", xp: 350, reward: "Accès aux Archives + Armure Onyx", hint: "Tour centrale de la ville · Temple de la jungle · Plus haut sommet." },
  { id: "armors", title: "Découvrir de nouvelles armures", desc: "Débloquez 4 armures supplémentaires.", xp: 500, reward: "Rang « Empereur »", hint: "Chaque grande mission révèle une armure." }
];

const BIOMES = ["Ville futuriste", "Jungle tropicale", "Montagnes", "Océan", "Vallée nocturne", "Base secrète"];
const RANKS = ["Héritier", "Prince", "Souverain", "Roi", "Grand Roi", "Empereur"];

export interface SaveState {
  xp: number;
  credits: number;
  done: string[];
  flags: string[];
  floors: number[];
  tech: string[];
  armors: string[];
  shards: string[];
  biomes: string[];
  rings: number;
}

const fresh = (): SaveState => ({ xp: 0, credits: 0, done: [], flags: [], floors: [], tech: [], armors: ["royal"], shards: [], biomes: [], rings: 0 });

export class Missions {
  defs = MISSIONS;
  state: SaveState = fresh();
  private researching = false;

  init() {
    bus.on("mission", (e) => this.event(e));
    bus.on("research", (pr) => this.research(pr));
    bus.on("zone", () => this.checkBiome());
  }

  flag(f: string) {
    return this.state.flags.includes(f);
  }
  setFlag(f: string) {
    if (!this.flag(f)) this.state.flags.push(f);
  }
  isDone(id: string) {
    return this.state.done.includes(id);
  }
  completedCount() {
    return this.state.done.length;
  }
  level() {
    return 1 + Math.floor(Math.sqrt(this.state.xp / 60));
  }
  rankName() {
    if (this.isDone("armors")) return RANKS[5];
    return RANKS[Math.min(4, Math.floor(this.state.xp / 450))];
  }

  progressText(id: string): string {
    const s = this.state;
    switch (id) {
      case "tour":
        return `${s.floors.length}/7 étages`;
      case "armor":
        return [this.flag("armor-activate") ? "activée" : "à activer", this.flag("armor-equip") ? "portée" : "", this.flag("ability") ? "capacité ✔" : ""].filter(Boolean).join(" · ");
      case "flight":
        return this.flag("engines") ? (this.flag("takeoff") ? "en vol" : "moteurs OK") : "au hangar";
      case "rings":
        return `${s.rings}/8 anneaux`;
      case "tech":
        return `${s.tech.length}/3 prototypes${this.flag("core") ? " · cœur ✔" : ""}`;
      case "explorer":
        return `${s.biomes.length}/${BIOMES.length} zones`;
      case "secret":
        return this.flag("base-found") ? "base localisée" : "inconnue";
      case "shards":
        return `${s.shards.length}/3 éclats`;
      case "armors":
        return `${s.armors.length - 1}/4 armures`;
    }
    return "";
  }

  complete(id: string) {
    if (this.isDone(id)) return;
    const def = this.defs.find((d) => d.id === id)!;
    this.state.done.push(id);
    this.state.xp += def.xp;
    this.state.credits += Math.round(def.xp / 2);
    G.audio.reward();
    bus.emit("reward", { title: def.title, reward: def.reward, xp: def.xp });
    bus.emit("griot:say", { text: `Mission accomplie : ${def.title}. ${def.reward}.`, quiet: true });
    if (id === "rings") this.unlockArmor("solar");
    if (id === "explorer") this.unlockArmor("ivory");
    this.save();
  }

  /** TOUT GRATUIT : toutes les armures, toutes les technologies, toutes les portes, sans rien payer ni débloquer. */
  unlockAll() {
    for (const id of Object.keys(VARIANTS)) if (!this.state.armors.includes(id)) this.state.armors.push(id);
    for (const pr of PROTOTYPES) if (!this.state.tech.includes(pr.id)) this.state.tech.push(pr.id);
    for (const id of ["door-archives", "door-vault"]) {
      const d = G.palace.doors.get(id);
      if (d) d.locked = false;
    }
  }

  unlockArmor(id: string) {
    if (this.state.armors.includes(id)) return;
    this.state.armors.push(id);
    bus.emit("toast", { text: `🛡 Nouvelle armure débloquée : ${VARIANTS[id].name} (vitrines de l'armurerie).`, kind: "gold" });
    if (this.state.armors.length - 1 >= 4) this.complete("armors");
    this.save();
  }

  private research(pr: (typeof PROTOTYPES)[number]) {
    if (this.state.tech.includes(pr.id)) return bus.emit("toast", { text: `${pr.name} : déjà analysé. ${pr.reward}.` });
    if (this.researching) return;
    this.researching = true;
    bus.emit("progress", { label: `Analyse : ${pr.name}`, duration: 3 });
    G.audio.tone(500, 3, "sine", 0.03, 1500);
    setTimeout(() => {
      this.researching = false;
      this.state.tech.push(pr.id);
      this.state.xp += 40;
      bus.emit("toast", { text: `🔬 ${pr.name} analysé ! ${pr.reward}.`, kind: "gold" });
      if (this.state.tech.length === 3) {
        const vault = G.palace.doors.get("door-vault")!;
        vault.locked = false;
        vault.open();
        bus.emit("griot:say", { text: "Les trois prototypes sont analysés. J'ai déverrouillé le coffre du laboratoire : le Cœur d'énergie royal vous attend." });
      }
      this.save();
    }, 3000);
  }

  event(e: any) {
    const s = this.state;
    switch (e.type) {
      case "floor":
        if (!s.floors.includes(e.floor)) {
          s.floors.push(e.floor);
          if (s.floors.length === 7) this.complete("tour");
          this.save();
        }
        break;
      case "armor-activate":
        this.setFlag("armor-activate");
        break;
      case "armor-equip":
        this.setFlag("armor-equip");
        break;
      case "ability":
        this.setFlag("ability");
        if (this.flag("armor-equip")) this.complete("armor");
        break;
      case "ship-ready":
        this.setFlag("ship-ready");
        break;
      case "engines":
        this.setFlag("engines");
        break;
      case "altitude":
        if (!this.flag("takeoff")) {
          this.setFlag("takeoff");
          this.complete("flight");
        }
        break;
      case "ring":
        s.rings = e.index;
        bus.emit("toast", { text: `Anneau ${e.index}/${e.total}` });
        if (e.index >= e.total) this.complete("rings");
        break;
      case "core":
        this.setFlag("core");
        this.unlockArmor("aurora");
        this.complete("tech");
        break;
      case "shard":
        if (!s.shards.includes(e.id)) {
          s.shards.push(e.id);
          G.audio.reward();
          bus.emit("toast", { text: `◆ Éclat de données récupéré (${s.shards.length}/3)`, kind: "gold" });
          if (s.shards.length === 3) {
            const d = G.palace.doors.get("door-archives")!;
            d.locked = false;
            this.complete("shards");
            bus.emit("griot:say", { text: "Les trois éclats sont réunis. Les Archives royales du centre de commandement sont désormais ouvertes." });
          }
          this.save();
        }
        break;
      case "armor-found":
        if (e.flag) this.setFlag(e.flag);
        this.unlockArmor(e.id);
        if (e.id === "tempest") this.complete("secret");
        break;
      case "base":
        if (!this.flag("base-found")) {
          this.setFlag("base-found");
          bus.emit("griot:say", { text: "Signal détecté… Vous avez trouvé la base secrète du royaume. Je l'ajoute à la carte." });
          this.save();
        }
        break;
      case "cinema":
        this.setFlag("cinema");
        break;
    }
  }

  private checkBiome() {
    const p = G.mode === "ship" ? G.ship.root.position : G.player.position;
    const z = G.world.zoneName(p);
    if (BIOMES.includes(z) && !this.state.biomes.includes(z)) {
      this.state.biomes.push(z);
      bus.emit("toast", { text: `Nouvelle zone découverte : ${z}` });
      if (this.state.biomes.length === BIOMES.length) this.complete("explorer");
      this.save();
    }
    if (z === "Base secrète") this.event({ type: "base" });
  }

  /** Vérifications de proximité (éclats) — appelé chaque frame. */
  update() {
    const p = G.mode === "ship" ? G.ship.root.position : G.player.position;
    for (const sh of G.world.shards) {
      if (this.state.shards.includes(sh.id)) continue;
      if (p.distanceTo(sh.pos) < (G.mode === "ship" ? 14 : 4)) this.event({ type: "shard", id: sh.id });
    }
  }

  // ---------------------------------------------------------------- sauvegarde
  snapshot() {
    const pl = G.player;
    return {
      v: 2,
      missions: this.state,
      player: { pos: pl.position.toArray(), yaw: pl.yaw, view: pl.view, outfit: pl.body.outfit.color.getHex() },
      ship: { pos: G.ships[0].root.position.toArray(), yaw: G.ships[0].yaw, ready: G.ships[0].ready },
      armor: { style: G.armor.style, worn: G.armor.worn },
      world: { hour: G.env.hour },
      inShip: G.mode === "ship",
      elevator: G.palace.elevator.floor,
      at: Date.now()
    };
  }

  private saveTimer: any = null;
  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 400);
  }

  saveNow() {
    const snap = this.snapshot();
    try {
      localStorage.setItem("griot-save", JSON.stringify(snap));
    } catch {}
    fetch("/api/save", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ save: snap }) }).catch(() => {});
    bus.emit("saved");
  }

  async load(): Promise<boolean> {
    let snap: any = null;
    try {
      snap = JSON.parse(localStorage.getItem("griot-save") || "null");
    } catch {}
    try {
      const r = await fetch("/api/save");
      if (r.ok) {
        const d = await r.json();
        if (d.save && (!snap || d.save.at > snap.at)) snap = d.save;
      }
    } catch {}
    if (!snap || snap.v !== 2) return false;
    this.state = { ...fresh(), ...snap.missions };
    const pl = G.player;
    pl.position.fromArray(snap.player.pos);
    pl.yaw = snap.player.yaw;
    pl.view = snap.player.view;
    pl.setOutfit(snap.player.outfit);
    const royal = G.ships[0];
    royal.root.position.fromArray(snap.ship.pos);
    royal.yaw = snap.ship.yaw;
    royal.root.quaternion.setFromEuler(new THREE.Euler(0, royal.yaw, 0));
    royal.ready = snap.ship.ready;
    // anciennes sauvegardes : le vaisseau (devenu géant) ne tient plus dans le hangar
    if (G.palace.inside(royal.root.position)) royal.park();
    if (snap.ship.ready) royal.setLights(true);
    G.armor.setStyle(snap.armor.style);
    if (snap.armor.worn) {
      G.armor.worn = true;
      G.armor.playerSet.setVisible(true);
      G.armor.playerSet.setWindow(0, 1e4);
      G.armor.displaySet.setWindow(0, 0);
    }
    G.env.setHour(snap.world.hour);
    if (typeof snap.elevator === "number") G.palace.goToFloorSilent(snap.elevator);
    // portes débloquées
    if (this.state.shards.length >= 3) G.palace.doors.get("door-archives")!.locked = false;
    if (this.state.tech.length >= 3) G.palace.doors.get("door-vault")!.locked = false;
    G.player.snapCamera();
    return true;
  }

  reset() {
    try {
      localStorage.removeItem("griot-save");
    } catch {}
    fetch("/api/save", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ save: null }) }).finally(() => location.reload());
  }
}
