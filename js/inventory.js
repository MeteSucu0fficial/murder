// Envanter (1 boş el / 2 ekipman / 3+ debug'dan verilen gizli eşyalar), saldırı girdileri, X yeteneği ve F feneri.
// Ekipmanın gerçek etkisi (hasar, mermi, bekleme) host'ta hesaplanır; burada yalnızca istek gönderilir.
import * as THREE from 'three';
import { GAME_CONFIG, KEYS } from './config.js';
import { ctx } from './context.js';
import { MOUSE_LEFT, MOUSE_RIGHT } from './input.js';
import { audio } from './audio.js';
import { isNight } from './lights.js';
import { clamp, round3 } from './util.js';

const E = GAME_CONFIG.equipment;
const A = GAME_CONFIG.abilities;
const F = GAME_CONFIG.flashlight;
const P = GAME_CONFIG.player;
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _rim = new THREE.Vector3();
const _eye = new THREE.Vector3();
// Gölgesiz (low) kalitede menzil kısma: bakış yönünün solu / ortası / sağı (yatay düzlemde)
const CLIP_ANGLES = [-1, 0, 1].map((i) => [Math.cos(i * F.angle * 0.6), Math.sin(i * F.angle * 0.6)]);

const arr = (v) => [round3(v.x), round3(v.y), round3(v.z)];

/**
 * Fener ışıkları: yerel oyuncu + en yakın birkaç uzak oyuncu için SpotLight havuzundan ışık verir.
 * Işık duvardan geçmez: Orta/Yüksek kalitede gölge haritasıyla (scene.js), Düşük kalitede menzil kısarak (_clip).
 */
class FlashlightManager {
  constructor() {
    this.local = null;
    this.remote = new Map(); // playerId -> spot
    this.t = 0;
  }

  /** Işığın çıkış noktası: göz + ileri. Önünde duvar varsa duvarın İÇİNE girmez (ışık duvarın öbür yanında doğmasın). */
  _muzzle(eye, dir, out) {
    let off = F.muzzleOffset;
    const col = ctx.world?.collision;
    if (col) {
      const hit = col.raycast(eye, dir, off + F.muzzleClearance);
      if (hit) off = Math.max(0, hit.distance - F.muzzleClearance);
    }
    return out.copy(eye).addScaledVector(dir, off);
  }

  /** Gölge haritası olmayan (low) kalite: ışığın menzili, bakılan yöndeki en yakın duvarın biraz ötesine kısılır. */
  _clip(L, origin, dir, k) {
    const col = ctx.world?.collision;
    if (!col) return;
    const flat = Math.hypot(dir.x, dir.z);
    let d = F.range;
    if (flat > 0.05) {
      const hx = dir.x / flat;
      const hz = dir.z / flat;
      for (const [c, s] of CLIP_ANGLES) {
        _rim.set(hx * c + hz * s, 0, hz * c - hx * s);
        const hit = col.raycast(origin, _rim, F.range);
        if (hit && Math.abs(hit.normal.y) < 0.6) d = Math.min(d, hit.distance); // zemin/tavan duvar sayılmaz
      }
      d /= Math.max(0.35, flat); // eğik bakışta yatay mesafe, ışık ekseni boyunca daha uzundur
    }
    const target = clamp(d * F.clipScale + F.clipPad, F.clipMin, F.range);
    L.distance += (target - L.distance) * k;
  }

  _aim(spot, origin, dir, k) {
    const L = spot.light;
    L.position.copy(origin);
    L.target.position.copy(origin).addScaledVector(dir, 10);
    L.intensity += (F.intensity - L.intensity) * k;
    if (!L.castShadow) this._clip(L, origin, dir, k);
  }

  update(dt) {
    const sm = ctx.sceneMgr;
    const me = ctx.me;
    const k = 1 - Math.exp(-14 * dt);

    // ---- yerel ----
    const wantLocal = !!(me && me.alive && me.flashlight && ctx.phase === 'playing');
    if (wantLocal && !this.local) this.local = sm.acquireSpot();
    if (!wantLocal && this.local) {
      sm.releaseSpot(this.local);
      this.local = null;
    }
    if (this.local) {
      sm.camera.getWorldDirection(_d);
      _eye.set(me.pos.x, me.pos.y + (me.eyeH || P.eyeHeight), me.pos.z);
      this._muzzle(_eye, _d, _o);
      this._aim(this.local, _o, _d, k);
    }

    // ---- uzak oyuncular ----
    this.t += dt;
    if (this.t >= 0.25) {
      this.t = 0;
      const cam = sm.camera.position;
      const list = ctx.players
        .all()
        .filter((p) => !p.isLocal && p.alive && p.flashlight)
        .sort((a, b) => a.pos.distanceToSquared(cam) - b.pos.distanceToSquared(cam))
        .slice(0, F.maxRemoteLights);
      const keep = new Set(list.map((p) => p.id));
      for (const [id, spot] of this.remote) {
        if (!keep.has(id)) {
          sm.releaseSpot(spot);
          this.remote.delete(id);
        }
      }
      for (const p of list) {
        if (!this.remote.has(p.id)) {
          const s = sm.acquireSpot();
          if (s) this.remote.set(p.id, s);
        }
      }
    }
    for (const [id, spot] of this.remote) {
      const p = ctx.players.get(id);
      if (!p || !p.alive || !p.flashlight) {
        sm.releaseSpot(spot);
        this.remote.delete(id);
        continue;
      }
      const cp = Math.cos(p.pitch);
      _d.set(Math.sin(p.yaw) * cp, Math.sin(p.pitch), Math.cos(p.yaw) * cp);
      _eye.set(p.pos.x, p.pos.y + (p.eyeH || P.eyeHeight), p.pos.z);
      this._muzzle(_eye, _d, _o);
      this._aim(spot, _o, _d, k);
    }
  }

  reset() {
    const sm = ctx.sceneMgr;
    if (this.local) sm.releaseSpot(this.local);
    this.local = null;
    for (const s of this.remote.values()) sm.releaseSpot(s);
    this.remote.clear();
  }
}

export class Inventory {
  constructor() {
    this.slot = 1; // 1 = boş el, 2 = ekipman, 3+ = gizli eşyalar (verilme sırasına göre)
    this.cd = 0; // yerel saldırı beklemesi
    this.flash = new FlashlightManager();
    this.s2g = { target: null, t: 0 }; // S2G: şu an fermuarını çektiğim kişi + basılı tutma süresi
    this.holdProgress = 0; // 0..1: ekran ortasındaki ilerleme çubuğu (S2G basılı tutma)
  }

  get equipType() {
    return ctx.role?.equipment || null;
  }

  /** Elimdeki eşyanın türü: slot 3+ → gizli eşya (items[slot-3]); aksi hâlde rolün ekipmanı. */
  get heldType() {
    if (this.slot >= 3) return ctx.me_state?.items?.[this.slot - 3] || null;
    return this.equipType;
  }

  reset() {
    this.slot = 1;
    this.cd = 0;
    this.s2g.target = null; // (ölüm / tur sonu: host zaten iptal eder)
    this.s2g.t = 0;
    this.holdProgress = 0;
    if (ctx.me) {
      ctx.me.eq.out = false;
      ctx.me.eq.type = this.equipType;
      ctx.me.flashlight = false;
    }
    this.flash.reset();
  }

  /** Kendi rolüm değişince çağrılır. */
  onRole() {
    const id = ctx.role?.id || null;
    const changed = id !== this._roleId;
    if (changed) {
      this._roleId = id; // rol değişti (debug: canlı rol seçimi): eller boş başlar
      this.slot = 1;
    }
    if (ctx.me) ctx.me.eq.type = this.equipType;
    this._refresh(changed);
  }

  /** Host'tan gelen kişisel durum (can, mermi, bekleme süreleri). */
  applyMe(m) {
    const s = ctx.me_state;
    const items = m.items || [];
    const itemsChanged = items.join() !== (s.items || []).join();
    Object.assign(s, {
      hp: m.hp, ammo: m.ammo, mag: m.mag, reload: m.reload, abilityCd: m.abilityCd,
      baiter: m.baiter, baiterUsed: m.baiterUsed, knifeAway: m.knifeAway, mediumTarget: m.mediumTarget, mediumMutual: m.mediumMutual, s2gUsed: !!m.s2gUsed,
      items, god: !!m.god,
    });
    // Eşya verildi / alındı: elimdeki gizli eşyanın slot numarası kaymış olabilir → host'un söylediği slot'u benimse
    if (itemsChanged && this.slot >= 3) this.slot = m.slot >= 3 && items[m.slot - 3] ? m.slot : 1;
    this._refresh(false);
  }

  /** Yerdeki / havadaki bıçak durumuna göre elimdeki görünüm */
  _refresh(sendNet) {
    const me = ctx.me;
    if (!me) return;
    const type = this.heldType;
    me.eq.type = type;
    const knifeGone = type === 'knife' && ctx.me_state.knifeAway;
    const out = !!type && this.slot >= 2 && me.alive && !knifeGone;
    if (out !== me.eq.out) me.eq.out = out;
    if (sendNet) ctx.client.toHost({ t: 'equip', on: this.slot >= 2 && !!type ? 1 : 0, slot: this.slot });
  }

  setSlot(n, { silent = false } = {}) {
    const me = ctx.me;
    if (!me || !me.alive) return;
    if (n >= 2) {
      if (n === 2 && !this.equipType) {
        if (!silent) ctx.ui?.toast('Bu rolde ekipman yok.');
        return;
      }
      if (n >= 3 && !ctx.me_state.items?.[n - 3]) return; // o slotta eşya yok
      if (ctx.grab.held || me.carrying) {
        if (!silent) ctx.ui?.toast('Önce elindekini bırak.');
        return;
      }
    }
    if (this.slot === n) return;
    this.slot = n;
    this._refresh(true);
  }

  /** Bıçak katile geri döndü. forced: 2 dk dolduğu için zorla eline çekildi. */
  onKnifeReturn(forced) {
    ctx.me_state.knifeAway = false;
    if (forced) {
      if (ctx.grab.held) ctx.grab.requestDrop();
      this.slot = 2;
      ctx.ui?.toast('Bıçak geri geldi ve eline çekildi!');
    }
    this._refresh(false);
  }

  onKnifeAway() {
    ctx.me_state.knifeAway = true;
    this._refresh(false);
  }

  // ------------------------------------------------------------------ her kare
  update(dt) {
    const me = ctx.me;
    const input = ctx.input;
    const s = ctx.me_state;
    this.cd = Math.max(0, this.cd - dt);
    s.reload = Math.max(0, (s.reload || 0) - dt);
    s.abilityCd = Math.max(0, (s.abilityCd || 0) - dt);
    this.flash.update(dt);

    if (!me || !me.alive || ctx.phase !== 'playing') {
      if (me && me.eq.out && !me.alive) me.eq.out = false;
      this._s2gStop();
      return;
    }
    if (me.frozenLeft > 0) {
      this._s2gStop();
      return;
    }

    if (input.wasPressed(KEYS.hand)) this.setSlot(1);
    if (input.wasPressed(KEYS.equip)) this.setSlot(this.slot === 2 ? 1 : 2);
    for (let n = 3; n <= 5; n++) if (input.wasPressed(KEYS[`slot${n}`])) this.setSlot(this.slot === n ? 1 : n); // gizli eşya slotları
    if (input.wasPressed(KEYS.flashlight)) {
      me.flashlight = !me.flashlight;
      audio.sfx('click', { volume: 0.5 });
    }
    if (input.wasPressed(KEYS.ability)) this.useAbility();
    if (ctx.role?.ability === 's2g') this._s2gUpdate(dt);
    else if (this.s2g.target) this._s2gStop();

    // ---- saldırı ----
    const type = this.heldType;
    if (this.slot < 2 || !type || !me.eq.out || ctx.grab.held || me.carrying) return;
    if (input.wasPressed(KEYS.reload)) ctx.client.toHost({ t: 'reload' });
    if (this.cd > 0 || s.reload > 0) return;

    const W = E[type];
    const auto = type === 'rifle' || type === 'plasma';
    const fire = auto ? input.isDown(MOUSE_LEFT) : input.wasPressed(MOUSE_LEFT);
    if (fire) {
      const ray = ctx.movement.aimRay(); // ekranın ortasından (gözden) çıkan nişan çizgisi
      ctx.client.toHost({ t: 'fire', o: arr(ray.o), d: arr(ray.d) });
      this.cd = W.fireRate ? 1 / W.fireRate : W.cooldown;
      if (type === 'knife' || type === 'taser' || type === 'bomb' || (s.ammo ?? 1) > 0) ctx.viewmodel?.kick(type); // elimdeki ekipman animasyonu
    } else if (type === 'knife' && input.wasPressed(MOUSE_RIGHT)) {
      const ray = ctx.movement.aimRay();
      ctx.client.toHost({ t: 'alt', o: arr(ray.o), d: arr(ray.d) });
      this.cd = W.throwCooldown;
      ctx.viewmodel?.kick('knife');
    }
  }

  // ------------------------------------------------------------------ S2G (fermuar): X BASILI TUT
  /** Gece, ≤1 m yakındaki ve baktığım kişiye X'i basılı tut (süre config.js → abilities.s2g.holdTime). Süre dolunca host öldürür; her gece 1 kez. */
  _s2gUpdate(dt) {
    const cfg = A.s2g;
    const s = ctx.me_state;
    const ready = ctx.input.isDown(KEYS.ability) && !s.s2gUsed && (!cfg.nightOnly || isNight(ctx.world.lights)) && !ctx.grab.held && !ctx.me.carrying;
    const tg = ready ? this._s2gTarget(cfg) : null;
    if (!tg) {
      this._s2gStop();
      return;
    }
    if (this.s2g.target !== tg.id) {
      this._s2gStop();
      this.s2g.target = tg.id;
      ctx.client.toHost({ t: 'ability', a: 'start', target: tg.id });
    }
    this.s2g.t += dt;
    this.holdProgress = Math.min(1, this.s2g.t / cfg.holdTime);
  }

  /** Basılı tutmayı bırak / iptal et (host fermuar sesini keser). */
  _s2gStop() {
    if (this.s2g.target) ctx.client.toHost({ t: 'ability', a: 'stop' });
    this.s2g.target = null;
    this.s2g.t = 0;
    this.holdProgress = 0;
  }

  /** Yakın (yatayda ≤ range), bakış konisi içinde ve arada duvar olmayan en yakın canlı oyuncu. */
  _s2gTarget(cfg) {
    const me = ctx.me;
    const mv = ctx.movement;
    const col = ctx.world.collision;
    let best = null;
    let bestD = Infinity;
    for (const p of ctx.players.map.values()) {
      if (p === me || !p.alive) continue;
      const dist = Math.hypot(p.pos.x - me.pos.x, p.pos.z - me.pos.z);
      if (dist > cfg.range * 1.15 || Math.abs(p.pos.y - me.pos.y) > 1.2) continue;
      _o.copy(mv.eye);
      _d.set(p.pos.x, p.pos.y + (p.crouch ? 0.8 : 1.2), p.pos.z).sub(_o);
      const len = _d.length();
      if (len < 1e-4) continue;
      _d.divideScalar(len);
      if (_d.dot(mv.lookDir) < cfg.lookCos) continue;
      if (col.raycast(_o, _d, len)) continue;
      if (dist < bestD) {
        bestD = dist;
        best = p;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ X yeteneği
  async useAbility() {
    const role = ctx.role;
    const s = ctx.me_state;
    if (!role?.ability) return;
    if (s.abilityCd > 0) {
      ctx.ui.toast(`Yetenek bekleme süresinde: ${Math.ceil(s.abilityCd)} sn`);
      return;
    }
    const send = (extra = {}) => ctx.client.toHost({ t: 'ability', ...extra });
    switch (role.ability) {
      case 'sleepwalker':
        send();
        break;
      case 'bomber':
        send();
        break;
      case 's2g':
        break; // basılı tutularak kullanılır: _s2gUpdate
      case 'medium': {
        // Gündüz (ışıklar açık) bağlantı kurulamaz; sabah kesilmiş bağlantı gece yeniden kurulur.
        if (!isNight(ctx.world.lights)) {
          ctx.ui.toast('Medyum bağlantısı yalnızca gece (ışıklar kapalıyken) kurulabilir.');
          return;
        }
        const linked = s.mediumTarget && ctx.players.get(s.mediumTarget);
        if (linked) {
          const pick = await ctx.ui.choose('Medyum bağlantısı', [
            { label: s.mediumMutual ? 'Karşı taraf beni duymasın' : 'Karşı taraf beni de duysun', value: 'toggle' },
            { label: 'Başka birini seç', value: 'new' },
            { label: 'Bağlantıyı kapat', value: 'off' },
          ]);
          if (pick === 'toggle') send({ target: s.mediumTarget, mutual: !s.mediumMutual });
          else if (pick === 'off') send({ off: 1 });
          else if (pick === 'new') await this._mediumPick(send);
        } else await this._mediumPick(send);
        break;
      }
      default:
        break;
    }
  }

  async _mediumPick(send) {
    const list = ctx.players
      .all()
      .filter((p) => !p.isLocal && p.alive)
      .map((p) => ({ label: p.name, value: p.id }));
    if (!list.length) {
      ctx.ui.toast('Seçilecek oyuncu yok.');
      return;
    }
    const target = await ctx.ui.choose('Kiminle gizli bağlantı kurulsun?', list);
    if (target) send({ target, mutual: false });
  }
}
