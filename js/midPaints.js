// Serbest dönen tablolar: "MidPaint_*" (midpaint_ · MidPoint_1 · Mid_Painting_01 ... hepsi tanınır).
// Normal "Painting_*" tablolar kayarak açılır; bunlar ise bir PİVOT (nesne orijini, Blender'da plakanın ortası) etrafında SERBESTÇE döner:
//   · oyuncu iterek dokunursa: dokunduğu noktaya (kol uzunluğu) ve hızına (yürürken yavaş, koşarken hızlı) göre döner; yüzeyde kayarken sürükler,
//   · bir eşya çarparsa (atılan / düşen eşya): eşyanın ağırlığı × çarpma hızı kadar darbe alır, çarptığı noktaya göre döner,
//   · sürtünmeyle yavaşlar ve durduğu yerde kalır (isteğe bağlı: restoreSpring ile ilk duruşuna döner),
//   · KATIDIR: içinden geçilmez (kapı gibi kendi mesh'i çarpışma olarak kullanılır) ve dönerken duvara / zemine / kapıya girmez.
// Mimari: fizik yalnızca HOST'ta çalışır (hostUpdate); durum ~15 Hz herkese yayınlanır ({t:'mp'}), istemciler yumuşatır.
// Oyuncu itişi için istemci, kendi "istenen hızını" konum paketine ekler (client.js → wx, wz): oyuncu plakaya yaslanıp dururken bile itişi host bilir.
// Nesne başına ayar (Blender özel özellikleri / config.js → OBJECT_OVERRIDES): mass, damping, maxSpin, restoreSpring, axis ('free' | 'vertical' | 'normal' | [x,y,z]).
import * as THREE from 'three';
import { GAME_CONFIG } from './config.js';
import { ctx } from './context.js';
import { bodyBounds } from './blenderLoader.js';
import { clamp, num, round3, vec3 } from './util.js';

const M = GAME_CONFIG.midPaint;
const P = GAME_CONFIG.player;
const UP = new THREE.Vector3(0, 1, 0);

// geçici nesneler (her bölümün kendi grubu: iç içe çağrılarda çakışmasın)
const _qc = new THREE.Quaternion(); // closestOnBody
const _qv = new THREE.Quaternion(); // _invI
const _qn = new THREE.Quaternion(); // entegrasyon: yeni yönelim
const _dq = new THREE.Quaternion();
const _qe = new THREE.Quaternion(); // yay
const _qr = new THREE.Quaternion();
const _ax = new THREE.Vector3();
const _sb = new THREE.Vector3(); // closestOnBody
const _cb = new THREE.Vector3();
const _db = new THREE.Vector3();
const _cp = new THREE.Vector3(); // temas noktası / normali (tek aday)
const _cn = new THREE.Vector3();
const _bp = new THREE.Vector3(); // en iyi temas
const _bn = new THREE.Vector3();
const _sp = new THREE.Vector3(); // oyuncu kapsülü örnek noktası
const _w = new THREE.Vector3(); // oyuncunun istenen yatay hızı
const _r = new THREE.Vector3(); // pivottan temas noktasına kol
const _lat = new THREE.Vector3();
const _sv = new THREE.Vector3(); // yüzeyin o noktadaki hızı
const _tv = new THREE.Vector3();
const _rn = new THREE.Vector3();
const _iv = new THREE.Vector3();
const _p0 = new THREE.Vector3(); // engel testi
const _p1 = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _nrm = new THREE.Vector3();

/**
 * p noktasının plakanın kutusuna (gövde çerçevesinde min..max) en yakın noktası. Dönüş: uzaklık (nokta kutunun içindeyse 0).
 * outPoint: dünya uzayında kutu yüzeyindeki en yakın nokta · outNormal: plakadan p'ye doğru dünya yüzey normali (birim).
 */
function closestOnBody(b, p, outPoint, outNormal) {
  _qc.copy(b.q).invert();
  _sb.copy(p).sub(b.pivot).applyQuaternion(_qc);
  _cb.set(clamp(_sb.x, b.min.x, b.max.x), clamp(_sb.y, b.min.y, b.max.y), clamp(_sb.z, b.min.z, b.max.z));
  _db.subVectors(_sb, _cb);
  let dist = _db.length();
  if (dist > 1e-5) {
    _db.divideScalar(dist);
  } else {
    // nokta kutunun içinde: en yakın yüzeye çıkar
    dist = 0;
    let m = _sb.x - b.min.x;
    _db.set(-1, 0, 0);
    _cb.set(b.min.x, _sb.y, _sb.z);
    if (b.max.x - _sb.x < m) {
      m = b.max.x - _sb.x;
      _db.set(1, 0, 0);
      _cb.set(b.max.x, _sb.y, _sb.z);
    }
    if (_sb.y - b.min.y < m) {
      m = _sb.y - b.min.y;
      _db.set(0, -1, 0);
      _cb.set(_sb.x, b.min.y, _sb.z);
    }
    if (b.max.y - _sb.y < m) {
      m = b.max.y - _sb.y;
      _db.set(0, 1, 0);
      _cb.set(_sb.x, b.max.y, _sb.z);
    }
    if (_sb.z - b.min.z < m) {
      m = _sb.z - b.min.z;
      _db.set(0, 0, -1);
      _cb.set(_sb.x, _sb.y, b.min.z);
    }
    if (b.max.z - _sb.z < m) {
      _db.set(0, 0, 1);
      _cb.set(_sb.x, _sb.y, b.max.z);
    }
  }
  outNormal.copy(_db).applyQuaternion(b.q);
  outPoint.copy(_cb).applyQuaternion(b.q).add(b.pivot);
  return dist;
}

/** Dönme eksenini ayarlardan okur: null = serbest. */
function parseAxis(v, q0, bb) {
  if (v == null) return new THREE.Vector3(0, 1, 0); // varsayılan: tablolar yalnızca KENDİ Y (dikey) ekseni etrafında döner
  if (typeof v === 'string') {
    const k = v.trim().toLowerCase();
    if (k === '' || k === 'free' || k === 'serbest') return null;
    if (k === 'vertical' || k === 'y' || k === 'up' || k === 'dikey') return new THREE.Vector3(0, 1, 0);
    if (k === 'normal') {
      // plakanın en ince ekseni (yüzeye dik): plakayı kendi düzleminde tekerlek gibi döndürür (duvara yapışık tablolar için)
      const sx = bb.max.x - bb.min.x;
      const sy = bb.max.y - bb.min.y;
      const sz = bb.max.z - bb.min.z;
      const a = sx <= sy && sx <= sz ? new THREE.Vector3(1, 0, 0) : sy <= sz ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
      return a.applyQuaternion(q0).normalize();
    }
  }
  const a = vec3(v, null);
  if (!a) return null;
  const w = new THREE.Vector3(a[0], a[1], a[2]);
  return w.lengthSq() > 1e-8 ? w.normalize() : null;
}

export class MidPaintSystem {
  constructor(world, entries) {
    this.world = world;
    this.list = [];
    this.byId = new Map();
    this.interactables = []; // (world.js sistem arayüzü; E ile kullanılmaz)
    this.netT = 0;
    this.fullT = 0;
    for (const e of entries) this._add(e);
  }

  _add(e) {
    const node = e.node;
    const d = e.data || {};
    node.updateWorldMatrix(true, true);
    const pivot = node.getWorldPosition(new THREE.Vector3());
    const q0 = node.getWorldQuaternion(new THREE.Quaternion());
    const parentInv = node.parent ? node.parent.getWorldQuaternion(new THREE.Quaternion()).invert() : new THREE.Quaternion();
    const bb = bodyBounds(node) || { min: new THREE.Vector3(-0.5, -0.5, -0.03), max: new THREE.Vector3(0.5, 0.5, 0.03) };

    // atalet (dikdörtgen prizma, pivot ortada değilse paralel eksen terimiyle): en küçük kalınlık minThickness
    const mass = Math.max(0.2, num(d.mass, M.mass));
    const sx = Math.max(bb.max.x - bb.min.x, M.minThickness);
    const sy = Math.max(bb.max.y - bb.min.y, M.minThickness);
    const sz = Math.max(bb.max.z - bb.min.z, M.minThickness);
    const cx = (bb.min.x + bb.max.x) / 2;
    const cy = (bb.min.y + bb.max.y) / 2;
    const cz = (bb.min.z + bb.max.z) / 2;
    const inertia = new THREE.Vector3(
      mass * ((sy * sy + sz * sz) / 12 + cy * cy + cz * cz),
      mass * ((sx * sx + sz * sz) / 12 + cx * cx + cz * cz),
      mass * ((sx * sx + sy * sy) / 12 + cx * cx + cy * cy),
    );

    // pivottan en uzak köşe + engel testi için örnek noktalar (8 köşe + 12 kenar ortası; gövde çerçevesinde)
    const xs = [bb.min.x, cx, bb.max.x];
    const ys = [bb.min.y, cy, bb.max.y];
    const zs = [bb.min.z, cz, bb.max.z];
    const samples = [];
    let reach = 0;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        for (let k = 0; k < 3; k++) {
          const mids = (i === 1 ? 1 : 0) + (j === 1 ? 1 : 0) + (k === 1 ? 1 : 0);
          if (mids > 1) continue;
          const s = new THREE.Vector3(xs[i], ys[j], zs[k]);
          samples.push(s);
          reach = Math.max(reach, s.length());
        }
      }
    }

    const b = {
      id: e.name,
      node,
      pivot,
      q0,
      q: q0.clone(),
      parentInv,
      min: bb.min,
      max: bb.max,
      reach,
      inertia,
      mass,
      damping: Math.max(0, num(d.damping, M.damping)),
      maxSpin: Math.max(0.5, num(d.maxSpin, M.maxSpin)),
      spring: Math.max(0, num(d.restoreSpring, M.restoreSpring)),
      axis: parseAxis(d.axis ?? M.axis, q0, bb),
      w: new THREE.Vector3(), // dünya uzayında açısal hız (rad/sn)
      asleep: true,
      quiet: 0,
      dirty: false,
      samples,
      collider: this.world.collision.addDynamic(e.name, node), // katı: kendi mesh'i çarpışma olur, dönüşü her karede izler
      tq: q0.clone(), // istemci: yayından gelen hedef yönelim
      tw: new THREE.Vector3(), // istemci: yayından gelen açısal hız
    };
    this.list.push(b);
    this.byId.set(b.id, b);
  }

  _apply(b) {
    b.node.quaternion.copy(b.parentInv).multiply(b.q);
    b.node.updateMatrixWorld(true);
  }

  /** I⁻¹ · v (dünya çerçevesinde): v'yi gövde çerçevesine al, eylemsizlik momentlerine böl, geri çevir. */
  _invI(b, v, out) {
    if (b.axis) {
      // Eksen kilitliyse yalnızca o eksen etrafındaki atalet sayılır: Δw = a · (a·v) / I_a (kilitli eksene dik darbe boşa gitmez, dönüşe çevrilir)
      _qv.copy(b.q).invert();
      out.copy(b.axis).applyQuaternion(_qv);
      const ia = Math.max(1e-4, b.inertia.x * out.x * out.x + b.inertia.y * out.y * out.y + b.inertia.z * out.z * out.z);
      return out.copy(b.axis).multiplyScalar(b.axis.dot(v) / ia);
    }
    _qv.copy(b.q).invert();
    out.copy(v).applyQuaternion(_qv);
    out.x /= b.inertia.x;
    out.y /= b.inertia.y;
    out.z /= b.inertia.z;
    return out.applyQuaternion(b.q);
  }

  _wake(b) {
    b.asleep = false;
    b.quiet = 0;
  }

  /** Eksen kilidi (varsa) ve en yüksek dönme hızı. */
  _limit(b) {
    if (b.axis) b.w.copy(b.axis).multiplyScalar(b.w.dot(b.axis));
    const sp = b.w.length();
    if (sp > b.maxSpin) b.w.multiplyScalar(b.maxSpin / sp);
  }

  // ------------------------------------------------------------------ HOST: fizik
  /** Her karede host çağırır. bodies: [{ id, pos, wx, wz, crouch }] canlı oyuncular (pos: ayak konumu, wx/wz: istenen yatay hız). */
  hostUpdate(dt, bodies) {
    if (!this.list.length) return;
    for (const b of this.list) {
      let pushed = false;
      for (const t of bodies) if (this._pushBy(b, t, dt)) pushed = true;
      this._step(b, dt, pushed);
    }
    this._broadcast(dt);
  }

  /** Oyuncu kapsülü plakaya değiyor ve ona doğru itiyorsa plakaya tork uygular. Uygulandıysa true. */
  _pushBy(b, t, dt) {
    const wx = clamp(Number(t.wx) || 0, -8, 8); // (ağdan gelir: sayı değilse 0)
    const wz = clamp(Number(t.wz) || 0, -8, 8);
    if (wx * wx + wz * wz < 0.09) return false; // itmiyor (istenen hız < 0.3 m/sn)
    const height = t.crouch ? P.crouchHeight : P.height;
    const dx = t.pos.x - b.pivot.x;
    const dz = t.pos.z - b.pivot.z;
    const lim = b.reach + P.radius + M.touchMargin + 0.2;
    if (dx * dx + dz * dz > lim * lim) return false;
    if (t.pos.y > b.pivot.y + b.reach + 0.2 || t.pos.y + height < b.pivot.y - b.reach - 0.2) return false;

    // kapsül ekseni boyunca 4 nokta: plakaya en yakın temas
    let bestD = Infinity;
    const span = Math.max(0, height - 2 * P.radius);
    for (let i = 0; i < 4; i++) {
      _sp.set(t.pos.x, t.pos.y + P.radius + (i / 3) * span, t.pos.z);
      const dd = closestOnBody(b, _sp, _cp, _cn);
      if (dd < bestD) {
        bestD = dd;
        _bp.copy(_cp);
        _bn.copy(_cn);
      }
    }
    if (bestD > P.radius + M.touchMargin) return false;

    _w.set(wx, 0, wz);
    const vInto = -_w.dot(_bn); // plakaya doğru yaklaşma hızı (_bn: plakadan oyuncuya)
    if (vInto < 0.05) return false;

    _r.subVectors(_bp, b.pivot);
    // simetri kırıcı: tam ortasından itilince de tork sıfır kalmasın diye küçük yanal kol
    _lat.crossVectors(UP, _bn);
    if (_lat.lengthSq() > 0.09) {
      _lat.normalize();
      _r.addScaledVector(_lat, M.centerBias * (_r.dot(_lat) < 0 ? -1 : 1));
    }

    // 1) dik itiş: plakanın o noktadaki yüzey hızı oyuncunun hızına yetişene kadar (aşmadan) tork uygula
    _sv.crossVectors(b.w, _r);
    const veff = vInto + _sv.dot(_bn); // plaka zaten uzaklaşıyorsa itiş azalır
    if (veff > 0.02) {
      _rn.crossVectors(_r, _bn);
      this._invI(b, _rn, _iv);
      const kinv = _rn.dot(_iv); // bu noktada _bn yönündeki etkin ters kütle
      let j = M.playerPush * veff * dt;
      if (kinv > 1e-6) j = Math.min(j, (veff / kinv) * M.playerGrip);
      b.w.addScaledVector(_iv, -j); // darbe plakaya, oyuncunun itiş yönünde (−_bn)
    }

    // 2) teğet sürtünme: yüzey boyunca kayarken plakayı sürükler (duvara yapışık tabloyu tekerlek gibi çevirir)
    if (M.friction > 0) {
      _tv.copy(_w).addScaledVector(_bn, vInto); // istenen hızın yüzeye teğet bileşeni
      _sv.crossVectors(b.w, _r);
      _tv.sub(_sv).addScaledVector(_bn, _sv.dot(_bn)); // yüzeyin kendi teğet hızını çıkar
      const vt = _tv.length();
      if (vt > 0.05) {
        _tv.divideScalar(vt);
        _rn.crossVectors(_r, _tv);
        this._invI(b, _rn, _iv);
        const kt = _rn.dot(_iv);
        let jt = M.friction * M.playerPush * vInto * dt;
        if (kt > 1e-6) jt = Math.min(jt, (vt / kt) * M.playerGrip);
        b.w.addScaledVector(_iv, jt);
      }
    }
    this._limit(b);
    this._wake(b);
    return true;
  }

  /** Eşya (küre) bir plakaya çarptıysa plakaya darbe verir. grab.js → hostSim, çarpma çözülmeden ÖNCE (it.vel çarpma öncesi hızdır) çağırır. */
  hostItemHit(it) {
    if (!this.list.length) return;
    for (const b of this.list) {
      const lim = b.reach + it.radius + 0.3;
      if (it.pos.distanceToSquared(b.pivot) > lim * lim) continue;
      const dist = closestOnBody(b, it.pos, _cp, _cn);
      if (dist > it.radius + 0.05) continue;
      _r.subVectors(_cp, b.pivot);
      _sv.crossVectors(b.w, _r); // plakanın o noktadaki yüzey hızı
      _tv.subVectors(it.vel, _sv);
      const vrn = _tv.dot(_cn); // eşyanın plakaya göre normal hızı (_cn: plakadan eşyaya): negatif = yaklaşıyor
      if (vrn > -M.itemMinSpeed) continue;
      // darbe: _cn yönünde (vrn < 0 → plakanın içine doğru), büyüklük = eşya ağırlığı × çarpma hızı × itemPush
      _rn.crossVectors(_r, _cn).multiplyScalar(vrn * it.weight * M.itemPush);
      this._invI(b, _rn, _iv);
      b.w.add(_iv);
      this._limit(b);
      this._wake(b);
    }
  }

  /** Sönüm, yay, dönüş (engel testiyle), uyku. forced: bu karede itildi / vuruldu. */
  _step(b, dt, forced) {
    if (b.asleep && !forced) return;
    if (b.spring > 0) this._spring(b, dt);
    b.w.multiplyScalar(Math.exp(-b.damping * dt));
    this._limit(b);
    const speed = b.w.length();
    if (speed > 1e-4) this._rotate(b, dt, speed);
    if (!forced && b.w.length() < M.sleepSpin && (b.spring <= 0 || b.q.angleTo(b.q0) < 0.01)) {
      b.quiet += dt;
      if (b.quiet > 0.4) {
        b.w.set(0, 0, 0);
        b.asleep = true;
        b.dirty = true;
      }
    } else b.quiet = 0;
  }

  /** İlk duruşa doğru dönme ivmesi (restoreSpring > 0). */
  _spring(b, dt) {
    _qe.copy(b.q0).multiply(_qr.copy(b.q).invert()); // q0 · q⁻¹: dünya çerçevesinde "geri dönüş" dönüşü
    if (_qe.w < 0) {
      _qe.x = -_qe.x;
      _qe.y = -_qe.y;
      _qe.z = -_qe.z;
      _qe.w = -_qe.w;
    }
    const s = Math.sqrt(Math.max(0, 1 - _qe.w * _qe.w));
    if (s < 1e-4) return;
    const ang = 2 * Math.atan2(s, _qe.w);
    _ax.set(_qe.x / s, _qe.y / s, _qe.z / s);
    b.w.addScaledVector(_ax, b.spring * ang * dt);
  }

  /** Açısal hızla döndürür; küçük adımlarla, her adımda duvar / zemin / kapı testi. */
  _rotate(b, dt, speed) {
    const steps = Math.min(6, Math.max(1, Math.ceil((speed * dt) / 0.12)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const sp = b.w.length();
      if (sp < 1e-5) break;
      _ax.copy(b.w).divideScalar(sp);
      _dq.setFromAxisAngle(_ax, sp * h);
      _qn.copy(b.q).premultiply(_dq).normalize();
      if (M.blockByWorld && this._blocked(b, _qn)) {
        b.w.multiplyScalar(sp > 0.6 ? -M.restitution : 0); // çarptı: geri seker (yavaşsa durur)
        break;
      }
      b.q.copy(_qn);
    }
    this._apply(b);
    b.dirty = true;
  }

  /**
   * qNew yönelimine dönmek plakanın bir noktasını statik dünyaya / kapıya / başka plakaya SOKAR mı?
   * Örnek noktaların eski ve yeni konumuna bakar; yalnızca yüzeye DOĞRU (içeri) hareket eden ve belirgin batan nokta engeldir:
   * zaten değen / yüzeyde kayan noktalar (duvara yapışık tabloyu kendi düzleminde çevirmek) engel sayılmaz.
   */
  _blocked(b, qNew) {
    const col = this.world.collision;
    const own = b.collider;
    const was = own.enabled;
    own.enabled = false; // kendi mesh'ine çarpmasın
    let blocked = false;
    for (const s of b.samples) {
      _p0.copy(s).applyQuaternion(b.q).add(b.pivot);
      _p1.copy(s).applyQuaternion(qNew).add(b.pivot);
      _c.copy(_p1);
      if (!col.resolveSphere(_c, M.sampleRadius, _nrm)) continue;
      if (_c.distanceTo(_p1) < 0.004) continue; // yüzeye çok az batıyor
      _d.subVectors(_p1, _p0);
      if (_d.dot(_nrm) < -0.1 * _d.length()) {
        blocked = true;
        break;
      }
    }
    own.enabled = was;
    return blocked;
  }

  // ------------------------------------------------------------------ ağ
  /** HOST: değişen (ya da 2,5 sn'de bir hepsini) herkese yayınlar. */
  _broadcast(dt) {
    this.netT += dt;
    this.fullT += dt;
    if (this.netT < 1 / M.netHz) return;
    this.netT = 0;
    const all = this.fullT > 2.5;
    if (all) this.fullT = 0;
    const l = [];
    for (const b of this.list) {
      if (!all && !b.dirty) continue;
      l.push([b.id, round3(b.q.x), round3(b.q.y), round3(b.q.z), round3(b.q.w), round3(b.w.x), round3(b.w.y), round3(b.w.z), b.asleep ? 1 : 0]);
      b.dirty = false;
    }
    if (l.length) ctx.host.broadcast({ t: 'mp', l });
  }

  /** İstemci: host'tan gelen yayın [id, qx, qy, qz, qw, wx, wy, wz, uyku]. */
  applySnapshot(list) {
    if (ctx.isHost) return; // host kendi simülasyonuna güvenir
    for (const [id, qx, qy, qz, qw, wx, wy, wz, flags] of list || []) {
      const b = this.byId.get(id);
      if (!b) continue;
      b.tq.set(qx, qy, qz, qw);
      b.asleep = !!(flags & 1);
      if (b.asleep) b.tw.set(0, 0, 0);
      else b.tw.set(wx, wy, wz);
      if (b.q.angleTo(b.tq) > 1.2) b.q.copy(b.tq); // çok uzaksa (geç katılım, sıfırlama) yumuşatmadan atla
    }
  }

  /** İstemci: her karede hedefi açısal hızla ilerletir (yayınlar arası), gövdeyi hedefe yumuşatır. */
  update(dt) {
    if (ctx.isHost) return;
    for (const b of this.list) {
      const sp = b.tw.length();
      if (sp < 1e-3 && b.q.angleTo(b.tq) < 1e-4) continue;
      if (sp >= 1e-3) {
        _ax.copy(b.tw).divideScalar(sp);
        b.tq.premultiply(_dq.setFromAxisAngle(_ax, sp * dt)).normalize();
        b.tw.multiplyScalar(Math.exp(-b.damping * dt));
      }
      b.q.slerp(b.tq, 1 - Math.exp(-M.netSmooth * dt));
      this._apply(b);
    }
  }

  // ---- world.js sistem arayüzü ----
  applyEvent() {}
  hostAct() {
    return null;
  }
  getState() {
    const s = {};
    for (const b of this.list) s[b.id] = [round3(b.q.x), round3(b.q.y), round3(b.q.z), round3(b.q.w)];
    return s;
  }
  setState(s) {
    for (const [id, q] of Object.entries(s || {})) {
      const b = this.byId.get(id);
      if (!b || !Array.isArray(q) || q.length < 4) continue;
      b.q.set(q[0], q[1], q[2], q[3]).normalize();
      b.tq.copy(b.q);
      b.w.set(0, 0, 0);
      b.tw.set(0, 0, 0);
      b.asleep = true;
      this._apply(b);
    }
  }
  reset() {
    for (const b of this.list) {
      b.q.copy(b.q0);
      b.tq.copy(b.q0);
      b.w.set(0, 0, 0);
      b.tw.set(0, 0, 0);
      b.asleep = true;
      b.quiet = 0;
      b.dirty = true; // host: sıfırlama herkese yayınlansın
      this._apply(b);
    }
  }
}
