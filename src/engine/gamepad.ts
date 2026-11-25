// MANETTE (Xbox, PlayStation, Switch Pro… via l'API Gamepad du navigateur) : stick gauche = bouger,
// stick droit = regarder, A = sauter, B = interagir / sortir, X = emotes (supersonique en véhicule),
// Y = menu d'actions, LB = vue, RB = courir / boost, LT / RT = frein / accélérer, Select = carte, Start = menu.
import { G, bus } from "../core";
import { pressKey } from "../ui/actions";

const DEAD = 0.18;
const dz = (v: number) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));

export class Gamepads {
  connected = false;
  private prev: boolean[] = [];
  private held = new Map<number, string>();
  private moved = false;

  constructor() {
    addEventListener("gamepadconnected", (e) => {
      this.connected = true;
      bus.emit("toast", { text: `🎮 Manette connectée (${(e as GamepadEvent).gamepad.id.split("(")[0].trim() || "manette"}) — Y : menu d'actions · B : interagir` });
      bus.emit("gamepad", true);
    });
    addEventListener("gamepaddisconnected", () => {
      this.connected = !!this.pad();
      bus.emit("gamepad", this.connected);
    });
  }

  private pad(): Gamepad | null {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of list) if (p && p.connected) return p;
    return null;
  }

  /** Code de touche selon le bouton et le contexte (mode de jeu, menu ouvert…). */
  private codeFor(b: number): string | null {
    const mode = G.mode as string;
    const menu = G.actions?.open;
    const modal = document.querySelector("#modal:not([hidden])");
    const vehicle = mode === "car" || mode === "boat" || mode === "ship";
    switch (b) {
      case 0: return menu ? "Enter" : "Space";
      case 1: return menu || modal ? "Escape" : "KeyE";
      case 2: return "KeyB";
      case 3: return "Tab";
      case 4: return "KeyV";
      case 5: return "ShiftLeft";
      case 6: return mode === "ship" ? "KeyC" : vehicle ? "KeyS" : "KeyU";
      case 7: return vehicle ? "KeyW" : G.armor?.worn || G.mecha?.active ? "KeyG" : null;
      case 8: return "KeyM";
      case 9: return modal ? "Escape" : "KeyP";
      case 10: return "ShiftLeft";
      case 11: return "KeyV";
      case 12: return menu ? "ArrowUp" : "KeyT";
      case 13: return menu ? "ArrowDown" : "KeyH";
      case 14: return "KeyL";
      case 15: return "KeyJ";
    }
    return null;
  }

  poll(dt: number) {
    const p = this.pad();
    if (!p) return;
    // boutons → vraies touches (le jeu et l'interface réagissent exactement comme au clavier)
    p.buttons.forEach((btn, i) => {
      const on = btn.pressed || btn.value > 0.35;
      if (on && !this.prev[i]) {
        const code = this.codeFor(i);
        if (code) {
          this.held.set(i, code);
          document.dispatchEvent(new KeyboardEvent("keydown", { code, key: code === "Escape" ? "Escape" : code === "Enter" ? "Enter" : code === "Tab" ? "Tab" : "", bubbles: true }));
          G.audio?.unlock();
        }
      } else if (!on && this.prev[i]) {
        const code = this.held.get(i);
        if (code) document.dispatchEvent(new KeyboardEvent("keyup", { code, bubbles: true }));
        this.held.delete(i);
      }
      this.prev[i] = on;
    });
    // sticks
    const lx = dz(p.axes[0] ?? 0),
      ly = dz(p.axes[1] ?? 0),
      rx = dz(p.axes[2] ?? 0),
      ry = dz(p.axes[3] ?? 0);
    if (lx || ly) {
      G.input.touchMove.x = lx;
      G.input.touchMove.y = ly;
      this.moved = true;
    } else if (this.moved) {
      G.input.touchMove.x = G.input.touchMove.y = 0;
      this.moved = false;
    }
    const k = 2.8 * G.input.sensitivity * dt;
    G.input.touchLook.x += Math.sign(rx) * rx * rx * k;
    G.input.touchLook.y += Math.sign(ry) * ry * ry * k * 0.8;
  }
}

export { pressKey };
