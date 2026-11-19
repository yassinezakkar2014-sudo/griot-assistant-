// Entrées clavier / souris (pointer lock) / tactile unifiées.
import { G } from "../core";

export class Input {
  keys = new Set<string>();
  pressed = new Set<string>(); // fronts montants de la frame
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  dragging = false;
  locked = false;
  sensitivity = 1;
  invertY = false;
  // axes tactiles virtuels
  touchMove = { x: 0, y: 0 };
  touchLook = { x: 0, y: 0 };
  touchButtons = new Set<string>();

  constructor(public canvas: HTMLCanvasElement) {
    addEventListener("keydown", (e) => {
      if (G.uiFocus) return;
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => this.keys.clear());
    canvas.addEventListener("click", () => {
      if (!G.mobile && !G.uiFocus && G.mode !== "inspect") canvas.requestPointerLock?.();
    });
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === canvas;
    });
    addEventListener("mousemove", (e) => {
      if (this.locked || this.dragging) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    canvas.addEventListener("mousedown", (e) => {
      if (e.button === 0 && !this.locked) this.dragging = true;
      if (this.locked) this.pressed.add(e.button === 0 ? "Mouse0" : "Mouse2");
    });
    addEventListener("mouseup", () => (this.dragging = false));
    canvas.addEventListener("wheel", (e) => {
      this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
  }

  down(...codes: string[]) {
    return codes.some((c) => this.keys.has(c) || this.touchButtons.has(c));
  }
  hit(...codes: string[]) {
    return codes.some((c) => this.pressed.has(c));
  }
  /** Simule un appui (boutons tactiles / commandes vocales). */
  tap(code: string) {
    this.pressed.add(code);
  }
  axis(neg: string[], pos: string[]) {
    return (this.down(...pos) ? 1 : 0) - (this.down(...neg) ? 1 : 0);
  }
  consumeMouse() {
    const s = 0.0022 * this.sensitivity;
    const out = { x: this.mouseDX * s + this.touchLook.x, y: this.mouseDY * s * (this.invertY ? -1 : 1) + this.touchLook.y };
    this.mouseDX = this.mouseDY = 0;
    this.touchLook.x = this.touchLook.y = 0;
    return out;
  }
  endFrame() {
    this.pressed.clear();
    this.wheel = 0;
  }
  /** vrai quand le jeu libère lui-même la souris (ne doit pas ouvrir le menu pause) */
  expectUnlock = false;
  unlock() {
    if (document.pointerLockElement) {
      this.expectUnlock = true;
      document.exitPointerLock();
    }
  }
}
