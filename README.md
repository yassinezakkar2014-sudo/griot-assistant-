# GRIOT 2.0 — The Royal Intelligence Universe

**THINK. SPEAK. RULE.**

GRIOT est un assistant IA personnel intégré dans un univers 3D explorable dans le navigateur. Vous avez votre propre palais royal futuriste, un vaisseau que vous pilotez vous-même et une armure high-tech. GRIOT vous accompagne partout : il vous comprend à la voix ou à l'écrit et agit **réellement** dans le monde (portes, ascenseur, vaisseau, armure, heure, déplacements).

> Univers original, inspiré de l'esthétique afrofuturiste. Aucun modèle, nom de personnage ou asset d'une franchise existante n'est utilisé. Le vaisseau (« Royal Talon ») et l'armure (« Armure Royale », nano-alliage) sont des créations originales.

---

## Démarrage rapide

```bash
npm install
cp .env.example .env      # puis renseignez OPENAI_API_KEY (optionnel)
npm run dev               # serveur + front en développement → http://localhost:3000
```

Production :

```bash
npm run build && npm start
```

- **Sans clé API**, le monde 3D, la sauvegarde et **toutes les commandes du royaume** fonctionnent (le parseur de commandes est local et marche hors ligne). La conversation libre, la voix neuronale et Whisper sont désactivés.
- **Avec `OPENAI_API_KEY`** : conversation en streaming, appels d'outils (le modèle déclenche lui-même les actions du jeu), recherche Internet, mémoire, gestion de projets, génération de documents Word, analyse d'images, voix neuronale et transcription Whisper.
- Navigateur conseillé : Chrome ou Edge (Web Speech API). Micro et caméra demandent `localhost` ou HTTPS.

## Ce que vous pouvez faire

### Le Palais royal (7 étages, entièrement explorables)
| Niveau | Salle | Interactions |
|---|---|---|
| 1 | Grand Hall Royal | Grande porte à double battant, escalier monumental, statues, écrans holographiques, trône du hall (on peut s'y asseoir) |
| 2 | Salle du Trône | Trône royal → **Interface du royaume** (heure, cycle jour/nuit, teinte des lumières, vaisseau, armure, voyage rapide, rapport) ; table holographique |
| 3 | Quartiers privés | Chambre (dormir → matin + sauvegarde), dressing (6 tenues à porter), cinéma (projection animée), salle de détente et salon (ambiance musicale), terrasse |
| 4 | Centre de commandement | Écrans géants en direct (carte, missions, systèmes, projets), console de commandement, **Archives royales** verrouillées |
| 5 | Laboratoire | 3 prototypes holographiques à analyser (améliorations réelles du vaisseau et de l'armure), bras robotisé, coffre |
| 6 | Armurerie | **Armure Royale** à inspecter sous tous les angles, activer, personnaliser et porter ; vitrines de variantes ; gadgets ; moto antigravité |
| 7 | Hangar royal | **Royal Talon**, portes du hangar, plate-forme de lancement |

Un **ascenseur réel** (cabine physique, portes palières) relie les étages : appelez-le, entrez, puis touche 1-7 ou E.

### Le Royal Talon
Entrez dans le cockpit (séquence cinématique), démarrez les moteurs, allumez les feux, décollez, pilotez librement, montez et descendez, accélérez, virez, atterrissez où vous voulez. Trois vues : cockpit (tableau de bord holographique), extérieure à la 3e personne et cinématique. Un **pilote automatique** permet à GRIOT de vous emmener où vous le demandez.

### Le monde (8 × 8 km)
Ville futuriste avec trafic aérien (est), jungle tropicale et temple ancien (sud), montagnes enneigées (nord), océan et plages (ouest), **base secrète** cachée, **vallée nocturne** bioluminescente, jardins royaux avec fontaines. Cycle jour/nuit complet.

### L'Armure Royale
Inspection orbitale, activation, transformation animée (le nano-alliage se matérialise depuis le torse), masque rétractable, personnalisation (couleur des circuits, alliage, motif, effet, intensité), 6 variantes à débloquer, et 4 capacités fictives : impulsion cinétique, bouclier hexagonal, surcharge, vision tactique.

### Missions & progression
9 missions facultatives (explorer une zone secrète, découvrir une technologie, tester un véhicule, débloquer une pièce, découvrir de nouvelles armures…), XP, niveaux, rangs, récompenses. **Sauvegarde automatique** (navigateur + serveur).

## Mettre GRIOT en ligne (Render, faisable depuis un iPad)

1. Créez un compte sur [render.com](https://render.com) (connexion avec GitHub).
2. **New → Blueprint**, choisissez le dépôt `griot-assistant-` : Render lit `render.yaml`.
3. Renseignez les deux secrets demandés :
   - `OPENAI_API_KEY` : votre clé OpenAI ;
   - `GRIOT_PASSWORD` : le mot de passe d'accès au site (obligatoire en pratique, sinon n'importe qui consomme votre clé).
4. **Apply**. Après quelques minutes, ouvrez l'adresse `https://griot-….onrender.com` dans Safari ; identifiant : ce que vous voulez, mot de passe : `GRIOT_PASSWORD`.

Notes : l'offre gratuite se met en veille après ~15 min d'inactivité (premier chargement lent). Son disque n'est pas permanent : la sauvegarde côté serveur (`data/`) est perdue à chaque redéploiement, la sauvegarde du navigateur reste. Micro et caméra fonctionnent, car Render fournit HTTPS.

## Moteur IA : OpenJarvis (optionnel)

GRIOT peut faire passer la conversation par [OpenJarvis](https://github.com/open-jarvis/OpenJarvis), un framework d'IA personnelle « local d'abord » qui expose une API compatible OpenAI (modèles locaux via Ollama, ou cloud).

```bash
# 1. Installer OpenJarvis (macOS / Linux / WSL2)
curl -fsSL https://open-jarvis.github.io/OpenJarvis/install.sh | bash

# 2. Lancer son serveur compatible OpenAI (port 8000 par défaut)
jarvis serve

# 3. Dans le .env de GRIOT
GRIOT_AI_BACKEND=openjarvis
OPENJARVIS_URL=http://127.0.0.1:8000/v1
OPENJARVIS_MODEL=qwen3.5:4b     # ou gpt-4o-mini si OpenJarvis utilise le moteur cloud
```

- La conversation, les appels d'outils et le streaming passent par OpenJarvis.
- La voix neuronale (TTS) et Whisper restent sur `OPENAI_API_KEY` ; sans cette clé, GRIOT utilise la voix du navigateur.
- Laissez `GRIOT_AI_BACKEND` vide pour revenir à OpenAI direct.

## Parler à GRIOT

Touche **T** (ou 🎙) pour parler, **Entrée** pour écrire. Options : conversation continue, mot d'éveil « GRIOT », interruption (parlez par-dessus GRIOT ou ⏹), 10 langues.

Exemples qui déclenchent de vraies actions :

- « GRIOT, ouvre les portes du garage. »
- « GRIOT, prépare le Royal Talon. »
- « GRIOT, active mon armure. » / « armure en violet » / « bouclier »
- « GRIOT, montre-moi la salle de contrôle. »
- « GRIOT, fais-moi un rapport sur mes projets. »
- « GRIOT, emmène-moi explorer la ville. » (embarquement, décollage et vol automatique)
- « fais la nuit », « montre la carte », « décolle », « atterris », « où suis-je ? »

Fonctions d'assistant conservées et étendues : recherche Internet (Tavily si clé, sinon DuckDuckGo + Wikipédia, avec sources), rédaction, analyse PDF / Word / Excel / CSV, génération de documents `.docx`, programmation, traduction, analyse d'images (fichier ou caméra), mémoire personnalisée, gestion de projets, modes **Personal, Business, Research, Creative, Coder**.

## Commandes clavier

| Action | Touche |
|---|---|
| Déplacement / courir / sauter | WASD / Maj / Espace |
| Interagir | E |
| Vue 1re / 3e personne | V (molette : distance caméra) |
| Carte · Missions · Menu | M · J · Échap |
| Parler · Écrire | T · Entrée |
| Armure : capacités · masque | 1 2 3 4 · X |
| **Vaisseau** : moteurs · poussée · virer | R · W/S · A/D |
| tangage · roulis · monter/descendre | souris ou ↑/↓ · Q/E · Espace/C |
| post-combustion · feux · atterrir · vue · sortir | Maj · L · H · V · F |

Sur mobile et tablette : joystick virtuel, zone de regard tactile et boutons dédiés (à pied et en vol).

## Architecture

```
server/            Node.js + Express
  index.js         API : /api/chat (SSE + outils), /api/tts, /api/stt, /api/upload, /api/documents,
                   /api/search, /api/memory, /api/projects, /api/save ; sert le front (Vite en dev)
  griot.js         personnalité, modes, outils (game_action, web_search, remember, manage_project, create_document)
  documents.js     extraction PDF/Word/Excel/CSV, génération .docx
  search.js        recherche Internet
  store.js         stockage JSON persistant (./data)
src/               TypeScript + Three.js (Vite)
  engine/          rendu (ciel, jour/nuit, bloom), physique AABB, entrées, sons WebAudio
  world/           palais, étages, portes, terrain, biomes, carte
  game/            joueur, vaisseau, armure, missions/sauvegarde, interactions
  ai/              GRIOT client : commandes locales, actions, voix, conversation en streaming
  ui/              HUD, panneaux, carte, menus, contrôles tactiles
```

Choix techniques :
- **Three.js en TypeScript, sans framework de jeu** : boucle de jeu explicite, contrôle total des performances. Tous les modèles (palais, vaisseau, armure, personnages) sont **générés en code** : aucun asset à télécharger, chargement en quelques secondes. Le pipeline accepte aussi des modèles glTF exportés de Blender si vous voulez remplacer les primitives.
- **Chargement progressif** : terrain généré par tranches, biomes construits un par un avec barre de progression, shaders précompilés ; intérieurs du palais affichés seulement autour de l'étage courant ; pool fixe de lumières.
- **Streaming SSE** plutôt que WebSockets : la réponse et les actions arrivent token par token sur une simple requête HTTP.
- **Stockage JSON** derrière une petite interface (`load/save/update`) : remplaçable par PostgreSQL sans toucher aux routes.

## Limites de cette version

- Les bâtiments de la ville sont des volumes (pas d'intérieurs) ; seul le palais est visitable de l'intérieur.
- La synchronisation labiale suit l'amplitude de la voix (avatar holographique), pas les phonèmes.
- La qualité de la voix navigateur dépend de l'OS ; la voix neuronale demande la clé API.
- Pour un déploiement public : ajoutez authentification, limites de requêtes et HTTPS. Ne publiez jamais `.env`.

L'ancienne interface (v0.1) est conservée dans `legacy/`.
