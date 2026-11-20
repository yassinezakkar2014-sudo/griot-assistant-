// Matériaux et textures procédurales (aucun asset externe : chargement instantané).
import * as THREE from "three";
import { applyPBR, marblePBR, tilePBR, panelPBR, brushedPBR } from "./pbr";

function canvasTex(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void, repeat = 1) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const c = cv.getContext("2d")!;
  draw(c, size);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function marble(c: CanvasRenderingContext2D, s: number) {
  c.fillStyle = "#f2f2f4";
  c.fillRect(0, 0, s, s);
  for (let v = 0; v < 26; v++) {
    c.strokeStyle = `rgba(${150 + Math.random() * 40},${155 + Math.random() * 40},${170 + Math.random() * 40},${0.12 + Math.random() * 0.25})`;
    c.lineWidth = 0.6 + Math.random() * 2.2;
    c.beginPath();
    let x = Math.random() * s,
      y = Math.random() * s;
    c.moveTo(x, y);
    for (let i = 0; i < 18; i++) {
      x += (Math.random() - 0.4) * 50;
      y += (Math.random() - 0.5) * 50;
      c.lineTo(x, y);
    }
    c.stroke();
  }
}

export const tex = {
  marble: canvasTex(512, marble, 1),
  floor: canvasTex(512, (c, s) => {
    marble(c, s);
    c.strokeStyle = "rgba(200,170,90,0.9)";
    c.lineWidth = 4;
    c.strokeRect(2, 2, s - 4, s - 4);
    c.strokeStyle = "rgba(40,140,255,0.5)";
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(s / 2, 0);
    c.lineTo(s / 2, s);
    c.moveTo(0, s / 2);
    c.lineTo(s, s / 2);
    c.stroke();
  }),
  darkFloor: canvasTex(256, (c, s) => {
    c.fillStyle = "#0c0f16";
    c.fillRect(0, 0, s, s);
    c.strokeStyle = "rgba(60,170,255,0.55)";
    c.lineWidth = 2;
    c.strokeRect(1, 1, s - 2, s - 2);
    c.fillStyle = "rgba(255,255,255,0.03)";
    for (let i = 0; i < 400; i++) c.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }),
  hexGlow: canvasTex(256, (c, s) => {
    c.fillStyle = "#000";
    c.fillRect(0, 0, s, s);
    c.strokeStyle = "#fff";
    c.lineWidth = 2;
    const r = 18;
    for (let y = -1; y < 9; y++)
      for (let x = -1; x < 9; x++) {
        const cx = x * r * 1.75 + (y % 2) * r * 0.87;
        const cy = y * r * 1.5;
        c.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 3) * k + Math.PI / 6;
          c.lineTo(cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95);
        }
        c.closePath();
        c.stroke();
      }
  }),
  window: canvasTex(128, (c, s) => {
    c.fillStyle = "#101522";
    c.fillRect(0, 0, s, s);
    for (let y = 4; y < s; y += 12)
      for (let x = 4; x < s; x += 10) {
        const on = Math.random() < 0.55;
        c.fillStyle = on ? (Math.random() < 0.7 ? "#9fe3ff" : "#ffe7a8") : "#1b2233";
        c.fillRect(x, y, 6, 7);
      }
  })
};

// Motifs lumineux de l'armure : lignes, hexagones, chevrons.
export function armorPattern(kind: "lines" | "hex" | "chevron") {
  return canvasTex(512, (c, s) => {
    c.fillStyle = "#000";
    c.fillRect(0, 0, s, s);
    c.strokeStyle = "#fff";
    c.shadowColor = "#fff";
    c.shadowBlur = 6;
    if (kind === "lines") {
      c.lineWidth = 3;
      for (let i = 0; i < 9; i++) {
        c.beginPath();
        const x = (i / 9) * s;
        c.moveTo(x, 0);
        c.lineTo(x + 40, s * 0.3);
        c.lineTo(x, s * 0.6);
        c.lineTo(x + 40, s);
        c.stroke();
      }
    } else if (kind === "hex") {
      c.lineWidth = 2.5;
      const r = 30;
      for (let y = -1; y < 13; y++)
        for (let x = -1; x < 12; x++) {
          const cx = x * r * 1.75 + (y % 2) * r * 0.87;
          const cy = y * r * 1.5;
          c.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = (Math.PI / 3) * k + Math.PI / 6;
            c.lineTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9);
          }
          c.closePath();
          c.stroke();
        }
    } else {
      c.lineWidth = 4;
      for (let y = 0; y < s; y += 48) {
        c.beginPath();
        for (let x = 0; x <= s; x += 32) c.lineTo(x, y + ((x / 32) % 2 ? 22 : 0));
        c.stroke();
      }
    }
  }, 2);
}

export const mat = {
  marble: new THREE.MeshStandardMaterial({ map: tex.marble, color: 0xd9dbe2, roughness: 0.3, metalness: 0.05 }),
  floor: new THREE.MeshStandardMaterial({ map: tex.floor, color: 0xcfd2da, roughness: 0.16, metalness: 0.1 }),
  darkFloor: new THREE.MeshStandardMaterial({ map: tex.darkFloor, roughness: 0.35, metalness: 0.6 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xd8b25a, roughness: 0.22, metalness: 1 }),
  silver: new THREE.MeshStandardMaterial({ color: 0xc8ccd6, roughness: 0.18, metalness: 1 }),
  black: new THREE.MeshStandardMaterial({ color: 0x0b0c12, roughness: 0.32, metalness: 0.85 }),
  graphite: new THREE.MeshStandardMaterial({ color: 0x1c2030, roughness: 0.5, metalness: 0.6 }),
  white: new THREE.MeshStandardMaterial({ color: 0xd8dce4, roughness: 0.45, metalness: 0.1 }),
  fabric: new THREE.MeshStandardMaterial({ color: 0x1b2a4a, roughness: 0.9 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x9fd8ff, roughness: 0.05, metalness: 0, transmission: 0, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }),
  glowBlue: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x1e90ff, emissiveIntensity: 3 }),
  glowCyan: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x00e5ff, emissiveIntensity: 2.5 }),
  glowWhite: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: 2 }),
  glowGold: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffc861, emissiveIntensity: 2 }),
  holo: new THREE.MeshBasicMaterial({ color: 0x48c8ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  holoWire: new THREE.MeshBasicMaterial({ color: 0x6fe0ff, wireframe: true, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }),
  water: new THREE.MeshStandardMaterial({ color: 0x2a7fd0, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.8 }),
  hedge: new THREE.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 0.95 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x3b2a20, roughness: 0.6 })
};

// relief et rugosité procéduraux : marbre, dalles, panneaux et métaux brossés
applyPBR(mat.marble, marblePBR(), 0.35);
applyPBR(mat.floor, tilePBR(), 0.9);
applyPBR(mat.darkFloor, panelPBR(), 0.7);
applyPBR(mat.silver, brushedPBR(), 0.3);
applyPBR(mat.gold, brushedPBR(), 0.25);
applyPBR(mat.graphite, panelPBR(), 0.5);
mat.white.normalMap = marblePBR().normal;
mat.white.normalScale.set(0.15, 0.15);

/** Écran holographique animé (canvas mis à jour à la demande). */
export class HoloScreen {
  canvas = document.createElement("canvas");
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  material: THREE.MeshBasicMaterial;
  constructor(w = 512, h = 288, public draw: (c: CanvasRenderingContext2D, w: number, h: number, t: number) => void) {
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext("2d")!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, opacity: 0.92, side: THREE.DoubleSide, toneMapped: false });
    this.refresh(0);
  }
  refresh(t: number) {
    this.draw(this.ctx, this.canvas.width, this.canvas.height, t);
    this.texture.needsUpdate = true;
  }
}

/** Fond standard d'un écran holo : cadre + grille. */
export function holoFrame(c: CanvasRenderingContext2D, w: number, h: number, title: string) {
  c.clearRect(0, 0, w, h);
  c.fillStyle = "rgba(4,18,40,0.78)";
  c.fillRect(0, 0, w, h);
  c.strokeStyle = "rgba(80,200,255,0.18)";
  c.lineWidth = 1;
  for (let x = 0; x < w; x += 24) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x, h);
    c.stroke();
  }
  for (let y = 0; y < h; y += 24) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(w, y);
    c.stroke();
  }
  c.strokeStyle = "#4fd2ff";
  c.lineWidth = 3;
  c.strokeRect(4, 4, w - 8, h - 8);
  c.fillStyle = "#bff0ff";
  c.font = "bold 22px Orbitron, Arial";
  c.fillText(title, 18, 36);
  c.fillStyle = "#4fd2ff";
  c.fillRect(18, 44, 140, 2);
}
