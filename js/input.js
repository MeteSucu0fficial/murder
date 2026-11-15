// Klavye / fare girdi durumu. Oyun mantığı sadece bu sınıfı sorgular. (Mobil / dokunmatik destek kaldırıldı.)
import { engageTabGuard } from './tabGuard.js';

export const MOUSE_LEFT = 'Mouse0';
export const MOUSE_RIGHT = 'Mouse2';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set(); // bu karede basılanlar
    this.released = new Set(); // bu karede bırakılanlar
    this.lookX = 0;
    this.lookY = 0;
    this.wheel = 0;
    this.locked = false;
    this.enabled = true; // arayüz açıkken false yapılır
    this.listeners = new Set(); // lockchange dinleyicileri
    this.keyHandlers = new Map(); // code -> [fn]
    this._bind();
  }

  _bind() {
    const isTyping = () => {
      const a = document.activeElement;
      return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
    };
    window.addEventListener('keydown', (e) => {
      if (isTyping()) return;
      if (e.code === 'Tab') e.preventDefault();
      if (!this.enabled && e.code !== 'Escape') return;
      if (e.code === 'Space' || e.code === 'F2') e.preventDefault(); // zıplama / debug tuşu: sayfa kaydırma, tarayıcı açılışı engellenir
      if (e.repeat) return;
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
      this.keyHandlers.get(e.code)?.forEach((fn) => fn(true));
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (this.down.delete(e.code)) this.released.add(e.code);
      this.keyHandlers.get(e.code)?.forEach((fn) => fn(false));
    });
    window.addEventListener('blur', () => this.releaseAll());
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      const c = `Mouse${e.button}`;
      if (!this.down.has(c)) this.pressed.add(c);
      this.down.add(c);
    });
    window.addEventListener('mouseup', (e) => {
      const c = `Mouse${e.button}`;
      if (this.down.delete(c)) this.released.add(c);
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.enabled) return;
      this.lookX += e.movementX || 0;
      this.lookY += e.movementY || 0;
    });
    window.addEventListener(
      'wheel',
      (e) => {
        if (this.locked) this.wheel += Math.sign(e.deltaY);
      },
      { passive: true },
    );
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) this.releaseAll();
      this.listeners.forEach((fn) => fn(this.locked));
    });
  }

  /** Bir tuş değiştiğinde (basma/bırakma) çağrılacak işlev kaydet. */
  onKey(code, fn) {
    if (!this.keyHandlers.has(code)) this.keyHandlers.set(code, []);
    this.keyHandlers.get(code).push(fn);
  }

  onLockChange(fn) {
    this.listeners.add(fn);
  }

  requestLock() {
    if (this.canvas.requestPointerLock) {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    }
    engageTabGuard(); // tam ekran + Ctrl+W koruması (kullanıcı hareketi varsa)
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  releaseAll() {
    for (const c of this.down) this.released.add(c);
    this.down.clear();
  }

  // ----- Sorgular -----
  isDown(code) {
    return this.enabled && this.down.has(code);
  }
  wasPressed(code) {
    return this.enabled && this.pressed.has(code);
  }
  wasReleased(code) {
    return this.released.has(code);
  }

  /** Bir düğmeyi bu karede tüket: arayüz tıklamayı yuttuysa oyun eylemi (ateş, fırlatma...) tetiklenmesin. */
  consume(code) {
    this.pressed.delete(code);
    this.down.delete(code);
  }

  /** WASD → {x: sağ(+), y: ileri(+)} birim vektöre sınırlı. */
  getMove(keys) {
    let x = 0;
    let y = 0;
    if (this.isDown(keys.forward)) y += 1;
    if (this.isDown(keys.back)) y -= 1;
    if (this.isDown(keys.right)) x += 1;
    if (this.isDown(keys.left)) x -= 1;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  consumeLook() {
    const r = { x: this.lookX, y: this.lookY };
    this.lookX = this.lookY = 0;
    return r;
  }

  consumeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  /** Her karenin sonunda çağır. */
  endFrame() {
    this.pressed.clear();
    this.released.clear();
  }
}
