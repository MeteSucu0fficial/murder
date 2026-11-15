// Arayüz: ana menü, oda kur / katıl, lobi, oyun içi HUD, tur açılışı, tur sonu, duraklatma menüsü, ayarlar, bildirimler.
// Bütün DOM burada JavaScript ile kurulur (index.html yalnızca boş bir #ui kökü içerir); stiller style.css içindedir.
import { GAME_CONFIG, KEYS } from './config.js';
import { ctx } from './context.js';
import { audio } from './audio.js';
import { LOVER_MAX_PICK, MANDATORY_ROLES, ROLES, ROLE_MAX_PICK, ROLE_PRIORITY, SECONDARY, loverLimits, roleRanges } from './roles.js';
import { LEVEL_NAMES } from './voice.js';
import { buildFallbackHouse } from './fallbackHouse.js';
import { isNight } from './lights.js';
import { DEBUG_ROLE_OPTIONS } from './debug.js';
import { KEY_ACTIONS, actionLabel, keyLabel, resetKeys, setKey } from './keybinds.js';
import { h, fmtTime, store, isBotId, colorCss } from './util.js';

const ABILITY_NAMES = { sleepwalker: 'Uyurgezerlik', bomber: 'Kendini patlat', medium: 'Medyum bağlantısı', s2g: 'S2G (sik)' };
// Tuş atama sırasında atanamayacak tarayıcı / sistem tuşları
const BLOCKED_KEYS = new Set(['F5', 'F11', 'F12', 'MetaLeft', 'MetaRight', 'OSLeft', 'OSRight', 'ContextMenu']);
const CAUSE_NAMES = {
  knife: 'bıçakla', knifeThrow: 'fırlatılan bıçakla', rifle: 'taramalıyla', pistol: 'tabancayla', taser: 'elektroşokla',
  bomb: 'bombayla', execution: 'idam bölgesinde', lover: 'sevgilin öldüğü için', left: 'bağlantı kesildiği için', s2g: 'S2G ile',
  rocket: 'roketatarla', plasma: 'plazma tüfeğiyle', debug: 'host tarafından',
};
const MODE_NAMES = { voice: 'Sesli mod', silent: 'Sessiz mod' };

export class UI {
  constructor(root) {
    this.root = root;
    this.modals = new Map(); // ad -> element
    this.promptKey = null;
    this.promptLabel = null;
    this.endAt = 0;
    this.msgTimer = null;
    this.chooseResolve = null;
    this.settingsTab = 'general';
    this.keyCapture = null; // tuş atama sırasında dinlenen eylem
    this.meterFill = null; // ayarlar > mikrofon seviye çubuğu
    this.meterRaf = 0;
    this.rolesOpen = false; // lobideki "Rol ayarları" açık mı
    this.lastBotRole = null;
    this.crosshairOn = false;

    this.buildHud();
    this.buildMenu();
    this.buildLobby();
    this.buildOverlays();
    this.toasts = h('div', { class: 'toasts' });
    this.bannerEl = h('div', { class: 'banner hidden' });
    this.damageEl = h('div', { class: 'damage' });
    this.flashEl = h('div', { class: 'blast-flash' }); // patlama ışığı (PointLight yerine ekran flaşı: gölge/shader yeniden derleme maliyeti yok)
    this.screenTextEl = h('div', { class: 'screen-text hidden' }); // debug: host'un ekrana yazdığı yazı
    this.screenTextTimer = 0;
    root.append(this.toasts, this.bannerEl, this.damageEl, this.flashEl, this.screenTextEl);
  }

  attach(_net) {}

  // ================================================================== yardımcılar
  field(label, control, hint) {
    return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control, hint ? h('small', {}, hint) : null);
  }
  btn(text, onclick, cls = '') {
    return h('button', { type: 'button', class: `btn ${cls}`.trim(), onclick }, text);
  }
  select(options, value) {
    const s = h('select', { class: 'input' }, options.map(([v, t]) => h('option', { value: String(v) }, t)));
    s.value = String(value);
    return s;
  }
  check(label, checked) {
    const c = h('input', { type: 'checkbox' });
    c.checked = !!checked;
    return { el: h('label', { class: 'check' }, c, h('span', {}, label)), input: c };
  }

  modalOpen() {
    return this.modals.size > 0;
  }
  openModal(name, el) {
    this.closeModal(name);
    this.modals.set(name, el);
    el.classList.remove('hidden');
    ctx.input?.exitLock();
    this.syncInput();
  }
  closeModal(name) {
    const el = this.modals.get(name);
    if (!el) return;
    if (name === 'settings') this.onSettingsClosed();
    el.classList.add('hidden');
    this.modals.delete(name);
    this.syncInput();
  }
  syncInput() {
    if (ctx.input) ctx.input.enabled = !this.modalOpen();
  }
  relock() {
    if (!this.modalOpen() && (ctx.phase === 'playing' || ctx.phase === 'ended')) ctx.input.requestLock();
  }

  // ================================================================== bildirimler
  toast(text, ms = 2600) {
    const el = h('div', { class: 'toast' }, text);
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
    setTimeout(() => el.classList.add('out'), ms);
    setTimeout(() => el.remove(), ms + 400);
  }

  /** Ekran üstü bildirim. sub: ikinci (küçük) satır. */
  banner(text, ms = 2500, kind = '', sub = '') {
    this.bannerEl.replaceChildren(text, ...(sub ? [h('small', {}, sub)] : []));
    this.bannerEl.className = `banner ${kind}`;
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => this.bannerEl.classList.add('hidden'), ms);
  }

  /** Debug: host'un yolladığı büyük ekran yazısı (ms sonra kaybolur). */
  screenText(text, ms = 6000) {
    this.screenTextEl.textContent = text;
    this.screenTextEl.classList.remove('hidden');
    this.screenTextEl.classList.remove('pop');
    void this.screenTextEl.offsetWidth;
    this.screenTextEl.classList.add('pop');
    clearTimeout(this.screenTextTimer);
    this.screenTextTimer = setTimeout(() => this.screenTextEl.classList.add('hidden'), ms);
  }

  damageFlash() {
    this.damageEl.classList.remove('on');
    void this.damageEl.offsetWidth;
    this.damageEl.classList.add('on');
  }

  /** Patlama flaşı: strength 0..1 (yakınsa güçlü). Turuncu-beyaz ekran parlaması hızla söner. */
  flashScreen(strength = 1) {
    const s = Math.max(0, Math.min(1, strength));
    if (s < 0.05) return;
    this.flashEl.style.setProperty('--flash', String(0.15 + 0.8 * s));
    this.flashEl.classList.remove('on');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('on');
  }

  /** Ekranın altındaki etkileşim önerisi. key: tuş KODU ("KeyE") — ekranda atanmış tuşun adı gösterilir. Boş = gizle. */
  setPrompt(key, label) {
    if (!key) {
      if (this.promptKey !== null) {
        this.promptKey = this.promptLabel = null;
        this.promptEl.classList.add('hidden');
      }
      return;
    }
    const text = keyLabel(key);
    if (text === this.promptKey && label === this.promptLabel) return;
    this.promptKey = text;
    this.promptLabel = label;
    this.promptEl.replaceChildren(h('kbd', {}, text), ' ', label);
    this.promptEl.classList.remove('hidden');
  }

  /** Nişangâh: bakılan yerde etkileşilebilir bir şey varsa belirginleşir. */
  setCrosshairActive(on) {
    if (on === this.crosshairOn) return;
    this.crosshairOn = on;
    this.crosshair.classList.toggle('active', on);
  }

  /** Bilgi penceresi. autoMs verilirse kendiliğinden kapanır ve girdiyi kilitlemez. */
  showMessage(title, text, autoMs = 0) {
    this.msgTitle.textContent = title;
    this.msgText.textContent = text;
    clearTimeout(this.msgTimer);
    this.msgBox.classList.toggle('auto', !!autoMs);
    if (autoMs) {
      this.msgBox.classList.remove('hidden');
      this.msgTimer = setTimeout(() => this.msgBox.classList.add('hidden'), autoMs);
    } else this.openModal('message', this.msgBox);
  }

  /** Seçim penceresi: seçilen değeri (veya iptalde null) döndürür. */
  choose(title, options) {
    return new Promise((resolve) => {
      const done = (v) => {
        this.closeModal('choose');
        this.relock();
        resolve(v);
      };
      this.chooseBox.replaceChildren(
        h('div', { class: 'panel' },
          h('h3', {}, title),
          h('div', { class: 'choose-list' }, options.map((o) => this.btn(o.label, () => done(o.value)))),
          this.btn('Vazgeç', () => done(null), 'ghost')),
      );
      this.openModal('choose', this.chooseBox);
    });
  }

  // ================================================================== ana menü
  buildMenu() {
    this.nameInput = h('input', { class: 'input', maxlength: '18', placeholder: 'Oyuncu adın', value: store.get('name', '') });
    this.menuNote = h('p', { class: 'menu-note' });
    const main = h('div', { class: 'page', 'data-page': 'main' },
      h('h1', { class: 'logo' }, 'IRGAT ', h('span', {}, 'MURDER')),
      h('p', { class: 'tagline' }, 'Evin içinde gizli rollü, arkadaşlarla oynanan cinayet oyunu'),
      this.field('Oyuncu adın', this.nameInput, 'Sadece TAB listesinde görünür.'),
      this.btn('Oda oluştur', () => this.menuPage('create'), 'primary'),
      this.btn('Odaya katıl', () => this.menuPage('join')),
      this.btn('Debug haritası (tek kişilik)', () => this.menuPage('debug')),
      this.btn('Ayarlar', () => this.openSettings()),
      this.menuNote);
    this.refreshMenuNote();

    // ---- oda oluştur ----
    this.cRoomName = h('input', { class: 'input', maxlength: '24', placeholder: 'Oda adı' });
    this.cMax = this.select(Array.from({ length: 15 }, (_, i) => [i + 2, `${i + 2} oyuncu`]), 12);
    this.cMode = 'voice';
    this.cModeBtns = [
      this.btn('Sesli mod', () => this.setCreateMode('voice')),
      this.btn('Sessiz mod', () => this.setCreateMode('silent')),
    ];
    this.cPass = h('input', { class: 'input', maxlength: '32', type: 'text', placeholder: 'İsteğe bağlı' });
    this.cTime = this.select([[0, 'Sınırsız'], [5, '5 dk'], [8, '8 dk'], [10, '10 dk'], [15, '15 dk'], [20, '20 dk']], 10);
    this.cDead = this.select([['dead', 'Yalnızca ölüler görsün'], ['all', 'Herkes görsün']], 'dead');
    this.cDebug = this.check('Debug odası (rolleri sen seç, bot ekle, tur kendiliğinden bitmesin)', false);
    const create = h('div', { class: 'page hidden', 'data-page': 'create' },
      h('h2', {}, 'Oda oluştur'),
      this.field('Oda adı', this.cRoomName),
      h('div', { class: 'row2' }, this.field('Oyuncu sınırı', this.cMax), this.field('Şifre', this.cPass)),
      this.field('Oyun modu', h('div', { class: 'seg' }, this.cModeBtns), 'Sesli: yakınlık sesi, herkes "Irgat" · Sessiz: yazılı sohbet + renkli kod adları; yalnızca Dedektif konuşabilir (mikrofon aç/kapa + bağırma)'),
      h('div', { class: 'row2' }, this.field('Tur süresi', this.cTime), this.field('Ölü sohbeti', this.cDead)),
      this.cDebug.el,
      h('p', { class: 'hint' }, 'Rol sayılarını (kaç dedektif, medyum, sevgili çifti vb.) odayı kurduktan sonra lobide "Rol ayarları"ndan ayarlayabilirsin.'),
      h('div', { class: 'row2' }, this.btn('Geri', () => this.menuPage('main'), 'ghost'), this.btn('Oluştur', () => this.submitCreate(), 'primary')));
    this.setCreateMode('voice');

    // ---- debug haritası (tek kişilik, ağsız) ----
    this.dbgRole = this.select(DEBUG_ROLE_OPTIONS, store.get('debugRole', 'civilian'));
    this.dbgBots = this.select([[0, 'Yok'], [1, '1 bot'], [2, '2 bot'], [3, '3 bot'], [5, '5 bot'], [8, '8 bot']], store.get('debugBots', 0));
    this.dbgBotRole = this.select(DEBUG_ROLE_OPTIONS, store.get('debugBotRole', 'civilian'));
    const debug = h('div', { class: 'page hidden', 'data-page': 'debug' },
      h('h2', {}, 'Debug haritası'),
      h('p', { class: 'hint' }, 'Tek başına haritada dolaş: internet gerekmez, tur kendiliğinden bitmez. Rolünü sen seçersin; hareketsiz botlar ekleyip silahları, yetenekleri ve etkileşimleri deneyebilirsin.'),
      this.field('Rolün', this.dbgRole),
      h('div', { class: 'row2' }, this.field('Başlangıç botları', this.dbgBots), this.field('Botların rolü', this.dbgBotRole)),
      h('p', { class: 'hint' }, 'Oyundayken debug paneli (rol değiştir, bot ekle/sil, turu yenile) için debug tuşuna bas; varsayılan: F2.'),
      h('div', { class: 'row2' }, this.btn('Geri', () => this.menuPage('main'), 'ghost'), this.btn('Haritaya gir', () => this.submitDebug(), 'primary')));

    // ---- odaya katıl ----
    this.jCode = h('input', { class: 'input code', maxlength: '8', placeholder: 'ODA KODU', autocapitalize: 'characters' });
    this.jPass = h('input', { class: 'input', maxlength: '32', placeholder: 'Şifre (varsa)' });
    const join = h('div', { class: 'page hidden', 'data-page': 'join' },
      h('h2', {}, 'Odaya katıl'),
      this.field('Arkadaşının verdiği oda kodu', this.jCode, 'Oda sahibi oyunu açtıktan sonra lobide görünen kodu girmelisin.'),
      this.field('Şifre', this.jPass, 'Oda şifreliyse doldur.'),
      h('div', { class: 'row2' }, this.btn('Geri', () => this.menuPage('main'), 'ghost'), this.btn('Katıl', () => this.submitJoin(), 'primary')));

    this.pages = { main, create, join, debug };
    this.menuScreen = h('div', { class: 'screen menu-screen' }, h('div', { class: 'panel menu-panel' }, main, create, join, debug));
    this.root.appendChild(this.menuScreen);
  }

  /** Ana menü alt notu: atanmış tuşları gösterir (Ayarlar'dan değişince güncellenir). */
  refreshMenuNote() {
    const k = (id) => keyLabel(KEYS[id]);
    this.menuNote.textContent =
      `${k('forward')}${k('left')}${k('back')}${k('right')} hareket · ${k('jump')} zıpla · ${k('run')} koş · ${k('interact')} etkileşim / eşya al · ` +
      `${k('hand')}/${k('equip')} el/ekipman · ${k('ability')} yetenek · ${k('flashlight')} fener · ${k('radial')} ses menüsü · ${k('talkLevel')} ses seviyesi (basılı tut) · ${k('list')} liste · ` +
      `${k('ptt')} bas-konuş · ${k('chat')} sohbet · Tuşlar Ayarlar'dan değiştirilebilir`;
  }

  setCreateMode(m) {
    this.cMode = m;
    this.cModeBtns[0].classList.toggle('active', m === 'voice');
    this.cModeBtns[1].classList.toggle('active', m === 'silent');
  }

  menuPage(name) {
    for (const [k, el] of Object.entries(this.pages)) el.classList.toggle('hidden', k !== name);
    if (name === 'create' && !this.cRoomName.value) this.cRoomName.value = `${this.nameInput.value.trim() || 'Benim'} odası`;
  }

  prefillJoin(code) {
    this.menuPage('join');
    this.jCode.value = String(code).toUpperCase();
  }

  requireName() {
    const name = this.nameInput.value.trim();
    if (!name) {
      this.toast('Önce bir oyuncu adı gir.');
      this.nameInput.focus();
      return null;
    }
    store.set('name', name);
    return name;
  }

  async submitCreate() {
    const name = this.requireName();
    if (!name) return;
    audio.unlock();
    const debug = this.cDebug.input.checked;
    const room = {
      name: this.cRoomName.value.trim() || `${name} odası`,
      maxPlayers: Number(this.cMax.value),
      mode: this.cMode,
      password: this.cPass.value.trim(),
      settings: {
        roundTime: debug ? 0 : Number(this.cTime.value) * 60,
        deadChat: this.cDead.value,
        debug,
      },
    };
    try {
      await ctx.net.create(name, room);
    } catch (e) {
      this.toast(e?.message || 'P2P oda oluşturulamadı.');
    }
  }

  /** Debug haritası: ağsız tek kişilik oda kurar, rolü ve botları ayarlar, turu hemen başlatır. */
  submitDebug() {
    const name = this.requireName();
    if (!name) return;
    audio.unlock();
    const role = this.dbgRole.value;
    const bots = Number(this.dbgBots.value);
    const botRole = this.dbgBotRole.value;
    store.set('debugRole', role);
    store.set('debugBots', bots);
    store.set('debugBotRole', botRole);
    ctx.net.createLocal(name, { name: 'Debug Haritası', settings: { debug: true, roundTime: 0, deadChat: 'all' } });
    const host = ctx.host; // 'joined' olayı eşzamanlı: HostGame hazır
    if (!host) {
      this.toast('Debug haritası kurulamadı.');
      return;
    }
    host.debugSetRole(ctx.myId, role);
    for (let i = 0; i < bots; i++) host.debugSpawnBot({ role: botRole });
    if (!host.startGame()) this.toast('Debug turu başlatılamadı.');
  }

  async submitJoin() {
    const name = this.requireName();
    if (!name) return;
    const code = this.jCode.value.trim().toUpperCase();
    if (!code) {
      this.toast('Oda kodunu gir.');
      return;
    }
    audio.unlock();
    try {
      await ctx.net.join(name, code, this.jPass.value.trim());
    } catch (e) {
      this.toast(e?.message || 'Odaya bağlanılamadı. Kod ve internet bağlantısını kontrol et.');
    }
  }


  showMenu() {
    ctx.phase = 'menu';
    this.menuScreen.classList.remove('hidden');
    this.lobbyScreen.classList.add('hidden');
    this.hud.classList.add('hidden');
    for (const name of [...this.modals.keys()]) this.closeModal(name);
    this.hideEnd();
    this.hideRoundIntro();
    this.deadBar.classList.add('hidden');
    this.pause.classList.add('hidden');
    this.setPrompt(null);
    this.setCrosshairActive(false);
    ctx.chat?.hide();
    ctx.debug?.hide(false);
    ctx.input?.exitLock();
    this.menuPage('main');
    this.refreshMenuNote();
    this.syncInput();
  }

  // ================================================================== lobi
  buildLobby() {
    this.lobbyInfo = h('div', { class: 'lobby-info' });
    this.lobbySettings = h('div', { class: 'lobby-settings' });
    this.lobbyPlayers = h('div', { class: 'lobby-players' });
    this.startBtn = this.btn('Oyunu başlat', () => this.startGame(), 'primary big');
    this.lobbyHint = h('p', { class: 'hint' });
    this.lobbyScreen = h('div', { class: 'screen lobby-screen hidden' },
      h('div', { class: 'lobby-grid' },
        h('div', { class: 'panel' }, h('h2', {}, 'Lobi'), this.lobbyInfo, this.lobbySettings, this.startBtn, this.lobbyHint,
          this.btn('Odadan çık', () => ctx.client.leave(), 'ghost')),
        h('div', { class: 'panel' }, h('h2', {}, 'Oyuncular'), this.lobbyPlayers)));
    this.root.appendChild(this.lobbyScreen);
  }

  startGame() {
    if (!ctx.isHost) return;
    audio.unlock();
    if (!ctx.host.startGame()) this.toast(`En az ${ctx.host.debug ? 1 : GAME_CONFIG.minPlayersToStart} oyuncu gerekli.`);
  }

  showLobby() {
    ctx.phase = 'lobby';
    this.menuScreen.classList.add('hidden');
    this.lobbyScreen.classList.remove('hidden');
    this.hud.classList.add('hidden');
    this.deadBar.classList.add('hidden');
    this.pause.classList.add('hidden');
    this.setPrompt(null);
    ctx.chat?.show();
    ctx.input?.exitLock();
    this.refreshLobby();
    this.syncInput();
  }

  hideLobby() {
    this.lobbyScreen.classList.add('hidden');
    this.menuScreen.classList.add('hidden');
  }

  refreshLobby() {
    const room = ctx.room;
    if (!room || this.lobbyScreen.classList.contains('hidden')) {
      ctx.playerList?.refresh();
      return;
    }
    const me = ctx.myId;
    const host = ctx.isHost;
    const S = room.settings || {};
    const debug = !!S.debug;
    this.lobbyInfo.replaceChildren(
      h('div', { class: 'code-big', title: 'Kopyalamak için tıkla', onclick: () => this.copyCode() }, room.code),
      h('div', { class: 'meta' }, `${room.name} · ${MODE_NAMES[room.mode] || room.mode} · ${room.players.length}/${room.max}${room.locked ? ' · 🔒' : ''}${debug ? ' · DEBUG' : ''}`),
      h('div', { class: 'meta' }, host ? 'Host sensin' : `Host: ${this.nameOfPlayer(room.hostId)}`),
    );

    if (debug) {
      this.lobbySettings.replaceChildren(
        h('p', { class: 'note' }, host
          ? `Debug odası: oyuncu ve bot rollerini sağdaki listeden seç. Tur kendiliğinden bitmez; oyundayken ${keyLabel(KEYS.debug)} debug panelini açar.`
          : 'Debug odası: host rolleri ve botları ayarlıyor. Tur kendiliğinden bitmez.'));
    } else if (host) {
      const time = this.select([[0, 'Sınırsız'], [300, '5 dk'], [480, '8 dk'], [600, '10 dk'], [900, '15 dk'], [1200, '20 dk']], S.roundTime ?? GAME_CONFIG.rounds.roundTime);
      const dead = this.select([['dead', 'Yalnızca ölüler görsün'], ['all', 'Herkes görsün']], S.deadChat || 'dead');
      // TrollHacks: misafirler konsola "TrollHacks.enabled = true;" yazıp F2 araçlarını kullanabilsin mi? (host kendi konsolundan hep açabilir)
      const troll = this.select([['1', 'Misafirler açabilir'], ['0', 'Kapalı']], S.troll === false ? '0' : '1');
      const apply = () => ctx.host.setSettings({ roundTime: Number(time.value), deadChat: dead.value, troll: troll.value !== '0' });
      time.onchange = dead.onchange = troll.onchange = apply;
      this.lobbySettings.replaceChildren(
        h('div', { class: 'row2' }, this.field('Tur süresi', time), this.field('Ölü sohbeti', dead)),
        h('div', { class: 'row2' }, this.field('TrollHacks (konsol)', troll)),
        this.roleSettings(S, true));
    } else {
      const t = S.roundTime === 0 ? 'sınırsız' : `${Math.round((S.roundTime ?? GAME_CONFIG.rounds.roundTime) / 60)} dk`;
      this.lobbySettings.replaceChildren(
        h('p', { class: 'meta' }, `Tur süresi: ${t}`),
        this.roleSettings(S, false));
    }

    this.lobbyPlayers.replaceChildren(
      ...room.players.map((p) => {
        const bot = !!p.bot || isBotId(p.id);
        return h('div', { class: `lp${p.id === me ? ' me' : ''}` },
          h('span', { class: 'lp-name' }, bot ? '🤖 ' : '', p.name, p.id === me ? h('em', {}, ' (sen)') : null),
          p.id === room.hostId ? h('span', { class: 'pl-host' }, '♛ Host') : null,
          debug && host ? this.debugRoleSelect(p.id) : null,
          host && bot ? this.btn('Sil', () => ctx.host.debugRemoveBot(p.id), 'small danger') : null,
          host && !bot && p.id !== me ? this.btn('At', () => ctx.net.kick(p.id), 'small danger') : null);
      }),
      ...(debug && host ? [this.debugAddBotRow()] : []),
    );

    this.startBtn.classList.toggle('hidden', !host);
    const need = debug ? 1 : GAME_CONFIG.minPlayersToStart;
    const enough = room.players.length >= need;
    this.startBtn.disabled = !enough;
    this.startBtn.textContent = debug ? 'Debug turunu başlat' : 'Oyunu başlat';
    this.lobbyHint.textContent = host
      ? enough
        ? debug ? 'Roller yukarıdaki seçimlere göre verilir; botlar bulundukları yerde sabit durur.' : 'Hazır olunca oyunu başlat. Roller rastgele dağıtılır.'
        : `Oyun için en az ${need} oyuncu gerekli.`
      : 'Host oyunu başlatınca tur başlayacak.';
    ctx.playerList?.refresh();
  }

  /**
   * ROL SEÇİMİ. Host: her özel rol için [☑ oyunda var] + [Otomatik / Max 1–5]. KATİL ve DEDEKTİF ZORUNLUDUR: her turda mutlaka vardır
   *   (kutusu kapatılamaz; katil hep 1 kişi). Kutu kapalı → rol hiç çıkmaz · Max N → rol en az 1, en çok N kişiye (rastgele) verilir ·
   *   Otomatik → oyuncu sayısına göre.
   * Herkes: bugünkü oyuncu sayısı için olası rol sayılarının önizlemesi (roles.js → roleRanges).
   */
  roleSettings(S, editable) {
    const n = Math.max(1, ctx.room.players.length);
    const cfg = S.roles || {};
    const fmt = ([a, b]) => (a === b ? `${a}` : `${a}–${b}`);
    const summary = Object.entries(roleRanges(n, cfg))
      .filter(([, rg]) => rg[1] > 0)
      .map(([r, rg]) => `${ROLES[r].name} ${fmt(rg)}`)
      .join(' · ');
    const lv = loverLimits(n, cfg);
    const loverText = lv[1] > 0 ? ` · Sevgili çifti ${fmt(lv)}` : ' · Sevgili yok';
    const preview = h('p', { class: 'meta role-preview' }, `${n} oyuncu için roller: ${summary}${loverText}`);
    if (!editable) return preview;

    const write = (r, v) => {
      const next = { ...(ctx.host.state.settings.roles || {}) };
      if (v === undefined) delete next[r];
      else next[r] = v;
      ctx.host.setSettings({ roles: next });
    };
    const maxOptions = [['auto', 'Otomatik'], ...Array.from({ length: ROLE_MAX_PICK }, (_, i) => [i + 1, `Max ${i + 1}`])];
    const lockedBox = () => h('input', { type: 'checkbox', checked: true, disabled: true, title: 'Zorunlu rol: her turda vardır' });
    const killerRow = h('div', { class: 'rc-row' },
      h('label', { class: 'rc-name' }, lockedBox(), h('i', { class: 'rc-dot', style: { background: ROLES.killer.color } }), ROLES.killer.name),
      h('span', { class: 'rc-fixed' }, 'Zorunlu · 1 kişi'));
    const rows = [killerRow, ...ROLE_PRIORITY.map((r) => {
      const v = cfg[r];
      const mandatory = MANDATORY_ROLES.includes(r);
      const off = !mandatory && (v === false || v === 0 || v === '0');
      const cur = typeof v === 'number' && v >= 1 ? String(Math.min(ROLE_MAX_PICK, Math.floor(v))) : 'auto';
      const on = h('input', { type: 'checkbox', title: 'Bu rol oyunda olsun' });
      on.checked = !off;
      on.disabled = mandatory; // zorunlu rol kapatılamaz
      if (mandatory) on.title = 'Zorunlu rol: her turda vardır';
      const sel = this.select(maxOptions, cur);
      sel.classList.add('mini');
      sel.disabled = off;
      const val = () => (sel.value === 'auto' ? undefined : Number(sel.value));
      on.onchange = () => write(r, on.checked ? val() : 0);
      sel.onchange = () => write(r, val());
      return h('div', { class: `rc-row${off ? ' off' : ''}` },
        h('label', { class: 'rc-name' }, on, h('i', { class: 'rc-dot', style: { background: ROLES[r].color } }), mandatory ? `${ROLES[r].name} (zorunlu)` : ROLES[r].name), sel);
    }), (() => {
      // Sevgililer (Aşık): masum takımdan iki kişiyi bağlar; biri ölürse diğeri de ölür. Seçenek = en çok kaç ÇİFT.
      const v = cfg.lover;
      const off = v === false || v === 0 || v === '0';
      const cur = typeof v === 'number' && v >= 1 ? String(Math.min(LOVER_MAX_PICK, Math.floor(v))) : 'auto';
      const on = h('input', { type: 'checkbox', title: 'Sevgililer oyunda olsun' });
      on.checked = !off;
      const sel = this.select([['auto', `Otomatik (${GAME_CONFIG.lovers.autoMinPlayers}+ oyuncu)`], ...Array.from({ length: LOVER_MAX_PICK }, (_, i) => [i + 1, `Max ${i + 1} çift`])], cur);
      sel.classList.add('mini');
      sel.disabled = off;
      const val = () => (sel.value === 'auto' ? undefined : Number(sel.value));
      on.onchange = () => write('lover', on.checked ? val() : 0);
      sel.onchange = () => write('lover', val());
      return h('div', { class: `rc-row${off ? ' off' : ''}` },
        h('label', { class: 'rc-name' }, on, h('i', { class: 'rc-dot', style: { background: SECONDARY.lover.color } }), 'Sevgililer (Aşık)'), sel);
    })()];
    const box = h('details', { class: 'role-cfg' },
      h('summary', {}, 'Rol ayarları'),
      h('div', { class: 'rc-grid' }, rows),
      h('small', {}, `Katil ve Dedektif zorunludur: her turda mutlaka vardır (otomatik ayarda bile). Katil hep 1 kişidir. Kutu kapalıysa o rol oyunda yoktur. "Max N": rol her turda en az 1, en çok N kişiye rastgele verilir. "Otomatik": oyuncu sayısına göre sabit sayıdır (az oyuncuda 0 olabilir). "Sevgililer": masum takımdan iki kişiyi bağlar, biri ölürse diğeri de ölür; "Max N" en çok N çifttir. Oyuncu yetmezse öncelik sırası: ${ROLE_PRIORITY.map((r) => ROLES[r].name).join(', ')}.`),
      h('button', { type: 'button', class: 'btn small ghost', onclick: () => ctx.host.setSettings({ roles: {} }) }, 'Hepsini otomatik yap'));
    box.open = !!this.rolesOpen;
    box.addEventListener('toggle', () => { this.rolesOpen = box.open; });
    return h('div', {}, box, preview);
  }

  /** Debug lobisi / panelindeki rol seçici: seçilen rol bir sonraki turda (tur sürüyorsa hemen) geçerli olur. */
  debugRoleSelect(id) {
    const cur = ctx.host?.state.debugRoles?.[id] || 'civilian';
    const sel = this.select(DEBUG_ROLE_OPTIONS, cur);
    sel.classList.add('mini');
    sel.onchange = () => ctx.host.debugSetRole(id, sel.value);
    return sel;
  }

  debugAddBotRow() {
    const sel = this.select(DEBUG_ROLE_OPTIONS, this.lastBotRole || store.get('debugBotRole', 'civilian'));
    sel.classList.add('mini');
    sel.onchange = () => { this.lastBotRole = sel.value; };
    return h('div', { class: 'lp add-bot' },
      h('span', { class: 'lp-name' }, '🤖 Bot ekle'), sel,
      this.btn('+ Ekle', () => { this.lastBotRole = sel.value; ctx.host.debugSpawnBot({ role: sel.value }); }, 'small'));
  }

  nameOfPlayer(id) {
    return ctx.room?.players?.find((p) => p.id === id)?.name || id;
  }

  copyCode() {
    // Davet bağlantısı: sayfa#KOD (GitHub gibi sitelerde ?oda=KOD kabul edilmiyor; alt klasörde barındırılan sayfada da doğru adres çıkar)
    const link = `${location.href.split(/[?#]/)[0]}#${ctx.room.code}`;
    const fail = () => this.toast(`Kopyalanamadı. Oda kodu: ${ctx.room.code}`);
    if (!navigator.clipboard?.writeText) return fail(); // http (güvenli olmayan) sayfada pano erişimi yoktur
    navigator.clipboard.writeText(link).then(() => this.toast('Davet bağlantısı kopyalandı.'), fail);
  }

  // ================================================================== oyun içi HUD
  buildHud() {
    this.hudTimer = h('div', { class: 'hud-timer' });
    this.hudAlive = h('div', { class: 'hud-alive' });
    this.hudRoom = h('div', { class: 'hud-room' });
    this.hudName = h('div', { class: 'hud-name' }); // sol alt: herkese görünen adım (kendi renginde)
    this.hudRoles = h('div', { class: 'hud-roles' }); // sağ alt: ana rol + ikincil roller (Baiter, Aşık)
    this.rolesSig = '';
    this.nameSig = '';
    this.progress = h('div', { class: 'hud-progress hidden' }, h('div', { class: 'hud-progress-fill' }));
    this.hpFill = h('div', { class: 'hp-fill' });
    this.hpText = h('span', {});
    this.hudWeapon = h('div', { class: 'hud-weapon' });
    this.hudItems = h('div', { class: 'hud-weapon hud-items' }); // gizli eşyalar: "[3] Roketatar  [4] Bomba"
    this.hudAbility = h('div', { class: 'hud-ability' });
    this.hudMic = h('div', { class: 'hud-mic' });
    this.promptEl = h('div', { class: 'prompt hidden' });
    this.deadBar = h('div', { class: 'dead-bar hidden' });
    this.crosshair = h('div', { class: 'crosshair' });
    this.crosshairOn = false;
    this.lockHint = h('div', { class: 'lock-hint hidden' }, 'Oyuna girmek için ekrana tıkla (fare yakalanır)');
    this.hud = h('div', { class: 'hud hidden' },
      h('div', { class: 'hud-top' }, this.hudTimer, this.hudAlive),
      this.hudRoom,
      this.crosshair,
      this.progress,
      h('div', { class: 'hud-bl' }, this.hudName, h('div', { class: 'hp' }, this.hpFill, this.hpText)),
      h('div', { class: 'hud-bc' }, this.hudWeapon, this.hudItems, this.hudAbility, this.promptEl),
      h('div', { class: 'hud-br' }, this.hudMic, this.hudRoles),
      this.lockHint,
      this.deadBar);
    this.root.appendChild(this.hud);
  }

  update() {
    const phase = ctx.phase;
    const playing = phase === 'playing' || phase === 'ended';
    this.hud.classList.toggle('hidden', !playing);
    if (!playing || !ctx.me) return;
    const now = performance.now() / 1000;
    const R = ctx.round;
    const me = ctx.me;
    const s = ctx.me_state;

    // ---- zaman / sayaç ----
    if (R.revealUntil && now < R.revealUntil) this.hudTimer.textContent = `Başlıyor: ${Math.ceil(R.revealUntil - now)}`;
    else if (phase === 'ended') this.hudTimer.textContent = 'Tur bitti';
    else this.hudTimer.textContent = R.limit > 0 ? fmtTime(R.endsAt - now) : '∞';
    this.hudAlive.textContent = `Tur ${R.n}`; // hayatta kalan sayısı bilerek GÖSTERİLMEZ
    const dbgKey = ctx.isHost ? ` · ${keyLabel(KEYS.debug)}: debug paneli` : '';
    this.hudRoom.textContent = ctx.room?.settings?.debug
      ? `${ctx.net?.local ? 'Debug haritası' : `Oda ${ctx.room.code} · DEBUG`}${dbgKey}`
      : `Oda ${ctx.room?.code || ''} · ${MODE_NAMES[ctx.room?.mode] || ''}`;

    // ---- sol alt: adım (rengimle) · sağ alt: rollerim ----
    const idn = me.identity;
    const nameSig = `${idn?.label}|${idn?.color}`;
    if (nameSig !== this.nameSig) {
      this.nameSig = nameSig;
      this.hudName.textContent = idn?.label || '';
      this.hudName.style.color = colorCss(idn?.color ?? 0xffffff);
    }
    this.renderRoles();
    this.updateProgress();
    if (!me.alive || phase !== 'playing') this.hideSleep();

    // ---- can ----
    const hp = Math.max(0, Math.min(GAME_CONFIG.player.maxHp, s.hp ?? 0));
    this.hpFill.style.width = `${(hp / GAME_CONFIG.player.maxHp) * 100}%`;
    this.hpText.textContent = me.alive ? `${Math.round(hp)}` : '☠';

    // ---- silah / yetenek ----
    const type = ctx.inventory.heldType; // el: slot 2 → rol ekipmanı, slot 3+ → gizli eşya
    const roleType = ctx.inventory.equipType;
    let wtxt = '';
    if (me.alive && type && ctx.inventory.slot >= 2) {
      const W = GAME_CONFIG.equipment[type];
      if (type === 'knife') wtxt = s.knifeAway ? `Bıçak elinde değil — bakıp al (${keyLabel(KEYS.interact)}) ya da 2 dk bekle` : `${W.name} · Sol: vur · Sağ: fırlat`;
      else if (type === 'bomb') wtxt = `${W.name} · Sol: kur (${W.fuse} sn sonra patlar)`;
      else if (s.reload > 0) wtxt = `${W.name} · dolduruluyor ${s.reload.toFixed(1)} sn`;
      else if (W.magazine) wtxt = `${W.name} · ${s.ammo ?? 0}/${W.magazine} · ${keyLabel(KEYS.reload)}: doldur`;
      else wtxt = `${W.name} · Sol: vur`;
    } else if (me.alive && roleType) wtxt = `[${keyLabel(KEYS.equip)}] ${GAME_CONFIG.equipment[roleType].name}`;
    this.hudWeapon.textContent = wtxt;
    const itemsTxt = me.alive ? (s.items || []).map((it, i) => `[${keyLabel(KEYS[`slot${i + 3}`])}] ${GAME_CONFIG.equipment[it]?.name || it}`).join('   ') : '';
    if (this.hudItems.textContent !== itemsTxt) this.hudItems.textContent = itemsTxt;

    let atxt = '';
    if (me.alive && ctx.role?.ability) {
      const nm = ABILITY_NAMES[ctx.role.ability] || 'Yetenek';
      const key = keyLabel(KEYS.ability);
      if (ctx.role.ability === 'medium') {
        // Medyum: kullanım hakkı yok. Gece (ışıklar kapalı) bağlanılır; sabah (ışıklar açılınca) bağlantı kendiliğinden kesilir.
        const night = isNight(ctx.world.lights);
        atxt = `[${key}] ${nm}: ${night ? (s.mediumTarget ? `bağlı → ${this.nameOfPlayer(s.mediumTarget)}` : 'gece, bağlanabilirsin') : 'gündüz, bağlantı kapalı'}`;
      } else if (ctx.role.ability === 's2g') {
        // S2G: gece bir kişiye 1 m yakından bakıp tuşu basılı tut; her gece 1 kez
        const night = isNight(ctx.world.lights);
        atxt = `[${key}] ${nm}: ${!night ? 'gündüz, kullanılamaz' : s.s2gUsed ? 'bu gece kullandın' : 'hazır · bir kişiye yaklaş, bak, basılı tut'}`;
      } else atxt = `[${key}] ${nm}: ${s.abilityCd > 0 ? `${Math.ceil(s.abilityCd)} sn` : 'hazır'}`;
    }
    this.hudAbility.textContent = atxt;

    // ---- mikrofon / sohbet ----
    const v0 = ctx.room?.mode === 'silent' ? ctx.voice.hud() : null;
    if (v0?.silent && !v0.canSpeak) {
      // sessiz mod: yalnızca dedektif konuşur; diğerleri yazar (dedektifi duyarlar)
      this.hudMic.textContent = `Sessiz mod · ${keyLabel(KEYS.chat)}: yaz`;
      this.hudMic.classList.remove('talking');
    } else if (ctx.room?.mode === 'voice' || v0) {
      const v = v0 || ctx.voice.hud();
      let txt;
      if (v.status === 'error') txt = 'Ses bağlantısı yok';
      else if (v.mic === 'insecure') txt = 'Mikrofon yok (https gerekir) · dinleme açık';
      else if (v.mic === 'denied') txt = 'Mikrofon izni yok · dinleme açık';
      else if (v.mic === 'pending') txt = 'Mikrofon izni bekleniyor…';
      else if (!v.micOn) txt = `Mikrofon kapalı (${keyLabel(KEYS.mic)}: aç)`;
      else if (v.silent) txt = v.talking ? `KONUŞUYORSUN (${keyLabel(KEYS.mic)}: kapat)` : 'Mikrofon hazır';
      else txt = v.talking ? 'KONUŞUYORSUN' : `Mikrofon hazır (${keyLabel(KEYS.ptt)}: bas-konuş)`;
      this.hudMic.textContent = `${txt} · ${LEVEL_NAMES[v.level]} (${keyLabel(KEYS.talkLevel)} basılı tut: ${v.silent ? 'normal/bağır' : 'seviye'})`;
      this.hudMic.classList.toggle('talking', !!v.talking);
    } else {
      this.hudMic.textContent = `Sessiz mod · ${keyLabel(KEYS.chat)}: yaz`;
      this.hudMic.classList.remove('talking');
    }

    // ---- ölü arayüzü ----
    this.deadBar.classList.toggle('hidden', me.alive);
    if (!me.alive) {
      const t = ctx.movement.spectateId ? ctx.players.get(ctx.movement.spectateId) : null;
      this.deadBar.textContent = `☠ İzleyicisin${t ? ` · İzlenen: ${t.name}` : ''} · ${keyLabel(KEYS.prevSpectate)}/${keyLabel(KEYS.nextSpectate)} oyuncu değiştir · ölülerle yazılı/sesli konuşabilirsin`;
    }
    this.hud.classList.toggle('is-dead', !me.alive);
    const needLock = !ctx.input.locked && !this.modalOpen() && !ctx.playerList.sticky && !ctx.chat.box.classList.contains('typing');
    this.lockHint.classList.toggle('hidden', !needLock);

    // ---- sayaçlar ----
    if (this.introCount && now < (R.revealUntil || 0)) this.introCount.textContent = `${Math.ceil(R.revealUntil - now)}`;
    if (this.endAt && this.endCount) this.endCount.textContent = `Yeni tur: ${Math.max(0, Math.ceil(this.endAt - now))} sn`;
  }

  // ================================================================== tur açılışı / sonu
  buildOverlays() {
    // tur açılışı: tam SİYAH ekran (config.js → rounds.roleRevealTime sn). Üstte rolüm, altında bildiğim kişiler ("Mafya: Ali", "Aşkın: Ayşe"),
    // ortanın altında rolün açıklaması.
    this.introTitle = h('div', { class: 'intro-title' });
    this.introRoleName = h('div', { class: 'intro-role' });
    this.introLines = h('div', { class: 'intro-lines' });
    this.introDesc = h('div', { class: 'intro-desc' }, h('em', {}, 'Rolün belirleniyor…'));
    this.introCount = h('div', { class: 'intro-count' });
    this.intro = h('div', { class: 'overlay intro hidden' },
      h('div', { class: 'intro-top' }, this.introTitle, this.introRoleName, this.introLines), this.introDesc, this.introCount);

    // uyurgezer uyuyunca: ekran kararır
    this.sleepEl = h('div', { class: 'sleep-screen hidden' }, h('div', { class: 'sleep-text' }, 'Uyuyorsun…'));
    this.sleepTimer = 0;

    // tur sonu
    this.endTitle = h('h2', { class: 'end-title' });
    this.endSub = h('div', { class: 'end-sub' });
    this.endTable = h('div', { class: 'end-table' });
    this.endCount = h('div', { class: 'intro-count' });
    this.endLobbyBtn = this.btn('Lobiye dön', () => ctx.host?.backToLobby(), 'small ghost');
    this.end = h('div', { class: 'overlay end hidden' }, h('div', { class: 'panel' }, this.endTitle, this.endSub, this.endTable, this.endCount, this.endLobbyBtn));

    // duraklatma menüsü
    this.pause = h('div', { class: 'overlay pause hidden' },
      h('div', { class: 'panel' },
        h('h2', {}, 'Duraklatıldı'),
        h('p', { class: 'hint' }, 'Oyun arkadaşların için devam ediyor.'),
        this.btn('Devam et', () => this.hidePause(true), 'primary'),
        this.btn('Ayarlar', () => this.openSettings()),
        (this.pauseLobby = this.btn('Lobiye dön (host)', () => { this.hidePause(false); ctx.host?.backToLobby(); })),
        this.btn('Odadan çık', () => { this.hidePause(false); ctx.client.leave(); }, 'danger')));

    // mesaj / seçim / ayarlar
    this.msgTitle = h('h3', {});
    this.msgText = h('p', {});
    this.msgBox = h('div', { class: 'overlay message hidden' },
      h('div', { class: 'panel' }, this.msgTitle, this.msgText, this.btn('Tamam', () => { this.closeModal('message'); this.msgBox.classList.add('hidden'); }, 'primary')));
    this.chooseBox = h('div', { class: 'overlay choose hidden' });
    this.settingsBox = h('div', { class: 'overlay settings hidden' });
    this.root.append(this.intro, this.sleepEl, this.end, this.pause, this.msgBox, this.chooseBox, this.settingsBox);
    // Esc: ayarları kapatır (tuş atarken Esc yalnızca atamayı iptal eder)
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.modals.has('settings') && !this.keyCapture) this.closeSettings();
    });
  }

  showRoundIntro(n, reveal) {
    this.introTitle.textContent = `Tur ${n}`;
    this.introRoleName.textContent = '';
    this.introRoleName.style.color = '';
    this.introLines.replaceChildren();
    this.introDesc.replaceChildren(h('em', {}, 'Rolün belirleniyor…'));
    this.intro.classList.remove('hidden');
    ctx.round.revealUntil = performance.now() / 1000 + reveal;
    this.hud.classList.remove('hidden');
    this.hideSleep();
  }
  hideRoundIntro() {
    this.intro.classList.add('hidden');
  }

  /** Uyurgezer uyudu: ekran `dur` saniye tam siyah olur ve "Uyuyorsun…" yazar. */
  showSleep(dur) {
    clearTimeout(this.sleepTimer);
    this.sleepEl.classList.remove('hidden');
    this.sleepTimer = setTimeout(() => this.hideSleep(), Math.max(0.5, dur) * 1000 + 100);
  }
  hideSleep() {
    if (this.sleepEl.classList.contains('hidden')) return;
    clearTimeout(this.sleepTimer);
    this.sleepEl.classList.add('hidden');
  }

  /** Baiter atandı: ekran üstünde iki satırlı bildirim (başlık + amaç). */
  baiterNotice() {
    this.banner(SECONDARY.baiter.notice, 8000, 'warn', SECONDARY.baiter.text);
  }

  /** Sağ alt: ana rolüm + ikincil roller (Baiter, Aşık) yan yana. Rol / baiter / sevgili değişince yeniden çizilir. */
  renderRoles() {
    const r = ctx.role;
    const sig = r ? `${r.id}|${ctx.me_state.baiter ? 1 : 0}|${ctx.lover || ''}` : '';
    if (sig === this.rolesSig) return;
    this.rolesSig = sig;
    this.hudRoles.replaceChildren();
    if (!r) return;
    this.hudRoles.appendChild(h('span', { class: 'chip role', style: { background: r.color } }, r.name));
    if (ctx.me_state.baiter) this.hudRoles.appendChild(h('span', { class: 'chip', style: { background: SECONDARY.baiter.color } }, SECONDARY.baiter.name));
    if (ctx.lover) this.hudRoles.appendChild(h('span', { class: 'chip', style: { background: SECONDARY.lover.color } }, `♥ ${SECONDARY.lover.name}: ${this.nameOfPlayer(ctx.lover)}`));
  }

  /** Ortadaki ilerleme çubuğu (S2G: tuşu basılı tutma). */
  updateProgress() {
    const p = ctx.me?.alive ? ctx.inventory?.holdProgress || 0 : 0;
    this.progress.classList.toggle('hidden', !(p > 0));
    if (p > 0) this.progress.firstChild.style.width = `${Math.round(Math.min(1, p) * 100)}%`;
  }

  /** Rolüm değişti / öğrenildi: açılış ekranını ve sağ alt rol etiketlerini doldurur. */
  onRole() {
    this.rolesSig = null;
    this.renderRoles();
    this.introLines.replaceChildren();
    this.introDesc.replaceChildren();
    const r = ctx.role;
    if (!r) {
      this.introRoleName.textContent = ctx.me?.alive ? '' : 'İzleyicisin';
      this.introRoleName.style.color = '';
      return;
    }
    this.introRoleName.textContent = r.name;
    this.introRoleName.style.color = r.color;
    // bildiğim diğer kişiler: "Dedektif: Ayşe", "Mafya: Ali", "Aşkın: Zeynep"
    const rows = [];
    for (const [id, v] of Object.entries(ctx.vis || {})) {
      if (id === ctx.myId) continue;
      if (v.role) rows.push([ROLES[v.role]?.name || v.role, ROLES[v.role]?.color, this.nameOfPlayer(id)]);
      if (v.baiter) rows.push([SECONDARY.baiter.name, SECONDARY.baiter.color, this.nameOfPlayer(id)]);
    }
    if (ctx.lover) rows.push(['Aşkın', SECONDARY.lover.color, this.nameOfPlayer(ctx.lover)]);
    for (const [label, color, name] of rows) {
      this.introLines.appendChild(h('div', { class: 'intro-line' }, h('span', { class: 'k', style: { color } }, `${label}:`), ' ', name));
    }
    const text = r.text.replace(/\{(\w+)\}/g, (_, k) => keyLabel(KEYS[k]));
    this.introDesc.appendChild(h('p', {}, text));
    if (ctx.lover) this.introDesc.appendChild(h('p', { class: 'love' }, SECONDARY.lover.text));
  }

  showEnd(m) {
    const names = { innocent: 'Masum takım kazandı!', killer: 'Katil takımı kazandı!', draw: 'Berabere!' };
    const reasons = { killer: 'Katil elendi.', innocents: 'Bütün masumlar elendi.', time: 'Süre doldu.', all: 'Herkes elendi.' };
    this.endTitle.textContent = names[m.winner] || 'Tur bitti';
    const mine = ctx.role?.team;
    const result = m.winner === 'draw' ? '' : mine ? (mine === m.winner ? 'Kazandın! ' : 'Kaybettin. ') : '';
    this.endSub.textContent = `${result}${reasons[m.reason] || ''}`;
    this.endTable.replaceChildren();
    for (const p of ctx.room?.players || []) {
      const role = m.roles?.[p.id] ? ROLES[m.roles[p.id]] : null;
      if (!role) continue;
      this.endTable.appendChild(
        h('div', { class: `et-row${m.dead?.[p.id] ? ' dead' : ''}` },
          h('span', { class: 'et-name' }, p.name, p.id === ctx.myId ? ' (sen)' : ''),
          h('span', { class: 'tag role', style: { background: role.color } }, role.name),
          m.baiter === p.id ? h('span', { class: 'tag baiter' }, 'Baiter') : null,
          m.lovers?.includes(p.id) ? h('span', { class: 'tag lover' }, '♥') : null,
          h('span', { class: 'et-status' }, m.dead?.[p.id] ? '☠' : '✔')),
      );
    }
    this.endAt = performance.now() / 1000 + (m.wait ?? m.endLeft ?? GAME_CONFIG.rounds.restartDelay);
    this.endLobbyBtn.classList.toggle('hidden', !ctx.isHost);
    this.end.classList.remove('hidden');
    this.refreshLobbyLater();
  }
  refreshLobbyLater() {
    setTimeout(() => ctx.playerList?.refresh(), 0);
  }
  hideEnd() {
    this.end.classList.add('hidden');
    this.endAt = 0;
  }

  showDead(cause) {
    this.banner(`Öldün${CAUSE_NAMES[cause] ? ` — ${CAUSE_NAMES[cause]}` : ''}`, 3500, 'danger');
    this.deadBar.classList.remove('hidden');
  }

  // ================================================================== duraklatma
  showPause() {
    if (this.modals.has('pause') || ctx.phase === 'menu' || ctx.phase === 'lobby') return;
    this.pauseLobby.classList.toggle('hidden', !ctx.isHost);
    this.openModal('pause', this.pause);
  }
  hidePause(relock) {
    this.closeModal('pause');
    if (relock) this.relock();
  }

  // ================================================================== ayarlar
  /** Ayarlar: Genel · Mikrofon · Tuşlar sekmeleri. */
  openSettings(tab) {
    if (tab) this.settingsTab = tab;
    else if (!this.settingsTab) this.settingsTab = 'general';
    this.renderSettings();
    this.openModal('settings', this.settingsBox);
  }

  closeSettings() {
    this.closeModal('settings');
    if (this.modals.size === 0) this.relock();
  }

  /** Ayarlar kapanırken: tuş dinleme, mikrofon denemesi ve seviye çubuğu temizlenir. */
  onSettingsClosed() {
    this.stopKeyCapture();
    this.stopMeter();
    if (ctx.voice) {
      ctx.voice.stopTest();
      ctx.voice.onDevices = null;
    }
  }

  renderSettings() {
    const tab = this.settingsTab;
    this.stopKeyCapture();
    this.stopMeter();
    if (tab !== 'mic' && ctx.voice) {
      ctx.voice.stopTest();
      ctx.voice.onDevices = null;
    }
    const tabs = h('div', { class: 'seg tabs3' },
      ...[['general', 'Genel'], ['mic', 'Mikrofon'], ['keys', 'Tuşlar']].map(([id, label]) =>
        this.btn(label, () => { this.settingsTab = id; this.renderSettings(); }, tab === id ? 'active' : '')));
    const body = tab === 'mic' ? this.settingsMic() : tab === 'keys' ? this.settingsKeys() : this.settingsGeneral();
    this.settingsBox.replaceChildren(
      h('div', { class: 'panel settings-panel' },
        h('h3', {}, 'Ayarlar'), tabs, h('div', { class: 'settings-body' }, ...body),
        this.btn('Kapat', () => this.closeSettings(), 'primary')));
  }

  settingsGeneral() {
    const S = ctx.settings;
    const save = () => {
      store.set('settings', S);
      audio.setVolume(S.volume);
    };
    const sens = h('input', { type: 'range', min: '0.3', max: '2.5', step: '0.1', value: String(S.sensitivity) });
    sens.oninput = () => { S.sensitivity = Number(sens.value); save(); };
    const fovNow = S.fov ?? GAME_CONFIG.camera.fov;
    const fov = h('input', { type: 'range', min: '60', max: '110', step: '1', value: String(fovNow) });
    const fovText = h('span', { class: 'range-val' }, `${fovNow}°`);
    fov.oninput = () => {
      S.fov = Number(fov.value);
      fovText.textContent = `${S.fov}°`;
      ctx.sceneMgr.setFov(S.fov);
      save();
    };
    const vol = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(S.volume) });
    vol.oninput = () => { S.volume = Number(vol.value); save(); };
    const q = this.select([['low', 'Düşük'], ['medium', 'Orta'], ['high', 'Yüksek'], ['ultra', 'Ultra'], ['ultrahigh', 'Ultra Yüksek']], S.quality);
    q.onchange = () => { S.quality = q.value; ctx.sceneMgr.setQuality(q.value); save(); this.toast('Ev materyali ve fener gölgeleri sayfa yenilenince tam uygulanır.'); };
    const lights = this.check('Işık efektleri (kapatınca FPS artar; ortam düz aydınlatılır)', S.lights !== false);
    lights.input.onchange = () => {
      S.lights = lights.input.checked;
      ctx.world?.setLightsEnabled(S.lights);
      save();
      this.toast(S.lights ? 'Işık efektleri açık.' : 'Işık efektleri kapalı: ortam düz aydınlatılır; oda ışıkları kapanınca yine karanlık olur, fener çalışır.', 3500);
    };
    const dead = this.check('Ölü sohbet mesajlarını göster', S.showDeadChat !== false);
    dead.input.onchange = () => { S.showDeadChat = dead.input.checked; save(); };
    const guard = this.check('Ctrl+W sekmeyi kapatmasın (oyunda tam ekran kullanır)', S.guardTab !== false);
    guard.input.onchange = () => { S.guardTab = guard.input.checked; save(); };

    const out = [
      this.field('Fare hassasiyeti', sens),
      this.field('Görüş alanı (FOV)', h('div', { class: 'range-row' }, fov, fovText)),
      this.field('Ses seviyesi', vol),
      this.field('Grafik kalitesi', q),
      lights.el,
      dead.el,
      guard.el,
    ];
    if (ctx.world?.source === 'fallback') {
      out.push(h('div', { class: 'note' }, 'assets/house.glb bulunamadı: örnek ev kullanılıyor. Blender\'da adlandırma örneği olarak indirip açabilirsin.'),
        this.btn('Örnek evi .glb olarak indir', () => this.exportSampleHouse(), 'small'));
    }
    return out;
  }

  /** Mikrofon seçimi (dahili / harici), deneme çubuğu ve açık mikrofon seçeneği. */
  settingsMic() {
    const v = ctx.voice;
    const S = ctx.settings;
    const secure = window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;
    const info = h('p', { class: 'hint' });
    const sel = h('select', { class: 'input' });
    const fillDevices = (list) => {
      sel.replaceChildren(h('option', { value: '' }, 'Sistem varsayılanı'), ...list.map((d) => h('option', { value: d.id }, d.label)));
      sel.value = list.some((d) => d.id === v.deviceId) ? v.deviceId : '';
      info.textContent = !secure
        ? 'Mikrofon için sayfanın https (ya da localhost) üzerinden açılması gerekir.'
        : !list.length
          ? 'Mikrofon bulunamadı. Bir mikrofon takıp "Mikrofonu dene"ye bas.'
          : list.every((d) => /^Mikrofon \d+$/.test(d.label))
            ? 'Cihaz adlarını görmek için "Mikrofonu dene"ye basıp tarayıcı iznini ver.'
            : 'Dahili mikrofonu, kulaklığı ya da harici (USB) mikrofonu seçebilirsin. Takıp çıkardığında liste kendiliğinden güncellenir.';
    };
    fillDevices([]);
    v.onDevices = (list) => { if (sel.isConnected) fillDevices(list); };
    v.listMics().then((list) => { if (sel.isConnected) fillDevices(list); });
    sel.onchange = async () => {
      await v.setMicDevice(sel.value);
      this.toast('Mikrofon seçildi.', 1500);
    };

    const fill = h('div', { class: 'meter-fill' });
    this.meterFill = fill;
    const testBtn = this.btn(v.testing ? 'Denemeyi durdur' : 'Mikrofonu dene', async () => {
      if (v.testing) {
        v.stopTest();
        testBtn.textContent = 'Mikrofonu dene';
        return;
      }
      testBtn.disabled = true;
      const ok = await v.startTest();
      testBtn.disabled = false;
      if (!ok) {
        this.toast(secure ? 'Mikrofon açılamadı. Tarayıcı iznini kontrol et.' : 'Mikrofon için https gerekir.', 3200);
        return;
      }
      testBtn.textContent = 'Denemeyi durdur';
    }, 'small');
    this.startMeter();

    const openMic = this.check('Açık mikrofon (bas-konuş yerine sürekli açık)', !!S.openMic);
    openMic.input.onchange = () => { S.openMic = openMic.input.checked; store.set('settings', S); };
    return [
      this.field('Mikrofon', sel),
      info,
      h('div', { class: 'meter' }, fill),
      testBtn,
      openMic.el,
      h('p', { class: 'hint' }, `Bas-konuş: ${keyLabel(KEYS.ptt)} · mikrofonu aç/kapat: ${keyLabel(KEYS.mic)} · bu tuşlar "Tuşlar" sekmesinden değişir.`),
    ];
  }

  startMeter() {
    cancelAnimationFrame(this.meterRaf);
    const tick = () => {
      if (!this.meterFill?.isConnected) {
        this.meterRaf = 0;
        return;
      }
      this.meterFill.style.width = `${Math.round((ctx.voice?.level() || 0) * 100)}%`;
      this.meterRaf = requestAnimationFrame(tick);
    };
    this.meterRaf = requestAnimationFrame(tick);
  }

  stopMeter() {
    cancelAnimationFrame(this.meterRaf);
    this.meterRaf = 0;
    this.meterFill = null;
  }

  /** Tuş atama: bir eyleme tıkla, sonra yeni tuşa bas (Esc iptal). Aynı tuş başka eylemdeyse ikisi yer değiştirir. */
  settingsKeys() {
    const rows = [];
    let group = null;
    for (const a of KEY_ACTIONS) {
      if (a.group !== group) {
        group = a.group;
        rows.push(h('h4', { class: 'kb-group' }, group));
      }
      const b = h('button', { type: 'button', class: 'kb-key', onclick: () => this.captureKey(a.id, b) }, keyLabel(KEYS[a.id]));
      rows.push(h('div', { class: 'kb-row' }, h('span', { class: 'kb-name' }, a.label), b));
    }
    return [
      h('p', { class: 'hint' }, 'Bir tuşa tıkla, sonra yeni tuşa bas (Esc: iptal). Aynı tuş başka bir eylemde varsa ikisi yer değiştirir. Sol / sağ tık (saldırı) ve Esc (menü) sabittir.'),
      h('div', { class: 'kb-list' }, rows),
      this.btn('Varsayılana döndür', () => {
        resetKeys();
        this.renderSettings();
        this.refreshMenuNote();
        this.toast('Tuşlar varsayılana döndü.');
      }, 'ghost'),
    ];
  }

  captureKey(action, btn) {
    this.stopKeyCapture();
    btn.textContent = 'Bir tuşa bas…';
    btn.classList.add('listening');
    const onKey = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat) return;
      if (e.code === 'Escape') {
        this.stopKeyCapture();
        return;
      }
      if (BLOCKED_KEYS.has(e.code)) {
        this.toast('Bu tuş tarayıcıya ayrılmış, başka bir tuş seç.', 2200);
        return;
      }
      const swapped = setKey(action, e.code);
      if (swapped === false) {
        this.toast('Bu tuş atanamaz.');
        this.stopKeyCapture();
        return;
      }
      if (swapped) this.toast(`"${actionLabel(swapped)}" eyleminin tuşu da "${keyLabel(KEYS[swapped])}" oldu (yer değiştirdiler).`, 3200);
      this.renderSettings();
      this.refreshMenuNote();
    };
    const cancelOnClick = (e) => { if (e.target !== btn) this.stopKeyCapture(); };
    window.addEventListener('keydown', onKey, true);
    const t = setTimeout(() => window.addEventListener('mousedown', cancelOnClick, true), 0);
    this.keyCapture = { action, btn, onKey, cancelOnClick, t };
  }

  stopKeyCapture() {
    const c = this.keyCapture;
    if (!c) return;
    this.keyCapture = null;
    clearTimeout(c.t);
    window.removeEventListener('keydown', c.onKey, true);
    window.removeEventListener('mousedown', c.cancelOnClick, true);
    c.btn.textContent = keyLabel(KEYS[c.action]);
    c.btn.classList.remove('listening');
  }

  async exportSampleHouse() {
    try {
      const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
      const root = buildFallbackHouse();
      new GLTFExporter().parse(
        root,
        (glb) => {
          const url = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }));
          const a = h('a', { href: url, download: 'ornek_ev.glb' });
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        },
        (e) => this.toast(`Dışa aktarılamadı: ${e?.message || e}`),
        { binary: true },
      );
    } catch (e) {
      this.toast(`Dışa aktarılamadı: ${e?.message || e}`);
    }
  }
}
