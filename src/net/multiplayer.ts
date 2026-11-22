// MULTIJOUEUR — chaque joueur voit les autres (à pied, en armure ou en Royal Talon) et peut leur écrire.
// Transport : salle temps réel de Claude quand la page est ouverte dans claude.ai,
// sinon relais public MQTT sur WebSocket sécurisé (site web, iPad compris).
import * as THREE from "three";
import { G, bus } from "../core";
import { Humanoid, DEFAULT_LOOK, type Look } from "../game/humanoid";
import { buildShipModel, buildSmallShipModel, cloakMaterial } from "../game/shipmodel";
import { ArmorSet, type ArmorStyle } from "../game/armor";
import { SHIP_SCALE } from "../game/ship";
import { Mecha } from "../game/mecha";

export interface NetState {
  n: string; // nom
  m: string; // mode
  p: number[]; // position joueur
  y: number; // orientation
  o: number; // tenue
  a: string | 0; // couleur de l'armure portée
  s: number[] | 0; // vaisseau : x y z qx qy qz qw poussée
  z: string; // zone
  say?: { text: string; at: number };
  /** armure complète : [alliage, lueur, motif, masque] */
  ar?: [string, string, string, number];
  /** voiture conduite : [id, x, y, z, cap, vitesse, moteur] */
  c?: [string, number, number, number, number, number, number];
  /** passager de (id du joueur) */
  r?: string;
  /** portes et barrières partagées : id → [ouverte, horodatage] */
  d?: Record<string, [number, number]>;
  /** apparence de l'avatar */
  lk?: Look;
  /** invité dans la cabine de (id du pilote) */
  cb?: string;
  /** pouvoir d'armure spécial : "spectre" (invisible) ou "titan" (robot géant) */
  sp?: string;
  /** décoration du palais (envoyée régulièrement ; la plus récente gagne) */
  dk?: { v: number; t: string; i: [any, number, number, number, number][] };
}

/** Portes synchronisées entre joueurs (barrières, portails, grandes portes). */
const SHARED_DOOR = /^(gate-|door-main$|door-hangar$|door-cargarage$|door-zuria$|door-terrace$)/;

const BROKERS = ["wss://broker.emqx.io:8084/mqtt", "wss://broker.hivemq.com:8884/mqtt", "wss://test.mosquitto.org:8081"];
const TOPIC = "griot-royaume/v2";
const r2 = (v: number) => Math.round(v * 100) / 100;

class Remote {
  body = new Humanoid(0x1e4fd8);
  label: THREE.Sprite;
  ship: ReturnType<typeof buildShipModel> | null = null;
  shipGroup = new THREE.Group();
  target = new THREE.Vector3();
  shipTarget = new THREE.Vector3();
  shipQ = new THREE.Quaternion();
  yaw = 0;
  last = performance.now();
  state: NetState | null = null;
  private cloaked = false;
  armor: ArmorSet | null = null;
  shipKind = -1;
  car: string | null = null;
  interactAdded = false;
  private prev = new THREE.Vector3();
  private lightMat = new THREE.MeshStandardMaterial({ color: 0x050810, emissive: 0x3fc8ff, emissiveIntensity: 2 });
  private glowMat = new THREE.MeshStandardMaterial({ color: 0, emissive: 0x2a9dff, emissiveIntensity: 3 });

  constructor(public id: string, name: string) {
    const cv = document.createElement("canvas");
    cv.width = 256;
    cv.height = 64;
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
    this.label.scale.set(2.4, 0.6, 1);
    this.label.position.y = 2.35;
    this.setName(name);
    this.body.root.add(this.label);
    G.scene.add(this.body.root, this.shipGroup);
  }

  setName(name: string) {
    const tex = (this.label.material as THREE.SpriteMaterial).map as THREE.CanvasTexture;
    const c = (tex.image as HTMLCanvasElement).getContext("2d")!;
    c.clearRect(0, 0, 256, 64);
    c.fillStyle = "rgba(4,12,28,.75)";
    c.beginPath();
    c.roundRect(8, 8, 240, 48, 18);
    c.fill();
    c.strokeStyle = "#3fe0ff";
    c.lineWidth = 2;
    c.stroke();
    c.fillStyle = "#fff";
    c.font = "bold 26px Manrope, Arial";
    c.textAlign = "center";
    c.fillText(name.slice(0, 16), 128, 41);
    tex.needsUpdate = true;
  }

  private lookKey = "";
  cabinSeen = false;
  apply(st: NetState) {
    if (!this.state || this.state.n !== st.n) this.setName(st.n);
    this.state = st;
    this.last = performance.now();
    this.target.fromArray(st.p);
    this.yaw = st.y;
    if (st.lk && typeof st.lk === "object") {
      const key = JSON.stringify(st.lk);
      if (key !== this.lookKey) {
        this.lookKey = key;
        this.body.applyLook({ ...DEFAULT_LOOK, ...st.lk, acc: Array.isArray(st.lk.acc) ? st.lk.acc.slice(0, 8).map(String) : [] });
      }
    } else this.body.outfit.color.setHex(st.o);
    this.body.outfit.emissive.setHex(0);
    // armure complète, avec ses couleurs, son motif et le masque
    if (st.ar) {
      const style: ArmorStyle = { primary: st.ar[0], glow: st.ar[1], pattern: (st.ar[2] as ArmorStyle["pattern"]) || "lines", intensity: 1.6, effect: "pulse" };
      if (!this.armor) {
        this.armor = new ArmorSet(this.body, style);
        this.armor.setWindow(0, 1e4);
      }
      this.armor.setVisible(true);
      this.armor.applyStyle(style);
      this.armor.plate.emissiveIntensity = 1;
      this.armor.helmet.visible = st.ar[3] === 1;
    } else if (this.armor) this.armor.setVisible(false);
    if (st.s) {
      const kind = (st.s as number[])[9] === 1 ? 1 : 0;
      if (this.shipKind !== kind) {
        if (this.ship) this.shipGroup.remove(this.ship.group);
        this.shipKind = kind;
        const sc = kind ? 1 : SHIP_SCALE;
        this.ship = (kind ? buildSmallShipModel : buildShipModel)(this.lightMat, this.glowMat);
        this.ship.group.position.y = -0.3 * sc;
        this.ship.group.scale.setScalar(sc);
        this.shipGroup.add(this.ship.group);
        this.shipGroup.position.fromArray(st.s);
        this.cloaked = false;
      }
      this.shipTarget.set(st.s[0], st.s[1], st.s[2]);
      this.shipQ.set(st.s[3], st.s[4], st.s[5], st.s[6]);
      const cloaked = (st.s as number[])[8] === 1;
      if (cloaked !== this.cloaked) {
        this.cloaked = cloaked;
        this.ship!.group.traverse((o) => {
          const me = o as THREE.Mesh;
          if (!me.isMesh) return;
          if (cloaked) {
            me.userData.mat = me.material;
            me.material = cloakMaterial();
          } else if (me.userData.mat) me.material = me.userData.mat;
        });
      }
      this.ship!.exhaust.forEach((e) => {
        e.visible = (st.s as number[])[7] > 0;
        e.scale.y = 0.4 + (st.s as number[])[7];
      });
    }
  }

  private mecha: Mecha | null = null;

  update(dt: number) {
    const st = this.state;
    if (!st) return;
    const inShip = (st.m === "ship" && st.s) || st.m === "car" || st.m === "passenger";
    this.body.root.visible = !inShip && st.sp !== "spectre" && st.sp !== "titan";
    if (st.sp === "titan" && !inShip) {
      if (!this.mecha) {
        this.mecha = new Mecha();
        this.mecha.build();
      }
      if (st.ar) this.mecha.setColors(st.ar[0], st.ar[1]);
      this.mecha.drive(this.body.root.position, this.body.root.rotation.y, false, dt);
    } else if (this.mecha) this.mecha.root.visible = false;
    this.shipGroup.visible = !!st.s;
    this.prev.copy(this.body.root.position);
    this.body.root.position.lerp(this.target, 1 - Math.exp(-dt * 10));
    if (this.body.root.position.distanceTo(this.target) > 30) this.body.root.position.copy(this.target);
    let d = this.yaw - this.body.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.body.root.rotation.y += d * Math.min(1, dt * 10);
    const speed = this.prev.distanceTo(this.body.root.position) / Math.max(dt, 1e-3);
    this.body.animate(dt, Math.min(speed, 9), false, st.m === "sit");
    if (st.s) {
      this.shipGroup.position.lerp(this.shipTarget, 1 - Math.exp(-dt * 8));
      if (this.shipGroup.position.distanceTo(this.shipTarget) > 200) this.shipGroup.position.copy(this.shipTarget);
      this.shipGroup.quaternion.slerp(this.shipQ, 1 - Math.exp(-dt * 8));
    }
  }

  /** échelle du vaisseau de ce joueur */
  get shipScale() {
    return this.shipKind === 1 ? 1 : SHIP_SCALE;
  }

  dispose() {
    G.scene.remove(this.body.root, this.shipGroup);
    if (this.mecha) G.scene.remove(this.mecha.root);
    G.interact.remove("peer-ship-" + this.id);
    G.interact.remove("peer-cabin-" + this.id);
  }
}

export class Multiplayer {
  id = Math.random().toString(36).slice(2, 10);
  name = "Joueur";
  room = "royaume";
  status: "off" | "connecting" | "on" | "error" = "off";
  via = "";
  peers = new Map<string, Remote>();
  private client: any = null;
  private claudeRoom: any = null;
  private sendTimer = 0;
  private lastSay: NetState["say"];
  private unsub: (() => void) | null = null;
  private seenSay = new Set<string>();

  constructor() {
    try {
      const s = JSON.parse(localStorage.getItem("griot-mp") || "{}");
      if (s.name) this.name = s.name;
      if (s.room) this.room = s.room;
      if (s.id) this.id = s.id;
    } catch {}
  }

  private persist() {
    try {
      localStorage.setItem("griot-mp", JSON.stringify({ name: this.name, room: this.room, id: this.id }));
    } catch {}
  }

  private setStatus(s: Multiplayer["status"], msg?: string) {
    this.status = s;
    bus.emit("mp:status", { status: s, msg, via: this.via });
  }

  async connect(name: string, room: string) {
    this.disconnect(true);
    this.name = (name || "Joueur").trim().slice(0, 16);
    this.room = (room || "royaume").trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 32) || "royaume";
    this.persist();
    this.setStatus("connecting");
    // 1) salle temps réel de Claude (page ouverte dans claude.ai)
    const cl = (window as any).claude;
    if (cl?.use) {
      const ns = await cl.use("room").catch(() => null);
      if (ns) {
        try {
          const r = await ns.join("royaume-" + this.room);
          this.claudeRoom = r;
          this.via = "Claude";
          this.unsub = r.onPeers((ch: any) => {
            for (const p of ch.left) this.drop(p.peer);
            for (const p of [...ch.joined, ...ch.updated]) if (!p.isMe && p.presence?.st) this.receive(p.peer, p.presence.st as NetState);
          });
          this.setStatus("on");
          bus.emit("toast", { text: `👥 Connecté à la salle « ${this.room} » (via Claude).` });
          return;
        } catch (e: any) {
          console.warn("salle Claude indisponible", e?.code);
        }
      }
    }
    // 2) relais public MQTT (site web)
    try {
      const mod: any = await import("mqtt/dist/mqtt.esm");
      const mqtt = mod.default ?? mod;
      for (const url of ((window as any).__mpBrokers as string[] | undefined) ?? BROKERS) {
        const ok = await new Promise<boolean>((res) => {
          const c = mqtt.connect(url, { connectTimeout: 7000, reconnectPeriod: 3000, clean: true, clientId: "griot_" + this.id + "_" + Math.random().toString(36).slice(2, 6), will: { topic: `${TOPIC}/${this.room}/bye/${this.id}`, payload: "1", qos: 0, retain: false } });
          const fail = setTimeout(() => {
            c.end(true);
            res(false);
          }, 8000);
          c.once("connect", () => {
            clearTimeout(fail);
            this.client = c;
            res(true);
          });
          c.once("error", () => {
            clearTimeout(fail);
            c.end(true);
            res(false);
          });
        });
        if (!ok) continue;
        this.via = new URL(url).hostname;
        const c = this.client;
        c.subscribe(`${TOPIC}/${this.room}/#`);
        c.on("message", (topic: string, payload: Uint8Array) => {
          const parts = topic.split("/");
          const kind = parts[3],
            from = parts[4];
          if (!from || from === this.id) return;
          if (kind === "bye") return this.drop(from);
          if (kind === "sig") {
            try {
              const m = JSON.parse(new TextDecoder().decode(payload));
              if (m && m.to === this.id) bus.emit("mp:signal", { from, name: this.peers.get(from)?.state?.n ?? "Joueur", d: m.d });
            } catch {}
            return;
          }
          if (kind === "s") {
            try {
              this.receive(from, JSON.parse(new TextDecoder().decode(payload)));
            } catch {}
          }
        });
        c.on("offline", () => this.setStatus("connecting"));
        c.on("connect", () => this.setStatus("on"));
        this.setStatus("on");
        bus.emit("toast", { text: `👥 Connecté à la salle « ${this.room} ». Donnez ce nom de salle à vos amis.` });
        return;
      }
      this.setStatus("error", "Aucun relais joignable (réseau bloqué ?).");
    } catch (e) {
      console.error(e);
      this.setStatus("error", "Module réseau indisponible.");
    }
  }

  disconnect(silent = false) {
    if (this.client) {
      try {
        this.client.publish(`${TOPIC}/${this.room}/bye/${this.id}`, "1");
        this.client.end();
      } catch {}
      this.client = null;
    }
    if (this.claudeRoom) {
      this.unsub?.();
      this.claudeRoom.leave().catch(() => {});
      this.claudeRoom = null;
    }
    for (const id of [...this.peers.keys()]) this.drop(id, true);
    this.via = "";
    if (!silent) {
      this.setStatus("off");
      bus.emit("toast", { text: "Multijoueur déconnecté." });
    }
  }

  /** Message direct à un joueur (messagerie privée, appels vidéo). Relais MQTT uniquement. */
  signal(to: string, d: unknown) {
    if (this.status !== "on" || !this.client?.connected) return false;
    this.client.publish(`${TOPIC}/${this.room}/sig/${this.id}`, JSON.stringify({ to, d }));
    return true;
  }

  say(text: string) {
    text = text.trim().slice(0, 200);
    if (!text || this.status !== "on") return false;
    this.lastSay = { text, at: Date.now() };
    this.sendTimer = 0; // envoi immédiat
    bus.emit("mp:chat", { name: this.name + " (vous)", text });
    return true;
  }

  private receive(id: string, st: NetState) {
    if (!st || !Array.isArray(st.p)) return;
    let r = this.peers.get(id);
    if (!r) {
      r = new Remote(id, String(st.n || "Joueur"));
      this.peers.set(id, r);
      bus.emit("toast", { text: `👥 ${String(st.n || "Un joueur")} a rejoint le royaume.` });
      bus.emit("mp:peers");
    }
    const wasRiding = r.state?.r === this.id;
    r.apply({ ...st, n: String(st.n || "Joueur").slice(0, 16) });
    if (st.r === this.id && !wasRiding) bus.emit("toast", { text: `🧑‍🚀 ${r.state!.n} est monté à bord avec vous.` });
    if (st.r !== this.id && wasRiding) bus.emit("toast", { text: `${r.state!.n} est descendu.` });
    if (st.cb === this.id && r.cabinSeen !== true) bus.emit("toast", { text: `🛋️ ${r.state!.n} est dans la cabine de votre Royal Talon.` });
    if (st.cb !== this.id && r.cabinSeen) bus.emit("toast", { text: `${r.state!.n} a quitté votre cabine.` });
    r.cabinSeen = st.cb === this.id;
    // décoration du palais : la plus récente gagne
    if (st.dk && typeof st.dk === "object" && Number(st.dk.v) > G.deco.version) G.deco.load(st.dk as any);
    // portes et barrières : le changement le plus récent gagne
    if (st.d && typeof st.d === "object")
      for (const [did, v] of Object.entries(st.d)) {
        const door = G.palace?.doors.get(did);
        if (!door || !SHARED_DOOR.test(did) || !Array.isArray(v)) continue;
        const [open, at] = v;
        if (at > door.changedAt) {
          door.changedAt = at;
          door.locked = false;
          if (open) door.open(true);
          else door.close(true);
        }
      }
    // voiture conduite par ce joueur
    const carId = Array.isArray(st.c) ? String(st.c[0]) : null;
    if (r.car && r.car !== carId) G.cars?.releaseRemote(r.car);
    r.car = carId;
    if (carId && st.c) G.cars?.applyRemote(carId, id, st.c);
    if (!r.interactAdded) {
      r.interactAdded = true;
      G.interact.add({
        id: "peer-ship-" + id,
        pos: () => {
          const sc = r!.shipScale;
          return r!.shipGroup.position.clone().add(new THREE.Vector3(-5.8 * sc, -1.35 * sc + 1, -2.5 * sc).applyQuaternion(r!.shipGroup.quaternion));
        },
        radius: 14,
        enabled: () => G.mode === "foot" && !!r!.state?.s && r!.state.m === "ship" && r!.shipGroup.position.y - G.physics.terrain(r!.shipGroup.position.x, r!.shipGroup.position.z) < 14 * r!.shipScale,
        label: () => `🧑‍🚀 Monter à bord avec ${r!.state?.n ?? "ce joueur"}`,
        action: () => G.passenger.board("ship", id)
      });
      G.interact.add({
        id: "peer-cabin-" + id,
        pos: () => {
          const sc = r!.shipScale;
          return r!.shipGroup.position.clone().add(new THREE.Vector3(0, -1.35 * sc + 1, 8.6 * sc).applyQuaternion(r!.shipGroup.quaternion));
        },
        radius: 14,
        enabled: () => G.mode === "foot" && !!r!.state?.s && (r!.state.s as number[])[9] !== 1 && r!.shipGroup.position.y - G.physics.terrain(r!.shipGroup.position.x, r!.shipGroup.position.z) < 14 * r!.shipScale,
        label: () => `🛋️ Entrer dans la cabine de ${r!.state?.n ?? "ce joueur"}`,
        action: () => G.cabin.enterAsGuest(id)
      });
    }
    if (st.say && st.say.text) {
      const key = id + st.say.at;
      if (!this.seenSay.has(key) && Date.now() - st.say.at < 60_000) {
        this.seenSay.add(key);
        bus.emit("mp:chat", { name: r.state!.n, text: String(st.say.text).slice(0, 200) });
      }
    }
  }

  private drop(id: string, silent = false) {
    const r = this.peers.get(id);
    if (!r) return;
    if (r.car) G.cars?.releaseRemote(r.car);
    r.dispose();
    this.peers.delete(id);
    if (!silent) bus.emit("toast", { text: `👋 ${r.state?.n ?? "Un joueur"} a quitté le royaume.` });
    bus.emit("mp:peers");
  }

  private myState(): NetState {
    const pl = G.player;
    const sh = G.ship;
    const shipOut = true;
    return {
      n: this.name,
      m: pl.sitting ? "sit" : G.mode,
      p: [r2(pl.position.x), r2(pl.position.y), r2(pl.position.z)],
      y: r2(pl.body.root.rotation.y),
      o: pl.body.outfit.color.getHex(),
      ...(performance.now() - this.lookSent > 2000 ? ((this.lookSent = performance.now()), { lk: pl.body.look }) : {}),
      a: G.armor.worn ? G.armor.style.glow : 0,
      ...(G.armor.worn ? { ar: [G.armor.style.primary, G.armor.style.glow, G.armor.style.pattern, G.armor.maskUp ? 1 : 0] as [string, string, string, number] } : {}),
      ...((G.mode as string) === "car" && G.cars.active
        ? { c: [G.cars.active.def.id, r2(G.cars.active.pos.x), r2(G.cars.active.pos.y), r2(G.cars.active.pos.z), r2(G.cars.active.yaw), r2(G.cars.active.speed), 1] as [string, number, number, number, number, number, number] }
        : {}),
      ...(G.passenger?.ride ? { r: G.passenger.ride.owner } : {}),
      ...(G.cabin?.host && G.cabin.inside ? { cb: G.cabin.host } : {}),
      d: this.sharedDoors(),
      ...(G.armor.worn && G.armor.style.special ? { sp: G.armor.style.special } : {}),
      ...(G.deco.version && performance.now() - this.decoSent > 3000 ? ((this.decoSent = performance.now()), { dk: G.deco.compact() }) : {}),
      s: shipOut ? [r2(sh.root.position.x), r2(sh.root.position.y), r2(sh.root.position.z), r2(sh.root.quaternion.x), r2(sh.root.quaternion.y), r2(sh.root.quaternion.z), r2(sh.root.quaternion.w), sh.engines ? r2(sh.throttle) : 0, sh.stealth ? 1 : 0, sh.opts.small ? 1 : 0] : 0,
      z: G.world.zoneName(G.mode === "ship" ? sh.root.position : pl.position),
      ...(this.lastSay ? { say: this.lastSay } : {})
    };
  }

  private decoSent = 0;
  private lookSent = 0;

  private sharedDoors() {
    const out: Record<string, [number, number]> = {};
    for (const [id, d] of G.palace.doors) if (d.changedAt && SHARED_DOOR.test(id)) out[id] = [d.target, d.changedAt];
    return out;
  }

  update(dt: number) {
    if (this.status === "on") {
      const nowMs = performance.now();
      if (nowMs - this.sendTimer > 120) {
        this.sendTimer = nowMs;
        const st = this.myState();
        if (this.claudeRoom) this.claudeRoom.presence({ st }).catch(() => {});
        else if (this.client?.connected) this.client.publish(`${TOPIC}/${this.room}/s/${this.id}`, JSON.stringify(st));
      }
    }
    const now = performance.now();
    for (const [id, r] of this.peers) {
      if (!this.claudeRoom && now - r.last > 12000) this.drop(id);
      else r.update(dt);
    }
  }

  list() {
    return [...this.peers.values()].map((r) => ({ id: r.id, name: r.state?.n ?? "?", zone: r.state?.z ?? "", pos: r.target.clone(), mode: r.state?.m, car: r.car }));
  }
}
