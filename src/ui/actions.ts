// MENU D'ACTIONS (touche Tab, bouton ⋯ sur téléphone, bouton Y à la manette) : toutes les actions du mode
// en cours au même endroit — plus besoin de retenir des dizaines de touches.
import { G, bus } from "../core";

interface Act {
  icon: string;
  label: string;
  key?: string; // touche simulée
  fn?: () => void;
}

/** Simule une touche (le jeu ET l'interface la reçoivent, comme un vrai clavier). */
export function pressKey(code: string, hold = 90) {
  const key = code === "Escape" ? "Escape" : code === "Enter" ? "Enter" : code === "Tab" ? "Tab" : "";
  document.dispatchEvent(new KeyboardEvent("keydown", { code, key, bubbles: true }));
  setTimeout(() => document.dispatchEvent(new KeyboardEvent("keyup", { code, key, bubbles: true })), hold);
}

function list(): Act[] {
  const mode = G.mode as string;
  const common: Act[] = [
    { icon: "🗺", label: "Carte", key: "KeyM" },
    { icon: "🎙", label: "Parler à GRIOT (micro)", key: "KeyT" },
    { icon: "🎯", label: "Missions", key: "KeyJ" },
    { icon: "☰", label: "Menu", key: "KeyP" }
  ];
  if (mode === "ship")
    return [
      { icon: "⏻", label: "Moteurs", key: "KeyR" },
      { icon: "🛬", label: "Atterrir", key: "KeyH" },
      { icon: "🚀", label: "Supersonique", key: "KeyB" },
      { icon: "👁‍🗨", label: "Furtif", key: "KeyK" },
      { icon: "🛋", label: "Cabine", key: "KeyI" },
      { icon: "🌌", label: "Aller dans l'espace", key: "KeyO" },
      { icon: "💡", label: "Feux", key: "KeyL" },
      { icon: "🎥", label: "Changer de vue", key: "KeyV" },
      { icon: "⇲", label: "Sortir du vaisseau", key: "KeyE" },
      ...common
    ];
  if (mode === "car")
    return [
      { icon: "🤖", label: "Pilote automatique", key: "KeyY" },
      { icon: "💡", label: "Phares", key: "KeyL" },
      { icon: "📯", label: "Klaxon", key: "KeyH" },
      { icon: "🎥", label: "Changer de vue", key: "KeyV" },
      { icon: "⇲", label: "Sortir de la voiture", key: "KeyE" },
      ...common
    ];
  if (mode === "boat")
    return [
      { icon: "🌍", label: "Voyage vers une nation", fn: () => G.yacht.voyagePanel() },
      { icon: "⚡", label: "Supersonique", key: "KeyB" },
      { icon: "👁", label: "Furtif", key: "KeyK" },
      { icon: "🎥", label: "Changer de vue", key: "KeyV" },
      { icon: "🛏", label: "Suite royale (cabine)", fn: () => G.yachtCabin.enter() },
      { icon: "🚶", label: "Aller sur le pont", key: "KeyE" },
      { icon: "🛥", label: "Débarquer", fn: () => void G.yacht.disembark() },
      ...common
    ];
  if (mode === "ride") return [{ icon: "⇲", label: "Descendre", key: "KeyE" }, ...common];
  const foot: Act[] = [
    { icon: "⚡", label: "Super vitesse", key: "KeyU" },
    { icon: "😀", label: "Emotes", key: "KeyB" },
    { icon: "🎥", label: "Vue 1re / 3e personne", key: "KeyV" }
  ];
  if (G.mecha?.active) foot.push({ icon: "💥", label: "Canon du Titan", key: "KeyG" }, { icon: "🌋", label: "Frappe au sol", key: "Digit1" });
  else if (G.armor?.worn)
    foot.push(
      { icon: "🔆", label: "Rayon", key: "KeyG" },
      { icon: "🌀", label: "Onde de choc", key: "Digit1" },
      { icon: "🛡", label: "Bouclier", key: "Digit2" },
      { icon: "⚡", label: "Surcharge", key: "Digit3" },
      { icon: "👁", label: "Vision", key: "Digit4" },
      { icon: "🎭", label: "Masque", key: "KeyX" }
    );
  return [...foot, ...common];
}

export class ActionMenu {
  open = false;
  private el!: HTMLElement;
  private sel = 0;
  private acts: Act[] = [];

  build() {
    this.el = document.createElement("div");
    this.el.className = "action-menu";
    this.el.hidden = true;
    document.body.appendChild(this.el);
    this.el.onclick = (e) => {
      const i = (e.target as HTMLElement).closest<HTMLElement>("[data-i]")?.dataset.i;
      if (i !== undefined) this.run(Number(i));
      else if ((e.target as HTMLElement).closest("[data-close]")) this.toggle(false);
    };
    // clavier : Tab ouvre/ferme ; quand le menu est ouvert, flèches / Entrée / Échap / chiffres le pilotent
    addEventListener(
      "keydown",
      (e) => {
        if (G.uiFocus || !document.body.classList.contains("aisam")) return;
        if (e.code === "Tab") {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.toggle();
          return;
        }
        if (!this.open) return;
        const nav = ["ArrowUp", "ArrowDown", "Enter", "Escape", "NumpadEnter"].includes(e.code) || /^Digit[1-9]$/.test(e.code);
        if (!nav) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.code === "ArrowUp") this.move(-1);
        else if (e.code === "ArrowDown") this.move(1);
        else if (e.code === "Enter" || e.code === "NumpadEnter") this.run(this.sel);
        else if (e.code === "Escape") this.toggle(false);
        else this.run(Number(e.code.slice(5)) - 1);
      },
      true
    );
    bus.on("mode", () => this.open && this.render());
  }

  toggle(on = !this.open) {
    this.open = on;
    this.el.hidden = !on;
    if (on) {
      this.acts = list();
      this.sel = 0;
      this.render();
      G.input.unlock();
    }
  }

  private move(d: number) {
    this.sel = (this.sel + d + this.acts.length) % this.acts.length;
    this.render();
  }

  private render() {
    this.acts = list();
    this.el.innerHTML = `<div class="am-title">Actions <small>Tab · ▲▼ · Entrée</small><button data-close="1">✕</button></div>${this.acts
      .map((a, i) => `<button data-i="${i}" class="${i === this.sel ? "sel" : ""}"><span>${a.icon}</span>${a.label}${i < 9 ? `<kbd>${i + 1}</kbd>` : ""}</button>`)
      .join("")}`;
  }

  private run(i: number) {
    const a = this.acts[i];
    if (!a) return;
    this.toggle(false);
    if (a.fn) a.fn();
    else if (a.key) setTimeout(() => pressKey(a.key!), 30);
  }
}
