// Mode « sans serveur » (iPad, page hébergée) : les routes /api de mémoire, projets et sauvegarde
// sont servies localement depuis le stockage du navigateur. Le reste répond « indisponible ».

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

async function handle(path: string, method: string, body: any): Promise<Response> {
  const db = read();
  if (path === "/api/health") return json({ ok: true, ai: false, tts: false, local: true });
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
      return handle(u.pathname, (init?.method || "GET").toUpperCase(), body);
    }
    return real(input as any, init);
  };
  return true;
}
