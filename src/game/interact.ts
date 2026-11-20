// Registre des objets interactifs : le plus proche dans le champ de vision affiche « [E] … ».
import * as THREE from "three";
import { G } from "../core";

export interface Interactable {
  id: string;
  pos: THREE.Vector3 | (() => THREE.Vector3);
  radius: number;
  label: () => string;
  enabled?: () => boolean;
  action: () => void;
  /** autorisé aussi depuis le vaisseau */
  inShip?: boolean;
}

const v = new THREE.Vector3();
const dir = new THREE.Vector3();

export class Interactions {
  list: Interactable[] = [];
  current: Interactable | null = null;
  private prompt = document.getElementById("prompt")!;

  add(i: Interactable) {
    this.list.push(i);
    return i;
  }
  remove(id: string) {
    this.list = this.list.filter((i) => i.id !== id);
  }
  get(id: string) {
    return this.list.find((i) => i.id === id);
  }

  update() {
    let best: Interactable | null = null;
    let bestScore = Infinity;
    if (G.mode === "foot") {
      const p = G.player.position;
      G.camera.getWorldDirection(dir);
      for (const it of this.list) {
        if (it.enabled && !it.enabled()) continue;
        const ip = typeof it.pos === "function" ? it.pos() : it.pos;
        v.copy(ip).sub(p);
        const dy = Math.abs(v.y - 1);
        if (dy > 3.5) continue;
        v.y = 0;
        const d = v.length();
        if (d > it.radius) continue;
        const facing = d < 1.6 ? 1 : v.normalize().dot(new THREE.Vector3(dir.x, 0, dir.z).normalize());
        if (facing < 0.35) continue;
        const score = d - facing * 2;
        if (score < bestScore) {
          bestScore = score;
          best = it;
        }
      }
    }
    this.current = best;
    if (best) {
      this.prompt.innerHTML = `<kbd>${G.mobile ? "◎" : "E"}</kbd> ${best.label()}`;
      this.prompt.classList.add("show");
    } else this.prompt.classList.remove("show");

    if (best && G.input.hit("KeyE")) {
      G.audio.ui();
      best.action();
    }
  }
}
