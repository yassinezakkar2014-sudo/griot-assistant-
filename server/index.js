import express from "express";
import dotenv from "dotenv";
import OpenAI, { toFile } from "openai";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { chat, generatedDocs, memoryFacts, projects, upsertProject, MODES } from "./griot.js";
import { extractText } from "./documents.js";
import { webSearch } from "./search.js";
import { load, save, update } from "./store.js";

dotenv.config();
const DEV = process.argv.includes("--dev");
const app = express();
// Mot de passe d'accès (recommandé dès que GRIOT est en ligne) : définissez GRIOT_PASSWORD.
// Le navigateur affiche sa fenêtre de connexion ; l'identifiant peut être n'importe quoi.
const sameSecret = (a, b) => {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
};
app.use((req, res, next) => {
  const password = process.env.GRIOT_PASSWORD;
  if (!password || req.path === "/api/health") return next();
  const [scheme, encoded] = (req.headers.authorization || "").split(" ");
  const given = scheme === "Basic" && encoded ? Buffer.from(encoded, "base64").toString().split(":").slice(1).join(":") : "";
  if (given && sameSecret(given, password)) return next();
  res.set("WWW-Authenticate", 'Basic realm="GRIOT", charset="UTF-8"').status(401).send("Accès réservé.");
});
app.use(express.json({ limit: "15mb" }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const port = Number(process.env.PORT) || 3000;
const hasKey = () => Boolean(process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes("colle_ta_cle"));
const client = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Moteur de conversation, par ordre de priorité :
//   1. OpenJarvis (`GRIOT_AI_BACKEND=openjarvis`, serveur `jarvis serve`)
//   2. Groq (`GROQ_API_KEY`), API compatible OpenAI
//   3. OpenAI (`OPENAI_API_KEY`)
// La voix neuronale (TTS) reste sur OpenAI ; Whisper utilise OpenAI, sinon Groq.
const realKey = (k) => Boolean(k && !k.includes("colle_ta_cle"));
const hasGroq = () => realKey(process.env.GROQ_API_KEY);
const groq = () => new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" });
const useJarvis = () => (process.env.GRIOT_AI_BACKEND || "").toLowerCase() === "openjarvis";
const backend = () => (useJarvis() ? "openjarvis" : hasGroq() ? "groq" : hasKey() ? "openai" : "none");
const hasChat = () => backend() !== "none";
const hasSTT = () => hasKey() || hasGroq();
const chatClient = () =>
  useJarvis()
    ? new OpenAI({
        baseURL: process.env.OPENJARVIS_URL || "http://127.0.0.1:8000/v1",
        apiKey: process.env.OPENJARVIS_API_KEY || "openjarvis",
      })
    : hasGroq()
      ? groq()
      : client();
// Groq retire régulièrement des modèles : sans GROQ_MODEL, on interroge la liste des
// modèles du compte et on prend le meilleur disponible (résultat mis en cache).
const GROQ_PREFERRED = [
  "openai/gpt-oss-120b",
  "llama-3.3-70b-versatile",
  "moonshotai/kimi-k2-instruct-0905",
  "moonshotai/kimi-k2-instruct",
  "meta-llama/llama-4-maverick-17b-128e-instruct",
  "qwen/qwen3-32b",
  "openai/gpt-oss-20b",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "llama-3.1-8b-instant",
];
let groqModelCache = null;
function pickGroqModel(ids) {
  const usable = ids.filter((id) => !/whisper|guard|tts|orpheus|playai|distil|compound|prompt-guard/i.test(id));
  return GROQ_PREFERRED.find((m) => usable.includes(m)) || usable.sort()[0] || GROQ_PREFERRED[0];
}
async function groqModel() {
  if (process.env.GROQ_MODEL) return process.env.GROQ_MODEL;
  if (groqModelCache) return groqModelCache;
  try {
    const ids = [];
    for await (const m of groq().models.list()) if (m.active !== false) ids.push(m.id);
    groqModelCache = pickGroqModel(ids);
    console.log(`🧠 Modèle Groq choisi automatiquement : ${groqModelCache}`);
  } catch (e) {
    console.error("Liste des modèles Groq indisponible:", e.message);
    return GROQ_PREFERRED[0];
  }
  return groqModelCache;
}
const chatModel = async () => {
  const b = backend();
  if (b === "openjarvis") return process.env.OPENJARVIS_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
  if (b === "groq") return groqModel();
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
};

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ai: hasChat(), backend: backend(), tts: hasKey(), stt: hasSTT(), search: true, modes: Object.keys(MODES) });
});

// ---- Conversation (Server-Sent Events) ----
app.post("/api/chat", async (req, res) => {
  const { messages, mode = "personal", lang = "fr", game, image, brief = false } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: "messages manquants" });
  const userKey = userGroqKey(req);
  if (!hasChat() && !userKey) return res.status(503).json({ error: "Aucune clé d'IA : touchez 🔑 Clés IA et collez une clé Groq gratuite." });

  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const emit = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  let closed = false;
  res.on("close", () => (closed = true));

  // Nettoyage + image éventuelle attachée au dernier message utilisateur.
  const clean = messages.slice(-24).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content ?? "") }));
  if (typeof image === "string" && image.startsWith("data:image/")) {
    const last = clean[clean.length - 1];
    last.content = [{ type: "text", text: last.content }, { type: "image_url", image_url: { url: image } }];
  }
  try {
    await chatWithFallback({ messages: brief ? clean.slice(-10) : clean, mode, lang, game, brief: !!brief }, userKey, (e, d) => {
      if (!closed) emit(e, d);
    });
    if (!closed) emit("done", {});
  } catch (error) {
    console.error("Erreur IA:", error?.status || "", error?.message || error);
    if (!closed) emit("error", { message: explainAIError(error) });
  }
  res.end();
});

// ---- Moteurs de secours : si un moteur échoue AVANT d'avoir répondu, on essaie le suivant ----
/** Modèles disponibles pour la clé Groq de l'utilisateur (le meilleur, puis un léger), en cache 30 min.
 *  Si la liste échoue, l'erreur remonte : c'est la vraie raison (clé refusée, accès bloqué…). */
const userModelCache = new Map();
/** Modèles Groq qui voient les images (vision). */
const GROQ_VISION = ["meta-llama/llama-4-maverick-17b-128e-instruct", "meta-llama/llama-4-scout-17b-16e-instruct"];
async function userGroqModels(key, client) {
  const hit = userModelCache.get(key);
  if (hit && Date.now() - hit.at < 1800_000) return hit.models;
  const ids = [];
  for await (const m of client().models.list()) if (m.active !== false) ids.push(m.id);
  const best = pickGroqModel(ids);
  const light = ["llama-3.1-8b-instant", "openai/gpt-oss-20b", "meta-llama/llama-4-scout-17b-16e-instruct"].find((m) => ids.includes(m) && m !== best);
  const models = light ? [best, light] : [best];
  models.vision = GROQ_VISION.find((m) => ids.includes(m)) || GROQ_VISION[1];
  userModelCache.set(key, { at: Date.now(), models });
  return models;
}
let serverVisionCache = null;
async function groqVisionModel() {
  if (serverVisionCache) return serverVisionCache;
  try {
    const ids = [];
    for await (const m of groq().models.list()) if (m.active !== false) ids.push(m.id);
    serverVisionCache = GROQ_VISION.find((m) => ids.includes(m)) || GROQ_VISION[1];
  } catch {
    return GROQ_VISION[1];
  }
  return serverVisionCache;
}

/** Clé Groq collée par l'utilisateur dans GRIOT (bouton « Clés IA »), envoyée par son navigateur. */
function userGroqKey(req) {
  const k = String(req?.get?.("x-groq-key") || "").trim();
  return /^gsk_\w{20,}$/.test(k) ? k : "";
}

function engines(userKey = "", vision = false) {
  const list = [];
  // image jointe : modèles qui voient (Groq Llama 4, OpenAI gpt-4o-mini)
  if (vision) {
    if (userKey) {
      const c = () => new OpenAI({ apiKey: userKey, baseURL: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1" });
      list.push({ name: "Groq vision (votre clé)", client: c, model: () => userGroqModels(userKey, c).then((m) => m.vision) });
    }
    if (hasGroq()) list.push({ name: "Groq vision", client: groq, model: groqVisionModel });
    if (hasKey()) list.push({ name: "OpenAI", client, model: async () => process.env.OPENAI_MODEL || "gpt-4o-mini" });
    if (list.length) return list;
  }
  if (userKey) {
    const c = () => new OpenAI({ apiKey: userKey, baseURL: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1" });
    list.push({ name: "Groq (votre clé)", client: c, model: () => userGroqModels(userKey, c).then((m) => m[0]) });
    list.push({ name: "Groq (votre clé, léger)", client: c, model: () => userGroqModels(userKey, c).then((m) => m[1] || m[0]), light: true });
  }
  const b = backend();
  if (b === "openjarvis") list.push({ name: "OpenJarvis", client: chatClient, model: chatModel });
  if (hasGroq()) {
    list.push({ name: "Groq", client: groq, model: groqModel });
    // modèles Groq de secours, aux limites gratuites plus larges
    for (const m of ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"])
      list.push({ name: `Groq (${m})`, client: groq, model: async () => m, light: true });
  }
  if (hasKey()) list.push({ name: "OpenAI", client, model: async () => process.env.OPENAI_MODEL || "gpt-4o-mini" });
  return list;
}

async function chatWithFallback(payload, userKey, emit) {
  let lastError = null;
  const tried = new Set();
  const vision = payload.messages.some((m) => Array.isArray(m.content));
  for (const eng of engines(userKey, vision)) {
    let model;
    try {
      model = await eng.model();
    } catch (e) {
      console.error(`Moteur ${eng.name} : liste des modèles en échec :`, e?.status || "", e?.message || e);
      lastError = e;
      continue;
    }
    const id = eng.name.split(" (")[0] + (eng.name.includes("votre clé") ? "*" : "") + model;
    if (tried.has(id)) continue;
    tried.add(id);
    let answered = false;
    try {
      // modèles légers : contexte et réponse plus courts (limites des offres gratuites)
      const messages = eng.light ? payload.messages.slice(-6) : payload.messages;
      await chat(eng.client(), { ...payload, messages, model, maxTokens: eng.light ? 900 : 2000 }, (e, d) => {
        if (e === "token" || e === "action") answered = true;
        emit(e, d);
      });
      if (lastError) console.log(`✅ Réponse obtenue via ${eng.name} après un échec.`);
      return;
    } catch (e) {
      console.error(`Moteur ${eng.name} (${model}) en échec :`, e?.status || "", e?.message || e);
      if (answered) throw e;
      lastError = e;
      if (/decommission|model_not_found|does not exist/i.test(e?.message || "")) {
        groqModelCache = null;
        userModelCache.clear();
      }
    }
  }
  throw lastError || new Error("Aucun moteur d'IA configuré");
}

/** Message clair en français, avec la marche à suivre. */
function explainAIError(e) {
  const msg = String(e?.message || e || "");
  const status = e?.status;
  if (/ECONNREFUSED|ENOTFOUND|fetch failed|Connection error/i.test(msg))
    return useJarvis()
      ? "Le serveur OpenJarvis est injoignable. Sur Render, retirez la variable GRIOT_AI_BACKEND (ou corrigez OPENJARVIS_URL) pour utiliser Groq ou OpenAI."
      : "Le moteur d'IA est injoignable pour le moment (réseau). Réessayez dans un instant.";
  if (status === 401) return "Clé d'IA refusée (invalide ou révoquée). Recopiez-la en entier depuis console.groq.com/keys (ou créez-en une nouvelle), puis 🔑 Clés IA → Enregistrer.";
  if (status === 429 && /insufficient_quota|billing|quota/i.test(msg)) return "Le compte OpenAI n'a plus de crédit (Billing). Touchez 🔑 Clés IA et collez une clé Groq gratuite (console.groq.com/keys).";
  if (status === 429) return "Limite de requêtes atteinte chez le fournisseur d'IA (offre gratuite). Attendez une minute et réessayez.";
  if (status === 413) return "Demande trop longue pour le modèle gratuit. Effacez la conversation (bouton « Effacer ») puis réessayez.";
  if (status === 403) return `Accès refusé par le fournisseur d'IA (403). Vérifiez que la clé est active sur console.groq.com/keys (ou recréez-en une). Détail : ${msg.slice(0, 160)}`;
  if (status === 404 || /model_not_found|does not exist|decommission/i.test(msg)) return `Modèle d'IA indisponible (je vais en choisir un autre automatiquement). Détail : ${msg.slice(0, 160)}`;
  if (status === 400) return `Requête refusée par le fournisseur d'IA (400). Détail : ${msg.slice(0, 200)}`;
  if (!hasChat() && /^none$|Aucun moteur/.test(msg)) return "Aucune clé d'IA : touchez 🔑 Clés IA dans GRIOT et collez une clé Groq gratuite (ou ajoutez GROQ_API_KEY dans Render → Environment).";
  return `Erreur du moteur d'IA${status ? ` (${status})` : ""} : ${msg.slice(0, 200)}`;
}

// ---- Diagnostic : teste chaque moteur avec une mini-question ----
app.get("/api/diag", async (req, res) => {
  const results = [];
  const list = engines(userGroqKey(req)).filter((e) => !e.light || e.name.startsWith("Groq ("));
  if (!list.length) return res.json({ ok: false, results, advice: explainAIError(new Error("none")) });
  for (const eng of list) {
    const t0 = Date.now();
    let model = "?";
    try {
      model = await eng.model();
      await eng.client().chat.completions.create({ model, messages: [{ role: "user", content: "Réponds juste OK." }], max_tokens: 5 });
      results.push({ engine: eng.name, model, ok: true, ms: Date.now() - t0 });
    } catch (e) {
      results.push({ engine: eng.name, model, ok: false, status: e?.status ?? null, error: explainAIError(e) });
    }
  }
  res.json({ ok: results.some((r) => r.ok), backend: backend(), results });
});

// ---- Voix neuronale (TTS) ----
app.post("/api/tts", async (req, res) => {
  if (!hasKey()) return res.status(503).json({ error: "TTS serveur indisponible" });
  const { text, voice } = req.body || {};
  if (!text) return res.status(400).json({ error: "texte manquant" });
  try {
    const audio = await client().audio.speech.create({
      model: process.env.OPENAI_TTS_MODEL || "tts-1",
      voice: voice || process.env.OPENAI_TTS_VOICE || "onyx",
      input: String(text).slice(0, 4000),
      response_format: "mp3"
    });
    res.set("Content-Type", "audio/mpeg");
    res.send(Buffer.from(await audio.arrayBuffer()));
  } catch (e) {
    console.error("TTS:", e.message);
    res.status(500).json({ error: "TTS en échec" });
  }
});

// ---- Reconnaissance vocale serveur (navigateurs sans Web Speech) ----
app.post("/api/stt", upload.single("audio"), async (req, res) => {
  if (!hasSTT()) return res.status(503).json({ error: "STT serveur indisponible" });
  if (!req.file) return res.status(400).json({ error: "audio manquant" });
  try {
    const out = await (hasKey() ? client() : groq()).audio.transcriptions.create({
      file: await toFile(req.file.buffer, "voice.webm", { type: req.file.mimetype || "audio/webm" }),
      model: hasKey() ? "whisper-1" : "whisper-large-v3-turbo",
      language: (req.body.lang || "").slice(0, 2) || undefined
    });
    res.json({ text: out.text });
  } catch (e) {
    console.error("STT:", e.message);
    res.status(500).json({ error: "Transcription en échec" });
  }
});

// ---- Analyse de fichiers : PDF, Word, Excel, CSV, texte, images ----
app.post("/api/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "fichier manquant" });
  const { originalname, mimetype, buffer } = req.file;
  try {
    if (mimetype.startsWith("image/")) {
      return res.json({ name: originalname, kind: "image", image: `data:${mimetype};base64,${buffer.toString("base64")}` });
    }
    const out = await extractText(buffer, originalname, mimetype);
    res.json({ name: originalname, ...out });
  } catch (e) {
    console.error("Upload:", e.message);
    res.status(422).json({ error: "Impossible de lire ce fichier : " + e.message });
  }
});

app.get("/api/documents/:id", (req, res) => {
  const doc = generatedDocs.get(req.params.id);
  if (!doc) return res.status(404).send("Document expiré");
  const safe = doc.title.replace(/[^\w\- àâçéèêëîïôûùüÿñæœ]/gi, "").trim() || "document";
  res.set({
    "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safe)}.docx`
  });
  res.send(doc.buffer);
});

app.get("/api/search", async (req, res) => {
  res.json({ results: await webSearch(String(req.query.q || ""), String(req.query.lang || "fr")) });
});

// ---- Mémoire personnalisée ----
app.get("/api/memory", (_req, res) => res.json({ facts: memoryFacts() }));
app.post("/api/memory", (req, res) => {
  const fact = String(req.body?.fact || "").trim();
  if (!fact) return res.status(400).json({ error: "fait manquant" });
  res.json(update("memory", { facts: [] }, (db) => void db.facts.push({ text: fact, at: Date.now() })));
});
app.delete("/api/memory/:index", (req, res) => {
  res.json(update("memory", { facts: [] }, (db) => void db.facts.splice(Number(req.params.index), 1)));
});

// ---- Projets ----
app.get("/api/projects", (_req, res) => res.json({ projects: projects() }));
app.post("/api/projects", (req, res) => {
  if (!req.body?.name) return res.status(400).json({ error: "nom manquant" });
  res.json({ project: upsertProject(req.body) });
});
app.delete("/api/projects/:id", (req, res) => {
  res.json(update("projects", { projects: [] }, (db) => void (db.projects = db.projects.filter((p) => p.id !== req.params.id))));
});

// ---- Sauvegarde de progression ----
app.get("/api/save", (_req, res) => res.json(load("save", { save: null })));
app.put("/api/save", (req, res) => {
  save("save", { save: req.body?.save ?? null, at: Date.now() });
  res.json({ ok: true });
});

// ---- Front-end ----
if (DEV) {
  const { createServer } = await import("vite");
  const vite = await createServer({ server: { middlewareMode: true }, appType: "spa" });
  app.use(vite.middlewares);
} else {
  const dist = path.resolve("dist");
  if (!fs.existsSync(dist)) {
    console.warn("⚠ Dossier dist absent : lance `npm run build` (ou `npm run dev`).");
  }
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(port, () => {
  console.log(`GRIOT 2.0 — THINK. SPEAK. RULE. → http://localhost:${port}${DEV ? " (dev)" : ""}`);
  if (useJarvis()) console.log(`🧠 Moteur IA : OpenJarvis → ${process.env.OPENJARVIS_URL || "http://127.0.0.1:8000/v1"}`);
  else if (hasGroq()) console.log(`🧠 Moteur IA : Groq (${process.env.GROQ_MODEL || "modèle choisi automatiquement"})`);
  else if (!hasKey()) console.log("ℹ Pas de clé OPENAI_API_KEY : le monde 3D et les commandes locales fonctionnent, l'IA conversationnelle est désactivée.");
});
