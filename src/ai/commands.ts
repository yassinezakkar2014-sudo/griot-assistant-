// Compréhension locale des commandes (FR / EN / ES) — instantanée et hors-ligne.
// Les demandes qui ne sont pas des commandes du royaume partent vers le modèle d'IA.
import { normalize } from "../core";
import { COLORS, floorFromText, placeFromText } from "./actions";

export interface Intent {
  action: string;
  target?: string | null;
}

const V = {
  open: /\b(ouvr\w*|open\w*|abre|abrir|deverrouill\w*|unlock)\b/,
  close: /\b(ferm\w*|close|cierra|cerrar|verrouill\w*)\b/,
  go: /\b(va|vais|aller|allons|amene|emmene|conduis|monte|descends|go|take|bring|show|montre|affiche|ve|lleva|muestra|direction|rends|rejoins|teleport\w*)\b/,
  fly: /\b(emmene|amene|conduis|take me|fly|vole|volons|pilote|lleva|explor\w*|survol\w*|balade)\b/,
  ship: /\b(vaisseau|talon|ship|jet|avion|nave|chasseur|fighter|appareil)\b/,
  armor: /\b(armure|armor|armour|suit|combinaison|armadura|tenue de combat)\b/
};

function clause(raw: string): Intent | null {
  const t = normalize(raw).replace(/^(griot|grio|hey griot|ok griot|dis griot)[ ,]*/, "");
  if (!t) return null;

  // module de jeu AISAM (variantes fréquentes de la reconnaissance vocale)
  const AISAM = /\b(aisam|a isam|aissam|aysam|eisam|haisam|isam|issam|aizam|ai sam|a sam|et sam|hey sam)\b/;
  if (AISAM.test(t)) {
    if (/\b(desactiv\w*|ferme\w*|quitt\w*|arret\w*|stop|eteins|veille|close|exit|deactivate)\b/.test(t)) return { action: "aisam_off" };
    return { action: "aisam_on" };
  }
  if (/\b(multi ?joueurs?|multiplayer|joueurs connectes|qui est (la|connecte)|mes amis|jouer avec)\b/.test(t)) return { action: "multiplayer" };
  if (/\b(tais.toi|silence|chut|stop talking|arrete de parler|calla)\b/.test(t)) return { action: "stop_voice" };
  if (/^(aide|help|ayuda|que peux.tu faire|what can you do|commandes)\b/.test(t)) return { action: "help" };
  if (/\b(sauvegard\w*|save|guardar)\b/.test(t) && !/projet/.test(t)) return { action: "save" };

  // --- vaisseau ---
  if (/\b(decoll\w*|take ?off|despeg\w*|leve|en l air)\b/.test(t)) return { action: "takeoff" };
  if (/\b(atterri\w*|land|landing|aterriz\w*|pose.toi|pose le vaisseau)\b/.test(t)) return { action: "land" };
  if (/\b(prepar\w*|ready|apresta|prepara)\b/.test(t) && V.ship.test(t)) return { action: "prepare_ship" };
  if (/\b(moteur|engine|motor|reacteur)s?\b/.test(t)) return /\b(coupe|eteins|arrete|stop|apaga|off)\b/.test(t) ? { action: "stop_engines" } : { action: "start_engines" };
  if (/\b(lumiere|feux|lights?|luces|eclairage)s?\b/.test(t) && (V.ship.test(t) || /\b(vaisseau|systeme)/.test(t))) return { action: "toggle_ship_lights" };
  if (/\b(sors|sortir|descends|exit|get out|quitte|salir)\b/.test(t) && (V.ship.test(t) || /cockpit|vehicule/.test(t))) return { action: "exit_vehicle" };
  if (/\b(monte|entre|embarque|board|get in|sube|installe)\w*\b/.test(t) && (V.ship.test(t) || /cockpit/.test(t))) return { action: "board_ship" };
  if (/\b(monte|entre|conduis|conduire|prends|drive|installe|essaye|essayer)\w*\b/.test(t) && /\b(voiture|auto|adamas|car|bolide|berline|suv|coupe)\b/.test(t)) return { action: "board_car", target: t };
  if (/\b(sors|sortir|descends|exit|quitte)\b/.test(t) && /\b(voiture|auto|car)\b/.test(t)) return { action: "exit_vehicle" };

  // --- armure ---
  if (V.armor.test(t)) {
    if (/\b(retire|enleve|remove|desactive|range|quita|take off)\w*\b/.test(t)) return { action: "remove_armor" };
    const color = Object.keys(COLORS).find((c) => new RegExp(`\\b${c}\\b`).test(t));
    if (/\b(couleur|color|colour|teinte|peins)\b/.test(t) || (color && !/\b(active|mets|porte)\b/.test(t))) return { action: "armor_color", target: color ?? t };
    if (/\b(montre|inspect\w*|regarde|voir|show)\b/.test(t)) return { action: "go_to_floor", target: "6" };
    return { action: "equip_armor" };
  }
  if (/\b(masque|mask|casque|helmet|mascara)\b/.test(t)) return { action: "toggle_mask" };
  if (/\b(impulsion|pulse|onde de choc|shockwave)\b/.test(t)) return { action: "armor_ability", target: "pulse" };
  if (/\b(bouclier|shield|escudo)\b/.test(t)) return { action: "armor_ability", target: "shield" };
  if (/\b(surcharge|boost|turbo)\b/.test(t)) return { action: "armor_ability", target: "boost" };
  if (/\bvision (tactique|nocturne)|night vision|tactical vision\b/.test(t)) return { action: "armor_ability", target: "vision" };

  // --- barrières : « active » = la lever (fermer le passage), « coupe » = l'abaisser
  if (/\bbarrieres?\b/.test(t) && /\b(active|activer|leve|lever|monte|allume|dresse|securise)\w*\b/.test(t)) return { action: "close_door", target: t };
  if (/\bbarrieres?\b/.test(t) && /\b(coupe|couper|baisse|baisser|desactive|eteins|abaisse)\w*\b/.test(t)) return { action: "open_door", target: t };
  // --- portes ---
  if (V.open.test(t) && /\b(porte|portes|door|doors|puerta|garage|hangar|terrasse|chambre|cinema|archives?|coffre|dressing|spa|ascenseur|elevator|barrieres?|remparts?|portails?|muraille|enceinte)\b/.test(t)) return { action: "open_door", target: t };
  if (V.close.test(t) && /\b(porte|portes|door|doors|puerta|garage|hangar|terrasse|chambre|cinema|archives?|coffre|dressing|spa|barrieres?|remparts?|portails?|muraille|enceinte)\b/.test(t)) return { action: "close_door", target: t };
  if (/\b(appelle|call)\b.*\b(ascenseur|elevator)/.test(t)) return { action: "open_door", target: "ascenseur" };

  // --- temps ---
  if (/\b(fais|mets|passe|make|set|change|pon)\b.*\b(nuit|night|jour|day|matin|soir|aube|coucher|midi|noche|dia)\b/.test(t) || /^(nuit|jour|night|day)$/.test(t)) return { action: "set_time", target: t };
  if (/\b(quelle heure|what time|que hora)\b/.test(t)) return { action: "status_report" };

  // --- carte & vues ---
  if (/\b(carte|map|mapa)\b/.test(t)) return { action: "show_map" };
  if (/\b(premiere personne|first person|vue fps|primera persona)\b/.test(t)) return { action: "set_view", target: "first" };
  if (/\b(troisieme personne|third person|tercera persona|vue exterieure)\b/.test(t)) return { action: "set_view", target: "third" };
  if (/\bvue (cockpit|cinematique)\b/.test(t)) return { action: "set_view", target: t };

  // --- rapports ---
  if (/\b(rapport|report|bilan|point|resume|informe)\b/.test(t) && /\b(projet|project|proyecto)s?\b/.test(t)) return { action: "project_report" };
  if (/\b(rapport|report|bilan|progression|informe)\b/.test(t) && /\bmissions?\b/.test(t)) return { action: "mission_report" };
  if (/\b(rapport|statut|status|etat)\b.*\b(royaume|systeme|situation|vaisseau|armure)\b/.test(t)) return { action: "status_report" };
  if (/^(ou suis.je|where am i|donde estoy)/.test(t)) return { action: "status_report" };

  // --- déplacements (phrases courtes uniquement, pour ne pas confondre avec une question) ---
  if (t.split(" ").length > 9) return null;
  const place = placeFromText(t);
  if (place && (V.fly.test(t) || V.go.test(t))) {
    if (/teleport/.test(t)) return { action: "teleport", target: place.id };
    if (place.outdoor && place.id !== "gardens" && V.fly.test(t)) return { action: "fly_to", target: place.id };
    return { action: "teleport", target: place.id };
  }
  if (V.go.test(t) || /\b(etage|niveau|floor|level|salle|room)\b/.test(t)) {
    const f = floorFromText(t);
    if (f >= 0 && (/\b(etage|niveau|floor|level|salle|room|piso)\b/.test(t) || V.go.test(t))) return { action: "go_to_floor", target: String(f + 1) };
  }
  return null;
}

/** Découpe « prépare le vaisseau et ouvre le garage » en plusieurs intentions. */
export function parseCommands(text: string): Intent[] {
  const parts = normalize(text).split(/\s*(?:,? et puis |,? puis |,? ensuite |,? et | then | and | y luego | y )\s*/);
  const out: Intent[] = [];
  for (const p of parts) {
    const i = clause(p);
    if (i) out.push(i);
  }
  // une phrase de conversation contenant un mot-clé isolé ne doit pas être volée au modèle
  if (out.length && parts.length > out.length + 1) return [];
  return out;
}
