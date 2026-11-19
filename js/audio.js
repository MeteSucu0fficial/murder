// Ses yöneticisi: (1) dosyadan ses çalma (Q menüsü), (2) kod ile üretilen efektler (silah, bildirim...).
// Ses dosyası bulunamazsa oyun bozulmaz; kısa bir bip çalınır.
// Bıçak (vurma/fırlatma) ve kapı sesleri TAMAMEN KAPALIDIR (config.js → GAME_CONFIG.audio.silent); silah sesleri açıktır.
import { GAME_CONFIG } from './config.js';

const SILENT = new Set(GAME_CONFIG.audio?.silent || []);

class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.8;
    this.buffers = new Map(); // url -> Promise<AudioBuffer|null>
    this.playing = new Map(); // url -> Set<AudioBufferSourceNode>
    this._noise = null;
  }

  _ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return true;
  }

  /** Kullanıcı etkileşimiyle (tıklama) çağrılmalı; tarayıcı ses kilidini açar. */
  unlock() {
    this._ensure();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  load(url) {
    if (!this._ensure()) return Promise.resolve(null);
    if (!this.buffers.has(url)) {
      const p = (async () => {
        try {
          const res = await fetch(url);
          if (!res.ok) return null;
          return await this.ctx.decodeAudioData(await res.arrayBuffer());
        } catch {
          return null;
        }
      })();
      this.buffers.set(url, p);
    }
    return this.buffers.get(url);
  }

  /** Ses dosyasının süresi (sn). Dosya yoksa / çözülemezse 0. */
  async duration(url) {
    const buf = await this.load(url);
    return buf ? buf.duration : 0;
  }

  /**
   * Dosyadan ses çal. Aynı ses en fazla maxConcurrent kez eşzamanlı çalar; fazlası en eskiyi keser.
   * pos + listener + range verilirse ses mesafeyle doğrusal kısılır (range metre ötesinde duyulmaz).
   * Dönüş: { stop(), duration } (çalınamadıysa null).
   */
  async playUrl(url, { volume = 1, maxConcurrent = 4, pos = null, listener = null, range = 0 } = {}) {
    if (!this._ensure()) return null;
    if (pos && listener && range > 0) {
      const d = Math.hypot(pos.x - listener.x, pos.y - listener.y, pos.z - listener.z);
      volume *= Math.max(0, 1 - d / range);
      if (volume < 0.01) return null;
    }
    const buf = await this.load(url);
    if (!buf) {
      this.sfx('notify', { volume: volume * 0.8 });
      return null;
    }
    let set = this.playing.get(url);
    if (!set) this.playing.set(url, (set = new Set()));
    while (set.size >= maxConcurrent) {
      const oldest = set.values().next().value;
      try {
        oldest.stop();
      } catch {
        /* zaten bitti */
      }
      set.delete(oldest);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(this.master);
    src.onended = () => set.delete(src);
    set.add(src);
    src.start();
    return {
      duration: buf.duration,
      stop: () => {
        try {
          src.stop();
        } catch {
          /* zaten bitti */
        }
        set.delete(src);
      },
    };
  }

  // ---------- Üretilen efektler ----------
  _tone(freq, dur, { type = 'sine', vol = 0.3, slideTo = null, delay = 0 } = {}) {
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  _noiseBurst(dur, { vol = 0.3, from = 4000, to = 400, delay = 0, type = 'lowpass' } = {}) {
    if (!this._noise) {
      const len = this.ctx.sampleRate * 1;
      const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._noise = b;
    }
    const t0 = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this._noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(from, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t0, Math.random() * 0.5);
    s.stop(t0 + dur + 0.02);
  }

  /**
   * name: shot | rifle | pistol | sniper | hit | taser | explosion | beep | notify | reload | click | death | win | lose
   * (stab | throw | door çağrılsa bile ÇALMAZ: SILENT listesi.)
   * opts.pos + opts.listener verilirse mesafeye göre kısılır.
   */
  sfx(name, { volume = 1, pos = null, listener = null, range = 45 } = {}) {
    if (SILENT.has(name)) return;
    if (!this._ensure()) return;
    if (pos && listener) {
      const d = Math.hypot(pos.x - listener.x, pos.y - listener.y, pos.z - listener.z);
      const f = Math.max(0, 1 - d / range);
      volume *= f * f;
      if (volume < 0.02) return;
    }
    const v = volume;
    switch (name) {
      case 'pistol':
      case 'shot':
        this._noiseBurst(0.18, { vol: 0.55 * v, from: 6000, to: 300 });
        this._tone(160, 0.14, { type: 'square', vol: 0.25 * v, slideTo: 50 });
        break;
      case 'sniper': // gür patlama + uzun yankı, ardından sürgü sesi (iki metalik tık)
        this._noiseBurst(0.42, { vol: 0.8 * v, from: 4200, to: 160 });
        this._tone(95, 0.32, { type: 'square', vol: 0.34 * v, slideTo: 30 });
        this._tone(520, 0.04, { type: 'square', vol: 0.1 * v, delay: 0.55 });
        this._tone(300, 0.05, { type: 'square', vol: 0.1 * v, delay: 0.72 });
        break;
      case 'rifle':
        this._noiseBurst(0.1, { vol: 0.4 * v, from: 5000, to: 500 });
        this._tone(220, 0.07, { type: 'square', vol: 0.15 * v, slideTo: 90 });
        break;
      case 'hit':
        this._tone(120, 0.12, { type: 'sawtooth', vol: 0.3 * v, slideTo: 60 });
        break;
      case 'taser':
        for (let i = 0; i < 6; i++) this._tone(900 + (i % 2) * 400, 0.05, { type: 'square', vol: 0.12 * v, delay: i * 0.05 });
        break;
      case 'explosion':
        this._noiseBurst(1.1, { vol: 0.9 * v, from: 1800, to: 60 });
        this._tone(70, 0.9, { type: 'sine', vol: 0.7 * v, slideTo: 25 });
        break;
      case 'beep':
        this._tone(1500, 0.08, { type: 'square', vol: 0.2 * v });
        break;
      case 'notify':
        this._tone(660, 0.14, { vol: 0.28 * v });
        this._tone(990, 0.22, { vol: 0.28 * v, delay: 0.13 });
        break;
      case 'reload':
        this._tone(300, 0.05, { type: 'square', vol: 0.15 * v });
        this._tone(500, 0.06, { type: 'square', vol: 0.15 * v, delay: 0.18 });
        break;
      case 'click':
        this._tone(800, 0.03, { type: 'square', vol: 0.1 * v });
        break;
      case 'death':
        this._tone(220, 0.6, { type: 'sawtooth', vol: 0.3 * v, slideTo: 40 });
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.25, { vol: 0.25 * v, delay: i * 0.12 }));
        break;
      case 'lose':
        [392, 330, 262, 196].forEach((f, i) => this._tone(f, 0.3, { type: 'triangle', vol: 0.25 * v, delay: i * 0.14 }));
        break;
      default:
        this._tone(600, 0.1, { vol: 0.2 * v });
    }
  }
}

export const audio = new AudioManager();
