// PILOTE AUTOMATIQUE des voitures : la voiture suit seule le réseau routier (autoroute, pont de Zuria,
// route de l'aéroport, route impériale du col royal) jusqu'à la destination choisie.
// Itinéraire : plus court chemin (Dijkstra) sur le graphe des routes ; conduite « sur rails » (aucune
// collision possible), vitesse adaptée aux virages, arrivée en douceur.
import { G, bus, damp, normalize } from "../core";
import { routePaths } from "../world/expansion";
import { IMPERIAL } from "../world/imperial";
import { PASS } from "../world/countryData";

export interface Dest {
  id: string;
  name: string;
  x: number;
  z: number;
}

/** Garage impérial (coordonnées monde) : à droite du Grand Palais, ouvert vers l'avenue. */
export const GARAGE = { x: IMPERIAL.x + 600, z: IMPERIAL.z - 300, y: IMPERIAL.y };

export const DESTS: Dest[] = [
  { id: "imperial", name: "♛ Palais Impérial (garage)", x: GARAGE.x - 70, z: GARAGE.z },
  { id: "palais", name: "🏰 Ancien palais royal", x: 0, z: -340 },
  { id: "ville", name: "🌆 Ville futuriste", x: 2920, z: 0 },
  { id: "aeroport", name: "✈ Aéroport Royal", x: 1850, z: -2108 },
  { id: "zuria", name: "🌴 Zuria", x: -2872, z: 185 },
  { id: "col", name: "⛰ Col royal (viaduc)", x: 0, z: 2400 }
];

interface Node {
  x: number;
  z: number;
  adj: number[];
}

export class Autopilot {
  private nodes: Node[] = [];
  path: [number, number][] = [];
  private i = 0;
  dest: Dest | null = null;
  private v = 0;
  private bar!: HTMLElement;
  private open = false;

  build() {
    this.bar = document.createElement("div");
    this.bar.className = "autopilot-bar";
    this.bar.hidden = true;
    document.body.appendChild(this.bar);
    this.bar.onclick = (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-ap]");
      if (!el) return;
      const a = el.dataset.ap!;
      if (a === "menu") this.open = !this.open;
      else if (a === "stop") this.stop("Pilote automatique désactivé.");
      else this.go(a);
      this.render();
    };
    bus.on("mode", () => this.render());
  }

  private graph() {
    if (this.nodes.length) return this.nodes;
    // liaisons autour de l'ancien palais (portails sud, ouest et nord) et accès au garage impérial
    const extra: [number, number][][] = [
      [[0, -275], [0, -330], [-330, -330], [-330, 0], [-275, 0]],
      [[-330, 0], [-330, 330], [0, 330], [0, 312]],
      [[0, PASS.z2 - 4], [0, GARAGE.z], [GARAGE.x - 70, GARAGE.z]]
    ];
    const lines = [...routePaths, ...extra.map((l) => densify(l, 12))];
    const N: Node[] = [];
    for (const l of lines) {
      l.forEach(([x, z], k) => {
        N.push({ x, z, adj: [] });
        if (k) {
          N[N.length - 1].adj.push(N.length - 2);
          N[N.length - 2].adj.push(N.length - 1);
        }
      });
    }
    // jonctions entre routes (nœuds proches)
    const cell = 30;
    const grid = new Map<string, number[]>();
    N.forEach((n, i) => {
      const k = `${Math.floor(n.x / cell)},${Math.floor(n.z / cell)}`;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k)!.push(i);
    });
    N.forEach((n, i) => {
      const cx = Math.floor(n.x / cell),
        cz = Math.floor(n.z / cell);
      for (let a = -1; a <= 1; a++)
        for (let b = -1; b <= 1; b++)
          for (const j of grid.get(`${cx + a},${cz + b}`) ?? []) {
            if (j === i || n.adj.includes(j)) continue;
            if (Math.hypot(N[j].x - n.x, N[j].z - n.z) < 26) {
              n.adj.push(j);
              N[j].adj.push(i);
            }
          }
    });
    this.nodes = N;
    return N;
  }

  private nearest(x: number, z: number) {
    let best = 0,
      bd = Infinity;
    this.graph().forEach((n, i) => {
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  /** Itinéraire routier de (x,z) à la destination. */
  route(x: number, z: number, d: Dest): [number, number][] {
    const N = this.graph();
    const a = this.nearest(x, z),
      b = this.nearest(d.x, d.z);
    const dist = new Float64Array(N.length).fill(Infinity);
    const prev = new Int32Array(N.length).fill(-1);
    const done = new Uint8Array(N.length);
    dist[a] = 0;
    for (;;) {
      let u = -1,
        ud = Infinity;
      for (let i = 0; i < N.length; i++) if (!done[i] && dist[i] < ud) (ud = dist[i]), (u = i);
      if (u < 0 || u === b) break;
      done[u] = 1;
      for (const w of N[u].adj) {
        const nd = ud + Math.hypot(N[w].x - N[u].x, N[w].z - N[u].z);
        if (nd < dist[w]) (dist[w] = nd), (prev[w] = u);
      }
    }
    const out: [number, number][] = [];
    for (let u = b; u >= 0; u = prev[u]) out.unshift([N[u].x, N[u].z]);
    if (out.length && (out[0][0] !== N[a].x || out[0][1] !== N[a].z)) return densify([[x, z], [d.x, d.z]], 20); // pas relié : ligne droite
    out.unshift([x, z]);
    out.push([d.x, d.z]);
    return out;
  }

  /** Lance le pilote automatique vers une destination (id ou texte libre). */
  go(text: string): string {
    const car = G.cars.active;
    if (!car || (G.mode as string) !== "car") return "Montez d'abord dans une voiture (le garage impérial peut vous en sortir une).";
    const n = normalize(text);
    const d =
      DESTS.find((x) => x.id === text) ??
      (/imperial|empire|garage|montagne/.test(n) ? DESTS[0] : /zuria/.test(n) ? DESTS[4] : /aeroport|avion/.test(n) ? DESTS[3] : /ville|city|metropole/.test(n) ? DESTS[2] : /col|viaduc|pont/.test(n) ? DESTS[5] : /palais|chateau|maison/.test(n) ? DESTS[1] : null);
    if (!d) return `Destinations du pilote automatique : ${DESTS.map((x) => x.name).join(", ")}.`;
    this.path = this.route(car.pos.x, car.pos.z, d);
    this.i = 0;
    this.v = Math.max(0, car.speed);
    this.dest = d;
    this.open = false;
    this.render();
    G.audio.tone(740, 0.12, "sine", 0.08);
    setTimeout(() => G.audio.tone(988, 0.16, "sine", 0.08), 140);
    const km = this.length() / 1000;
    bus.emit("toast", { text: `🤖 Pilote automatique : ${d.name} (${km.toFixed(1)} km). W/S ou F pour reprendre la main.` });
    return `Pilote automatique enclenché vers ${d.name} — ${km.toFixed(1)} km.`;
  }

  toggleMenu() {
    this.open = !this.open;
    this.render();
  }

  stop(msg?: string) {
    if (!this.dest) return;
    this.dest = null;
    this.path = [];
    if (msg) bus.emit("toast", { text: "🤖 " + msg });
    this.render();
  }

  private length() {
    let l = 0;
    for (let k = 1; k < this.path.length; k++) l += Math.hypot(this.path[k][0] - this.path[k - 1][0], this.path[k][1] - this.path[k - 1][1]);
    return l;
  }

  render() {
    if (!this.bar) return;
    const inCar = (G.mode as string) === "car" && !!G.cars.active;
    this.bar.hidden = !inCar;
    if (!inCar) {
      if (this.dest) this.stop();
      this.open = false;
      return;
    }
    this.bar.innerHTML =
      (this.dest
        ? `<div class="ap-status">🤖 En route : ${this.dest.name}</div><button class="on" data-ap="stop">⏹ Reprendre le volant</button>`
        : `<button data-ap="menu">🤖 Pilote automatique</button>`) +
      (this.open ? `<div class="ap-list">${DESTS.map((d) => `<button data-ap="${d.id}">${d.name}</button>`).join("")}</div>` : "");
  }

  /** Appelé chaque image pendant la conduite ; renvoie true si le pilote conduit. */
  drive(dt: number): boolean {
    const car = G.cars.active;
    if (!car || !this.dest) return false;
    const inp = G.input;
    if (inp.hit("KeyY")) {
      this.stop("Pilote automatique désactivé.");
      return false;
    }
    if (inp.down("KeyW", "KeyS", "ArrowUp", "ArrowDown") || Math.abs(inp.touchMove.y) > 0.5) {
      this.stop("Vous reprenez le volant.");
      return false;
    }
    const p = car.pos;
    // point visé : à ~14 m devant sur l'itinéraire (poursuite pure)
    while (this.i < this.path.length - 1 && Math.hypot(this.path[this.i][0] - p.x, this.path[this.i][1] - p.z) < 14) this.i++;
    const [tx, tz] = this.path[this.i];
    const last = this.i >= this.path.length - 1;
    const remain = Math.hypot(tx - p.x, tz - p.z) + (last ? 0 : this.remainFrom(this.i));
    // virage à venir : on ralentit
    const j = Math.min(this.path.length - 1, this.i + 4);
    const a1 = Math.atan2(tx - p.x, tz - p.z),
      a2 = Math.atan2(this.path[j][0] - tx, this.path[j][1] - tz);
    const turn = Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)));
    const vMax = Math.min(36, 10 + 30 * Math.max(0, 1 - turn / 1.2), Math.max(2, Math.sqrt(2 * 4 * remain)));
    this.v = damp(this.v, vMax, this.v < vMax ? 0.9 : 3, dt);
    const want = Math.atan2(-(tx - p.x), -(tz - p.z));
    let dy = want - car.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const rate = 2.2;
    car.yaw += Math.max(-rate * dt, Math.min(rate * dt, dy));
    car.steer = damp(car.steer, Math.max(-0.5, Math.min(0.5, dy * 1.5)), 6, dt);
    const step = this.v * dt;
    p.x += -Math.sin(car.yaw) * step;
    p.z += -Math.cos(car.yaw) * step;
    const g = G.physics.ground(p.x, p.y + 2, p.z, 2.5, 1).y;
    p.y = damp(p.y, g, 12, dt);
    if (p.y < g - 0.5) p.y = g;
    car.speed = this.v;
    car.body.rotation.z = damp(car.body.rotation.z, -car.steer * this.v * 0.012, 4, dt);
    G.audio.setEngine(0.05 + Math.min(1, this.v / 60) * 0.8);
    if (remain < 3) {
      car.speed = 0;
      this.v = 0;
      const d = this.dest;
      this.stop();
      bus.emit("toast", { text: `🤖 Arrivée : ${d.name}. Vous pouvez descendre (F).` });
      G.audio.tone(988, 0.2, "sine", 0.08);
    }
    return true;
  }

  private remainFrom(i: number) {
    let l = 0;
    for (let k = i + 1; k < this.path.length; k++) l += Math.hypot(this.path[k][0] - this.path[k - 1][0], this.path[k][1] - this.path[k - 1][1]);
    return l;
  }
}

function densify(l: [number, number][], step: number): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 1; k < l.length; k++) {
    const [ax, az] = l[k - 1],
      [bx, bz] = l[k];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let s = 0; s < n; s++) out.push([ax + ((bx - ax) * s) / n, az + ((bz - az) * s) / n]);
  }
  out.push(l[l.length - 1]);
  return out;
}

