// Basılı tutarak açılan dairesel menüler. İki örnek vardır (main.js):
//  • ctx.radial      — Q: ses menüsü. Seçenekler config.js → RADIAL_MENU_ITEMS (dinamik: ekledikçe daire büyür).
//  • ctx.voiceRadial — C: konuşma seviyesi menüsü (Fısıltı / Normal / Bağırma; sessiz modda yalnızca Normal / Bağırma).
// Masaüstü: tuşu basılı tut, fareyi yöne çek, tuşu bırak → seçilen öğe uygulanır. (İmleç kilitli kaldığı için sanal imleç kullanılır.)
// Ses menüsünde ses host tarafından yetkilendirilir ve HERKESE çalınır (yakınlıktan bağımsız).
// Bir ses çalarken (süresi bitene kadar) o öğe herkes için kilitlenir: tekrar basılamaz (menüde soluk görünür).
import { KEYS, RADIAL_MENU_ITEMS } from './config.js';
import { ctx } from './context.js';
import { keyLabel } from './keybinds.js';
import { h } from './util.js';

const RADIUS = 128;
const DEAD_ZONE = 34;
const TAU = Math.PI * 2;
/** Dokunmatikte daire ekran boyuna göre ölçeklenir (her ekranda aynı büyüklük); masaüstünde 1. */
const sc = () => (ctx.input?.touchMode ? ctx.touch?.k || 1 : 1);

/** Ses menüsü (Q). */
export const SOUND_MENU = {
  key: () => KEYS.radial,
  items: () => RADIAL_MENU_ITEMS,
  busyAware: true,
  hint: () => (ctx.input?.touchMode ? 'Parmağını kaydır, bırakınca seçilir' : `Bir ses seç, ${keyLabel(KEYS.radial)} tuşunu bırak`),
  canUse: () => !!ctx.me && ctx.me.alive && ctx.phase === 'playing' && !ctx.ui.modalOpen(),
  onChoose: (i) => ctx.client.toHost({ t: 'sound', i }),
};

/** Konuşma seviyesi menüsü (C): seçenekler voice.js → levelChoices(). */
export const VOICE_MENU = {
  key: () => KEYS.talkLevel,
  items: () => ctx.voice?.levelChoices() || [],
  busyAware: false,
  hint: () => (ctx.input?.touchMode ? 'Parmağını kaydır, bırakınca seçilir' : `Seviyeyi seç, ${keyLabel(KEYS.talkLevel)} tuşunu bırak`),
  canUse: () => !!ctx.me && !!ctx.voice?.canSpeak() && ctx.phase !== 'menu' && !ctx.ui.modalOpen() && !ctx.playerList?.shown && ctx.input.locked,
  onChoose: (i, item) => ctx.voice?.chooseLevel(item?.level),
};

export class RadialMenu {
  constructor(root, def = SOUND_MENU) {
    this.def = def;
    this.ring = h('div', { class: 'radial-ring' });
    this.cursor = h('div', { class: 'radial-cursor' });
    this.hint = h('div', { class: 'radial-hint' }, '');
    this.el = h('div', { class: 'radial hidden' }, this.ring, this.cursor, this.hint);
    root.appendChild(this.el);
    this.isOpen = false;
    this.cx = 0;
    this.cy = 0;
    this.sel = -1;
    this.items = [];
    this.angles = [];
    this.nodes = [];
    this.busyUntil = {}; // öğe indeksi → çalan sesin biteceği an (sn)
  }

  /** Host "şu ses çalıyor" dedi: i numaralı öğe dur saniye kilitlenir. */
  markBusy(i, dur) {
    if (i == null) return;
    this.busyUntil[i] = performance.now() / 1000 + (dur || 1.5);
  }

  isBusy(i) {
    return !!this.def.busyAware && (this.busyUntil[i] || 0) > performance.now() / 1000;
  }

  build() {
    this.items = this.def.items();
    const n = this.items.length;
    // öğe açısı: verilmediyse tepeden başlayıp eşit aralıklı (saat yönü); ekran koordinatı: sağ = 0, aşağı = +π/2
    this.angles = this.items.map((it, i) => it.angle ?? -Math.PI / 2 + (i / n) * TAU);
    const R = RADIUS * sc();
    this.ring.replaceChildren();
    this.nodes = this.items.map((it, i) => {
      const a = this.angles[i];
      const node = h(
        'div',
        { class: 'radial-item', style: { transform: `translate(-50%,-50%) translate(${Math.cos(a) * R}px, ${Math.sin(a) * R}px)` } },
        it.name,
        it.sub ? h('small', { style: { display: 'block', opacity: '0.7', fontSize: '11px', marginTop: '2px' } }, it.sub) : null,
      );
      this.ring.appendChild(node);
      return node;
    });
  }

  open() {
    if (this.isOpen || RadialMenu.active || !this.def.canUse()) return;
    this.build();
    if (!this.items.length) return;
    RadialMenu.active = this; // aynı anda tek daire (ikisi de sanal imleci kullanır)
    this.isOpen = true;
    this.cx = this.cy = 0;
    this.sel = -1;
    this.el.classList.remove('hidden');
    this.hint.textContent = this.def.hint();
    this.nodes.forEach((nd, i) => nd.classList.toggle('busy', this.isBusy(i)));
  }

  _shut() {
    this.isOpen = false;
    this.el.classList.add('hidden');
    if (RadialMenu.active === this) RadialMenu.active = null;
  }

  close(commit) {
    if (!this.isOpen) return;
    const sel = this.sel;
    this._shut();
    if (commit && sel >= 0) this.choose(sel);
  }

  choose(i) {
    this._shut();
    if (this.isBusy(i)) {
      ctx.ui.toast('Bu ses hâlâ çalıyor; bitince tekrar basabilirsin.', 1800);
      return;
    }
    this.def.onChoose(i, this.items[i]);
  }

  update() {
    const input = ctx.input;
    const down = input.isDown(this.def.key());
    if (down && !this.isOpen) this.open();
    if (!this.isOpen) return;
    if (!this.def.canUse()) {
      this.close(false);
      return;
    }
    const look = input.consumeLook();
    this.cx += look.x;
    this.cy += look.y;
    const R = RADIUS * sc();
    const len = Math.hypot(this.cx, this.cy);
    if (len > R) {
      this.cx *= R / len;
      this.cy *= R / len;
    }
    this.cursor.style.transform = `translate(${this.cx}px, ${this.cy}px)`;
    let sel = -1;
    if (len > DEAD_ZONE * sc() && this.angles.length) {
      // imlece açısal olarak en yakın öğe
      const ang = Math.atan2(this.cy, this.cx);
      let best = Infinity;
      this.angles.forEach((a, i) => {
        let d = Math.abs(ang - a) % TAU;
        if (d > Math.PI) d = TAU - d;
        if (d < best) {
          best = d;
          sel = i;
        }
      });
    }
    this.sel = sel;
    this.nodes.forEach((nd, i) => {
      const busy = this.isBusy(i);
      nd.classList.toggle('busy', busy);
      nd.classList.toggle('sel', i === sel && !busy);
    });
    if (!down) this.close(true);
  }
}

RadialMenu.active = null;
