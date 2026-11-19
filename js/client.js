// İSTEMCİ: ağdan gelen her mesajı oyuna uygular (host dahil herkes için aynı kod) ve yerel konumu gönderir.
//
// Host → istemci mesajları (m.t):
//   sync (yeni gelene tam durum) · round (yeni tur) · go (tur başladı) · end (tur bitti) · lobby
//   vis{role,v,lover,baiter} (gizli bilgiler) · me (can/mermi/bekleme) · poss (konum paketi) · ev (dünya olayı)
//   itemHeld · itemFree · items · corpseCarry · rag (ceset noktaları) · knife · knifeReturn · shot · stab · zap · fuse · explosion · hit · death
//   sound · chat · teleport · freeze · baiterNotice · vr (ses rotaları) · note (kısa bilgi)
//   bot (debug: tur sürerken eklenen hareketsiz bot) · corpseGone (debug: silinen botun cesedi)
//   trollInfo · trollAck (TrollHacks: yetkili misafire roller / izin durumu; bkz. troll.js)
import * as THREE from 'three';
import { GAME_CONFIG } from './config.js';
import { ctx } from './context.js';
import { audio } from './audio.js';
import { HostGame } from './host.js';
import { TrollHacks } from './troll.js';
import { ROLES } from './roles.js';
import { Rate, round2 } from './util.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _mz = new THREE.Vector3();
const KNIFE_CAUSES = new Set(['knife', 'knifeThrow']); // bıçakla gelen hasar/ölüm: ses çalınmaz
const toVec = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const toIdentity = (i) => ({ label: i.l, color: i.c, colorName: i.cn, code: i.k, face: i.f || null }); // f: assets/faces dosya adı

export class GameClient {
  constructor() {
    this.posRate = new Rate(GAME_CONFIG.net.posHz);
    this.lastPos = null;
    this.lastPosAt = 0;
    this.lastSpec = null;
    this.bound = false;
    this.reported = false; // debug harita raporu bu oturumda yazıldı mı
    this.zips = new Map(); // S2G fermuar sesleri: s2g oyuncu id → { stopped, h }
  }

  // ------------------------------------------------------------------ bağlantı olayları
  attach(net) {
    if (this.bound) return;
    this.bound = true;
    net.on('joined', (m) => this.onJoined(m));
    net.on('roomInfo', (m) => this.onRoomInfo(m));
    net.on('msg', (m) => this.onNetMessage(m));
    net.on('peerLeft', (m) => this.onPeerLeft(m.id));
    net.on('kicked', () => {
      this.leave();
      ctx.ui.showMessage('Odadan çıkarıldın', 'Host seni odadan attı.');
    });
    net.on('error', (m) => ctx.ui.toast(m.msg || 'Hata'));
    net.on('close', (wasInRoom) => {
      if (wasInRoom) {
        this.leave(true);
        ctx.ui.showMessage('Bağlantı koptu', 'Host bağlantısı kesildi. Oda kapatıldı ve ana menüye dönüldü.');
      }
    });
  }

  onJoined(m) {
    ctx.myId = m.id;
    ctx.room = m.info;
    ctx.isHost = m.hostId === m.id;
    ctx.phase = 'lobby';
    ctx.role = null;
    ctx.vis = {};
    ctx.round = { n: 0, endsAt: 0, winner: null, limit: 0 };
    ctx.me = ctx.players.ensure(m.id, this.nameOf(m.id), true);
    ctx.me.setAlive(false);
    if (ctx.isHost) ctx.host = new HostGame();
    this.syncPlayers();
    ctx.ui.showLobby();
    ctx.voice?.onJoinedRoom();
    if (!ctx.isHost) this.toHost({ t: 'hello' });
  }

  nameOf(id) {
    return ctx.room?.players?.find((p) => p.id === id)?.name || id;
  }

  onRoomInfo(info) {
    ctx.room = info;
    ctx.isHost = info.hostId === ctx.myId;
    this.syncPlayers();
    ctx.ui.refreshLobby();
  }

  /** Oda listesiyle oyuncu varlıklarını eşitler. */
  syncPlayers() {
    const ids = new Set();
    for (const p of ctx.room.players) {
      ids.add(p.id);
      const existed = ctx.players.get(p.id);
      const e = ctx.players.ensure(p.id, p.name, p.id === ctx.myId);
      if (!existed) e.setAlive(false); // yeni gelen: tur başlayana kadar görünmez
    }
    for (const e of ctx.players.all()) if (!ids.has(e.id)) ctx.players.remove(e.id);
  }

  onPeerLeft(id) {
    if (ctx.room) ctx.room.players = ctx.room.players.filter((p) => p.id !== id);
    if (ctx.isHost) ctx.host?.onPeerLeft(id);
    ctx.voice?.dropPeer(id);
    // varlık, roomInfo ile birlikte silinecek (host mantığı önce çalışsın diye ertelendi)
    setTimeout(() => {
      if (!ctx.room?.players?.some((p) => p.id === id)) ctx.players.remove(id);
      ctx.ui.refreshLobby();
    }, 50);
  }


  leave(skipNet = false) {
    if (!skipNet) ctx.net.leave();
    ctx.host = null;
    ctx.isHost = false;
    ctx.myId = null;
    ctx.room = null;
    ctx.phase = 'menu';
    ctx.role = null;
    ctx.vis = {};
    ctx.me = null;
    ctx.voice?.stop();
    ctx.grab?.reset();
    this.reported = false;
    ctx.corpses.clear();
    ctx.knifeView?.reset();
    ctx.players.clear();
    ctx.world.reset();
    ctx.inventory?.reset();
    ctx.ui.showMenu();
  }

  // ------------------------------------------------------------------ gönderme
  /** Host'a mesaj (host'sak doğrudan işlenir). */
  toHost(d) {
    if (ctx.isHost) ctx.host?.onMessage(ctx.myId, d);
    else ctx.net.relay('host', d);
  }
  sendAct(a) {
    this.toHost({ t: 'act', a });
  }

  update(dt) {
    const me = ctx.me;
    if (!me || ctx.phase === 'lobby' || ctx.phase === 'menu') return;
    if (me.alive && this.posRate.tick(dt)) {
      const now = performance.now();
      const msg = {
        t: 'pos',
        x: round2(me.pos.x), y: round2(me.pos.y), z: round2(me.pos.z),
        yaw: round2(me.yaw), pitch: round2(me.pitch),
        m: me.speed, cr: me.crouch ? 1 : 0, f: me.flashlight ? 1 : 0, tl: me.talkLevel, tk: me.talking ? 1 : 0,
        h: ctx.grab.heldPayload(), c: ctx.corpses.heldPayload(),
        wx: round2(me.wishX || 0), wz: round2(me.wishZ || 0), // istenen yatay hız: plakaya yaslanıp dururken de itişi host bilsin (midPaints.js)
        ar: me.air ? 1 : 0, cl: me.climbing ? 1 : 0, iv: me.invisible ? 1 : 0, // animasyon: havada / tırmanıyor · debug: görünmez
      };
      const key = `${msg.x},${msg.y},${msg.z},${msg.yaw},${msg.pitch},${msg.m},${msg.cr},${msg.f},${msg.tl},${msg.tk},${msg.wx},${msg.wz},${msg.ar},${msg.cl},${msg.iv}`;
      const moving = key !== this.lastPos || msg.h || msg.c;
      if (moving || now - this.lastPosAt > 500) {
        this.lastPos = key;
        this.lastPosAt = now;
        this.toHost(msg);
      }
    }
    // ölü oyuncu izlediği kişiyi host'a bildirir (ses yönlendirmesi için)
    if (!me.alive) {
      const sid = ctx.movement.spectateId || null;
      if (sid !== this.lastSpec) {
        this.lastSpec = sid;
        this.toHost({ t: 'spec', id: sid });
      }
    }
  }

  // ------------------------------------------------------------------ gelen mesajlar
  onNetMessage({ from, d }) {
    if (ctx.isHost) ctx.host?.onMessage(from, d);
    else if (from === ctx.room?.hostId) this.onMessage(from, d);
  }

  onMessage(from, m) {
    if (!m || !ctx.me) return;
    switch (m.t) {
      case 'poss':
        this.onPositions(m.l);
        break;
      case 'ev':
        ctx.world.applyEvent(m.e);
        break;
      case 'items':
        ctx.world.grab.applySnapshot(m.l);
        break;
      case 'mp':
        ctx.world.midPaints.applySnapshot(m.l); // serbest dönen tablolar (host'tan ~15 Hz)
        break;
      case 'itemHeld':
        ctx.world.grab.onHeld(m);
        break;
      case 'itemFree':
        ctx.world.grab.onFree(m);
        break;
      case 'corpseCarry':
        ctx.corpses.onCarry(m);
        break;
      case 'rag':
        ctx.corpses.applySnapshot(m.l);
        break;
      case 'sync':
        this.onSync(m);
        break;
      case 'round':
        this.onRound(m);
        break;
      case 'go':
        this.onGo(m);
        break;
      case 'end':
        this.onEnd(m);
        break;
      case 'lobby':
        this.onLobby();
        break;
      case 'vis':
        this.onVis(m);
        break;
      case 'me':
        ctx.inventory.applyMe(m);
        break;
      case 'knife':
        if (m.s === 'flying' && m.from) ctx.players.get(m.from)?.playAction('throw'); // fırlatma animasyonu
        this.onKnife(m);
        break;
      case 'knifeReturn':
        ctx.inventory.onKnifeReturn(m.forced);
        break;
      case 'shot':
        this.onShot(m);
        break;
      case 'stab':
        this.onStab(m);
        break;
      case 'zap':
        this.onZap(m);
        break;
      case 'fuse':
        this.onFuse(m);
        break;
      case 'explosion':
        ctx.effects.explosion(toVec(m.p), m.r);
        audio.sfx('explosion', { pos: toVec(m.p), listener: ctx.sceneMgr.camera.position });
        break;
      case 'proj': // roket / plazma mermisi doğdu
        ctx.projectiles?.spawn(m);
        ctx.viewmodel?.onProj(m);
        ctx.players.get(m.from)?.playAction(m.k === 'rocket' ? 'rocket' : 'shoot');
        audio.sfx(m.k === 'rocket' ? 'rifle' : 'taser', { pos: toVec(m.p), listener: ctx.sceneMgr.camera.position, volume: 0.9 });
        break;
      case 'projEnd': // mermi bir şeye çarptı / kayboldu
        ctx.projectiles?.end(m);
        break;
      case 'bombPlant': // kurulan bomba (zaman ayarlı)
        ctx.projectiles?.plant(m);
        ctx.viewmodel?.onPlant(m);
        ctx.players.get(m.from)?.playAction('plant');
        break;
      case 'bombGone':
        ctx.projectiles?.unplant(m.id);
        break;
      case 'revive':
        this.onRevive(m);
        break;
      case 'dbgFlag': // debug: noclip / görünmezlik
        this.onDbgFlag(m);
        break;
      case 'trollInfo': // TrollHacks: roller / hayat / işaretler (host'tan, yalnızca yetkili misafire)
        TrollHacks.onInfo(m);
        break;
      case 'trollAck': // TrollHacks: host izin verdi / vermedi
        TrollHacks.onAck(m);
        break;
      case 'screenText': // debug: ekrana yazı
        ctx.ui.screenText(String(m.text || ''), (m.dur || 6) * 1000);
        break;
      case 'mute': // debug: susturuldun / susturma kalktı
        ctx.voice?.setForcedMute(!!m.on);
        ctx.ui.toast(m.on ? 'Host seni susturdu.' : 'Susturma kaldırıldı.', 2200);
        break;
      case 'hit':
        this.onHit(m);
        break;
      case 'death':
        this.onDeath(m);
        break;
      case 'sound':
        audio.playUrl(m.url, { volume: 0.9, maxConcurrent: 4 });
        ctx.radial?.markBusy(m.i, m.dur); // çalan ses bitene kadar menüde kilitli
        break;
      case 's2g':
        this.onS2g(m);
        break;
      case 'chat':
        ctx.chat.add(m);
        break;
      case 'note':
        ctx.ui.toast(String(m.text || ''), 3500);
        break;
      case 'bot':
        this.onBot(m);
        break;
      case 'corpseGone':
        ctx.corpses.remove(m.id);
        break;
      case 'teleport':
        ctx.ui.hideSleep(); // uyurgezer uyanır
        ctx.movement.teleport(toVec(m.p), m.yaw ?? null); // debug ışınlaması yön de verebilir
        audio.sfx('notify', { volume: 0.4 });
        break;
      case 'freeze':
        ctx.me.frozenLeft = Math.max(ctx.me.frozenLeft, m.dur || 1);
        if (m.sleep) ctx.ui.showSleep(m.dur || 1); // uyurgezer: ekran kararır
        break;
      case 'baiterNotice':
        ctx.ui.baiterNotice();
        audio.sfx('notify', { volume: 0.9 });
        break;
      case 'vr':
        ctx.voice?.setRoutes(m.l);
        break;
      default:
        break;
    }
  }

  onPositions(list) {
    for (const [id, e] of Object.entries(list)) {
      if (id === ctx.myId) continue;
      const p = ctx.players.get(id);
      if (!p) continue;
      p.applyNet(e);
      p.eq.out = !!e.e;
      if (e.e) p.eq.type = e.e;
    }
  }

  // ---- tur akışı ----
  onSync(m) {
    ctx.round = { n: m.round, endsAt: 0, winner: m.winner, limit: m.limit };
    if (m.settings) ctx.room.settings = m.settings;
    ctx.world.setState(m.world);
    ctx.corpses.setState(m.corpses);
    ctx.knifeView.apply(m.knife || { s: 'held' });
    for (const p of ctx.players.all()) {
      const idn = m.idn?.[p.id];
      if (idn) p.setIdentity(toIdentity(idn));
      p.setAlive(!!m.alive?.[p.id]);
    }
    if (m.phase === 'lobby') {
      ctx.phase = 'lobby';
      ctx.ui.showLobby();
    } else {
      ctx.phase = m.phase === 'ended' ? 'ended' : 'playing';
      ctx.round.endsAt = performance.now() / 1000 + Math.max(0, m.limit - m.time);
      ctx.round.revealUntil = m.phase === 'reveal' ? performance.now() / 1000 + m.revealLeft : 0;
      ctx.roundIds = new Set(Object.keys(m.alive || {}).filter((id) => !m.spectators?.includes?.(id)));
      ctx.ui.hideLobby();
      ctx.ui.showMessage('Tur devam ediyor', 'Bu tur izleyici olarak katılıyorsun. Bir sonraki turda oynayacaksın.', 3500);
      ctx.me.setAlive(false);
      ctx.movement.cycleSpectate(1);
      if (m.phase === 'ended') ctx.ui.showEnd({ winner: m.winner, roles: m.roles, wait: m.endLeft });
    }
  }

  onRound(m) {
    ctx.phase = 'playing';
    ctx.round = { n: m.n, endsAt: performance.now() / 1000 + m.reveal + m.limit, winner: null, limit: m.limit, reveal: m.reveal, goAt: 0 };
    ctx.role = null;
    ctx.vis = {};
    ctx.lover = null;
    ctx.endInfo = null;
    ctx.roundIds = new Set(m.ids.map((i) => i.id));
    ctx.me_state = { hp: GAME_CONFIG.player.maxHp, ammo: null, mag: 0, reload: 0, abilityCd: 0, baiter: false, baiterUsed: false, knifeAway: false };
    ctx.world.reset();
    ctx.corpses.clear();
    ctx.knifeView.reset();
    ctx.projectiles?.clear();
    ctx.inventory.reset();
    ctx.chat.onRound(m.n);
    for (const p of ctx.players.all()) {
      p.setAlive(false);
      p.flashlight = false;
      p.eq = { out: false, type: null };
    }
    for (const { id, name } of m.ids) {
      const p = ctx.players.ensure(id, name, id === ctx.myId);
      const sp = m.sp[id];
      p.setIdentity(toIdentity(m.idn[id]));
      p.setAlive(true);
      p.eq = { out: false, type: null };
      if (sp) {
        p.teleport(sp[0], sp[1], sp[2]);
        p.yaw = p.netYaw = sp[3];
      }
    }
    const sp = m.sp[ctx.myId];
    if (sp) {
      ctx.movement.teleport(new THREE.Vector3(sp[0], sp[1], sp[2]), sp[3]);
      ctx.movement.pitch = 0.15;
      ctx.me.frozenLeft = m.reveal;
    } else {
      ctx.me.setAlive(false);
      ctx.movement.cycleSpectate(1);
    }
    ctx.movement.spectateId = null;
    this.lastSpec = undefined;
    ctx.ui.hideLobby();
    ctx.ui.hideEnd();
    ctx.ui.showRoundIntro(m.n, m.reveal);
    ctx.input.requestLock?.();
    // Debug odasında harita raporu (bulunan / bulunamayan nesneler) konsola yazılır — oturum başına bir kez; sonra panelden istenebilir.
    if (ctx.room?.settings?.debug && !this.reported) {
      this.reported = true;
      ctx.world.logReport();
    }
  }

  onGo(m) {
    ctx.round.revealUntil = 0;
    ctx.round.goAt = performance.now() / 1000; // oyuncular arası çarpışmanın "hayalet süresi" (ilk ghostSeconds sn) buradan sayılır
    if (m?.limit > 0) ctx.round.endsAt = performance.now() / 1000 + m.limit;
    if (ctx.me) ctx.me.frozenLeft = 0;
    ctx.ui.hideRoundIntro();
    ctx.ui.banner('Tur başladı!', 1800);
    audio.sfx('notify', { volume: 0.6 });
  }

  stopAllZips() {
    for (const id of [...this.zips.keys()]) this.stopZip(id);
  }

  onEnd(m) {
    this.stopAllZips();
    ctx.phase = 'ended';
    ctx.round.winner = m.winner;
    ctx.endInfo = m;
    ctx.me_state.reload = 0;
    ctx.ui.hideRoundIntro();
    ctx.ui.showEnd(m);
    const myTeam = ctx.role?.team;
    if (m.winner === 'draw') audio.sfx('lose', { volume: 0.6 });
    else audio.sfx(myTeam === m.winner ? 'win' : 'lose', { volume: 0.7 });
    ctx.playerList?.refresh();
  }

  onLobby() {
    ctx.phase = 'lobby';
    ctx.role = null;
    ctx.vis = {};
    ctx.world.reset();
    ctx.corpses.clear();
    ctx.knifeView.reset();
    ctx.projectiles?.clear();
    ctx.inventory.reset();
    ctx.grab.reset?.();
    for (const p of ctx.players.all()) p.setAlive(false);
    ctx.ui.hideEnd();
    ctx.ui.hideRoundIntro();
    ctx.ui.showLobby();
  }

  /** Debug: tur sürerken eklenen hareketsiz bot (yerinde belirir). */
  onBot(m) {
    const p = ctx.players.ensure(m.id, this.nameOf(m.id), false);
    if (m.idn) p.setIdentity(toIdentity(m.idn));
    p.eq = { out: false, type: null };
    p.setAlive(true);
    p.teleport(m.p[0], m.p[1], m.p[2]);
    p.yaw = p.netYaw = m.p[3] || 0;
    p.pitch = p.netPitch = 0;
    ctx.roundIds?.add(m.id);
    ctx.playerList?.refresh();
  }

  onVis(m) {
    ctx.role = m.role ? ROLES[m.role] : null;
    ctx.vis = m.v || {};
    ctx.lover = m.lover || null;
    ctx.me_state.baiter = !!m.baiter;
    ctx.inventory.onRole();
    ctx.ui.onRole();
    ctx.playerList?.refresh();
  }

  // ---- savaş olayları ----
  onKnife(m) {
    ctx.knifeView.apply(m);
    if (ctx.role?.id === 'killer' && ctx.me?.alive) {
      if (m.s === 'flying' || m.s === 'landed') ctx.inventory.onKnifeAway();
    }
  }

  playerPos(id) {
    const p = ctx.players.get(id);
    return p ? _v.set(p.pos.x, p.pos.y + 1.2, p.pos.z).clone() : null;
  }

  /**
   * Birinci şahıs: atışın başlangıcı gözdür (nişan tam ekranın ortasından). Mermi izi / namlu ışığı ise
   * görsel olarak namludan başlar: benim atışımda ekranda görünen namlu ucundan, başkalarında gözün biraz önü-aşağısı-sağından.
   */
  onShot(m) {
    const o = toVec(m.o);
    const e = toVec(m.e);
    let start = o;
    if (m.from === ctx.myId) start = ctx.viewmodel?.muzzleWorld(_mz) || o;
    else {
      const d = _w.subVectors(e, o);
      if (d.lengthSq() > 1e-6) {
        d.normalize();
        const rx = -d.z;
        const rz = d.x;
        const rl = Math.hypot(rx, rz) || 1;
        start = o.clone().addScaledVector(d, 0.55);
        start.x += (rx / rl) * 0.2;
        start.y -= 0.28;
        start.z += (rz / rl) * 0.2;
      }
    }
    ctx.effects.tracer(start, e);
    ctx.effects.flash(start, 0xffd080, 0.14, 0.08);
    ctx.effects.impact(e);
    ctx.viewmodel?.onShot(m);
    ctx.players.get(m.from)?.playAction('shoot'); // geri tepme animasyonu
    const snp = m.k === 'sniper'; // sniper: daha gür ve çok uzaktan duyulur
    audio.sfx(snp ? 'sniper' : m.k === 'pistol' ? 'pistol' : 'rifle', { pos: o, listener: ctx.sceneMgr.camera.position, range: snp ? 110 : 45 });
  }

  /** Bıçak vuruşu: TAMAMEN SESSİZ (ses yok). Mesaj, ileride animasyon için yayınlanmaya devam eder. */
  onStab(m) {
    ctx.viewmodel?.onStab?.(m);
    ctx.players.get(m.from)?.playAction('stab'); // hamle animasyonu (başkalarının modelinde)
  }

  onZap(m) {
    ctx.players.get(m.from)?.playAction('zap');
    const e = toVec(m.e);
    ctx.effects.zap(e);
    audio.sfx('taser', { pos: e, listener: ctx.sceneMgr.camera.position });
  }

  /** S2G: k='zip' fermuar sesi başladı (on:1) / kesildi (on:0) · k='kill' kurban öldü: s2g.mp3 çalar (ceset zıplamasını host yürütür). */
  onS2g(m) {
    const S2G = GAME_CONFIG.abilities.s2g;
    const cam = ctx.sceneMgr.camera.position;
    if (m.k === 'zip') {
      this.stopZip(m.from);
      if (!m.on) return;
      const token = { stopped: false, h: null };
      this.zips.set(m.from, token);
      const pos = this.playerPos(m.from);
      audio.playUrl(S2G.zipSound, { volume: 1, maxConcurrent: 8, pos, listener: cam, range: S2G.zipRange }).then((h) => {
        if (token.stopped) h?.stop();
        else token.h = h;
      });
    } else if (m.k === 'kill') {
      audio.playUrl(S2G.killSound, { volume: 1, maxConcurrent: 8, pos: this.playerPos(m.id), listener: cam, range: S2G.killRange });
    }
  }

  stopZip(id) {
    const t = this.zips.get(id);
    if (!t) return;
    t.stopped = true;
    t.h?.stop();
    this.zips.delete(id);
  }

  onFuse(m) {
    const n = Math.round((m.dur || 1.5) / 0.3);
    for (let i = 0; i < n; i++) {
      setTimeout(() => audio.sfx('beep', { pos: this.playerPos(m.id), listener: ctx.sceneMgr.camera.position, volume: 0.9 }), i * 300);
    }
    if (m.id === ctx.myId) ctx.ui.banner('Patlıyorsun!', 1500, 'warn');
  }

  onHit(m) {
    const pos = m.p ? toVec(m.p) : null;
    // Bıçak vuruşu ve ÖLÜMCÜL her vuruş sessizdir: biri öldüğünde hiçbir "darbe" sesi çıkmaz (silah / patlama sesleri ayrıdır).
    const quiet = KNIFE_CAUSES.has(m.cause) || !!m.dead;
    if (m.id === ctx.myId) {
      ctx.ui.damageFlash();
      ctx.movement.shake(0.12);
      if (!quiet) audio.sfx('hit', { volume: 0.9 });
    } else if (!quiet) audio.sfx('hit', { pos: pos && pos.setY(pos.y + 1), listener: ctx.sceneMgr.camera.position, volume: 0.8 });
  }

  onDeath(m) {
    const p = ctx.players.get(m.id);
    const color = p?.identity?.color ?? 0x888888;
    ctx.corpses.spawn({ id: m.id, p: m.p, yaw: m.yaw, color, imp: m.imp || null });
    p?.setAlive(false);
    // Ölüm SESSİZDİR: hiçbir ses çalınmaz (ceset fizikle yere yığılır).
    if (m.id === ctx.myId) {
      ctx.me_state.hp = 0;
      ctx.inventory.reset();
      ctx.movement.spectateId = null;
      ctx.ui.showDead(m.cause);
    }
    // izlediğim oyuncu öldüyse başkasına geç
    if (!ctx.me?.alive && ctx.movement.spectateId === m.id) ctx.movement.cycleSpectate(1);
    ctx.playerList?.refresh();
  }

  /** Debug: öleni diriltme (doğma noktasında ya da cesedinin yerinde). Ceset kalkması ayrı 'corpseGone' mesajıyla gelir. */
  onRevive(m) {
    const p = ctx.players.get(m.id);
    if (!p) return;
    const pos = toVec(m.p);
    p.setAlive(true);
    p.eq = { out: false, type: null };
    p.teleport(pos.x, pos.y, pos.z);
    p.yaw = p.netYaw = m.yaw || 0;
    if (m.id === ctx.myId) {
      ctx.me_state.hp = GAME_CONFIG.player.maxHp;
      ctx.inventory.reset();
      ctx.movement.spectateId = null;
      ctx.movement.teleport(pos, m.yaw || 0);
      ctx.me.frozenLeft = 0;
      ctx.ui.banner('Dirildin!', 1600);
      audio.sfx('notify', { volume: 0.6 });
    }
    ctx.playerList?.refresh();
  }

  /** Debug: noclip / görünmezlik / ölümsüzlük açıldı ya da kapandı (host'un panelinden). */
  onDbgFlag(m) {
    if (m.key === 'noclip') {
      ctx.movement.setNoclip(!!m.on);
      ctx.ui.toast(m.on ? 'Noclip açık — duvarlardan geçerek uçarsın.' : 'Noclip kapalı.', 2200);
    } else if (m.key === 'ghost') ctx.ui.toast(m.on ? 'Görünmezsin.' : 'Artık görünürsün.', 2200);
    else if (m.key === 'god') ctx.ui.toast(m.on ? 'Ölümsüzlük açık.' : 'Ölümsüzlük kapalı.', 2200);
  }
}
