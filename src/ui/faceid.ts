// RECONNAISSANCE FACIALE — 2 administrateurs au maximum.
// Tout se passe dans le navigateur : les visages ne quittent jamais l'appareil (empreintes de 128 nombres
// dans le stockage local, aucune photo enregistrée, rien envoyé au serveur). Modèles gratuits (face-api,
// servis par le site lui-même). Verrou facial optionnel au démarrage, avec code de secours.
import { bus } from "../core";

type Admin = { name: string; samples: number[][]; added: number };
const K_ADMINS = "griot-admins";
const K_LOCK = "griot-facelock";
const K_PIN = "griot-admin-pin";
const K_SESSION = "griot-admin-session";
const MAX = 2;
const THRESHOLD = 0.5; // distance euclidienne max entre deux empreintes du même visage

const store = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem(k);
      return v ? (JSON.parse(v) as T) : d;
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* stockage indisponible */
    }
  },
  del(k: string) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* rien */
    }
  }
};

async function sha(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("griot:" + text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

let api: any = null;
async function faceapi() {
  if (api) return api;
  const m: any = await import("@vladmandic/face-api");
  const base = new URL("models/face/", document.baseURI).href;
  await Promise.all([m.nets.tinyFaceDetector.loadFromUri(base), m.nets.faceLandmark68Net.loadFromUri(base), m.nets.faceRecognitionNet.loadFromUri(base)]);
  api = m;
  return m;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export class FaceID {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private busy = false;
  private lockEl: HTMLElement | null = null;
  admin: string | null = null;

  constructor(private openModal: (id: string, html: string, cls?: string) => HTMLElement, private onClose: (fn: () => void) => void) {
    try {
      this.admin = sessionStorage.getItem(K_SESSION);
    } catch {
      this.admin = null;
    }
    bus.on("ui:faceid", () => this.panel());
    this.badge();
  }

  get admins(): Admin[] {
    return store.get<Admin[]>(K_ADMINS, []);
  }
  get locked() {
    return store.get<boolean>(K_LOCK, false) && this.admins.length > 0;
  }

  /** À appeler au démarrage : affiche l'écran de verrouillage si le verrou facial est actif. */
  startLock() {
    if (!this.locked || this.admin) return;
    const el = document.createElement("div");
    el.className = "faceid-lock";
    el.innerHTML = `<div class="fl-card">
        <div class="fl-crown">♛</div>
        <h2>GRIOT est verrouillé</h2>
        <p>Reconnaissance faciale des administrateurs</p>
        <div class="fl-cam"><video playsinline muted></video><div class="fl-ring"></div></div>
        <div class="fl-status">Touchez « Déverrouiller » puis regardez la caméra.</div>
        <button class="btn primary" data-fl="scan">🙂 Déverrouiller avec mon visage</button>
        <details><summary>Code de secours</summary><div class="row"><input type="password" inputmode="numeric" placeholder="Code" data-fl="pin"><button class="btn" data-fl="pinok">OK</button></div></details>
      </div>`;
    document.body.appendChild(el);
    this.lockEl = el;
    const status = el.querySelector<HTMLElement>(".fl-status")!;
    el.querySelector<HTMLButtonElement>('[data-fl="scan"]')!.onclick = async () => {
      const name = await this.recognize(el.querySelector("video")!, status, 25000);
      if (name) this.unlock(name);
    };
    el.querySelector<HTMLButtonElement>('[data-fl="pinok"]')!.onclick = async () => {
      const v = el.querySelector<HTMLInputElement>('[data-fl="pin"]')!.value.trim();
      if (v && (await sha(v)) === store.get<string>(K_PIN, "")) this.unlock(this.admins[0]?.name ?? "Administrateur");
      else status.textContent = "Code incorrect.";
    };
  }

  private unlock(name: string) {
    this.setSession(name);
    if (this.lockEl) {
      this.lockEl.classList.add("open");
      const el = this.lockEl;
      setTimeout(() => el.remove(), 700);
      this.lockEl = null;
    }
    bus.emit("toast", { text: `👑 Bienvenue, ${name}. Accès administrateur accordé.` });
  }

  private setSession(name: string | null) {
    this.admin = name;
    try {
      if (name) sessionStorage.setItem(K_SESSION, name);
      else sessionStorage.removeItem(K_SESSION);
    } catch {
      /* rien */
    }
    this.badge();
    bus.emit("admin:session", name);
  }

  private badge() {
    let b = document.getElementById("adminBadge");
    if (!this.admin) return b?.remove();
    if (!b) {
      b = document.createElement("div");
      b.id = "adminBadge";
      b.className = "admin-badge";
      b.onclick = () => this.panel();
      document.body.appendChild(b);
    }
    b.textContent = `👑 Admin : ${this.admin}`;
  }

  // ---------------------------------------------------------------- caméra et reconnaissance
  private async camera(video: HTMLVideoElement) {
    if (!this.stream) this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    video.srcObject = this.stream;
    video.muted = true;
    video.playsInline = true;
    await video.play().catch(() => undefined);
    this.video = video;
  }

  stopCamera() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    this.video = null;
  }

  private async descriptor(video: HTMLVideoElement) {
    const f = await faceapi();
    const r = await f.detectSingleFace(video, new f.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 })).withFaceLandmarks().withFaceDescriptor();
    return r ? { d: Array.from(r.descriptor as Float32Array), box: r.detection.box as { x: number; y: number; width: number } } : null;
  }

  private best(d: number[]) {
    let name: string | null = null,
      dist = Infinity;
    for (const a of this.admins)
      for (const s of a.samples) {
        let sum = 0;
        for (let i = 0; i < s.length; i++) sum += (s[i] - d[i]) ** 2;
        const e = Math.sqrt(sum);
        if (e < dist) (dist = e), (name = a.name);
      }
    return { name, dist };
  }

  /**
   * Reconnaît un administrateur : il faut 3 correspondances successives et un léger mouvement du visage
   * (une photo immobile ne suffit pas). Renvoie le nom, ou null.
   */
  async recognize(video: HTMLVideoElement, status: HTMLElement, timeout = 20000): Promise<string | null> {
    if (this.busy) return null;
    this.busy = true;
    try {
      status.textContent = "Chargement de la reconnaissance faciale…";
      await faceapi();
      await this.camera(video);
      status.textContent = "Regardez la caméra et bougez légèrement la tête…";
      const t0 = performance.now();
      let hits = 0,
        who: string | null = null;
      const xs: number[] = [];
      while (performance.now() - t0 < timeout) {
        const r = await this.descriptor(video);
        if (!r) {
          status.textContent = "Aucun visage détecté — placez-vous face à la caméra, bien éclairé.";
          hits = 0;
          continue;
        }
        const m = this.best(r.d);
        if (m.name && m.dist < THRESHOLD && (!who || who === m.name)) {
          who = m.name;
          hits++;
          xs.push(r.box.x / Math.max(1, r.box.width));
          const moved = Math.max(...xs) - Math.min(...xs) > 0.04;
          status.textContent = `Visage reconnu : ${m.name} (${Math.round((1 - m.dist) * 100)} %)${moved ? "" : " — bougez un peu la tête"}`;
          if (hits >= 3 && moved) {
            status.textContent = `✅ ${m.name} — accès autorisé`;
            this.stopCamera();
            return m.name;
          }
        } else {
          hits = 0;
          who = null;
          xs.length = 0;
          status.textContent = this.admins.length ? "Visage non reconnu." : "Aucun administrateur enregistré.";
        }
        await new Promise((r2) => setTimeout(r2, 150));
      }
      status.textContent = "Temps écoulé : visage non reconnu.";
      this.stopCamera();
      return null;
    } catch (e) {
      status.textContent = "Caméra indisponible : " + ((e as Error).message || "autorisez la caméra dans Safari.");
      this.stopCamera();
      return null;
    } finally {
      this.busy = false;
    }
  }

  /** Enregistre un visage : 5 empreintes prises en bougeant légèrement la tête. */
  private async enroll(video: HTMLVideoElement, status: HTMLElement): Promise<number[][] | null> {
    try {
      status.textContent = "Chargement de la reconnaissance faciale…";
      await faceapi();
      await this.camera(video);
      const samples: number[][] = [];
      const hints = ["Regardez droit devant", "Tournez un peu la tête à gauche", "Tournez un peu la tête à droite", "Levez légèrement le menton", "Souriez 🙂"];
      const t0 = performance.now();
      while (samples.length < 5 && performance.now() - t0 < 40000) {
        status.textContent = `${hints[samples.length]}… (${samples.length}/5)`;
        await new Promise((r) => setTimeout(r, 700));
        const r = await this.descriptor(video);
        if (!r) {
          status.textContent = "Aucun visage détecté — rapprochez-vous, bonne lumière.";
          await new Promise((r2) => setTimeout(r2, 500));
          continue;
        }
        // le visage ne doit pas déjà appartenir à l'autre administrateur
        const m = this.best(r.d);
        if (m.name && m.dist < THRESHOLD * 0.9 && samples.length === 0) {
          status.textContent = `Ce visage est déjà enregistré (${m.name}).`;
          this.stopCamera();
          return null;
        }
        samples.push(r.d);
        G_beep();
      }
      this.stopCamera();
      if (samples.length < 5) {
        status.textContent = "Enregistrement incomplet, réessayez.";
        return null;
      }
      return samples;
    } catch (e) {
      status.textContent = "Caméra indisponible : " + ((e as Error).message || "autorisez la caméra.");
      this.stopCamera();
      return null;
    }
  }

  // ---------------------------------------------------------------- panneau
  panel() {
    const admins = this.admins;
    const lock = store.get<boolean>(K_LOCK, false);
    const card = this.openModal(
      "faceid",
      `<h2 class="mt">🛡️ Reconnaissance faciale</h2>
      <p class="hint">2 administrateurs maximum. Les visages restent uniquement sur cet appareil (empreintes numériques, aucune photo enregistrée, rien envoyé sur Internet).</p>
      <div class="fid-list">${
        admins.length
          ? admins.map((a, i) => `<div class="fid-row"><span>👑 <b>${esc(a.name)}</b><small> · ajouté le ${new Date(a.added).toLocaleDateString("fr-FR")}</small></span><button class="btn small ghost" data-f="del:${i}">Retirer</button></div>`).join("")
          : `<p class="hint">Aucun administrateur pour l'instant.</p>`
      }</div>
      <div class="fl-cam small"><video playsinline muted></video><div class="fl-ring"></div></div>
      <div class="fl-status fid-status">${this.admin ? `Connecté : 👑 ${esc(this.admin)}` : ""}</div>
      <div class="form" data-f="newform" hidden>
        <label>Nom de l'administrateur <input data-f="name" maxlength="24" placeholder="Prénom"></label>
        ${store.get<string>(K_PIN, "") ? "" : `<label>Code de secours (4 à 8 chiffres) <input data-f="pin" type="password" inputmode="numeric" maxlength="8" placeholder="Code"></label>`}
        <button class="btn primary" data-f="go">📸 Enregistrer mon visage</button>
      </div>
      <div class="row wrap">
        ${admins.length < MAX ? `<button class="btn primary" data-f="add">➕ Ajouter un administrateur (${admins.length}/${MAX})</button>` : ""}
        ${admins.length ? `<button class="btn" data-f="test">🙂 Me reconnaître</button>` : ""}
        ${admins.length ? `<label class="fid-toggle"><input type="checkbox" data-f="lock" ${lock ? "checked" : ""}> Verrou facial au démarrage</label>` : ""}
        ${this.admin ? `<button class="btn ghost" data-f="logout">Se déconnecter</button>` : ""}
      </div>`
    );
    const video = card.querySelector("video")!;
    const status = card.querySelector<HTMLElement>(".fid-status")!;
    this.onClose(() => this.stopCamera());
    // il faut être administrateur (visage ou code) pour modifier quand il existe déjà des administrateurs
    const requireAdmin = async () => {
      if (!this.admins.length || this.admin) return true;
      const name = await this.recognize(video, status);
      if (name) this.setSession(name);
      return !!name;
    };
    card.onclick = async (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-f]");
      if (!el || this.busy) return;
      const f = el.dataset.f!;
      if (f === "add") {
        if (!(await requireAdmin())) return;
        card.querySelector<HTMLElement>('[data-f="newform"]')!.hidden = false;
        card.querySelector<HTMLInputElement>('[data-f="name"]')!.focus();
      } else if (f === "go") {
        const name = card.querySelector<HTMLInputElement>('[data-f="name"]')!.value.trim();
        const pinIn = card.querySelector<HTMLInputElement>('[data-f="pin"]');
        if (!name) return void (status.textContent = "Écrivez d'abord le nom.");
        if (this.admins.some((a) => a.name.toLowerCase() === name.toLowerCase())) return void (status.textContent = "Ce nom existe déjà.");
        if (pinIn && !/^\d{4,8}$/.test(pinIn.value.trim())) return void (status.textContent = "Choisissez un code de secours de 4 à 8 chiffres.");
        this.busy = true;
        const samples = await this.enroll(video, status);
        this.busy = false;
        if (!samples) return;
        if (pinIn) store.set(K_PIN, await sha(pinIn.value.trim()));
        const list = this.admins;
        if (list.length >= MAX) return void (status.textContent = "Déjà 2 administrateurs.");
        list.push({ name, samples, added: Date.now() });
        store.set(K_ADMINS, list);
        this.setSession(name);
        bus.emit("toast", { text: `👑 ${name} est administrateur (${list.length}/${MAX}).` });
        this.panel();
      } else if (f === "test") {
        const name = await this.recognize(video, status);
        if (name) this.setSession(name);
      } else if (f.startsWith("del:")) {
        if (!(await requireAdmin())) return;
        const i = Number(f.slice(4));
        const list = this.admins;
        const [gone] = list.splice(i, 1);
        store.set(K_ADMINS, list);
        if (!list.length) {
          store.del(K_PIN);
          store.set(K_LOCK, false);
        }
        if (gone && this.admin === gone.name) this.setSession(null);
        bus.emit("toast", { text: `${gone?.name ?? "Administrateur"} retiré.` });
        this.panel();
      } else if (f === "lock") {
        const box = el as HTMLInputElement;
        const want = box.checked;
        box.checked = !want;
        if (!(await requireAdmin())) return;
        store.set(K_LOCK, want);
        box.checked = want;
        bus.emit("toast", { text: want ? "🔒 Verrou facial activé : GRIOT demandera un visage administrateur au démarrage." : "Verrou facial désactivé." });
      } else if (f === "logout") {
        this.setSession(null);
        this.panel();
      }
    };
  }
}

function G_beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.value = 0.05;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.08);
    setTimeout(() => ctx.close(), 200);
  } catch {
    /* rien */
  }
}
