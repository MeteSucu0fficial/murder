// Taşınabilir eşyalar: "Grab_*". Otomatik algılanır; çarpışma küresi nesne boyutundan otomatik üretilir.
//  - Her istemci: tutma, döndürme (sağ tık basılı), fırlatma (sol tık), bırakma (E).
//  - Host: fizik simülasyonu (yerçekimi, duvar/yer çarpışması, oyuncularla çarpışma) ve senkronizasyon.
// Eşya başına ayar (Blender özel özellikleri veya config.js → OBJECT_OVERRIDES):
//   weight, carryable, throwable, collisionSize:[x,y,z], rotationLimit:{x:[min,max], y:[min,max]}
import * as THREE from 'three';
import { GAME_CONFIG } from './config.js';
import { ctx } from './context.js';
import { MOUSE_LEFT, MOUSE_RIGHT } from './input.js';
import { clamp, num, vec3, round3 } from './util.js';

const G = GAME_CONFIG.grab;
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const truthy = (v, def = true) => (v === undefined ? def : !(v === false || v === 'false' || v === 0 || v === '0'));

export class GrabManager {
  constructor(world, entries) {
    this.world = world;
    this.items = new Map();
    this.held = null; // yerel oyuncunun tuttuğu eşya
    this.rotating = false;
    this.rotX = 0;
    this.rotY = 0;
    this.broadcastT = 0;
    this.fullT = 0;
    for (const e of entries) this._addItem(e);
  }

  _addItem(e) {
    const node = e.node;
    node.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(node);
    const center = box.getCenter(new THREE.Vector3());
    let size = box.getSize(new THREE.Vector3());
    const cs = vec3(e.data.collisionSize, null);
    if (cs) size = new THREE.Vector3(...cs);
    this.world.sceneMgr.worldGroup.attach(node); // dünya dönüşümü korunarak kök gruba taşı

    const offsetLocal = center
      .clone()
      .sub(node.position)
      .applyQuaternion(node.quaternion.clone().invert())
      .divide(node.scale);
    const item = {
      id: e.name,
      node,
      size,
      radius: clamp(Math.min(size.x, size.y, size.z) / 2, 0.08, 0.45),
      // Tutarken duvardan uzak durma payı: en büyük yarı-boyuta yakın (uzun eşyalar duvara girmesin)
      clear: clamp(Math.max(size.x, size.y, size.z) * 0.45, clamp(Math.min(size.x, size.y, size.z) / 2, 0.08, 0.45), 0.7),
      weight: Math.max(0.1, num(e.data.weight, G.defaultWeight)),
      carryable: truthy(e.data.carryable),
      throwable: truthy(e.data.throwable),
      rotLimit: e.data.rotationLimit || null,
      offsetLocal,
      pos: center.clone(),
      quat: node.quaternion.clone(),
      vel: new THREE.Vector3(),
      ang: new THREE.Vector3(),
      holder: null,
      asleep: true,
      sleepT: 0,
      dirty: false,
      home: { pos: center.clone(), quat: node.quaternion.clone() },
      targetPos: center.clone(),
      targetQuat: node.quaternion.clone(),
    };
    this.items.set(item.id, item);
  }

  _applyPose(it) {
    it.node.quaternion.copy(it.quat);
    _v.copy(it.offsetLocal).multiply(it.node.scale).applyQuaternion(it.quat);
    it.node.position.copy(it.pos).sub(_v);
    it.node.updateMatrixWorld(true);
  }

  // ---------------- Etkileşim sağlayıcısı (interaction.js) ----------------
  candidates(me) {
    if (this.held || !me?.alive || ctx.corpses.carrying) return [];
    const out = [];
    for (const it of this.items.values()) {
      if (it.holder || !it.carryable) continue;
      out.push({
        id: `grab:${it.id}`,
        kind: 'grab',
        priority: 2,
        position: it.pos,
        object: it.node, // bakış ışını eşyanın kendi mesh'ine değmeli
        hitRadius: Math.max(it.radius, 0.12), // çok küçük eşyalar için nişan toleransı
        label: () => 'Eşyayı tut',
        use: () => this.requestGrab(it.id),
      });
    }
    return out;
  }

  // ---------------- İstemci tarafı: tutma ----------------
  requestGrab(id) {
    ctx.client.toHost({ t: 'grab', id });
  }
  requestDrop() {
    if (!this.held) return;
    ctx.client.toHost({ t: 'drop', id: this.held.id, p: this._arr3(this.held.pos), q: this._arrQ(this.held.quat) });
  }
  requestThrow() {
    const it = this.held;
    if (!it) return;
    if (!it.throwable) {
      this.requestDrop();
      return;
    }
    const mv = ctx.movement;
    _dir.set(Math.sin(mv.yaw) * Math.cos(mv.pitch), Math.sin(mv.pitch) + 0.12, Math.cos(mv.yaw) * Math.cos(mv.pitch)).normalize();
    const speed = G.throwForce / Math.max(0.6, Math.sqrt(it.weight));
    ctx.client.toHost({
      t: 'throw',
      id: it.id,
      p: this._arr3(it.pos),
      q: this._arrQ(it.quat),
      v: [round3(_dir.x * speed), round3(_dir.y * speed), round3(_dir.z * speed)],
    });
  }

  _arr3(v) {
    return [round3(v.x), round3(v.y), round3(v.z)];
  }
  _arrQ(q) {
    return [round3(q.x), round3(q.y), round3(q.z), round3(q.w)];
  }

  /** Karedeki girdiler: sağ tık = döndür, sol tık = fırlat. movement.update'ten önce çağrılır. */
  handleInput() {
    const input = ctx.input;
    this.rotating = !!this.held && input.isDown(MOUSE_RIGHT);
    if (this.held && input.wasPressed(MOUSE_LEFT)) this.requestThrow();
  }

  /** Sağ tık basılıyken fare hareketi eşyayı döndürür (kamera dönmez). */
  rotateBy(dx, dy) {
    if (!this.held) return;
    this.rotY -= dx * G.rotateSpeed;
    this.rotX -= dy * G.rotateSpeed;
    const lim = this.held.rotLimit;
    if (lim?.x) this.rotX = clamp(this.rotX, lim.x[0], lim.x[1]);
    if (lim?.y) this.rotY = clamp(this.rotY, lim.y[0], lim.y[1]);
  }

  /** Tutulan eşyayı oyuncunun önünde, duvara girmeyecek şekilde konumlar. */
  updateHeld(dt) {
    const it = this.held;
    const me = ctx.me;
    if (!it) return;
    if (!me || !me.alive) {
      this.requestDrop();
      return;
    }
    const mv = ctx.movement;
    const col = this.world.collision;
    // Birinci şahıs: eşya gözün baktığı yönde, tam ekranın ortasında tutulur (config.js → grab.holdDrop: 0 = aşağıya sarkmaz; eşyalar ağır değildir).
    const cp = Math.cos(mv.pitch);
    _dir.set(Math.sin(mv.yaw) * cp, Math.sin(mv.pitch), Math.cos(mv.yaw) * cp);
    _origin.set(me.pos.x, me.pos.y + (me.eyeH || GAME_CONFIG.player.eyeHeight), me.pos.z);

    // 1) hedef: bakış yönünde `want` kadar ileride. Önünde engel (duvar, kapı...) varsa eşya engelin ÖNÜNDE durur
    //    (eşyanın en büyük yarı-boyutu kadar geride); gözden en az minWallClearance uzakta kalır.
    const want = Math.max(G.holdDistance, it.clear + 0.9);
    const hit = col.raycast(_origin, _dir, want + it.clear, { dynamic: true });
    const dist = clamp(hit ? hit.distance - it.clear - 0.04 : want, G.minWallClearance, want);
    _v.copy(_origin).addScaledVector(_dir, dist);
    _v.y -= G.holdDrop * Math.min(1, dist / want);

    // 2) yumuşatma: gözden yumuşatılmış konuma giden çizgi bir engele değiyorsa (hızlı dönüş, kapı kenarı) yumuşatma atlanır →
    //    eşya tek kare bile duvarın arkasında görünmez.
    _w.copy(it.pos).lerp(_v, 1 - Math.exp(-25 * dt));
    if (col.blocked(_origin, _w)) _w.copy(_v);

    // 3) küre itme: duvar / tavan / zemin / kapı içine girdiyse dışarı çıkarılır (iki tur: köşeler için)
    col.resolveSphere(_w, it.radius, _n);
    col.resolveSphere(_w, it.radius, _n);
    const floor = col.floorAt(_w.x, _w.y, _w.z, 0.1, 1.5);
    if (floor !== null && _w.y - it.radius < floor) _w.y = floor + it.radius;
    it.pos.copy(_w);

    // 4) çok sıkışıksa (duvara dayanmış, eşya gözün hemen önünde) eşya yerel oyuncuda gizlenir: kamerayı kaplamasın
    it.node.visible = _w.distanceTo(_origin) > it.clear + 0.12;

    _e.set(this.rotX, mv.yaw + this.rotY, 0, 'YXZ');
    _q.setFromEuler(_e);
    it.quat.slerp(_q, 1 - Math.exp(-20 * dt));
    it.dirty = true;
    this._applyPose(it);
  }

  /** pos mesajına eklenen tutulan eşya bilgisi */
  heldPayload() {
    const it = this.held;
    return it ? { i: it.id, p: this._arr3(it.pos), q: this._arrQ(it.quat) } : null;
  }

  speedMultiplier() {
    return this.held ? 1 / (1 + this.held.weight * G.weightSlow * 5) : 1;
  }

  // ---------------- Olay uygulama (tüm istemciler) ----------------
  onHeld({ id, by }) {
    const it = this.items.get(id);
    if (!it) return;
    it.holder = by;
    it.asleep = false;
    it.vel.set(0, 0, 0);
    if (by === ctx.myId) {
      this.held = it;
      this.rotX = 0;
      this.rotY = 0;
    }
  }
  onFree({ id, p, q, v }) {
    const it = this.items.get(id);
    if (!it) return;
    const mine = this.held === it;
    it.holder = null;
    it.node.visible = true; // tutarken sıkışınca gizlenmiş olabilir
    if (mine) {
      this.held = null;
      this.rotating = false;
    }
    if (p) {
      it.pos.set(...p);
      it.targetPos.set(...p);
    }
    if (q) {
      it.quat.set(...q);
      it.targetQuat.set(...q);
    }
    it.vel.set(...(v || [0, 0, 0]));
    it.asleep = false;
    it.sleepT = 0;
    it.dirty = true;
    this._applyPose(it);
  }

  applySnapshot(list) {
    if (ctx.isHost) return; // host kendi simülasyonuna güvenir
    for (const [id, x, y, z, qx, qy, qz, qw, flags] of list) {
      const it = this.items.get(id);
      if (!it || it === this.held) continue;
      it.targetPos.set(x, y, z);
      it.targetQuat.set(qx, qy, qz, qw);
      it.asleep = !!(flags & 2);
      if (it.pos.distanceToSquared(it.targetPos) > 25) {
        it.pos.copy(it.targetPos);
        it.quat.copy(it.targetQuat);
      }
    }
  }

  /** Host: tutan oyuncunun gönderdiği poz. */
  hostOnHoldPose(from, h) {
    const it = this.items.get(h?.i);
    if (!it || it.holder !== from || from === ctx.myId) return;
    it.pos.set(...h.p);
    it.quat.set(...h.q);
    it.dirty = true;
    this._applyPose(it);
  }

  // ---------------- HOST: istekleri doğrula ----------------
  /** Bu oyuncu şu an bir eşya tutuyor mu? */
  isHolding(playerId) {
    for (const o of this.items.values()) if (o.holder === playerId) return true;
    return false;
  }
  hostGrab(from, { id }) {
    const it = this.items.get(id);
    const p = ctx.players.get(from);
    if (!it || !p || !p.alive || it.holder || !it.carryable) return;
    if (this.isHolding(from) || ctx.corpses.isCarrying(from)) return; // zaten bir şey (eşya ya da ceset) tutuyor
    if (p.pos.distanceTo(it.pos) > G.reach + 2) return;
    ctx.host.broadcast({ t: 'itemHeld', id, by: from });
  }
  hostDrop(from, { id, p, q }) {
    const it = this.items.get(id);
    if (!it || it.holder !== from) return;
    ctx.host.broadcast({ t: 'itemFree', id, p, q, v: [0, 0, 0] });
  }
  hostThrow(from, { id, p, q, v }) {
    const it = this.items.get(id);
    if (!it || it.holder !== from) return;
    let vel = new THREE.Vector3(...(it.throwable ? v : [0, 0, 0]));
    if (vel.length() > 30) vel.setLength(30);
    ctx.host.broadcast({ t: 'itemFree', id, p, q, v: [round3(vel.x), round3(vel.y), round3(vel.z)] });
  }
  /** Oyuncu ölünce / çıkınca tuttuğu eşya düşer. */
  hostRelease(playerId) {
    for (const it of this.items.values()) {
      if (it.holder === playerId) ctx.host.broadcast({ t: 'itemFree', id: it.id, p: this._arr3(it.pos), q: this._arrQ(it.quat), v: [0, 0, 0] });
    }
  }

  // ---------------- HOST: fizik ----------------
  hostSim(dt) {
    const col = this.world.collision;
    const players = [];
    for (const p of ctx.players.map.values()) if (p.alive) players.push(p);
    const P = GAME_CONFIG.player;

    for (const it of this.items.values()) {
      if (it.holder) continue;
      // oyuncularla çarpışma (uyuyan eşyayı da uyandırır)
      for (const p of players) {
        const dx = it.pos.x - p.pos.x;
        const dz = it.pos.z - p.pos.z;
        const d = Math.hypot(dx, dz);
        const reach = P.radius + it.radius;
        if (d < reach && it.pos.y > p.pos.y - it.radius && it.pos.y < p.pos.y + P.height + it.radius) {
          const nx = d > 1e-4 ? dx / d : 1;
          const nz = d > 1e-4 ? dz / d : 0;
          it.pos.x += nx * (reach - d);
          it.pos.z += nz * (reach - d);
          it.vel.x += nx * G.playerPush;
          it.vel.z += nz * G.playerPush;
          it.vel.y += 0.6;
          it.asleep = false;
          it.sleepT = 0;
          it.dirty = true;
        }
      }
      if (it.asleep) continue;

      it.vel.y -= G.gravity * dt;
      const speed = it.vel.length();
      const n = clamp(Math.ceil((speed * dt) / (it.radius * 0.8)), 1, 10);
      const h = dt / n;
      let grounded = false;
      for (let i = 0; i < n; i++) {
        it.pos.addScaledVector(it.vel, h);
        if (col.resolveSphere(it.pos, it.radius, _n)) {
          this.world.midPaints?.hostItemHit(it); // serbest dönen tabloya çarptıysa ona darbe ver (çarpma çözülmeden ÖNCE: it.vel çarpma öncesi hız)
          const vn = it.vel.dot(_n);
          if (vn < 0) {
            const bounce = -vn > 1.5 ? 1 + G.restitution : 1;
            it.vel.addScaledVector(_n, -bounce * vn);
            if (-vn > 2) it.ang.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(Math.min(-vn, 8));
          }
          if (_n.y > 0.6) {
            grounded = true;
            const f = Math.exp(-4 * G.friction * h);
            it.vel.x *= f;
            it.vel.z *= f;
          }
        }
      }
      // dönme
      const av = it.ang.length();
      if (av > 0.01) {
        _v.copy(it.ang).divideScalar(av);
        _q.setFromAxisAngle(_v, av * dt);
        it.quat.premultiply(_q).normalize();
        it.ang.multiplyScalar(Math.exp((grounded ? -8 : -1.5) * dt));
      }
      it.dirty = true;

      if (grounded && it.vel.length() < G.sleepSpeed) {
        it.sleepT += dt;
        if (it.sleepT > 0.4) this._settle(it);
      } else it.sleepT = 0;

      if (it.pos.y < -30) this._toHome(it);
      this._applyPose(it);
    }
  }

  _settle(it) {
    it.asleep = true;
    it.vel.set(0, 0, 0);
    it.ang.set(0, 0, 0);
    _e.setFromQuaternion(it.quat, 'YXZ');
    _e.x = 0;
    _e.z = 0;
    it.quat.setFromEuler(_e);
    const floor = this.world.collision.floorAt(it.pos.x, it.pos.y, it.pos.z, 0.3, 1);
    if (floor !== null) it.pos.y = floor + it.size.y / 2;
    it.dirty = true;
    this._applyPose(it);
  }

  _toHome(it) {
    it.holder = null;
    it.node.visible = true;
    it.pos.copy(it.home.pos);
    it.quat.copy(it.home.quat);
    it.targetPos.copy(it.home.pos);
    it.targetQuat.copy(it.home.quat);
    it.vel.set(0, 0, 0);
    it.ang.set(0, 0, 0);
    it.asleep = true;
    it.dirty = true;
    this._applyPose(it);
  }

  /** Host: yayınlanacak anlık görüntü. all=true ise bütün eşyalar. */
  buildSnapshot(all = false) {
    const list = [];
    for (const it of this.items.values()) {
      if (!all && !it.dirty && it.asleep && !it.holder) continue;
      list.push([
        it.id, round3(it.pos.x), round3(it.pos.y), round3(it.pos.z),
        round3(it.quat.x), round3(it.quat.y), round3(it.quat.z), round3(it.quat.w),
        (it.holder ? 1 : 0) | (it.asleep ? 2 : 0),
      ]);
      it.dirty = false;
    }
    return list;
  }

  /** Host döngüsü: simülasyon + yayın. */
  hostUpdate(dt) {
    this.hostSim(dt);
    this.broadcastT += dt;
    this.fullT += dt;
    if (this.broadcastT >= 1 / GAME_CONFIG.net.itemsHz) {
      this.broadcastT = 0;
      const all = this.fullT > 2;
      if (all) this.fullT = 0;
      const l = this.buildSnapshot(all);
      if (l.length) ctx.host.broadcast({ t: 'items', l });
    }
  }

  /** Her kare (tüm istemciler): host olmayanlarda hedefe yumuşatma. */
  update(dt) {
    for (const it of this.items.values()) {
      if (it === this.held) continue;
      if (!ctx.isHost) {
        const k = 1 - Math.exp(-GAME_CONFIG.net.interpolation * dt);
        it.pos.lerp(it.targetPos, k);
        it.quat.slerp(it.targetQuat, k);
        this._applyPose(it);
      }
    }
  }

  // ---------------- Durum / sıfırlama ----------------
  getState() {
    const holders = {};
    for (const it of this.items.values()) if (it.holder) holders[it.id] = it.holder;
    return { l: this.buildSnapshot(true), h: holders };
  }
  setState(s) {
    if (!s) return;
    for (const [id, x, y, z, qx, qy, qz, qw, flags] of s.l || []) {
      const it = this.items.get(id);
      if (!it) continue;
      it.pos.set(x, y, z);
      it.quat.set(qx, qy, qz, qw);
      it.targetPos.copy(it.pos);
      it.targetQuat.copy(it.quat);
      it.asleep = !!(flags & 2);
      it.vel.set(0, 0, 0);
      it.holder = s.h?.[id] || null;
      this._applyPose(it);
    }
    this.held = null;
    for (const it of this.items.values()) if (it.holder === ctx.myId) this.held = it;
  }
  reset() {
    this.held = null;
    this.rotating = false;
    for (const it of this.items.values()) this._toHome(it);
  }
}
