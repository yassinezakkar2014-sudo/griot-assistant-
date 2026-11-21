// Cerveau de GRIOT : personnalité, modes, outils (actions de jeu, recherche, mémoire, projets, documents).
import { webSearch } from "./search.js";
import { load, update } from "./store.js";
import { markdownToDocx } from "./documents.js";
import crypto from "node:crypto";

export const GAME_ACTIONS = [
  "aisam_on", "aisam_off", "open_door", "close_door", "go_to_floor", "teleport", "fly_to", "prepare_ship", "board_ship", "start_engines",
  "toggle_ship_lights", "toggle_stealth", "toggle_supersonic", "antiair", "cabin", "ride", "board_car", "takeoff", "land", "exit_vehicle", "equip_armor", "remove_armor", "armor_color",
  "armor_ability", "armor_variant", "space", "deco", "call", "train", "flight", "avatar", "phone", "toggle_mask", "set_time", "show_map", "set_view", "mission_report", "start_mission", "status_report"
];

export const MODES = {
  personal: "Mode PERSONAL : chaleureux, proche, attentif à la vie et aux objectifs de l'utilisateur.",
  business: "Mode BUSINESS : stratège exécutif. Structure, chiffres, risques, décisions, plans d'action concrets.",
  research: "Mode RESEARCH : chercheur rigoureux. Utilise la recherche Internet quand l'information peut être récente, cite tes sources (URL), distingue faits et hypothèses.",
  creative: "Mode CREATIVE : directeur artistique et écrivain. Idées audacieuses, style riche, propositions multiples.",
  coder: "Mode CODER : ingénieur logiciel senior. Code correct, complet, commenté, en blocs Markdown avec le langage. Explique les choix brièvement."
};

const PERSONA = `Tu es GRIOT — slogan « THINK. SPEAK. RULE. ».
Tu es l'intelligence centrale d'un royaume technologique : conseiller royal, copilote, gestionnaire du palais et assistant personnel de ton utilisateur (que tu peux appeler « Majesté » de temps en temps, sans excès).
Personnalité : intelligent, naturel, charismatique, professionnel, fidèle ; de l'humour léger quand le contexte s'y prête.
Tu réponds dans la langue de l'utilisateur. Tes réponses vocales doivent être fluides et pas trop longues ; pour les tâches de fond (rédaction, code, analyse), sois complet et structuré en Markdown.
Le monde 3D est réel pour toi : quand l'utilisateur demande d'agir dans le royaume (ouvrir une porte, préparer ou faire décoller le vaisseau, activer l'armure, aller à un étage, explorer une zone, changer l'heure…), appelle l'outil game_action — n'invente pas que c'est fait sans l'appeler.
Un grand pont royal suspendu relie le royaume au pays de Zuria (target bridge pour teleport). Le grand monde compte aussi 10 pays lointains (Solaria, Nordhaven, Jadéa, Océane, Vulkara, Sylvanie, Kemetia, Cristallis, Ambrelune, Savanor) : fly_to ou teleport avec leur nom ; Nouvelle Métropole (target metro). Attaques de l'armure : armor_ability blast (rayon), pulse (onde de choc), training (cibles). Armures spéciales : armor_variant imperial|spectre|titan|off (titan = robot géant de 15 m). Espace : space enter|exit, fly_to moon|station. Décoration du palais : deco avec target « theme:or » (or, noir, jade, rose, glace, rubis, royal), un objet (statue, piano, fontaine, trône…), remove, rotate, open. 21 pays au total (dont la Cité des Princesses, avec le grand Palais des Princesses : deux chambres, piscine, spa, cinéma — teleport/fly_to « princesses »), un train royal à grande vitesse (action train, target = destination : zuria, palais royal, ville futuriste), appel vidéo (action call), des aéroports (Aéroport Royal et aéroport de la Cité des Princesses) avec avions de ligne : action flight avec target « princesses », « royal » ou « panoramique », éditeur d'avatar (action avatar), le Royal Mall (centre commercial de la ville avec la boutique ROYAL PHONE : teleport « mall »), un téléphone pour discuter et s'appeler en vidéo entre joueurs (action phone) (dont Glacéa, Sahrane, Tropica, Mirabel, Pyros, Verdania, Orakis, Lumina, Rubis, Zambara). Tu peux voir par la caméra de l'utilisateur quand il t'envoie une image : décris, traduis, résous. Lieux du royaume : palais (7 étages : 1 Grand Hall, 2 Salle du Trône, 3 Quartiers privés, 4 Centre de commandement, 5 Laboratoire, 6 Armurerie, 7 Hangar royal), jardins royaux, ville futuriste, jungle, montagnes, océan, base secrète.
Le vaisseau personnel s'appelle le « Royal Talon » : un vaisseau colossal avec une cabine habitable (salon, télé, bar-cuisine, chambre) — action cabin avec target enter|exit|tv|sleep ; l'armure s'appelle l'« Armure Royale » (nano-alliage, motifs lumineux).
Le jeu 3D s'appelle le module AISAM : il s'affiche dans l'interface quand on dit « active AISAM » (action aisam_on).
Ne prétends jamais être un personnage officiel d'une franchise existante.`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "game_action",
      description: "Déclenche une action réelle dans l'univers 3D de GRIOT.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: GAME_ACTIONS },
          target: {
            type: "string",
            description:
              "Paramètre : étage 1-7 pour go_to_floor ; garage|hall|throne|… pour open_door ; city|jungle|mountains|ocean|base|palace|gardens|night pour teleport (instantané) ou fly_to (vol en Royal Talon : « emmène-moi… ») ; day|night|dusk pour set_time ; first|third pour set_view ; une couleur (nom ou #hex) pour armor_color ; pulse|shield|boost|vision|blast|training pour armor_ability ; id de mission pour start_mission."
          }
        },
        required: ["action"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Recherche des informations récentes sur Internet.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }
    }
  },
  {
    type: "function",
    function: {
      name: "remember",
      description: "Mémorise durablement un fait, une préférence ou un objectif de l'utilisateur.",
      parameters: { type: "object", properties: { fact: { type: "string" } }, required: ["fact"] }
    }
  },
  {
    type: "function",
    function: {
      name: "manage_project",
      description: "Crée ou met à jour un projet de l'utilisateur (gestion de projets).",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          status: { type: "string", enum: ["idée", "en cours", "en pause", "terminé"] },
          note: { type: "string", description: "Note ou avancement à ajouter" },
          task: { type: "string", description: "Tâche à ajouter" },
          complete_task: { type: "string", description: "Tâche à marquer comme faite" }
        },
        required: ["name"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_document",
      description: "Génère un document Word (.docx) téléchargeable à partir d'un contenu Markdown.",
      parameters: {
        type: "object",
        properties: { title: { type: "string" }, markdown: { type: "string" } },
        required: ["title", "markdown"]
      }
    }
  }
];

// Documents générés, gardés en mémoire pour téléchargement (1 h).
export const generatedDocs = new Map();

export function memoryFacts() {
  return load("memory", { facts: [] }).facts;
}

export function projects() {
  return load("projects", { projects: [] }).projects;
}

export function upsertProject({ name, status, note, task, complete_task }) {
  let result;
  update("projects", { projects: [] }, (db) => {
    let p = db.projects.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!p) {
      p = { id: crypto.randomUUID(), name, status: "idée", notes: [], tasks: [], created: Date.now() };
      db.projects.push(p);
    }
    if (status) p.status = status;
    if (note) p.notes.push({ text: note, at: Date.now() });
    if (task) p.tasks.push({ text: task, done: false });
    if (complete_task) {
      const t = p.tasks.find((x) => x.text.toLowerCase().includes(complete_task.toLowerCase()));
      if (t) t.done = true;
    }
    p.updated = Date.now();
    result = p;
  });
  return result;
}

export function systemPrompt({ mode = "personal", lang = "fr", game } = {}) {
  const facts = memoryFacts();
  const proj = projects();
  const parts = [PERSONA, MODES[mode] || MODES.personal, `Langue d'interface préférée : ${lang}.`];
  parts.push(`Date du jour : ${new Date().toLocaleDateString("fr-FR", { dateStyle: "full" })}.`);
  if (facts.length) parts.push("Ce que tu sais de l'utilisateur :\n" + facts.map((f) => `- ${f.text}`).join("\n"));
  if (proj.length)
    parts.push(
      "Projets de l'utilisateur :\n" +
        proj
          .map((p) => {
            const open = p.tasks.filter((t) => !t.done).map((t) => t.text);
            return `- ${p.name} [${p.status}]${open.length ? ` — à faire : ${open.join("; ")}` : ""}${
              p.notes.length ? ` — dernière note : ${p.notes.at(-1).text}` : ""
            }`;
          })
          .join("\n")
    );
  if (game) parts.push("État actuel du jeu (JSON) : " + JSON.stringify(game).slice(0, 1500));
  return parts.join("\n\n");
}

async function runTool(name, args, ctx) {
  switch (name) {
    case "game_action":
      ctx.emit("action", { action: args.action, target: args.target ?? null });
      return { ok: true, info: "Action transmise au monde 3D." };
    case "web_search": {
      ctx.emit("status", { text: `Recherche : ${args.query}` });
      const results = await webSearch(args.query, ctx.lang);
      ctx.emit("sources", { results: results.slice(0, 6) });
      return { results };
    }
    case "remember":
      update("memory", { facts: [] }, (db) => {
        if (!db.facts.some((f) => f.text === args.fact)) db.facts.push({ text: args.fact, at: Date.now() });
      });
      ctx.emit("memory", { fact: args.fact });
      return { ok: true };
    case "manage_project": {
      const p = upsertProject(args);
      ctx.emit("project", { project: p });
      return { ok: true, project: p };
    }
    case "create_document": {
      const id = crypto.randomUUID();
      const buffer = await markdownToDocx(args.title, args.markdown);
      generatedDocs.set(id, { title: args.title, buffer, at: Date.now() });
      setTimeout(() => generatedDocs.delete(id), 3600_000).unref?.();
      const url = `/api/documents/${id}`;
      ctx.emit("document", { title: args.title, url });
      return { ok: true, url };
    }
    default:
      return { error: "outil inconnu" };
  }
}

// Conversation en streaming avec boucle d'outils.
export async function chat(client, { messages, mode, lang, game, model, maxTokens = 2000, brief = false }, emit) {
  const sys = systemPrompt({ mode, lang, game }) + (brief ? "\n\nAPPEL EN DIRECT : tu es en conversation vocale, comme au téléphone. Réponds en 1 à 3 phrases courtes et naturelles, sans Markdown, sans listes, sans emojis. Va droit au but, avec chaleur." : "");
  const convo = [{ role: "system", content: sys }, ...messages];
  const ctx = { emit, lang };
  for (let step = 0; step < 5; step++) {
    const stream = await client.chat.completions.create({
      model,
      messages: convo,
      tools: TOOLS,
      stream: true,
      max_tokens: brief ? Math.min(maxTokens, 400) : maxTokens,
      temperature: mode === "creative" ? 0.95 : 0.6,
      // modèles qui « réfléchissent » (gpt-oss) : raisonnement court = réponse beaucoup plus rapide
      ...(/gpt-oss/.test(model) ? { reasoning_effort: brief ? "low" : "medium" } : {})
    });
    let content = "";
    const calls = [];
    let finish = null;
    for await (const chunk of stream) {
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      const d = choice.delta || {};
      if (d.content) {
        content += d.content;
        emit("token", { text: d.content });
      }
      for (const tc of d.tool_calls || []) {
        const slot = (calls[tc.index] ||= { id: "", name: "", args: "" });
        if (tc.id) slot.id = tc.id;
        if (tc.function?.name) slot.name += tc.function.name;
        if (tc.function?.arguments) slot.args += tc.function.arguments;
      }
      if (choice.finish_reason) finish = choice.finish_reason;
    }
    if (!calls.length || finish !== "tool_calls") return content;
    convo.push({
      role: "assistant",
      content: content || null,
      tool_calls: calls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.args } }))
    });
    for (const c of calls) {
      let args = {};
      try {
        args = JSON.parse(c.args || "{}");
      } catch {}
      let out;
      try {
        out = await runTool(c.name, args, ctx);
      } catch (e) {
        out = { error: e.message };
      }
      convo.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(out).slice(0, 12000) });
    }
  }
  return "";
}
