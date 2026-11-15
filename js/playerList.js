// TAB oyuncu listesi + katil için sol tık "Baiter ver" menüsü.
//  • TAB basılı → liste açılır, bırakınca kapanır. Gerçek kullanıcı adları burada görünür (oyun içinde karakterlerin üstünde asla).
//  • Bu listede KİMSENİN ROLÜ GÖRÜNMEZ (ne rol, ne Baiter, ne sevgili etiketi; ölüler ve tur sonunda da): yalnızca ad, konuşma ışığı ve durum.
//    Kendi rollerin sağ alttaki HUD'da, tur başı ekranında ve tur sonu tablosunda görünür.
//  • Katil bir satıra SOL tıklarsa küçük menü çıkar: "Baiter ver" (tur başına yalnızca 1 kez, geri alınamaz).
//    Liste açıkken fare tıklaması oyuna geçmez (bıçak savurma, eşya fırlatma vb. tetiklenmez).
//  • İmleç kilitliyken sanal imleç kullanılır; menü açılınca imleç serbest kalır.
import { KEYS } from './config.js';
import { ctx } from './context.js';
import { MOUSE_LEFT, MOUSE_RIGHT } from './input.js';
import { h } from './util.js';

export class PlayerList {
  constructor(root) {
    this.title = h('div', { class: 'plist-title' });
    this.body = h('div', { class: 'plist-body' });
    this.hint = h('div', { class: 'plist-hint' });
    this.panel = h('div', { class: 'plist hidden' }, this.title, this.body, this.hint);
    this.menu = h('div', { class: 'plist-menu hidden' });
    this.vcursor = h('div', { class: 'vcursor hidden' });
    root.append(this.panel, this.menu, this.vcursor);
    this.shown = false;
    this.sticky = false; // Baiter menüsü açıkken: liste TAB'a bağlı olmadan açık kalır
    this.cx = window.innerWidth / 2;
    this.cy = window.innerHeight / 2;
    this.rows = new Map(); // id -> { el, talk }
    this.hoverId = null;
    this.t = 0;
    document.addEventListener('mousedown', (e) => {
      if (this.sticky && !this.menu.contains(e.target) && !this.menu.classList.contains('hidden')) this.closeMenu(true);
    });
  }

  // ------------------------------------------------------------------ veri
  participants() {
    return ctx.roundIds || new Set();
  }

  statusOf(id) {
    if (ctx.phase === 'lobby') return { text: 'Lobide', cls: 'lobby' };
    if (!this.participants().has(id)) return { text: 'İzleyici', cls: 'spec' };
    return ctx.players.get(id)?.alive ? { text: 'Hayatta', cls: 'alive' } : { text: 'Ölü', cls: 'dead' };
  }

  canGiveBaiter(id) {
    return (
      ctx.phase === 'playing' && ctx.role?.id === 'killer' && !!ctx.me?.alive && !ctx.me_state.baiterUsed &&
      id !== ctx.myId && !!ctx.players.get(id)?.alive && this.participants().has(id)
    );
  }
  /** Menü hiç çıksın mı? (yalnızca katil görür) */
  menuAllowed(id) {
    return ctx.phase === 'playing' && ctx.role?.id === 'killer' && !!ctx.me?.alive && id !== ctx.myId && this.participants().has(id);
  }

  // ------------------------------------------------------------------ çizim
  refresh() {
    if (!ctx.room) return;
    this.title.textContent = `Oyuncular — Oda ${ctx.room.code}`;
    this.rows.clear();
    this.body.replaceChildren();
    const isKiller = ctx.role?.id === 'killer' && ctx.me?.alive;
    for (const pl of ctx.room.players) {
      const st = this.statusOf(pl.id);
      const talk = h('span', { class: 'pl-talk', title: 'Konuşuyor' }, '●');
      const row = h(
        'div',
        { class: `pl-row ${st.cls}${pl.id === ctx.myId ? ' me' : ''}`, 'data-id': pl.id },
        h('span', { class: 'pl-name' }, pl.bot ? '🤖 ' : '', pl.name, pl.id === ctx.myId ? h('em', {}, ' (sen)') : null, pl.id === ctx.room.hostId ? h('span', { class: 'pl-host', title: 'Host' }, ' ♛') : null),
        talk,
        h('span', { class: `pl-status ${st.cls}` }, st.text),
      );
      row.addEventListener('contextmenu', (e) => e.preventDefault());
      row.addEventListener('click', (e) => {
        if (this.menuAllowed(pl.id)) this.openMenu(pl.id, e.clientX, e.clientY); // SOL tık
      });
      this.rows.set(pl.id, { el: row, talk });
      this.body.appendChild(row);
    }
    this.hint.textContent = isKiller
      ? ctx.me_state.baiterUsed ? 'Bu tur Baiter seçtin (geri alınamaz).' : 'Bir oyuncuya sol tıkla: "Baiter ver" (tur başına 1 kez)'
      : '';
  }

  // ------------------------------------------------------------------ menü
  openMenu(id, x, y) {
    const pl = ctx.room.players.find((p) => p.id === id);
    if (!pl) return;
    this.menu.replaceChildren();
    const can = this.canGiveBaiter(id);
    const btn = h('button', { type: 'button', class: 'btn small', disabled: can ? null : true }, can ? 'Baiter ver' : (ctx.me_state.baiterUsed ? 'Baiter zaten seçildi' : 'Seçilemez'));
    btn.addEventListener('click', () => {
      ctx.client.toHost({ t: 'baiter', target: id });
      this.closeMenu(true);
    });
    this.menu.append(h('div', { class: 'plist-menu-title' }, pl.name), btn);
    this.menu.style.left = `${Math.min(x, window.innerWidth - 190)}px`;
    this.menu.style.top = `${Math.min(y, window.innerHeight - 110)}px`;
    this.menu.classList.remove('hidden');
    this.sticky = true;
    ctx.input.exitLock();
    this.vcursor.classList.add('hidden');
  }

  closeMenu(relock) {
    this.menu.classList.add('hidden');
    this.sticky = false;
    this.setShown(false);
    if (relock && ctx.phase === 'playing' && !ctx.ui.modalOpen()) ctx.input.requestLock();
  }

  setShown(v) {
    if (v === this.shown) return;
    this.shown = v;
    this.panel.classList.toggle('hidden', !v);
    if (v) {
      this.refresh();
      this.cx = window.innerWidth / 2;
      this.cy = window.innerHeight / 2;
    } else this.vcursor.classList.add('hidden');
  }

  update(dt) {
    const input = ctx.input;
    const inGame = ctx.phase === 'playing' || ctx.phase === 'ended';
    const want = inGame && (input.isDown(KEYS.list) || this.sticky);
    this.setShown(want);
    if (!this.shown) return;

    this.t += dt;
    if (this.t > 0.25) {
      this.t = 0;
      for (const [id, r] of this.rows) r.talk.classList.toggle('on', !!ctx.players.get(id)?.talking);
    }

    // imleç kilitliyken sanal imleç
    if (input.locked && !this.sticky) {
      const look = input.consumeLook();
      this.cx = Math.max(0, Math.min(window.innerWidth, this.cx + look.x));
      this.cy = Math.max(0, Math.min(window.innerHeight, this.cy + look.y));
      this.vcursor.style.transform = `translate(${this.cx}px, ${this.cy}px)`;
      this.vcursor.classList.remove('hidden');
      const el = document.elementFromPoint(this.cx, this.cy)?.closest?.('.pl-row');
      const id = el?.dataset.id || null;
      if (id !== this.hoverId) {
        this.rows.get(this.hoverId)?.el.classList.remove('hover');
        this.hoverId = id;
        this.rows.get(id)?.el.classList.add('hover');
      }
      if (id && input.wasPressed(MOUSE_LEFT) && this.menuAllowed(id)) this.openMenu(id, this.cx, this.cy);
      // liste açıkken tıklama oyuna geçmesin (bıçak savurma / fırlatma / ateş)
      input.consume(MOUSE_LEFT);
      input.consume(MOUSE_RIGHT);
    }
  }
}
