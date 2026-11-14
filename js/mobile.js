// Mobil kontroller: sanal joystick, dokunarak kamera döndürme ve ekran düğmeleri.
// Düğmeler Input.setVirtual ile klavye/fare tuşlarını taklit eder; bu yüzden oyun mantığına dokunulmaz.
// Arayüz tamamen bu dosya + style.css içindeki ".mobile" bölümüdür (masaüstü arayüzünden bağımsız).
import { GAME_CONFIG, KEYS } from './config.js';
import { ctx } from './context.js';
import { MOUSE_LEFT, MOUSE_RIGHT } from './input.js';
import { h } from './util.js';

const C = GAME_CONFIG.camera;
const JOY_R = 56;

export class MobileControls {
  constructor(root) {
    this.root = h('div', { class: 'mobile hidden' });
    root.appendChild(this.root);
    this.joyId = null;
    this.lookId = null;
    this.lookLast = null;
    this.run = false;
    this.crouch = false;
    this.build();
  }

  /**
   * Basılı tutulan düğme: down → tuş basılı, up → bırakıldı.
   * code: sabit kod (fare düğmesi) ya da () => KEYS.eylem — tuş ayarı değişse de basma anındaki atama kullanılır.
   */
  holdBtn(label, code, cls = '') {
    const b = h('button', { type: 'button', class: `mbtn ${cls}`.trim() }, label);
    let held = null;
    const down = (e) => {
      e.preventDefault();
      b.setPointerCapture?.(e.pointerId);
      b.classList.add('on');
      held = typeof code === 'function' ? code() : code;
      ctx.input.setVirtual(held, true);
    };
    const up = (e) => {
      e.preventDefault();
      b.classList.remove('on');
      if (held != null) ctx.input.setVirtual(held, false);
      held = null;
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    return b;
  }

  /** Tek dokunuş: tuşa kısa bas-bırak. */
  tapBtn(label, fn, cls = '') {
    const b = h('button', { type: 'button', class: `mbtn ${cls}`.trim() }, label);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      fn();
    });
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    return b;
  }

  /** code: sabit kod ya da () => KEYS.eylem (basma anında çözülür). */
  tapKey(label, code, cls = '') {
    return this.tapBtn(label, () => {
      const c = typeof code === 'function' ? code() : code;
      ctx.input.setVirtual(c, true);
      setTimeout(() => ctx.input.setVirtual(c, false), 60);
    }, cls);
  }

  build() {
    // ---- joystick ----
    this.joyBase = h('div', { class: 'joy-base' }, (this.joyKnob = h('div', { class: 'joy-knob' })));
    this.joyZone = h('div', { class: 'joy-zone' }, this.joyBase);
    // ---- kamera alanı ----
    this.lookZone = h('div', { class: 'look-zone' });

    // ---- düğmeler ----
    let runCode = null; // koş düğmesi açıkken basılı tutulan tuş
    const runBtn = this.tapBtn('KOŞ', () => {
      this.run = !this.run;
      if (this.run) {
        runCode = KEYS.run;
        ctx.input.setVirtual(runCode, true);
      } else if (runCode) {
        ctx.input.setVirtual(runCode, false);
        runCode = null;
      }
      runBtn.classList.toggle('on', this.run);
    }, 'run');
    let crouchCode = null; // eğil düğmesi açıkken basılı tutulan tuş
    const crouchBtn = this.tapBtn('EĞİL', () => {
      this.crouch = !this.crouch;
      if (this.crouch) {
        crouchCode = KEYS.crouch;
        ctx.input.setVirtual(crouchCode, true);
      } else if (crouchCode) {
        ctx.input.setVirtual(crouchCode, false);
        crouchCode = null;
      }
      crouchBtn.classList.toggle('on', this.crouch);
    }, 'small');
    const pttBtn = this.holdBtn('🎤', () => KEYS.ptt, 'ptt');
    const lvlBtn = this.tapBtn('Ses', () => ctx.voiceRadial?.toggleTouch(), 'small'); // dokun → fısıltı / normal / bağırma dairesi
    const micBtn = this.tapKey('Mik', () => KEYS.mic, 'small');
    const jumpBtn = this.tapKey('ZIPLA', () => KEYS.jump, 'jump');

    const cluster = h('div', { class: 'm-cluster' },
      h('div', { class: 'm-row' },
        this.tapBtn('Q', () => ctx.radial?.toggleTouch(), 'small'),
        this.tapBtn('Liste', () => ctx.playerList?.toggleTouch(), 'small'),
        this.tapBtn('Yaz', () => ctx.chat?.focus(), 'small'),
        this.tapBtn('☰', () => ctx.ui.showPause(), 'small')),
      h('div', { class: 'm-row' },
        this.tapKey('1', () => KEYS.hand, 'small'), this.tapKey('2', () => KEYS.equip, 'small'),
        this.tapKey('🔦', () => KEYS.flashlight, 'small'), this.holdBtn('⚡', () => KEYS.ability, 'small'), this.tapKey('⟳', () => KEYS.reload, 'small')), // ⚡ basılı tutulur (S2G); diğer roller basış anında çalışır
      h('div', { class: 'm-row' }, pttBtn, lvlBtn, micBtn, runBtn),
      h('div', { class: 'm-row' }, crouchBtn, jumpBtn),
      h('div', { class: 'm-row big' },
        this.holdBtn('SAĞ', MOUSE_RIGHT, 'alt'), this.holdBtn('SOL', MOUSE_LEFT, 'atk'), this.holdBtn('KULLAN', () => KEYS.interact, 'use')));
    this.root.append(this.lookZone, this.joyZone, cluster);

    this.bindJoystick();
    this.bindLook();
  }

  bindJoystick() {
    const zone = this.joyZone;
    const input = () => ctx.input;
    const set = (e) => {
      const r = this.joyBase.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2);
      let dy = e.clientY - (r.top + r.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > JOY_R) {
        dx = (dx / len) * JOY_R;
        dy = (dy / len) * JOY_R;
      }
      this.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      input().axis.x = dx / JOY_R;
      input().axis.y = -dy / JOY_R;
    };
    const end = () => {
      this.joyId = null;
      this.joyKnob.style.transform = '';
      input().axis.x = input().axis.y = 0;
    };
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.joyId !== null) return;
      this.joyId = e.pointerId;
      zone.setPointerCapture?.(e.pointerId);
      set(e);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.joyId) {
        e.preventDefault();
        set(e);
      }
    });
    zone.addEventListener('pointerup', (e) => e.pointerId === this.joyId && end());
    zone.addEventListener('pointercancel', (e) => e.pointerId === this.joyId && end());
  }

  bindLook() {
    const zone = this.lookZone;
    const k = C.touchSensitivity / C.sensitivity;
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.lookId !== null) return;
      this.lookId = e.pointerId;
      this.lookLast = [e.clientX, e.clientY];
      zone.setPointerCapture?.(e.pointerId);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookId) return;
      e.preventDefault();
      ctx.input.addLook((e.clientX - this.lookLast[0]) * k, (e.clientY - this.lookLast[1]) * k);
      this.lookLast = [e.clientX, e.clientY];
    });
    const end = (e) => {
      if (e.pointerId === this.lookId) this.lookId = null;
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  update() {
    const show = ctx.phase === 'playing' || ctx.phase === 'ended';
    this.root.classList.toggle('hidden', !show || ctx.ui.modalOpen());
  }
}
