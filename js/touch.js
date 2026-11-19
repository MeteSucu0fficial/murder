// Dokunmatik (mobil) arayüz — yalnızca UI katmanı. Oyun mantığına dokunmaz; Input'taki sanal tuş / sanal bakış / analog hareket /
// sanal imleç kilidi köprüsünü kullanır (input.js). Böylece menüler, dairesel menüler, liste ve sohbet masaüstüyle aynı kodla çalışır.
//  • Çoklu dokunuş: her parmak kendi pointerId'siyle izlenir (çubuk + bakış + ateş + zıpla aynı anda).
//  • Her ekranda aynı boyut: tüm ölçüler "u" birimindedir (style.css → --u = ekran yüksekliğinin %1'i, 16:9'dan dar ekranlarda genişliğe göre).
//  • Sol yarı: yüzen analog çubuk (uca itince koşar; Ayarlar → Mobil'den SABİT / kilitli konuma ve koşu kilidine alınabilir). Sağ yarı: bakış.
//    Sağ alt: ateş / zıpla / eğil / etkileşim. Üst sağ: menü, sohbet, liste, ses. Sağ alt köşe: tam ekran düğmesi (menülerde de görünür).
//  • Kişiselleştirme (ctx.settings.touchUI): genel boyut / saydamlık / bakış çarpanı + düğme başına konum, boyut, gizleme (düzenleme ekranı: beginEdit).
import { KEYS } from './config.js';
import { ctx } from './context.js';
import { MOUSE_LEFT } from './input.js';
import { BUTTONS, LABELS } from './touchButtons.js';
import { icon } from './touchIcons.js';
import { h, store } from './util.js';

const LOOK_GAIN = 9.5; // 1u (ekran yüksekliğinin %1'i) sürükleme = bu kadar "fare pikseli" (asıl hassasiyet ayarlardaki çarpanla)
const LOOK_SLOP = 5; // px: parmak bu kadar oynamadan bakış dönmez (kazara dokunuşlar)
const STICK_R = 12.5; // u: çubuğun en uç mesafesi
const STICK_DEAD = 0.12; // ölü bölge (çubuk oranı)
const RUN_AT = 0.92; // çubuk bu orandan fazla itilince koşulur
const TAP_MS = 260; // bu süreden kısa + az hareketli dokunuş = "tık"
const TAP_PX = 14;
const HOLD_FRAMES = 2; // çok kısa dokunuşlar bile oyun karesinde görülsün (wasPressed + isDown)
const PINCH_STEP = 10; // u: çimdik yakınlaştırma adımı
const RUN_KEEP = 0.3; // koşu kilidi açıkken: koşmaya başlayınca çubuk bu orana inene kadar koşu sürer
const PAD_HIT = 1.35; // sabit joystick: tabanın bu katı yarıçap içine dokunmak çubuğu tutar
const SIZE_STEP = 0.1; // düzenleme ekranı: −/+ boyut adımı
const SIZE_MIN = 0.5;
const SIZE_MAX = 2.2;
/** Ayarlar → Mobil varsayılanları (ctx.settings.touchUI). layout: { düğmeId: { x, y (u), s (ölçek), h (gizli) } } */
export const TOUCH_DEFAULTS = { scale: 1, opacity: 1, look: 1, stick: 'float', runLock: false };

export class TouchControls {
  /** Bu cihaz dokunmatik mi? (?touch=1 / ?touch=0 ile zorlanabilir.) */
  static detect() {
    try {
      if (/[?&]touch=1(&|$)/.test(location.search)) return true;
      if (/[?&]touch=0(&|$)/.test(location.search)) return false;
      return (navigator.maxTouchPoints || 0) > 0 && window.matchMedia('(pointer: coarse)').matches;
    } catch {
      return false;
    }
  }

  constructor() {
    this.enabled = false; // dokunmatik mod açık mı
    this.on = false; // denetimler şu an görünür / etkin mi
    this.unit = 3.6; // 1u kaç piksel
    this.k = 1; // dairesel menü ölçeği (unit / 3.6)
    this.frame = 0;
    this.stick = null; // { id, ox, oy, r, run }
    this.look = null; // { id, x, y, sx, sy, t, moved }
    this.pinch = null; // { id, x, y, d0 }
    this.later = []; // ertelenmiş bırakmalar [{ at, code }]
    this._warned = false;
    this._fs = false;
    this._fsName = '';
    this.editing = false; // düzenleme ekranı açık mı
    this.sel = null; // düzenlemede seçili öğenin kimliği
    this.drag = null; // düzenlemede sürüklenen öğe { id (pointerId), ed, lx, ly }
    this.home = null; // sabit joystick tabanının ekrandaki merkezi { x, y } (px)
    this.sk = 1; // joystick ölçeği (genel boyut × düzen boyutu)
    this._stickKey = '';
    this._build();
    this._bind();
    this.apply();
  }

  // ------------------------------------------------------------------ kurulum
  _build() {
    this.lookEl = h('div', { class: 't-look' });
    this.knob = h('div', { class: 't-knob' });
    this.stickEl = h('div', { class: 't-stick hidden' }, this.knob);
    this.hint = h('div', { class: 't-stick-hint' });
    this.bar = h('div', { class: 't-hotbar' });
    this.padEl = h('div', { class: 't-pad nofix' }, h('b', {}, 'Joystick')); // sabit joystick tabanı: oyunda görünmez (konumu ölçmek + düzenleme ekranında tutmak için)
    this.fsEl = h('div', { class: 't-fs hidden', role: 'button', 'aria-label': 'Tam ekran' }, h('i'));
    this.editName = h('div', { class: 't-eb-name' });
    this.editHide = h('button', { type: 'button', class: 't-eb', onclick: () => this._editToggleHide() }, 'Gizle');
    this.editBar = h('div', { class: 't-edit-bar' },
      this.editName,
      h('button', { type: 'button', class: 't-eb', onclick: () => this._editSize(-SIZE_STEP) }, '−'),
      h('button', { type: 'button', class: 't-eb', onclick: () => this._editSize(SIZE_STEP) }, '+'),
      this.editHide,
      h('button', { type: 'button', class: 't-eb', onclick: () => this._editReset() }, 'Sıfırla'),
      h('button', { type: 'button', class: 't-eb primary', onclick: () => this.endEdit() }, 'Bitti'),
      h('div', { class: 't-edit-hint' }, 'Düğmeyi sürükleyerek taşı · dokunup seç, −/+ ile boyutlandır, Gizle ile kaldır'));
    this.root = h('div', { id: 'touch', class: 'off' }, this.lookEl, this.hint, this.padEl, this.stickEl, this.bar, this.editBar);
    this.rotate = h('div', { class: 't-rotate hidden' },
      h('div', { class: 't-rotate-box' }, h('div', { class: 't-rotate-ico' }, '⟲'), h('b', {}, 'Telefonu yatay çevir'), h('span', {}, 'Oyun yatay ekranda oynanır.')));
    this.items = BUTTONS.map((def) => {
      const ico = h('i');
      const txt = h('b');
      const el = h('div', { class: `t-btn ${def.cls} hidden`, role: 'button' }, ico, txt);
      (def.bar ? this.bar : this.root).appendChild(el);
      return { def, el, ico, txt, pid: null, key: '', icon: '', text: '', kind: 'hold', code: null, lx: 0, ly: 0, f: 0, armed: false };
    });
    // düzenlenebilir öğeler: çanta çubuğu tek öğe; joystick tabanı (yalnızca sabit modda) ve tam ekran düğmesi de dâhil
    this.editables = [
      ...this.items.filter((it) => !it.def.bar).map((it) => ({ id: it.def.id, el: it.el, label: LABELS[it.def.id] || it.def.id })),
      { id: 'hotbar', el: this.bar, label: 'Çanta çubuğu' },
      { id: 'stick', el: this.padEl, label: 'Joystick' },
      { id: 'fs', el: this.fsEl, label: 'Tam ekran' },
    ];
    document.body.insertBefore(this.root, document.getElementById('ui'));
    document.body.appendChild(this.rotate);
    document.body.appendChild(this.fsEl);
  }

  _bind() {
    this.lookEl.addEventListener('pointerdown', (e) => this._lookDown(e));
    for (const it of this.items) {
      it.el.addEventListener('pointerdown', (e) => this._btnDown(it, e));
      // "click" kullanıcı hareketi sayılır (sohbet klavyesi için gerekli). Bazı tarayıcılar click üretmezse pointerup'tan 350 ms sonra yedek tetik çalışır.
      it.el.addEventListener('click', () => this._fire(it));
    }
    const move = (e) => this._move(e);
    const end = (e) => this._end(e);
    window.addEventListener('pointermove', move, { capture: true });
    window.addEventListener('pointerup', end, true);
    window.addEventListener('pointercancel', end, true);
    this.root.addEventListener('pointerdown', () => this._gesture(), true);
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('gesturestart', (e) => { if (this.enabled) e.preventDefault(); }); // iOS çimdik-yakınlaştırma
    this.padEl.addEventListener('pointerdown', (e) => this._editDownId(e, 'stick'));
    this.fsEl.addEventListener('pointerdown', (e) => this._editDownId(e, 'fs'));
    this.fsEl.addEventListener('click', () => {
      if (!this.editing) this.toggleFullscreen();
    });
    document.addEventListener('fullscreenchange', () => this._fsIcon());
    document.addEventListener('webkitfullscreenchange', () => this._fsIcon());
    window.addEventListener('resize', () => this._measure());
    window.addEventListener('orientationchange', () => this._measure());
    window.addEventListener('blur', () => this._resetAll());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this._resetAll(); });
  }

  /** Ayarlara / cihaza göre dokunmatik modu aç ya da kapat (ayarlar ekranından da çağrılır). */
  apply() {
    const mode = ctx.settings?.touch || 'auto';
    const want = mode === 'on' || (mode === 'auto' && TouchControls.detect());
    this.enabled = want;
    document.documentElement.classList.toggle('touch', want);
    ctx.input?.setTouchMode(want);
    if (this.editing) this.endEdit(true);
    this.on = false;
    this.root.classList.add('off');
    this.rotate.classList.add('hidden');
    this.fsEl.classList.toggle('hidden', !want);
    this._resetAll();
    this._measure();
    this._applyLayout();
    this._fsIcon();
  }

  _measure() {
    const u = Math.min(window.innerHeight, window.innerWidth * 0.5625) / 100;
    this.unit = u > 0 ? u : 3.6;
    this.k = this.unit / 3.6;
    this._homeStick();
  }

  /** İlk dokunuş: ses kilidi + (destekleniyorsa) tam ekran / yatay kilit. */
  _gesture() {
    try {
      ctx.audio?.unlock();
    } catch {
      /* ses yok */
    }
    if (this._fs) return;
    this._fs = true;
    try {
      const el = document.documentElement;
      if (document.fullscreenElement || !el.requestFullscreen) return;
      const p = el.requestFullscreen({ navigationUI: 'hide' });
      if (p && p.then) {
        p.then(() => {
          try {
            const q = screen.orientation?.lock?.('landscape');
            if (q && q.catch) q.catch(() => {});
          } catch {
            /* desteklenmiyor */
          }
        }, () => {});
      }
    } catch {
      /* reddedildi */
    }
  }

  // ------------------------------------------------------------------ bakış alanı + çubuk
  _lookDown(e) {
    if (this.editing) {
      this.sel = null; // düzenleme: boş yere dokunmak seçimi kaldırır
      this._editSync();
      return;
    }
    if (!this.on) return;
    e.preventDefault();
    const pl = ctx.playerList;
    if (pl?.touchOpen) {
      pl.touchClose(); // liste açıkken boş bir yere dokunmak listeyi kapatır
      return;
    }
    try {
      this.lookEl.setPointerCapture(e.pointerId);
    } catch {
      /* gerekli değil */
    }
    const alive = !!ctx.me?.alive;
    if (this.cfg().stick === 'fixed') {
      // sabit (kilitli) joystick: yalnızca tabanın üstüne dokunmak çubuğu tutar; ekranın geri kalanı bakış alanıdır
      const near = !!this.home && Math.hypot(e.clientX - this.home.x, e.clientY - this.home.y) <= STICK_R * this.unit * this.sk * PAD_HIT;
      if (alive && near && !this.stick) {
        this._stickStart(e);
        return;
      }
    } else if (e.clientX < window.innerWidth * 0.5 && alive && !this.stick) {
      this._stickStart(e);
      return;
    }
    if (!this.look) {
      this.look = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false };
    } else if (!this.pinch && !ctx.me?.alive) {
      this.pinch = { id: e.pointerId, x: e.clientX, y: e.clientY, d0: null }; // ölüyken iki parmak = uzaklaştır / yakınlaştır
    }
  }

  _stickStart(e) {
    const u = this.unit;
    const k = this.sk;
    const fixed = !!this.home && this.cfg().stick === 'fixed';
    let ox;
    let oy;
    if (fixed) {
      ox = this.home.x; // sabit joystick: taban hep aynı yerde (kilitli), parmağı takip etmez
      oy = this.home.y;
    } else {
      const m = (STICK_R * k + 3) * u; // ekran kenarından taşmasın
      ox = Math.min(Math.max(e.clientX, m), Math.max(m, window.innerWidth - m));
      oy = Math.min(Math.max(e.clientY, m), Math.max(m, window.innerHeight - m));
    }
    this.stick = { id: e.pointerId, ox, oy, r: STICK_R * u * k, run: false, fixed };
    this.stickEl.style.transform = `translate(${ox}px, ${oy}px)`;
    this.stickEl.classList.remove('hidden');
    this.hint.classList.add('hidden');
    this._stickMove(e);
  }

  _stickMove(e) {
    const S = this.stick;
    let dx = e.clientX - S.ox;
    let dy = e.clientY - S.oy;
    const len = Math.hypot(dx, dy);
    if (len > S.r && !S.fixed) {
      // parmak sınırı aştı: çubuğun tabanı parmağı takip eder (başparmak kaydıkça yeniden ortalanır); sabit modda taban yerinde kalır
      const f = (len - S.r) / len;
      S.ox += dx * f;
      S.oy += dy * f;
      dx = e.clientX - S.ox;
      dy = e.clientY - S.oy;
      this.stickEl.style.transform = `translate(${S.ox}px, ${S.oy}px)`;
    }
    const l2 = Math.hypot(dx, dy);
    const n = Math.min(1, l2 / S.r);
    const mag = n < STICK_DEAD ? 0 : (n - STICK_DEAD) / (1 - STICK_DEAD);
    const ux = l2 > 0 ? dx / l2 : 0;
    const uy = l2 > 0 ? dy / l2 : 0;
    const mv = ctx.input.moveVec;
    mv.x = ux * mag;
    mv.y = -uy * mag; // ekranda yukarı = ileri
    const kk = l2 > S.r ? S.r / l2 : 1; // sabit çubukta topuz halkanın dışına çıkmaz
    this.knob.style.transform = `translate(${dx * kk}px, ${dy * kk}px)`;
    // koşu: uca itince; koşu kilidi açıksa bir kez koşmaya başlayınca çubuk merkeze yakın çekilene kadar sürer
    const run = n >= RUN_AT || (S.run && this.cfg().runLock && n >= RUN_KEEP);
    if (run !== S.run) {
      S.run = run;
      if (run) ctx.input.press(KEYS.run);
      else ctx.input.release(KEYS.run);
      this.stickEl.classList.toggle('run', run);
    }
  }

  _stickEnd() {
    const S = this.stick;
    if (!S) return;
    if (S.run) ctx.input.release(KEYS.run);
    this.stick = null;
    const mv = ctx.input.moveVec;
    mv.x = mv.y = 0;
    this.stickEl.classList.remove('run');
    this.knob.style.transform = '';
    if (S.fixed && this.home) {
      this.stickEl.style.transform = `translate(${this.home.x}px, ${this.home.y}px)`; // sabit: yerinde kalır, görünür
    } else {
      this.stickEl.classList.add('hidden');
      this.hint.classList.toggle('hidden', this.cfg().stick === 'fixed');
    }
  }

  _feedLook(dx, dy) {
    const s = (LOOK_GAIN / this.unit) * this.cfg().look; // Ayarlar → Mobil → Bakış hassasiyeti çarpanı
    ctx.input.lookBy(dx * s, dy * s);
  }

  // ------------------------------------------------------------------ düğmeler
  _btnDown(it, e) {
    if (this.editing) {
      this._editDownId(e, it.def.bar ? 'hotbar' : it.def.id); // düzenleme: düğme sürüklenir / seçilir, oyun tuşu basılmaz
      return;
    }
    if (!this.on || it.pid != null) return;
    e.preventDefault();
    try {
      it.el.setPointerCapture(e.pointerId);
    } catch {
      /* gerekli değil */
    }
    const d = it.def;
    it.kind = typeof d.kind === 'function' ? d.kind() : d.kind;
    it.code = d.code ? d.code() : null;
    it.pid = e.pointerId;
    it.lx = e.clientX;
    it.ly = e.clientY;
    it.f = this.frame;
    it.el.classList.add('down');
    const input = ctx.input;
    if (it.kind === 'fn' || !it.code) return;
    if (it.kind === 'toggle') {
      if (input.down.has(it.code)) input.release(it.code);
      else input.press(it.code);
    } else input.press(it.code); // hold / tap / radial
  }

  _btnEnd(it, type) {
    it.pid = null;
    it.el.classList.remove('down');
    if (it.kind === 'fn') {
      if (type === 'pointerup') {
        it.armed = true;
        setTimeout(() => this._fire(it), 350);
      }
      return;
    }
    if (it.kind === 'toggle' || !it.code) return;
    this._releaseLater(it.code, it.f);
  }

  /** 'fn' düğmesi: click ya da yedek zamanlayıcıdan yalnızca biri çalışır. */
  _fire(it) {
    if (!it.armed) return;
    it.armed = false;
    if (this.on) it.def.fn?.();
  }

  _releaseLater(code, f0) {
    const at = f0 + HOLD_FRAMES;
    if (this.frame >= at) ctx.input.release(code);
    else this.later.push({ at, code });
  }

  // ------------------------------------------------------------------ pencere düzeyi hareket / bitiş (tüm parmaklar)
  _move(e) {
    if (this.editing) {
      this._editMove(e);
      return;
    }
    if (!this.on) return;
    const id = e.pointerId;
    const S = this.stick;
    if (S && id === S.id) {
      this._stickMove(e);
      return;
    }
    const L = this.look;
    if (L && id === L.id) {
      const dx = e.clientX - L.x;
      const dy = e.clientY - L.y;
      L.x = e.clientX;
      L.y = e.clientY;
      if (!L.moved) {
        if (Math.hypot(e.clientX - L.sx, e.clientY - L.sy) < LOOK_SLOP) return;
        L.moved = true;
      }
      if (this.pinch) this._pinchStep();
      else this._feedLook(dx, dy);
      return;
    }
    const P = this.pinch;
    if (P && id === P.id) {
      P.x = e.clientX;
      P.y = e.clientY;
      this._pinchStep();
      return;
    }
    for (const it of this.items) {
      if (it.pid !== id) continue;
      const dx = e.clientX - it.lx;
      const dy = e.clientY - it.ly;
      it.lx = e.clientX;
      it.ly = e.clientY;
      if (it.def.look) this._feedLook(dx, dy);
      else if (it.kind === 'radial' && (ctx.radial?.isOpen || ctx.voiceRadial?.isOpen)) ctx.input.lookBy(dx, dy); // ham piksel: daire ölçeği k ile büyür
      return;
    }
  }

  _pinchStep() {
    const L = this.look;
    const P = this.pinch;
    if (!L || !P) return;
    const d = Math.hypot(L.x - P.x, L.y - P.y);
    if (P.d0 == null) {
      P.d0 = d;
      return;
    }
    const step = PINCH_STEP * this.unit;
    const n = Math.trunc((d - P.d0) / step);
    if (n) {
      ctx.input.wheelBy(-n); // parmaklar açılır = yakınlaş
      P.d0 += n * step;
    }
  }

  _end(e) {
    if (this.editing) {
      this._editEnd(e);
      return;
    }
    const id = e.pointerId;
    const S = this.stick;
    if (S && id === S.id) {
      this._stickEnd();
      return;
    }
    const P = this.pinch;
    if (P && id === P.id) {
      this.pinch = null;
      return;
    }
    const L = this.look;
    if (L && id === L.id) {
      this.look = null;
      const quick = e.type === 'pointerup' && !L.moved && performance.now() - L.t < TAP_MS && Math.hypot(e.clientX - L.sx, e.clientY - L.sy) < TAP_PX;
      if (quick) this._tapLook();
      if (this.pinch) {
        // kalan parmak bakış parmağı olur
        const q = this.pinch;
        this.pinch = null;
        this.look = { id: q.id, x: q.x, y: q.y, sx: q.x, sy: q.y, t: 0, moved: true };
      }
      return;
    }
    for (const it of this.items) if (it.pid === id) this._btnEnd(it, e.type);
  }

  /** Ölüyken ekrana dokunmak = sol tık: boşluk kamerasından izlemeye geçer (geri dönüş yok); izlerken sonraki oyuncuya geçer (önceki: ◀ düğmesi). */
  _tapLook() {
    if (!ctx.me || ctx.me.alive) return;
    ctx.input.press(MOUSE_LEFT);
    this._releaseLater(MOUSE_LEFT, this.frame);
  }

  // ------------------------------------------------------------------ durum temizleme
  _resetAll() {
    for (const it of this.items) {
      if (it.pid != null) {
        it.pid = null;
        it.el.classList.remove('down');
      }
    }
    this.stick = null;
    this.look = null;
    this.pinch = null;
    this.later.length = 0;
    this.stickEl.classList.add('hidden');
    this.stickEl.classList.remove('run');
    this.knob.style.transform = '';
    this.hint.classList.toggle('hidden', this.cfg().stick === 'fixed');
    this._stickKey = ''; // sabit joystick görünürlüğü bir sonraki karede yeniden eşitlenir
    const input = ctx.input;
    if (input) {
      input.releaseAll();
      input.moveVec.x = input.moveVec.y = 0;
    }
  }

  // ------------------------------------------------------------------ her kare
  update() {
    if (!this.enabled) return;
    try {
      this._update();
    } catch (err) {
      if (!this._warned) {
        this._warned = true;
        console.warn('[touch]', err); // arayüz hatası oyun döngüsünü durdurmasın
      }
    }
  }

  _update() {
    this.frame++;
    if (this.editing) {
      this.rotate.classList.toggle('hidden', window.innerHeight <= window.innerWidth); // düzenleme ekranında da dikey ekran uyarısı
      return;
    }
    const input = ctx.input;
    if (this.later.length) {
      const keep = [];
      for (const r of this.later) {
        if (this.frame >= r.at) input.release(r.code);
        else keep.push(r);
      }
      this.later = keep;
    }
    const inRound = (ctx.phase === 'playing' || ctx.phase === 'ended') && !!ctx.me;
    if (!inRound) {
      if (input.locked) input.exitLock();
    } else if (!input.locked && this._canLock()) input.requestLock(); // dokunmatikte tıklama beklenmez: otomatik "kilit"
    const intro = (ctx.round?.revealUntil || 0) > performance.now() / 1000;
    const on = inRound && input.locked && !intro;
    this.root.classList.toggle('list-open', !!ctx.playerList?.touchOpen); // liste açıkken boş alan geçirgen (satırlara dokunulabilsin)
    if (on !== this.on) {
      this.on = on;
      this.root.classList.toggle('off', !on);
      if (!on) this._resetAll();
      else this._homeStick();
    }
    this.rotate.classList.toggle('hidden', !(inRound && window.innerHeight > window.innerWidth));
    if (on) {
      this._syncStick();
      this._sync();
    }
  }

  /** Menü / sohbet / liste menüsü açık değilse oyun denetimleri etkin olabilir (ui.js'teki needLock ile aynı koşul). */
  _canLock() {
    return !ctx.ui?.modalOpen() && !ctx.playerList?.sticky && !ctx.chat?.box.classList.contains('typing');
  }

  /** Düğmelerin görünürlüğü / yazısı / durumu: yalnızca değişince DOM'a dokunur. */
  _sync() {
    const input = ctx.input;
    for (const it of this.items) {
      const d = it.def;
      const kind = typeof d.kind === 'function' ? d.kind() : d.kind;
      const show = !!d.show();
      const ico = d.icon ? d.icon() : '';
      const text = d.text ? String(d.text()) : '';
      let on = false;
      if (d.on) on = !!d.on();
      else if (kind === 'toggle' && d.code) on = input.isDown(d.code());
      const dim = d.dim ? !!d.dim() : false;
      const key = `${show ? 1 : 0}|${ico}|${text}|${on ? 1 : 0}|${dim ? 1 : 0}`;
      if (key === it.key) continue;
      it.key = key;
      it.el.classList.toggle('hidden', !show);
      if (ico !== it.icon) {
        it.icon = ico;
        it.ico.innerHTML = icon(ico);
      }
      if (text !== it.text) {
        it.text = text;
        it.txt.textContent = text;
        it.el.classList.toggle('no-text', !text);
      }
      it.el.classList.toggle('on', on);
      it.el.classList.toggle('dim', dim);
    }
  }

  /** Sabit joystick: oyundayken (hayattaysan) tabanı hep görünür; yüzen modda yalnızca dokununca çıkar. */
  _syncStick() {
    const fixed = this.cfg().stick === 'fixed';
    const show = fixed && !!this.home && !!ctx.me?.alive;
    const key = `${show ? 1 : 0}|${this.home ? Math.round(this.home.x) : 0}|${this.home ? Math.round(this.home.y) : 0}`;
    if (key === this._stickKey) return;
    this._stickKey = key;
    if (this.stick) return; // parmak çubuğu tutuyorsa dokunma
    this.stickEl.classList.toggle('hidden', !show);
    if (show) this.stickEl.style.transform = `translate(${this.home.x}px, ${this.home.y}px)`;
    this.hint.classList.toggle('hidden', fixed);
  }

  // ------------------------------------------------------------------ kişiselleştirme (Ayarlar → Mobil)
  /** ctx.settings.touchUI: eksik / bozuk alanlar varsayılanla tamamlanır. */
  cfg() {
    const S = ctx.settings;
    if (!S.touchUI || typeof S.touchUI !== 'object') S.touchUI = {};
    const T = S.touchUI;
    for (const [k, v] of Object.entries(TOUCH_DEFAULTS)) if (typeof T[k] !== typeof v) T[k] = v;
    if (!T.layout || typeof T.layout !== 'object') T.layout = {};
    return T;
  }

  _save() {
    store.set('settings', ctx.settings);
  }

  /** Ayarlar ekranından: genel boyut / saydamlık / joystick modu değişti. */
  refresh() {
    this._applyLayout();
    this._stickKey = '';
  }

  /** "Varsayılana dön": boyut, saydamlık, hassasiyet, joystick modu ve tüm düğme düzeni. */
  resetUI() {
    const T = this.cfg();
    Object.assign(T, TOUCH_DEFAULTS);
    T.layout = {};
    this.refresh();
    this._save();
  }

  /** Genel boyut / saydamlık ve düğme başına konum / boyut / gizleme ayarlarını CSS değişkenlerine uygular. */
  _applyLayout() {
    const T = this.cfg();
    const fixed = T.stick === 'fixed';
    const rs = document.documentElement.style;
    rs.setProperty('--ts', String(T.scale));
    rs.setProperty('--to', String(T.opacity));
    for (const ed of this.editables) {
      const L = T.layout[ed.id] || {};
      const off = !!L.h && ed.id !== 'pause' && ed.id !== 'stick'; // menü düğmesi ve joystick gizlenemez (ayarlara dönüş yolu kapanmasın)
      ed.el.style.setProperty('--dx', String(L.x || 0));
      ed.el.style.setProperty('--dy', String(L.y || 0));
      ed.el.style.setProperty('--sc', String(L.s || 1));
      ed.el.classList.toggle('ux-hide', off && !this.editing);
      ed.el.classList.toggle('ux-off', off && this.editing);
    }
    this.padEl.classList.toggle('nofix', !fixed);
    this.stickEl.classList.toggle('fixed', fixed);
    this.sk = T.scale * (fixed ? (T.layout.stick?.s || 1) : 1);
    this.stickEl.style.setProperty('--k', String(this.sk));
    this._homeStick();
  }

  /** Sabit joystick tabanının ekrandaki merkezi (konum / boyut ayarları dâhil: getBoundingClientRect dönüşümleri hesaba katar). */
  _homeStick() {
    if (this.cfg().stick !== 'fixed') {
      this.home = null;
      return;
    }
    const r = this.padEl.getBoundingClientRect();
    this.home = r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
    this._stickKey = '';
  }

  // ------------------------------------------------------------------ düzenleme ekranı
  /** Düğme düzenleyicisini aç: tüm düğmeler görünür; sürükle = taşı, dokun = seç, −/+ boyut, Gizle. (Ayarlar → Mobil → Düğme düzenini düzenle) */
  beginEdit() {
    if (!this.enabled) return false;
    this.editing = true;
    this.sel = null;
    this.drag = null;
    this._resetAll();
    this.on = false;
    document.documentElement.classList.add('t-editing');
    this.root.classList.remove('off');
    this.root.classList.add('edit');
    this._applyLayout();
    this._editSync();
    return true;
  }

  /** Düzenleyiciyi kapat ve kaydet. quiet: ayarlar ekranına geri dönme. */
  endEdit(quiet = false) {
    if (!this.editing) return;
    this.editing = false;
    this.sel = null;
    this.drag = null;
    document.documentElement.classList.remove('t-editing');
    this.root.classList.remove('edit');
    this.root.classList.add('off');
    for (const it of this.items) it.key = ''; // oyun durumuna göre yeniden eşitlensin
    this._applyLayout();
    this._save();
    if (!quiet) ctx.ui?.openSettings('touch'); // ayarlara geri dön
  }

  /** Düzenleme ekranı: her düğme (oyun durumundan bağımsız) sabit adıyla görünür; seçili olan vurgulanır. */
  _editSync() {
    for (const it of this.items) {
      const d = it.def;
      let ico = '';
      try {
        ico = d.icon ? d.icon() : '';
      } catch {
        ico = '';
      }
      it.el.classList.remove('hidden', 'dim', 'on', 'down', 'no-text');
      if (ico !== it.icon) {
        it.icon = ico;
        it.ico.innerHTML = icon(ico);
      }
      const label = LABELS[d.id] || '';
      if (label !== it.text) {
        it.text = label;
        it.txt.textContent = label;
      }
      it.key = '';
    }
    for (const ed of this.editables) ed.el.classList.toggle('sel', ed.id === this.sel);
    const ed = this.editables.find((x) => x.id === this.sel);
    const L = ed ? this.cfg().layout[ed.id] : null;
    this.editName.textContent = ed ? `${ed.label} · %${Math.round((L?.s || 1) * 100)}` : 'Bir düğmeye dokun';
    this.editHide.textContent = L?.h ? 'Göster' : 'Gizle';
    this.editHide.disabled = !ed || ed.id === 'pause' || ed.id === 'stick';
  }

  _layoutOf(id) {
    const T = this.cfg();
    return (T.layout[id] ||= {});
  }

  _editSize(delta) {
    const id = this.sel;
    if (!id) return;
    const L = this._layoutOf(id);
    L.s = Math.min(SIZE_MAX, Math.max(SIZE_MIN, Math.round(((L.s || 1) + delta) * 100) / 100));
    this._applyLayout();
    this._save();
    this._editSync();
  }

  _editToggleHide() {
    const id = this.sel;
    if (!id || id === 'pause' || id === 'stick') return;
    const L = this._layoutOf(id);
    L.h = !L.h;
    this._applyLayout();
    this._save();
    this._editSync();
  }

  _editReset() {
    this.cfg().layout = {};
    this.sel = null;
    this._applyLayout();
    this._save();
    this._editSync();
  }

  _editDownId(e, id) {
    if (!this.editing || this.drag) return;
    const ed = this.editables.find((x) => x.id === id);
    if (!ed) return;
    e.preventDefault();
    this.sel = id;
    this.drag = { id: e.pointerId, ed, lx: e.clientX, ly: e.clientY };
    try {
      e.currentTarget?.setPointerCapture?.(e.pointerId);
    } catch {
      /* gerekli değil */
    }
    this._editSync();
  }

  _editMove(e) {
    const D = this.drag;
    if (!D || e.pointerId !== D.id) return;
    const L = this._layoutOf(D.ed.id);
    const px = L.x || 0;
    const py = L.y || 0;
    L.x = px + (e.clientX - D.lx) / this.unit; // piksel → u (her ekranda aynı oransal konum)
    L.y = py + (e.clientY - D.ly) / this.unit;
    D.lx = e.clientX;
    D.ly = e.clientY;
    this._applyLayout();
    const r = D.ed.el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    if (cx < 0 || cx > window.innerWidth || cy < 0 || cy > window.innerHeight) {
      L.x = px; // ekranın dışına taşınamaz
      L.y = py;
      this._applyLayout();
    }
  }

  _editEnd(e) {
    const D = this.drag;
    if (!D || e.pointerId !== D.id) return;
    const L = this._layoutOf(D.ed.id);
    L.x = Math.round((L.x || 0) * 10) / 10;
    L.y = Math.round((L.y || 0) * 10) / 10;
    this.drag = null;
    this._applyLayout();
    this._save();
    this._editSync();
  }

  // ------------------------------------------------------------------ tam ekran düğmesi
  /** Tam ekranı aç / kapat (dokunuş olayından çağrılmalı). Desteklenmiyorsa (iPhone Safari) ipucu verir. */
  toggleFullscreen() {
    const d = document;
    const el = d.documentElement;
    try {
      if (d.fullscreenElement || d.webkitFullscreenElement) {
        (d.exitFullscreen || d.webkitExitFullscreen)?.call(d);
        return;
      }
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (!req) {
        ctx.ui?.toast('Bu tarayıcı tam ekranı desteklemiyor. iPhone: Paylaş → "Ana Ekrana Ekle" ile tam ekran oynayabilirsin.', 5000);
        return;
      }
      this._fs = true; // ilk dokunuştaki otomatik tam ekran denemesi tekrar çalışmasın
      const p = req.call(el, { navigationUI: 'hide' });
      const lock = () => {
        try {
          const q = screen.orientation?.lock?.('landscape');
          if (q && q.catch) q.catch(() => {});
        } catch {
          /* desteklenmiyor */
        }
      };
      if (p && p.then) p.then(lock, () => {});
      else lock();
    } catch {
      /* reddedildi */
    }
  }

  _fsIcon() {
    const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
    const name = on ? 'fsExit' : 'fsEnter';
    if (this._fsName === name) return;
    this._fsName = name;
    const i = this.fsEl.firstChild;
    if (i) i.innerHTML = icon(name);
  }
}
