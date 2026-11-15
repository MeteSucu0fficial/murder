// Debug / TrollHacks paneli. İki kullanım, tek panel:
//  • DEBUG ODASI (yalnızca host): rol değiştir, bot ekle / sil, turu yenile + seçili oyuncu işlemleri.
//  • NORMAL OYUN: konsola  TrollHacks.enabled = true;  yazan herkes (host izin veriyorsa) aynı paneli açar; BOT EKLEME / tur yenileme / lobi yoktur (bkz. troll.js).
// Seçili oyuncu işlemleri: noclip · görünmezlik · ölümsüzlük · susturma · öldür · diriltme (doğma noktasında / cesedinde) · patlat · yanına git ·
// önüme getir · ekrana yazı (ona / herkese) · gizli eşya ver (roketatar, bomba, plazma tüfeği: slot 3, 4, 5 verilme sırasına göre).
// Ayrıca X-ray (duvar arkasındaki oyuncular + roller) ve çarpışma görünümü (eski F3 tuşu kaldırıldı: yalnızca bu panelde).
//  • Debug tuşu (varsayılan F2) paneli açar / kapatır. Açıkken fare serbesttir, kamera olduğu yerde durur.
//  • Her oyuncunun yanında oyun içi kimliği yazar: renk noktası + NATO adı (gerçek adı soluk).
//  • İşlemler TrollHacks.op ile gider: host'ta doğrudan uygulanır, misafirde host'a istek olur (roller / durumlar host'tan gelir).
import { GAME_CONFIG, KEYS } from './config.js';
import { ctx } from './context.js';
import { keyLabel } from './keybinds.js';
import { ROLES } from './roles.js';
import { TrollHacks } from './troll.js';
import { colorCss, h, isBotId, store } from './util.js';

/** Debug rol seçicilerinin sırası (lobi, menü ve panel aynı listeyi kullanır). */
export const DEBUG_ROLE_ORDER = ['civilian', 'killer', 'mafia', 's2g', 'detective', 'civilPolice', 'escort', 'sleepwalker', 'bomber', 'medium'];
export const DEBUG_ROLE_OPTIONS = DEBUG_ROLE_ORDER.map((r) => [r, ROLES[r].name]);

export class DebugPanel {
  constructor(root) {
    this.open = false;
    this.sig = '';
    this.t = 0;
    this.botRole = store.get('debugBotRole', 'civilian');
    this.target = null; // seçili oyuncu (işlemler ona uygulanır)
    this.reviveAt = store.get('debugReviveAt', 'spawn'); // 'spawn' | 'corpse'
    this.text = ''; // ekrana yazılacak metin (panel yenilense de kalır)
    this.el = h('div', { class: 'debug-panel hidden' });
    root.appendChild(this.el);

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.open) {
        this.hide();
        return;
      }
      if (e.code !== KEYS.debug || e.repeat) return;
      const inPanel = this.el.contains(e.target);
      const tag = e.target?.tagName;
      if (!inPanel && (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')) return; // sohbet yazarken tetikleme
      if (this.open) {
        e.preventDefault();
        this.hide();
        return;
      }
      if (!this.available() || ctx.ui.modalOpen()) return;
      e.preventDefault();
      this.show();
    });
  }

  /** Panel yalnızca tur sürerken ve yetkiliyken açılır: debug odasının host'u ya da TrollHacks açık oyuncu (host izin veriyorsa). */
  available() {
    return !!(ctx.me && (ctx.phase === 'playing' || ctx.phase === 'ended') && TrollHacks.usable);
  }

  show() {
    if (this.open || !this.available()) return;
    this.open = true;
    this.sig = '';
    this.render();
    ctx.ui.openModal('debug', this.el);
  }

  hide(relock = true) {
    if (!this.open) return;
    this.open = false;
    ctx.ui.closeModal('debug');
    if (relock) ctx.ui.relock();
  }

  /** Açıkken oyuncu / rol / can durumu değişirse listeyi tazeler (seçim kutusu açıkken bozmaz). */
  update(dt) {
    if (!this.open) return;
    if (!this.available()) {
      this.hide(false);
      return;
    }
    this.t += dt;
    if (this.t < 0.4) return;
    this.t = 0;
    const typing = this.el.contains(document.activeElement) && ['SELECT', 'INPUT'].includes(document.activeElement.tagName);
    if (this.signature() !== this.sig && !typing) this.render(); // seçim kutusu / metin kutusu açıkken bozma
  }

  rows() {
    return ctx.room?.players || [];
  }

  signature() {
    const rows = this.rows().map((p) => {
      const i = TrollHacks.infoOf(p.id);
      const f = i ? `${i.god ? 1 : 0}${i.ghost ? 1 : 0}${i.noclip ? 1 : 0}${i.mute ? 1 : 0}` : '';
      return `${p.id}:${i?.role || ''}:${i?.alive ? 1 : 0}:${f}:${(i?.items || []).join('+')}:${ctx.players.get(p.id)?.identity?.label || ''}`;
    });
    return `${rows.join('|')}|${TrollHacks.xray ? 1 : 0}${ctx.world.collision.debugOn ? 1 : 0}`;
  }

  roleSelect(cur, onChange, cls = '') {
    const s = h('select', { class: `input mini ${cls}`.trim() }, DEBUG_ROLE_OPTIONS.map(([v, t]) => h('option', { value: v }, t)));
    s.value = cur;
    s.onchange = () => onChange(s.value);
    return s;
  }

  btn(text, onclick, cls = '') {
    return h('button', { type: 'button', class: `btn small ${cls}`.trim(), onclick }, text);
  }

  // ------------------------------------------------------------------ oyun içi kimlik (NATO adı + renk)
  /** Satır başlığı: renk noktası + NATO adı (kalın) + gerçek ad (soluk). */
  nameTag(p) {
    const idn = ctx.players.get(p.id)?.identity;
    const real = `${p.name}${p.id === ctx.myId ? ' (sen)' : ''}`;
    return h('span', { class: 'dbg-name', title: idn?.label ? `${idn.label} · ${idn.colorName || ''} · ${real}` : real },
      p.bot || isBotId(p.id) ? '🤖 ' : '',
      idn?.color != null ? h('i', { class: 'dbg-dot', style: { background: colorCss(idn.color) } }) : null, // kimlik rengi sayı (0xRRGGBB)
      idn?.label ? h('b', {}, idn.label) : null,
      h('span', { class: idn?.label ? 'dbg-real' : '' }, real));
  }

  /** <option> için düz metin: "🤖 Alpha (Kırmızı) — Mete (sen)". */
  plainName(p) {
    const idn = ctx.players.get(p.id)?.identity;
    return `${p.bot || isBotId(p.id) ? '🤖 ' : ''}${idn?.label ? `${idn.label}${idn.colorName ? ` (${idn.colorName})` : ''} — ` : ''}${p.name}${p.id === ctx.myId ? ' (sen)' : ''}`;
  }

  // ------------------------------------------------------------------ seçili oyuncu işlemleri
  /** Seçili oyuncuya uygulanan işlemler: işaretler, öldür / diriltme / patlat, ışınlama, ekran yazısı, gizli eşyalar. */
  targetBlock() {
    const rows = this.rows();
    if (!rows.some((p) => p.id === this.target)) this.target = ctx.myId;
    const id = this.target;
    const inf = TrollHacks.infoOf(id);
    const items = inf?.items || [];
    const done = (fn) => () => {
      fn();
      this.render();
    };

    const sel = h('select', { class: 'input mini dbg-target' }, rows.map((p) => h('option', { value: p.id }, this.plainName(p))));
    sel.value = id;
    sel.onchange = () => {
      this.target = sel.value;
      this.render();
    };

    const flag = (key, label) => {
      const on = !!inf?.[key];
      return this.btn(`${label}: ${on ? 'açık' : 'kapalı'}`, done(() => TrollHacks.op('flag', id, key, !on)), on ? 'on' : '');
    };

    const at = h('select', { class: 'input mini' }, [
      h('option', { value: 'spawn' }, 'Diriltme: doğma noktasında'),
      h('option', { value: 'corpse' }, 'Diriltme: cesedinde (ceset yok olur)'),
    ]);
    at.value = this.reviveAt;
    at.onchange = () => {
      this.reviveAt = at.value;
      store.set('debugReviveAt', at.value);
    };

    const text = h('input', { class: 'input mini', type: 'text', maxlength: '160', placeholder: 'Ekrana yazılacak metin…' });
    text.value = this.text;
    text.oninput = () => {
      this.text = text.value;
    };
    const send = (toId) => {
      if (!this.text.trim()) ctx.ui.toast('Önce bir metin yaz.');
      else TrollHacks.op('text', toId, this.text, 6);
    };

    const item = (key) => {
      const i = items.indexOf(key);
      const name = GAME_CONFIG.equipment[key].name;
      return this.btn(i >= 0 ? `${name} [${keyLabel(KEYS[`slot${i + 3}`])}] ✓` : name, done(() => TrollHacks.op('give', id, key, i < 0)), i >= 0 ? 'on' : '');
    };

    return [
      h('h4', {}, 'Seçili oyuncu'),
      sel,
      h('div', { class: 'dbg-actions' }, flag('noclip', 'Noclip'), flag('ghost', 'Görünmez')),
      h('div', { class: 'dbg-actions' }, flag('god', 'Ölümsüz'), flag('mute', 'Susturma')),
      h('div', { class: 'dbg-actions' },
        this.btn('Öldür', done(() => TrollHacks.op('kill', id)), 'danger'),
        this.btn('Patlat', done(() => TrollHacks.op('explode', id)), 'danger'),
        this.btn('Diriltme', done(() => TrollHacks.op('revive', id, at.value)))),
      h('div', { class: 'dbg-add' }, at),
      h('div', { class: 'dbg-actions' },
        this.btn('Yanına git', done(() => (id === ctx.myId ? ctx.ui.toast('Kendi yanına gidemezsin.') : TrollHacks.op('goto', id)))),
        this.btn('Önüme getir', done(() => (id === ctx.myId ? ctx.ui.toast('Kendini getiremezsin.') : TrollHacks.op('bring', id))))),
      h('div', { class: 'dbg-text' }, text),
      h('div', { class: 'dbg-actions' }, this.btn('Ona yaz', () => send(id)), this.btn('Herkese yaz', () => send(null))),
      h('h4', {}, 'Gizli eşyalar (slot sırası verilme sırasına göre)'),
      h('div', { class: 'dbg-actions' }, item('rocket'), item('bomb'), item('plasma')),
    ];
  }

  // ------------------------------------------------------------------ bot bölümü (yalnızca debug odası)
  botBlock() {
    const host = ctx.host;
    const botCount = this.rows().filter((p) => p.bot || isBotId(p.id)).length;
    const botSel = this.roleSelect(this.botRole, (r) => {
      this.botRole = r;
      store.set('debugBotRole', r);
    });
    return [
      h('h4', {}, `Bot ekle (${botCount}/${GAME_CONFIG.debug.maxBots})`),
      h('div', { class: 'dbg-add' }, botSel),
      h('div', { class: 'dbg-actions' },
        this.btn('Baktığım yere ekle', () => this.addAtCrosshair(botSel.value), 'primary'),
        this.btn('Rastgele noktaya', () => {
          this.botRole = botSel.value;
          host.debugSpawnBot({ role: botSel.value });
          this.render();
        })),
      h('div', { class: 'dbg-actions' },
        this.btn('Botları sil', () => { host.debugClearBots(); this.render(); }, 'danger'),
        this.btn('Turu yenile', () => { host.debugRestart(); this.hide(); })),
    ];
  }

  // ------------------------------------------------------------------ çizim
  render() {
    const dbg = TrollHacks.debugRoom;
    this.sig = this.signature();
    const col = !!ctx.world.collision.debugOn;

    const players = this.rows().map((p) => {
      const i = TrollHacks.infoOf(p.id);
      const bot = !!p.bot || isBotId(p.id);
      const cur = i?.role || (ctx.isHost ? ctx.host.state.debugRoles?.[p.id] : null) || 'civilian';
      const alive = i ? i.alive : !!ctx.players.get(p.id)?.alive;
      return h('div', { class: `dbg-row${p.id === ctx.myId ? ' me' : ''}` },
        this.nameTag(p),
        h('span', { class: `dbg-st ${alive ? 'alive' : 'dead'}`, title: alive ? 'Hayatta' : 'Ölü' }, alive ? '✔' : '☠'),
        this.roleSelect(cur, (r) => TrollHacks.op('role', p.id, r)),
        dbg && bot ? this.btn('Sil', () => { ctx.host.debugRemoveBot(p.id); this.render(); }, 'danger') : null);
    });

    const hint = dbg
      ? `Seçili oyuncu işlemleri botlara da uygulanır. Noclip: duvarlardan geçerek uç (${keyLabel(KEYS.jump)}: yüksel, ${keyLabel(KEYS.crouch)}: alçal, ${keyLabel(KEYS.run)}: hızlı). `
        + 'Rol değişikliği anında uygulanır. Botlar hareket etmez; vurulunca ölür ve ceset bırakır. "Turu yenile": herkes dirilir. '
        + '"Çarpışma görünümü": oyuncunun gerçekten çarptığı yüzeyleri görünür yapar (yarı saydam turuncu: duvar / zemin, mavi tel kafes: kapı / tablo / hareketli duvar). '
        + 'Bir duvarın turuncu dolgusu YOKSA o duvardan geçilir: Blender\'da ona Collision_ ekle. "X-ray": duvar arkasındaki oyuncuları ve rollerini gösterir.'
      : `TrollHacks açık: işlemleri host uygular. Noclip: duvarlardan geçerek uç (${keyLabel(KEYS.jump)}: yüksel, ${keyLabel(KEYS.crouch)}: alçal, ${keyLabel(KEYS.run)}: hızlı). `
        + '"X-ray": duvar arkasındaki oyuncuları ve rollerini gösterir. Kapatmak için konsola TrollHacks.enabled = false; yaz.';

    this.el.replaceChildren(
      h('div', { class: 'dbg-head' },
        h('strong', {}, dbg ? 'Debug paneli' : 'TrollHacks'),
        h('span', { class: 'dbg-key' }, keyLabel(KEYS.debug)),
        h('button', { type: 'button', class: 'dbg-x', title: 'Kapat', onclick: () => this.hide() }, '×')),
      ...this.targetBlock(),
      h('h4', {}, 'Oyuncular ve roller'),
      h('div', { class: 'dbg-list' }, players),
      ...(dbg ? this.botBlock() : []),
      h('h4', {}, 'Görünüm'),
      h('div', { class: 'dbg-actions' },
        this.btn(`X-ray: ${TrollHacks.xray ? 'açık' : 'kapalı'}`, () => { TrollHacks.xray = !TrollHacks.xray; this.render(); }, TrollHacks.xray ? 'on' : ''),
        this.btn(`Çarpışma görünümü: ${col ? 'açık' : 'kapalı'}`, () => { ctx.world.setCollisionView(!col); this.render(); }, col ? 'on' : '')),
      h('div', { class: 'dbg-actions' },
        this.btn('Harita raporu (konsol)', () => { ctx.world.logReport(); ctx.ui.toast('Harita raporu konsola yazıldı (F12 → Console).', 3500); }),
        dbg ? this.btn('Lobiye dön', () => { this.hide(false); ctx.host.backToLobby(); }) : null),
      h('p', { class: 'hint' }, hint),
    );
  }

  // ------------------------------------------------------------------ bot yerleştirme (debug odası)
  /** Nişangâhın baktığı yerin zemin noktası (duvara / tavana bakıyorsan altındaki zemin). Bulunamazsa null. */
  aimPoint() {
    const mv = ctx.movement;
    const col = ctx.world.collision;
    const hit = col.raycast(mv.eye, mv.lookDir, 40);
    if (!hit) return null;
    const p = hit.point.clone();
    if (hit.normal && hit.normal.y > 0.5) return p; // zemine bakıyorum
    if (hit.normal) p.addScaledVector(hit.normal, 0.5); // yüzeyden biraz açıl, sonra zemine in
    const y = col.floorAt(p.x, p.y, p.z, 0.6, 4);
    if (y == null) return null;
    p.y = y;
    return p;
  }

  addAtCrosshair(role) {
    this.botRole = role;
    store.set('debugBotRole', role);
    const pt = this.aimPoint();
    if (!pt) {
      ctx.ui.toast('Baktığın yerde zemin bulunamadı: yere ya da bir duvara bak.');
      return;
    }
    const me = ctx.me;
    const yaw = Math.atan2(me.pos.x - pt.x, me.pos.z - pt.z); // bot bana dönük dursun
    const id = ctx.host.debugSpawnBot({ role, pos: [pt.x, pt.y, pt.z], yaw });
    if (id) this.render();
  }
}
