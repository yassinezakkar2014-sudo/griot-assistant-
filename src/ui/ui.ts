// Interface : HUD, panneau GRIOT, menus, carte, panneaux du royaume, contrôles tactiles.
import * as THREE from "three";
import { G, bus, clamp } from "../core";
import { FLOORS } from "../world/palace";
import { fmtHour } from "../world/floors";
import { VARIANTS, type Pattern } from "../game/armor";
import { runAction, PLACES } from "../ai/actions";
import { Griot, MODE_LABELS, type GriotMode, md, HELP } from "../ai/griot";
import { LANGS } from "../ai/voice";
import { WORLD } from "../world/terrain";
import { EARTH } from "../world/countryData";
import { getGroqKey, getOpenAIKey, setGroqKey, setOpenAIKey } from "../ai/localapi";
import { Visor } from "./visor";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export class UI {
  griot = new Griot();
  visor = new Visor();
  tracked: string | null = null;
  modalOpen: string | null = null;
  panelOpen = false;
  shake = 0;
  private camStream: MediaStream | null = null;
  private avatarCtx = $<HTMLCanvasElement>("avatar").getContext("2d")!;
  private level = 0;
  private voiceState = "idle";
  private mini = $<HTMLCanvasElement>("minimap").getContext("2d")!;
  private att = $<HTMLCanvasElement>("attitude").getContext("2d")!;
  private captionTimer: any;

  async init() {
    this.bindBus();
    this.bindPanel();
    this.bindHome();
    this.visor.init();
    this.bindKeys();
    if (G.mobile) this.bindTouch();
    await this.griot.init();
    if (!this.griot.sampleFn) $("aiState").textContent = $("homeAi").textContent = this.griot.ai ? "IA CONNECTÉE" : "MODE LOCAL";
    try {
      this.tracked = localStorage.getItem("griot-track");
    } catch {}
    document.addEventListener("pointerlockchange", () => {
      if (!document.pointerLockElement && !G.input.expectUnlock && !this.modalOpen && !this.panelOpen && G.mode !== "inspect" && G.mode !== "cinematic" && !$("hud").hidden && !G.mobile) this.menu();
      if (!document.pointerLockElement) G.input.expectUnlock = false;
    });
  }

  /** Interface d'accueil GRIOT : avatar, raccourcis, fenêtre AISAM. */
  private bindHome() {
    const home = $<HTMLCanvasElement>("homeAvatar").getContext("2d")!;
    const tick = (ms: number) => {
      if (!document.body.classList.contains("full")) this.drawAvatar(ms / 1000, home);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    $("homeTalk").onclick = () => this.talk();
    $("keyBtn").onclick = () => this.keyPanel();
    if ((window as any).claude) document.documentElement.classList.add("in-claude");
    document.querySelectorAll<HTMLElement>("[data-say]").forEach((b) => (b.onclick = () => this.griot.send(b.dataset.say!)));
    $("vActivate").onclick = () => this.griot.send("active AISAM");
    $("vOff").onclick = () => this.griot.send("mets AISAM en veille");
    const setFull = (on: boolean) => {
      document.body.classList.toggle("full", on);
      this.togglePanel(false);
      bus.emit("layout");
    };
    $("vFull").onclick = () => setFull(true);
    $("exitFull").onclick = () => setFull(false);
    // la fenêtre de jeu suit l'emplacement réservé dans l'interface
    const slot = $("viewSlot");
    const place = () => {
      const r = slot.getBoundingClientRect();
      const st = document.documentElement.style;
      st.setProperty("--vx", r.left + "px");
      st.setProperty("--vy", r.top + "px");
      st.setProperty("--vw", r.width + "px");
      st.setProperty("--vh", r.height + "px");
    };
    new ResizeObserver(place).observe(slot);
    addEventListener("resize", place);
    bus.on("layout", () => requestAnimationFrame(place));
    place();
  }

  private unlockQuiet() {
    G.input.unlock();
  }

  // ---------------------------------------------------------------- événements
  private bindBus() {
    bus.on("toast", (d: { text: string; kind?: string }) => this.toast(d.text, d.kind));
    bus.on("reward", (d) => this.toast(`🏆 MISSION ACCOMPLIE — ${d.title}<br><small>${d.reward}</small>`, "gold", 6000));
    bus.on("caption", (t: string) => this.caption(t));
    bus.on("voice:interim", (t: string) => {
      $("interim").textContent = t ? `« ${t} »` : "";
    });
    bus.on("voice:state", (s: string) => {
      this.voiceState = s;
      $("griotState").textContent = $("homeState").textContent = { idle: "EN ATTENTE", listening: "JE VOUS ÉCOUTE", thinking: "RÉFLEXION…", speaking: "JE VOUS RÉPONDS" }[s] ?? s;
      document.body.dataset.voice = s;
    });
    bus.on("voice:continuous", (on: boolean) => ($<HTMLInputElement>("contToggle").checked = on));
    bus.on("griot:level", (l: number) => (this.level = l));
    bus.on("griot:status", (t: string) => ($("aiState").textContent = $("homeAi").textContent = t));
    bus.on("aisam:state", (t: string) => ($("aisamChip").textContent = t));
    bus.on("fade", () => {
      const f = $("fade");
      f.classList.remove("go");
      void f.offsetWidth;
      f.classList.add("go");
    });
    bus.on("shake", (s: number) => (this.shake = Math.max(this.shake, s)));
    bus.on("progress", (d: { label: string; duration: number }) => {
      const p = $("progress");
      p.hidden = false;
      $("progressLabel").textContent = d.label;
      const fill = $("progressFill");
      fill.style.transition = "none";
      fill.style.width = "0%";
      void fill.offsetWidth;
      fill.style.transition = `width ${d.duration}s linear`;
      fill.style.width = "100%";
      setTimeout(() => (p.hidden = true), d.duration * 1000 + 200);
    });
    bus.on("ui:kingdom", () => this.kingdom());
    bus.on("ui:command", () => this.command());
    bus.on("ui:elevator", () => this.elevator());
    bus.on("ui:map", () => this.map());
    bus.on("ui:multi", () => this.multi());
    bus.on("mp:chat", (d: { name: string; text: string }) => {
      this.toast(`💬 <b>${esc(d.name)}</b> : ${esc(d.text)}`, "", 7000);
      if (this.modalOpen === "multi") this.multi();
    });
    const mpRefresh = () => {
      const n = G.net.peers.size;
      const chip = $("mpChip");
      chip.hidden = G.net.status !== "on";
      chip.textContent = `👥 Salle « ${G.net.room} » · ${n + 1} joueur${n ? "s" : ""}`;
      if (this.modalOpen === "multi") this.multi();
    };
    bus.on("mp:peers", mpRefresh);
    bus.on("mp:status", (d: { status: string; msg?: string }) => {
      mpRefresh();
      if (d.status === "error") this.toast(`Multijoueur : ${d.msg ?? "connexion impossible"}`, "warn");
    });
    bus.on("ui:armor", (open: boolean) => (open ? this.armorPanel() : this.closeModal()));
    bus.on("track", (id: string) => {
      this.tracked = id;
      try {
        localStorage.setItem("griot-track", id);
      } catch {}
    });
    bus.on("attachments", (list: any[]) => {
      $("attachments").innerHTML = list.map((a, i) => `<span class="chip">${a.kind === "image" ? "🖼" : "📄"} ${esc(a.name)} <button data-rm="${i}">✕</button></span>`).join("");
    });
    bus.on("projects", (list: any[]) => this.renderProjects(list));
    bus.on("sleep", () => {
      bus.emit("fade");
      G.env.setHour(8);
      G.missions.saveNow();
      this.toast("☀ Bonne nuit… Il est 08:00. Progression sauvegardée.");
    });
    bus.on("save", () => G.missions?.save());
    bus.on("saved", () => {
      const el = $("clock");
      el.classList.add("saved");
      setTimeout(() => el.classList.remove("saved"), 800);
    });
    bus.on("mode", () => {
      $("shipHud").hidden = G.mode !== "ship";
      document.body.dataset.mode = G.mode;
    });
  }

  toast(html: string, kind = "", ms = 3800) {
    const t = document.createElement("div");
    t.className = `toast glass ${kind}`;
    t.innerHTML = html;
    $("toasts").prepend(t);
    while ($("toasts").children.length > 5) $("toasts").lastElementChild!.remove();
    setTimeout(() => t.classList.add("out"), ms);
    setTimeout(() => t.remove(), ms + 500);
  }

  caption(text: string) {
    const c = $("caption");
    c.textContent = text.replace(/[*#`]/g, "").slice(0, 240);
    c.classList.add("show");
    clearTimeout(this.captionTimer);
    this.captionTimer = setTimeout(() => c.classList.remove("show"), 4000 + text.length * 40);
  }

  // ---------------------------------------------------------------- panneau GRIOT
  private bindPanel() {
    const g = this.griot;
    const modeSel = $<HTMLSelectElement>("modeSel");
    modeSel.innerHTML = Object.entries(MODE_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
    modeSel.onchange = () => g.setMode(modeSel.value as GriotMode);
    const langSel = $<HTMLSelectElement>("langSel");
    langSel.innerHTML = LANGS.map((l) => `<option value="${l.code}">${l.label}</option>`).join("");
    setTimeout(() => {
      modeSel.value = g.mode;
      langSel.value = g.voice.settings.lang;
      $<HTMLInputElement>("speakToggle").checked = g.voice.settings.speak;
      $<HTMLInputElement>("wakeToggle").checked = g.voice.settings.wakeWord;
    });
    langSel.onchange = () => {
      g.voice.settings.lang = langSel.value;
      g.voice.saveSettings();
    };
    $("panelClose").onclick = () => this.togglePanel(false);
    $("chatBtn").onclick = () => this.togglePanel();
    $("talkBtn").onclick = () => this.talk();
    $("micBtn").onclick = () => this.talk();
    $("stopBtn").onclick = () => g.stop();
    $("clearBtn").onclick = () => g.clear();
    $<HTMLInputElement>("speakToggle").onchange = (e) => {
      g.voice.settings.speak = (e.target as HTMLInputElement).checked;
      if (!g.voice.settings.speak) g.voice.interrupt();
      g.voice.saveSettings();
    };
    $<HTMLInputElement>("contToggle").onchange = (e) => g.voice.setContinuous((e.target as HTMLInputElement).checked);
    $<HTMLInputElement>("wakeToggle").onchange = (e) => {
      g.voice.settings.wakeWord = (e.target as HTMLInputElement).checked;
      g.voice.saveSettings();
    };
    const input = $<HTMLTextAreaElement>("input");
    $("composer").addEventListener("submit", (e) => {
      e.preventDefault();
      const v = input.value;
      input.value = "";
      input.style.height = "";
      g.send(v);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        $<HTMLFormElement>("composer").requestSubmit();
      }
      if (e.key === "Escape") {
        input.blur();
        this.togglePanel(false);
      }
      e.stopPropagation();
    });
    input.addEventListener("input", () => {
      input.style.height = "";
      input.style.height = Math.min(160, input.scrollHeight) + "px";
    });
    // focus → le jeu ne capte plus le clavier
    document.addEventListener("focusin", (e) => {
      if ((e.target as HTMLElement).matches("input, textarea, select")) G.uiFocus = true;
    });
    document.addEventListener("focusout", () => {
      setTimeout(() => (G.uiFocus = !!document.activeElement?.matches("input, textarea, select") || !!this.modalOpen), 0);
    });
    $<HTMLInputElement>("fileInput").onchange = async (e) => {
      const files = [...((e.target as HTMLInputElement).files ?? [])];
      for (const f of files) await g.attach(f);
      (e.target as HTMLInputElement).value = "";
    };
    $("attachments").onclick = (e) => {
      const b = (e.target as HTMLElement).closest("[data-rm]") as HTMLElement | null;
      if (b) g.removeAttachment(+b.dataset.rm!);
    };
    // glisser-déposer
    const panel = $("panel");
    panel.addEventListener("dragover", (e) => e.preventDefault());
    panel.addEventListener("drop", async (e) => {
      e.preventDefault();
      for (const f of [...(e.dataTransfer?.files ?? [])]) await g.attach(f);
    });
    $("camBtn").onclick = () => this.camera();
    document.querySelectorAll<HTMLButtonElement>(".tabs button").forEach((b) => {
      b.onclick = () => {
        document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("on", x === b));
        document.querySelectorAll<HTMLElement>(".pane").forEach((p) => p.classList.toggle("on", p.dataset.pane === b.dataset.tab));
        if (b.dataset.tab === "memory") this.loadMemory();
        if (b.dataset.tab === "projects") g.refreshProjects();
      };
    });
    $("memForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = $<HTMLInputElement>("memInput").value.trim();
      if (!v) return;
      await fetch("/api/memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fact: v }) }).catch(() => {});
      $<HTMLInputElement>("memInput").value = "";
      this.loadMemory();
    });
    $("memList").onclick = async (e) => {
      const b = (e.target as HTMLElement).closest("[data-del]") as HTMLElement | null;
      if (!b) return;
      await fetch(`/api/memory/${b.dataset.del}`, { method: "DELETE" }).catch(() => {});
      this.loadMemory();
    };
    $("projForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = $<HTMLInputElement>("projInput").value.trim();
      if (!v) return;
      await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: v, status: "en cours" }) }).catch(() => {});
      $<HTMLInputElement>("projInput").value = "";
      g.refreshProjects();
    });
    $("projList").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target as HTMLFormElement;
      const inp = f.querySelector("input")!;
      if (!inp.value.trim()) return;
      await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: f.dataset.name, task: inp.value.trim() }) });
      g.refreshProjects();
    });
    $("projList").addEventListener("click", async (e) => {
      const el = e.target as HTMLElement;
      if (el.dataset.task) {
        await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: el.dataset.name, complete_task: el.dataset.task }) });
        g.refreshProjects();
      } else if (el.dataset.status) {
        await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: el.dataset.name, status: el.dataset.status }) });
        g.refreshProjects();
      } else if (el.dataset.delproj) {
        await fetch(`/api/projects/${el.dataset.delproj}`, { method: "DELETE" });
        g.refreshProjects();
      }
    });
  }

  private async loadMemory() {
    try {
      const d = await (await fetch("/api/memory")).json();
      $("memList").innerHTML = d.facts.length ? d.facts.map((f: any, i: number) => `<li>${esc(f.text)} <button class="link" data-del="${i}">Oublier</button></li>`).join("") : "<li class='hint'>Aucun souvenir pour l'instant.</li>";
    } catch {
      $("memList").innerHTML = "<li class='hint'>Serveur indisponible.</li>";
    }
  }

  private renderProjects(list: any[]) {
    const statuses = ["idée", "en cours", "en pause", "terminé"];
    $("projList").innerHTML = list.length
      ? list
          .map(
            (p) => `<div class="proj glass">
        <div class="proj-head"><strong>${esc(p.name)}</strong><button class="link" data-delproj="${p.id}">Supprimer</button></div>
        <div class="status-row">${statuses.map((s) => `<button class="pill ${p.status === s ? "on" : ""}" data-name="${esc(p.name)}" data-status="${s}">${s}</button>`).join("")}</div>
        <ul class="tasks">${p.tasks.map((t: any) => `<li class="${t.done ? "done" : ""}" data-name="${esc(p.name)}" data-task="${esc(t.text)}">${t.done ? "✔" : "◻"} ${esc(t.text)}</li>`).join("")}</ul>
        <form class="row" data-name="${esc(p.name)}"><input placeholder="Ajouter une tâche…" /><button class="btn small">+</button></form>
      </div>`
          )
          .join("")
      : "<p class='hint'>Aucun projet. Créez-en un ci-dessus, ou dites à GRIOT : « crée le projet Lancement de ma marque ».</p>";
  }

  private async camera() {
    const video = $<HTMLVideoElement>("camVideo");
    if (this.camStream) {
      // capture puis arrêt
      const c = document.createElement("canvas");
      c.width = video.videoWidth;
      c.height = video.videoHeight;
      c.getContext("2d")!.drawImage(video, 0, 0);
      this.griot.attachImage(c.toDataURL("image/jpeg", 0.8));
      this.camStream.getTracks().forEach((t) => t.stop());
      this.camStream = null;
      video.hidden = true;
      $("camBtn").classList.remove("on");
      this.toast("📷 Capture jointe : posez votre question sur l'image.");
      return;
    }
    try {
      this.camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      video.srcObject = this.camStream;
      video.hidden = false;
      $("camBtn").classList.add("on");
      this.toast("Caméra active — cliquez à nouveau sur 📷 pour capturer.");
    } catch {
      this.toast("Caméra indisponible ou refusée.", "warn");
    }
  }

  togglePanel(force?: boolean) {
    this.panelOpen = force ?? !this.panelOpen;
    $("panel").classList.toggle("open", this.panelOpen);
    if (this.panelOpen) {
      this.unlockQuiet();
      setTimeout(() => $("input").focus(), 50);
    } else {
      ($("input") as HTMLTextAreaElement).blur();
      G.uiFocus = !!this.modalOpen;
    }
  }

  talk() {
    G.audio.unlock();
    this.griot.voice.unlock();
    this.griot.voice.toggleListen();
  }

  // ---------------------------------------------------------------- clavier global
  private bindKeys() {
    addEventListener("keydown", (e) => {
      if (G.uiFocus && e.key !== "Escape") return;
      if ($("hud").hidden) {
        // interface GRIOT seule : T pour parler, Entrée pour écrire
        if (e.code === "KeyT") this.talk();
        if (e.code === "Enter") $("input").focus();
        return;
      }
      if (e.key === "Escape") {
        if (this.modalOpen) {
          e.preventDefault();
          if (this.modalOpen === "armor") G.armor.endInspect();
          else this.closeModal();
        } else if (this.panelOpen) this.togglePanel(false);
        else if (G.mode !== "inspect") this.menu();
        return;
      }
      if (e.code === "KeyT") {
        e.preventDefault();
        this.talk();
      } else if (e.code === "Enter") {
        e.preventDefault();
        this.togglePanel(true);
      } else if (e.code === "KeyM" && G.mode !== "inspect") this.map();
      else if (e.code === "KeyP") this.menu();
      else if (e.code === "KeyJ") this.missions();
    });
  }

  // ---------------------------------------------------------------- modales
  openModal(id: string, html: string, cls = "") {
    this.modalOpen = id;
    G.uiFocus = true;
    this.unlockQuiet();
    $("modalCard").className = `modal-card glass ${cls}`;
    $("modalCard").innerHTML = `<button class="icon close" data-close>✕</button>${html}`;
    $("modal").hidden = false;
    $("modal").classList.toggle("side", cls.includes("side"));
    $("modalCard").querySelector("[data-close]")!.addEventListener("click", () => (id === "armor" ? G.armor.endInspect() : this.closeModal()));
    return $("modalCard");
  }

  closeModal() {
    if (!this.modalOpen) return;
    this.modalOpen = null;
    $("modal").hidden = true;
    G.uiFocus = this.panelOpen && document.activeElement === $("input");
  }

  menu() {
    const card = this.openModal(
      "menu",
      `<h2 class="mt">GRIOT <small>THINK. SPEAK. RULE.</small></h2>
      <div class="menu-grid">
        <button class="btn primary" data-a="resume">▶ Reprendre</button>
        <button class="btn" data-a="missions">🏆 Missions</button>
        <button class="btn" data-a="map">🗺 Carte</button>
        <button class="btn" data-a="help">⌨ Commandes</button>
        <button class="btn" data-a="settings">⚙ Réglages</button>
        <button class="btn" data-a="save">💾 Sauvegarder</button>
        <button class="btn ghost" data-a="reset" id="resetBtn">⟲ Nouvelle partie</button>
      </div>
      <p class="hint">Niveau ${G.missions.level()} · ${G.missions.rankName()} · ${G.missions.completedCount()}/${G.missions.defs.length} missions · ${G.missions.state.credits} éclats royaux</p>`
    );
    card.onclick = (e) => {
      const a = (e.target as HTMLElement).dataset.a;
      if (!a) return;
      if (a === "resume") {
        this.closeModal();
        if (!G.mobile) $("scene").requestPointerLock?.();
      } else if (a === "missions") this.missions();
      else if (a === "map") this.map();
      else if (a === "help") this.help();
      else if (a === "settings") this.settings();
      else if (a === "save") {
        G.missions.saveNow();
        this.toast("💾 Progression sauvegardée (navigateur + serveur).");
      } else if (a === "reset") {
        const b = $("resetBtn");
        if (b.dataset.armed) G.missions.reset();
        else {
          b.dataset.armed = "1";
          b.textContent = "⚠ Toucher encore pour tout effacer";
        }
      }
    };
  }

  help() {
    this.openModal("help", `<h2 class="mt">Commandes</h2><div class="md">${md(HELP)}</div>`);
  }

  missions() {
    const m = G.missions;
    const card = this.openModal(
      "missions",
      `<h2 class="mt">Missions du royaume</h2>
      <div class="xp"><span>Niveau ${m.level()} — ${m.rankName()}</span><i><b style="width:${((m.state.xp % 300) / 300) * 100}%"></b></i><span>${m.state.xp} XP</span></div>
      <div class="missions">${m.defs
        .map((d) => {
          const done = m.isDone(d.id);
          return `<div class="mission ${done ? "done" : ""} ${this.tracked === d.id ? "tracked" : ""}">
          <div><strong>${done ? "✔" : "◇"} ${d.title}</strong><p>${d.desc}</p><small>${done ? "Accomplie" : `Progression : ${m.progressText(d.id)} · Indice : ${d.hint}`}</small></div>
          <div class="side"><span class="reward">${d.reward}</span>${done ? "" : `<button class="btn small" data-track="${d.id}">${this.tracked === d.id ? "Suivie" : "Suivre"}</button>`}</div>
        </div>`;
        })
        .join("")}</div>`
    );
    card.onclick = (e) => {
      const id = (e.target as HTMLElement).dataset.track;
      if (id) {
        bus.emit("track", id);
        this.missions();
      }
    };
  }

  settings() {
    const v = this.griot.voice.settings;
    const s = (window as any).__griotSettings as { bloom: boolean; shadows: boolean; pixelRatio: number; ao: boolean };
    const card = this.openModal(
      "settings",
      `<h2 class="mt">Réglages</h2>
      <div class="form">
        <label>Sensibilité souris <input type="range" min="0.3" max="2.5" step="0.1" value="${G.input.sensitivity}" data-s="sens"></label>
        <label><input type="checkbox" ${G.input.invertY ? "checked" : ""} data-s="invert"> Inverser l'axe vertical</label>
        <label>Volume des effets <input type="range" min="0" max="1" step="0.05" value="${G.audio.volume}" data-s="vol"></label>
        <label><input type="checkbox" ${s.bloom ? "checked" : ""} data-s="bloom"> Halo lumineux (bloom)</label>
        <label><input type="checkbox" ${s.shadows ? "checked" : ""} data-s="shadows"> Ombres</label>
        <label><input type="checkbox" ${s.ao ? "checked" : ""} data-s="ao"> Qualité Ultra (ombres de contact, ombres 4K)</label>
        <button class="btn small" data-s="ultra">✨ Tout en Ultra</button>
        <label>Résolution <select data-s="pr"><option value="0.6">Performance</option><option value="1">Standard</option><option value="2">Haute</option></select></label>
        <hr>
        <label><input type="checkbox" ${v.neural ? "checked" : ""} data-s="neural"> Voix neuronale premium (serveur)</label>
        <label>Timbre neuronal <select data-s="nv">${["onyx", "echo", "fable", "alloy", "nova", "shimmer"].map((x) => `<option ${x === v.neuralVoice ? "selected" : ""}>${x}</option>`).join("")}</select></label>
        <label>Débit de parole <input type="range" min="0.7" max="1.4" step="0.05" value="${v.rate}" data-s="rate"></label>
        <label>Langue <select data-s="lang">${LANGS.map((l) => `<option value="${l.code}" ${l.code === v.lang ? "selected" : ""}>${l.label}</option>`).join("")}</select></label>
        <button class="btn small" data-s="test">🔊 Tester la voix</button>
      </div>`
    );
    (card.querySelector("[data-s=pr]") as HTMLSelectElement).value = String(s.pixelRatio);
    card.oninput = (e) => {
      const el = e.target as HTMLInputElement;
      const k = el.dataset.s;
      if (k === "sens") G.input.sensitivity = +el.value;
      if (k === "invert") G.input.invertY = el.checked;
      if (k === "vol") G.audio.setVolume(+el.value);
      if (k === "bloom") s.bloom = el.checked;
      if (k === "shadows") s.shadows = el.checked;
      if (k === "ao") s.ao = el.checked;
      if (k === "pr") s.pixelRatio = +el.value;
      if (k === "neural") v.neural = el.checked;
      if (k === "nv") v.neuralVoice = el.value;
      if (k === "rate") v.rate = +el.value;
      if (k === "lang") {
        v.lang = el.value;
        $<HTMLSelectElement>("langSel").value = el.value;
      }
      this.griot.voice.saveSettings();
      bus.emit("settings");
    };
    card.onclick = (e) => {
      if ((e.target as HTMLElement).dataset.s === "ultra") {
        Object.assign(s, { bloom: true, shadows: true, ao: true, pixelRatio: 1 });
        bus.emit("settings");
        this.settings();
        this.toast("✨ Qualité Ultra activée (plus gourmand en batterie).");
        return;
      }
      if ((e.target as HTMLElement).dataset.s === "test") this.griot.voice.say(v.lang.startsWith("fr") ? "Bonjour Majesté. Je suis GRIOT. Votre royaume vous attend." : "Hello, Your Majesty. I am GRIOT. Your kingdom awaits.");
    };
  }

  // ---------------------------------------------------------------- carte
  map(tab: "world" | "palace" | "earth" = G.palace.floorAt(G.player.position) >= 0 && G.mode === "foot" ? "palace" : "world") {
    const card = this.openModal(
      "map",
      `<h2 class="mt">Carte du royaume</h2>
      <nav class="tabs inline"><button data-mt="world" class="${tab === "world" ? "on" : ""}">Monde</button><button data-mt="earth" class="${tab === "earth" ? "on" : ""}">Grand monde</button><button data-mt="palace" class="${tab === "palace" ? "on" : ""}">Palais</button></nav>
      <div id="mapBody"></div>`,
      "wide"
    );
    const body = card.querySelector("#mapBody") as HTMLElement;
    if (tab === "world" || tab === "earth") {
      const big = tab === "earth";
      const toM = (x: number, z: number, sz: number): [number, number] => (big ? G.world.toWorldMap(x, z, sz) : G.world.toMap(x, z, sz));
      const shown = (mk: { pos: THREE.Vector3 }) => !big || Math.max(Math.abs(mk.pos.x), Math.abs(mk.pos.z)) > WORLD / 2;
      body.innerHTML = `<div class="map-wrap"><canvas id="bigMap" width="720" height="720"></canvas></div><p class="hint">${big ? "Le grand monde : 10 pays au-delà de l'océan. " : ""}Cliquez sur un lieu : voyage instantané à pied, ou pilote automatique si vous êtes aux commandes du Royal Talon.</p>`;
      const cv = body.querySelector("canvas")!;
      const c = cv.getContext("2d")!;
      const draw = () => {
        c.drawImage(big ? G.world.worldCanvas : G.world.mapCanvas, 0, 0, 720, 720);
        if (big) {
          c.fillStyle = "#ffd27a";
          c.font = "bold 13px Manrope, Arial";
          c.textAlign = "center";
          c.fillText("VOTRE ROYAUME", 360, 345);
        }
        for (const mk of G.world.markers) {
          if (!mk.visible() || !shown(mk)) continue;
          const [x, y] = toM(mk.pos.x, mk.pos.z, 720);
          c.fillStyle = "rgba(4,10,24,.7)";
          c.beginPath();
          c.arc(x, y, 14, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = mk.icon === "◆" ? "#4fe0ff" : "#ffd27a";
          c.font = "16px Arial";
          c.textAlign = "center";
          c.fillText(mk.icon, x, y + 6);
          c.fillStyle = "#fff";
          c.font = "12px Manrope, Arial";
          c.fillText(mk.name, x, y + 28);
        }
        if (!big) G.world.rings.forEach((r, i) => {
          const [x, y] = toM(r.pos.x, r.pos.z, 720);
          c.strokeStyle = i < G.missions.state.rings ? "#3fff9a" : "#ffc861";
          c.beginPath();
          c.arc(x, y, 3, 0, Math.PI * 2);
          c.stroke();
        });
        const p = G.mode === "ship" ? G.ship.root.position : G.player.position;
        const [px, py] = toM(p.x, p.z, 720);
        const yaw = G.mode === "ship" ? G.ship.yaw : G.player.yaw;
        c.save();
        c.translate(px, py);
        c.rotate(-yaw);
        c.fillStyle = "#ff4fd8";
        c.beginPath();
        c.moveTo(0, -11);
        c.lineTo(7, 8);
        c.lineTo(-7, 8);
        c.closePath();
        c.fill();
        c.restore();
      };
      draw();
      cv.onclick = (e) => {
        const r = cv.getBoundingClientRect();
        const mx = ((e.clientX - r.left) / r.width) * 720,
          my = ((e.clientY - r.top) / r.height) * 720;
        let best: any = null,
          bd = 30;
        for (const mk of G.world.markers) {
          if (!mk.visible() || !shown(mk)) continue;
          const [x, y] = toM(mk.pos.x, mk.pos.z, 720);
          const d = Math.hypot(x - mx, y - my);
          if (d < bd) {
            bd = d;
            best = mk;
          }
        }
        if (!best) return;
        const place = PLACES.find((p) => p.id === best.id);
        this.closeModal();
        if (place) runAction(G.mode === "ship" ? "fly_to" : "teleport", place.id).then((r) => this.toast(r));
        else {
          const dest = best.pos.clone();
          dest.y = G.physics.ground(dest.x, 3000, dest.z, 0).y;
          if (G.mode === "ship") G.ship.flyTo(dest, best.name);
          else G.player.teleport(dest.add(new THREE.Vector3(6, 0, 6)));
        }
      };
    } else {
      const cur = G.palace.floorAt(G.player.position);
      body.innerHTML = `<div class="floors">${FLOORS.map((f, i) => ({ f, i }))
        .reverse()
        .map(
          ({ f, i }) => `<button class="floor ${cur === i ? "on" : ""}" data-floor="${i}"><b>${f.n}</b><span>${f.name}</span><small>${FLOOR_ROOMS[i]}</small></button>`
        )
        .join("")}</div><p class="hint">Cliquez sur un étage pour vous y rendre (ascenseur express). Extérieur : jardins royaux au sud, plate-forme de lancement devant le hangar.</p>`;
      body.onclick = (e) => {
        const b = (e.target as HTMLElement).closest("[data-floor]") as HTMLElement | null;
        if (!b) return;
        this.closeModal();
        runAction("go_to_floor", String(+b.dataset.floor! + 1)).then((r) => this.toast(r));
      };
    }
    card.querySelectorAll<HTMLElement>("[data-mt]").forEach((b) => (b.onclick = () => this.map(b.dataset.mt as any)));
  }

  // ---------------------------------------------------------------- clés d'IA (Groq gratuite, OpenAI)
  keyPanel() {
    const hasG = !!getGroqKey();
    const hasO = !!getOpenAIKey();
    const model = (() => {
      try {
        return localStorage.getItem("griot-openai-model") || "gpt-4o-mini";
      } catch {
        return "gpt-4o-mini";
      }
    })();
    const card = this.openModal(
      "key",
      `<h2 class="mt">Clés IA</h2>
      <p class="hint">Collez une clé et GRIOT réfléchit tout de suite. Les clés restent uniquement dans ce navigateur, sur cet appareil.</p>
      <h3>⚡ Groq — gratuit (recommandé)</h3>
      <p class="hint">1. Ouvrez <a href="https://console.groq.com/keys" target="_blank" rel="noopener">console.groq.com/keys</a> et connectez-vous (Google ou e-mail).<br>2. Touchez <b>Create API Key</b>, puis copiez la clé (elle commence par <code>gsk_</code>).<br>3. Collez-la ici et touchez <b>Enregistrer</b>.</p>
      <div class="form">
        <label>Clé Groq <input id="gqKey" type="password" autocomplete="off" placeholder="${hasG ? "•••••••• (enregistrée)" : "gsk_…"}"></label>
      </div>
      <h3>OpenAI — payant (voix naturelle « onyx », images, PDF)</h3>
      <div class="form">
        <label>Clé OpenAI <input id="oaKey" type="password" autocomplete="off" placeholder="${hasO ? "•••••••• (enregistrée)" : "sk-…"}"></label>
        <label>Modèle <select id="oaModel"><option value="gpt-4o-mini">gpt-4o-mini (rapide, économique)</option><option value="gpt-4o">gpt-4o (plus intelligent)</option></select></label>
      </div>
      <div class="row wrap">
        <button class="btn primary" data-k="save">Enregistrer</button>
        ${hasG ? `<button class="btn ghost" data-k="delg">Retirer la clé Groq</button>` : ""}
        ${hasO ? `<button class="btn ghost" data-k="delo">Retirer la clé OpenAI</button>` : ""}
        <span class="chip-state">${hasG ? "GROQ ACTIF" : hasO ? "OPENAI ACTIF" : "AUCUNE CLÉ"}</span>
      </div>`
    );
    (card.querySelector("#oaModel") as HTMLSelectElement).value = model;
    card.onclick = async (e) => {
      const k = (e.target as HTMLElement).dataset.k;
      if (!k) return;
      const m = (card.querySelector("#oaModel") as HTMLSelectElement).value;
      try {
        localStorage.setItem("griot-openai-model", m);
      } catch {}
      if (k === "save") {
        const g = (card.querySelector("#gqKey") as HTMLInputElement).value.trim();
        const v = (card.querySelector("#oaKey") as HTMLInputElement).value.trim();
        if (g && !/^gsk_\w{20,}$/.test(g)) return this.toast("Cette clé ne ressemble pas à une clé Groq (gsk_…).", "warn");
        if (v && !/^sk-[\w-]{10,}$/.test(v)) return this.toast("Cette clé ne ressemble pas à une clé OpenAI (sk-…).", "warn");
        if (g) setGroqKey(g);
        if (v) setOpenAIKey(v);
      }
      if (k === "delg") setGroqKey("");
      if (k === "delo") setOpenAIKey("");
      await this.griot.refreshAI();
      this.closeModal();
      this.toast(getGroqKey() ? "⚡ Clé Groq enregistrée : GRIOT réfléchit avec Groq (gratuit)." : getOpenAIKey() ? "🔑 Clé OpenAI enregistrée : GRIOT est connecté." : "Clés retirées.");
    };
  }

  // ---------------------------------------------------------------- multijoueur
  multi() {
    const net = G.net;
    const on = net.status === "on";
    const list = net.list();
    const card = this.openModal(
      "multi",
      `<h2 class="mt">Multijoueur</h2>
      <p class="hint">Même nom de salle = même royaume. Envoyez le lien du site et le nom de la salle à vos amis : vous vous verrez à pied, en armure et en Royal Talon.</p>
      <div class="form">
        <label>Votre nom <input id="mpName" maxlength="16" value="${esc(net.name)}"></label>
        <label>Salle <input id="mpRoom" maxlength="32" value="${esc(net.room)}"></label>
      </div>
      <div class="row wrap">
        ${on ? `<button class="btn" data-mp="off">Se déconnecter</button>` : `<button class="btn primary" data-mp="on">${net.status === "connecting" ? "Connexion…" : "Rejoindre la salle"}</button>`}
        <span class="chip-state">${on ? `CONNECTÉ · ${esc(net.via)}` : net.status === "connecting" ? "CONNEXION…" : net.status === "error" ? "ÉCHEC" : "HORS LIGNE"}</span>
      </div>
      ${on ? `<h3>Joueurs (${list.length + 1})</h3>
      <ul class="list"><li><span>♛ ${esc(net.name)} (vous)</span></li>${list.map((p) => `<li><span>👤 ${esc(p.name)} <small class="hint">${esc(p.zone)}</small></span>${G.mode === "foot" ? `<button class="link" data-go="${esc(p.id)}">Rejoindre</button>` : ""}</li>`).join("")}</ul>
      <form id="mpSay" class="row"><input id="mpText" maxlength="200" placeholder="Message à tous les joueurs…"><button class="btn small">Envoyer</button></form>` : ""}`
    );
    card.onclick = (e) => {
      const el = e.target as HTMLElement;
      if (el.dataset.mp === "on") {
        net.connect(($("mpName") as HTMLInputElement).value, ($("mpRoom") as HTMLInputElement).value);
        setTimeout(() => this.modalOpen === "multi" && this.multi(), 50);
      }
      if (el.dataset.mp === "off") {
        net.disconnect();
        this.multi();
      }
      if (el.dataset.go) {
        const p = net.list().find((x) => x.id === el.dataset.go);
        if (p) {
          this.closeModal();
          G.player.teleport(p.pos.clone().add(new THREE.Vector3(1.5, 0.2, 1.5)));
        }
      }
    };
    card.querySelector("#mpSay")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const inp = $("mpText") as HTMLInputElement;
      if (net.say(inp.value)) inp.value = "";
    });
  }

  // ---------------------------------------------------------------- royaume (salle du trône)
  kingdom() {
    const card = this.openModal(
      "kingdom",
      `<h2 class="mt">Interface du royaume</h2>
      <div class="cols">
        <section><h3>Temps</h3>
          <input type="range" min="0" max="24" step="0.1" value="${G.env.hour}" data-k="hour" style="width:100%">
          <div class="row wrap"><button class="pill" data-h="6.4">Aube</button><button class="pill" data-h="12.5">Midi</button><button class="pill" data-h="18.6">Coucher</button><button class="pill" data-h="23">Nuit</button></div>
          <label><input type="checkbox" ${G.env.autoTime ? "checked" : ""} data-k="auto"> Cycle jour/nuit automatique</label>
          <h3>Lumières du palais</h3>
          <div class="row wrap">${[["Naturel", "null"], ["Bleu royal", "0x2a8cff"], ["Or", "0xffc861"], ["Violet", "0x8a5cff"], ["Blanc", "0xffffff"]].map(([n, c]) => `<button class="pill" data-tint="${c}">${n}</button>`).join("")}</div>
        </section>
        <section><h3>Royal Talon</h3>
          <p>${G.ship.engines ? "Moteurs en marche" : G.ship.ready ? "Prêt au décollage" : "Au hangar"} · énergie ${Math.round(G.ship.energy * 100)} %</p>
          <div class="row wrap"><button class="btn small" data-act="prepare_ship">Préparer</button><button class="btn small" data-act="board_ship">Rejoindre le cockpit</button><button class="btn small" data-act="open_door|garage">Ouvrir le hangar</button></div>
          <h3>Armure Royale</h3>
          <div class="row wrap"><button class="btn small" data-act="equip_armor">Déployer</button><button class="btn small" data-act="remove_armor">Ranger</button></div>
          <h3>Voyage rapide</h3>
          <div class="row wrap">${PLACES.map((p) => `<button class="pill" data-act="teleport|${p.id}">${p.name}</button>`).join("")}</div>
        </section>
      </div>
      <button class="btn primary" data-report>🎙 Rapport de GRIOT</button>`,
      "wide"
    );
    card.oninput = (e) => {
      const el = e.target as HTMLInputElement;
      if (el.dataset.k === "hour") G.env.setHour(+el.value);
      if (el.dataset.k === "auto") G.env.autoTime = el.checked;
    };
    card.onclick = async (e) => {
      const el = e.target as HTMLElement;
      if (el.dataset.h) G.env.setHour(+el.dataset.h);
      if (el.dataset.tint) G.palace.tint = el.dataset.tint === "null" ? null : Number(el.dataset.tint);
      if (el.dataset.act) {
        const [a, t] = el.dataset.act.split("|");
        if (a === "board_ship" || a === "teleport") this.closeModal();
        const r = await runAction(a, t);
        this.toast(r);
      }
      if (el.hasAttribute("data-report")) {
        this.closeModal();
        const r = await runAction("mission_report");
        const s = await runAction("status_report");
        bus.emit("griot:say", { text: `${s} ${r}` });
      }
    };
  }

  // ---------------------------------------------------------------- centre de commandement
  command(tab = "missions") {
    const m = G.missions;
    const projects = ((window as any).__griotProjects ?? []) as any[];
    const content =
      tab === "missions"
        ? `<div class="missions">${m.defs.map((d) => `<div class="mission ${m.isDone(d.id) ? "done" : ""}"><div><strong>${m.isDone(d.id) ? "✔" : "◇"} ${d.title}</strong><small>${m.isDone(d.id) ? "Accomplie" : m.progressText(d.id)}</small></div></div>`).join("")}</div>`
        : tab === "systems"
          ? `<table class="sys">${[
              ["Position", G.world.zoneName(G.player.position)],
              ["Heure du royaume", fmtHour(G.env.hour)],
              ["Royal Talon", `${G.ship.ready ? "prêt" : "au repos"} · énergie ${Math.round(G.ship.energy * 100)} % · ${G.missions.state.tech.includes("fusion") ? "réacteur à fusion installé" : "réacteur standard"}`],
              ["Armure", `${G.armor.worn ? "portée" : "sur socle"} · énergie ${Math.round(G.armor.energy * 100)} %`],
              ["Technologies", G.missions.state.tech.join(", ") || "aucune"],
              ["Armures", G.missions.state.armors.map((a) => VARIANTS[a].name).join(", ")],
              ["Éclats de données", `${G.missions.state.shards.length}/3`],
              ["Moteur d'IA", this.griot.ai ? "connecté" : "local (sans clé API)"]
            ]
              .map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`)
              .join("")}</table>`
          : `<div>${projects.length ? projects.map((p) => `<p><strong>${esc(p.name)}</strong> — ${esc(p.status)} · ${p.tasks.filter((t: any) => t.done).length}/${p.tasks.length} tâches</p>`).join("") : "<p class='hint'>Aucun projet.</p>"}</div>`;
    const card = this.openModal(
      "command",
      `<h2 class="mt">Centre de commandement</h2>
      <nav class="tabs inline">${[["missions", "Missions"], ["systems", "Systèmes"], ["projects", "Projets"]].map(([k, v]) => `<button data-ct="${k}" class="${k === tab ? "on" : ""}">${v}</button>`).join("")}</nav>
      ${content}
      <div class="row wrap"><button class="btn primary" data-rep="projects">🎙 Rapport sur mes projets</button><button class="btn" data-rep="missions">Rapport de missions</button><button class="btn" data-open-panel>Ouvrir GRIOT</button></div>`,
      "wide"
    );
    card.onclick = (e) => {
      const el = e.target as HTMLElement;
      if (el.dataset.ct) this.command(el.dataset.ct);
      if (el.dataset.rep) {
        this.closeModal();
        this.togglePanel(true);
        this.griot.send(el.dataset.rep === "projects" ? "Fais-moi un rapport sur mes projets" : "Rapport sur mes missions");
      }
      if (el.hasAttribute("data-open-panel")) {
        this.closeModal();
        this.togglePanel(true);
      }
    };
  }

  elevator() {
    const card = this.openModal(
      "elevator",
      `<h2 class="mt">Ascenseur royal</h2><div class="floors">${FLOORS.map((f, i) => ({ f, i }))
        .reverse()
        .map(({ f, i }) => `<button class="floor ${G.palace.elevator.floor === i ? "on" : ""}" data-floor="${i}"><b>${f.n}</b><span>${f.name}</span></button>`)
        .join("")}</div>`
    );
    card.onclick = (e) => {
      const b = (e.target as HTMLElement).closest("[data-floor]") as HTMLElement | null;
      if (!b) return;
      G.palace.callElevator(+b.dataset.floor!);
      this.closeModal();
      if (!G.mobile) $("scene").requestPointerLock?.();
    };
  }

  // ---------------------------------------------------------------- armure (inspection & personnalisation)
  armorPanel() {
    const st = G.armor.style;
    const swatches = ["#2a8cff", "#8a5cff", "#00e5ff", "#ffc861", "#ff3048", "#2bff88", "#e8f4ff", "#ff5fc8"];
    const card = this.openModal(
      "armor",
      `<h2 class="mt">Armure Royale</h2>
      <p class="hint">Glissez pour tourner autour · molette pour zoomer · Échap pour quitter</p>
      <div class="row wrap"><button class="btn primary" data-ar="activate">${G.armor.displayActive ? "⚡ Désactiver" : "⚡ Activer"}</button><button class="btn primary" data-ar="wear">🛡 Porter l'armure</button></div>
      <h3>Circuits lumineux</h3>
      <div class="row wrap">${swatches.map((c) => `<button class="swatch ${st.glow === c ? "on" : ""}" style="--c:${c}" data-glow="${c}"></button>`).join("")}<input type="color" value="${st.glow}" data-in="glow"></div>
      <h3>Alliage</h3>
      <div class="row wrap">${["#0b0b12", "#050507", "#1c2030", "#c8ccd6", "#3a2a0a", "#efeae0"].map((c) => `<button class="swatch ${st.primary === c ? "on" : ""}" style="--c:${c}" data-primary="${c}"></button>`).join("")}<input type="color" value="${st.primary}" data-in="primary"></div>
      <h3>Motif</h3>
      <div class="row wrap">${(["lines", "hex", "chevron"] as Pattern[]).map((p) => `<button class="pill ${st.pattern === p ? "on" : ""}" data-pattern="${p}">${{ lines: "Lignes", hex: "Hexagones", chevron: "Chevrons" }[p]}</button>`).join("")}</div>
      <h3>Effet</h3>
      <div class="row wrap">${(["steady", "pulse", "flow"] as const).map((p) => `<button class="pill ${st.effect === p ? "on" : ""}" data-effect="${p}">${{ steady: "Constant", pulse: "Pulsation", flow: "Flux" }[p]}</button>`).join("")}</div>
      <label>Intensité <input type="range" min="0.3" max="3" step="0.1" value="${st.intensity}" data-in="intensity"></label>
      <h3>Variantes</h3>
      <div class="row wrap">${Object.entries(VARIANTS)
        .map(([id, v]) => `<button class="pill ${G.missions.state.armors.includes(id) ? "" : "locked"}" data-variant="${id}" title="${v.how}">${G.missions.state.armors.includes(id) ? "" : "🔒 "}${v.name}</button>`)
        .join("")}</div>
      <h3>Capacités (fictives)</h3>
      <ul class="caps"><li><b>1 · Impulsion cinétique</b> — libère l'énergie absorbée en onde de choc.</li><li><b>2 · Bouclier hexagonal</b> — dôme protecteur (requiert le Nano-tissage).</li><li><b>3 · Surcharge</b> — vitesse ×1,7 et saut ×1,9.</li><li><b>4 · Vision tactique</b> — vision nocturne et repérage.</li><li><b>X · Masque rétractable</b></li></ul>`,
      "side"
    );
    const apply = (patch: Partial<typeof st>) => {
      G.armor.setStyle({ ...G.armor.style, ...patch });
      this.armorPanel();
    };
    card.onclick = (e) => {
      const el = e.target as HTMLElement;
      if (el.dataset.ar === "activate") {
        G.armor.activateDisplay();
        this.armorPanel();
      }
      if (el.dataset.ar === "wear") G.armor.equip();
      if (el.dataset.glow) apply({ glow: el.dataset.glow });
      if (el.dataset.primary) apply({ primary: el.dataset.primary });
      if (el.dataset.pattern) apply({ pattern: el.dataset.pattern as Pattern });
      if (el.dataset.effect) apply({ effect: el.dataset.effect as any });
      if (el.dataset.variant) {
        const id = el.dataset.variant;
        if (!G.missions.state.armors.includes(id)) return this.toast(`🔒 ${VARIANTS[id].name} : ${VARIANTS[id].how}`, "warn");
        apply({ ...VARIANTS[id].style });
      }
    };
    card.oninput = (e) => {
      const el = e.target as HTMLInputElement;
      if (el.dataset.in === "glow") G.armor.setStyle({ ...G.armor.style, glow: el.value });
      if (el.dataset.in === "primary") G.armor.setStyle({ ...G.armor.style, primary: el.value });
      if (el.dataset.in === "intensity") G.armor.setStyle({ ...G.armor.style, intensity: +el.value });
    };
  }

  // ---------------------------------------------------------------- tactile
  private bindTouch() {
    $("touch").hidden = false;
    // capacités de l'armure au toucher (et au clic)
    document.querySelectorAll<HTMLElement>("#armorHud [data-ab]").forEach((el) => {
      el.addEventListener("click", () => G.armor.ability(el.dataset.ab!));
    });
    // toucher la bulle « ◎ … » = interagir
    $("prompt").addEventListener("click", () => G.input.tap("KeyE"));
    // pas de zoom / défilement parasite sur iPad
    document.addEventListener("gesturestart", (e) => e.preventDefault());
    document.addEventListener("touchmove", (e) => {
      if (!(e.target as HTMLElement).closest(".panel, .modal-card")) e.preventDefault();
    }, { passive: false });
    const stick = $("stick");
    const knob = stick.querySelector("i") as HTMLElement;
    let sid: number | null = null;
    let sx = 0,
      sy = 0;
    stick.addEventListener("touchstart", (e) => {
      const t = e.changedTouches[0];
      sid = t.identifier;
      sx = t.clientX;
      sy = t.clientY;
      e.preventDefault();
    });
    stick.addEventListener("touchmove", (e) => {
      for (const t of e.changedTouches)
        if (t.identifier === sid) {
          const dx = clamp((t.clientX - sx) / 50, -1, 1),
            dy = clamp((t.clientY - sy) / 50, -1, 1);
          G.input.touchMove.x = dx;
          G.input.touchMove.y = dy;
          knob.style.transform = `translate(${dx * 35}px, ${dy * 35}px)`;
        }
      e.preventDefault();
    });
    const endStick = () => {
      sid = null;
      G.input.touchMove.x = G.input.touchMove.y = 0;
      knob.style.transform = "";
    };
    stick.addEventListener("touchend", endStick);
    stick.addEventListener("touchcancel", endStick);
    const look = $("lookZone");
    let lid: number | null = null,
      lx = 0,
      ly = 0;
    look.addEventListener("touchstart", (e) => {
      const t = e.changedTouches[0];
      lid = t.identifier;
      lx = t.clientX;
      ly = t.clientY;
    });
    look.addEventListener("touchmove", (e) => {
      for (const t of e.changedTouches)
        if (t.identifier === lid) {
          G.input.touchLook.x += (t.clientX - lx) * 0.006;
          G.input.touchLook.y += (t.clientY - ly) * 0.006;
          lx = t.clientX;
          ly = t.clientY;
        }
      e.preventDefault();
    });
    look.addEventListener("touchend", () => (lid = null));
    document.querySelectorAll<HTMLButtonElement>("#touch [data-t]").forEach((b) => {
      const code = b.dataset.t!;
      b.addEventListener("touchstart", (e) => {
        e.preventDefault();
        G.audio.unlock();
        if (code === "Escape") return this.menu();
        if (code === "KeyM") return this.map();
        G.input.touchButtons.add(code);
        G.input.tap(code);
      });
      b.addEventListener("touchend", () => G.input.touchButtons.delete(code));
    });
  }

  // ---------------------------------------------------------------- HUD par frame
  update(dt: number, t: number) {
    const p = G.mode === "ship" ? G.ship.root.position : G.player.position;
    const yaw = G.mode === "ship" ? G.ship.yaw : G.player.yaw;
    if (Math.floor(t * 4) !== Math.floor((t - dt) * 4)) {
      $("zone").textContent = G.world.zoneName(p);
      $("clock").textContent = fmtHour(G.env.hour);
      $("rank").textContent = G.missions.rankName();
      $("level").textContent = String(G.missions.level());
      const tr = this.tracked && !G.missions.isDone(this.tracked) ? G.missions.defs.find((d) => d.id === this.tracked) : G.missions.defs.find((d) => !G.missions.isDone(d.id));
      $("objective").innerHTML = tr ? `<b>◇ ${tr.title}</b><br>${G.missions.progressText(tr.id)}` : "<b>✔ Toutes les missions accomplies</b>";
      const deg = ((((-yaw * 180) / Math.PI) % 360) + 360) % 360;
      $("compass").textContent = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"][Math.round(deg / 45) % 8];
      if (G.mode === "ship") {
        const s = G.ship;
        $("spd").textContent = String(Math.round(Math.abs(s.speed) * 3.6));
        $("alt").textContent = String(Math.round(p.y));
        $("agl").textContent = `sol +${Math.max(0, Math.round(p.y - G.physics.ground(p.x, p.y - 1.35, p.z, 0.5).y - 1.35))} m`;
        $("hdg").textContent = `CAP ${String(Math.round(deg)).padStart(3, "0")}°`;
        $("shipStatus").innerHTML = [
          `<span class="${s.engines ? "on" : ""}">MOTEURS</span>`,
          `<span class="${s.lights ? "on" : ""}">FEUX</span>`,
          `<span class="${s.landed ? "on" : ""}">POSÉ</span>`,
          s.stealth ? `<span class="on">👁‍🗨 FURTIF ${Math.round(s.energy * 100)}%</span>` : "",
          s.supersonic || s.mach > 0.8 ? `<span class="on">🚀 MACH ${s.mach.toFixed(2)}</span>` : "",
          G.antiair?.armed && G.antiair.lockedName ? `<span>🛡 DCA : ${esc(G.antiair.lockedName)}</span>` : "",
          s.autopilot ? `<span class="on">AUTO ▸ ${esc(s.autopilot.label)}</span>` : "",
          s.canBoost() ? `<span>POST-COMB. ${Math.round(s.energy * 100)}%</span>` : ""
        ].join("");
      }
      $("armorHud").hidden = !G.armor.worn || G.mode !== "foot" || G.armor.maskUp;
    }
    $("carHud").hidden = (G.mode as string) !== "car";
    if ((G.mode as string) === "car" && G.cars.active) {
      $("carSpd").textContent = String(Math.round(Math.abs(G.cars.active.speed) * 3.6));
      $("carName").textContent = G.cars.active.def.name;
    }
    if (G.mode === "ship") {
      $("thr").style.width = `${G.ship.throttle * 100}%`;
      this.drawAttitude();
    }
    if (G.armor.worn) $("armorEnergy").style.width = `${G.armor.energy * 100}%`;
    this.visor.update(t);
    this.drawMinimap(p, yaw);
    this.drawAvatar(t);
  }

  private drawMinimap(p: THREE.Vector3, yaw: number) {
    const c = this.mini;
    const S = 180;
    c.clearRect(0, 0, S, S);
    c.save();
    c.beginPath();
    c.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    c.clip();
    const span = G.mode === "ship" ? 2600 : 700; // mètres affichés
    const scale = S / span;
    const inCore = Math.max(Math.abs(p.x), Math.abs(p.z)) < WORLD / 2 - span / 2;
    const pxPerM = inCore ? 512 / WORLD : 720 / EARTH;
    c.translate(S / 2, S / 2);
    c.rotate(yaw);
    const [mx, my] = inCore ? G.world.toMap(p.x, p.z, 512) : G.world.toWorldMap(p.x, p.z, 720);
    const srcSpan = span * pxPerM;
    c.drawImage(inCore ? G.world.mapCanvas : G.world.worldCanvas, mx - srcSpan / 2, my - srcSpan / 2, srcSpan, srcSpan, -S / 2, -S / 2, S, S);
    for (const mk of G.world.markers) {
      if (!mk.visible()) continue;
      const dx = (mk.pos.x - p.x) * scale,
        dz = -(mk.pos.z - p.z) * scale;
      const d = Math.hypot(dx, dz);
      const k = d > S / 2 - 10 ? (S / 2 - 10) / d : 1;
      c.fillStyle = mk.icon === "◆" ? "#4fe0ff" : "#ffd27a";
      c.font = "12px Arial";
      c.textAlign = "center";
      c.save();
      c.translate(dx * k, dz * k);
      c.rotate(-yaw);
      c.fillText(mk.icon, 0, 4);
      c.restore();
    }
    if (G.mode === "ship" && !G.missions.isDone("rings")) {
      const r = G.world.rings[G.missions.state.rings % G.world.rings.length];
      if (r) {
        c.strokeStyle = "#ffc861";
        c.beginPath();
        c.arc((r.pos.x - p.x) * scale, -(r.pos.z - p.z) * scale, 4, 0, Math.PI * 2);
        c.stroke();
      }
    }
    c.restore();
    c.strokeStyle = "rgba(79,210,255,.8)";
    c.lineWidth = 2;
    c.beginPath();
    c.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = "#ff4fd8";
    c.beginPath();
    c.moveTo(S / 2, S / 2 - 8);
    c.lineTo(S / 2 + 6, S / 2 + 6);
    c.lineTo(S / 2 - 6, S / 2 + 6);
    c.closePath();
    c.fill();
  }

  private drawAttitude() {
    const c = this.att;
    const s = G.ship;
    const W = 220;
    c.clearRect(0, 0, W, W);
    c.save();
    c.translate(W / 2, W / 2);
    c.beginPath();
    c.arc(0, 0, 100, 0, Math.PI * 2);
    c.clip();
    c.rotate(-s.roll);
    const off = s.pitch * 120;
    c.fillStyle = "rgba(20,70,130,.45)";
    c.fillRect(-150, -300 + off, 300, 300);
    c.fillStyle = "rgba(90,60,20,.45)";
    c.fillRect(-150, off, 300, 300);
    c.strokeStyle = "rgba(191,240,255,.9)";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-150, off);
    c.lineTo(150, off);
    c.stroke();
    c.font = "10px JetBrains Mono, monospace";
    c.fillStyle = "rgba(191,240,255,.8)";
    for (let k = -3; k <= 3; k++) {
      if (!k) continue;
      const y = off - k * 0.17 * 120;
      c.beginPath();
      c.moveTo(-25, y);
      c.lineTo(25, y);
      c.stroke();
      c.fillText(String(k * 10), 30, y + 3);
    }
    c.restore();
    c.strokeStyle = "#ffd27a";
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(W / 2 - 50, W / 2);
    c.lineTo(W / 2 - 15, W / 2);
    c.lineTo(W / 2, W / 2 + 10);
    c.lineTo(W / 2 + 15, W / 2);
    c.lineTo(W / 2 + 50, W / 2);
    c.stroke();
    c.strokeStyle = "rgba(79,210,255,.7)";
    c.lineWidth = 2;
    c.beginPath();
    c.arc(W / 2, W / 2, 101, 0, Math.PI * 2);
    c.stroke();
  }

  /** Avatar de GRIOT : visage holographique dont la bouche suit l'amplitude de la voix. */
  private drawAvatar(t: number, c = this.avatarCtx) {
    const W = 120;
    c.clearRect(0, 0, W, W);
    const lvl = this.voiceState === "speaking" ? this.level : 0;
    const col = this.voiceState === "listening" ? "#3fff9a" : this.voiceState === "thinking" ? "#ffc861" : "#4fd2ff";
    c.save();
    c.translate(W / 2, W / 2);
    for (let k = 0; k < 3; k++) {
      c.strokeStyle = col;
      c.globalAlpha = 0.25 + k * 0.15;
      c.lineWidth = 1.5;
      c.beginPath();
      const r = 50 - k * 7 + Math.sin(t * 2 + k) * 1.5 + lvl * 4;
      c.arc(0, 0, r, t * (0.6 + k * 0.4), t * (0.6 + k * 0.4) + Math.PI * 1.5);
      c.stroke();
    }
    c.globalAlpha = 1;
    const g = c.createRadialGradient(0, -4, 4, 0, 0, 34);
    g.addColorStop(0, "rgba(120,220,255,.55)");
    g.addColorStop(1, "rgba(10,40,80,.15)");
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(0, 0, 25, 31, 0, 0, Math.PI * 2);
    c.fill();
    // yeux
    const blink = Math.sin(t * 0.9) > 0.985 ? 0.15 : 1;
    c.fillStyle = col;
    c.shadowColor = col;
    c.shadowBlur = 10;
    for (const s of [-1, 1]) {
      c.beginPath();
      c.ellipse(s * 10, -7, 5, 2.4 * blink, s * -0.25, 0, Math.PI * 2);
      c.fill();
    }
    // bouche (synchronisation labiale)
    const open = 1.5 + lvl * 9;
    c.beginPath();
    c.ellipse(0, 13, 8 + lvl * 2, open, 0, 0, Math.PI * 2);
    c.fill();
    c.shadowBlur = 0;
    c.restore();
  }
}

const FLOOR_ROOMS = [
  "Escalier monumental · statues · trône du hall · écrans holographiques",
  "Trône royal · table holographique · vue panoramique",
  "Chambre · dressing · cinéma · salle de détente · salon · terrasse",
  "Consoles · écrans géants · carte du royaume · Archives royales (verrouillées)",
  "Prototypes holographiques · cuves · bras robotisé · coffre",
  "Armure Royale · vitrines d'armures · gadgets · moto antigravité",
  "Royal Talon · navette · portes du hangar · plate-forme de lancement"
];
