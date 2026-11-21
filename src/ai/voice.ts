// Système vocal : reconnaissance en temps réel (Web Speech ou Whisper serveur), synthèse neuronale
// (OpenAI TTS) ou navigateur, lecture phrase par phrase pendant le streaming, interruption, niveau labial.
import { bus } from "../core";

export const LANGS: { code: string; label: string }[] = [
  { code: "fr-FR", label: "Français" },
  { code: "en-US", label: "English" },
  { code: "es-ES", label: "Español" },
  { code: "pt-BR", label: "Português" },
  { code: "de-DE", label: "Deutsch" },
  { code: "it-IT", label: "Italiano" },
  { code: "ar-SA", label: "العربية" },
  { code: "sw-KE", label: "Kiswahili" },
  { code: "zh-CN", label: "中文" },
  { code: "ja-JP", label: "日本語" }
];

export interface VoiceSettings {
  lang: string;
  speak: boolean;
  neural: boolean;
  neuralVoice: string;
  rate: number;
  continuous: boolean;
  wakeWord: boolean;
  /** voix du navigateur choisie (nom), sinon la plus réaliste disponible */
  browserVoice?: string;
}

type SR = any;

export class Voice {
  settings: VoiceSettings = { lang: "fr-FR", speak: true, neural: true, neuralVoice: "onyx", rate: 1, continuous: false, wakeWord: false };
  serverTTS = false;
  serverSTT = false;
  listening = false;
  speaking = false;
  private rec: SR | null = null;
  private queue: string[] = [];
  private buffer = "";
  private playing = false;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private generation = 0;
  private recorder: MediaRecorder | null = null;
  private spokenText = "";
  private synthLevelTimer: any = null;
  onFinal: (text: string) => void = () => {};
  /** Dictée fournie par Claude quand la page est ouverte dans claude.ai (Chrome, Edge, app de bureau). */
  dict: any = null;

  constructor() {
    try {
      const s = JSON.parse(localStorage.getItem("griot-voice") || "null");
      if (s) Object.assign(this.settings, s);
    } catch {}
    if ("speechSynthesis" in window) {
      speechSynthesis.getVoices();
      speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
    }
    requestAnimationFrame(() => this.levelLoop());
    const cl = (window as any).claude;
    cl?.use?.("dictation").then((d: any) => {
      if (!d) return;
      this.dict = d;
      d.onPartial(({ text }: { text: string }) => {
        if (this.speaking && !this.isEcho(text) && text.split(" ").length >= 2) this.interrupt();
        bus.emit("voice:interim", text);
      });
      d.onFinal(({ text }: { text: string }) => {
        bus.emit("voice:interim", "");
        if (!this.isEcho(text)) this.handleFinal(text.trim());
      });
      d.onState(({ state, reason }: { state: string; reason?: string }) => {
        this.listening = state === "listening" || state === "starting";
        bus.emit("voice:state", this.listening ? "listening" : this.speaking ? "speaking" : "idle");
        if (reason === "not_granted") bus.emit("toast", { text: "Micro refusé pour cette page.", kind: "warn" });
      });
    });
  }

  saveSettings() {
    try {
      localStorage.setItem("griot-voice", JSON.stringify(this.settings));
    } catch {}
  }

  get sttSupported() {
    return Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) || (this.serverSTT && "MediaRecorder" in window);
  }

  // ---------------------------------------------------------------- écoute
  toggleListen() {
    if (this.listening) this.stopListening();
    else this.startListening();
  }

  startListening() {
    this.interrupt();
    if (this.dict) {
      // appelé directement depuis le geste de l'utilisateur (aucun await avant)
      this.dict.start({ language: this.settings.lang }).catch((e: any) => {
        if (e?.code === "not_granted") bus.emit("toast", { text: "Micro refusé : tapez votre message ou utilisez la dictée du clavier.", kind: "warn" });
        else if (e?.code !== "stopped") bus.emit("toast", { text: "Micro indisponible pour le moment.", kind: "warn" });
      });
      return;
    }
    if ((window as any).claude) {
      bus.emit("toast", {
        text: "🎙 Ici (Claude sur iPad / Safari), le micro n'est pas donné aux pages. Touchez la zone de texte puis le 🎙 du clavier pour dicter — ou ouvrez GRIOT dans Chrome sur ordinateur.",
        kind: "warn"
      });
      return;
    }
    const SRC = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SRC) return this.recordFallback();
    const rec: SR = new SRC();
    rec.lang = this.settings.lang;
    rec.interimResults = true;
    rec.continuous = this.settings.continuous;
    rec.maxAlternatives = 1;
    rec.onstart = () => {
      this.listening = true;
      bus.emit("voice:state", "listening");
    };
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const txt = r[0].transcript.trim();
        if (r.isFinal) {
          if (this.isEcho(txt)) continue;
          bus.emit("voice:interim", "");
          this.handleFinal(txt);
        } else interim += txt;
      }
      if (interim) {
        // interruption : l'utilisateur parle pendant que GRIOT parle
        if (this.speaking && !this.isEcho(interim) && interim.split(" ").length >= 2) this.interrupt();
        bus.emit("voice:interim", interim);
      }
    };
    rec.onerror = (e: any) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        bus.emit("toast", { text: "Micro refusé : autorisez-le dans le navigateur.", kind: "warn" });
        this.settings.continuous = false;
      } else if (e.error === "network" && this.serverSTT) {
        bus.emit("toast", { text: "Reconnaissance du navigateur indisponible — passage à Whisper.", kind: "warn" });
        this.rec = null;
        this.recordFallback();
      }
    };
    rec.onend = () => {
      this.listening = false;
      bus.emit("voice:state", this.speaking ? "speaking" : "idle");
      if (this.settings.continuous && this.rec === rec) setTimeout(() => this.settings.continuous && !this.listening && this.startListening(), 250);
    };
    this.rec = rec;
    try {
      rec.start();
    } catch {
      /* déjà démarré */
    }
  }

  stopListening() {
    if (this.dict && this.listening) {
      this.dict.stop().catch(() => {});
      this.listening = false;
      bus.emit("voice:state", "idle");
      return;
    }
    const r = this.rec;
    this.rec = null;
    this.settings.continuous = false;
    bus.emit("voice:continuous", false);
    if (r) {
      try {
        r.stop();
      } catch {}
    }
    if (this.recorder && this.recorder.state === "recording") this.recorder.stop();
    this.listening = false;
    bus.emit("voice:state", "idle");
  }

  setContinuous(on: boolean) {
    this.settings.continuous = on;
    this.saveSettings();
    bus.emit("voice:continuous", on);
    if (on && !this.listening) this.startListening();
    if (!on && this.rec) {
      const r = this.rec;
      this.rec = null;
      try {
        r.stop();
      } catch {}
    }
  }

  private handleFinal(txt: string) {
    if (!txt) return;
    if (this.settings.continuous && this.settings.wakeWord) {
      const m = /\b(griot|grillot|gryo|griyo)\b[,\s]*(.*)$/i.exec(txt);
      if (!m) return;
      txt = m[2] || "Oui ?";
    }
    this.onFinal(txt);
  }

  private isEcho(txt: string) {
    if (!this.speaking || !this.spokenText) return false;
    const a = txt.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "");
    const b = this.spokenText.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "");
    const words = a.split(" ").filter((w) => w.length > 2);
    if (!words.length) return true;
    const hits = words.filter((w) => b.includes(w)).length;
    return hits / words.length > 0.6;
  }

  /** Enregistrement micro + transcription Whisper côté serveur (navigateurs sans Web Speech). */
  private async recordFallback() {
    if (!this.serverSTT || !navigator.mediaDevices?.getUserMedia) {
      bus.emit("toast", { text: "Reconnaissance vocale indisponible dans ce navigateur (essayez Chrome ou Edge, ou configurez la clé API pour Whisper).", kind: "warn" });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        this.listening = false;
        bus.emit("voice:state", "thinking");
        const fd = new FormData();
        fd.append("audio", new Blob(chunks, { type: rec.mimeType }), "voice.webm");
        fd.append("lang", this.settings.lang);
        try {
          const r = await fetch("/api/stt", { method: "POST", body: fd });
          const d = await r.json();
          if (d.text) this.handleFinal(d.text);
        } catch {
          bus.emit("toast", { text: "Transcription impossible.", kind: "warn" });
        }
        bus.emit("voice:state", "idle");
      };
      this.recorder = rec;
      rec.start();
      this.listening = true;
      bus.emit("voice:state", "listening");
      bus.emit("toast", { text: "Enregistrement… cliquez à nouveau sur le micro (ou T) pour envoyer." });
      setTimeout(() => rec.state === "recording" && rec.stop(), 15000);
    } catch {
      bus.emit("toast", { text: "Micro refusé.", kind: "warn" });
    }
  }

  /** À appeler dans un geste utilisateur (iPad/iPhone) : débloque audio et synthèse vocale. */
  private synthUnlocked = false;
  unlock() {
    try {
      this.ensureCtx();
    } catch {}
    if ("speechSynthesis" in window && !this.synthUnlocked && !this.speaking) {
      // iOS : la synthèse vocale ne parle qu'après un premier « speak » fait pendant un toucher
      this.synthUnlocked = true;
      const u = new SpeechSynthesisUtterance(".");
      u.volume = 0;
      u.lang = this.settings.lang;
      speechSynthesis.speak(u);
    }
  }

  // ---------------------------------------------------------------- parole
  /** Interrompt immédiatement GRIOT. */
  interrupt() {
    this.generation++;
    this.queue = [];
    this.buffer = "";
    this.playing = false;
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {}
      this.currentSource = null;
    }
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    this.setSpeaking(false);
  }

  /** Ajoute du texte en streaming ; les phrases complètes partent en synthèse. */
  stream(chunk: string) {
    if (!this.settings.speak) return;
    this.buffer += chunk;
    // ne pas lire les blocs de code
    const fence = (this.buffer.match(/```/g) || []).length;
    if (fence % 2 === 1) return;
    const re = /([^.!?…\n]{8,}?[.!?…]+["»)]?)(\s|$)|([^\n]{4,})\n/;
    let m: RegExpExecArray | null;
    while ((m = re.exec(this.buffer))) {
      const sentence = (m[1] || m[3] || "").trim();
      this.buffer = this.buffer.slice(m.index + m[0].length);
      this.enqueue(sentence);
    }
  }

  flush() {
    const rest = this.buffer.trim();
    this.buffer = "";
    if (rest) this.enqueue(rest);
  }

  say(text: string) {
    if (!this.settings.speak) return;
    this.interrupt();
    this.stream(text + " ");
    this.flush();
  }

  private enqueue(text: string) {
    const clean = cleanForSpeech(text);
    if (!clean) return;
    this.queue.push(clean);
    if (!this.playing) this.playNext(this.generation);
  }

  private async playNext(gen: number) {
    if (gen !== this.generation) return;
    const text = this.queue.shift();
    if (!text) {
      this.playing = false;
      this.setSpeaking(false);
      return;
    }
    this.playing = true;
    this.setSpeaking(true);
    this.spokenText = text;
    const useServer = this.serverTTS && this.settings.neural;
    if (useServer) {
      try {
        const buf = await this.fetchTTS(text);
        if (gen !== this.generation) return;
        await this.playBuffer(buf, gen);
      } catch {
        this.serverTTS = false; // repli sur la voix du navigateur
        await this.speakBrowser(text, gen);
      }
    } else await this.speakBrowser(text, gen);
    this.playNext(gen);
  }

  private ttsCache = new Map<string, Promise<ArrayBuffer>>();
  private fetchTTS(text: string) {
    let p = this.ttsCache.get(text);
    if (!p) {
      p = fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, voice: this.settings.neuralVoice }) }).then((r) => {
        if (!r.ok) throw new Error("tts");
        return r.arrayBuffer();
      });
      this.ttsCache.set(text, p);
      if (this.ttsCache.size > 40) this.ttsCache.delete(this.ttsCache.keys().next().value!);
    }
    // pré-chargement de la phrase suivante
    const next = this.queue[0];
    if (next && !this.ttsCache.has(next)) this.fetchTTS(next).catch(() => {});
    return p;
  }

  private ensureCtx() {
    if (!this.audioCtx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AC();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.connect(this.audioCtx.destination);
    }
    if (this.audioCtx.state !== "running") this.audioCtx.resume().catch(() => {});
    return this.audioCtx;
  }

  private async playBuffer(data: ArrayBuffer, gen: number) {
    const ctx = this.ensureCtx();
    const audio = await ctx.decodeAudioData(data.slice(0));
    if (gen !== this.generation) return;
    await new Promise<void>((resolve) => {
      const src = ctx.createBufferSource();
      src.buffer = audio;
      src.playbackRate.value = this.settings.rate;
      src.connect(this.analyser!);
      src.onended = () => resolve();
      this.currentSource = src;
      src.start();
    });
  }

  /** Voix du navigateur pour une langue, de la plus réaliste à la moins réaliste. */
  voicesFor(lang: string) {
    if (!("speechSynthesis" in window)) return [];
    const base = lang.slice(0, 2);
    const cands = speechSynthesis.getVoices().filter((v) => v.lang.replace("_", "-").startsWith(base));
    // les voix « Premium / Améliorée / Naturelle / Neural » sont de vraies voix humaines de synthèse
    const score = (v: SpeechSynthesisVoice) =>
      (v.lang.replace("_", "-") === lang ? 4 : 0) +
      (/premium/i.test(v.name) ? 14 : 0) +
      (/enhanced|am[ée]lior/i.test(v.name) ? 11 : 0) +
      (/natural|neural|online|siri/i.test(v.name) ? 10 : 0) +
      (/google/i.test(v.name) ? 3 : 0) +
      (v.localService ? 0 : 1) +
      (/thomas|henri|paul|daniel|guy|denise|amelie|amélie|audrey|aurelie|aurélie/i.test(v.name) ? 1 : 0) -
      (/compact|eloquence|grandma|grandpa|rocko|shelley|flo|reed|sandy/i.test(v.name) ? 8 : 0);
    return cands.sort((a, b) => score(b) - score(a));
  }

  private pickVoice(lang: string) {
    const list = this.voicesFor(lang);
    return list.find((v) => v.name === this.settings.browserVoice) ?? list[0];
  }

  private speakBrowser(text: string, gen: number) {
    return new Promise<void>((resolve) => {
      if (!("speechSynthesis" in window)) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = this.settings.lang;
      const v = this.pickVoice(this.settings.lang);
      if (v) u.voice = v;
      // intonation expressive selon la ponctuation
      // débit et hauteur naturels (les voix premium sont déjà expressives)
      u.rate = this.settings.rate;
      u.pitch = 1;
      let level = 0;
      u.onboundary = () => {
        level = 0.9;
      };
      clearInterval(this.synthLevelTimer);
      this.synthLevelTimer = setInterval(() => {
        level = Math.max(0.15, level * 0.82 + (Math.random() < 0.3 ? 0.3 : 0));
        bus.emit("griot:level", level);
      }, 60);
      const done = () => {
        clearInterval(this.synthLevelTimer);
        bus.emit("griot:level", 0);
        resolve();
      };
      u.onend = done;
      u.onerror = done;
      if (gen !== this.generation) return done();
      if (speechSynthesis.paused) speechSynthesis.resume(); // bug Safari : synthèse restée en pause
      speechSynthesis.speak(u);
      // garde-fou : si Safari n'émet jamais « onend », on ne bloque pas la file
      setTimeout(done, 1500 + text.length * 120);
    });
  }

  private setSpeaking(on: boolean) {
    if (this.speaking === on) return;
    this.speaking = on;
    bus.emit("voice:state", on ? "speaking" : this.listening ? "listening" : "idle");
  }

  private levelLoop() {
    if (this.analyser && this.currentSource && this.speaking) {
      const data = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(data);
      let s = 0;
      for (let i = 2; i < 40; i++) s += data[i];
      bus.emit("griot:level", Math.min(1, s / (38 * 150)));
    }
    requestAnimationFrame(() => this.levelLoop());
  }
}

export function cleanForSpeech(t: string) {
  return t
    .replace(/```[\s\S]*?```/g, " (voir le code à l'écran) ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_#>|~]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}
