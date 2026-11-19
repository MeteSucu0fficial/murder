// Cesetler: ölen oyuncu bir RAGDOLL olur (ragdoll.js). HOST fiziği hesaplar, herkes host'un yayınladığı noktaları çizer.
// Taşıma: bir cesede BAKIP etkileşim tuşuna basınca bakılan uzvundan (kol, bacak, baş, gövde) tutulur — eşya tutar gibi ama ÇOK DAHA ZOR:
//   • yavaş yürürsün (corpse.carrySpeed), koşamaz / zıplayamazsın;
//   • tutulan uzuv zeminden en fazla corpse.maxLift kadar kalkar, hedefe en fazla corpse.pullSpeed hızıyla gelir (ağırlık hissi);
//   • cesede BAKMAYI BIRAKIRSAN (bakış tutulan uzuvdan corpse.dropAngle'dan fazla sapar) ya da uzuv çok uzaklaşırsa ceset elinden düşer.
// Ağ: death{imp} → spawn · rag (12 Hz noktalar, yalnız uyanık cesetler) · carry{id,on,pi} (istek) → corpseCarry{id,by,pi} (olay)
//     taşıyan oyuncunun pos mesajındaki c:{i,pi,p:[x,y,z]} tutulan uzvun HEDEF noktasıdır.
import * as THREE from 'three';
import { GAME_CONFIG, KEYS } from './config.js';
import { ctx } from './context.js';
import { truePos } from './combat.js';
import { keyLabel } from './keybinds.js';
import { clamp, round2 } from './util.js';
import { R, RADIUS, RagdollSim, RagdollView, fromCm, skinTone, standingPose, toCm } from './ragdoll.js';

const CC = GAME_CONFIG.corpse;
const P = GAME_CONFIG.player;
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();

export class CorpseManager {
  constructor() {
    this.map = new Map();
    this.carrying = null; // benim taşıdığım ceset kimliği
    this.netT = 0;
    this.dropAt = 0;
  }

  // ------------------------------------------------------------------ oluşturma / silme
  /**
   * Ceset oluşturur.
   *  p: ayak konumu [x,y,z] (yeni ölüm) · yaw · imp: ölüm anı itişi [x,y,z] m/sn
   *  pts: kayıtlı noktalar (santimetre; sonradan katılan oyuncu için) · asleep · by/pi: taşıyan oyuncu ve tutulan nokta
   */
  spawn({ id, p = null, yaw = 0, color = 0x888888, imp = null, pts = null, asleep = false, by = null, pi = -1 }) {
    this.remove(id);
    const view = new RagdollView(color, { skin: skinTone(id) }); // yaşarken olduğu ten rengi (açık / kahverengi)
    view.setFace(ctx.players?.get(id)?.identity?.face); // ve yüzü
    ctx.sceneMgr.actorGroup.add(view.group);
    // Ölü oyuncunun "boşluk" görünümünde (movement.js → scene.js setVoid) yalnızca bu katmandaki nesneler çizilir: cesetler.
    const VL = GAME_CONFIG.deadView.layer;
    view.group.traverse((o) => o.layers.enable(VL));
    const c = {
      id,
      color,
      view,
      sim: null, // yalnızca host'ta
      tgt: new Float32Array(R.COUNT * 3), // istemci: ağdan gelen son noktalar
      carriedBy: by,
      heldIdx: by ? pi : -1,
      lookAway: 0,
      asleep,
      snapped: false,
      myTarget: new THREE.Vector3(),
    };
    let feet = null;
    if (pts) {
      fromCm(pts, c.tgt);
      c.snapped = true;
    } else {
      feet = { x: p?.[0] ?? 0, y: p?.[1] ?? 0, z: p?.[2] ?? 0 };
      c.tgt.set(standingPose(feet, yaw));
    }
    view.setPoints(c.tgt);
    if (ctx.isHost && ctx.world) {
      c.sim = new RagdollSim(ctx.world.collision, feet || { x: c.tgt[0], y: 0, z: c.tgt[2] }, yaw, pts ? null : imp);
      if (pts) {
        c.sim.loadCm(pts);
        if (asleep) c.sim.sleep();
      }
      if (by && pi >= 0) {
        c.sim.held = pi;
        c.sim.point(pi, c.sim.target);
      }
    }
    this.map.set(id, c);
    view.update();
    if (by && by === ctx.myId) this._setMine(id);
    return c;
  }

  remove(id) {
    const c = this.map.get(id);
    if (!c) return;
    c.view.dispose();
    this.map.delete(id);
    if (this.carrying === id) this._setMine(null);
  }

  _setMine(id) {
    this.carrying = id;
    if (ctx.me) ctx.me.carrying = id;
  }

  isCarrying(playerId) {
    for (const c of this.map.values()) if (c.carriedBy === playerId) return true;
    return false;
  }

  // ------------------------------------------------------------------ etkileşim sağlayıcısı
  /** Bakışa en yakın tutulabilir uzvun indeksi (ışına en yakın nokta). Bulunamazsa -1. */
  pickParticle(c, eye, dir) {
    let best = -1;
    let bestScore = Infinity;
    const pts = c.view.pts;
    for (let i = 0; i < R.GRABBABLE; i++) {
      _a.subVectors(pts[i], eye);
      const t = _a.dot(dir);
      if (t < 0.05 || t > CC.reach + 0.8) continue;
      _b.copy(dir).multiplyScalar(t);
      const perp = _a.sub(_b).length();
      const score = perp > RADIUS[i] + 0.2 ? perp + 10 : perp; // nişana yakın olanlar önde; yine de her zaman bir uzuv seçilir
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  }

  candidates(me) {
    if (this.carrying || !me?.alive || ctx.grab.held) return [];
    const eye = ctx.movement.eye;
    const lim = (CC.reach + 1.4) * (CC.reach + 1.4);
    const out = [];
    for (const c of this.map.values()) {
      if (c.carriedBy || c.view.center.distanceToSquared(eye) > lim) continue;
      out.push({
        id: `corpse:${c.id}`,
        kind: 'corpse',
        priority: 1,
        position: c.view.center,
        object: c.view.group, // bakış ışını cesedin kendisine değmeli
        hitRadius: 0.3,
        label: () => `Cesedi tut (${keyLabel(KEYS.interact)}) · çok ağır`,
        use: () => this.requestCarry(c),
      });
    }
    return out;
  }

  requestCarry(c) {
    const mv = ctx.movement;
    const pi = this.pickParticle(c, mv.eye, mv.lookDir);
    if (pi < 0) return;
    if (c.view.pts[pi].distanceTo(mv.eye) > CC.reach + 0.3) {
      ctx.ui.toast('Ceset çok uzakta.', 1500);
      return;
    }
    ctx.client.toHost({ t: 'carry', id: c.id, on: 1, pi });
  }

  /** Bırak (tuşla ya da bakış / uzaklık kuralıyla). reason: bilgi mesajı (yoksa sessiz). */
  requestDrop(reason = '') {
    const now = performance.now();
    if (!this.carrying || now - this.dropAt < 300) return;
    this.dropAt = now;
    if (reason) ctx.ui.toast(reason, 2200);
    ctx.client.toHost({ t: 'carry', id: this.carrying, on: 0 });
  }

  // ------------------------------------------------------------------ olaylar (herkes)
  onCarry({ id, by, pi = -1 }) {
    const c = this.map.get(id);
    if (!c) return;
    c.carriedBy = by;
    c.heldIdx = by ? pi : -1;
    c.lookAway = 0;
    if (c.sim) {
      c.sim.wake();
      if (by && pi >= 0) {
        c.sim.held = pi;
        c.sim.point(pi, c.sim.target);
      } else c.sim.held = -1;
      c.sim.dirty = true;
    }
    if (by === ctx.myId) {
      this._setMine(id);
      this._computeTarget(c, c.myTarget);
    } else if (this.carrying === id) this._setMine(null);
  }

  /** Taşıyan oyuncunun pos mesajına eklenen bilgi: tutulan uzvun HEDEF noktası. */
  heldPayload() {
    const c = this.carrying ? this.map.get(this.carrying) : null;
    if (!c || c.heldIdx < 0) return null;
    const t = c.myTarget;
    return { i: c.id, pi: c.heldIdx, p: [round2(t.x), round2(t.y), round2(t.z)] };
  }

  /** Host'tan gelen ceset noktaları (12 Hz). Host kendi simülasyonunu kullandığı için yok sayar. */
  applySnapshot(list) {
    for (const [id, flags, pts] of list || []) {
      const c = this.map.get(id);
      if (!c || c.sim) continue;
      fromCm(pts, c.tgt);
      c.asleep = !!(flags & 1);
      if (!c.snapped) {
        c.view.setPoints(c.tgt);
        c.snapped = true;
      }
    }
  }

  // ------------------------------------------------------------------ her kare (herkes)
  /** Tutulan uzvun gitmesi gereken nokta: gözden bakış yönünde holdDistance ileride, zeminden en fazla maxLift yukarıda, duvara girmez. */
  _computeTarget(c, out) {
    const mv = ctx.movement;
    const col = ctx.world.collision;
    out.copy(mv.eye).addScaledVector(mv.lookDir, CC.holdDistance);
    const floor = col.floorAt(out.x, mv.eye.y, out.z, 0.2, 4);
    if (floor !== null) out.y = clamp(out.y, floor + 0.1, floor + CC.maxLift);
    _d.subVectors(out, mv.eye);
    const len = _d.length();
    if (len > 1e-4) {
      _d.multiplyScalar(1 / len);
      const hit = col.raycast(mv.eye, _d, len + 0.1);
      if (hit) out.copy(mv.eye).addScaledVector(_d, Math.max(0.3, hit.distance - 0.12));
    }
    return out;
  }

  /** Benim taşıdığım ceset: hedefi güncelle, bakış / uzaklık kuralını denetle. */
  _driveMine(dt) {
    const c = this.carrying ? this.map.get(this.carrying) : null;
    const me = ctx.me;
    if (!c || c.heldIdx < 0 || !me?.alive || !ctx.movement) return;
    const mv = ctx.movement;
    this._computeTarget(c, c.myTarget);
    _d.subVectors(c.view.pts[c.heldIdx], mv.eye);
    const dist = _d.length();
    if (dist > CC.dropDistance) {
      this.requestDrop('Ceset elinden kaydı.');
      return;
    }
    if (dist > 0.25) {
      const ang = Math.acos(clamp(_d.dot(mv.lookDir) / dist, -1, 1));
      c.lookAway = ang > CC.dropAngle ? c.lookAway + dt : Math.max(0, c.lookAway - dt * 2);
      if (c.lookAway > CC.dropGrace) this.requestDrop('Cesede bakmayı bıraktın: ceset düştü.');
    }
  }

  update(dt) {
    const k = 1 - Math.exp(-CC.smooth * dt);
    for (const c of this.map.values()) {
      if (c.sim) c.view.setPoints(c.sim.x);
      else c.view.smoothTo(c.tgt, k);
      c.view.update();
    }
    this._driveMine(dt);
  }

  // ------------------------------------------------------------------ HOST
  _point(c, i, out) {
    return c.sim ? c.sim.point(i, out) : out.copy(c.view.pts[i]);
  }

  hostCarry(from, { id, on, pi }) {
    const c = this.map.get(id);
    const p = ctx.players.get(from);
    if (!c || !p) return;
    if (on) {
      if (!ctx.host.state.players[from]?.alive || c.carriedBy || this.isCarrying(from) || ctx.world.grab.isHolding(from)) return;
      if (!Number.isInteger(pi) || pi < 0 || pi >= R.GRABBABLE) return;
      const tp = truePos(p);
      if (this._point(c, pi, _a).distanceTo(_b.set(tp.x, tp.y + P.eyeHeight, tp.z)) > CC.reach + 1.6) return;
      ctx.host.broadcast({ t: 'corpseCarry', id, by: from, pi });
    } else if (c.carriedBy === from) {
      ctx.host.broadcast({ t: 'corpseCarry', id, by: null });
    }
  }

  /** Taşıyanın pos mesajı: tutulan uzvun hedefi (host doğrular: erişim ve kaldırma sınırı). */
  hostOnCarryPose(from, d) {
    const c = this.map.get(d?.i);
    if (!c || c.carriedBy !== from || !c.sim || !Array.isArray(d.p)) return;
    const [x, y, z] = d.p;
    if (![x, y, z].every(Number.isFinite)) return;
    const p = ctx.players.get(from);
    if (!p) return;
    const tp = truePos(p);
    _a.set(x, y, z);
    _b.set(tp.x, tp.y + P.eyeHeight, tp.z);
    const maxD = CC.holdDistance + 1.2;
    if (_a.distanceTo(_b) > maxD) _a.sub(_b).setLength(maxD).add(_b);
    const floor = ctx.world.collision.floorAt(_a.x, _a.y, _a.z, 0.3, 4);
    if (floor !== null) _a.y = Math.min(_a.y, floor + CC.maxLift);
    c.sim.target.copy(_a);
  }

  hostRelease(playerId) {
    for (const c of this.map.values()) {
      if (c.carriedBy === playerId) ctx.host.broadcast({ t: 'corpseCarry', id: c.id, by: null });
    }
  }

  /** Host: cesedin ayak konumu (gövde merkezinin altındaki zemin) — "cesedinde diriltme" için. Ceset yoksa null. */
  hostFeetOf(id) {
    const s = this.map.get(id)?.sim;
    if (!s) return null;
    s._center();
    const y = ctx.world.collision.floorAt(s.cx, s.cy, s.cz, 0.6, 4);
    return { x: s.cx, y: y ?? s.cy - 0.2, z: s.cz };
  }

  /** Patlama: mevcut tüm cesetleri savurur. */
  hostBlast(center, radius, strength) {
    for (const c of this.map.values()) c.sim?.blast(center, radius, strength);
  }

  /** S2G: ceset `seconds` boyunca her `interval` saniyede bir hafifçe zıplar (host). */
  hostHop(id, seconds, interval, speed) {
    const c = this.map.get(id);
    if (!c?.sim) return;
    c.hop = { left: seconds, wait: 0, interval, speed };
  }

  /** Host döngüsü: fizik adımı + uyanık cesetlerin ağ yayını. */
  hostUpdate(dt) {
    const host = ctx.host;
    if (!host || !this.map.size) return;
    const S = host.state;
    const bodies = host.bodies();
    for (const c of this.map.values()) {
      const sim = c.sim;
      if (!sim) continue;
      if (c.carriedBy) {
        const p = ctx.players.get(c.carriedBy);
        let drop = !p || !S.players[c.carriedBy]?.alive;
        if (!drop) {
          const tp = truePos(p);
          drop = sim.point(c.heldIdx, _a).distanceTo(_b.set(tp.x, tp.y + P.eyeHeight, tp.z)) > CC.dropDistance + 1.2;
        }
        if (drop) host.broadcast({ t: 'corpseCarry', id: c.id, by: null });
      }
      const hop = c.hop;
      if (hop) {
        hop.left -= dt;
        hop.wait -= dt;
        if (hop.left <= 0) c.hop = null;
        else if (hop.wait <= 0) {
          hop.wait = hop.interval;
          sim.hop(hop.speed);
        }
      }
      sim.pushBodies(bodies);
      sim.step(dt);
    }
    this.netT += dt;
    if (this.netT < 1 / CC.netHz) return;
    this.netT = 0;
    const l = [];
    for (const c of this.map.values()) {
      const sim = c.sim;
      if (!sim) continue;
      if (!sim.asleep || sim.dirty) {
        l.push([c.id, sim.asleep ? 1 : 0, sim.snapshotCm()]);
        sim.dirty = false;
      }
    }
    if (l.length) host.broadcast({ t: 'rag', l });
  }

  // ------------------------------------------------------------------ durum
  getState() {
    return [...this.map.values()].map((c) => ({
      id: c.id,
      color: c.color,
      pts: c.sim ? c.sim.snapshotCm() : toCm(c.tgt),
      asleep: c.sim ? c.sim.asleep : c.asleep,
      by: c.carriedBy,
      pi: c.heldIdx,
    }));
  }
  setState(list) {
    this.clear();
    for (const s of list || []) this.spawn(s);
  }
  clear() {
    for (const id of [...this.map.keys()]) this.remove(id);
    this._setMine(null);
  }
}
