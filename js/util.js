// Genel yardımcılar.
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt)); // kare hızından bağımsız yumuşatma
export const smoothstep = (t) => t * t * (3 - 2 * t);
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
export const lerpAngle = (a, b, t) => a + wrapAngle(b - a) * t;
export const dampAngle = (a, b, k, dt) => lerpAngle(a, b, 1 - Math.exp(-k * dt));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
export const uid = () => Math.random().toString(36).slice(2, 8);
export const now = () => performance.now() / 1000;
/** Blender özel özellikleri string gelebilir; sayıya çevirir, olmazsa varsayılanı verir. */
export const num = (v, def) => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : def;
};
/** "1,0,0" | [1,0,0] → [1,0,0] */
export const vec3 = (v, def) => {
  if (typeof v === 'string') v = v.split(',').map((s) => parseFloat(s));
  return Array.isArray(v) && v.length >= 3 && v.every((n) => Number.isFinite(n)) ? v.slice(0, 3) : def;
};
/**
 * Blender / GLTF nesne adı eşleştirme yardımcıları.
 * GLTFLoader adlardaki "." karakterini siler ("Door_.001" → "Door_001", "Door.001" → "Door001") ve boşluğu "_" yapar.
 * Bu yüzden isim karşılaştırmaları ayırıcılara (_ . - boşluk) ve sondaki sayının sıfır dolgusuna duyarsızdır:
 *   Door_01 = Door_.001 = Door.001 = Door_1 = door1
 */
export const baseKey = (s) => String(s ?? '').toLowerCase().replace(/[\s_.\-]+/g, '');
export const canonName = (s) => baseKey(s).replace(/(\d+)$/, (d) => String(parseInt(d, 10)));
export const sameName = (a, b) => canonName(a) === canonName(b);
/** Anahtarı nesne adı olan bir tabloda arar: önce tam eşleşme, sonra ayırıcı / sıfır dolgusundan bağımsız eşleşme. */
export function lookupName(table, name) {
  if (!table || name == null) return undefined;
  if (Object.prototype.hasOwnProperty.call(table, name)) return table[name];
  const key = canonName(name);
  for (const k of Object.keys(table)) if (k !== 'default' && canonName(k) === key) return table[k];
  return undefined;
}
/** Işık grubu girdisi (config.js → LIGHT_GROUPS) bu id'yi kapsıyor mu? ("Light_" gibi önek ya da tam isim) */
export function matchesGroupEntry(id, entry) {
  if (id === entry || id.startsWith(entry) || sameName(id, entry)) return true;
  return /[\s_.\-]$/.test(entry) && baseKey(id).startsWith(baseKey(entry));
}

/** Debug botlarının oyuncu kimliği ("bot-N-xyz"). Gerçek oyuncu id'leri PeerJS tarafından üretilir, hiçbir zaman "bot-" ile başlamaz. */
export const isBotId = (id) => typeof id === 'string' && id.startsWith('bot-');
export const round2 = (v) => Math.round(v * 100) / 100;
export const round3 = (v) => Math.round(v * 1000) / 1000;

export const fmtTime = (sec) => {
  sec = Math.max(0, Math.ceil(sec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** h('div', {class:'x', onclick: fn}, 'metin', childEl) */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Çok basit olay yayıcı. */
export class Emitter {
  constructor() {
    this._h = new Map();
  }
  on(ev, fn) {
    if (!this._h.has(ev)) this._h.set(ev, new Set());
    this._h.get(ev).add(fn);
    return () => this.off(ev, fn);
  }
  off(ev, fn) {
    this._h.get(ev)?.delete(fn);
  }
  emit(ev, ...args) {
    const set = this._h.get(ev);
    if (set) for (const fn of [...set]) fn(...args);
  }
}

/** Sabit sıklıkta çalışan zamanlayıcı (ağ gönderimi için). */
export class Rate {
  constructor(hz) {
    this.interval = 1 / hz;
    this.t = 0;
  }
  tick(dt) {
    this.t += dt;
    if (this.t >= this.interval) {
      this.t = this.t % this.interval;
      return true;
    }
    return false;
  }
}

export const store = {
  get(key, def) {
    try {
      const v = localStorage.getItem('irgat.' + key);
      return v == null ? def : JSON.parse(v);
    } catch {
      return def;
    }
  },
  set(key, val) {
    try {
      localStorage.setItem('irgat.' + key, JSON.stringify(val));
    } catch {
      /* depolama kapalı */
    }
  },
};

/** 0xRRGGBB sayısını CSS rengine çevirir ("#rrggbb"). */
export const colorCss = (n) => `#${(Number(n) >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
