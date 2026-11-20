// Contexte partagé du jeu. Les modules lisent G à l'exécution (jamais au chargement),
// ce qui évite les dépendances circulaires.
import type * as THREE from "three";
import type { Physics } from "./engine/physics";
import type { Input } from "./engine/input";
import type { AudioFX } from "./engine/audio";
import type { Interactions } from "./game/interact";
import type { Player } from "./game/player";
import type { Ship } from "./game/ship";
import type { ArmorSystem } from "./game/armor";
import type { Palace } from "./world/palace";
import type { Environment } from "./engine/environment";
import type { Missions } from "./game/missions";
import type { World } from "./world/world";
import type { Multiplayer } from "./net/multiplayer";
import type { CarSystem } from "./game/car";
import type { AntiAir } from "./world/antiair";

export type Mode = "foot" | "ship" | "inspect" | "cinematic" | "car";

export interface GameContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  physics: Physics;
  input: Input;
  audio: AudioFX;
  interact: Interactions;
  player: Player;
  ship: Ship; // vaisseau actif (celui qu'on pilote ou le dernier utilisé)
  ships: Ship[];
  armor: ArmorSystem;
  palace: Palace;
  env: Environment;
  missions: Missions;
  world: World;
  net: Multiplayer;
  cars: CarSystem;
  antiair: AntiAir;
  mode: Mode;
  time: number; // secondes écoulées
  uiFocus: boolean; // vrai quand un champ texte / menu a le focus
  mobile: boolean;
}

export const G = {} as GameContext;

// Petit bus d'événements typé de façon souple.
type Handler = (data?: any) => void;
const handlers = new Map<string, Set<Handler>>();
export const bus = {
  on(evt: string, fn: Handler) {
    if (!handlers.has(evt)) handlers.set(evt, new Set());
    handlers.get(evt)!.add(fn);
    return () => handlers.get(evt)!.delete(fn);
  },
  emit(evt: string, data?: any) {
    handlers.get(evt)?.forEach((fn) => {
      try {
        fn(data);
      } catch (e) {
        console.error(`[bus:${evt}]`, e);
      }
    });
  }
};

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

export function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
