// HOST: round yaşam döngüsü — başlat (rol dağıt, spawn), rol açıklama, oyun, kazanan hesabı, otomatik yeni round.
// Kazanma kuralları (şartname 19):
//   • Katil elenirse katil takımı kaybeder → masumlar kazanır.
//   • Katil dışındaki (masum takımdaki) herkes elenirse katil takımı kazanır (mafya da katil takımıdır).
//   • İkisi de aynı anda kalmazsa (örn. bombacı herkesi öldürürse) berabere.
import { GAME_CONFIG } from './config.js';
import { ctx } from './context.js';
import { FACES } from './faces.js';
import { ROLES, assignRoles, makeIdentities, teamOf } from './roles.js';
import { round3, shuffle } from './util.js';

const E = GAME_CONFIG.equipment;

/** Bir oyuncunun tur başı durumu (debug botları da mid-round bunu kullanır). */
export function newPlayerState(roleId) {
  const role = ROLES[roleId] || ROLES.civilian;
  const weapon = role.equipment ? E[role.equipment] : null;
  return {
    role: role.id,
    alive: true,
    hp: GAME_CONFIG.player.maxHp,
    spectator: false,
    eq: 0,
    slot: 1, // 1 boş el · 2 rol ekipmanı · 3+ gizli eşyalar (items sırasına göre)
    items: [], // debug'dan verilen gizli eşyalar: ['rocket', 'bomb', 'plasma', 'sniper'] → slot 3, 4, 5, …
    ammoMap: {}, // silah değişince saklanan mermi sayıları
    ammo: weapon?.magazine || 0,
    reloadLeft: 0,
    cdLeft: 0,
    soundCd: 0,
    frozen: 0,
    abilityCd: 0,
    fuse: 0,
    sleepLeft: 0,
    mediumTarget: null,
    mediumMutual: false,
    mediumNight: -1, // Medyum: son bağlandığı gecenin numarası (gece başına YALNIZCA 1 kişi)
    mediumPick: null, // Medyum: o gece seçtiği kişi (bağlantı kapansa / kişi ölse de o gece başkası seçilemez)
    s2gTarget: null, // S2G: şu an fermuarını çektiği kişi
    s2gHold: 0, // S2G: basılı tutma süresi (sn)
    s2gNight: -1, // S2G: son kullandığı gecenin numarası (her gece 1 kez)
    umaciLeft: 0, // Umacı: görünmezliğin kalan süresi (sn)
    umaciNight: -1, // Umacı: son kullandığı gecenin numarası (her gece 1 kez)
    spec: null,
  };
}

export class RoundManager {
  constructor(host) {
    this.host = host;
  }

  get S() {
    return this.host.state;
  }

  /** Yeni round başlatır. Yeterli oyuncu yoksa false döner. */
  startRound() {
    const S = this.S;
    const debug = this.host.debug; // debug odası: 1 oyuncu yeter, roller elle seçilir, tur kendiliğinden bitmez
    const ids = this.host.connectedIds();
    const need = debug ? 1 : GAME_CONFIG.minPlayersToStart;
    if (ids.length < need) {
      this.host.systemChat(`Oyun için en az ${need} oyuncu gerekli.`);
      return false;
    }
    let roles = {};
    let lovers = null;
    if (debug) {
      for (const id of ids) {
        const r = S.debugRoles?.[id];
        roles[id] = ROLES[r] ? r : 'civilian';
      }
      // Aşık rolü verilenler: debug panelinde kurulan çiftler tur yenilenince de kalır (ikisi de odada ve hâlâ Aşıksa); eşsiz Aşıklar sırayla birbirine bağlanır
      const dl = S.debugLovers || [];
      const isL = (id) => roles[id] === 'lover';
      const keep = [];
      for (let i = 0; i + 1 < dl.length; i += 2) if (isL(dl[i]) && isL(dl[i + 1])) keep.push(dl[i], dl[i + 1]);
      const free = ids.filter((id) => isL(id) && !keep.includes(id));
      for (let i = 0; i + 1 < free.length; i += 2) keep.push(free[i], free[i + 1]);
      lovers = keep.length ? keep : null;
    } else {
      const a = assignRoles(ids, S.settings);
      roles = a.roles;
      lovers = a.lovers;
    }
    S.mode = ctx.room?.mode || 'voice';
    S.idn = makeIdentities(ids, roles, S.mode);
    // YÜZLER: her tur herkese rastgele (mümkünse farklı) bir yüz; dosya adı kimlikle (f) yayınlanır → herkes aynı yüzü görür
    const faceNames = FACES.pick(ids.length);
    ids.forEach((id, i) => {
      if (faceNames[i]) S.idn[id].f = faceNames[i];
    });
    S.players = {};
    for (const id of ids) {
      S.players[id] = newPlayerState(roles[id]);
      if (debug) S.players[id].items = (S.dbg?.[id]?.items || []).slice(); // debug: verilen gizli eşyalar tur yenilenince kalır
    }
    S.baiterId = null;
    S.baiterUsed = false;
    S.lovers = lovers;
    S.knife = { s: 'held', p: [0, 0, 0], v: [0, 0, 0], ret: 0, delay: 0, from: null };
    this.host.combat.resetRound(); // yeni tur: gece/sabah ölçümü ve Q menü kilitleri sıfırdan
    S.nightNo = 0;
    S.round++;
    S.winner = null;
    S.time = 0;
    S.limit = debug ? 0 : Number.isFinite(S.settings.roundTime) ? S.settings.roundTime : GAME_CONFIG.rounds.roundTime;
    S.revealLeft = debug ? GAME_CONFIG.debug.revealTime : GAME_CONFIG.rounds.roleRevealTime;
    S.endTimer = 0;
    S.phase = 'reveal';

    // spawn noktaları: karıştır, fazla oyuncu varsa hafif sapma ver. Debug botları yerlerinde kalır.
    const spawns = shuffle(ctx.world.spawns.slice());
    S.spawns = {};
    let si = 0;
    for (const id of ids) {
      const fixed = S.botPos?.[id];
      if (fixed) {
        S.spawns[id] = fixed.slice();
        this.host.seedBot(id); // bot bulunduğu yerde sabit; konumu poss'ta yayınlanır
        continue;
      }
      const s = spawns[si % spawns.length];
      const extra = si >= spawns.length ? 0.9 : 0;
      S.spawns[id] = [round3(s.pos.x + (Math.random() - 0.5) * extra), round3(s.pos.y), round3(s.pos.z + (Math.random() - 0.5) * extra), round3(s.yaw)];
      si++;
    }

    const killerRole = ids.find((id) => roles[id] === 'killer');
    if (killerRole) S.knife.from = killerRole;

    this.host.broadcast({
      t: 'round',
      n: S.round,
      mode: S.mode,
      limit: S.limit,
      reveal: S.revealLeft,
      ids: ids.map((id) => ({ id, name: this.host.nameOf(id) })),
      idn: S.idn,
      sp: S.spawns,
    });
    this.host.sendVisToAll();
    for (const id of ids) this.host.sendMe(id);
    ctx.net?.roomUpdate({ started: true });
    return true;
  }

  update(dt) {
    const S = this.S;
    if (S.phase === 'reveal') {
      S.revealLeft -= dt;
      if (S.revealLeft <= 0) {
        S.phase = 'playing';
        S.revealLeft = 0;
        this.host.broadcast({ t: 'go', limit: S.limit });
        this.checkWin(); // oyuncu sayısı bu arada düştüyse
      }
    } else if (S.phase === 'playing') {
      S.time += dt;
      if (S.limit > 0 && S.time >= S.limit) this.endRound(GAME_CONFIG.rounds.timeoutWinner || 'innocent', 'time');
    } else if (S.phase === 'ended') {
      S.endTimer -= dt;
      if (S.endTimer <= 0) {
        if (!this.startRound()) this.toLobby();
      }
    }
  }

  /** Yaşayan oyuncuları sayıp kazananı belirler. */
  checkWin() {
    const S = this.S;
    if (this.host.debug) return; // debug odası: tur kendiliğinden bitmez (rol/silah denemek için)
    if (S.phase !== 'playing' && S.phase !== 'reveal') return;
    let killerAlive = 0;
    let innocentAlive = 0;
    let total = 0;
    for (const st of Object.values(S.players)) {
      if (st.spectator) continue;
      total++;
      if (!st.alive) continue;
      if (st.role === 'killer') killerAlive++;
      else if (teamOf(st.role) === 'innocent') innocentAlive++;
    }
    if (total === 0) return;
    if (!killerAlive && !innocentAlive) this.endRound('draw', 'all');
    else if (!killerAlive) this.endRound('innocent', 'killer');
    else if (!innocentAlive) this.endRound('killer', 'innocents');
  }

  endRound(winner, reason = '') {
    const S = this.S;
    if (S.phase === 'ended' || S.phase === 'lobby') return;
    S.phase = 'ended';
    S.winner = winner;
    S.endTimer = GAME_CONFIG.rounds.restartDelay;
    const roles = {};
    const dead = {};
    for (const [id, st] of Object.entries(S.players)) {
      if (st.spectator) continue;
      roles[id] = st.role;
      dead[id] = st.alive ? 0 : 1;
    }
    // bomba fitili vb. bekleyen yetenekler sıfırlansın
    for (const st of Object.values(S.players)) {
      st.fuse = 0;
      st.sleepLeft = 0;
      st.umaciLeft = 0; // Umacı: tur bitince herkes yeniden görünür
    }
    this.host.broadcast({ t: 'end', winner, reason, roles, dead, baiter: S.baiterId, lovers: S.lovers, wait: S.endTimer });
    this.host.sendVisToAll();
  }

  /** Lobiye dön (oyun durur, dünya sıfırlanır). */
  toLobby() {
    const S = this.S;
    S.phase = 'lobby';
    S.winner = null;
    S.players = {};
    S.baiterId = null;
    S.baiterUsed = false;
    S.lovers = null;
    S.idn = {};
    S.knife = { s: 'held', p: [0, 0, 0], v: [0, 0, 0], ret: 0, delay: 0, from: null };
    this.host.broadcast({ t: 'lobby' });
    ctx.net?.roomUpdate({ started: false });
  }
}
