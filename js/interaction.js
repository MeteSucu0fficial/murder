// Etkileşim sistemi: BAKTIĞIN nesne seçilir — mesafeye göre sıralama yoktur.
// Ekranın ortasından (gözden) çıkan ışın bir nesnenin kendisine değiyorsa ve menzil içindeyse (config.js → interaction.reach)
// o nesne seçilir. Duvarın / kapalı kapının arkasındaki nesneler seçilemez. Aynı ışın üzerinde birden çok nesne varsa EN YAKINI seçilir.
// Nesneler "sağlayıcı" (provider) fonksiyonlarıyla eklenir. Her aday:
//   { id, kind, priority, position, object?, hitRadius?, label(), use(player), hold?, release?, enabled? }
//   object   : ışının test edileceği Object3D (mesh/grup). Yoksa position çevresinde bir küre ("Interact_*" noktaları) kullanılır.
//   hitRadius: küre yarıçapı (küçük eşyalarda nişan toleransı olarak da kullanılır).
//   priority : yalnızca iki nesne aynı mesafedeyse (1 ceset, 2 eşya, 3 buton/şalter, 4 kapı/tablo) bakılır.
import * as THREE from 'three';
import { GAME_CONFIG, KEYS } from './config.js';
import { ctx } from './context.js';
import { MOUSE_LEFT } from './input.js';

const IR = GAME_CONFIG.interaction;
const WALL_TOLERANCE = 0.12; // duvara yapışık nesneler (şalter, tablo, kapı) için yüzey toleransı
const CULL_PAD = 3.5; // menzil + bu kadardan uzak merkezli nesneler hiç test edilmez
const _ray = new THREE.Ray();
const _rc = new THREE.Raycaster();
const _sphere = new THREE.Sphere();
const _pt = new THREE.Vector3();
const _org = new THREE.Vector3();
const _dir = new THREE.Vector3();

/** Işın bu adaya en yakın nerede değiyor? Mesafe döner (değmiyorsa null). */
function rayHit(it, ray, maxT) {
  let best = null;
  if (it.object && !it.requireAnchor) {
    _rc.ray.copy(ray);
    _rc.near = 0;
    _rc.far = maxT;
    const h = _rc.intersectObject(it.object, true)[0];
    if (h) best = h.distance;
  }
  if (best === null) {
    let r = it.hitRadius ?? 0;
    if (!it.object || it.anchored) r = Math.max(r, IR.anchorRadius); // bağlı nokta ("Interact_*") ya da mesh'siz aday: küre
    if (r > 0) {
      _sphere.set(it.position, r);
      if (ray.intersectSphere(_sphere, _pt)) {
        const d = ray.origin.distanceTo(_pt);
        if (d <= maxT) best = d;
      }
    }
  }
  return best;
}

export class Interaction {
  constructor() {
    this.providers = [];
    this.best = null;
    this.activeHold = null;
    _rc.camera = ctx.sceneMgr?.camera || null;
  }

  addProvider(fn) {
    this.providers.push(fn);
  }

  _clear() {
    this.best = null;
    if (this.activeHold) {
      this.activeHold.release?.();
      this.activeHold = null;
    }
    ctx.ui?.setPrompt(null);
    ctx.ui?.setCrosshairActive(false);
  }

  update() {
    const me = ctx.me;
    const input = ctx.input;
    if (!me || !me.alive || ctx.phase !== 'playing' || me.frozenLeft > 0) {
      this._clear();
      return;
    }

    // Basılı tutulan etkileşim (adayda `hold` varsa: tuş basılı kaldığı sürece sürer)
    if (this.activeHold) {
      if (!input.isDown(KEYS.interact)) {
        this.activeHold.release?.();
        this.activeHold = null;
      } else {
        ctx.ui.setPrompt(KEYS.interact, 'Bırakmak için tuşu bırak');
        ctx.ui.setCrosshairActive(true);
        return;
      }
    }

    // Eşya tutuluyorsa: etkileşim tuşu bırakır
    if (ctx.grab.held) {
      ctx.ui.setPrompt(KEYS.interact, 'Bırak  ·  Sağ tık: döndür  ·  Sol tık: fırlat');
      ctx.ui.setCrosshairActive(false);
      if (input.wasPressed(KEYS.interact)) ctx.grab.requestDrop();
      return;
    }

    // Ceset taşınıyorsa: etkileşim tuşu bırakır. Cesede BAKMAYI bırakırsan ceset zaten düşer (corpse.js → _driveMine).
    if (ctx.corpses.carrying) {
      ctx.ui.setPrompt(KEYS.interact, 'Cesedi bırak  ·  cesede bakmaya devam et, yoksa düşer');
      ctx.ui.setCrosshairActive(false);
      if (input.wasPressed(KEYS.interact)) ctx.corpses.requestDrop();
      return;
    }

    // Işın: gözden, bakılan yöne (ekranın ortası)
    const mv = ctx.movement;
    _org.copy(mv.eye);
    _dir.copy(mv.lookDir);
    _ray.set(_org, _dir);
    const wall = ctx.world.collision.raycast(_org, _dir, IR.reach + 0.5);
    const maxT = wall ? Math.min(IR.reach, wall.distance + WALL_TOLERANCE) : IR.reach;

    // Boş elle tabloya doğrudan tıklama (baktığın tablo)
    if (ctx.inventory.slot === 1 && input.wasPressed(MOUSE_LEFT)) {
      const hit = ctx.world.paintings.pick(_org, _dir, IR.reach);
      if (hit && hit.distance <= maxT) ctx.world.send({ k: 'painting', id: hit.id });
    }

    let best = null;
    let bestT = Infinity;
    const lim = (IR.reach + CULL_PAD) * (IR.reach + CULL_PAD);
    const consider = (it) => {
      if (it.enabled && !it.enabled()) return;
      if (it.position.distanceToSquared(_org) > lim) return;
      const t = rayHit(it, _ray, maxT);
      if (t === null) return;
      if (t < bestT - 0.02 || (Math.abs(t - bestT) <= 0.02 && best && it.priority < best.priority)) {
        best = it;
        bestT = t;
      }
    };
    for (const it of ctx.world.interactables) consider(it);
    for (const p of this.providers) for (const it of p(me)) consider(it);

    this.best = best;
    ctx.ui.setCrosshairActive(!!best);
    if (!best) {
      ctx.ui.setPrompt(null);
      return;
    }
    ctx.ui.setPrompt(KEYS.interact, typeof best.label === 'function' ? best.label() : best.label);
    if (input.wasPressed(KEYS.interact)) {
      best.use(me);
      if (best.hold) this.activeHold = best;
    }
  }
}
