// HOST: silahlar, hasar, bıçak (vurma + fırlatma + geri dönüş), yetenekler, baiter, ölüm.
// İstemciler yalnızca "ateş et / yetenek kullan" isteği yollar; sonucu burada host hesaplar ve yayınlar.
import * as THREE from 'three';
import { GAME_CONFIG, RADIAL_MENU_ITEMS } from './config.js';
import { audio } from './audio.js';
import { ctx } from './context.js';
import { ROLES, loverPartner } from './roles.js';
import { isNight } from './lights.js';
import { pick, round3 } from './util.js';

const E = GAME_CONFIG.equipment;
const A = GAME_CONFIG.abilities;
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _c = new THREE.Vector3();
const _t = new THREE.Vector3();
const _min = new THREE.Vector3();
const _max = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);

export const truePos = (p) => (p.isLocal ? p.pos : p.netPos);
const arr = (v) => [round3(v.x), round3(v.y), round3(v.z)];

function rayBox(o, d, min, max, maxT) {
  let t0 = 0;
  let t1 = maxT;
  for (const a of ['x', 'y', 'z']) {
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < min[a] || o[a] > max[a]) return null;
      continue;
    }
    let tn = (min[a] - o[a]) / d[a];
    let tf = (max[a] - o[a]) / d[a];
    if (tn > tf) [tn, tf] = [tf, tn];
    t0 = Math.max(t0, tn);
    t1 = Math.min(t1, tf);
    if (t0 > t1) return null;
  }
  return t0;
}

export class CombatSystem {
  constructor(host) {
    this.host = host;
    this.knifeT = 0;
    this.deferWin = false;
    this.wasNight = null; // medyum gece/sabah geçişini yakalamak için (null = henüz ölçülmedi)
    this.soundDur = new Map(); // ses dosyası süreleri (sn): Q menüsü kilidi + S2G ceset zıplaması için
    this.soundBusy = {}; // Q menüsü: öğe indeksi → sesin biteceği an (sn); bitmeden aynı ses tekrar basılamaz
    this.projs = new Map(); // havadaki mermiler (roket / plazma): id → { id, kind, by, p, v, life }
    this.bombs = new Map(); // kurulu bombalar: id → { id, by, p, fuse }
    this.seq = 0;
    this._blast = null; // o an işlenen patlamanın gücü (deathImpulse okur)
    for (const url of [A.s2g.killSound, ...RADIAL_MENU_ITEMS.map((it) => it.sound)]) {
      audio.duration(url).then((d) => this.soundDur.set(url, d), () => {});
    }
  }

  /** Yeni tur: gece/sabah ölçümü ve Q menüsü kilitleri sıfırdan. */
  resetRound() {
    this.wasNight = null;
    this.soundBusy = {};
    this.projs.clear();
    this.bombs.clear();
  }

  get S() {
    return this.host.state;
  }
  /** Elde tutulan silah / eşya: slot 3+ → gizli eşya (items[slot-3]), aksi hâlde rolün ekipmanı. */
  weaponOf(id) {
    const st = this.S.players[id];
    if (!st) return null;
    if (st.slot >= 3) return st.items?.[st.slot - 3] || null;
    return ROLES[st.role]?.equipment || null;
  }
  /** Rolün kendi ekipmanı (slot'tan bağımsız; bıçak geri alma vb.). */
  roleWeapon(id) {
    const st = this.S.players[id];
    return st ? ROLES[st.role]?.equipment || null : null;
  }
  /** Başkalarının gördüğü "elinde silah var mı" bilgisi */
  eqVisible(id) {
    const st = this.S.players[id];
    if (!st?.alive || !st.eq) return false;
    const w = this.weaponOf(id);
    return !!w && (w !== 'knife' || this.S.knife.s === 'held');
  }

  // ------------------------------------------------------------ yardımcılar
  playerBox(p) {
    const tp = truePos(p);
    _min.set(tp.x - 0.45, tp.y, tp.z - 0.45);
    _max.set(tp.x + 0.45, tp.y + (p.crouch ? 1.3 : 1.8), tp.z + 0.45);
    return [_min, _max];
  }

  /** Işın at: duvar ve oyunculara bakar. except: vuran oyuncu. */
  hitscan(except, o, dir, range) {
    const wall = ctx.world.collision.raycast(o, dir, range);
    const maxT = wall ? wall.distance : range;
    let best = null;
    for (const [id, st] of Object.entries(this.S.players)) {
      if (id === except || !st.alive) continue;
      const p = ctx.players.get(id);
      if (!p) continue;
      const [mn, mx] = this.playerBox(p);
      const t = rayBox(o, dir, mn, mx, maxT);
      if (t !== null && (!best || t < best.t)) best = { id, t };
    }
    const dist = best ? best.t : maxT;
    return { id: best?.id || null, end: _c.copy(o).addScaledVector(dir, dist).clone(), wall: !best && !!wall };
  }

  /** Yakın dövüş hedefi (bıçak, elektroşok): menzil + koni + duvar kontrolü. */
  melee(from, o, dir, range, coneCos) {
    const col = ctx.world.collision;
    let best = null;
    let bestScore = Infinity;
    for (const [id, st] of Object.entries(this.S.players)) {
      if (id === from || !st.alive) continue;
      const p = ctx.players.get(id);
      if (!p) continue;
      const tp = truePos(p);
      _c.set(tp.x, tp.y + 1.0, tp.z);
      _t.subVectors(_c, o);
      const dist = _t.length();
      if (dist > range + 0.7) continue;
      const cos = dist > 0.001 ? _t.dot(dir) / dist : 1;
      if (cos < coneCos && dist > 0.9) continue;
      if (col.blocked(o, _c)) continue;
      const score = dist * (2 - cos);
      if (score < bestScore) {
        bestScore = score;
        best = { id, pos: _c.clone() };
      }
    }
    return best;
  }

  readRay(from, d) {
    const p = ctx.players.get(from);
    if (!p || !Array.isArray(d.o) || !Array.isArray(d.d)) return null;
    const o = new THREE.Vector3(...d.o);
    const dir = new THREE.Vector3(...d.d).normalize();
    if (!Number.isFinite(o.x + o.y + o.z + dir.x + dir.y + dir.z)) return null;
    const tp = truePos(p);
    if (o.distanceTo(_c.set(tp.x, tp.y + GAME_CONFIG.player.chestHeight, tp.z)) > 3.5) o.copy(_c); // sahte başlangıç noktası düzelt
    return { o, dir };
  }

  // ------------------------------------------------------------ istekler
  /** İstemci: { on, slot } — slot 1 boş el, 2 rol ekipmanı, 3+ gizli eşyalar. Silah değişince mermi saklanır / yüklenir. */
  onEquip(from, on, slot) {
    const st = this.S.players[from];
    if (!st?.alive) return;
    const old = this.weaponOf(from);
    let ns = on ? Math.floor(Number(slot)) || 2 : 1;
    if (!(ns >= 1 && ns <= 9)) ns = 1;
    if (ns === 2 && !this.roleWeapon(from)) ns = 1;
    if (ns >= 3 && !st.items?.[ns - 3]) ns = 1;
    st.slot = ns;
    st.eq = ns >= 2 ? 1 : 0;
    const now = this.weaponOf(from);
    if (now === old) return;
    st.ammoMap = st.ammoMap || {};
    if (old && E[old]?.magazine) st.ammoMap[old] = st.ammo;
    st.ammo = now && E[now]?.magazine ? st.ammoMap[now] ?? E[now].magazine : 0;
    st.reloadLeft = 0; // silah değişince dolum iptal
    this.host.sendMe(from);
  }

  onFire(from, d) {
    const S = this.S;
    const st = S.players[from];
    if (S.phase !== 'playing' || !st?.alive) return;
    const weapon = this.weaponOf(from);
    if (!weapon || !st.eq || st.cdLeft > 0 || st.reloadLeft > 0 || st.frozen > 0) return;
    const ray = this.readRay(from, d);
    if (!ray) return;
    const W = E[weapon];
    const { o, dir } = ray;

    if (weapon === 'knife') {
      if (S.knife.s !== 'held') return;
      st.cdLeft = W.cooldown;
      const t = this.melee(from, o, dir, W.range, W.coneCos);
      this.host.broadcast({ t: 'stab', from, id: t?.id || null });
      if (t) this.damage(t.id, W.damage, from, 'knife', o);
    } else if (weapon === 'taser') {
      st.cdLeft = W.cooldown;
      const t = this.melee(from, o, dir, W.range, W.coneCos);
      this.host.broadcast({ t: 'zap', from, id: t?.id || null, e: t ? arr(t.pos) : arr(o.clone().addScaledVector(dir, W.range)) });
      if (t) {
        this.damage(t.id, W.damage, from, 'taser', o);
        if (S.players[t.id]?.alive) {
          S.players[t.id].frozen = W.stun;
          this.host.sendTo(t.id, { t: 'freeze', dur: W.stun });
        }
      }
    } else if (weapon === 'bomb') {
      this.plantBomb(from, o, dir, W, st);
    } else {
      // pistol / taramalı / roketatar / plazma
      if (st.ammo <= 0) {
        this.startReload(from, weapon);
        return;
      }
      st.ammo--;
      st.cdLeft = W.fireRate ? 1 / W.fireRate : W.cooldown;
      if (W.spread) {
        dir.x += (Math.random() - 0.5) * W.spread * 2;
        dir.y += (Math.random() - 0.5) * W.spread * 2;
        dir.z += (Math.random() - 0.5) * W.spread * 2;
        dir.normalize();
      }
      if (W.projectile) {
        this.spawnProjectile(from, weapon, o, dir, W);
      } else {
        const hit = this.hitscan(from, o, dir, W.range);
        this.host.broadcast({ t: 'shot', from, o: arr(o), e: arr(hit.end), k: weapon, hit: hit.id ? 1 : 0 });
        if (hit.id) this.damage(hit.id, W.damage, from, weapon, o);
      }
      if (st.ammo <= 0) this.startReload(from, weapon);
      else this.host.sendMe(from);
    }
  }

  startReload(from, weapon) {
    const st = this.S.players[from];
    const W = E[weapon];
    if (!st || !W?.magazine || st.reloadLeft > 0 || st.ammo >= W.magazine) return;
    st.reloadLeft = W.reloadTime;
    this.host.sendMe(from);
  }

  onReload(from) {
    const st = this.S.players[from];
    const w = this.weaponOf(from);
    if (st?.alive && w && E[w].magazine) this.startReload(from, w);
  }

  /** Sağ tık: bıçak fırlat */
  onAlt(from, d) {
    const S = this.S;
    const st = S.players[from];
    if (S.phase !== 'playing' || !st?.alive || this.weaponOf(from) !== 'knife' || !st.eq || st.cdLeft > 0 || S.knife.s !== 'held') return;
    const ray = this.readRay(from, d);
    if (!ray) return;
    const W = E.knife;
    st.cdLeft = W.throwCooldown;
    const v = ray.dir.clone().multiplyScalar(W.throwSpeed);
    S.knife = { s: 'flying', p: arr(ray.o), v: arr(v), ret: W.returnAfter, delay: 0, from };
    this.host.broadcast({ t: 'knife', s: 'flying', p: S.knife.p, d: arr(ray.dir), from, first: 1 }); // first: fırlatma anı (animasyon bir kez)
    this.host.sendMe(from);
  }

  onKnifePickup(from) {
    const S = this.S;
    const k = S.knife;
    if (S.phase !== 'playing' || k.s !== 'landed' || this.roleWeapon(from) !== 'knife' || !S.players[from]?.alive) return;
    const p = ctx.players.get(from);
    if (!p || truePos(p).distanceTo(_c.set(...k.p)) > GAME_CONFIG.interaction.reach + 1.2) return; // bakışla alma menzili + tolerans
    this.knifeBack(from, false);
  }

  /** Bıçak katilin eline döner. forced: süre dolunca zorla çekilir. */
  knifeBack(killerId, forced) {
    const S = this.S;
    S.knife = { s: 'held', p: [0, 0, 0], v: [0, 0, 0], ret: 0, delay: 0, from: killerId };
    const st = S.players[killerId];
    if (st?.alive && forced) this.onEquip(killerId, 1, 2); // zorunlu olarak eline çeker (slot 2)
    this.host.broadcast({ t: 'knife', s: 'held' });
    if (st?.alive) this.host.sendTo(killerId, { t: 'knifeReturn', forced: !!forced });
    this.host.sendMe(killerId);
  }

  // ------------------------------------------------------------ yetenekler
  onAbility(from, d) {
    const S = this.S;
    const st = S.players[from];
    if (S.phase !== 'playing' || !st?.alive) return;
    const role = ROLES[st.role];
    if (!role.ability) return;
    const cfg = A[role.ability];
    switch (role.ability) {
      case 'sleepwalker':
        if (st.abilityCd > 0 || st.sleepLeft > 0) return;
        st.sleepLeft = cfg.freezeTime;
        st.abilityCd = cfg.cooldown;
        this.host.sendTo(from, { t: 'freeze', dur: cfg.freezeTime, sleep: 1 }); // sleep: istemcide ekran kararır
        break;
      case 'bomber':
        if (st.fuse > 0) return; // fitil zaten yanıyor (kullanım sayacı yok; bombacı patlayınca ölür)
        if (!(cfg.fuse > 0)) {
          this.explode(from); // fitilsiz: düğmeye basınca anında patlar
          break;
        }
        st.fuse = cfg.fuse;
        this.host.broadcast({ t: 'fuse', id: from, dur: cfg.fuse });
        break;
      case 'medium': {
        // Sayaç / bekleme yok. Tek kural: bağlantı yalnızca GECE (ışıklar kapalıyken) kurulur; sabah otomatik kesilir.
        if (d.off) {
          st.mediumTarget = null;
        } else {
          const target = S.players[d.target];
          if (!target?.alive || d.target === from) return;
          if (!isNight(ctx.world.lights)) {
            this.host.sendTo(from, { t: 'note', text: 'Medyum bağlantısı yalnızca gece (ışıklar kapalıyken) kurulabilir.' });
            return;
          }
          st.mediumTarget = d.target;
          st.mediumMutual = !!d.mutual;
        }
        break;
      }
      case 's2g':
        this.onS2g(from, d);
        return; // sendMe içeride
      default:
        return;
    }
    this.host.sendMe(from);
  }

  // ------------------------------------------------------------ S2G (fermuar)
  /** İstemci: { a:'start', target } basılı tutmaya başladı · { a:'stop' } bıraktı. Süre / uzaklık / bakış host'ta doğrulanır. */
  onS2g(from, d) {
    const S = this.S;
    const st = S.players[from];
    const cfg = A.s2g;
    if (d.a === 'stop') {
      this.s2gCancel(from);
      return;
    }
    if (d.a !== 'start' || st.s2gTarget) return;
    const note = (text) => this.host.sendTo(from, { t: 'note', text });
    if (cfg.nightOnly && !isNight(ctx.world.lights)) return note('S2G yalnızca gece (ışıklar kapalıyken) kullanılabilir.');
    if (st.s2gNight === S.nightNo) return note('Bu gece zaten kullandın. Her gece yalnızca 1 kez.');
    if (!S.players[d.target]?.alive || d.target === from) return;
    if (!this.s2gValid(from, d.target, 1.6)) return;
    st.s2gTarget = d.target;
    st.s2gHold = 0;
    this.host.broadcast({ t: 's2g', k: 'zip', from, on: 1 }); // fermuar sesi başlar
  }

  /** from, hedefe yeterince yakın mı (yatayda range × tol) ve ona bakıyor mu (+ arada duvar yok)? */
  s2gValid(from, target, tol) {
    const cfg = A.s2g;
    const a = ctx.players.get(from);
    const b = ctx.players.get(target);
    if (!a || !b) return false;
    const pa = truePos(a);
    const pb = truePos(b);
    if (Math.hypot(pa.x - pb.x, pa.z - pb.z) > cfg.range * tol || Math.abs(pa.y - pb.y) > 1.2) return false;
    _o.set(pa.x, pa.y + (a.eyeH || GAME_CONFIG.player.eyeHeight), pa.z);
    _c.set(pb.x, pb.y + (b.crouch ? 0.8 : 1.2), pb.z);
    _d.subVectors(_c, _o);
    const dist = _d.length();
    if (dist > 1e-4) {
      _d.divideScalar(dist);
      const cp = Math.cos(a.pitch || 0);
      _t.set(Math.sin(a.yaw || 0) * cp, Math.sin(a.pitch || 0), Math.cos(a.yaw || 0) * cp);
      if (_t.dot(_d) < cfg.lookCos - 0.15) return false; // ağ gecikmesi payı
      if (ctx.world.collision.raycast(_o, _d, dist)) return false;
    }
    return true;
  }

  s2gCancel(id) {
    const st = this.S.players[id];
    if (!st?.s2gTarget) return;
    st.s2gTarget = null;
    st.s2gHold = 0;
    this.host.broadcast({ t: 's2g', k: 'zip', from: id, on: 0 }); // fermuar sesi kesilir
  }

  /** Her kare: basılı tutma süresi dolunca kurban ölür; menzil / bakış bozulursa iptal. */
  updateS2g(dt) {
    const S = this.S;
    const cfg = A.s2g;
    for (const [id, st] of Object.entries(S.players)) {
      if (!st.s2gTarget) continue;
      const tg = S.players[st.s2gTarget];
      const night = !cfg.nightOnly || isNight(ctx.world.lights);
      if (!st.alive || !tg?.alive || !night || !this.s2gValid(id, st.s2gTarget, 1.8)) {
        this.s2gCancel(id);
        continue;
      }
      st.s2gHold += dt;
      if (st.s2gHold < cfg.holdTime) continue;
      const target = st.s2gTarget;
      this.s2gCancel(id); // fermuar sesini durdur
      st.s2gNight = S.nightNo; // bu gece kullanıldı
      this.kill(target, id, 's2g');
      this.host.broadcast({ t: 's2g', k: 'kill', id: target, from: id }); // s2g.mp3 çalar
      // ceset, ses bitene kadar rastgele hafifçe zıplar
      const dur = this.soundDur.get(cfg.killSound) || cfg.fallbackSeconds;
      // (host kendi 'death' mesajını mikro-görevle alır: ceset oluştuktan SONRA zıplatılmalı)
      queueMicrotask(() => ctx.corpses.hostHop(target, dur, cfg.jumpInterval, cfg.jumpSpeed));
      this.host.sendMe(id);
    }
  }

  teleportToRoom(id, roomId) {
    const room = ctx.world.rooms.find((r) => r.id === roomId) || pick(ctx.world.rooms);
    if (!room) return;
    const p = ctx.world.randomPointInRoom(room);
    this.host.sendTo(id, { t: 'teleport', p: arr(p) });
  }

  /** Bombacı: kendi konumunda, düğmeye basınca patlar. */
  explode(id) {
    const st = this.S.players[id];
    const p = ctx.players.get(id);
    if (!st || !p) return;
    const cfg = A.bomber;
    const pos = truePos(p).clone();
    pos.y += 0.9;
    this.blastAt(pos, { radius: cfg.radius, damage: cfg.damage, blastImpulse: cfg.blastImpulse, by: id, hurtSelf: cfg.hurtSelf });
  }

  /** Genel patlama: radius içindeki canlılar `damage` alır, cesetler savrulur. los: duvarın arkasındakilere etkimesin. */
  blastAt(pos, { radius, damage, blastImpulse, by = null, hurtSelf = true, los = false }) {
    this.host.broadcast({ t: 'explosion', p: arr(pos), r: radius });
    const victims = [];
    for (const [pid, ps] of Object.entries(this.S.players)) {
      if (!ps.alive) continue;
      if (pid === by && !hurtSelf) continue;
      const pp = ctx.players.get(pid);
      if (!pp) continue;
      const tp = truePos(pp);
      if (_c.set(tp.x, tp.y + 0.9, tp.z).distanceTo(pos) > radius) continue;
      if (los && ctx.world.collision.blocked(pos, _c)) continue;
      victims.push(pid);
    }
    // Yerdeki cesetler savrulur; yeni ölenler de patlamanın merkezinden dışarı savrulur (death{imp})
    ctx.corpses.hostBlast(pos, radius, blastImpulse);
    this._blast = { radius, blastImpulse };
    // Herkes öldükten sonra kazanan hesaplansın (patlama ortasında tur bitmesin)
    this.deferWin = true;
    for (const pid of victims) this.damage(pid, damage, by, 'bomb', pos);
    this.deferWin = false;
    this._blast = null;
    this.host.rounds.checkWin();
  }

  // ------------------------------------------------------------ gizli eşyalar: roket / plazma mermisi, bomba
  spawnProjectile(from, kind, o, dir, W) {
    const id = ++this.seq;
    const v = dir.clone().multiplyScalar(W.speed);
    this.projs.set(id, { id, kind, by: from, p: o.clone(), v, life: W.life });
    this.host.broadcast({ t: 'proj', id, k: kind, from, p: arr(o), v: arr(v) });
  }

  /** Her kare: mermi bu karede aldığı yol boyunca duvar + oyuncu kutularına karşı denenir (hızlı mermi duvardan geçmez). */
  updateProjectiles(dt) {
    if (!this.projs.size) return;
    const step = Math.min(dt, 0.1);
    for (const pr of [...this.projs.values()]) {
      const W = E[pr.kind];
      const len = W.speed * step;
      pr.life -= step;
      _d.copy(pr.v).normalize();
      _o.copy(pr.p);
      const wall = ctx.world.collision.raycast(_o, _d, len);
      const maxT = wall ? wall.distance : len;
      let best = null;
      for (const [pid, st] of Object.entries(this.S.players)) {
        if (pid === pr.by || !st.alive) continue;
        const p = ctx.players.get(pid);
        if (!p) continue;
        const [mn, mx] = this.playerBox(p);
        const t = rayBox(_o, _d, mn, mx, maxT);
        if (t !== null && (!best || t < best.t)) best = { id: pid, t };
      }
      if (best || wall) {
        const hp = _o.clone().addScaledVector(_d, best ? best.t : maxT);
        if (!best) hp.addScaledVector(wall.normal, 0.06); // duvarın içinde patlamasın
        this.projEnd(pr, hp, best?.id || null);
      } else if (pr.life <= 0) {
        this.projEnd(pr, _o.clone().addScaledVector(_d, len), null);
      } else {
        pr.p.addScaledVector(_d, len);
      }
    }
  }

  projEnd(pr, point, hitId) {
    this.projs.delete(pr.id);
    const W = E[pr.kind];
    this.host.broadcast({ t: 'projEnd', id: pr.id, k: pr.kind, p: arr(point), hit: hitId ? 1 : 0 });
    if (pr.kind === 'rocket') {
      this.blastAt(point, { radius: W.radius, damage: W.damage, blastImpulse: W.blastImpulse, by: pr.by, hurtSelf: true, los: true });
    } else if (hitId) {
      this.damage(hitId, W.damage, pr.by, pr.kind); // ölüm itişinin yönü: vuranın konumundan
    }
  }

  /** Bomba eşyası: baktığın yüzeye (plantRange m) ya da bakılan noktanın altındaki zemine konur, fuse sn sonra patlar. */
  plantBomb(from, o, dir, W, st) {
    st.cdLeft = W.cooldown;
    const col = ctx.world.collision;
    const hit = col.raycast(o, dir, W.plantRange);
    let pos;
    if (hit) {
      pos = hit.point.clone().addScaledVector(hit.normal, 0.14);
    } else {
      const aim = o.clone().addScaledVector(dir, W.plantRange);
      const g = col.raycast(aim, DOWN, 8);
      pos = g ? g.point.clone().addScaledVector(g.normal, 0.14) : aim;
    }
    const id = ++this.seq;
    this.bombs.set(id, { id, by: from, p: pos, fuse: W.fuse });
    this.host.broadcast({ t: 'bombPlant', id, from, p: arr(pos), fuse: W.fuse });
  }

  updateBombs(dt) {
    if (!this.bombs.size) return;
    const W = E.bomb;
    for (const b of [...this.bombs.values()]) {
      b.fuse -= dt;
      if (b.fuse > 0) continue;
      this.bombs.delete(b.id);
      this.host.broadcast({ t: 'bombGone', id: b.id });
      const c = b.p.clone();
      c.y += 0.4; // yerdeki bombanın patlama merkezi biraz yukarıda
      this.blastAt(c, { radius: W.radius, damage: W.damage, blastImpulse: W.blastImpulse, by: b.by, hurtSelf: true, los: true });
    }
  }

  // ------------------------------------------------------------ baiter / ses / sohbet
  onBaiter(from, { target }) {
    const S = this.S;
    const st = S.players[from];
    const tg = S.players[target];
    if (S.phase !== 'playing' || !st?.alive || st.role !== 'killer') return;
    if (S.baiterUsed || !tg?.alive || target === from) return;
    S.baiterId = target;
    S.baiterUsed = true;
    this.host.sendTo(target, { t: 'baiterNotice' });
    this.host.sendVisToAll();
    this.host.sendMe(target);
    this.host.sendMe(from);
  }

  onSound(from, { i }) {
    const S = this.S;
    const st = S.players[from];
    const item = RADIAL_MENU_ITEMS[i];
    if (!item || !st?.alive || S.phase === 'lobby' || st.soundCd > 0) return;
    const now = performance.now() / 1000;
    if ((this.soundBusy[i] || 0) > now) return; // bu ses hâlâ çalıyor: bitmeden tekrar basılamaz
    const dur = Math.max(0.8, this.soundDur.get(item.sound) || 1.5);
    this.soundBusy[i] = now + dur;
    st.soundCd = GAME_CONFIG.radial.cooldown;
    this.host.broadcast({ t: 'sound', url: item.sound, from, i, dur });
  }

  // ------------------------------------------------------------ hasar / ölüm
  /**
   * src: hasarın geldiği nokta ({x,y,z}; ölüm itişinin yönü için — atıcının gözü, patlama merkezi...). Yoksa `by` oyuncusunun konumu kullanılır.
   * 'hit' mesajındaki dead:1 → ölümcül vuruş: istemciler "darbe" sesini çalmaz (ölüm tamamen sessizdir).
   */
  damage(targetId, amount, by, cause, src = null) {
    const S = this.S;
    const t = S.players[targetId];
    if (!t?.alive || S.phase !== 'playing') return;
    if (S.dbg?.[targetId]?.god) return; // debug: ölümsüzlük
    t.hp -= amount;
    const lethal = t.hp <= 0;
    const p = ctx.players.get(targetId);
    this.host.broadcast({ t: 'hit', id: targetId, dmg: amount, by, cause, p: p ? arr(truePos(p)) : null, dead: lethal ? 1 : 0 });
    if (lethal) this.kill(targetId, by, cause, src);
    else this.host.sendMe(targetId);
  }

  /** Ölüm anında cesede verilecek itiş (m/sn): vuran taraftan uzağa; patlamada merkezden dışarı, mesafeyle azalarak. */
  deathImpulse(id, by, cause, src) {
    const p = ctx.players.get(id);
    if (!p) return [0, 0, 0];
    const tp = truePos(p);
    let from = src;
    if (!from && by) {
      const bp = ctx.players.get(by);
      if (bp) from = truePos(bp);
    }
    let mag = GAME_CONFIG.corpse.stumble[cause] ?? 0;
    if (cause === 'bomb') {
      const B = this._blast || A.bomber; // roket / bomba eşyası kendi gücünü verir
      const dist = from ? Math.hypot(tp.x - from.x, tp.y + 0.9 - from.y, tp.z - from.z) : 0;
      mag = B.blastImpulse * Math.max(0.3, 1 - dist / B.radius);
    }
    if (!from || mag <= 0) return [0, 0, 0];
    _t.set(tp.x - from.x, cause === 'bomb' ? tp.y + 0.9 - from.y : 0, tp.z - from.z);
    if (_t.lengthSq() < 1e-6) _t.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    _t.normalize();
    return [round3(_t.x * mag), round3(mag * (cause === 'bomb' ? 0.55 : 0.12) + _t.y * mag), round3(_t.z * mag)];
  }

  /** force: debug "öldür" — ölümsüzlüğü de aşar. */
  kill(id, by, cause, src = null, force = false) {
    const S = this.S;
    const st = S.players[id];
    if (!st?.alive) return;
    if (!force && S.dbg?.[id]?.god) return; // debug: ölümsüzlük (S2G / sevgili zinciri de öldüremez)
    st.alive = false;
    st.hp = 0;
    st.eq = 0;
    st.slot = 1;
    st.fuse = 0;
    st.sleepLeft = 0;
    st.mediumTarget = null;
    for (const o of Object.values(S.players)) if (o.mediumTarget === id) o.mediumTarget = null;
    this.s2gCancel(id); // ölen S2G'nin fermuarı kesilir
    for (const [oid, o] of Object.entries(S.players)) if (o.s2gTarget === id) this.s2gCancel(oid); // hedefi başkası öldürdüyse S2G iptal
    const p = ctx.players.get(id);
    const pos = p ? truePos(p) : { x: 0, y: 0, z: 0 };
    ctx.world.grab.hostRelease(id);
    ctx.corpses.hostRelease(id);
    this.host.broadcast({ t: 'death', id, by, cause, p: arr(pos), yaw: round3(p?.yaw || 0), imp: this.deathImpulse(id, by, cause, src) });
    // Katil öldüyse bıçak artık geri dönmez
    if (st.role === 'killer' && S.knife.s !== 'held') this.knifeBack(id, false);
    // Sevgili: biri elenirse diğeri de elenir
    const other = loverPartner(S.lovers, id);
    if (other && S.players[other]?.alive) this.kill(other, by, 'lover');
    this.host.sendMe(id);
    this.host.sendVisToAll();
    if (!this.deferWin) this.host.rounds.checkWin();
  }

  // ------------------------------------------------------------ her kare (host)
  update(dt) {
    const S = this.S;
    if (S.phase !== 'playing') return;
    for (const [id, st] of Object.entries(S.players)) {
      if (st.cdLeft > 0) st.cdLeft = Math.max(0, st.cdLeft - dt);
      if (st.soundCd > 0) st.soundCd = Math.max(0, st.soundCd - dt);
      if (st.abilityCd > 0) st.abilityCd = Math.max(0, st.abilityCd - dt);
      if (st.frozen > 0) st.frozen = Math.max(0, st.frozen - dt);
      if (st.reloadLeft > 0) {
        st.reloadLeft -= dt;
        if (st.reloadLeft <= 0) {
          st.reloadLeft = 0;
          const w = this.weaponOf(id);
          if (w && E[w]?.magazine) st.ammo = E[w].magazine;
          this.host.sendMe(id);
        }
      }
      if (!st.alive) continue;
      if (st.sleepLeft > 0) {
        st.sleepLeft -= dt;
        if (st.sleepLeft <= 0) {
          st.sleepLeft = 0;
          this.teleportToRoom(id, null); // rastgele oda
        }
      }
      if (st.fuse > 0) {
        st.fuse -= dt;
        if (st.fuse <= 0) {
          st.fuse = 0;
          this.explode(id);
        }
      }
    }
    this.updateMediumNight();
    this.updateS2g(dt);
    this.updateKnife(dt);
    this.updateProjectiles(dt);
    this.updateBombs(dt);
  }

  /** Sabah olunca (ışıklar açılınca) tüm medyum bağlantıları otomatik kesilir; gece tekrar kurulabilir. */
  updateMediumNight() {
    const night = isNight(ctx.world.lights);
    const was = this.wasNight;
    this.wasNight = night;
    if (night && !was) {
      this.S.nightNo = (this.S.nightNo || 0) + 1; // yeni gece başladı (S2G her gece 1 kez)
      for (const [id, st] of Object.entries(this.S.players)) if (st.alive && st.role === 's2g') this.host.sendMe(id);
    }
    if (was == null || night === was) return;
    if (night) return; // gece oldu: medyumlar yeniden bağlanabilir (bildirim gerekmez)
    for (const [id, st] of Object.entries(this.S.players)) {
      if (!st.alive || st.role !== 'medium' || !st.mediumTarget) continue;
      st.mediumTarget = null;
      this.host.sendTo(id, { t: 'note', text: 'Sabah oldu: medyum bağlantın kesildi. Gece tekrar bağlanabilirsin.' });
      this.host.sendMe(id);
    }
  }

  updateKnife(dt) {
    const S = this.S;
    const k = S.knife;
    if (k.s === 'held') return;
    const killerId = k.from;
    k.ret -= dt;
    if (k.ret <= 0) {
      this.knifeBack(killerId, true);
      return;
    }
    const W = E.knife;
    if (k.s === 'flying') {
      const sub = 3;
      const h = dt / sub;
      for (let i = 0; i < sub && k.s === 'flying'; i++) {
        k.v[1] -= W.throwGravity * h;
        _d.set(k.v[0] * h, k.v[1] * h, k.v[2] * h);
        const len = _d.length();
        if (len < 1e-6) break;
        _d.divideScalar(len);
        _o.set(...k.p);
        const wall = ctx.world.collision.raycast(_o, _d, len + 0.05);
        const maxT = wall ? wall.distance : len;
        let best = null;
        for (const [id, st] of Object.entries(S.players)) {
          if (id === killerId || !st.alive) continue;
          const p = ctx.players.get(id);
          if (!p) continue;
          const [mn, mx] = this.playerBox(p);
          const t = rayBox(_o, _d, mn, mx, maxT);
          if (t !== null && (!best || t < best.t)) best = { id, t };
        }
        if (best) {
          const hp = _o.clone().addScaledVector(_d, best.t);
          this.landKnife(hp, _d);
          this.damage(best.id, W.throwDamage, killerId, 'knifeThrow', _o);
        } else if (wall) {
          const hp = wall.point.clone().addScaledVector(wall.normal, 0.03);
          this.landKnife(hp, _d);
        } else {
          _o.addScaledVector(_d, len);
          k.p = arr(_o);
        }
      }
      this.knifeT += dt;
      if (k.s === 'flying' && this.knifeT > 1 / 15) {
        this.knifeT = 0;
        const dir = _d.set(k.v[0], k.v[1], k.v[2]).normalize();
        this.host.broadcast({ t: 'knife', s: 'flying', p: k.p, d: arr(dir) });
      }
    } else if (k.s === 'landed') {
      k.delay = Math.max(0, (k.delay || 0) - dt);
      const kp = ctx.players.get(killerId);
      const st = S.players[killerId];
      if (kp && st?.alive && k.delay <= 0 && truePos(kp).distanceTo(_c.set(...k.p)) < W.pickupRadius) this.knifeBack(killerId, false);
    }
  }

  landKnife(point, dir) {
    const k = this.S.knife;
    k.s = 'landed';
    k.p = arr(point);
    k.delay = 1; // atıştan hemen sonra anında geri alınmasın
    this.host.broadcast({ t: 'knife', s: 'landed', p: k.p, d: arr(dir) });
  }
}
