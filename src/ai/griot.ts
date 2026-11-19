// GRIOT côté client : conversation (streaming), commandes du royaume, fichiers, mémoire, projets, modes.
import { G, bus } from "../core";
import { parseCommands, type Intent } from "./commands";
import { runAction, gameSummary } from "./actions";
import { Voice } from "./voice";

export type GriotMode = "personal" | "business" | "research" | "creative" | "coder";
export const MODE_LABELS: Record<GriotMode, string> = { personal: "Personal", business: "Business", research: "Research", creative: "Creative", coder: "Coder" };

interface Msg {
  role: "user" | "assistant";
  content: string;
}
interface Attachment {
  name: string;
  kind: string;
  text?: string;
  image?: string;
  truncated?: boolean;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Markdown minimal et sûr (échappement d'abord). */
export function md(src: string) {
  const blocks: string[] = [];
  let s = src.replace(/```(\w*)\n?([\s\S]*?)(```|$)/g, (_m, lang, code) => {
    blocks.push(`<pre><div class="code-head"><span>${esc(lang || "code")}</span><button class="copy" data-copy>Copier</button></div><code>${esc(code.replace(/\n$/, ""))}</code></pre>`);
    return `\u0000${blocks.length - 1}\u0000`;
  });
  s = esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>')
    .replace(/^### (.*)$/gm, "<h4>$1</h4>")
    .replace(/^## (.*)$/gm, "<h3>$1</h3>")
    .replace(/^# (.*)$/gm, "<h3>$1</h3>")
    .replace(/^\s*[-•*] (.*)$/gm, "<li>$1</li>")
    .replace(/^\s*\d+[.)] (.*)$/gm, "<li class='ol'>$1</li>")
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/\n{2,}/g, "<br><br>")
    .replace(/\n/g, "<br>");
  return s.replace(/\u0000(\d+)\u0000/g, (_m, i) => blocks[+i]);
}

export class Griot {
  voice = new Voice();
  ai = false;
  mode: GriotMode = "personal";
  history: Msg[] = [];
  pending: Attachment[] = [];
  busy = false;
  private abort: AbortController | null = null;
  private list = document.getElementById("messages")!;

  async init() {
    try {
      const h = await (await fetch("/api/health")).json();
      this.ai = h.ai;
      this.voice.serverTTS = h.tts;
      this.voice.serverSTT = h.ai;
    } catch {
      this.ai = false;
    }
    try {
      const saved = JSON.parse(localStorage.getItem("griot-chat") || "null");
      if (saved) {
        this.history = saved.history ?? [];
        this.mode = saved.mode ?? "personal";
      }
    } catch {}
    for (const m of this.history.slice(-12)) this.render(m.role, m.content);
    this.voice.onFinal = (t) => this.send(t, { spoken: true });
    bus.on("griot:say", (d: { text: string; quiet?: boolean }) => {
      this.render("assistant", d.text);
      if (!d.quiet || !this.voice.speaking) this.voice.say(d.text);
      bus.emit("caption", d.text);
    });
    this.list.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("[data-copy]");
      if (b) {
        const code = b.closest("pre")?.querySelector("code")?.textContent ?? "";
        navigator.clipboard?.writeText(code);
        b.textContent = "Copié ✔";
      }
    });
    this.refreshProjects();
    bus.emit("griot:status", this.ai ? "IA CONNECTÉE" : "MODE LOCAL");
    if (!this.history.length) {
      this.render(
        "assistant",
        this.ai
          ? "Bienvenue dans votre royaume, Majesté. Je suis **GRIOT**. Parlez-moi (touche **T**) ou écrivez-moi : je peux agir dans le palais, piloter le Royal Talon, déployer votre armure… et bien sûr rechercher, rédiger, coder, traduire ou analyser vos documents."
          : "Bienvenue dans votre royaume. Je suis **GRIOT**. Mon moteur d'IA n'est pas connecté (ajoutez `OPENAI_API_KEY` dans `.env`), mais toutes les **commandes du royaume** fonctionnent déjà : « ouvre les portes du garage », « prépare le Royal Talon », « active mon armure », « emmène-moi explorer la ville »… Tapez **aide** pour la liste."
      );
    }
  }

  setMode(m: GriotMode) {
    this.mode = m;
    this.persist();
  }

  private persist() {
    try {
      localStorage.setItem("griot-chat", JSON.stringify({ history: this.history.slice(-30), mode: this.mode }));
    } catch {}
  }

  clear() {
    this.history = [];
    this.list.innerHTML = "";
    this.persist();
    this.render("assistant", "Conversation effacée. Je reste à votre écoute.");
  }

  stop() {
    this.abort?.abort();
    this.voice.interrupt();
  }

  // ---------------------------------------------------------------- rendu
  render(role: "user" | "assistant", text: string, extra = "") {
    const row = document.createElement("div");
    row.className = `msg ${role}`;
    row.innerHTML = `<div class="avatar">${role === "assistant" ? "G" : "♛"}</div><div class="bubble">${md(text)}${extra}</div>`;
    this.list.append(row);
    this.list.scrollTop = this.list.scrollHeight;
    return row.querySelector(".bubble") as HTMLElement;
  }

  // ---------------------------------------------------------------- fichiers
  async attach(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    bus.emit("toast", { text: `Analyse du fichier « ${file.name} »…` });
    try {
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      this.pending.push(d);
      bus.emit("attachments", this.pending);
    } catch (e: any) {
      if (file.type.startsWith("image/")) {
        const image = await new Promise<string>((res) => {
          const fr = new FileReader();
          fr.onload = () => res(String(fr.result));
          fr.readAsDataURL(file);
        });
        this.pending.push({ name: file.name, kind: "image", image });
        bus.emit("attachments", this.pending);
      } else if (/\.(txt|md|csv|json|js|ts|py|html|css)$/i.test(file.name)) {
        this.pending.push({ name: file.name, kind: "texte", text: (await file.text()).slice(0, 60000) });
        bus.emit("attachments", this.pending);
      } else bus.emit("toast", { text: `Lecture impossible : ${e?.message || "serveur indisponible"}`, kind: "warn" });
    }
  }

  attachImage(dataUrl: string, name = "capture-camera.jpg") {
    this.pending.push({ name, kind: "image", image: dataUrl });
    bus.emit("attachments", this.pending);
  }

  removeAttachment(i: number) {
    this.pending.splice(i, 1);
    bus.emit("attachments", this.pending);
  }

  // ---------------------------------------------------------------- envoi
  async send(text: string, opts: { spoken?: boolean } = {}) {
    text = text.trim();
    if (!text && !this.pending.length) return;
    G.audio.unlock();
    this.voice.interrupt();
    const atts = this.pending.splice(0);
    bus.emit("attachments", this.pending);
    const shown = text + (atts.length ? "\n" + atts.map((a) => `📎 ${a.name}`).join("\n") : "");
    this.render("user", shown || "📎");
    bus.emit("chat:user", text);

    // 1) commandes du royaume (instantanées)
    if (!atts.length) {
      const intents = parseCommands(text);
      if (intents.length) {
        const replies: string[] = [];
        for (const it of intents) replies.push(await this.local(it));
        const reply = replies.filter(Boolean).join(" ");
        if (reply) {
          this.render("assistant", reply);
          this.voice.say(reply);
          bus.emit("caption", reply);
          this.history.push({ role: "user", content: text }, { role: "assistant", content: reply });
          this.persist();
        }
        return;
      }
    }
    // 2) intelligence artificielle
    if (!this.ai) {
      const r = this.offline(text);
      this.render("assistant", r);
      this.voice.say(r);
      return;
    }
    let content = text || "Analyse ces fichiers.";
    let image: string | null = null;
    for (const a of atts) {
      if (a.kind === "image" && a.image) image = a.image;
      else if (a.text) content += `\n\n[Document joint : ${a.name} (${a.kind})${a.truncated ? " — tronqué" : ""}]\n"""\n${a.text}\n"""`;
    }
    this.history.push({ role: "user", content });
    await this.stream(image, opts.spoken);
  }

  private async local(it: Intent): Promise<string> {
    switch (it.action) {
      case "help":
        return HELP;
      case "save":
        G.missions.saveNow();
        return "Progression sauvegardée.";
      case "stop_voice":
        this.voice.interrupt();
        return "";
      case "stop_engines":
        G.ship.startEngines(false);
        return "Moteurs coupés.";
      case "project_report":
        if (this.ai) {
          this.history.push({ role: "user", content: "Fais-moi un rapport clair et concis sur mes projets (statut, prochaines tâches, priorités)." });
          this.stream(null, true);
          return "";
        }
        return this.projectReport();
    }
    return runAction(it.action, it.target);
  }

  private async stream(image: string | null, spoken = false) {
    this.busy = true;
    bus.emit("voice:state", "thinking");
    const bubble = this.render("assistant", "");
    bubble.classList.add("typing");
    let full = "";
    let extra = "";
    this.abort = new AbortController();
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: this.history.slice(-20), mode: this.mode, lang: this.voice.settings.lang.slice(0, 2), game: gameSummary(), image }),
        signal: this.abort.signal
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const raw = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const ev = /^event: (.*)$/m.exec(raw)?.[1];
          const data = JSON.parse(/^data: (.*)$/m.exec(raw)?.[1] || "{}");
          if (ev === "token") {
            full += data.text;
            bubble.classList.remove("typing");
            bubble.innerHTML = md(full) + extra;
            this.list.scrollTop = this.list.scrollHeight;
            if (spoken || this.voice.settings.speak) this.voice.stream(data.text);
          } else if (ev === "action") {
            const r = await runAction(data.action, data.target);
            bus.emit("toast", { text: `GRIOT ▸ ${r}` });
          } else if (ev === "sources") {
            extra += `<div class="sources">${data.results
              .filter((r: any) => r.url)
              .map((r: any) => `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a>`)
              .join("")}</div>`;
            bubble.innerHTML = md(full) + extra;
          } else if (ev === "document") {
            extra += `<a class="doc-link" href="${esc(data.url)}" download>📄 Télécharger « ${esc(data.title)} » (.docx)</a>`;
            bubble.innerHTML = md(full) + extra;
          } else if (ev === "memory") bus.emit("toast", { text: `🧠 Mémorisé : ${data.fact}` });
          else if (ev === "project") {
            bus.emit("toast", { text: `📁 Projet mis à jour : ${data.project.name}` });
            this.refreshProjects();
          } else if (ev === "status") bus.emit("toast", { text: data.text });
          else if (ev === "error") throw new Error(data.message);
        }
      }
      this.voice.flush();
      if (!full) {
        bubble.classList.remove("typing");
        if (!extra) bubble.innerHTML = md("C'est fait.");
      }
      this.history.push({ role: "assistant", content: full || "(action effectuée)" });
      this.persist();
      bus.emit("caption", full.slice(0, 220));
    } catch (e: any) {
      bubble.classList.remove("typing");
      if (e.name === "AbortError") bubble.innerHTML = md(full + "\n\n*(interrompu)*");
      else bubble.innerHTML = md(`Je ne parviens pas à joindre mon moteur d'IA (${esc(e.message)}). Les commandes du royaume restent disponibles.`);
      this.history.pop();
    } finally {
      this.busy = false;
      this.abort = null;
      bus.emit("voice:state", this.voice.listening ? "listening" : "idle");
    }
  }

  private offline(text: string): string {
    const t = text.toLowerCase();
    if (/bonjour|salut|hello|hi\b|bonsoir/.test(t)) return "Bonjour, Majesté. Le royaume est calme. Que puis-je faire pour vous ?";
    if (/merci|thanks/.test(t)) return "Toujours à votre service.";
    if (/qui es.tu|who are you/.test(t)) return "Je suis GRIOT, l'intelligence centrale de votre royaume. THINK. SPEAK. RULE.";
    return "Mon moteur d'IA est hors ligne : je ne peux pas répondre à cette question pour l'instant. Configurez `OPENAI_API_KEY` côté serveur. En attendant, je reste capable d'exécuter toutes les commandes du royaume — tapez **aide**.";
  }

  async refreshProjects() {
    try {
      const d = await (await fetch("/api/projects")).json();
      (window as any).__griotProjects = d.projects;
      bus.emit("projects", d.projects);
      return d.projects;
    } catch {
      return [];
    }
  }

  private async projectReport() {
    const list = (await this.refreshProjects()) as any[];
    if (!list.length) return "Vous n'avez encore aucun projet enregistré. Ouvrez l'onglet Projets du panneau GRIOT pour en créer un.";
    return (
      `Rapport sur vos ${list.length} projets. ` +
      list
        .map((p) => {
          const open = p.tasks.filter((t: any) => !t.done);
          return `${p.name} : ${p.status}${open.length ? `, prochaine tâche : ${open[0].text}` : ", aucune tâche en attente"}.`;
        })
        .join(" ")
    );
  }
}

export const HELP = `**Commandes du royaume** (voix ou texte) :
- « ouvre / ferme les portes du garage » · « ouvre la terrasse » · « appelle l'ascenseur »
- « va au niveau 5 » · « montre-moi la salle de contrôle » · « emmène-moi à l'armurerie »
- « prépare le Royal Talon » · « monte dans le vaisseau » · « démarre les moteurs » · « décolle » · « atterris » · « sors du vaisseau »
- « emmène-moi explorer la ville / la jungle / les montagnes / l'océan / la base secrète / la vallée nocturne »
- « active mon armure » · « retire l'armure » · « masque » · « bouclier » · « impulsion » · « armure en violet »
- « fais la nuit » · « mets le jour » · « montre la carte » · « vue première personne »
- « rapport sur mes missions » · « fais-moi un rapport sur mes projets » · « où suis-je ? »
**Clavier** : WASD déplacement · Maj courir · Espace sauter · E interagir · V vue · M carte · T parler · Entrée écrire · Échap menu
**Vaisseau** : R moteurs · W/S poussée · A/D virer · ↑/↓ ou souris tangage · Q/E roulis · Espace/C monter/descendre · Maj post-combustion · L lumières · H atterrir · V vue · F sortir`;
