// HOST OTORİTESİ: oyun durumunu tutan, istemci isteklerini doğrulayan ve sonuçları herkese yayınlayan sınıf.
// Yalnızca odanın host'unun tarayıcısında çalışır (ctx.host). Host ayrılırsa P2P oda kapanır.
//
// İstemci → host mesajları (d.t):
//   pos, act{a}, grab, drop, throw, carry, knifePickup, equip{on}, fire{o,d}, alt{o,d}, reload, ability{...},
//   baiter{target}, sound{i}, chat{text}, spec{id}, hello, troll{on}, trollOp{op,a}   ← son ikisi TrollHacks (troll.js)
// Host → istemci mesajları: client.js başındaki liste.
import * as THREE from 'three';
import { GAME_CONFIG } from './config.js';
import { ctx } from './context.js';
import { CombatSystem, truePos } from './combat.js';
import { RoundManager, newPlayerState } from './rounds.js';
import { FACES } from './faces.js';
import { TrollHacks } from './troll.js';
import { ROLES, computeVisibility, loverPartner, makeIdentities } from './roles.js';
import { Rate, isBotId, round3 } from './util.js';

const E = GAME_CONFIG.equipment;
const V = GAME_CONFIG.voice;

export const DEFAULT_SETTINGS = {
  roundTime: GAME_CONFIG.rounds.roundTime,
  roles: {}, // host'un rol seçimi: { detective: 2 (en çok 2), medium: 0 (oyunda yok), lover: 2 (en çok 2 çift) } — eksik = otomatik (bkz. roles.js → roleLimits; lover = ÇİFT sayısı)
  deadChat: 'dead', // 'dead' = ölü mesajlarını yalnızca ölüler görür, 'all' = herkes görür
  debug: false, // debug odası: roller elle seçilir, bot eklenebilir, tur kendiliğinden bitmez
  troll: true, // TrollHacks: misafirler konsoldan açıp F2 araçlarını kullanabilir (false = izin yok; lobideki seçici v4.4'te kaldırıldı; bkz. troll.js)
};

const cleanText = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

export class HostGame {
  constructor() {
    this.state = this.freshState();
    this.combat = new CombatSystem(this);
    this.rounds = new RoundManager(this);
    this.posBuf = new Map();
    this.posRate = new Rate(GAME_CONFIG.net.posHz);
    this.links = new Set(); // yakınlık ses bağlantıları ("a|b")
    this.lastRoutes = new Map();
    this.routeT = 0;
    this.meT = 0;
    this.trollT = 0;
    this._cheat = false; // yalnızca yetkili bir troll işlemi çalışırken true (debug* işlevlerinin kilidini açar)
    this.chatLast = new Map();
  }

  freshState() {
    return {
      phase: 'lobby', // lobby | reveal | playing | ended
      round: 0,
      time: 0,
      limit: 0,
      revealLeft: 0,
      endTimer: 0,
      winner: null,
      mode: 'voice',
      players: {},
      baiterId: null,
      baiterUsed: false,
      lovers: null,
      knife: { s: 'held', p: [0, 0, 0], v: [0, 0, 0], ret: 0, delay: 0, from: null },
      nightNo: 0, // kaçıncı gece (ışıklar kapanınca artar; S2G her gece 1 kez)
      idn: {},
      spawns: {},
      debugRoles: {}, // debug: { oyuncuId: rolId } (bir sonraki tur / canlı rol değişimi)
      debugLovers: [], // debug odası: elle kurulan sevgili çiftleri [a1, b1, a2, b2, ...] (tur yenilenince de kalır)
      botPos: {}, // debug: { botId: [x, y, z, yaw] } botlar bulundukları yerde sabit durur
      dbg: {}, // debug: { oyuncuId: { god, ghost, noclip, mute, items } } — turlar arasında kalır
      trolls: {}, // TrollHacks'i konsoldan açan misafirler: { oyuncuId: true }
      settings: { ...DEFAULT_SETTINGS, ...(ctx.room?.settings || {}) },
    };
  }

  get debug() {
    return !!this.state.settings?.debug;
  }
  /** Debug işlevleri (rol, eşya, öldür, ışınlama…) çalışabilir mi: debug odası ya da yetkili bir troll işlemi sürerken. */
  get cheat() {
    return this.debug || this._cheat;
  }

  // ------------------------------------------------------------------ taşıma
  connectedIds() {
    return (ctx.room?.players || []).map((p) => p.id);
  }
  /** Gerçek (bot olmayan) oyuncular: ağ, ses ve kişisel mesajlar yalnızca bunlar içindir. */
  humanIds() {
    return this.connectedIds().filter((id) => !isBotId(id));
  }
  nameOf(id) {
    return ctx.room?.players?.find((p) => p.id === id)?.name || id;
  }

  /** Herkese (kendim dahil) gönder. */
  broadcast(m) {
    ctx.net.relay('all', m);
    this.loop(m);
  }
  sendTo(id, m) {
    if (isBotId(id)) return; // botlara ağ mesajı gitmez
    if (id === ctx.myId) this.loop(m);
    else ctx.net.relay(id, m);
  }
  sendToMany(ids, m) {
    const others = ids.filter((id) => id !== ctx.myId && !isBotId(id));
    if (others.length) ctx.net.relay(others, m);
    if (ids.includes(ctx.myId)) this.loop(m);
  }
  /** Host'un kendi istemcisine: yeniden giriş (re-entrancy) olmasın diye mikro-görev kuyruğu. */
  loop(m) {
    queueMicrotask(() => ctx.client?.onMessage(ctx.myId, m));
  }

  systemChat(text) {
    this.broadcast({ t: 'chat', ch: 'sys', text });
  }

  // ------------------------------------------------------------------ kişisel durum
  sendMe(id) {
    const S = this.state;
    const st = S.players[id];
    if (!st || isBotId(id)) return; // botların istemcisi yok
    const w = this.combat.weaponOf(id);
    const mag = w ? E[w].magazine || 0 : 0;
    this.sendTo(id, {
      t: 'me',
      hp: Math.max(0, Math.round(st.hp)),
      alive: st.alive,
      ammo: mag ? st.ammo : null,
      mag,
      reload: st.reloadLeft > 0 ? Math.round(st.reloadLeft * 10) / 10 : 0,
      abilityCd: Math.round(st.abilityCd * 10) / 10,
      baiter: S.baiterId === id,
      baiterUsed: S.baiterUsed,
      knifeAway: st.role === 'killer' && S.knife.s !== 'held',
      mediumTarget: st.mediumTarget,
      mediumMutual: st.mediumMutual,
      mediumPick: (S.nightNo || 0) > 0 && st.mediumNight === S.nightNo ? st.mediumPick : null, // bu gece seçtiği kişi (gece başına 1 kişi)
      s2gUsed: st.role === 's2g' && st.s2gNight === S.nightNo, // bu gece fermuarını kullandı mı
      umaciLeft: Math.round((st.umaciLeft || 0) * 10) / 10, // Umacı: görünmezlikten kalan süre (sn)
      umaciUsed: st.role === 'umaci' && st.umaciNight === (S.nightNo || 0), // Umacı: bu gece yeteneğini kullandı mı
      items: st.items || [], // gizli eşyalar (slot 3, 4, 5 … sırasıyla)
      slot: st.slot || 1,
      god: !!S.dbg?.[id]?.god,
    });
  }

  /** Oyuncuya "kim neyi biliyor" bilgisini gönderir. */
  sendVis(id) {
    if (isBotId(id)) return;
    const S = this.state;
    const st = S.players[id];
    if (!st) {
      this.sendTo(id, { t: 'vis', role: null, v: {} });
      return;
    }
    const lover = loverPartner(S.lovers, id);
    // Debug odasında (ve TrollHacks açıkken) herkes herkesin rolünü görür (TAB listesi): ölü oyuncunun görünürlüğüyle hesaplanır.
    const view = this.debug || this.trollOk(id) ? { ...S, players: { ...S.players, [id]: { ...st, alive: false } } } : S;
    this.sendTo(id, { t: 'vis', role: st.role, v: computeVisibility(id, view), lover, baiter: S.baiterId === id });
  }
  sendVisToAll() {
    for (const id of this.humanIds()) this.sendVis(id);
  }

  // ------------------------------------------------------------------ gelen mesajlar
  onMessage(from, d) {
    if (!d || typeof d.t !== 'string') return;
    const S = this.state;
    const st = S.players[from];
    const live = S.phase === 'playing' && st?.alive;
    const w = ctx.world;
    switch (d.t) {
      case 'hello':
        this.onHello(from);
        break;
      case 'pos':
        this.onPos(from, d);
        break;
      case 'act':
        if (live) this.onAct(from, d.a);
        break;
      case 'grab':
        if (live) w.grab.hostGrab(from, d);
        break;
      case 'drop':
        w.grab.hostDrop(from, d);
        break;
      case 'throw':
        w.grab.hostThrow(from, d);
        break;
      case 'carry':
        if (live || !d.on) ctx.corpses.hostCarry(from, d);
        break;
      case 'knifePickup':
        this.combat.onKnifePickup(from);
        break;
      case 'equip':
        this.combat.onEquip(from, !!d.on, d.slot);
        break;
      case 'fire':
        this.combat.onFire(from, d);
        break;
      case 'alt':
        this.combat.onAlt(from, d);
        break;
      case 'reload':
        this.combat.onReload(from);
        break;
      case 'ability':
        this.combat.onAbility(from, d);
        break;
      case 'baiter':
        this.combat.onBaiter(from, d);
        break;
      case 'sound':
        this.combat.onSound(from, d);
        break;
      case 'chat':
        this.onChat(from, d);
        break;
      case 'spec':
        if (st && !st.alive) st.spec = typeof d.id === 'string' ? d.id : null;
        break;
      case 'troll': // TrollHacks: misafir konsoldan açtı / kapattı (yetkiyi trollOk denetler)
        this.onTroll(from, !!d.on);
        break;
      case 'trollOp':
        this.trollOp(from, d);
        break;
      default:
        break;
    }
  }

  onPos(from, d) {
    if (![d.x, d.y, d.z].every(Number.isFinite)) return;
    const p = ctx.players.get(from);
    if (!p) return;
    if (from !== ctx.myId) p.applyNet(d);
    this.posBuf.set(from, d);
    if (d.h) ctx.world.grab.hostOnHoldPose(from, d.h);
    if (d.c) ctx.corpses.hostOnCarryPose(from, d.c);
  }

  onAct(from, a) {
    if (!a || typeof a.k !== 'string') return;
    const ev = ctx.world.hostAct(a, { from });
    if (!ev) return;
    this.broadcast({ t: 'ev', e: ev });
  }

  /**
   * Bedeni olan (canlı) oyuncular: [{ id, pos, wx, wz, crouch }] — pos ayak konumu.
   * Kapı çarpması, idam alanı ve dönen tablolar (midPaints.js) bunu kullanır. wx/wz: oyuncunun istediği yatay hız (konum paketinden).
   */
  bodies() {
    const out = [];
    for (const [id, p] of ctx.players.map) {
      if (!this.state.players[id]?.alive) continue;
      const net = this.posBuf.get(id);
      out.push({ id, pos: truePos(p), wx: net?.wx || 0, wz: net?.wz || 0, crouch: !!p.crouch });
    }
    return out;
  }

  /** Serbest dönen tabloları (MidPaint_*) ilerletir: oyuncu itişi + eşya darbeleri + engel testi + ağ yayını. Yalnızca tur sürerken oyuncular iter. */
  tickMidPaints(dt) {
    const mp = ctx.world.midPaints;
    if (!mp?.list.length) return;
    mp.hostUpdate(dt, this.state.phase === 'lobby' ? [] : this.bodies());
  }

  /** Hareket halindeki kapı bir oyuncuya çarparsa yönünü tersine çevirir (doors.js → hostBlockCheck). */
  checkDoors(dt) {
    const doors = ctx.world.doors;
    if (!doors.doors.size || this.state.phase === 'lobby') return;
    for (const e of doors.hostBlockCheck(this.bodies(), dt)) this.broadcast({ t: 'ev', e });
  }

  /** İdam şalteri AÇIKKEN alandaki canlılara düzenli hasar (execution.js → hostTick). Yalnızca tur sürerken. */
  tickExecution(dt) {
    const ex = ctx.world.execution;
    if (!ex.on || this.state.phase !== 'playing') {
      ex.acc = 0;
      return;
    }
    for (const h of ex.hostTick(dt, this.bodies())) this.combat.damage(h.id, h.dmg, null, 'execution');
  }

  /** Yeni gelen oyuncunun tam senkronu (geç katılanlar o round için izleyici olur). */
  onHello(from) {
    const S = this.state;
    if (S.phase !== 'lobby' && !S.players[from]) {
      S.players[from] = {
        role: 'civilian', alive: false, hp: 0, spectator: true, eq: 0, slot: 1, items: [], ammoMap: {}, ammo: 0, reloadLeft: 0, cdLeft: 0, soundCd: 0, frozen: 0,
        abilityCd: 0, fuse: 0, sleepLeft: 0, mediumTarget: null, mediumMutual: false, spec: null,
      };
    }
    const alive = {};
    for (const [id, st] of Object.entries(S.players)) alive[id] = st.alive ? 1 : 0;
    const roles = {};
    if (S.phase === 'ended') for (const [id, st] of Object.entries(S.players)) if (!st.spectator) roles[id] = st.role;
    this.sendTo(from, {
      t: 'sync',
      phase: S.phase,
      round: S.round,
      mode: S.mode,
      time: S.time,
      limit: S.limit,
      revealLeft: S.revealLeft,
      endLeft: S.endTimer,
      winner: S.winner,
      roles,
      alive,
      idn: S.idn,
      knife: S.knife,
      hostId: ctx.myId,
      settings: S.settings,
      world: ctx.world.getState(),
      corpses: ctx.corpses.getState(),
    });
    this.sendVis(from);
    this.sendMe(from);
    if (this.debug && S.phase !== 'lobby' && S.players[from]?.spectator) {
      this.sendTo(from, { t: 'note', text: 'Debug odası: bir sonraki "Turu yenile" ile oyuna girersin.' });
      this.systemChat(`${this.nameOf(from)} izleyici olarak katıldı. Host "Turu yenile" derse oyuna dahil olur.`);
    }
  }

  /** Sunucudan "oyuncu ayrıldı" geldiğinde (oyuncu varlığı henüz silinmeden) çağrılır. */
  onPeerLeft(id) {
    const S = this.state;
    const st = S.players[id];
    this.posBuf.delete(id);
    this.chatLast.delete(id);
    this.lastRoutes.delete(id);
    delete S.trolls[id];
    if (isBotId(id)) {
      // debug botu kaldırıldı: sessizce sil (ölüm / ceset olayı yok)
      delete S.players[id];
      delete S.debugRoles[id];
      delete S.botPos[id];
      delete S.dbg[id];
      delete S.idn[id];
      delete S.spawns[id];
      return;
    }
    ctx.world.grab.hostRelease(id);
    ctx.corpses.hostRelease(id);
    if (!st) return;
    if (st.alive && (S.phase === 'playing' || S.phase === 'reveal')) {
      if (S.phase === 'reveal') {
        st.alive = false;
        st.hp = 0;
        this.rounds.checkWin();
      } else this.combat.kill(id, null, 'left');
    }
    if (S.baiterId === id) S.baiterId = null;
    st.left = true;
    st.spectator = true;
    st.alive = false;
    if (S.phase === 'lobby') delete S.players[id];
  }

  // ------------------------------------------------------------------ sohbet
  onChat(from, d) {
    const S = this.state;
    const C = GAME_CONFIG.chat;
    const text = cleanText(d.text, C.maxLength);
    if (!text) return;
    if (S.dbg?.[from]?.mute) {
      this.sendTo(from, { t: 'note', text: 'Host seni susturdu.' }); // debug: susturulan yazamaz da
      return;
    }
    const nowMs = Date.now();
    if (nowMs - (this.chatLast.get(from) || 0) < C.cooldownMs) return;
    this.chatLast.set(from, nowMs);
    const st = S.players[from];
    const idn = S.idn[from];
    const inGame = S.phase === 'playing' || S.phase === 'reveal';
    let ch = 'all';
    let label = this.nameOf(from);
    let color = 0xffffff;
    let recipients = this.humanIds();
    if (S.phase !== 'lobby') {
      label = idn?.l || `${this.nameOf(from)} (izleyici)`;
      color = idn?.c ?? 0x9aa4b2;
    }
    if (inGame) {
      if (!st || !st.alive) {
        ch = 'dead';
        if (S.settings.deadChat !== 'all') {
          recipients = recipients.filter((id) => !S.players[id]?.alive);
        }
      } else {
        // yaşayanlar yalnızca yakındakilere yazabilir (yakınlık sohbeti)
        ch = 'say';
        const me = ctx.players.get(from);
        recipients = recipients.filter((id) => {
          if (id === from) return true;
          const o = S.players[id];
          const op = ctx.players.get(id);
          if (!o?.alive || !me || !op) return false;
          return truePos(me).distanceTo(truePos(op)) <= V.shoutDistance;
        });
      }
    }
    this.sendToMany(recipients, { t: 'chat', from, ch, text, l: label, c: color });
  }

  // ------------------------------------------------------------------ yönetim (host arayüzünden)
  startGame() {
    const S = this.state;
    if (S.phase === 'reveal' || S.phase === 'playing') return false;
    return this.rounds.startRound();
  }
  backToLobby() {
    this.rounds.toLobby();
  }
  setSettings(patch) {
    const S = this.state;
    S.settings = { ...S.settings, ...patch };
    ctx.net.roomUpdate({ settings: S.settings });
  }

  // ------------------------------------------------------------------ debug odası (yalnızca host; settings.debug === true)
  /** Turu baştan başlatır: herkes yeniden doğar (ölüler dirilir), botlar bulundukları yerde kalır. */
  debugRestart() {
    if (!this.debug) return false;
    return this.rounds.startRound();
  }

  /** Rolü uygular (yayın yapmaz): kayıt + (tur sürüyorsa) taze oyuncu durumu. Dönüş: tur sürerken uygulandı mı. */
  _applyRole(id, roleId) {
    const S = this.state;
    S.debugRoles[id] = roleId;
    const st = S.players[id];
    if (!st || st.spectator || (S.phase !== 'playing' && S.phase !== 'reveal')) return false;
    const fresh = newPlayerState(roleId);
    fresh.alive = st.alive;
    fresh.hp = st.alive ? st.hp : 0;
    fresh.spec = st.spec;
    fresh.items = st.items || []; // gizli eşyalar rol değişince kalır
    S.players[id] = fresh;
    // Tek bıçak: katil olan bıçağı alır; katil rolünden çıkan bıçaktan kurtulur.
    if (roleId === 'killer') this.combat.knifeBack(id, false);
    else if (S.knife.from === id) {
      S.knife = { s: 'held', p: [0, 0, 0], v: [0, 0, 0], ret: 0, delay: 0, from: null };
      this.broadcast({ t: 'knife', s: 'held' });
    }
    if (S.baiterId === id) S.baiterId = null;
    return true;
  }

  /** Bir oyuncunun (ya da botun) rolünü seçer. Tur sürüyorsa anında uygulanır, değilse tur başında geçerli olur. Aşık rolü otomatik eşlenir (bkz. _relinkLovers). */
  debugSetRole(id, roleId) {
    if (!this.cheat || !ROLES[roleId] || !this.connectedIds().includes(id)) return;
    if (!this._applyRole(id, roleId)) return;
    this._relinkLovers();
    this.sendVisToAll();
    this.sendMe(id);
  }

  /**
   * Aşık rolündeki oyuncuları eşler: ikisi de hâlâ Aşık olan kurulu çiftler korunur, eşsiz Aşıklar sırayla (oyuncu sırasıyla) birbirine bağlanır.
   * Rol değişince çağrılır: rolü Aşık'tan çıkanın çifti bozulur (eşi eşsiz kalır ya da başka eşsiz Aşıkla eşleşir). Debug odasında çiftler sonraki turlara taşınır (S.debugLovers).
   */
  _relinkLovers() {
    const S = this.state;
    if (S.phase !== 'playing' && S.phase !== 'reveal') return;
    const isL = (id) => S.players[id]?.role === 'lover' && !S.players[id].spectator;
    const old = S.lovers || [];
    const next = [];
    for (let i = 0; i + 1 < old.length; i += 2) if (isL(old[i]) && isL(old[i + 1])) next.push(old[i], old[i + 1]);
    const free = Object.keys(S.players).filter((id) => isL(id) && !next.includes(id));
    for (let i = 0; i + 1 < free.length; i += 2) next.push(free[i], free[i + 1]);
    S.lovers = next.length ? next : null;
    if (this.debug) S.debugLovers = next.slice();
  }

  /**
   * Sevgili çifti kur / kaldır (hile & debug paneli). b verilirse a ile b'nin ROLÜ "Aşık" olur ve ikisi birbirine bağlanır
   * (ikisinin eski bağları kopar; eski eşleri eşsiz Aşık kalır ya da başka eşsiz Aşıkla eşleşir). b yoksa a'nın çifti bozulur: ikisi de Masum olur.
   */
  debugSetLover(a, b = null) {
    const S = this.state;
    const usable = (id) => this._dbgOk(id) && !!S.players[id] && !S.players[id].spectator;
    if ((S.phase !== 'playing' && S.phase !== 'reveal') || !usable(a)) return false;
    if (b && (a === b || !usable(b))) return false;
    const touched = [a];
    if (b) {
      touched.push(b);
      this._applyRole(a, 'lover');
      this._applyRole(b, 'lover');
    } else {
      const p = loverPartner(S.lovers, a);
      if (p) touched.push(p);
      for (const id of touched) this._applyRole(id, 'civilian');
    }
    // a / b'nin eski bağlarını kopar, yeni bağı ekle; sonra eşsiz Aşıkları tamamla
    const keep = [];
    const old = S.lovers || [];
    for (let i = 0; i + 1 < old.length; i += 2) if (!touched.includes(old[i]) && !touched.includes(old[i + 1])) keep.push(old[i], old[i + 1]);
    if (b) keep.push(a, b);
    S.lovers = keep.length ? keep : null;
    this._relinkLovers();
    this.sendVisToAll();
    for (const id of touched) this.sendMe(id);
    return true;
  }

  /**
   * Hareketsiz (yapay zekasız) bot ekler. pos: [x, y, z] ayak konumu (verilmezse rastgele spawn), yaw: bakış yönü.
   * Bot, odadaki oyuncu listesine "bot-..." kimliğiyle girer; vurulabilir, ölünce ceset bırakır, sesi yoktur.
   */
  debugSpawnBot({ role = 'civilian', pos = null, yaw = 0 } = {}) {
    const S = this.state;
    if (!this.debug || !ROLES[role]) return null;
    if (this.connectedIds().filter(isBotId).length >= GAME_CONFIG.debug.maxBots) {
      this.systemChat(`En fazla ${GAME_CONFIG.debug.maxBots} bot eklenebilir.`);
      return null;
    }
    let at = pos;
    let face = yaw;
    if (!at) {
      const sp = ctx.world.randomSpawn();
      at = [sp.pos.x, sp.pos.y, sp.pos.z];
      face = sp.yaw;
    }
    const id = ctx.net.addBot('Bot');
    if (!id) return null;
    const p = [round3(at[0]), round3(at[1]), round3(at[2]), round3(face)];
    S.botPos[id] = p;
    S.debugRoles[id] = role;
    if (S.phase === 'reveal' || S.phase === 'playing') {
      S.players[id] = newPlayerState(role);
      S.idn[id] = makeIdentities([id], { [id]: role }, S.mode)[id];
      const botFace = FACES.pick(1)[0];
      if (botFace) S.idn[id].f = botFace;
      S.spawns[id] = p.slice();
      this.seedBot(id);
      this.broadcast({ t: 'bot', id, p, idn: S.idn[id] });
      this._relinkLovers(); // Aşık rolüyle eklenen bot, eşsiz bir Aşıkla eşlenir
      this.sendVisToAll();
    }
    return id;
  }

  /** Botun sabit konum paketini hazırlar (poss içinde yayınlanır: sonradan gelenler de botu doğru yerde görür). */
  seedBot(id) {
    const p = this.state.botPos[id];
    if (!p) return;
    this.posBuf.set(id, { x: p[0], y: p[1], z: p[2], yaw: p[3], pitch: 0, m: 0, f: 0, tl: 1, tk: 0, h: null, c: null });
  }

  debugRemoveBot(id) {
    if (!this.debug || !isBotId(id)) return;
    this.broadcast({ t: 'corpseGone', id }); // varsa cesedi de kalksın
    ctx.net.removeBot(id);
  }

  debugClearBots() {
    for (const id of this.connectedIds().filter(isBotId)) this.debugRemoveBot(id);
  }

  // ------------------------------------------------------------------ debug: oyuncu işlemleri (host paneli; botlar da hedef olabilir)
  _dbgOk(id) {
    return this.cheat && this.connectedIds().includes(id);
  }

  debugFlagOf(id, key) {
    return !!this.state.dbg?.[id]?.[key];
  }

  /** Debug işareti: god (ölümsüz) · ghost (görünmez) · noclip · mute (susturulmuş). Sahibine 'dbgFlag' / 'mute' gider. */
  debugFlag(id, key, on) {
    if (!this._dbgOk(id) || !['god', 'ghost', 'noclip', 'mute'].includes(key)) return;
    const f = (this.state.dbg[id] = this.state.dbg[id] || {});
    f[key] = !!on;
    if (key === 'mute') {
      this.sendTo(id, { t: 'mute', on: f.mute ? 1 : 0 });
      this.routeT = 99; // ses yolları hemen yenilensin
    } else this.sendTo(id, { t: 'dbgFlag', key, on: f[key] ? 1 : 0 });
    this.sendMe(id);
  }

  debugKill(id) {
    if (!this._dbgOk(id) || !this.state.players[id]?.alive) return;
    this.combat.kill(id, null, 'debug', null, true); // ölümsüzlüğü de aşar
  }

  debugExplode(id) {
    if (!this._dbgOk(id) || !this.state.players[id]) return;
    this.combat.explode(id);
  }

  /** Öleni diriltir. at: 'spawn' (doğma noktası) | 'corpse' (cesedinin durduğu yer; ceset yok olur). */
  debugRevive(id, at = 'spawn') {
    const S = this.state;
    const st = S.players[id];
    if (!this._dbgOk(id) || !st || st.alive || st.spectator || (S.phase !== 'playing' && S.phase !== 'reveal')) return false;
    let pos = null;
    let yaw = ctx.players.get(id)?.yaw || 0;
    if (at === 'corpse') pos = ctx.corpses.hostFeetOf(id);
    const fromCorpse = !!pos;
    if (!pos) {
      const sp = S.spawns[id];
      if (!sp) return false;
      pos = { x: sp[0], y: sp[1], z: sp[2] };
      yaw = sp[3] ?? yaw;
    }
    const fresh = newPlayerState(st.role);
    fresh.items = st.items || [];
    S.players[id] = fresh;
    const p = [round3(pos.x), round3(pos.y), round3(pos.z)];
    if (isBotId(id)) {
      S.botPos[id] = [...p, round3(yaw)];
      this.seedBot(id);
    }
    if (fromCorpse) this.broadcast({ t: 'corpseGone', id }); // cesedinde dirilince ceset kalkar
    this.broadcast({ t: 'revive', id, p, yaw: round3(yaw) });
    this.sendVisToAll();
    this.sendMe(id);
    return true;
  }

  /** Oyuncuyu / botu verilen konuma taşır (botlar host'ta sabit durur: konum paketi güncellenir). */
  _moveTo(id, x, y, z, yaw) {
    const p = [round3(x), round3(y), round3(z)];
    if (isBotId(id)) {
      this.state.botPos[id] = [...p, round3(yaw)];
      this.seedBot(id);
    } else this.sendTo(id, { t: 'teleport', p, yaw: round3(yaw) });
  }

  /** id → hedefin hemen arkasına (duvar varsa yaklaştırılarak). */
  debugGoto(id, toId) {
    const tp = ctx.players.get(toId);
    if (!this._dbgOk(id) || !tp || id === toId) return;
    const t = truePos(tp);
    const yaw = tp.yaw || 0;
    const o = new THREE.Vector3(t.x, t.y + 1, t.z);
    const d = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const hit = ctx.world.collision.raycast(o, d, 1);
    const dist = hit ? Math.max(0, hit.distance - 0.45) : 0.9;
    this._moveTo(id, t.x + d.x * dist, t.y, t.z + d.z * dist, yaw);
  }

  /** id → whoId'nin tam önüne (bakışının 1.8 m ilerisine; duvar varsa yaklaştırılarak), ona dönük. */
  debugBring(id, whoId) {
    const wp = ctx.players.get(whoId);
    if (!this._dbgOk(id) || !wp || id === whoId) return;
    const w = truePos(wp);
    const yaw = wp.yaw || 0;
    const o = new THREE.Vector3(w.x, w.y + 1, w.z);
    const d = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const hit = ctx.world.collision.raycast(o, d, 1.8);
    const dist = hit ? Math.max(0.4, hit.distance - 0.45) : 1.8;
    this._moveTo(id, w.x + d.x * dist, w.y, w.z + d.z * dist, yaw + Math.PI);
  }

  /** Ekrana yazı: id verilirse yalnızca o oyuncunun, null ise herkesin ekranına (dur sn). */
  debugText(id, text, dur = 6) {
    const t = cleanText(text, 160);
    if (!this.cheat || !t) return;
    const m = { t: 'screenText', text: t, dur: Math.max(1, Math.min(30, Number(dur) || 6)) };
    if (id) this.sendTo(id, m);
    else this.broadcast(m);
  }

  /** Gizli eşya ver / al. Slot sırası verilme sırasına göre: ilk verilen 3, sonraki 4, ... */
  debugGive(id, item, on = true) {
    const st = this.state.players[id];
    if (!this._dbgOk(id) || !st || !E[item]?.item) return;
    const items = (st.items = st.items || []);
    const i = items.indexOf(item);
    if (on && i < 0) items.push(item);
    else if (!on && i >= 0) {
      const held = st.slot === i + 3;
      items.splice(i, 1);
      if (held) this.combat.onEquip(id, 0, 1);
      else if (st.slot > i + 3) st.slot--; // sonrakilerin slot numarası kayar
    }
    const f = (this.state.dbg[id] = this.state.dbg[id] || {});
    f.items = items.slice(); // "Turu yenile" sonrası da kalsın
    this.sendMe(id);
  }

  // ------------------------------------------------------------------ TrollHacks (normal oyunda konsoldan açılır; bkz. troll.js)
  /** Bu oyuncu troll araçlarını kullanabilir mi? Debug odasında host her zaman; normal oyunda host kendi konsolundan açtıysa,
   *  misafir ise konsolda açtıysa VE host izin veriyorsa (settings.troll !== false). */
  trollOk(id) {
    if (id === ctx.myId) return this.debug || TrollHacks.enabled;
    return this.state.settings.troll !== false && !!this.state.trolls[id];
  }

  /** Misafir konsolda TrollHacks'i açtı / kapattı: cevap olarak izin durumu gider; TAB listesi rolleri açılır / kapanır. */
  onTroll(from, on) {
    const S = this.state;
    if (isBotId(from) || from === ctx.myId) return;
    const was = !!S.trolls[from];
    if (on) S.trolls[from] = true;
    else delete S.trolls[from];
    this.sendTo(from, { t: 'trollAck', ok: on && S.settings.troll !== false ? 1 : 0 });
    if (was !== on) this.sendVis(from);
  }

  /** Troll işlemi: rol · sevgili · işaret · öldür · patlat · diriltme · yanına git · önüme getir · ekrana yazı · gizli eşya. Bot ekleme / tur yenileme YOKTUR. */
  trollOp(from, d) {
    if (!this.trollOk(from) || !this.connectedIds().includes(from)) return false;
    const a = Array.isArray(d?.a) ? d.a : [];
    const id = typeof a[0] === 'string' ? a[0] : null;
    const s1 = typeof a[1] === 'string' ? a[1] : null;
    let ok = true;
    this._cheat = true;
    try {
      switch (d.op) {
        case 'role': this.debugSetRole(id, s1); break;
        case 'lover': ok = this.debugSetLover(id, s1); break; // s1 = eş (yoksa a'nın bağı kalkar)
        case 'flag': this.debugFlag(id, s1, !!a[2]); break;
        case 'kill': this.debugKill(id); break;
        case 'explode': this.debugExplode(id); break;
        case 'revive': ok = this.debugRevive(id, s1 === 'corpse' ? 'corpse' : 'spawn'); break;
        case 'goto': this.debugGoto(from, id); break; // işlemi yapan → hedefin yanına
        case 'bring': this.debugBring(id, from); break; // hedef → işlemi yapanın önüne
        case 'text': this.debugText(id, s1, a[2]); break; // id yoksa herkese
        case 'give': this.debugGive(id, s1, !!a[2]); break;
        default: ok = false;
      }
    } finally {
      this._cheat = false;
    }
    if (!ok && d.op === 'revive') this.sendTo(from, { t: 'note', text: 'Diriltilemedi: oyuncu ölü değil.' });
    this.sendTrollInfo();
    return ok;
  }

  /** Troll araçları açık misafirlere gizli bilgi: id → [rol, hayatta, işaretler (g h n m), gizli eşyalar]; baiter; sevgililer. Host kendi durumunu doğrudan okur. */
  sendTrollInfo() {
    const S = this.state;
    if (S.phase === 'lobby') return;
    const ids = Object.keys(S.trolls).filter((id) => id !== ctx.myId && this.trollOk(id) && this.connectedIds().includes(id));
    if (!ids.length) return;
    const p = {};
    for (const [id, st] of Object.entries(S.players)) {
      if (st.spectator) continue;
      const f = S.dbg?.[id] || {};
      p[id] = [st.role, st.alive ? 1 : 0, `${f.god ? 'g' : ''}${f.ghost ? 'h' : ''}${f.noclip ? 'n' : ''}${f.mute ? 'm' : ''}`, st.items || []];
    }
    this.sendToMany(ids, { t: 'trollInfo', p, b: S.baiterId, l: S.lovers });
  }

  // ------------------------------------------------------------------ her kare
  update(dt) {
    const S = this.state;
    ctx.world.grab.hostUpdate(dt);
    ctx.corpses.hostUpdate(dt);
    this.combat.update(dt);
    this.rounds.update(dt);
    this.checkDoors(dt);
    this.tickExecution(dt);
    this.tickMidPaints(dt);

    if (this.posRate.tick(dt)) this.flushPositions();

    this.routeT += dt;
    if (this.routeT >= V.routeInterval) {
      this.routeT = 0;
      this.routeVoice();
    }

    this.trollT += dt;
    if (this.trollT >= 0.7) {
      this.trollT = 0;
      this.sendTrollInfo();
    }

    this.meT += dt;
    if (this.meT >= 2) {
      this.meT = 0;
      if (S.phase === 'playing') for (const id of Object.keys(S.players)) if (S.players[id].alive && !isBotId(id)) this.sendMe(id);
    }
  }

  /** Konumları tek paket halinde yayınlar. */
  flushPositions() {
    const S = this.state;
    const l = {};
    let n = 0;
    for (const [id, d] of this.posBuf) {
      const st = S.players[id];
      if (S.phase !== 'lobby' && !st?.alive) continue;
      l[id] = {
        x: d.x, y: d.y, z: d.z, yaw: d.yaw, pitch: d.pitch, m: d.m, cr: d.cr, f: d.f, tl: d.tl, tk: d.tk,
        h: d.h ? { i: d.h.i } : null,
        c: d.c ? { i: d.c.i } : null, // taşınan cesedin kimliği (hedef noktası yalnızca host'a lazım)
        e: this.combat.eqVisible(id) ? this.combat.weaponOf(id) : 0,
        ar: d.ar ? 1 : 0, // havada (animasyon)
        cl: d.cl ? 1 : 0, // tırmanıyor (animasyon)
        iv: S.dbg?.[id]?.ghost ? 1 : 0, // debug: görünmez (yalnızca host belirler)
        um: S.phase === 'playing' && st?.umaciLeft > 0 ? 1 : 0, // Umacı: görünmezlik açık (yalnızca host belirler)
      };
      n++;
    }
    if (n) this.broadcast({ t: 'poss', l });
  }

  // ------------------------------------------------------------------ yakınlık sesi: kim kimi duyar?
  routeVoice() {
    const S = this.state;
    const silent = S.mode === 'silent'; // sessiz modda yalnızca hayattaki dedektif konuşur (herkes onu dinler)
    if (S.mode !== 'voice' && !silent) {
      for (const id of this.humanIds()) this.pushRoute(id, []);
      return;
    }
    const ids = this.humanIds(); // botların sesi yok
    const rangeOf = (p) => [V.whisperDistance, V.normalDistance, V.shoutDistance][p?.talkLevel] ?? V.normalDistance;
    const inGame = S.phase === 'playing' || S.phase === 'reveal';
    const cand = []; // { a, b, ka, kb, pri }
    const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

    const specPos = (id) => {
      const st = S.players[id];
      const target = st?.spec ? ctx.players.get(st.spec) : null;
      const tp = target && S.players[st.spec]?.alive ? target : ctx.players.get(id);
      return tp ? truePos(tp) : null;
    };

    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i];
        const b = ids[j];
        const pa = ctx.players.get(a);
        const pb = ctx.players.get(b);
        if (!pa || !pb) continue;
        let ka = null; // a, b'yi nasıl duyar (0 yakınlık, 1 tam ses, 2 sessiz)
        let kb = null;
        let pri = 5;
        if (silent) {
          const det = (id) => !!S.players[id]?.alive && S.players[id].role === 'detective';
          if (!inGame || (!det(a) && !det(b))) continue; // lobide / dedektif dışı çiftlerde ses bağlantısı yok
        }
        if (!inGame) {
          ka = kb = 1; // lobi / tur sonu: herkes herkesle konuşabilir
        } else {
          const sa = S.players[a];
          const sb = S.players[b];
          const aliveA = !!sa?.alive;
          const aliveB = !!sb?.alive;
          const ex = this.links.has(key(a, b));
          const margin = ex ? V.disconnectMargin : V.connectMargin;
          if (!aliveA && !aliveB) {
            ka = kb = 1; // hayalet kanalı
            pri = 3;
          } else if (aliveA && aliveB) {
            const dist = truePos(pa).distanceTo(truePos(pb));
            if (dist <= Math.max(rangeOf(pa), rangeOf(pb)) + margin) ka = kb = 0;
            pri = dist;
          } else {
            const deadId = aliveA ? b : a;
            const liveId = aliveA ? a : b;
            const lp = specPos(deadId);
            const live = ctx.players.get(liveId);
            if (lp && live) {
              const dist = lp.distanceTo(truePos(live));
              if (dist <= rangeOf(live) + margin) {
                // ölü yakındakini duyar (0); yaşayan ölüyü duymaz (2)
                if (aliveA) {
                  ka = 2;
                  kb = 0;
                } else {
                  ka = 0;
                  kb = 2;
                }
                pri = dist;
              }
            }
          }
          // Medyum bağlantısı
          const mediumLink = (mId, tId) => {
            const m = S.players[mId];
            return m?.alive && m.mediumTarget === tId && S.players[tId]?.alive;
          };
          if (mediumLink(a, b)) {
            ka = 1;
            if (kb === null || kb === 2) kb = S.players[a].mediumMutual ? 1 : 0;
            else if (S.players[a].mediumMutual) kb = 1;
            pri = 0;
          } else if (mediumLink(b, a)) {
            kb = 1;
            if (ka === null || ka === 2) ka = S.players[b].mediumMutual ? 1 : 0;
            else if (S.players[b].mediumMutual) ka = 1;
            pri = 0;
          }
        }
        if (ka === null || kb === null) continue;
        if (S.dbg?.[b]?.mute) ka = 2; // debug: susturulan kimse tarafından duyulmaz
        if (S.dbg?.[a]?.mute) kb = 2;
        cand.push({ a, b, ka, kb, pri });
      }
    }

    // oyuncu başına bağlantı sınırı (en yakınlar / medyum öncelikli)
    cand.sort((x, y) => x.pri - y.pri);
    const count = {};
    const routes = new Map(ids.map((id) => [id, []]));
    const nextLinks = new Set();
    for (const c of cand) {
      if ((count[c.a] || 0) >= V.maxConnectionsPerPeer || (count[c.b] || 0) >= V.maxConnectionsPerPeer) continue;
      count[c.a] = (count[c.a] || 0) + 1;
      count[c.b] = (count[c.b] || 0) + 1;
      routes.get(c.a).push([c.b, c.ka]);
      routes.get(c.b).push([c.a, c.kb]);
      nextLinks.add(key(c.a, c.b));
    }
    this.links = nextLinks;
    for (const [id, list] of routes) this.pushRoute(id, list);
  }

  pushRoute(id, list) {
    list.sort((x, y) => (x[0] < y[0] ? -1 : 1));
    const s = JSON.stringify(list);
    if (this.lastRoutes.get(id) === s) return;
    this.lastRoutes.set(id, s);
    this.sendTo(id, { t: 'vr', l: list });
  }

}
