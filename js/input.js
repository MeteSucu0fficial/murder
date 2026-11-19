// Klavye / fare girdi durumu. Oyun mantığı sadece bu sınıfı sorgular.
// Dokunmatik arayüz (touch.js) oyun mantığına hiç dokunmaz: bu sınıfa "sanal tuş" basar (press / release), "sanal bakış" ekler (lookBy),
// analog hareketi moveVec ile verir ve imleç kilidini taklit eder (touchMode açıkken locked = "oyun denetimi aktif").
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
    this.touchMode = false; // dokunmatik arayüz etkin mi (touch.js açar / kapatır; varsayılan kapalı)
    this.moveVec = { x: 0, y: 0 }; // dokunmatik analog hareket: sağ(+), ileri(+), uzunluk ≤ 1
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
    // Dokunmatik modda gerçek fare olayları yok sayılır (dokunuştan türeyen "uyumluluk" fare olayları sanal tuşları bozmasın).
    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.locked || this.touchMode) return;
      const c = `Mouse${e.button}`;
      if (!this.down.has(c)) this.pressed.add(c);
      this.down.add(c);
    });
    window.addEventListener('mouseup', (e) => {
      if (this.touchMode) return;
      const c = `Mouse${e.button}`;
      if (this.down.delete(c)) this.released.add(c);
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.enabled || this.touchMode) return;
      this.lookX += e.movementX || 0;
      this.lookY += e.movementY || 0;
    });
    window.addEventListener(
      'wheel',
      (e) => {
        if (this.locked && !this.touchMode) this.wheel += Math.sign(e.deltaY);
      },
      { passive: true },
    );
    document.addEventListener('pointerlockchange', () => {
      if (this.touchMode) return; // sanal kilit: gerçek imleç kilidi kullanılmaz
      this._setLocked(document.pointerLockElement === this.canvas);
    });
  }

  /** Kilit durumunu değiştirir; kilit açılınca basılı her şey bırakılır ve dinleyiciler çağrılır. */
  _setLocked(v) {
    if (this.locked === v) return;
    this.locked = v;
    if (!v) {
      this.releaseAll();
      this.moveVec.x = this.moveVec.y = 0;
      this.lookX = this.lookY = 0;
    }
    this.listeners.forEach((fn) => fn(v));
  }

  /** Dokunmatik modu aç / kapat (kapatırken sanal kilit ve basılı sanal tuşlar temizlenir). */
  setTouchMode(on) {
    on = !!on;
    if (on === this.touchMode) return;
    if (on) this.exitLock(); // gerçek imleç kilidi varsa bırak
    this.touchMode = on;
    this._setLocked(false);
    this.releaseAll();
  }

  // ----- Sanal girdi (dokunmatik arayüz) -----
  /** Sanal tuşa bas: klavyedeki keydown ile aynı etkiyi yapar. */
  press(code) {
    if (!this.enabled || !code) return;
    if (!this.down.has(code)) this.pressed.add(code);
    this.down.add(code);
    this.keyHandlers.get(code)?.forEach((fn) => fn(true));
  }
  /** Sanal tuşu bırak (keyup). */
  release(code) {
    if (!code) return;
    if (this.down.delete(code)) this.released.add(code);
    this.keyHandlers.get(code)?.forEach((fn) => fn(false));
  }
  /** Sanal bakış: fare hareketi gibi (piksel birimi); yalnızca kilitliyken ve arayüz kapalıyken. */
  lookBy(dx, dy) {
    if (!this.locked || !this.enabled) return;
    this.lookX += dx;
    this.lookY += dy;
  }
  /** Sanal fare tekeri (uzaklaştır / yakınlaştır). */
  wheelBy(n) {
    if (this.locked && this.enabled) this.wheel += n;
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
    if (this.touchMode) {
      this._setLocked(true); // sanal kilit: dokunmatik denetimler etkin
      return;
    }
    if (this.canvas.requestPointerLock) {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    }
    engageTabGuard(); // tam ekran + Ctrl+W koruması (kullanıcı hareketi varsa)
  }

  exitLock() {
    if (this.touchMode) {
      this._setLocked(false);
      return;
    }
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
    if (this.enabled && this.locked && (this.moveVec.x || this.moveVec.y)) {
      x += this.moveVec.x; // dokunmatik analog çubuk (klavye ile birlikte de çalışır)
      y += this.moveVec.y;
    }
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
