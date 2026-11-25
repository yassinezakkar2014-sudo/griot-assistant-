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
import { ArmorSystem, VARIANTS } from "./game/armor";
import { Missions } from "./game/missions";
import { UI } from "./ui/ui";
import { mat } from "./world/materials";
import { installLocalApi } from "./ai/localapi";
import { Multiplayer } from "./net/multiplayer";
import { Passenger } from "./net/passenger";
import { buildWings } from "./world/wings";
import { buildWalls } from "./world/walls";
import { buildZuria } from "./world/zuria";
import { Cabin } from "./game/cabin";
import { Combat } from "./game/combat";
import { Space, STATION, MOON_BASE } from "./game/space";
import { Deco } from "./game/deco";
import { Mecha } from "./game/mecha";
import { Train } from "./game/train";
import { Airports } from "./game/airport";
import { AirCabin } from "./game/aircabin";
import { buildMSPalace } from "./world/msPalace";
import { ImperialPalace, IMPERIAL } from "./world/imperial";
import { buildMall, MALL } from "./world/mall";
import { buildCountries } from "./world/countries";
import { buildPalaceCrown, buildHyperTowers, buildMetropolis } from "./world/giant";
import { PLACES } from "./ai/actions";
import { AntiAir } from "./world/antiair";
import { buildHighway, buildRoyalTowers } from "./world/expansion";
import { CarSystem } from "./game/car";
import { Autopilot } from "./game/autopilot";
import { Weather, Fireworks } from "./game/weather";
import { Traffic, Treasure, ThemePark, Races, Tour, LEISURE_PLACES } from "./game/leisure";
import { Yacht } from "./game/megayacht";
import { buildLandmarks } from "./world/landmarks";
import { Realism } from "./engine/realism";
import { EmoteWheel } from "./ui/emotes";
import { ImperialGarage, buildPortals } from "./game/garage";

const $ = (id: string) => document.getElementById(id)!;
const canvas = $("scene") as HTMLCanvasElement;
const loadFill = $("loadFill");
const loadLabel = $("loadLabel");
const progress = (p: number, label: string) => {
  loadFill.style.width = `${Math.round(p * 100)}%`;
  loadLabel.textContent = label;
  bus.emit("aisam:state", p >= 1 ? "PRÊT" : `CHARGEMENT ${Math.round(p * 100)} %`);
};

// réglages graphiques persistants
// iPad (y compris iPadOS qui se présente comme un Mac), téléphones, tablettes
G.mobile = matchMedia("(pointer: coarse)").matches || (navigator.maxTouchPoints > 1 && /Macintosh|iPad|iPhone|Android/.test(navigator.userAgent));
if (G.mobile) document.documentElement.classList.add("touch");
// v2 : graphismes plus réalistes aussi sur iPad (ombres, bloom, meilleure résolution)
const settings = { v: 2, bloom: true, shadows: true, pixelRatio: G.mobile ? 0.8 : 1, ao: false };
try {
  const saved = JSON.parse(localStorage.getItem("griot-gfx") || "{}");
  if (saved.v === 2) Object.assign(settings, saved);
} catch {}
console.info("GRIOT version", __BUILD__);
(window as any).__griotSettings = settings;

// app installable (écran d'accueil) : fonctionne hors ligne après la première visite
if ("serviceWorker" in navigator && !(window as any).claude && (location.protocol === "https:" || location.hostname === "localhost")) {
  addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}

async function boot() {
  const local = await installLocalApi();
  if (local) document.documentElement.classList.add("serverless");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !G.mobile, powerPreference: "high-performance" });
  const applyPR = () => renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * settings.pixelRatio);
  applyPR();
  renderer.setSize(innerWidth, innerHeight, false);
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
  G.player.loadLook();
  G.player.init();
  G.net = new Multiplayer();
  G.passenger = new Passenger();

  // l'interface GRIOT est utilisable tout de suite ; le module AISAM (le jeu) se charge derrière
  const ui = new UI();
  // iPad/iPhone : le son ne peut démarrer que pendant un geste. Chaque toucher, clic ou touche
  // (re)débloque l'audio du jeu et la voix de GRIOT (après une mise en veille, un appel…).
  const gesture = () => {
    G.audio.unlock();
    ui.griot.voice.unlock();
  };
  for (const ev of ["touchend", "pointerup", "click", "keydown"]) addEventListener(ev, gesture, { capture: true, passive: true });
  await ui.init();
  Object.assign(window as any, { __G: G, __ui: ui, __VARIANTS: VARIANTS });
  // « active AISAM » avant la fin du chargement : on mémorise la demande
  const early = bus.on("aisam:on", () => {
    document.body.classList.add("aisam");
    bus.emit("layout");
  });

  progress(0.03, "Construction du palais royal");
  await new Promise((r) => setTimeout(r, 30));
  G.palace = new Palace();
  G.palace.build();

  G.world = new World();
  await G.world.build((p, l) => progress(0.08 + p * 0.85, l));
  progress(0.93, "Royal Talon & armurerie");
  await new Promise((r) => setTimeout(r, 0));
  progress(0.95, "Garage royal & galerie");
  const wings = buildWings(G.palace);
  buildWalls(G.palace);
  progress(0.955, "Autoroute royale & Tours royales");
  (G.world as any).highway = buildHighway();
  buildRoyalTowers();
  G.antiair = new AntiAir();
  G.antiair.build();
  progress(0.958, "Couronne du palais, hyper-tours et Nouvelle Métropole");
  await new Promise((r) => setTimeout(r, 0));
  buildPalaceCrown();
  buildHyperTowers();
  buildMetropolis();
  buildMall();
  progress(0.96, "Pays de Zuria");
  const zuria = buildZuria(G.palace);
  G.palace.spots.zuria = { pos: zuria.front, yaw: 0, label: "zuria" };
  progress(0.965, "Les pays du grand monde");
  await new Promise((r) => setTimeout(r, 0));
  const countryList = buildCountries();
  buildLandmarks();
  buildMSPalace();
  G.imperial = new ImperialPalace();
  G.imperial.build();
  for (const ci of countryList)
    PLACES.push({ id: "country:" + ci.def.id, name: ci.def.name, pos: () => ci.front.clone(), fly: () => ci.pad.clone(), outdoor: true });
  PLACES.push({ id: "station", name: "la Station orbitale royale", pos: () => STATION.clone().add(new THREE.Vector3(30, 0.2, 60)), fly: () => STATION.clone(), outdoor: true, space: true });
  PLACES.push({ id: "moon", name: "la Lune", pos: () => MOON_BASE.clone().add(new THREE.Vector3(10, 0.2, 10)), fly: () => MOON_BASE.clone().add(new THREE.Vector3(50, 0, 50)), outdoor: true, space: true });
  PLACES.push({ id: "imperial", name: "le Palais Impérial", pos: () => G.imperial.front.clone(), fly: () => G.imperial.pad.clone(), outdoor: true });
  PLACES.push({ id: "imperial-garage", name: "le Garage impérial", pos: () => new THREE.Vector3(IMPERIAL.x + 600 - 62, IMPERIAL.y + 0.3, IMPERIAL.z - 300 + 20), outdoor: true });
  PLACES.push({ id: "airport-imperial", name: "l'aéroport privé impérial", pos: () => new THREE.Vector3(0, 600.3, 5600 + 1000 - 535), outdoor: true });
  PLACES.push({ id: "imperial-road", name: "la Route impériale (col royal)", pos: () => new THREE.Vector3(14, G.physics.ground(14, 2000, 2400, 3000).y + 0.3, 2400), outdoor: true });
  PLACES.push({ id: "mall", name: "le Royal Mall", pos: () => new THREE.Vector3(MALL.x, 1.5, MALL.z + MALL.d / 2 + 8), outdoor: true });
  PLACES.push({ id: "airport", name: "l'Aéroport Royal", pos: () => new THREE.Vector3(2050, 6.3, -2750 + 535), outdoor: true });
  PLACES.push({ id: "airport-princesses", name: "l'aéroport de la Cité des Princesses", pos: () => new THREE.Vector3(6800, 8.3, -13900 - 535), outdoor: true });
  PLACES.push({ id: "metro", name: "la Nouvelle Métropole", pos: () => new THREE.Vector3(3020, G.physics.terrain(3020, 0) + 0.5, 0), outdoor: true });
  G.palace.spots.garage = { pos: wings.garageSpot, yaw: -Math.PI / 2, label: "garage" };
  G.palace.spots.gallery = { pos: wings.gallerySpot, yaw: Math.PI / 2, label: "gallery" };
  G.cars = new CarSystem();
  G.cars.build(wings.carSlots);
  G.autopilot = new Autopilot();
  G.autopilot.build();
  G.garage = new ImperialGarage();
  G.garage.build();
  buildPortals();
  G.ship = new Ship();
  G.ship.build();
  const falcon = new Ship({ name: "Faucon de Zuria", scale: 1, spawn: zuria.pad, yaw: Math.PI / 2, small: true, accent: 0xff9a3a });
  falcon.build();
  // les petits vaisseaux du Palais des Princesses (un chacune), sur leurs plateformes
  const pr = countryList.find((c) => c.def.id === "princesses")!.def;
  const minis = [
    { name: "Améthyste", dx: -112, dz: 40, hull: 0xb27ae6, trim: 0x6a2a9a, accent: 0xc87aff, flame: 0xb46bff },
    { name: "Turquoise", dx: 112, dz: 30, hull: 0x5ad8cc, trim: 0x147a74, accent: 0x3fe8d8, flame: 0x3fd8ff }
  ].map((m) => {
    const x = pr.x + m.dx,
      z = pr.z + m.dz;
    const y = G.physics.terrain(x, z);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 0.4, 40), new THREE.MeshStandardMaterial({ color: 0xf4f0ea, roughness: 0.4 }));
    pad.position.set(x, y + 0.2, z);
    const ring = new THREE.Mesh(new THREE.RingGeometry(9.6, 10.2, 64), new THREE.MeshStandardMaterial({ color: 0, emissive: m.accent, emissiveIntensity: 2 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y + 0.42, z);
    G.scene.add(pad, ring);
    G.physics.addBox({ x: x - 8, y: y - 1, z: z - 8 }, { x: x + 8, y: y + 0.4, z: z + 8 }, "pad");
    const sh = new Ship({ name: m.name, scale: 1, spawn: new THREE.Vector3(x, y + 0.4, z), yaw: 0, small: true, accent: m.accent, hull: m.hull, trim: m.trim, flame: m.flame });
    sh.build();
    G.world.markers.push({ id: "ship-" + m.name, name: `Vaisseau ${m.name}`, pos: new THREE.Vector3(x, y, z), icon: "✈", visible: () => true });
    return sh;
  });
  G.ships = [G.ship, falcon, ...minis];
  G.cabin = new Cabin();
  G.cabin.build(G.ship);
  G.combat = new Combat();
  G.combat.build();
  G.space = new Space();
  G.space.build();
  G.deco = new Deco();
  G.deco.build();
  G.mecha = new Mecha();
  G.mecha.build();
  G.train = new Train();
  G.train.build();
  G.airports = new Airports();
  G.airports.build();
  G.airCabin = new AirCabin();
  G.airCabin.build();
  G.weather = new Weather();
  G.weather.build();
  G.fireworks = new Fireworks();
  G.fireworks.build();
  G.traffic = new Traffic();
  G.traffic.build();
  G.treasure = new Treasure();
  G.treasure.build();
  G.park = new ThemePark();
  G.park.build();
  G.yacht = new Yacht();
  G.yacht.build();
  G.races = new Races();
  G.races.build();
  G.tour = new Tour();
  G.tour.build();
  G.emotes = new EmoteWheel();
  G.emotes.build();
  new Realism().build(renderer);
  PLACES.push({ id: "park", name: "l'Île des Attractions", pos: () => LEISURE_PLACES.park(), outdoor: true });
  PLACES.push({ id: "marina", name: "la marina royale", pos: () => LEISURE_PLACES.marina(), outdoor: true });
  G.armor = new ArmorSystem();
  G.armor.build();
  const companion = buildCompanion();


  // position de départ : devant le palais, porte ouverte
  G.player.position.set(0, 0, -78);
  G.player.yaw = Math.PI;
  G.palace.doors.get("door-main")!.open(true);
  G.player.snapCamera();

  // le rendu suit la taille de la fenêtre AISAM (intégrée ou plein écran)
  function fit() {
    const w = Math.max(1, canvas.clientWidth),
      h = Math.max(1, canvas.clientHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    G.env.resize(w, h);
  }
  new ResizeObserver(fit).observe(canvas);
  const applySettings = () => {
    G.env.bloomEnabled = settings.bloom;
    G.env.ao.enabled = settings.ao;
    const res = settings.ao ? 4096 : G.mobile ? 1024 : 2048;
    if (G.env.sun.shadow.mapSize.x !== res) {
      G.env.sun.shadow.mapSize.set(res, res);
      G.env.sun.shadow.map?.dispose();
      (G.env.sun.shadow as any).map = null;
    }
    if (renderer.shadowMap.enabled !== settings.shadows) {
      renderer.shadowMap.enabled = settings.shadows;
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (m) (Array.isArray(m) ? m : [m]).forEach((x) => (x.needsUpdate = true));
      });
    }
    applyPR();
    fit();
    try {
      localStorage.setItem("griot-gfx", JSON.stringify(settings));
    } catch {}
  };
  bus.on("settings", applySettings);
  applySettings();


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
  $("btnContinue").hidden = true;
  $("btnNew").hidden = !hasSave;
  const W = window as any;
  let active = false;
  let activating: Promise<void> | null = null;
  let wantActive = false;
  let firstEntry = true;

  /** Active le module AISAM : le jeu prend vie dans la fenêtre de l'interface. */
  const activate = (fresh = false): Promise<void> => {
    wantActive = true;
    document.body.classList.add("aisam");
    bus.emit("layout");
    if (active) return Promise.resolve();
    if (activating) return activating;
    activating = (async () => {
      G.audio.unlock();
      ui.griot.voice.unlock();
      if (firstEntry) {
        firstEntry = false;
        if (hasSave && !fresh) await G.missions.load();
        else if (hasSave) {
          try {
            localStorage.removeItem("griot-save");
          } catch {}
          await fetch("/api/save", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ save: null }) }).catch(() => {});
        }
      }
      G.missions.unlockAll(); // tout est gratuit et débloqué
      G.input.keys.clear();
      G.input.pressed.clear();
      $("loader").classList.add("gone");
      $("hud").hidden = false;
      document.body.dataset.mode = G.mode;
      active = W.__aisamActive = true;
      bus.emit("aisam:state", "ACTIF");
      bus.emit("mode");
      fit();
      activating = null;
    })();
    return activating;
  };
  const deactivate = () => {
    wantActive = false;
    if (!active) {
      document.body.classList.remove("aisam");
      return;
    }
    if (G.mode === "inspect") G.armor.endInspect();
    ui.closeModal();
    G.input.unlock();
    G.missions.saveNow();
    G.audio.setEngine(null);
    active = W.__aisamActive = false;
    $("hud").hidden = true;
    $("loader").classList.remove("gone");
    loadLabel.textContent = "AISAM en veille. Votre progression est sauvegardée.";
    document.body.classList.remove("aisam", "full");
    bus.emit("aisam:state", "EN VEILLE");
    bus.emit("layout");
  };
  W.__aisamActivate = activate;
  W.__gameReady = true;
  early();
  bus.on("aisam:on", () => activate());
  bus.on("aisam:off", deactivate);
  $("btnStart").onclick = () => activate();
  $("btnNew").onclick = () => activate(true);
  if (wantActive || document.body.classList.contains("aisam")) activate();
  bus.emit("aisam:state", "PRÊT");

  // ---------------------------------------------------------------- boucle principale
  const clock = new THREE.Clock();
  let zoneTimer = 0;
  let saveTimer = 0;
  const loop = () => {
    requestAnimationFrame(loop);
    const raw = clock.getDelta();
    if (!active) {
      // AISAM en veille : pas de 3D, mais on reste visible en multijoueur (messages, appels vidéo)
      if (G.net) G.net.update(Math.min(raw, 0.1));
      return;
    }
    (window as any).__fps = Math.round(0.9 * ((window as any).__fps ?? 60) + 0.1 / Math.max(raw, 1e-3));
    const dt = Math.min(raw, 0.05);
    G.time += dt;
    const t = G.time;
    G.env.update(dt);
    G.palace.update(dt, t);
    G.physics.update();
    if (!$("hud").hidden && !ui.modalOpen) {
      G.player.update(dt);
      for (const s of G.ships) s.update(dt, t);
      G.antiair.update(dt, t);
      G.cars.update(dt, t);
      G.passenger.update(dt);
    } else {
      if (G.mode !== "inspect") G.input.consumeMouse();
      if (G.mode === "foot") G.player.update(0);
    }
    G.armor.update(dt, t);
    G.interact.update();
    G.world.update(dt, t);
    updateCompanion(companion, dt, t);
    G.net.update(dt);
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
    (window as any).__afterRender?.(); // capture vidéo (TikTok) juste après le rendu
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
