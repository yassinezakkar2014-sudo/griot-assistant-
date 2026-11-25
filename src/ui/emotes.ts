// EMOTES : menu rapide (touche B ou bouton 😀) — l'avatar danse, salue, applaudit… et les amis le voient.
import { G, bus } from "../core";

export const EMOTES = [
  { id: "wave", name: "Salut", emoji: "👋" },
  { id: "dance", name: "Danse", emoji: "💃" },
  { id: "clap", name: "Applaudir", emoji: "👏" },
  { id: "bow", name: "Révérence", emoji: "🙇" },
  { id: "victory", name: "Victoire", emoji: "🙌" },
  { id: "salute", name: "Salut royal", emoji: "🫡" },
  { id: "flex", name: "Muscles", emoji: "💪" },
  { id: "laugh", name: "Rire", emoji: "😂" }
];

export class EmoteWheel {
  private el!: HTMLElement;
  open = false;

  build() {
    this.el = document.createElement("div");
    this.el.className = "emote-wheel";
    this.el.hidden = true;
    this.el.innerHTML = EMOTES.map((e, i) => `<button data-em="${e.id}" style="--a:${(i / EMOTES.length) * 360}deg"><span>${e.emoji}</span><small>${i + 1} · ${e.name}</small></button>`).join("") + `<button class="em-close" data-em="close">✕</button>`;
    document.body.appendChild(this.el);
    this.el.onclick = (e) => {
      const id = (e.target as HTMLElement).closest<HTMLElement>("[data-em]")?.dataset.em;
      if (!id) return;
      if (id !== "close") this.play(id);
      this.toggle(false);
    };
    bus.on("ui:emotes", () => this.toggle());
    G.palace.updaters.push(() => {
      if (G.mode !== "foot") {
        if (this.open) this.toggle(false);
        return;
      }
      if (G.input.hit("KeyB")) this.toggle();
      if (this.open) EMOTES.forEach((e, i) => G.input.hit(`Digit${i + 1}`) && (this.play(e.id), this.toggle(false)));
    });
  }

  toggle(on = !this.open) {
    this.open = on;
    this.el.hidden = !on;
    if (on) G.input.unlock();
  }

  play(id: string) {
    if (!G.player.emote(id)) bus.emit("toast", { text: "Les emotes se font à pied.", kind: "warn" });
  }
}
