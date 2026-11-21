// Sons synthétisés en WebAudio (aucun fichier à charger) : moteurs, portes, interface, armure.
export class AudioFX {
  ctx: AudioContext | null = null;
  master!: GainNode;
  engine: { osc: OscillatorNode; osc2: OscillatorNode; noise: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  ambient: { gain: GainNode; nodes: AudioScheduledSourceNode[] } | null = null;
  volume = 0.6;

  private silent: HTMLAudioElement | null = null;
  /** appel vidéo en cours (session audio lecture + micro) */
  inCall = false;

  /** Passe la session audio en mode appel (micro + haut-parleur) ou la rétablit. */
  setCallMode(on: boolean) {
    this.inCall = on;
    try {
      const nav = navigator as any;
      if (nav.audioSession) nav.audioSession.type = on ? "play-and-record" : "playback";
    } catch {}
    if (on && this.silent) this.silent.pause();
    else if (!on) this.unlock();
  }

  /** À appeler dans un geste (toucher, clic, touche). Sur iPad/iPhone : force la session audio
   *  « lecture » pour que le son passe même quand l'interrupteur silencieux est activé. */
  unlock() {
    try {
      const nav = navigator as any;
      // pendant un appel vidéo il faut « lecture + enregistrement », sinon iOS coupe le micro
      const want = this.inCall ? "play-and-record" : "playback";
      if (nav.audioSession && nav.audioSession.type !== want) nav.audioSession.type = want;
    } catch {}
    if (!this.silent) {
      this.silent = new Audio(silentWav());
      this.silent.loop = true;
      this.silent.setAttribute("playsinline", "");
      this.silent.volume = 0.01;
    }
    if (this.silent.paused && !this.inCall) this.silent.play().catch(() => {});
    if (this.ctx) {
      if (this.ctx.state !== "running") this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.ctx) this.master.gain.value = v;
  }

  private noiseBuffer() {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  tone(freq: number, dur = 0.12, type: OscillatorType = "sine", vol = 0.15, slideTo?: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  whoosh(dur = 0.8, from = 300, to = 1800, vol = 0.18) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  ui() {
    this.tone(1320, 0.07, "sine", 0.08, 1760);
  }
  confirm() {
    this.tone(880, 0.09, "triangle", 0.1);
    setTimeout(() => this.tone(1320, 0.14, "triangle", 0.1), 80);
  }
  door() {
    this.whoosh(0.9, 200, 900, 0.14);
  }
  reward() {
    [660, 880, 1100, 1320].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, "triangle", 0.12), i * 90));
  }
  armorOn() {
    this.whoosh(1.6, 150, 4000, 0.22);
    [220, 330, 440, 660, 880].forEach((f, i) => setTimeout(() => this.tone(f, 0.4, "sawtooth", 0.04), i * 220));
  }
  pulse() {
    this.tone(90, 0.8, "sine", 0.35, 30);
    this.whoosh(0.6, 2000, 200, 0.2);
  }

  /** Démarre / règle le son des moteurs (throttle 0..1, null = coupé). */
  setEngine(throttle: number | null) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (throttle === null) {
      if (this.engine) {
        const e = this.engine;
        e.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
        setTimeout(() => {
          e.osc.stop();
          e.osc2.stop();
          e.noise.stop();
        }, 2000);
        this.engine = null;
      }
      return;
    }
    if (!this.engine) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer();
      noise.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const oscGain = ctx.createGain();
      oscGain.gain.value = 0.18;
      osc.connect(oscGain).connect(filter);
      osc2.connect(filter);
      noise.connect(filter);
      filter.connect(gain).connect(this.master);
      osc.start();
      osc2.start();
      noise.start();
      this.engine = { osc, osc2, noise, filter, gain };
    }
    const e = this.engine;
    const t = ctx.currentTime;
    e.osc.frequency.setTargetAtTime(55 + throttle * 90, t, 0.2);
    e.osc2.frequency.setTargetAtTime(110 + throttle * 260, t, 0.2);
    e.filter.frequency.setTargetAtTime(300 + throttle * 2200, t, 0.2);
    e.gain.gain.setTargetAtTime(0.06 + throttle * 0.12, t, 0.3);
  }

  /** Nappe d'ambiance (salon / cinéma). */
  toggleAmbient(): boolean {
    if (!this.ctx) return false;
    if (this.ambient) {
      const a = this.ambient;
      a.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
      setTimeout(() => a.nodes.forEach((n) => n.stop()), 2500);
      this.ambient = null;
      return false;
    }
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master);
    const nodes: AudioScheduledSourceNode[] = [];
    [110, 164.8, 220, 277.2, 329.6].forEach((f, i) => {
      const o = this.ctx!.createOscillator();
      o.type = i % 2 ? "triangle" : "sine";
      o.frequency.value = f;
      const lfo = this.ctx!.createOscillator();
      lfo.frequency.value = 0.05 + i * 0.03;
      const lg = this.ctx!.createGain();
      lg.gain.value = 0.03;
      const og = this.ctx!.createGain();
      og.gain.value = 0.04;
      lfo.connect(lg).connect(og.gain);
      o.connect(og).connect(gain);
      o.start();
      lfo.start();
      nodes.push(o, lfo);
    });
    gain.gain.setTargetAtTime(0.5, this.ctx.currentTime, 1);
    this.ambient = { gain, nodes };
    return true;
  }
}

/** Petit fichier WAV silencieux (0,5 s) encodé en data URI. */
function silentWav() {
  const rate = 8000,
    n = rate / 2;
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const w = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + n, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  w(36, "data");
  v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  let bin = "";
  new Uint8Array(buf).forEach((b) => (bin += String.fromCharCode(b)));
  return "data:audio/wav;base64," + btoa(bin);
}
