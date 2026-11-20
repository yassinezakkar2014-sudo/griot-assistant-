// MODE PASSAGER — monter à deux : on prend place dans le vaisseau ou la voiture d'un autre joueur.
// La caméra suit son véhicule (vue intérieure ou extérieure), F pour descendre.
import * as THREE from "three";
import { G, bus, clamp, damp } from "../core";
import type { Car } from "../game/car";

export interface Ride {
  kind: "ship" | "car";
  owner: string; // id du joueur qui pilote
}

export class Passenger {
  ride: Ride | null = null;
  view: "inside" | "chase" = "inside";
  private look = { yaw: 0, pitch: 0 };
  private camPos = new THREE.Vector3();

  private ownerName() {
    return G.net.peers.get(this.ride?.owner ?? "")?.state?.n ?? "ce joueur";
  }

  board(kind: Ride["kind"], owner: string) {
    if (G.mode !== "foot") return bus.emit("toast", { text: "Descendez d'abord de votre véhicule.", kind: "warn" });
    const peer = G.net.peers.get(owner);
    if (!peer) return bus.emit("toast", { text: "Ce joueur n'est plus connecté.", kind: "warn" });
    if (G.armor.worn) G.armor.remove();
    this.ride = { kind, owner };
    this.look.yaw = this.look.pitch = 0;
    G.mode = "passenger" as any;
    G.audio.whoosh(0.8, 300, 1200, 0.15);
    bus.emit("fade");
    bus.emit("mode");
    bus.emit("toast", { text: `🧑‍🚀 Passager avec ${peer.state?.n ?? "un joueur"} — V : vue · F : descendre` });
  }

  exit(reason?: string) {
    if (!this.ride) return;
    const pos = this.vehiclePos();
    this.ride = null;
    G.mode = "foot";
    if (pos) {
      const side = pos.clone().add(new THREE.Vector3(6, 0, 0));
      side.y = G.physics.ground(side.x, pos.y + 2, side.z, 3).y;
      G.player.teleport(side);
    }
    bus.emit("mode");
    if (reason) bus.emit("toast", { text: reason });
  }

  private car(): Car | undefined {
    return G.cars.cars.find((c) => c.remoteBy === this.ride?.owner);
  }

  private vehiclePos(): THREE.Vector3 | null {
    if (!this.ride) return null;
    if (this.ride.kind === "car") return this.car()?.pos.clone() ?? null;
    const peer = G.net.peers.get(this.ride.owner);
    return peer ? peer.shipGroup.position.clone() : null;
  }

  update(dt: number) {
    const r = this.ride;
    if (!r || (G.mode as string) !== "passenger") return;
    const peer = G.net.peers.get(r.owner);
    if (!peer) return this.exit("Le pilote s'est déconnecté. Vous êtes descendu.");
    const inp = G.input;
    if (inp.hit("KeyF")) return this.exit(`Vous êtes descendu (${this.ownerName()}).`);
    if (inp.hit("KeyV")) this.view = this.view === "inside" ? "chase" : "inside";
    const look = inp.consumeMouse();
    this.look.yaw = clamp(this.look.yaw - look.x, -2.2, 2.2);
    this.look.pitch = clamp(this.look.pitch - look.y, -0.8, 0.7);
    const cam = G.camera;
    if (r.kind === "car") {
      const car = this.car();
      if (!car) return this.exit(`${this.ownerName()} est sorti de la voiture.`);
      G.player.position.copy(car.pos);
      if (this.view === "inside") {
        const seat = car.driverHead.clone().setX(-car.driverHead.x);
        cam.position.copy(car.root.localToWorld(seat));
        const a = car.yaw + this.look.yaw;
        cam.lookAt(cam.position.clone().add(new THREE.Vector3(-Math.sin(a), Math.sin(this.look.pitch), -Math.cos(a))));
      } else this.chase(car.pos, car.yaw, 7.5, 2.8, dt);
      return;
    }
    // vaisseau d'un autre joueur
    if (!peer.state?.s || peer.state.m !== "ship") return this.exit(`${this.ownerName()} a quitté son vaisseau.`);
    const g = peer.shipGroup;
    const sc = peer.shipScale;
    G.player.position.copy(g.position);
    if (this.view === "inside") {
      cam.position.copy(g.position).add(new THREE.Vector3(0.55 * sc, 1.95 * sc, -1.2 * sc).applyQuaternion(g.quaternion));
      cam.quaternion.copy(g.quaternion);
      cam.rotateY(this.look.yaw);
      cam.rotateX(this.look.pitch - 0.08);
    } else {
      const yaw = new THREE.Euler().setFromQuaternion(g.quaternion, "YXZ").y;
      this.chase(g.position, yaw, 19 * sc, 4.5 * sc, dt);
    }
  }

  private chase(p: THREE.Vector3, yaw: number, dist: number, h: number, dt: number) {
    const a = yaw + this.look.yaw;
    const want = p.clone().add(new THREE.Vector3(Math.sin(a) * dist, h, Math.cos(a) * dist));
    if (this.camPos.distanceTo(want) > dist * 4) this.camPos.copy(want);
    this.camPos.lerp(want, 1 - Math.exp(-dt * 6));
    const gy = G.physics.terrain(this.camPos.x, this.camPos.z) + 0.8;
    this.camPos.y = Math.max(this.camPos.y, gy);
    G.camera.position.copy(this.camPos);
    G.camera.lookAt(p.clone().add(new THREE.Vector3(0, h * 0.3, 0)));
    this.look.yaw = damp(this.look.yaw, 0, 0.5, dt);
  }
}
