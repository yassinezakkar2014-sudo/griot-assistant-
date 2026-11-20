// HUD INTERACTIF DU CASQUE de l'Armure Royale : visible quand l'armure est portée et le masque baissé.
// Trois modes (NAV / ANALYSE / BIO), balayage de l'environnement (Z), marqueurs 3D projetés à l'écran,
// cible de navigation au toucher, capacités tactiles.
import * as THREE from "three";
import { G, bus } from "../core";
import { fmtHour } from "../world/floors";

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

interface Target {
  id: string;
  name: string;
  kind: "objet" | "lieu" | "joueur" | "véhicule";
  pos: () => THREE.Vector3;
}

export class Visor {
  mode: "nav" | "scan" | "bio" = "nav";
  scanned: Target[] = [];
  scanAt = -99;
  waypoint: Target | null = null;
  private el = $("visor");
  private markers = $("vMarkers");
  private pool: HTMLElement[] = [];
  private v = new THREE.Vector3();
  private visible = false;

  init() {
    this.el.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const m = t.closest("[data-vmode]") as HTMLElement | null;
      if (m) this.setMode(m.dataset.vmode as Visor["mode"]);
      if (t.closest("#vScan")) this.scan();
      const item = t.closest("[data-target]") as HTMLElement | null;
      if (item) this.toggleWaypoint(item.dataset.target!);
      const ab = t.closest("[data-vab]") as HTMLElement | null;
      if (ab) G.armor.ability(ab.dataset.vab!);
    });
  }

  setMode(m: Visor["mode"]) {
    this.mode = m;
    G.audio.ui();
    this.el.dataset.mode = m;
  }

  /** Balayage : objets interactifs, joueurs, véhicules et lieux à portée. */
  scan() {
    if (!G.armor.worn) return;
    const p = G.player.position;
    const found: Target[] = [];
    for (const it of G.interact.list) {
      if (it.enabled && !it.enabled()) continue;
      const pos = typeof it.pos === "function" ? it.pos() : it.pos;
      if (pos.distanceTo(p) < 90) found.push({ id: "i:" + it.id, name: it.label().replace(/^(Ouvrir|Fermer|Appliquer|Examiner)\s*:?\s*/i, ""), kind: "objet", pos: typeof it.pos === "function" ? it.pos : () => it.pos as THREE.Vector3 });
    }
    for (const c of G.cars?.cars ?? []) if (c.pos.distanceTo(p) < 300) found.push({ id: "c:" + c.def.id, name: c.def.name, kind: "véhicule", pos: () => c.pos.clone().add(new THREE.Vector3(0, 1.5, 0)) });
    if (G.ship.root.position.distanceTo(p) < 1500) found.push({ id: "ship", name: "Royal Talon", kind: "véhicule", pos: () => G.ship.root.position });
    for (const pl of G.net?.list() ?? []) found.push({ id: "p:" + pl.id, name: pl.name, kind: "joueur", pos: () => (G.net.peers.get(pl.id)?.target ?? pl.pos).clone().add(new THREE.Vector3(0, 2.2, 0)) });
    for (const mk of G.world.markers) if (mk.visible()) found.push({ id: "m:" + mk.id, name: mk.name, kind: "lieu", pos: () => mk.pos.clone().setY(Math.max(mk.pos.y, G.physics.terrain(mk.pos.x, mk.pos.z)) + 20) });
    found.sort((a, b) => a.pos().distanceTo(p) - b.pos().distanceTo(p));
    this.scanned = found.slice(0, 14);
    this.scanAt = G.time;
    this.el.classList.remove("ping");
    void this.el.offsetWidth;
    this.el.classList.add("ping");
    G.audio.tone(880, 0.5, "sine", 0.08, 220);
    bus.emit("toast", { text: `◎ Analyse : ${found.length} éléments détectés.` });
    if (this.mode === "bio") this.setMode("scan");
  }

  toggleWaypoint(id: string) {
    const t = this.scanned.find((x) => x.id === id) ?? this.navTargets().find((x) => x.id === id);
    if (!t || this.waypoint?.id === id) {
      this.waypoint = null;
      return;
    }
    this.waypoint = t;
    G.audio.confirm();
    bus.emit("caption", `Cap sur : ${t.name}`);
  }

  private navTargets(): Target[] {
    const p = G.player.position;
    return G.world.markers
      .filter((m) => m.visible())
      .map((m) => ({ id: "m:" + m.id, name: m.name, kind: "lieu" as const, pos: () => m.pos.clone().setY(G.physics.terrain(m.pos.x, m.pos.z) + 20) }))
      .sort((a, b) => a.pos().distanceTo(p) - b.pos().distanceTo(p))
      .slice(0, 6);
  }

  update(t: number) {
    const a = G.armor;
    const show = a.worn && a.maskUp && G.mode === "foot";
    if (show !== this.visible) {
      this.visible = show;
      this.el.hidden = !show;
      if (show) {
        this.el.dataset.mode = this.mode;
        G.audio.tone(1200, 0.2, "sine", 0.05, 1800);
      }
    }
    if (!show) return;
    if (G.input.hit("KeyZ")) this.scan();
    if (G.input.hit("KeyN")) this.setMode(this.mode === "nav" ? "scan" : this.mode === "scan" ? "bio" : "nav");
    this.el.style.setProperty("--visor", a.style.glow);
    const p = G.player.position;

    // panneaux (4 fois par seconde)
    if (Math.floor(t * 4) !== Math.floor((t - 0.016) * 4)) {
      const yaw = G.player.yaw;
      const deg = ((((-yaw * 180) / Math.PI) % 360) + 360) % 360;
      $("vZone").textContent = G.world.zoneName(p).toUpperCase();
      $("vTime").textContent = `${fmtHour(G.env.hour)} · ALT ${Math.round(p.y)} M`;
      $("vCompass").textContent = `${["N", "NE", "E", "SE", "S", "SO", "O", "NO"][Math.round(deg / 45) % 8]} ${String(Math.round(deg)).padStart(3, "0")}°`;
      const st = a as any;
      const pulse = 62 + Math.round(Math.sin(t * 0.7) * 4 + (G.player.velocity.length() > 5 ? 28 : 0));
      $("vLeft").innerHTML = `<b>BIO</b>
        <div class="vrow"><span>Énergie</span><i><b style="width:${Math.round(a.energy * 100)}%"></b></i><em>${Math.round(a.energy * 100)}%</em></div>
        <div class="vrow"><span>Bouclier</span><em>${st.shieldT > 0 ? `ACTIF ${Math.ceil(st.shieldT)}s` : G.missions.state.tech.includes("nano") ? "PRÊT" : "VERROUILLÉ"}</em></div>
        <div class="vrow"><span>Surcharge</span><em>${st.boostT > 0 ? `ACTIVE ${Math.ceil(st.boostT)}s` : "PRÊTE"}</em></div>
        <div class="vrow"><span>Vision</span><em>${a.vision ? "TACTIQUE" : "NORMALE"}</em></div>
        <div class="vrow"><span>Pouls</span><em>${pulse} BPM</em></div>
        <div class="vrow"><span>Vitesse</span><em>${(G.player.velocity.length() * 3.6).toFixed(0)} km/h</em></div>`;
      const list = this.mode === "nav" ? this.navTargets() : this.scanned;
      const title = this.mode === "nav" ? "NAVIGATION" : this.mode === "scan" ? `ANALYSE${this.scanned.length ? "" : " — appuyez sur SCAN"}` : "ANALYSE";
      $("vRight").innerHTML = `<b>${title}</b>${list
        .map((x) => `<button class="vitem ${this.waypoint?.id === x.id ? "on" : ""}" data-target="${esc(x.id)}"><span>${esc(x.name.slice(0, 34))}</span><em>${fmtDist(x.pos().distanceTo(p))}</em></button>`)
        .join("")}`;
      const wp = this.waypoint;
      $("vWaypoint").textContent = wp ? `◆ ${wp.name} — ${fmtDist(wp.pos().distanceTo(p))}` : "";
    }

    // marqueurs projetés dans la vue
    const targets: { tg: Target; wp: boolean }[] = [];
    if (this.mode !== "bio" && G.time - this.scanAt < 20) for (const s of this.scanned.slice(0, 10)) targets.push({ tg: s, wp: false });
    if (this.waypoint) targets.push({ tg: this.waypoint, wp: true });
    const W = this.markers.clientWidth,
      H = this.markers.clientHeight;
    let used = 0;
    for (const { tg, wp } of targets) {
      this.v.copy(tg.pos()).project(G.camera);
      if (this.v.z > 1 || Math.abs(this.v.x) > 1.05 || Math.abs(this.v.y) > 1.05) {
        if (!wp) continue;
        // cible hors champ : flèche au bord
        this.v.x = Math.max(-0.92, Math.min(0.92, this.v.z > 1 ? -this.v.x : this.v.x));
        this.v.y = Math.max(-0.85, Math.min(0.85, this.v.z > 1 ? -0.8 : this.v.y));
      }
      const el = (this.pool[used] ||= this.markers.appendChild(document.createElement("div")));
      used++;
      el.className = `vmark ${wp ? "wp" : ""} k-${tg.kind}`;
      el.style.transform = `translate(${((this.v.x + 1) / 2) * W}px, ${((1 - this.v.y) / 2) * H}px)`;
      el.innerHTML = `<i></i><span>${esc(tg.name.slice(0, 24))} · ${fmtDist(tg.pos().distanceTo(p))}</span>`;
      el.style.display = "";
    }
    for (let i = used; i < this.pool.length; i++) this.pool[i].style.display = "none";
  }
}

function fmtDist(d: number) {
  return d > 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`;
}
