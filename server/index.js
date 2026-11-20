import express from "express";
import dotenv from "dotenv";
import OpenAI, { toFile } from "openai";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { chat, generatedDocs, memoryFacts, projects, upsertProject, MODES } from "./griot.js";
import { extractText } from "./documents.js";
import { webSearch } from "./search.js";
import { load, save, update } from "./store.js";

dotenv.config();
const DEV = process.argv.includes("--dev");
const app = express();
app.use(express.json({ limit: "15mb" }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const port = Number(process.env.PORT) || 3000;
const hasKey = () => Boolean(process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes("colle_ta_cle"));
const client = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Moteur de conversation : OpenAI direct (par défaut) ou OpenJarvis (`jarvis serve`),
// qui expose une API compatible OpenAI. La voix (TTS) et Whisper restent sur OpenAI.
const useJarvis = () => (process.env.GRIOT_AI_BACKEND || "").toLowerCase() === "openjarvis";
const hasChat = () => useJarvis() || hasKey();
const chatClient = () =>
  useJarvis()
    ? new OpenAI({
        baseURL: process.env.OPENJARVIS_URL || "http://127.0.0.1:8000/v1",
        apiKey: process.env.OPENJARVIS_API_KEY || "openjarvis",
      })
    : client();
const chatModel = () =>
  useJarvis() ? process.env.OPENJARVIS_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini" : process.env.OPENAI_MODEL || "gpt-4o-mini";

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ai: hasChat(), backend: useJarvis() ? "openjarvis" : "openai", tts: hasKey(), search: true, modes: Object.keys(MODES) });
});

// ---- Conversation (Server-Sent Events) ----
app.post("/api/chat", async (req, res) => {
  const { messages, mode = "personal", lang = "fr", game, image } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: "messages manquants" });
  if (!hasChat()) return res.status(503).json({ error: "OPENAI_API_KEY manquante" });

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
    await chat(chatClient(), { messages: clean, mode, lang, game, model: chatModel() }, (e, d) => {
      if (!closed) emit(e, d);
    });
    if (!closed) emit("done", {});
  } catch (error) {
    console.error("Erreur IA:", error?.message || error);
    if (!closed) emit("error", { message: "Erreur du moteur IA : " + (error?.message || "inconnue") });
  }
  res.end();
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
  if (!hasKey()) return res.status(503).json({ error: "STT serveur indisponible" });
  if (!req.file) return res.status(400).json({ error: "audio manquant" });
  try {
    const out = await client().audio.transcriptions.create({
      file: await toFile(req.file.buffer, "voice.webm", { type: req.file.mimetype || "audio/webm" }),
      model: "whisper-1",
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
  else if (!hasKey()) console.log("ℹ Pas de clé OPENAI_API_KEY : le monde 3D et les commandes locales fonctionnent, l'IA conversationnelle est désactivée.");
});
