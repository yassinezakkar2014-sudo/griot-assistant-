// Rendu : ciel dynamique, soleil, cycle jour/nuit, étoiles, brouillard, bloom, éclairage.
import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { G, bus, clamp, lerp } from "../core";

export class Environment {
  sky = new Sky();
  sun = new THREE.DirectionalLight(0xffffff, 3);
  hemi = new THREE.HemisphereLight(0xbfd9ff, 0x223344, 0.6);
  stars: THREE.Points;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  bloomEnabled = true;
  /** occlusion ambiante (qualité Ultra) : ombres de contact dans les coins et sous les objets */
  ao: GTAOPass;
  hour = 17.2; // heure du jour (0..24)
  timeScale = 1 / 40; // heures de jeu par seconde réelle (1 h = 40 s)
  autoTime = true;
  /** dans l'espace : pas de ciel ni de brouillard, fond noir */
  space = false;
  nightFactor = 0; // 0 jour, 1 nuit
  /** Pool fixe de lumières ponctuelles : déplacées vers l'étage courant (pas de recompilation de shaders). */
  pointPool: THREE.PointLight[] = [];
  private sunDir = new THREE.Vector3();
  private fog: THREE.FogExp2;

  constructor(public scene: THREE.Scene, public renderer: THREE.WebGLRenderer, public camera: THREE.PerspectiveCamera) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.85;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.localClippingEnabled = true;

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;

    this.sky.scale.setScalar(20000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 6;
    u.rayleigh.value = 1.6;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.8;
    scene.add(this.sky);

    this.fog = new THREE.FogExp2(0x9fb8d8, 0.00028);
    scene.fog = this.fog;

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = this.sun.shadow.camera;
    s.left = s.bottom = -70;
    s.right = s.top = 70;
    s.near = 1;
    s.far = 600;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target, this.hemi);

    // étoiles
    const starGeo = new THREE.BufferGeometry();
    const n = 3000;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection();
      v.y = Math.abs(v.y) * 0.9 + 0.05;
      v.normalize().multiplyScalar(9000);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false })
    );
    scene.add(this.stars);

    for (let i = 0; i < 6; i++) {
      const p = new THREE.PointLight(0x66ccff, 0, 30, 1.6);
      scene.add(p);
      this.pointPool.push(p);
    }

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.ao = new GTAOPass(scene, camera, innerWidth, innerHeight);
    this.ao.enabled = false;
    this.ao.blendIntensity = 0.85;
    this.composer.addPass(this.ao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.35, 1.05);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  /** Place les lumières du pool (liste de positions/couleurs, max 6). */
  setPointLights(list: { pos: THREE.Vector3; color: number; intensity: number; distance?: number }[]) {
    this.pointPool.forEach((p, i) => {
      const l = list[i];
      if (!l) {
        p.intensity = 0;
        return;
      }
      p.position.copy(l.pos);
      p.color.setHex(l.color);
      p.intensity = l.intensity * 0.32;
      p.distance = l.distance ?? 30;
    });
  }

  setHour(h: number) {
    this.hour = ((h % 24) + 24) % 24;
    bus.emit("time", this.hour);
  }

  resize(w: number, h: number) {
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    this.ao.setSize(w, h);
  }

  update(dt: number) {
    if (this.autoTime) this.hour = (this.hour + dt * this.timeScale) % 24;
    // élévation du soleil : midi = haut, minuit = bas
    const t = ((this.hour - 6) / 24) * Math.PI * 2;
    const elev = Math.sin(t); // -1..1
    const azim = Math.cos(t);
    this.sunDir.set(azim * 0.8, elev, -0.45).normalize();
    this.sky.material.uniforms.sunPosition.value.copy(this.sunDir);

    const day = clamp((elev + 0.08) / 0.35, 0, 1);
    this.nightFactor = 1 - day;
    const warm = clamp(1 - Math.abs(elev) / 0.35, 0, 1) * day;

    // la lumière directionnelle suit le joueur pour garder une ombre nette
    const focus = G.mode === "ship" ? G.ship.root.position : G.player.position;
    const lightDir = elev > -0.05 ? this.sunDir : new THREE.Vector3(-0.3, 0.8, 0.4).normalize(); // lune
    this.sun.position.copy(focus).addScaledVector(lightDir, 250);
    this.sun.target.position.copy(focus);
    this.sun.intensity = elev > -0.05 ? lerp(0.2, 2.3, day) : 0.35;
    this.sun.color.setRGB(1, lerp(1, 0.62, warm), lerp(1, 0.4, warm));
    if (elev <= -0.05) this.sun.color.setHex(0x8fa8ff);

    this.hemi.intensity = lerp(0.15, 0.5, day);
    this.hemi.color.setHex(day > 0.5 ? 0xcfe3ff : 0x3a4a7a);
    this.renderer.toneMappingExposure = lerp(0.62, 0.78, day);
    this.scene.environmentIntensity = lerp(0.2, 0.4, day);

    (this.stars.material as THREE.PointsMaterial).opacity = clamp((this.nightFactor - 0.3) * 1.4, 0, 1);
    this.stars.position.copy(this.camera.position);
    this.sky.position.copy(this.camera.position);
    this.sky.visible = day > 0.02;

    const fogDay = new THREE.Color(0xa9c3e0).lerp(new THREE.Color(0xf0a27a), warm * 0.6);
    const fogNight = new THREE.Color(0x05070f);
    this.fog.color.copy(fogNight).lerp(fogDay, day);
    if (!this.sky.visible) this.scene.background = this.fog.color;
    else this.scene.background = null;

    this.bloom.strength = lerp(0.5, 0.14, day);
    // en plein jour le ciel très lumineux ne doit pas « baver » sur toute l'image (voile blanc)
    this.bloom.threshold = lerp(1.1, 1.5, day);
    this.bloom.radius = lerp(0.35, 0.2, day);
    // en altitude, le brouillard s'éclaircit : on voit le sol au lieu d'un voile bleu
    const alt = Math.max(0, this.camera.position.y - Math.max(0, G.physics?.terrain(this.camera.position.x, this.camera.position.z) ?? 0) - 120);
    this.fog.density = 0.00028 / (1 + alt / 300);
    // précision de profondeur : plan proche adapté à l'altitude (sinon l'eau traverse la terre au loin)
    if (!this.space) {
      const flying = (G.mode as string) === "ship" || (G.mode as string) === "boat";
      const near = flying ? Math.min(4, Math.max(0.1, alt / 60)) : 0.1;
      if (Math.abs(this.camera.near - near) > near * 0.15) {
        this.camera.near = near;
        this.camera.updateProjectionMatrix();
      }
    }
    if (this.space) {
      this.scene.fog = null;
      this.sky.visible = false;
      (this.stars.material as THREE.PointsMaterial).opacity = 0;
      this.scene.background = new THREE.Color(0x000004);
      this.sun.intensity = 2.6;
      this.sun.color.setHex(0xffffff);
      this.sun.position.copy(focus).addScaledVector(new THREE.Vector3(0.6, 0.5, -0.4).normalize(), 250);
      this.hemi.intensity = 0.12;
      this.renderer.toneMappingExposure = 0.8;
      this.bloom.strength = 0.5;
    } else if (this.scene.fog !== this.fog) this.scene.fog = this.fog;
  }

  render() {
    if (this.bloomEnabled || this.ao.enabled) {
      this.bloom.enabled = this.bloomEnabled;
      this.composer.render();
    }
    else this.renderer.render(this.scene, this.camera);
  }
}
