// Exécution réelle des actions demandées à GRIOT (commandes locales ou appels d'outils du modèle).
import * as THREE from "three";
import { G, bus, normalize } from "../core";
import { FLOORS, BASE } from "../world/palace";
import { ZONES, SEA } from "../world/terrain";
import { VARIANTS, armorUnlocked } from "../game/armor";
import { THEMES, ITEMS, kindFromText } from "../game/deco";
import { fmtHour } from "../world/floors";

export const COLORS: Record<string, string> = {
  bleu: "#2a8cff", blue: "#2a8cff", azul: "#2a8cff", violet: "#8a5cff", purple: "#8a5cff", mauve: "#8a5cff", rouge: "#ff3048", red: "#ff3048", rojo: "#ff3048",
  vert: "#2bff88", green: "#2bff88", verde: "#2bff88", or: "#ffc861", dore: "#ffc861", gold: "#ffc861", blanc: "#e8f4ff", white: "#e8f4ff", blanco: "#e8f4ff",
  cyan: "#00e5ff", turquoise: "#00e5ff", orange: "#ff8a2a", rose: "#ff5fc8", pink: "#ff5fc8", argent: "#c8ccd6", silver: "#c8ccd6", jaune: "#ffe14a", yellow: "#ffe14a"
};

const DOOR_WORDS: [RegExp, string][] = [
  [/barriere|rempart|portail|enceinte|muraille/, "barriers"],
  [/hangar|vaisseau/, "door-hangar"],
  [/garage|voiture/, "door-cargarage"],
  [/terrasse|terrace|balcon/, "door-terrace"],
  [/chambre|bedroom/, "door-bedroom"],
  [/dressing|garde.?robe|wardrobe/, "door-dressing"],
  [/cinema|movie/, "door-cinema"],
  [/spa|detente|relax/, "door-spa"],
  [/archive/, "door-archives"],
  [/coffre|vault/, "door-vault"],
  [/principal|entree|palais|grande porte|main|front|hall/, "door-main"]
];

export function floorFromText(t: string): number {
  const n = normalize(t);
  const m = /(\d)/.exec(n);
  if (m && +m[1] >= 1 && +m[1] <= 7) return +m[1] - 1;
  const words: [RegExp, number][] = [
    [/hall|entree|accueil|lobby/, 0],
    [/trone|throne/, 1],
    [/quartier|chambre|suite|prive|bedroom|cinema|dressing|detente/, 2],
    [/command|controle|control|centre de|salle de controle/, 3],
    [/labo|laboratoire|lab|science/, 4],
    [/armurerie|armory|armoury|armure/, 5],
    [/hangar/, 6]
  ];
  for (const [re, f] of words) if (re.test(n)) return f;
  return -1;
}

export interface Place {
  id: string;
  name: string;
  pos: () => THREE.Vector3;
  outdoor: boolean;
  hour?: number;
  /** point de vol (aire d'atterrissage) si différent */
  fly?: () => THREE.Vector3;
  /** lieu dans l'espace (station, Lune) */
  space?: boolean;
}

function ground(x: number, z: number) {
  return new THREE.Vector3(x, G.physics.ground(x, 2000, z, 0).y, z);
}

function beach() {
  for (let x = -600; x > -1600; x -= 10) if (G.physics.terrain(x, 0) < SEA + 2) return ground(x + 25, 0);
  return ground(-900, 0);
}

export const PLACES: Place[] = [
  { id: "city", name: "la ville futuriste", pos: () => ground(1400, -40), outdoor: true },
  { id: "jungle", name: "la jungle tropicale", pos: () => ground(300, -1840), outdoor: true },
  { id: "mountains", name: "les montagnes", pos: () => ground(-300, 1800), outdoor: true },
  { id: "ocean", name: "l'océan", pos: beach, outdoor: true },
  { id: "base", name: "la base secrète", pos: () => ground(ZONES.base.x, ZONES.base.z - 30), outdoor: true },
  { id: "night", name: "la vallée nocturne", pos: () => ground(ZONES.night.x, ZONES.night.z), outdoor: true, hour: 22.5 },
  { id: "gardens", name: "les jardins royaux", pos: () => G.palace.spots.gardens.pos.clone(), outdoor: true },
  { id: "palace", name: "le palais", pos: () => G.palace.spots.floor0.pos.clone(), outdoor: false },
  { id: "terrace", name: "la terrasse", pos: () => G.palace.spots.terrace.pos.clone(), outdoor: false },
  { id: "platform", name: "la plate-forme de lancement", pos: () => G.palace.spots.platform.pos.clone(), outdoor: false },
  { id: "pad", name: "la plateforme du Royal Talon", pos: () => G.palace.shipSpawn.clone().add(new THREE.Vector3(-30, 0.3, -42)), outdoor: false },
  { id: "bridge", name: "le pont royal de Zuria", pos: () => (G.world.markers.find((m) => m.id === "bridge")?.pos.clone() ?? G.palace.spots.zuria.pos.clone()).add(new THREE.Vector3(0, 0.5, 0)), outdoor: true },
  { id: "zuria", name: "le pays de Zuria", pos: () => G.palace.spots.zuria.pos.clone(), outdoor: true },
  { id: "garage", name: "le garage royal", pos: () => G.palace.spots.garage.pos.clone(), outdoor: false },
  { id: "gallery", name: "la galerie royale", pos: () => G.palace.spots.gallery.pos.clone(), outdoor: false }
];

export function placeFromText(t: string): Place | null {
  const n = normalize(t);
  // pays du grand monde (noms exacts)
  for (const p of PLACES) if (p.id.startsWith("country:") && new RegExp(`\\b${normalize(p.name)}\\b`).test(n)) return p;
  if (/\bmall\b|centre commercial|boutique|magasin|shopping/.test(n)) return PLACES.find((p) => p.id === "mall") ?? null;
  if (/aeroport/.test(n)) return PLACES.find((p) => p.id === (/princesse/.test(n) ? "airport-princesses" : "airport")) ?? null;
  if (/princesse/.test(n)) return PLACES.find((p) => p.id === "country:princesses") ?? null;
  if (/metropole|nouvelle ville/.test(n)) return PLACES.find((p) => p.id === "metro") ?? null;
  if (/\blune\b|moon|base lunaire/.test(n)) return PLACES.find((p) => p.id === "moon") ?? null;
  if (/station (spatiale|orbitale)|\bla station\b/.test(n)) return PLACES.find((p) => p.id === "station") ?? null;
  const map: [RegExp, string][] = [
    [/ville|city|ciudad|cite|downtown/, "city"],
    [/jungle|foret tropicale|selva|temple/, "jungle"],
    [/montagne|mountain|sommet|peak|montana/, "mountains"],
    [/ocean|mer\b|sea|plage|beach|cote|mar\b/, "ocean"],
    [/base|secret/, "base"],
    [/nocturne|nuit|night|lucioles|biolumin/, "night"],
    [/jardin|garden|fontaine|parc/, "gardens"],
    [/terrasse|terrace/, "terrace"],
    [/plate.?forme|platform|piste/, "platform"],
    [/\bpont\b|bridge|puente/, "bridge"],
    [/zuria|autre pays|pays voisin|autre royaume|etranger|voisin/, "zuria"],
    [/garage|voitures?|autos?/, "garage"],
    [/plateforme royale|plateforme du vaisseau|aire d atterrissage/, "pad"],
    [/galerie|gallery|musee/, "gallery"],
    [/palais|palace|maison|home|chez moi/, "palace"]
  ];
  for (const [re, id] of map) if (re.test(n)) return PLACES.find((p) => p.id === id)!;
  return null;
}

function nearestDoor() {
  let best: string | null = null;
  let bd = 12;
  for (const [id, d] of G.palace.doors) {
    if (id.startsWith("lift-")) continue;
    const dist = d.center.distanceTo(G.player.position);
    if (dist < bd) {
      bd = dist;
      best = id;
    }
  }
  return best;
}

function doorId(target?: string | null): string | null {
  if (!target) return nearestDoor();
  const n = normalize(target);
  if (G.palace.doors.has(n)) return n;
  for (const [re, id] of DOOR_WORDS) if (re.test(n)) return id;
  if (/ascenseur|elevator|lift/.test(n)) return "lift";
  return nearestDoor();
}

/** Exécute une action ; renvoie la phrase de confirmation de GRIOT. */
export async function runAction(action: string, target?: string | null): Promise<string> {
  const W = window as any;
  if (action === "aisam_off") {
    bus.emit("aisam:off");
    return "AISAM est en veille. Je reste à votre écoute ici.";
  }
  if (!W.__gameReady) {
    bus.emit("aisam:on");
    return "AISAM est encore en cours de chargement. Je l'active dès qu'il est prêt, redemandez-moi ensuite.";
  }
  if (!W.__aisamActive) await W.__aisamActivate?.();
  if (action === "aisam_on") return "AISAM activé. Bienvenue dans votre royaume, Majesté.";
  // à pied : on utilise le vaisseau le plus proche (Royal Talon ou Faucon de Zuria)
  if (G.mode !== "ship" && G.ships && /ship|engines|takeoff|fly_to|stealth|supersonic/.test(action)) {
    G.ship = [...G.ships].sort((a, b) => a.root.position.distanceTo(G.player.position) - b.root.position.distanceTo(G.player.position))[0];
    // vaisseau nommé (« monte dans l'Améthyste », « prépare le Turquoise »…)
    const tn = normalize(String(target ?? ""));
    const KEYS = ["talon", "faucon", "amethyste", "turquoise"];
    const named = G.ships.find((s) => normalize(s.name).split(" ").some((w) => KEYS.includes(w) && new RegExp(`\\b${w}\\b`).test(tn)));
    if (named) G.ship = named;
  }
  const ship = G.ship;
  const armor = G.armor;
  switch (action) {
    case "open_door":
    case "close_door": {
      const id = doorId(target);
      if (id === "lift") {
        const f = Math.max(0, G.palace.floorAt(G.player.position));
        G.palace.callElevator(f);
        return "J'appelle l'ascenseur.";
      }
      if (id === "barriers") {
        const n = normalize(String(target ?? ""));
        const ids = /ville|city/.test(n) ? ["gate-city"] : /palais|domaine|royaume/.test(n) ? [...G.palace.doors.keys()].filter((k) => k.startsWith("gate-") && k !== "gate-city") : [...G.palace.doors.keys()].filter((k) => k.startsWith("gate-"));
        ids.forEach((k) => (action === "open_door" ? G.palace.doors.get(k)!.open() : G.palace.doors.get(k)!.close()));
        const what = ids.length === 1 ? "La barrière d'énergie de la ville" : `${ids.length} grandes barrières`;
        return action === "open_door" ? `${what} : ouverture.` : `${what} : fermeture. Le royaume est sécurisé.`;
      }
      if (!id) return "Je ne vois aucune porte à proximité. Précisez laquelle : garage, terrasse, chambre, archives…";
      const d = G.palace.doors.get(id)!;
      if (action === "open_door") {
        if (!d.open()) return `${d.label} : ${d.lockedReason}`;
        return `${d.label} : ouverture en cours.`;
      }
      d.close();
      return `${d.label} : fermeture.`;
    }
    case "go_to_floor": {
      const f = floorFromText(String(target ?? ""));
      if (f < 0) return "Quel étage ? De 1, le Grand Hall, à 7, le Hangar royal.";
      if (G.mode === "ship") return "Nous sommes en vol. Atterrissez et sortez du vaisseau d'abord, ou demandez-moi de vous ramener au palais.";
      if (G.mode === "inspect") armor.endInspect();
      G.palace.goToFloor(f);
      return `Niveau ${f + 1} : ${FLOORS[f].name}.`;
    }
    case "teleport":
    case "fly_to": {
      const sup = String(target ?? "").endsWith("|super");
      if (sup) target = String(target).replace("|super", "");
      const pl = PLACES.find((x) => x.id === target) ?? placeFromText(String(target ?? ""));
      if (!pl) {
        const f = floorFromText(String(target ?? ""));
        if (f >= 0) return runAction("go_to_floor", String(f + 1));
        return `Destination inconnue. Je connais : ville, métropole, jungle, montagnes, océan, base secrète, vallée nocturne, jardins, palais, Zuria, et les pays ${PLACES.filter((p) => p.id.startsWith("country:")).map((p) => p.name).join(", ")}.`;
      }
      if (pl.hour !== undefined) G.env.setHour(pl.hour);
      // lieux de l'espace : on y monte d'abord ; lieux sur Terre : on redescend
      if (pl.space && !G.space.active) {
        if (action === "teleport" && G.mode !== "ship") {
          G.space.enter();
          G.player.teleport(pl.pos());
          return `Vous voici sur ${pl.name}. ${pl.id === "moon" ? "Gravité lunaire : sautez !" : "Admirez la Terre depuis la salle d'observation."}`;
        }
        if (G.mode !== "ship") {
          if (!ship.ready) ship.prepare();
          await ship.board();
        }
        G.space.enter();
        ship.flyTo((pl.fly ?? pl.pos)(), `Vol vers ${pl.name}`);
        return `Décollage vers l'espace ! Cap sur ${pl.name}.`;
      }
      if (!pl.space && G.space.active && G.mode === "ship") G.space.exit();
      if (G.mode === "inspect") armor.endInspect();
      if (action === "fly_to" && pl.outdoor && pl.id !== "gardens") {
        if (G.mode !== "ship") {
          if (!ship.ready) ship.prepare();
          await ship.board();
        }
        const dest = (pl.fly ?? pl.pos)();
        ship.flyTo(dest, `Vol vers ${pl.name}`);
        const far = dest.distanceTo(ship.root.position) > 5000;
        if ((sup || far) && !ship.opts.small) {
          ship.supersonic = true;
          if (!sup) return `Cap sur ${pl.name}, à ${(dest.distanceTo(ship.root.position) / 1000).toFixed(1)} km : mode supersonique engagé pour traverser l'océan.`;
          ship.supersonic = true;
          return `Cap sur ${pl.name} en mode supersonique. Accrochez-vous, Majesté.`;
        }
        return `Cap sur ${pl.name}. Pilote automatique engagé — reprenez les commandes quand vous voulez.`;
      }
      if (G.mode === "ship") {
        if (pl.outdoor) {
          ship.flyTo((pl.fly ?? pl.pos)(), `Vol vers ${pl.name}`);
          return `Cap sur ${pl.name}.`;
        }
        ship.flyTo(new THREE.Vector3(0, BASE[6] + 3.5, -48), "Retour au palais");
        return "Retour vers la plate-forme du palais.";
      }
      G.player.teleport(pl.pos(), G.player.yaw);
      return `Bienvenue dans ${pl.name}.`;
    }
    case "prepare_ship":
      ship.prepare();
      return "Le Royal Talon est prêt sur la plateforme royale : diagnostics nominaux, lumières allumées.";
    case "board_ship":
      if (G.mode === "ship") return "Vous êtes déjà aux commandes.";
      if (!ship.ready) ship.prepare();
      await ship.board();
      return "Installez-vous, Majesté. R pour les moteurs, Espace pour monter.";
    case "start_engines":
      if (G.mode !== "ship") {
        if (!ship.ready) ship.prepare();
        await ship.board();
      }
      ship.startEngines(true);
      return "Moteurs démarrés. Puissance stable.";
    case "toggle_supersonic": {
      const off = /off/.test(String(target ?? ""));
      if (!off && G.mode !== "ship") return "Montez d'abord à bord du Royal Talon et décollez.";
      ship.setSupersonic(!off);
      return ship.supersonic ? "Mode supersonique engagé. Mach 1 dans quelques secondes." : "Mode supersonique désactivé.";
    }
    case "ride": {
      const n = normalize(String(target ?? "")).replace(/\b(en|comme|le|la|de|du|avec|passager|dans|son|sa|vaisseau|voiture)\b/g, " ").trim();
      const peers = [...G.net.peers.values()];
      const p = peers.find((x) => n && normalize(x.state?.n ?? "").includes(n)) ?? peers.find((x) => x.state && (x.state.m === "ship" || x.state.m === "car"));
      if (!p || !p.state) return "Personne avec qui monter : aucun joueur connecté n'est aux commandes d'un véhicule.";
      if (G.mode !== "foot") return "Descendez d'abord de votre véhicule.";
      if (p.state.m === "car" && p.car) {
        G.passenger.board("car", p.id);
        return `Vous montez en passager dans la voiture de ${p.state.n}.`;
      }
      if (p.state.m === "ship") {
        G.passenger.board("ship", p.id);
        return `Vous montez à bord avec ${p.state.n}.`;
      }
      return `${p.state.n} n'est dans aucun véhicule pour l'instant.`;
    }
    case "antiair": {
      const aa = G.antiair;
      const n = String(target ?? "on");
      if (n === "test") {
        aa.armed = true;
        aa.demo();
        return "Tir de démonstration de la défense anti-aérienne. Regardez le ciel au-dessus des remparts.";
      }
      if (n === "status") return aa.armed ? `Défense anti-aérienne active : ${aa.turrets.length} tourelles et un radar. ${aa.lockedName ? "Contact suivi : " + aa.lockedName + "." : "Aucun appareil suivi."}` : "Défense anti-aérienne désactivée.";
      aa.armed = n !== "off";
      return aa.armed ? `Défense anti-aérienne activée : ${aa.turrets.length} tourelles en veille sur les remparts du palais.` : "Défense anti-aérienne désactivée.";
    }
    case "cabin": {
      const c = G.cabin;
      const n = normalize(String(target ?? ""));
      if (n === "exit") {
        if (!c.inside) return "Vous n'êtes pas dans la cabine.";
        c.exit();
        return "Vous êtes sorti par le sas arrière du Royal Talon.";
      }
      if (!c.inside && !c.enter()) return "Posez d'abord le Royal Talon, puis je vous ouvre la cabine.";
      if (n === "tv") {
        c.setChannel(c.channel === 0 || c.channel === 3 ? 1 : c.channel + 1);
        return "La télé est allumée. Dites « change de chaîne » pour la suivante.";
      }
      if (n === "sleep") {
        G.interact.get("cabin-bed")?.action();
        return "Bonne nuit, Majesté. Je veille sur le vaisseau.";
      }
      return "Bienvenue dans la cabine du Royal Talon : salon avec télé, bar-cuisine, chambre, et le poste de pilotage à l'avant.";
    }
    case "toggle_stealth": {
      const n = normalize(String(target ?? ""));
      const on = /desactiv|coupe|arrete|off|visible/.test(n) ? false : !/^(on|active)$/.test(n) && ship.stealth ? false : true;
      ship.setStealth(on);
      return ship.stealth ? "Mode furtif activé. Le Royal Talon est invisible." : "Mode furtif désactivé.";
    }
    case "toggle_ship_lights":
      ship.setLights(!ship.lights);
      return ship.lights ? "Systèmes lumineux activés." : "Lumières coupées.";
    case "takeoff":
      if (G.mode !== "ship") {
        if (!ship.ready) ship.prepare();
        await ship.board();
      }
      ship.takeoff();
      return "Décollage. Accrochez-vous.";
    case "land":
      if (G.mode !== "ship") return "Nous ne sommes pas en vol.";
      ship.land();
      return "Atterrissage automatique engagé.";
    case "board_car": {
      if (G.mode === "ship") return "Atterrissez et sortez du vaisseau d'abord.";
      if (G.mode === "car") return "Vous êtes déjà au volant.";
      if (G.mode === "inspect") armor.endInspect();
      const car = G.cars.nearest(G.player.position, String(target ?? ""));
      if (G.player.position.distanceTo(car.pos) > 8) G.player.teleport(car.root.localToWorld(car.driverSide.clone()).setY(car.pos.y), car.yaw);
      car.doorTarget = 1;
      await new Promise((r) => setTimeout(r, 700));
      G.cars.board(car);
      return `Installez-vous dans la ${car.def.name}. Moteur démarré.`;
    }
    case "exit_vehicle":
      if (G.mode === "car") {
        G.cars.exit();
        return (G.mode as string) === "car" ? "Arrêtez d'abord la voiture." : "Vous êtes sorti de la voiture.";
      }
      if (G.mode !== "ship") return "Vous n'êtes pas dans un véhicule.";
      if (!ship.landed) {
        ship.land();
        return "Atterrissage d'abord — je vous préviens dès que nous sommes posés.";
      }
      ship.exit();
      return "Vous êtes sorti du Royal Talon.";
    case "equip_armor":
      if (armor.worn) return "L'armure est déjà déployée.";
      if (G.mode === "ship") return "Sortez d'abord du vaisseau pour revêtir l'armure.";
      armor.equip();
      return "Déploiement du nano-alliage. Armure Royale en ligne.";
    case "remove_armor":
      if (!armor.worn) return "Vous ne portez pas l'armure.";
      armor.remove();
      return "L'armure retourne sur son socle.";
    case "toggle_mask":
      armor.toggleMask();
      return armor.worn ? (armor.maskUp ? "Masque déployé." : "Masque rétracté.") : "Revêtez d'abord l'armure.";
    case "armor_color": {
      const n = normalize(String(target ?? ""));
      let col = /^#?[0-9a-f]{6}$/.test(n) ? (n.startsWith("#") ? n : "#" + n) : null;
      if (!col) for (const [k, v] of Object.entries(COLORS)) if (n.includes(k)) col = v;
      const variant = Object.entries(VARIANTS).find(([, v]) => normalize(v.name).includes(n) || n.includes(normalize(v.name).split(" ")[1] ?? "~"));
      if (variant && armorUnlocked(variant[0])) {
        armor.setStyle({ ...variant[1].style });
        return `Style ${variant[1].name} appliqué.`;
      }
      if (!col) return "Quelle couleur ? Bleu, violet, rouge, vert, or, blanc, cyan, orange…";
      armor.setStyle({ ...armor.style, glow: col });
      return "Couleur des circuits mise à jour.";
    }
    case "flight": {
      const n = normalize(String(target ?? ""));
      const ap = G.airports;
      const p = G.player.position;
      const near = ap.ports.reduce((a, b) => (a.W(0, 0, 450).distanceTo(p) < b.W(0, 0, 450).distanceTo(p) ? a : b));
      const dest = /princesse|ile|fille/.test(n) ? "princesses" : /royal|palais|royaume|maison/.test(n) ? "royal" : near.def.id === "royal" ? "princesses" : "royal";
      const from = /panoram/.test(n) ? near.def.id : dest === "princesses" ? "royal" : "princesses";
      if (near.W(0, 0, 450).distanceTo(p) > 1500) {
        // on emmène d'abord le joueur à l'aérogare de départ
        const fp = ap.ports.find((x) => x.def.id === from)!;
        G.player.teleport(fp.hall.clone());
      }
      return ap.fly(from, /panoram/.test(n) ? from : dest);
    }
    case "tiktok":
      bus.emit("ui:phone-app", target === "rec" ? "tiktok-rec" : "tiktok");
      return target === "rec" ? "Moteur… action ! Je filme 15 secondes de votre partie pour TikTok." : "Voici TikTok : filmez votre partie ou ouvrez l'appli.";
    case "invite":
      if (G.mode !== "ship") return "Montez d'abord aux commandes de votre Royal Talon, puis je préviens vos amis.";
      bus.emit("ui:phone-app", "invite-all");
      return "Invitation envoyée à vos amis : ils peuvent monter à bord d'un seul toucher.";
    case "aboard":
      bus.emit("ui:phone-app", "aboard");
      return "Choisissez l'ami qui pilote, ou prenez les commandes et invitez-les.";
    case "phone":
      bus.emit("ui:phone");
      return "Voici votre Royal Phone : messages et appels vidéo avec vos amis.";
    case "avatar":
      bus.emit("ui:avatar");
      return "Voici votre garde-robe royale : choisissez votre avatar.";
    case "call":
      bus.emit("ui:call");
      return "Je vous appelle, Majesté.";
    case "train": {
      const n = normalize(String(target ?? ""));
      return G.train.rideTo(n);
    }
    case "space": {
      const n = String(target ?? "");
      if (n === "exit") {
        if (!G.space.active) return "Nous sommes déjà sur Terre.";
        G.space.exit();
        return "Rentrée atmosphérique. Bienvenue sur Terre.";
      }
      if (G.space.active) return "Nous sommes déjà dans l'espace. Dites « emmène-moi sur la Lune » ou « pose-toi sur la station ».";
      if (G.mode !== "ship") {
        if (!ship.ready) ship.prepare();
        await ship.board();
      }
      if (!G.space.enter()) return "Seul le Royal Talon peut aller dans l'espace.";
      return "Cap sur les étoiles ! Nous sommes en orbite, face à la Station orbitale royale.";
    }
    case "deco": {
      const n = normalize(String(target ?? ""));
      const d = G.deco;
      if (/^theme:/.test(n)) {
        const id = Object.keys(THEMES).find((k) => n.includes(k) || n.includes(normalize(THEMES[k].name)));
        if (!id) return "Thèmes : " + Object.values(THEMES).map((x) => x.name).join(", ") + ".";
        d.setTheme(id);
        return `Le palais adopte le thème ${THEMES[id].name}.`;
      }
      if (n === "remove") return d.removeNearest() ? "Objet retiré." : "Aucun objet décoratif à proximité.";
      if (n === "rotate") return d.rotateNearest() ? "Objet tourné." : "Aucun objet décoratif à proximité.";
      if (n === "clear") {
        d.clear();
        return "Toute la décoration a été retirée.";
      }
      if (n === "open") {
        bus.emit("ui:deco");
        return "Voici l'Atelier royal : thèmes et objets à poser.";
      }
      const k = kindFromText(n);
      if (!k) return "Je peux poser : " + Object.values(ITEMS).map((x) => x.name.toLowerCase()).join(", ") + ".";
      if (G.mode !== "foot") return "Descendez d'abord du véhicule pour décorer.";
      d.place(k);
      return `${ITEMS[k].name} posé devant vous.`;
    }
    case "armor_variant": {
      const id = String(target ?? "");
      if (id === "off") {
        armor.setStyle({ ...VARIANTS.royal.style });
        return "Retour à l'Armure Royale.";
      }
      const v = VARIANTS[id];
      if (!v) return "Armures spéciales : Or impériale, Spectre (invisible), Titan (robot géant).";
      if (G.mode === "ship" || G.mode === "car") return "Sortez d'abord du véhicule.";
      armor.setStyle({ ...v.style });
      if (!armor.worn) armor.equip();
      return id === "titan"
        ? "Titan en approche ! Robot géant de 15 mètres : 5 pour le canon, 1 pour la frappe au sol, Espace pour les réacteurs."
        : id === "spectre"
          ? "Armure Spectre : vous devenez invisible, même pour les autres joueurs."
          : `${v.name} : rayon et onde de choc géants.`;
    }
    case "armor_ability": {
      const n = normalize(String(target ?? ""));
      if (/training|entrainement|cible/.test(n)) {
        G.combat.spawnAround();
        return armor.worn ? "Cibles déployées. Touche 5 (ou « tire ») pour le rayon, 1 pour l'onde de choc." : "Cibles déployées. Activez l'armure (« active l'armure »), puis 5 pour tirer et 1 pour l'onde de choc.";
      }
      const name = /blast|rayon|tir|laser|attaque|feu/.test(n) ? "blast" : /bouclier|shield/.test(n) ? "shield" : /boost|surcharge|turbo|vitesse/.test(n) ? "boost" : /vision|nocturne|tactique/.test(n) ? "vision" : "pulse";
      if (!armor.worn) return "Activez d'abord l'Armure Royale (« active l'armure »), puis je déclenche l'attaque.";
      const ok = armor.ability(name);
      return ok ? { pulse: "Onde de choc libérée !", shield: "Bouclier déployé.", boost: "Surcharge : vitesse et saut augmentés.", vision: armor.vision ? "Vision tactique activée." : "Vision tactique désactivée.", blast: "Rayon d'énergie !" }[name]! : "Capacité indisponible pour le moment.";
    }
    case "set_time": {
      const n = normalize(String(target ?? ""));
      const num = /(\d{1,2})/.exec(n);
      const h = num ? +num[1] : /nuit|night|minuit/.test(n) ? 23 : /aube|dawn|lever|matin|morning/.test(n) ? 6.4 : /coucher|dusk|sunset|soir|evening/.test(n) ? 18.6 : 12.5;
      G.env.setHour(h);
      return `Il est maintenant ${fmtHour(h)} dans le royaume.`;
    }
    case "show_map":
      bus.emit("ui:map");
      return "Voici la carte du royaume.";
    case "set_view": {
      const n = normalize(String(target ?? ""));
      if (G.mode === "ship") {
        ship.view = /cockpit|first|premiere|interieur/.test(n) ? "cockpit" : /cine/.test(n) ? "cinematic" : "chase";
        return "Vue modifiée.";
      }
      G.player.view = /first|premiere|1/.test(n) ? "first" : "third";
      return G.player.view === "first" ? "Vue à la première personne." : "Vue à la troisième personne.";
    }
    case "mission_report": {
      const m = G.missions;
      const todo = m.defs.filter((d) => !m.isDone(d.id));
      return `Vous avez accompli ${m.completedCount()} missions sur ${m.defs.length}, niveau ${m.level()}, rang ${m.rankName()}. ${todo.length ? "Prochaines pistes : " + todo.slice(0, 3).map((d) => `${d.title} (${m.progressText(d.id)})`).join(" ; ") + "." : "Tout est accompli. Le royaume vous salue."}`;
    }
    case "start_mission": {
      const m = G.missions.defs.find((d) => d.id === target || normalize(d.title).includes(normalize(String(target ?? ""))));
      if (!m) return "Mission inconnue.";
      bus.emit("track", m.id);
      return `Mission suivie : ${m.title}. ${m.hint}`;
    }
    case "status_report": {
      const p = G.mode === "ship" ? ship.root.position : G.player.position;
      const parts = [`Vous êtes : ${G.world.zoneName(p)}.`, `Il est ${fmtHour(G.env.hour)}.`];
      if (G.mode === "ship") parts.push(`Royal Talon : ${Math.round(ship.speed * 3.6)} km/h, altitude ${Math.round(p.y)} mètres.`);
      else parts.push(ship.ready ? "Le Royal Talon est prêt au hangar." : "Le Royal Talon est au hangar, niveau 7.");
      parts.push(armor.worn ? `Armure portée, énergie ${Math.round(armor.energy * 100)} %.` : "L'armure est sur son socle, niveau 6.");
      return parts.join(" ");
    }
  }
  return "Action inconnue.";
}

export function gameSummary() {
  const p = G.mode === "ship" ? G.ship.root.position : G.player.position;
  return {
    lieu: G.world.zoneName(p),
    mode: G.mode,
    heure: fmtHour(G.env.hour),
    vaisseau: { prêt: G.ship.ready, moteurs: G.ship.engines, posé: G.ship.landed, vitesse_kmh: Math.round(G.ship.speed * 3.6), altitude: Math.round(G.ship.root.position.y) },
    armure: { portée: G.armor.worn, énergie: Math.round(G.armor.energy * 100) },
    missions: G.missions.defs.map((d) => `${d.title}: ${G.missions.isDone(d.id) ? "OK" : G.missions.progressText(d.id)}`),
    niveau: G.missions.level()
  };
}
