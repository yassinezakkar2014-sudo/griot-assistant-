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
  fly: /\b(emmene|amene|conduis|take me|fly|vole|volons|pilote|lleva|explor\w*|survol\w*|balade|voyag\w*|travel)\b/,
  ship: /\b(vaisseau|talon|ship|jet|avion|nave|chasseur|fighter|appareil|faucon)\b/,
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
  if (/\b(passager|monte avec|monter avec|embarque avec|je viens avec|rejoins \w+ en passager)\b/.test(t)) return { action: "ride", target: t.replace(/.*\b(avec|rejoins)\b/, "") };
  if (/\b(multi ?joueurs?|multiplayer|joueurs connectes|qui est (la|connecte)|mes amis|jouer avec)\b/.test(t)) return { action: "multiplayer" };
  if (/\b(tais.toi|silence|chut|stop talking|arrete de parler|calla)\b/.test(t)) return { action: "stop_voice" };
  if (/\b(diagnostic|diagnostique|diag|teste ton (cerveau|moteur|ia)|teste l ia|pourquoi tu (ne )?reponds pas)\b/.test(t)) return { action: "diag" };
  if (/^(aide|help|ayuda|que peux.tu faire|what can you do|commandes)\b/.test(t)) return { action: "help" };
  if (/\b(sauvegard\w*|save|guardar)\b/.test(t) && !/projet/.test(t)) return { action: "save" };
  // --- loisirs : météo, feux d'artifice, trésor, parc, yacht, courses, visite ---
  if (/\b(feux? d artifice|fireworks?)\b/.test(t)) return { action: "fireworks" };
  if (/\b(meteo|pluie|pleu\w*|neige|neiger|orage|eclairs?|aurores? (boreales?)?|beau temps|il fait beau|arrete la pluie|arrete la neige)\b/.test(t) && !/\b(armure|vaisseau)\b/.test(t)) {
    const w = /\baurore/.test(t) ? "aurora" : /\b(orage|eclair)/.test(t) ? "storm" : /\bneig/.test(t) && !/arrete/.test(t) ? "snow" : /\b(pluie|pleu)/.test(t) && !/arrete/.test(t) ? "rain" : "clear";
    return { action: "weather", target: w };
  }
  if (/\b(chasse au tresor|tresor|joyaux?|indice)\b/.test(t)) return { action: "treasure", target: /\b(indice|ou est|aide.moi)\b/.test(t) ? "hint" : /\b(recommence|rejouer|reset)\b/.test(t) ? "reset" : "start" };
  if (/\b(grande roue|montagnes? russes?|carrousel|manege|parc d attractions?|ile des attractions|fete foraine)\b/.test(t)) return { action: "teleport", target: "park" };
  if (/\b(yacht|bateau|marina|regate|navire|croisiere)\b/.test(t) || (/\bvoyage\b/.test(t) && /\b(vers|a|en|au|aux)\b/.test(t))) {
    if (/\bregate\b/.test(t)) return { action: "race", target: "mer" };
    if (/\b(furtif|invisible)\b/.test(t)) return { action: "yacht", target: "stealth" };
    if (/\b(supersonique|supersonic|mach)\b/.test(t)) return { action: "yacht", target: "sonic" };
    if (/\b(vers|voyage|cap sur|direction|emmene|va)\b/.test(t) && !/\b(le|du|au) (yacht|bateau)$/.test(t)) return { action: "yacht", target: "voyage:" + t };
    return { action: "yacht" };
  }
  // --- emotes ---
  if (/\b(emotes?|emoticones?)\b/.test(t)) return { action: "emote", target: "menu" };
  if (/^(danse|dance|fais (une )?danse|fais la fete)\b|\bdanse\b.*\b(avatar|personnage)\b/.test(t)) return { action: "emote", target: "dance" };
  if (/^(fais coucou|coucou|salue|dis bonjour de la main|fais signe)\b/.test(t)) return { action: "emote", target: "wave" };
  if (/^(applaudis|applaudir|bravo)\b/.test(t)) return { action: "emote", target: "clap" };
  if (/^(fais (une )?reverence|reverence|incline.toi)\b/.test(t)) return { action: "emote", target: "bow" };
  if (/^(victoire|fais la victoire|leve les bras)\b/.test(t)) return { action: "emote", target: "victory" };
  if (/^(salut militaire|garde a vous|salut royal)\b/.test(t)) return { action: "emote", target: "salute" };
  if (/^(muscles|montre tes muscles|fais les muscles)\b/.test(t)) return { action: "emote", target: "flex" };
  if (/^(rigole|ris|eclate.toi de rire|fais rire)\b/.test(t)) return { action: "emote", target: "laugh" };
  if (/\b(course|contre la montre|chrono)\b/.test(t) && !/\b(courses? au|faire les courses|eclair)\b/.test(t)) return { action: "race", target: /\b(aerienne|ciel|anneaux|vaisseau)\b/.test(t) ? "ciel" : /\b(mer|bateau|yacht)\b/.test(t) ? "mer" : /\b(arrete|stop|abandonne)\b/.test(t) ? "stop" : "route" };
  if (/\b(visite guidee|fais.moi visiter|visite du royaume|guide.moi|fais.moi la visite|stop visite|arrete la visite)\b/.test(t)) return { action: "tour", target: /\b(stop|arrete)\b/.test(t) ? "stop" : "start" };

  // --- cabine habitable du Royal Talon ---
  if (/\b(cabine|interieur du (vaisseau|talon|royal talon)|salon du vaisseau|chambre du vaisseau|appartement du vaisseau|cabin)\b/.test(t) || (/\b(tele|television|tv|chaine)\b/.test(t) && /\b(allume|mets|change|chaine)\w*\b/.test(t)) || /\b(je veux dormir|va dormir|dors dans le vaisseau)\b/.test(t)) {
    if (/\b(sors|sortir|quitte|quitter|exit)\b/.test(t)) return { action: "cabin", target: "exit" };
    if (/\b(tele|television|tv|chaine)\b/.test(t)) return { action: "cabin", target: "tv" };
    if (/\b(dors|dormir|sommeil|coucher|lit)\b/.test(t)) return { action: "cabin", target: "sleep" };
    return { action: "cabin", target: "enter" };
  }
  if (/\b(tiktok|tik tok)\b/.test(t) || (/\b(filme|filmer|enregistre)\b/.test(t) && /\b(video|partie|jeu|clip)\b/.test(t))) return { action: "tiktok", target: /\b(filme|filmer|enregistre|video)\b/.test(t) ? "rec" : "open" };
  if (/\b(invite|inviter)\b/.test(t) && /\b(amis?|joueurs?|bord|vaisseau|talon|tout le monde)\b/.test(t)) return { action: "invite" };
  if (/\b(monter ensemble|montons ensemble|a bord ensemble|on monte ensemble)\b/.test(t)) return { action: "aboard" };
  if (/\b(telephone|portable|smartphone|mon phone|royal phone)\b/.test(t) && !/\b(boutique|magasin|achete|va|emmene)\b/.test(t)) return { action: "phone" };
  if (/\b(avion|vol|aeroport|decoller en avion)\b/.test(t) && /\b(prends|prendre|monte|embarque|reserve|vole|vol pour|vol vers|avion pour|avion vers|en avion|billet)\b/.test(t)) return { action: "flight", target: t };
  if (/\b(avatar|personnage|apparence|coiffure|tenue|habits?|vetements?)\b/.test(t) && /\b(change|modifie|personnalis\w*|choisis|ouvre|nouveau|nouvelle)\b/.test(t)) return { action: "avatar" };
  if (/\b(appel video|appelle.moi|on s appelle|facetime|mode appel|appel avec griot|passe.moi un appel)\b/.test(t)) return { action: "call" };
  if (/\b(reconnaissance faciale|face ?id|administrateurs?|admins?|verrou facial)\b/.test(t)) return { action: "faceid" };
  if (/\b(super ?vitesse|super speed|vitesse eclair|mode flash|course eclair)\b/.test(t)) return { action: "super_speed", target: /\b(arrete|desactive|stop|enleve|coupe)\b/.test(t) ? "off" : "on" };
  if (/\bpilote auto(matique)?\b|\bautopilot\b|\bconduis.moi\b/.test(t)) return { action: "autopilot", target: /\b(arrete|desactive|stop|coupe)\b/.test(t) ? "off" : t };
  if (/\b(sors|sortir|sort|amene|apporte|donne)\b.*\b(voiture|bagnole|auto)\b|\bgarage (auto|automatique|imperial)\b/.test(t)) return { action: "garage", target: t };
  if (/\bportail (royal|magique)\b/.test(t)) return { action: "portal" };
  if (/\b(prends|prendre|monte dans|je prends) (le )?train\b|\btrain (pour|vers|jusqu)/.test(t)) return { action: "train", target: t };
  // --- espace ---
  if (/\b(retourne sur terre|rentre sur terre|redescends sur terre|quitte l espace|rentree atmospherique)\b/.test(t)) return { action: "space", target: "exit" };
  const goWord = V.go.test(t) || V.fly.test(t) || /\b(decolle|part|partons|direction|envoie|vise|cap sur)\b/.test(t);
  if (/\b(espace|orbite|cosmos|les etoiles|space)\b/.test(t) && !/\b(lune|station)\b/.test(t) && goWord) return { action: "space", target: "enter" };
  if (/\b(lune|station spatiale|station orbitale)\b/.test(t) && (goWord || /teleport/.test(t))) return { action: /teleport/.test(t) ? "teleport" : "fly_to", target: /lune/.test(t) ? "moon" : "station" };
  // --- décoration du palais (atelier royal) ---
  if (/\b(atelier|decor\w*|personnalis\w*|amenag\w*)\b/.test(t) && !/\b(pose|mets|ajoute|installe)\b/.test(t)) return { action: "deco", target: "open" };
  if (/\btheme\b/.test(t) || /\b(palais|murs?) (en )?(or|noir|jade|rose|glace|rubis|blanc)\b/.test(t)) return { action: "deco", target: "theme:" + t };
  if (/\b(enleve|retire|supprime)\b.*\b(objet|meuble|deco\w*|ca)\b/.test(t)) return { action: "deco", target: "remove" };
  if (/\b(tourne|pivote)\b.*\b(objet|meuble)\b/.test(t)) return { action: "deco", target: "rotate" };
  if (/\b(pose|mets|ajoute|installe|place|construis)\b/.test(t) && /\b(canape|sofa|trone|statue|fontaine|plante|fleur|lampe|piano|aquarium|bibliotheque|tele|ecran|tapis|colonne|pilier|arbre|drapeau|lit|table)\b/.test(t)) return { action: "deco", target: t };
  // petits vaisseaux du Palais des Princesses
  if (/\b(amethyste|turquoise)\b/.test(t) && !/\b(chambre|salle)\b/.test(t) && /\b(monte|entre|embarque|pilote|prends|prepare|vole)\w*\b/.test(t)) return { action: /prepare/.test(t) ? "prepare_ship" : "board_ship", target: t };
  // --- vaisseau ---
  if (/\b(anti.?aerien\w*|defense aerienne|dca|tourelles?|radar)\b/.test(t)) {
    if (/\b(test\w*|tir\w*|demonstration|demo|feu|spectacle)\b/.test(t)) return { action: "antiair", target: "test" };
    if (/\b(desactiv\w*|coupe|arrete|eteins|off)\b/.test(t)) return { action: "antiair", target: "off" };
    if (/\b(etat|statut|rapport|status)\b/.test(t)) return { action: "antiair", target: "status" };
    return { action: "antiair", target: "on" };
  }
  if (/\b(super ?soni\w*|mach|vitesse du son|mur du son)\b/.test(t)) {
    const pl = placeFromText(t);
    if (pl && pl.outdoor) return { action: "fly_to", target: pl.id + "|super" };
    return { action: "toggle_supersonic", target: /\b(desactiv\w*|coupe|arrete|ralenti\w*|off)\b/.test(t) ? "off" : "on" };
  }
  if (/\b(furtif|furtivite|invisible|camouflage|cache)\w*\b/.test(t) && /\bpalais\b/.test(t)) return { action: "palace_stealth", target: /\b(desactiv\w*|coupe|arrete|visible|reapparai\w*|montre|off)\b/.test(t) ? "off" : "on" };
  if (/\b(furtif|furtivite|camouflage|stealth|cloak)\b/.test(t) || (/\binvisible\b/.test(t) && V.ship.test(t))) return { action: "toggle_stealth", target: /\b(desactiv\w*|coupe|arrete|enleve|visible|off)\b/.test(t) ? "off" : "on" };
  if (/\b(decoll\w*|take ?off|despeg\w*|leve|en l air)\b/.test(t)) return { action: "takeoff" };
  if (/\b(atterri\w*|land|landing|aterriz\w*|pose.toi|pose le vaisseau)\b/.test(t)) return { action: "land" };
  if (/\b(prepar\w*|ready|apresta|prepara)\b/.test(t) && V.ship.test(t)) return { action: "prepare_ship", target: t };
  if (/\b(moteur|engine|motor|reacteur)s?\b/.test(t)) return /\b(coupe|eteins|arrete|stop|apaga|off)\b/.test(t) ? { action: "stop_engines" } : { action: "start_engines" };
  if (/\b(lumiere|feux|lights?|luces|eclairage)s?\b/.test(t) && (V.ship.test(t) || /\b(vaisseau|systeme)/.test(t))) return { action: "toggle_ship_lights" };
  if (/\b(sors|sortir|descends|exit|get out|quitte|salir)\b/.test(t) && (V.ship.test(t) || /cockpit|vehicule/.test(t))) return { action: "exit_vehicle" };
  if (/\b(monte|entre|embarque|board|get in|sube|installe)\w*\b/.test(t) && (V.ship.test(t) || /cockpit/.test(t))) return { action: "board_ship", target: t };
  if (/\b(monte|entre|conduis|conduire|prends|drive|installe|essaye|essayer)\w*\b/.test(t) && /\b(voiture|auto|adamas|car|bolide|berline|suv|coupe)\b/.test(t)) return { action: "board_car", target: t };
  if (/\b(sors|sortir|descends|exit|quitte)\b/.test(t) && /\b(voiture|auto|car)\b/.test(t)) return { action: "exit_vehicle" };

  // --- armures spéciales ---
  if (/\b(sors du titan|descends du titan|quitte le titan|enleve le robot|plus de robot|redeviens visible|deviens visible)\b/.test(t)) return { action: "armor_variant", target: "off" };
  if (/\b(titan|robot geant|mecha|robot de combat|transforme.toi en robot)\b/.test(t)) return { action: "armor_variant", target: "titan" };
  if (/\b(spectre|invisible|invisibilite)\b/.test(t) && !/\b(vaisseau|talon)\b/.test(t)) return { action: "armor_variant", target: "spectre" };
  if (/\b(armure (d or|doree|en or|imperiale)|or imperial)\b/.test(t)) return { action: "armor_variant", target: "imperial" };
  // --- armure ---
  if (V.armor.test(t)) {
    if (/\b(retire|enleve|remove|desactive|range|quita|take off)\w*\b/.test(t)) return { action: "remove_armor" };
    const color = Object.keys(COLORS).find((c) => new RegExp(`\\b${c}\\b`).test(t));
    if (/\b(couleur|color|colour|teinte|peins)\b/.test(t) || (color && !/\b(active|mets|porte)\b/.test(t))) return { action: "armor_color", target: color ?? t };
    if (/\b(montre|inspect\w*|regarde|voir|show)\b/.test(t)) return { action: "go_to_floor", target: "6" };
    return { action: "equip_armor" };
  }
  if (/\b(masque|mask|casque|helmet|mascara)\b/.test(t)) return { action: "toggle_mask" };
  if (/\b(entrainement|cibles?|champ de tir|target practice)\b/.test(t) && !/\bmission/.test(t)) return { action: "armor_ability", target: "training" };
  if (/\b(tire|tirer|feu|rayon|blast|laser|attaque|attaquer|repulseur|fire|shoot)\b/.test(t) && !/\b(feux|lumiere)\b/.test(t)) return { action: "armor_ability", target: "blast" };
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
