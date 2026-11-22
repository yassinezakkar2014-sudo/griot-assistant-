// LE ROYAL PHONE — smartphone du jeu : messages (salon de tous les joueurs + messages privés),
// appels vidéo entre joueurs (WebRTC, signalisation par le relais multijoueur), appel avec GRIOT,
// et raccourcis (carte, avatar, vision, multijoueur). Gratuit.
import { G, bus } from "../core";

interface Msg {
  from: string;
  text: string;
  me: boolean;
  at: number;
}

// STUN (trouver son adresse publique) + TURN public gratuit (relais vidéo quand les box/4G bloquent la connexion directe)
const ICE: RTCConfiguration = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:stun.cloudflare.com:3478"] },
    { urls: ["turn:openrelay.metered.ca:80", "turn:openrelay.metered.ca:443", "turn:openrelay.metered.ca:443?transport=tcp", "turns:openrelay.metered.ca:443"], username: "openrelayproject", credential: "openrelayproject" }
  ],
  iceCandidatePoolSize: 4
};

export class Phone {
  el: HTMLElement;
  private screen: HTMLElement;
  private threads = new Map<string, Msg[]>(); // "all" ou id du joueur
  private unread = new Map<string, number>();
  private view: { app: string; arg?: string } = { app: "home" };
  private color = "#1b3f8f";
  // appel vidéo
  private pc: RTCPeerConnection | null = null;
  private local: MediaStream | null = null;
  private peer: string | null = null;
  private pendingIce: RTCIceCandidateInit[] = [];
  private incoming: { from: string; name: string; sdp: RTCSessionDescriptionInit } | null = null;
  private callStart = 0;
  private invite: { from: string; name: string; plane?: boolean } | null = null;
  private rec: { mr: MediaRecorder; chunks: Blob[]; raf: number; timer: ReturnType<typeof setTimeout>; badge: HTMLElement } | null = null;
  private clip: { url: string; blob: Blob; ext: string } | null = null;
  private remote: MediaStream | null = null;
  private ringTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "phone";
    this.el.hidden = true;
    this.el.innerHTML = `<div class="phone-notch"></div><div class="phone-screen"></div><button class="phone-home" title="Accueil"></button>`;
    document.body.appendChild(this.el);
    this.screen = this.el.querySelector(".phone-screen")!;
    this.el.querySelector(".phone-home")!.addEventListener("click", () => (this.view.app === "home" ? this.close() : this.go("home")));
    this.el.addEventListener("click", (e) => this.onClick(e));
    this.el.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && (e.target as HTMLElement).classList.contains("ph-input")) this.sendCurrent();
    });
    this.el.addEventListener("focusin", () => (G.uiFocus = true));
    this.el.addEventListener("focusout", () => (G.uiFocus = false));
    try {
      this.color = localStorage.getItem("griot-phone-color") || this.color;
    } catch {}
    this.el.style.setProperty("--phc", this.color);
    // messages du salon (tous) et privés
    bus.on("mp:chat", (d: { name: string; text: string }) => {
      if (d.name.endsWith("(vous)")) return;
      this.push("all", { from: d.name, text: d.text, me: false, at: Date.now() });
    });
    bus.on("mp:signal", (s: { from: string; name: string; d: any }) => this.onSignal(s));
    bus.on("ui:phone-app", (app: string) => {
      if (app === "tiktok-rec") return this.startRec();
      if (app === "invite-all") return this.sendInvite([...G.net.peers.keys()]);
      this.open();
      this.go(app);
    });
    bus.on("mp:peers", () => !this.el.hidden && !["chat", "call", "incoming"].includes(this.view.app) && this.render());
  }

  open(gift = false) {
    if (gift) {
      const colors = ["#1b3f8f", "#d8b25a", "#8a2a6a", "#1a1a1a", "#2ab8b0", "#c0392b"];
      this.color = colors[(colors.indexOf(this.color) + 1) % colors.length];
      try {
        localStorage.setItem("griot-phone-color", this.color);
      } catch {}
      this.el.style.setProperty("--phc", this.color);
      bus.emit("toast", { text: "📱 Nouveau Royal Phone offert ! (Reprenez-en un pour changer de couleur.)" });
    }
    this.el.hidden = false;
    // connexion automatique à la salle multijoueur (nécessaire pour les messages et les appels)
    if (G.net.status === "off" || G.net.status === "error") {
      G.net.connect(G.net.name, G.net.room);
      bus.emit("toast", { text: `🌐 Connexion à la salle « ${G.net.room} »… Vos amis doivent choisir la même salle.` });
    }
    this.go(this.incoming ? "incoming" : "home");
  }
  close() {
    if (this.pc) return this.go("call"); // on ne ferme pas pendant un appel
    this.el.hidden = true;
    G.uiFocus = false;
  }
  toggle() {
    if (this.el.hidden) this.open();
    else this.close();
  }

  private go(app: string, arg?: string) {
    this.view = { app, arg };
    if (app === "chat" && arg) this.unread.delete(arg);
    this.render();
  }

  private push(thread: string, m: Msg) {
    const list = this.threads.get(thread) ?? [];
    list.push(m);
    if (list.length > 80) list.shift();
    this.threads.set(thread, list);
    const viewing = !this.el.hidden && this.view.app === "chat" && this.view.arg === thread;
    if (!m.me && !viewing) {
      this.unread.set(thread, (this.unread.get(thread) ?? 0) + 1);
      if (thread !== "all") bus.emit("toast", { text: `📱 ${m.from} : ${m.text.slice(0, 80)}` });
    }
    if (!this.el.hidden) this.render();
  }

  private players() {
    return [...G.net.peers.entries()].filter(([, r]) => r.state).map(([id, r]) => ({ id, name: r.state!.n }));
  }

  private esc(s: string) {
    return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  }

  // ---------------------------------------------------------------- écrans
  private render() {
    const v = this.view;
    const time = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    const bar = `<div class="ph-bar"><span>${time}</span><span>📶 ${G.net.status === "on" ? "Royal 5G" : "Hors ligne"} 🔋</span></div>`;
    const online = G.net.status === "on";
    const total = [...this.unread.values()].reduce((a, b) => a + b, 0);
    let body = "";
    if (v.app === "home") {
      const apps = [
        ["msg", "💬", "Messages", total ? `<i>${total}</i>` : ""],
        ["video", "📹", "Appels vidéo", ""],
        ["griot", "🤖", "GRIOT", ""],
        ["players", "👥", "Joueurs", ""],
        ["map", "🗺️", "Carte", ""],
        ["avatar", "👤", "Avatar", ""],
        ["vision", "👁️", "Caméra", ""],
        ["flight", "✈️", "Vols", ""],
        ["mp", "🌐", "Multijoueur", ""],
        ["aboard", "🛸", "À bord ensemble", this.invite ? "<i>1</i>" : ""],
        ["tiktok", "🎵", "TikTok", this.rec ? "<i>●</i>" : ""]
      ];
      body = `<div class="ph-wall"><div class="ph-clock">${time}</div><div class="ph-date">${new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</div></div>
        <div class="ph-grid">${apps.map(([id, ic, n, badge]) => `<button data-app="${id}"><span class="ic">${ic}${badge}</span><span>${n}</span></button>`).join("")}</div>`;
    } else if (v.app === "msg") {
      const ps = this.players();
      const row = (id: string, name: string, sub: string) => {
        const last = this.threads.get(id)?.slice(-1)[0];
        const u = this.unread.get(id);
        return `<button class="ph-row" data-chat="${id}"><b>${this.esc(name)}</b><small>${this.esc(last ? `${last.me ? "Vous" : last.from} : ${last.text}` : sub)}</small>${u ? `<i>${u}</i>` : ""}</button>`;
      };
      body = `<div class="ph-title">💬 Messages</div>${online ? "" : `<p class="ph-hint">Connectez-vous au multijoueur (🌐) pour discuter avec vos amis.</p>`}
        ${row("all", "🌍 Salon du royaume", "Tous les joueurs connectés")}${ps.map((p) => row(p.id, p.name, "Message privé")).join("")}`;
    } else if (v.app === "chat") {
      const id = v.arg!;
      const name = id === "all" ? "🌍 Salon du royaume" : this.players().find((p) => p.id === id)?.name ?? "Joueur";
      const list = this.threads.get(id) ?? [];
      body = `<div class="ph-title"><button data-app="msg">‹</button> ${this.esc(name)} ${id !== "all" ? `<button data-call="${id}" title="Appel vidéo">📹</button>` : ""}</div>
        <div class="ph-thread">${list.map((m) => `<div class="ph-bubble ${m.me ? "me" : ""}">${m.me || id !== "all" ? "" : `<b>${this.esc(m.from)}</b>`}${this.esc(m.text)}</div>`).join("") || `<p class="ph-hint">Aucun message. Dites bonjour 👋</p>`}</div>
        <div class="ph-send"><input class="ph-input" placeholder="Message…" maxlength="200"><button data-send="1">➤</button></div>`;
    } else if (v.app === "video" || v.app === "players") {
      const ps = this.players();
      body = `<div class="ph-title">${v.app === "video" ? "📹 Appels vidéo" : "👥 Joueurs connectés"}</div>
        ${online ? `<p class="ph-hint">Salle : <b>${this.esc(G.net.room)}</b> — vos amis doivent ouvrir GRIOT et rejoindre cette même salle.</p>` : `<p class="ph-hint">Connexion au multijoueur… (ou touchez 🌐 Multijoueur pour choisir la salle).</p>`}
        ${ps.length ? ps.map((p) => `<div class="ph-row"><b>${this.esc(p.name)}</b><span class="ph-actions"><button data-chat="${p.id}">💬</button><button data-call="${p.id}">📹</button></span></div>`).join("") : online ? `<p class="ph-hint">Personne d'autre n'est connecté dans la salle « ${this.esc(G.net.room)} » pour l'instant.</p>` : ""}`;
    } else if (v.app === "aboard") {
      const ps = [...G.net.peers.entries()].filter(([, r]) => r.state).map(([id, r]) => ({ id, name: r.state!.n, flying: r.state!.m === "ship" && !!r.state!.s && (r.state!.s as number[])[9] !== 1, plane: !!r.state!.fl }));
      const piloting = (G.mode === "ship" && !G.ship.opts.small) || !!G.airports.flight;
      body = `<div class="ph-title">🛸 À bord ensemble</div>
        ${online ? "" : `<p class="ph-hint">Connexion au multijoueur…</p>`}
        ${
          piloting
            ? `<p class="ph-hint">${G.airports.flight ? "Vous êtes en vol : invitez vos amis dans votre avion" : "Vous pilotez le Royal Talon : invitez vos amis"}, ils montent à bord d'un seul toucher, où qu'ils soient.</p>
               <button class="ph-big" data-inviteall="1">📣 Inviter tout le monde</button>
               ${ps.map((p) => `<div class="ph-row"><b>${this.esc(p.name)}</b><span class="ph-actions"><button data-invite="${p.id}">Inviter</button></span></div>`).join("")}`
            : `<p class="ph-hint">Montez dans le Royal Talon d'un ami qui pilote (même s'il est loin), ou montez dans le vôtre et invitez-les.</p>
               ${ps.length ? ps.map((p) => `<div class="ph-row"><b>${this.esc(p.name)}</b><small>${p.plane ? "✈ en avion" : p.flying ? "🛸 pilote le Royal Talon" : "à pied"}</small>${p.plane ? `<span class="ph-actions"><button data-joinplane="${p.id}">✈ Rejoindre son vol</button></span>` : p.flying ? `<span class="ph-actions"><button data-join="${p.id}" data-where="cabin">🛋️ Cabine</button><button data-join="${p.id}" data-where="cockpit">🧑‍✈️ Copilote</button></span>` : ""}</div>`).join("") : online ? `<p class="ph-hint">Aucun ami connecté dans la salle « ${this.esc(G.net.room)} ».</p>` : ""}
               <button class="ph-big" data-pilot="1">🚀 Piloter mon Royal Talon</button>`
        }`;
    } else if (v.app === "invite" && this.invite) {
      body = `<div class="ph-incall"><div class="ph-avatar">🛸</div><div class="ph-who">${this.esc(this.invite.name)}</div><div class="ph-sub">${this.invite.plane ? "vous invite dans son avion" : "vous invite dans la cabine de son Royal Talon"}</div>
        <div class="ph-callbtns"><button class="no" data-noinvite="1">✕</button><button class="yes" ${this.invite.plane ? `data-joinplane="${this.invite.from}"` : `data-join="${this.invite.from}"`}>${this.invite.plane ? "✈" : "🧑‍🚀"}</button></div></div>`;
    } else if (v.app === "tiktok") {
      body = `<div class="ph-title">🎵 TikTok</div>
        ${
          this.clip
            ? `<video class="ph-clip" src="${this.clip.url}" playsinline controls loop autoplay muted></video>
               <div class="ph-tt-btns"><button class="ph-big" data-share="1">📤 Partager sur TikTok</button><button class="ph-big alt" data-save="1">💾 Enregistrer la vidéo</button><button class="ph-big alt" data-rec="1">🎬 Refilmer</button></div>`
            : `<p class="ph-hint">Filmez votre partie en format vertical (comme TikTok), avec le son du jeu, puis partagez-la directement sur TikTok.</p>
               <button class="ph-big" data-rec="1">${this.rec ? "⏹ Arrêter le film" : "🎬 Filmer une vidéo (15 s)"}</button>`
        }
        <button class="ph-big alt" data-opentt="1">🎵 Ouvrir l'appli TikTok</button>`;
    } else if (v.app === "incoming" && this.incoming) {
      body = `<div class="ph-incall"><div class="ph-avatar">📹</div><div class="ph-who">${this.esc(this.incoming.name)}</div><div class="ph-sub">Appel vidéo entrant…</div>
        <div class="ph-callbtns"><button class="no" data-decline="1">✕</button><button class="yes" data-accept="1">📹</button></div></div>`;
    } else if (v.app === "call") {
      const name = this.players().find((p) => p.id === this.peer)?.name ?? "Joueur";
      const s = Math.floor((Date.now() - this.callStart) / 1000);
      body = `<div class="ph-video"><video class="ph-remote" playsinline autoplay muted></video><video class="ph-local" playsinline autoplay muted></video>
        <div class="ph-status">${this.callStart ? "" : "Ça sonne chez votre ami…"}</div>
        <div class="ph-callinfo">${this.esc(name)} · ${this.callStart ? `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : "Appel en cours…"}</div>
        <div class="ph-level"><span>🔊</span><i></i></div>
        <div class="ph-callbtns"><button data-mute="1" title="Couper mon micro">🎙️</button><button data-speaker="1" title="Relancer le son">🔊</button><button data-cam="1" title="Ma caméra">📷</button><button class="no" data-hang="1">✕</button></div></div>`;
    }
    this.screen.innerHTML = bar + body;
    if (v.app === "chat") {
      const t = this.screen.querySelector(".ph-thread");
      if (t) t.scrollTop = t.scrollHeight;
      (this.screen.querySelector(".ph-input") as HTMLInputElement)?.focus();
    }
    if (v.app === "call") {
      const lv = this.screen.querySelector(".ph-local") as HTMLVideoElement;
      if (this.local) lv.srcObject = this.local;
      this.showRemote();
    }
  }

  private onClick(e: Event) {
    const t = (e.target as HTMLElement).closest<HTMLElement>("button");
    if (!t) return;
    const d = t.dataset;
    if (d.app) {
      if (d.app === "griot") return this.close(), bus.emit("ui:call");
      if (d.app === "map") return this.close(), bus.emit("ui:map");
      if (d.app === "avatar") return this.close(), bus.emit("ui:avatar");
      if (d.app === "vision") return this.close(), bus.emit("ui:vision");
      if (d.app === "mp") return this.close(), bus.emit("ui:multi");
      if (d.app === "flight") {
        this.close();
        const p = G.player.position;
        const near = G.airports.ports.reduce((a, b) => (a.hall.distanceTo(p) < b.hall.distanceTo(p) ? a : b));
        return bus.emit("ui:flight", near.def.id);
      }
      return this.go(d.app);
    }
    if (d.joinplane) {
      this.invite = null;
      this.close();
      return bus.emit("toast", { text: G.airports.joinFlight(d.joinplane) });
    }
    if (d.join) {
      this.joinMode = d.where === "cockpit" ? "cockpit" : "cabin";
      return this.joinShip(d.join);
    }
    if (d.noinvite) {
      this.invite = null;
      return this.go("home");
    }
    if (d.invite) return this.sendInvite([d.invite]);
    if (d.inviteall) return this.sendInvite([...G.net.peers.keys()]);
    if (d.pilot) {
      this.close();
      return bus.emit("griot:command", "monte dans le royal talon");
    }
    if (d.rec) return this.rec ? this.stopRec() : this.startRec();
    if (d.share) return this.shareClip();
    if (d.save) return this.saveClip();
    if (d.opentt) return void window.open("https://www.tiktok.com/", "_blank", "noopener");
    if (d.chat) return this.go("chat", d.chat);
    if (d.send) return this.sendCurrent();
    if (d.call) return this.call(d.call);
    if (d.accept) return this.accept();
    if (d.decline) return this.decline();
    if (d.hang) return this.hangup(true);
    if (d.speaker) {
      this.audioEl.muted = false;
      this.audioEl.volume = 1;
      this.audioEl.play().then(() => this.setStatus("")).catch(() => {});
      this.meter?.ctx.resume().catch(() => {});
      G.audio.setCallMode(true);
      bus.emit("toast", { text: "🔊 Son relancé. Montez le volume de l'appareil si besoin." });
    }
    if (d.mute && this.local) {
      const tr = this.local.getAudioTracks()[0];
      if (tr) tr.enabled = !tr.enabled;
      t.style.opacity = tr?.enabled ? "1" : "0.4";
    }
    if (d.cam && this.local) {
      const tr = this.local.getVideoTracks()[0];
      if (tr) tr.enabled = !tr.enabled;
      t.style.opacity = tr?.enabled ? "1" : "0.4";
    }
  }

  private sendCurrent() {
    const inp = this.screen.querySelector(".ph-input") as HTMLInputElement | null;
    const text = inp?.value.trim();
    if (!text || this.view.app !== "chat") return;
    const id = this.view.arg!;
    if (G.net.status !== "on") return bus.emit("toast", { text: "Connectez-vous d'abord au multijoueur (🌐).", kind: "warn" });
    if (id === "all") G.net.say(text);
    else if (!G.net.signal(id, { t: "dm", text })) return bus.emit("toast", { text: "Messages privés indisponibles sur ce relais.", kind: "warn" });
    this.push(id, { from: G.net.name, text, me: true, at: Date.now() });
  }

  // ---------------------------------------------------------------- monter ensemble dans le Royal Talon
  private sendInvite(ids: string[]) {
    const plane = !!G.airports.flight;
    if (G.mode !== "ship" && !plane) return bus.emit("toast", { text: "Montez d'abord aux commandes de votre Royal Talon (ou prenez un vol).", kind: "warn" });
    let n = 0;
    for (const id of ids) if (G.net.signal(id, { t: "invite", kind: plane ? "plane" : "ship" })) n++;
    bus.emit("toast", { text: n ? `📣 Invitation envoyée à ${n} ami${n > 1 ? "s" : ""}.` : "Aucun ami à inviter (connectez-vous au multijoueur).", kind: n ? undefined : "warn" });
  }

  private joinShip(id: string) {
    const r = G.net.peers.get(id);
    if (!r?.state?.s) return bus.emit("toast", { text: "Le vaisseau de votre ami n'est pas disponible.", kind: "warn" });
    if (this.joinMode === "cockpit" && r.state.m !== "ship") return bus.emit("toast", { text: "Votre ami n'est pas aux commandes : montez plutôt dans la cabine.", kind: "warn" });
    this.invite = null;
    if (G.mode === "ship") G.ship.exit();
    if ((G.mode as string) === "car") G.cars.exit();
    if (G.cabin?.inside) G.cabin.exit();
    this.close();
    if (this.joinMode === "cockpit") G.passenger.board("ship", id);
    else G.cabin.enterAsGuest(id);
  }
  private joinMode: "cabin" | "cockpit" = "cabin";

  // ---------------------------------------------------------------- TikTok : filmer la partie (vertical, avec le son)
  private startRec() {
    const src = document.getElementById("scene") as HTMLCanvasElement | null;
    if (!src || typeof MediaRecorder === "undefined" || !(HTMLCanvasElement.prototype as any).captureStream) return bus.emit("toast", { text: "Filmer n'est pas possible sur ce navigateur.", kind: "warn" });
    if (!(window as any).__aisamActive) return bus.emit("toast", { text: "Lancez d'abord le jeu AISAM pour le filmer.", kind: "warn" });
    // toile verticale 9:16 recadrée au centre du jeu, avec un filigrane
    const W = 720,
      H = 1280;
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const c = cv.getContext("2d")!;
    const draw = () => {
      const sw = src.width,
        sh = src.height;
      const cropW = Math.min(sw, (sh * W) / H);
      c.drawImage(src, (sw - cropW) / 2, 0, cropW, sh, 0, 0, W, H);
      c.fillStyle = "rgba(0,0,0,0.35)";
      c.fillRect(0, H - 90, W, 90);
      c.fillStyle = "#ffd27a";
      c.font = "bold 40px Arial";
      c.fillText("♛ GRIOT · AISAM", 28, H - 32);
    };
    // on recopie l'image juste après chaque rendu 3D (sinon la toile WebGL peut être vide)
    (window as any).__afterRender = draw;
    const stream = (cv as any).captureStream(30) as MediaStream;
    const audio = G.audio.recordStream();
    audio?.getAudioTracks().forEach((t) => stream.addTrack(t));
    const types = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"];
    const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
    let mr: MediaRecorder;
    try {
      mr = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 5_000_000 } : undefined);
    } catch {
      return bus.emit("toast", { text: "Enregistrement vidéo indisponible.", kind: "warn" });
    }
    const chunks: Blob[] = [];
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.onstop = () => {
      const type = mr.mimeType || mimeType || "video/webm";
      const blob = new Blob(chunks, { type });
      if (this.clip) URL.revokeObjectURL(this.clip.url);
      this.clip = { url: URL.createObjectURL(blob), blob, ext: type.includes("mp4") ? "mp4" : "webm" };
      this.el.hidden = false;
      this.go("tiktok");
      bus.emit("toast", { text: "🎬 Vidéo prête ! Partagez-la sur TikTok." });
    };
    const badge = document.createElement("button");
    badge.className = "rec-badge";
    badge.textContent = "● REC — toucher pour arrêter";
    badge.onclick = () => this.stopRec();
    document.body.appendChild(badge);
    this.clip = null;
    this.rec = { mr, chunks, raf: 0, timer: setTimeout(() => this.stopRec(), 15000), badge };
    mr.start(500);
    this.el.hidden = true;
    bus.emit("toast", { text: "🎬 On tourne ! 15 secondes… (touchez ● REC pour arrêter avant)" });
  }

  private stopRec() {
    const r = this.rec;
    if (!r) return;
    this.rec = null;
    clearTimeout(r.timer);
    (window as any).__afterRender = null;
    r.badge.remove();
    if (r.mr.state !== "inactive") r.mr.stop();
  }

  private async shareClip() {
    const c = this.clip;
    if (!c) return;
    const file = new File([c.blob], `griot-aisam.${c.ext}`, { type: c.blob.type });
    const nav = navigator as any;
    if (nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: "Ma partie dans GRIOT · AISAM", text: "#GRIOT #AISAM" });
        return;
      } catch {}
    }
    this.saveClip();
    bus.emit("toast", { text: "Vidéo enregistrée : ouvrez TikTok → + → importez-la depuis vos vidéos." });
  }

  private saveClip() {
    const c = this.clip;
    if (!c) return;
    const a = document.createElement("a");
    a.href = c.url;
    a.download = `griot-aisam.${c.ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ---------------------------------------------------------------- appels vidéo (WebRTC)
  /** Caméra + micro ; sinon micro seul ; sinon rien (on voit et on entend quand même l'autre). */
  private async media() {
    if (this.local) return this.local;
    const tries: MediaStreamConstraints[] = [{ video: { facingMode: "user", width: { ideal: 640 } }, audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }, { audio: true }, { video: true }];
    for (const c of tries) {
      try {
        this.local = await navigator.mediaDevices.getUserMedia(c);
        if (!c.video) bus.emit("toast", { text: "📹 Pas de caméra trouvée : appel en audio (vous voyez quand même votre ami).", kind: "warn" });
        return this.local;
      } catch {}
    }
    bus.emit("toast", { text: "Caméra et micro indisponibles : vous verrez et entendrez votre ami, sans être vu.", kind: "warn" });
    this.local = new MediaStream();
    return this.local;
  }

  /** Ajoute nos pistes, et demande toujours à recevoir l'audio et la vidéo de l'autre. */
  private attach(pc: RTCPeerConnection, stream: MediaStream) {
    const kinds = new Set<string>();
    stream.getTracks().forEach((t) => {
      pc.addTrack(t, stream);
      kinds.add(t.kind);
    });
    for (const k of ["audio", "video"]) if (!kinds.has(k)) pc.addTransceiver(k, { direction: "recvonly" });
  }

  private newPC(peer: string) {
    const pc = new RTCPeerConnection(ICE);
    pc.onicecandidate = (e) => e.candidate && G.net.signal(peer, { t: "ice", c: e.candidate.toJSON() });
    pc.ontrack = (e) => {
      this.remote ??= new MediaStream();
      if (!this.remote.getTracks().includes(e.track)) this.remote.addTrack(e.track);
      this.showRemote();
    };
    pc.oniceconnectionstatechange = () => this.setStatus(({ checking: "Connexion…", disconnected: "Connexion instable…", failed: "Échec de connexion" } as Record<string, string>)[pc.iceConnectionState] ?? "");
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected" && !this.callStart) {
        this.callStart = Date.now();
        this.setStatus("");
        this.tick();
      }
      if (pc.connectionState === "failed") {
        bus.emit("toast", { text: "Connexion vidéo impossible : le réseau bloque la vidéo. Essayez tous les deux en Wi-Fi (pas le Wi-Fi de l'école).", kind: "warn" });
        this.hangup(true);
      }
    };
    this.pc = pc;
    this.peer = peer;
    return pc;
  }

  /** Lecteur audio dédié à la voix de l'ami (plus fiable que le son de la vidéo sur iPad/iPhone). */
  private audioEl: HTMLAudioElement = Object.assign(document.createElement("audio"), { autoplay: true });
  private meter: { ctx: AudioContext; an: AnalyserNode; raf: number } | null = null;

  /** À appeler pendant un toucher (appeler / décrocher) : débloque la lecture du son. */
  private unlockAudio() {
    this.audioEl.setAttribute("playsinline", "");
    if (!this.audioEl.isConnected) document.body.appendChild(this.audioEl);
    this.audioEl.muted = false;
    this.audioEl.volume = 1;
    this.audioEl.play().catch(() => {});
    G.audio.setCallMode(true);
    bus.emit("call:active", true);
  }

  private showRemote() {
    if (!this.remote) return;
    if (this.audioEl.srcObject !== this.remote) this.audioEl.srcObject = this.remote;
    this.audioEl.play().catch(() => this.setStatus("🔊 Touchez le bouton 🔊 pour entendre votre ami"));
    const rv = this.screen.querySelector(".ph-remote") as HTMLVideoElement | null;
    if (rv) {
      if (rv.srcObject !== this.remote) rv.srcObject = this.remote;
      rv.muted = true;
      rv.play().catch(() => {});
    }
    this.startMeter();
  }

  /** Indicateur du son reçu : on voit si la voix de l'ami arrive. */
  private startMeter() {
    if (this.meter || !this.remote || !this.remote.getAudioTracks().length) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      ctx.createMediaStreamSource(this.remote).connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      const loop = () => {
        if (!this.meter) return;
        an.getByteFrequencyData(buf);
        const lvl = buf.reduce((a, b) => a + b, 0) / buf.length / 255;
        const bar = this.screen.querySelector(".ph-level i") as HTMLElement | null;
        if (bar) bar.style.width = `${Math.min(100, lvl * 400)}%`;
        this.meter.raf = requestAnimationFrame(loop);
      };
      this.meter = { ctx, an, raf: requestAnimationFrame(loop) };
      ctx.resume().catch(() => {});
    } catch {}
  }

  private setStatus(text: string) {
    const el = this.screen.querySelector(".ph-status") as HTMLElement | null;
    if (el) el.textContent = text;
  }

  private tick() {
    if (!this.pc) return;
    if (!this.el.hidden && this.view.app === "call") {
      const info = this.screen.querySelector(".ph-callinfo");
      const s = Math.floor((Date.now() - this.callStart) / 1000);
      const name = this.players().find((p) => p.id === this.peer)?.name ?? "Joueur";
      if (info) info.textContent = `${name} · ${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    }
    setTimeout(() => this.tick(), 1000);
  }

  async call(peer: string) {
    if (this.pc) return;
    if (G.net.status !== "on") return bus.emit("toast", { text: "Connectez-vous d'abord au multijoueur (🌐).", kind: "warn" });
    this.unlockAudio();
    try {
      const stream = await this.media();
      const pc = this.newPC(peer);
      this.attach(pc, stream);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (!G.net.signal(peer, { t: "offer", sdp: offer })) throw new Error("relais");
      this.callStart = 0;
      this.go("call");
      bus.emit("toast", { text: "📹 Appel en cours…" });
      this.ringTimer = setTimeout(() => {
        if (this.pc && !this.callStart && this.pc.connectionState !== "connected") {
          bus.emit("toast", { text: "📹 Pas de réponse. Vérifiez que votre ami a ouvert GRIOT et rejoint la même salle.", kind: "warn" });
          this.hangup(true);
        }
      }, 45000);
    } catch (e: any) {
      this.cleanup();
      bus.emit("toast", { text: e?.message === "relais" ? "Appels vidéo disponibles via le relais public (site web)." : "Caméra ou micro refusés.", kind: "warn" });
    }
  }

  private async accept() {
    const inc = this.incoming;
    if (!inc) return;
    this.incoming = null;
    this.unlockAudio();
    try {
      const stream = await this.media();
      const pc = this.newPC(inc.from);
      await pc.setRemoteDescription(inc.sdp);
      this.attach(pc, stream);
      for (const c of this.pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {});
      const ans = await pc.createAnswer();
      await pc.setLocalDescription(ans);
      G.net.signal(inc.from, { t: "answer", sdp: ans });
      this.go("call");
    } catch {
      G.net.signal(inc.from, { t: "bye" });
      this.cleanup();
      bus.emit("toast", { text: "Caméra ou micro refusés.", kind: "warn" });
    }
  }

  private decline() {
    if (this.incoming) G.net.signal(this.incoming.from, { t: "decline" });
    this.incoming = null;
    this.go("home");
  }

  hangup(notify: boolean) {
    if (notify && this.peer) G.net.signal(this.peer, { t: "bye" });
    this.cleanup();
    if (!this.el.hidden) this.go("home");
  }

  private cleanup() {
    if (this.ringTimer) clearTimeout(this.ringTimer);
    this.ringTimer = null;
    this.remote = null;
    if (this.meter) {
      cancelAnimationFrame(this.meter.raf);
      this.meter.ctx.close().catch(() => {});
      this.meter = null;
    }
    this.audioEl.srcObject = null;
    G.audio.setCallMode(false);
    bus.emit("call:active", false);
    this.pc?.close();
    this.pc = null;
    this.peer = null;
    this.callStart = 0;
    this.pendingIce = [];
    this.local?.getTracks().forEach((t) => t.stop());
    this.local = null;
  }

  private async onSignal(s: { from: string; name: string; d: any }) {
    const d = s.d ?? {};
    switch (d.t) {
      case "invite":
        this.invite = { from: s.from, name: s.name, plane: d.kind === "plane" };
        this.el.hidden = false;
        this.go("invite");
        bus.emit("toast", { text: d.kind === "plane" ? `✈ ${s.name} vous invite dans son avion ! (📱 Téléphone)` : `🛸 ${s.name} vous invite à bord du Royal Talon ! (📱 Téléphone)` });
        G.audio.tone(660, 0.2, "sine", 0.1);
        setTimeout(() => G.audio.tone(990, 0.25, "sine", 0.1), 220);
        break;
      case "dm":
        this.push(s.from, { from: s.name, text: String(d.text ?? "").slice(0, 200), me: false, at: Date.now() });
        break;
      case "offer":
        if (this.pc || this.incoming) return void G.net.signal(s.from, { t: "busy" });
        this.incoming = { from: s.from, name: s.name, sdp: d.sdp };
        this.el.hidden = false;
        this.go("incoming");
        bus.emit("toast", { text: `📹 ${s.name} vous appelle en vidéo !` });
        this.ring();
        break;
      case "answer":
        if (this.pc && s.from === this.peer) {
          await this.pc.setRemoteDescription(d.sdp);
          for (const c of this.pendingIce.splice(0)) await this.pc.addIceCandidate(c).catch(() => {});
        }
        break;
      case "ice":
        if (this.pc && this.pc.remoteDescription && s.from === this.peer) await this.pc.addIceCandidate(d.c).catch(() => {});
        else this.pendingIce.push(d.c);
        break;
      case "decline":
      case "busy":
        if (s.from === this.peer) {
          bus.emit("toast", { text: d.t === "busy" ? `${s.name} est déjà en ligne.` : `${s.name} a refusé l'appel.` });
          this.hangup(false);
        }
        break;
      case "bye":
        if (s.from === this.peer || this.incoming?.from === s.from) {
          this.incoming = null;
          bus.emit("toast", { text: `📹 Appel terminé avec ${s.name}.` });
          this.hangup(false);
        }
        break;
    }
  }

  private ring() {
    let n = 0;
    const r = () => {
      if (!this.incoming || n++ > 8) return;
      G.audio.tone(880, 0.15, "sine", 0.12);
      setTimeout(() => G.audio.tone(1100, 0.15, "sine", 0.12), 180);
      setTimeout(r, 1500);
    };
    r();
  }
}
