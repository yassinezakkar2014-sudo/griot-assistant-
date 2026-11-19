// GRIOT 2.0 — THE ROYAL INTELLIGENCE UNIVERSE : point d'entrée.
import * as THREE from "three";
import "./style.css";
import { G, bus, damp } from "./core";
import { Physics } from "./engine/physics";
import { Input } from "./engine/input";
import { AudioFX } from "./engine/audio";
import { Environment } from "./engine/environment";
import { Interactions } from "./game/interact";
import { Player } from "./game/player";
import { Palace } from "./world/palace";
import { World } from "./world/world";
import { Ship } from "./game/ship";
import { ArmorSystem } from "./game/armor";
import { Missions } from "./game/missions";
import { UI } from "./ui/ui";
import { mat } from "./world/materials";

const $ = (id: string) => document.getElementById(id)!;
const canvas = $("scene") as HTMLCanvasElement;
const loadFill = $("loadFill");
const loadLabel = $("loadLabel");
const progress = (p: number, label: string) => {
  loadFill.style.width = `${Math.round(p * 100)}%`;
  loadLabel.textContent = label;
};

// réglages graphiques persistants
G.mobile = matchMedia("(pointer: coarse)").matches && !matchMedia("(pointer: fine)").matches;
const settings = { bloom: !G.mobile, shadows: !G.mobile, pixelRatio: G.mobile ? 0.6 : 1 };
try {
  Object.assign(settings, JSON.parse(localStorage.getItem("griot-gfx") || "{}"));
} catch {}
(window as any).__griotSettings = settings;

async function boot() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !G.mobile, powerPreference: "high-performance" });
  const applyPR = () => renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * settings.pixelRatio);
  applyPR();
  renderer.setSize(innerWidth, innerHeight);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 12000);
  Object.assign(G, { renderer, scene, camera, mode: "foot", time: 0, uiFocus: false });

  G.physics = new Physics();
  G.input = new Input(canvas);
  G.audio = new AudioFX();
  G.interact = new Interactions();
  G.env = new Environment(scene, renderer, camera);
  G.missions = new Missions();
  G.missions.init();
  G.player = new Player();
  G.player.init();

  progress(0.03, "Construction du palais royal");
  await new Promise((r) => setTimeout(r, 30));
  G.palace = new Palace();
  G.palace.build();

  G.world = new World();
  await G.world.build((p, l) => progress(0.08 + p * 0.85, l));
  progress(0.93, "Royal Talon & armurerie");
  await new Promise((r) => setTimeout(r, 0));
  G.ship = new Ship();
  G.ship.build();
  G.armor = new ArmorSystem();
  G.armor.build();
  const companion = buildCompanion();

  const ui = new UI();
  await ui.init();
  // poignées de débogage (console du navigateur)
  Object.assign(window as any, { __G: G, __ui: ui });

  // position de départ : devant le palais, porte ouverte
  G.player.position.set(0, 0, -78);
  G.player.yaw = Math.PI;
  G.palace.doors.get("door-main")!.open(true);
  G.player.snapCamera();

  const applySettings = () => {
    G.env.bloomEnabled = settings.bloom;
    if (renderer.shadowMap.enabled !== settings.shadows) {
      renderer.shadowMap.enabled = settings.shadows;
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (m) (Array.isArray(m) ? m : [m]).forEach((x) => (x.needsUpdate = true));
      });
    }
    applyPR();
    renderer.setSize(innerWidth, innerHeight);
    G.env.resize(innerWidth, innerHeight);
    try {
      localStorage.setItem("griot-gfx", JSON.stringify(settings));
    } catch {}
  };
  bus.on("settings", applySettings);
  applySettings();

  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    G.env.resize(innerWidth, innerHeight);
  });

  // pré-compilation des shaders pour éviter les saccades au premier affichage
  progress(0.97, "Compilation des shaders");
  G.palace.interiors.forEach((g) => (g.visible = true));
  renderer.compile(scene, camera);
  progress(1, "Le royaume est prêt.");

  const hasSave = (() => {
    try {
      return !!localStorage.getItem("griot-save");
    } catch {
      return false;
    }
  })();
  $("startButtons").hidden = false;
  if (hasSave) {
    $("btnContinue").hidden = false;
    $("btnNew").hidden = false;
    $("btnStart").hidden = true;
  }
  const enter = async (load: boolean) => {
    G.audio.unlock();
    if (load) await G.missions.load();
    else if (hasSave) {
      try {
        localStorage.removeItem("griot-save");
      } catch {}
      await fetch("/api/save", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ save: null }) }).catch(() => {});
    }
    $("loader").classList.add("gone");
    $("hud").hidden = false;
    document.body.dataset.mode = "foot";
    if (!G.mobile) canvas.requestPointerLock?.();
    setTimeout(() => {
      const hello = load ? "Bon retour dans votre royaume, Majesté." : "Bienvenue dans votre royaume, Majesté. Je suis GRIOT. Le palais vous attend : entrez, explorez, et appelez-moi quand vous voulez avec la touche T.";
      bus.emit("griot:say", { text: hello });
    }, 900);
  };
  $("btnStart").onclick = () => enter(false);
  $("btnContinue").onclick = () => enter(true);
  $("btnNew").onclick = () => enter(false);

  // ---------------------------------------------------------------- boucle principale
  const clock = new THREE.Clock();
  let zoneTimer = 0;
  let saveTimer = 0;
  const loop = () => {
    requestAnimationFrame(loop);
    const raw = clock.getDelta();
    (window as any).__fps = Math.round(0.9 * ((window as any).__fps ?? 60) + 0.1 / Math.max(raw, 1e-3));
    const dt = Math.min(raw, 0.05);
    G.time += dt;
    const t = G.time;
    G.env.update(dt);
    G.palace.update(dt, t);
    G.physics.update();
    if (!$("hud").hidden && !ui.modalOpen) {
      G.player.update(dt);
      G.ship.update(dt, t);
    } else {
      if (G.mode !== "inspect") G.input.consumeMouse();
      if (G.mode === "foot") G.player.update(0);
    }
    G.armor.update(dt, t);
    G.interact.update();
    G.world.update(dt, t);
    updateCompanion(companion, dt, t);
    zoneTimer += dt;
    if (zoneTimer > 1) {
      zoneTimer = 0;
      bus.emit("zone");
      G.missions.update();
    }
    if (G.mode === "ship") G.missions.update();
    saveTimer += dt;
    if (saveTimer > 25 && !$("hud").hidden) {
      saveTimer = 0;
      G.missions.saveNow();
    }
    ui.update(dt, t);
    if (ui.shake > 0) {
      G.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * ui.shake, (Math.random() - 0.5) * ui.shake, (Math.random() - 0.5) * ui.shake));
      ui.shake = Math.max(0, ui.shake - dt * 1.5);
    }
    G.env.render();
    G.input.endFrame();
  };
  loop();
  addEventListener("beforeunload", () => G.missions.saveNow());
}

// ---------------------------------------------------------------- GRIOT, compagnon holographique
function buildCompanion() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 2), mat.glowCyan.clone());
  const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.008, 6, 48), mat.holo);
  const r2 = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.006, 6, 48), mat.holo);
  g.add(core, r1, r2);
  G.scene.add(g);
  let level = 0;
  bus.on("griot:level", (l: number) => (level = l));
  return { g, core, r1, r2, get level() {
    return level;
  } };
}

function updateCompanion(c: ReturnType<typeof buildCompanion>, dt: number, t: number) {
  const visible = G.mode === "foot" || G.mode === "inspect";
  c.g.visible = visible;
  if (!visible) return;
  const p = G.player.position;
  const right = new THREE.Vector3(Math.cos(G.player.yaw), 0, -Math.sin(G.player.yaw));
  const target = new THREE.Vector3(p.x, p.y + 2.05 + Math.sin(t * 1.6) * 0.06, p.z).addScaledVector(right, 0.7).addScaledVector(G.player.forward(), -0.3);
  c.g.position.lerp(target, 1 - Math.exp(-dt * 4));
  c.r1.rotation.x = t * 1.3;
  c.r1.rotation.y = t * 0.7;
  c.r2.rotation.y = -t;
  c.r2.rotation.z = t * 0.5;
  const s = 1 + c.level * 0.6;
  c.core.scale.setScalar(damp(c.core.scale.x, s, 12, dt));
  (c.core.material as THREE.MeshStandardMaterial).emissiveIntensity = 2 + c.level * 4;
}

boot().catch((e) => {
  console.error(e);
  loadLabel.textContent = "Erreur de chargement : " + (e?.message || e) + " — votre navigateur prend-il en charge WebGL ?";
});
