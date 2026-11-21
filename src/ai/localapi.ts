// Mode « sans serveur » (site web, iPad) : les routes /api sont servies dans le navigateur.
// Mémoire, projets et sauvegarde → stockage local. Avec une clé OpenAI enregistrée par l'utilisateur,
// la conversation (streaming + outils), la voix neuronale et Whisper appellent OpenAI directement.
import { PERSONA, MODE_RULES, GAME_ACTIONS } from "./persona";

const OPENAI_KEY = "griot-openai-key";
export function getOpenAIKey(): string {
  try {
    return localStorage.getItem(OPENAI_KEY) || "";
  } catch {
    return "";
  }
}
export function setOpenAIKey(k: string) {
  try {
    if (k) localStorage.setItem(OPENAI_KEY, k.trim());
    else localStorage.removeItem(OPENAI_KEY);
  } catch {}
}
const GROQ_KEY = "griot-groq-key";
/** Clé Groq (gratuite) enregistrée dans ce navigateur. */
export function getGroqKey(): string {
  try {
    return localStorage.getItem(GROQ_KEY) || "";
  } catch {
    return "";
  }
}
export function setGroqKey(k: string) {
  try {
    if (k) localStorage.setItem(GROQ_KEY, k.trim());
    else localStorage.removeItem(GROQ_KEY);
  } catch {}
}
/** Meilleure clé d'IA du navigateur : Groq (gratuite) d'abord, sinon OpenAI. */
export function browserAIKey(): string {
  return getGroqKey() || getOpenAIKey();
}
/** En-têtes à joindre aux appels du serveur GRIOT (la clé Groq de l'utilisateur, si présente). */
export function aiHeaders(): Record<string, string> {
  const g = getGroqKey();
  return g ? { "X-Groq-Key": g } : {};
}
const GROQ = "https://api.groq.com/openai/v1";
const GROQ_MODEL = "llama-3.3-70b-versatile";
let realFetch: typeof fetch = (...a) => fetch(...a);
const OA = "https://api.openai.com/v1";

const KEY = "griot-local-api";
type DB = { facts: { text: string; at: number }[]; projects: any[]; save: any };

function read(): DB {
  try {
    return { facts: [], projects: [], save: null, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return { facts: [], projects: [], save: null };
  }
}
function write(db: DB) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {}
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

function upsert(db: DB, b: any) {
  let p = db.projects.find((x) => x.name.toLowerCase() === String(b.name).toLowerCase());
  if (!p) {
    p = { id: Math.random().toString(36).slice(2), name: String(b.name), status: "idée", notes: [], tasks: [], created: Date.now() };
    db.projects.push(p);
  }
  if (b.status) p.status = b.status;
  if (b.note) p.notes.push({ text: b.note, at: Date.now() });
  if (b.task) p.tasks.push({ text: b.task, done: false });
  if (b.complete_task) {
    const t = p.tasks.find((x: any) => x.text.toLowerCase().includes(String(b.complete_task).toLowerCase()));
    if (t) t.done = true;
  }
  p.updated = Date.now();
  return p;
}

async function handle(path: string, method: string, body: any, raw?: BodyInit | null): Promise<Response> {
  const db = read();
  const key = getOpenAIKey();
  const chatKey = browserAIKey();
  if (path === "/api/health") return json({ ok: true, ai: !!chatKey, tts: !!key, local: true, openai: !!key, backend: getGroqKey() ? "groq" : key ? "openai" : "none" });
  if (path === "/api/chat" && method === "POST") {
    if (!chatKey) return json({ error: "Aucune clé d'IA : touchez 🔑 Clés IA et collez une clé Groq (gratuite) ou OpenAI." }, 503);
    return chatStream(chatKey, body || {});
  }
  if (path === "/api/tts" && method === "POST") {
    if (!key) return json({ error: "Clé OpenAI manquante" }, 503);
    const r = await realFetch(`${OA}/audio/speech`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "tts-1", voice: body?.voice || "onyx", input: String(body?.text || "").slice(0, 4000), response_format: "mp3" })
    });
    return new Response(await r.arrayBuffer(), { status: r.status, headers: { "Content-Type": "audio/mpeg" } });
  }
  if (path === "/api/stt" && method === "POST" && raw instanceof FormData) {
    if (!key) return json({ error: "Clé OpenAI manquante" }, 503);
    const fd = new FormData();
    fd.append("file", raw.get("audio") as Blob, "voice.webm");
    fd.append("model", "whisper-1");
    const lang = String(raw.get("lang") || "").slice(0, 2);
    if (lang) fd.append("language", lang);
    const r = await realFetch(`${OA}/audio/transcriptions`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: fd });
    const d = await r.json().catch(() => ({}));
    return json({ text: d.text ?? "" }, r.ok ? 200 : 500);
  }
  if (path === "/api/upload" && method === "POST" && raw instanceof FormData) {
    const f = raw.get("file") as File;
    if (!f) return json({ error: "fichier manquant" }, 400);
    const dataUrl = await new Promise<string>((res) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.readAsDataURL(f);
    });
    if (f.type.startsWith("image/")) return json({ name: f.name, kind: "image", image: dataUrl });
    if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") return json({ name: f.name, kind: "PDF", pdf: dataUrl, text: "" });
    if (/\.(txt|md|csv|json|js|ts|py|html|css|xml)$/i.test(f.name) || f.type.startsWith("text/")) {
      const text = (await f.text()).slice(0, 60000);
      return json({ name: f.name, kind: "texte", text });
    }
    return json({ error: "Sur le site web : images, PDF et fichiers texte. Pour Word/Excel, exportez en PDF ou collez le texte." }, 422);
  }
  if (path === "/api/memory") {
    if (method === "POST") {
      if (body?.fact) db.facts.push({ text: String(body.fact), at: Date.now() });
      write(db);
    }
    return json({ facts: db.facts });
  }
  if (path.startsWith("/api/memory/") && method === "DELETE") {
    db.facts.splice(Number(path.split("/").pop()), 1);
    write(db);
    return json({ facts: db.facts });
  }
  if (path === "/api/projects") {
    if (method === "POST") {
      const p = upsert(db, body || {});
      write(db);
      return json({ project: p });
    }
    return json({ projects: db.projects });
  }
  if (path.startsWith("/api/projects/") && method === "DELETE") {
    const id = path.split("/").pop();
    db.projects = db.projects.filter((p) => p.id !== id);
    write(db);
    return json({ projects: db.projects });
  }
  if (path === "/api/save") {
    if (method === "PUT") {
      db.save = body?.save ?? null;
      write(db);
      return json({ ok: true });
    }
    return json({ save: db.save });
  }
  return json({ error: "Fonction serveur indisponible dans la version iPad" }, 503);
}

/** Détecte l'absence du serveur Node et installe le substitut local. */
export async function installLocalApi(): Promise<boolean> {
  try {
    const r = await fetch("/api/health", { signal: AbortSignal.timeout(2500) });
    const d = await r.json();
    if (d && d.ok) return false;
  } catch {}
  const real = window.fetch.bind(window);
  realFetch = real;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const u = new URL(url, location.href);
    if (u.pathname.startsWith("/api/")) {
      let body: any = null;
      if (typeof init?.body === "string") {
        try {
          body = JSON.parse(init.body);
        } catch {}
      }
      return handle(u.pathname, (init?.method || "GET").toUpperCase(), body, init?.body ?? null);
    }
    return real(input as any, init);
  };
  return true;
}

// ---------------------------------------------------------------- conversation OpenAI (dans le navigateur)
const TOOLS = [
  {
    type: "function",
    function: {
      name: "game_action",
      description: "Déclenche une action réelle dans l'univers 3D de GRIOT (le module AISAM).",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: GAME_ACTIONS },
          target: { type: "string", description: "Étage 1-7, porte (garage, terrasse…), lieu (city, jungle, mountains, ocean, base, night, gardens, palace), heure, couleur, capacité…" }
        },
        required: ["action"]
      }
    }
  },
  {
    type: "function",
    function: { name: "remember", description: "Mémorise un fait ou une préférence durable de l'utilisateur.", parameters: { type: "object", properties: { fact: { type: "string" } }, required: ["fact"] } }
  },
  {
    type: "function",
    function: {
      name: "manage_project",
      description: "Crée ou met à jour un projet (statut, note, tâche à ajouter ou à cocher).",
      parameters: {
        type: "object",
        properties: { name: { type: "string" }, status: { type: "string", enum: ["idée", "en cours", "en pause", "terminé"] }, note: { type: "string" }, task: { type: "string" }, complete_task: { type: "string" } },
        required: ["name"]
      }
    }
  }
];

export function chatStream(key: string, body: any): Response {
  const groq = key.startsWith("gsk_");
  const base = groq ? GROQ : OA;
  const who = groq ? "Groq" : "OpenAI";
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const emit = (event: string, data: unknown) => ctrl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      try {
        const db = read();
        const sys = [
          PERSONA,
          MODE_RULES[body.mode] ?? MODE_RULES.personal,
          `Langue : ${body.lang || "fr"}. Date : ${new Date().toLocaleDateString("fr-FR", { dateStyle: "full" })}.`,
          "Pour agir dans le royaume, appelle game_action (ne prétends jamais l'avoir fait sans l'appeler). Pas d'accès Internet dans cette version.",
          body.brief ? "APPEL EN DIRECT : conversation vocale comme au téléphone. Réponds en 1 à 3 phrases courtes et naturelles, sans Markdown ni listes ni emojis." : "",
          db.facts.length ? "Ce que tu sais de l'utilisateur :\n- " + db.facts.map((f) => f.text).join("\n- ") : "",
          db.projects.length ? "Projets : " + JSON.stringify(db.projects.map((p) => ({ nom: p.name, statut: p.status, taches: p.tasks }))).slice(0, 4000) : "",
          body.game ? "État du jeu : " + JSON.stringify(body.game).slice(0, 1500) : ""
        ]
          .filter(Boolean)
          .join("\n\n");
        const msgs: any[] = [{ role: "system", content: sys }, ...(body.messages || []).slice(-20)];
        const last = msgs[msgs.length - 1];
        const parts: any[] = [];
        if (typeof body.image === "string" && body.image.startsWith("data:image/")) parts.push({ type: "image_url", image_url: { url: body.image } });
        if (typeof body.pdf === "string" && body.pdf.startsWith("data:application/pdf")) parts.push({ type: "file", file: { filename: body.pdfName || "document.pdf", file_data: body.pdf } });
        // Groq : seules les images passent (modèle vision Llama 4), pas les PDF
        if (groq) parts.splice(0, parts.length, ...parts.filter((x) => x.type === "image_url"));
        const vision = groq && parts.length > 0;
        if (parts.length && last) last.content = [{ type: "text", text: String(last.content) }, ...parts];
        for (let step = 0; step < 5; step++) {
          const r = await realFetch(`${base}/chat/completions`, {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: groq ? (vision ? "meta-llama/llama-4-scout-17b-16e-instruct" : GROQ_MODEL) : localStorage.getItem("griot-openai-model") || "gpt-4o-mini", messages: groq ? msgs.slice(0, 1).concat(msgs.slice(-12)) : msgs, tools: TOOLS, stream: true, max_tokens: body.brief ? 400 : 2000, temperature: body.mode === "creative" ? 0.95 : 0.6 })
          });
          if (!r.ok || !r.body) {
            const err = await r.json().catch(() => ({}));
            const msg =
              r.status === 401
                ? `Clé ${who} invalide.`
                : r.status === 429
                  ? groq
                    ? "Limite gratuite Groq atteinte : attendez une minute et réessayez."
                    : "Le compte OpenAI n'a plus de crédit ou reçoit trop de demandes. Mettez plutôt une clé Groq gratuite (🔑 Clés IA)."
                  : err?.error?.message || `Erreur ${who} ${r.status}`;
            emit("error", { message: msg });
            break;
          }
          const reader = r.body.getReader();
          const dec = new TextDecoder();
          let buf = "",
            content = "",
            finish: string | null = null;
          const calls: { id: string; name: string; args: string }[] = [];
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let i: number;
            while ((i = buf.indexOf("\n")) >= 0) {
              const line = buf.slice(0, i).trim();
              buf = buf.slice(i + 1);
              if (!line.startsWith("data:")) continue;
              const data = line.slice(5).trim();
              if (data === "[DONE]") continue;
              let j: any;
              try {
                j = JSON.parse(data);
              } catch {
                continue;
              }
              const ch = j.choices?.[0];
              if (!ch) continue;
              const d = ch.delta || {};
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
              if (ch.finish_reason) finish = ch.finish_reason;
            }
          }
          if (!calls.length || finish !== "tool_calls") break;
          msgs.push({ role: "assistant", content: content || null, tool_calls: calls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.args } })) });
          for (const c of calls) {
            let args: any = {};
            try {
              args = JSON.parse(c.args || "{}");
            } catch {}
            let out: unknown = { ok: true };
            if (c.name === "game_action") emit("action", { action: args.action, target: args.target ?? null });
            else if (c.name === "remember" && args.fact) {
              const d2 = read();
              d2.facts.push({ text: String(args.fact), at: Date.now() });
              write(d2);
              emit("memory", { fact: args.fact });
            } else if (c.name === "manage_project" && args.name) {
              const d2 = read();
              const p = upsert(d2, args);
              write(d2);
              emit("project", { project: p });
              out = { ok: true, project: p };
            }
            msgs.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(out) });
          }
        }
        emit("done", {});
      } catch (e: any) {
        emit("error", { message: "Connexion à OpenAI impossible : " + (e?.message || e) });
      }
      ctrl.close();
    }
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}
