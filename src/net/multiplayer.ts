// MULTIJOUEUR — chaque joueur voit les autres (à pied, en armure ou en Royal Talon) et peut leur écrire.
// Transport : salle temps réel de Claude quand la page est ouverte dans claude.ai,
// sinon relais public MQTT sur WebSocket sécurisé (site web, iPad compris).
import * as THREE from "three";
import { G, bus } from "../core";
import { Humanoid } from "../game/humanoid";
import { buildShipModel, cloakMaterial } from "../game/shipmodel";
import { SHIP_SCALE } from "../game/ship";

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
}

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

  apply(st: NetState) {
    if (!this.state || this.state.n !== st.n) this.setName(st.n);
    this.state = st;
    this.last = performance.now();
    this.target.fromArray(st.p);
    this.yaw = st.y;
    if (st.a) {
      this.body.outfit.color.setHex(0x0b0b12);
      this.body.outfit.emissive.set(st.a).multiplyScalar(0.5);
    } else {
      this.body.outfit.color.setHex(st.o);
      this.body.outfit.emissive.setHex(0);
    }
    if (st.s) {
      if (!this.ship) {
        this.ship = buildShipModel(this.lightMat, this.glowMat);
        this.ship.group.position.y = -0.3 * SHIP_SCALE;
        this.ship.group.scale.setScalar(SHIP_SCALE);
        this.shipGroup.add(this.ship.group);
        this.shipGroup.position.fromArray(st.s);
      }
      this.shipTarget.set(st.s[0], st.s[1], st.s[2]);
      this.shipQ.set(st.s[3], st.s[4], st.s[5], st.s[6]);
      const cloaked = (st.s as number[])[8] === 1;
      if (cloaked !== this.cloaked) {
        this.cloaked = cloaked;
        this.ship.group.traverse((o) => {
          const me = o as THREE.Mesh;
          if (!me.isMesh) return;
          if (cloaked) {
            me.userData.mat = me.material;
            me.material = cloakMaterial();
          } else if (me.userData.mat) me.material = me.userData.mat;
        });
      }
      this.ship.exhaust.forEach((e) => {
        e.visible = (st.s as number[])[7] > 0;
        e.scale.y = 0.4 + (st.s as number[])[7];
      });
    }
  }

  update(dt: number) {
    const st = this.state;
    if (!st) return;
    const inShip = st.m === "ship" && st.s;
    this.body.root.visible = !inShip;
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

  dispose() {
    G.scene.remove(this.body.root, this.shipGroup);
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
    r.apply({ ...st, n: String(st.n || "Joueur").slice(0, 16) });
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
      a: G.armor.worn ? G.armor.style.glow : 0,
      s: shipOut ? [r2(sh.root.position.x), r2(sh.root.position.y), r2(sh.root.position.z), r2(sh.root.quaternion.x), r2(sh.root.quaternion.y), r2(sh.root.quaternion.z), r2(sh.root.quaternion.w), sh.engines ? r2(sh.throttle) : 0, sh.stealth ? 1 : 0] : 0,
      z: G.world.zoneName(G.mode === "ship" ? sh.root.position : pl.position),
      ...(this.lastSay ? { say: this.lastSay } : {})
    };
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
    return [...this.peers.values()].map((r) => ({ id: r.id, name: r.state?.n ?? "?", zone: r.state?.z ?? "", pos: r.target.clone(), mode: r.state?.m }));
  }
}
