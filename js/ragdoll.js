// RAGDOLL: ölen oyuncunun fizikli cesedi.
//  • RagdollSim  : Verlet parçacık simülasyonu (14 nokta + mesafe kısıtları). YALNIZCA HOST'ta çalışır.
//  • RagdollView : noktalardan çizilen kutu gövde (kafa, gövde, kollar, bacaklar). HERKESTE çalışır.
// Cesetler dünyaya (duvar, zemin, kapı) çarpar, oyuncular onları iter, patlama savurur, bir uzvundan tutulup sürüklenebilir.
// Ağda noktalar santimetre tamsayı olarak taşınır (42 sayı / ceset).
import * as THREE from 'three';
import { GAME_CONFIG } from './config.js';
import { FACES } from './faces.js';

const CC = GAME_CONFIG.corpse;
const PL = GAME_CONFIG.player;
const HNOM = 1 / 60; // itiş hızlarının tanımlandığı nominal adım süresi

export const R = {
  HEAD: 0, LSH: 1, RSH: 2, LHIP: 3, RHIP: 4, LEL: 5, REL: 6, LHAND: 7, RHAND: 8, LKNEE: 9, RKNEE: 10, LFOOT: 11, RFOOT: 12, BACK: 13,
  COUNT: 14,
  GRABBABLE: 13, // 0..12 tutulabilir (BACK = gövdenin arkasındaki yardımcı nokta, tutulamaz)
};
const { HEAD, LSH, RSH, LHIP, RHIP, LEL, REL, LHAND, RHAND, LKNEE, RKNEE, LFOOT, RFOOT, BACK } = R;

// Ayakta duruş şablonu. x = karakterin SOLU, y = yukarı, z = ileri. Ayaklar y≈0'da.
export const TEMPLATE = [
  [0, 1.62, 0], // HEAD
  [0.22, 1.42, 0], // LSH
  [-0.22, 1.42, 0], // RSH
  [0.12, 0.92, 0], // LHIP
  [-0.12, 0.92, 0], // RHIP
  [0.3, 1.14, 0], // LEL
  [-0.3, 1.14, 0], // REL
  [0.31, 0.88, 0.03], // LHAND
  [-0.31, 0.88, 0.03], // RHAND
  [0.12, 0.5, 0.03], // LKNEE
  [-0.12, 0.5, 0.03], // RKNEE
  [0.12, 0.09, 0], // LFOOT
  [-0.12, 0.09, 0], // RFOOT
  [0, 1.17, -0.13], // BACK
];
export const RADIUS = [0.14, 0.09, 0.09, 0.1, 0.1, 0.06, 0.06, 0.05, 0.05, 0.08, 0.08, 0.07, 0.07, 0.07];
const MASS = [1.2, 2, 2, 2.5, 2.5, 0.8, 0.8, 0.6, 0.6, 1.2, 1.2, 1, 1, 1];
const INV = MASS.map((m) => 1 / m);
// Ölüm anındaki itişin hangi noktalara ne kadar uygulanacağı (üst gövde tam, ayaklar az → ceset devrilir)
const IMP_WEIGHT = [1, 1, 1, 0.6, 0.6, 1, 1, 1, 1, 0.35, 0.35, 0.1, 0.1, 1];

// [a, b] = eşit uzunluk · [a, b, 'min', f] = mesafe en az f × (ayakta uzunluk): eklem açısını sınırlar / içinden geçmeyi önler
const RAW_LINKS = [
  // gövde: sert piramit (4 köşe + sırt noktası)
  [LSH, RSH], [LHIP, RHIP], [LSH, LHIP], [RSH, RHIP], [LSH, RHIP], [RSH, LHIP],
  [BACK, LSH], [BACK, RSH], [BACK, LHIP], [BACK, RHIP],
  // baş
  [HEAD, LSH], [HEAD, RSH], [HEAD, BACK],
  [HEAD, LHIP, 'min', 0.72], [HEAD, RHIP, 'min', 0.72],
  // kollar
  [LSH, LEL], [LEL, LHAND], [RSH, REL], [REL, RHAND],
  [LSH, LHAND, 'min', 0.3], [RSH, RHAND, 'min', 0.3],
  // bacaklar
  [LHIP, LKNEE], [LKNEE, LFOOT], [RHIP, RKNEE], [RKNEE, RFOOT],
  [LHIP, LFOOT, 'min', 0.28], [RHIP, RFOOT, 'min', 0.28],
  // iki bacak / iki ayak birbirinin içine girmesin
  [LKNEE, RKNEE, 'min', 0.55], [LFOOT, RFOOT, 'min', 0.5],
];
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const LINKS = RAW_LINKS.map(([a, b, kind = 'eq', f = 1]) => ({ a, b, kind, rest: dist3(TEMPLATE[a], TEMPLATE[b]) * (kind === 'min' ? f : 1) }));

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _sm = new THREE.Vector3();
const _hm = new THREE.Vector3();
const _m = new THREE.Matrix4();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

// ---- kendi içinden geçmeme (self-collision): uzuvlar kapsül, gövde "çekirdek kutu" ----
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
// [a, b, yarıçap]: kol / bacak parçaları
const SEGS = [
  [LSH, LEL, 0.055], [LEL, LHAND, 0.05], [RSH, REL, 0.055], [REL, RHAND, 0.05],
  [LHIP, LKNEE, 0.085], [LKNEE, LFOOT, 0.07], [RHIP, RKNEE, 0.085], [RKNEE, RFOOT, 0.07],
];
// eklem paylaşmayan kapsül çiftleri (komşu parçalar eklem açısı kısıtıyla zaten sınırlı)
const SEG_PAIRS = [];
for (let i = 0; i < SEGS.length; i++) {
  for (let j = i + 1; j < SEGS.length; j++) {
    const A = SEGS[i];
    const B = SEGS[j];
    if (A[0] !== B[0] && A[0] !== B[1] && A[1] !== B[0] && A[1] !== B[1]) SEG_PAIRS.push([i, j]);
  }
}
// gövdeye karşı denenen uzuv noktaları: [noktaA, noktaB, aradaki oran, yarıçap] (uçlar + orta noktalar; omuz / kalça uçları hariç)
const SAMPLES = [];
for (const [a, b, r] of SEGS) SAMPLES.push([b, b, 0, r], [a, b, 0.5, r]);
const TORSO_PTS = [LSH, RSH, LHIP, RHIP];
const CORE = [0.17, 0.3, 0.1]; // gövde çekirdek yarı boyutları (görsel kutudan küçük: kollar yanında dururken sürtünmesin)
const SELF_K = 0.6; // düzeltme sertliği (1 = tam)
const SELF_MAX = 0.06; // bir adımda bir noktayı en fazla bu kadar (m) iter
const _tc = new THREE.Vector3();
const _tx = new THREE.Vector3();
const _ty = new THREE.Vector3();
const _tz = new THREE.Vector3();
const _d1 = new THREE.Vector3();
const _d2 = new THREE.Vector3();
const _r = new THREE.Vector3();
const _c1 = new THREE.Vector3();
const _c2 = new THREE.Vector3();

/** Ayakta duruş: feet = ayak konumu {x,y,z}, yaw = bakış. Dönüş: Float32Array(42) dünya noktaları. */
export function standingPose(feet, yaw) {
  const out = new Float32Array(R.COUNT * 3);
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  for (let i = 0; i < R.COUNT; i++) {
    const [tx, ty, tz] = TEMPLATE[i];
    // sol = (cos, 0, -sin) · ileri = (sin, 0, cos)
    out[i * 3] = feet.x + c * tx + s * tz;
    out[i * 3 + 1] = feet.y + ty;
    out[i * 3 + 2] = feet.z - s * tx + c * tz;
  }
  return out;
}

export const toCm = (f32) => Array.from(f32, (v) => Math.round(v * 100));
export function fromCm(arr, out = new Float32Array(R.COUNT * 3)) {
  for (let i = 0; i < out.length; i++) out[i] = (arr?.[i] || 0) / 100;
  return out;
}

// =====================================================================================================================
//  SİMÜLASYON (yalnızca host)
// =====================================================================================================================
export class RagdollSim {
  /** col: CollisionWorld · feet: {x,y,z} · yaw · imp: [x,y,z] ölüm anı itişi (m/sn) veya null */
  constructor(col, feet, yaw, imp = null) {
    this.col = col;
    this.x = standingPose(feet, yaw);
    this.px = new Float32Array(this.x);
    this.target = new THREE.Vector3();
    this.held = -1; // tutulan nokta (kinematik): hedefe sınırlı hızla gider
    this.asleep = false;
    this.sleepT = 0;
    this.hPrev = HNOM; // itiş hızları 1/60 sn'lik adım üzerinden verilir (px kaydırma); ilk adımda buna göre ölçeklenir
    this.awakeT = 0; // uyanık geçen süre: çok uzarsa (titreşim vb.) zorla uyutulur
    this.dirty = false; // uyurken itildi / uyudu → bir kez yayınla
    this.cx = feet.x;
    this.cy = feet.y + 0.9;
    this.cz = feet.z;
    this.safe = { x: feet.x, y: feet.y, z: feet.z };
    this._topple(imp);
  }

  /** Ağdan / durumdan gelen noktaları yükler (santimetre dizisi). */
  loadCm(arr) {
    fromCm(arr, this.x);
    this.px.set(this.x);
    this._center();
  }

  snapshotCm() {
    return toCm(this.x);
  }

  point(i, out) {
    return out.set(this.x[i * 3], this.x[i * 3 + 1], this.x[i * 3 + 2]);
  }

  /** Ölüm anı: verilen yönde itiş (yoksa rastgele hafif devrilme). Üst gövde hızlı, ayaklar yavaş → ceset devrilir. */
  _topple(imp) {
    let [ix, iy, iz] = imp || [0, 0, 0];
    if (Math.hypot(ix, iy, iz) < 0.5) {
      const a = Math.random() * Math.PI * 2;
      ix = Math.cos(a) * 0.9;
      iy = 0.2;
      iz = Math.sin(a) * 0.9;
    }
    const f = HNOM;
    for (let i = 0; i < R.COUNT; i++) {
      const w = IMP_WEIGHT[i] * f;
      this.px[i * 3] -= ix * w;
      this.px[i * 3 + 1] -= iy * w;
      this.px[i * 3 + 2] -= iz * w;
    }
    // dizler hafif bükülsün (dik dururken tam dengede kalmasın)
    this.x[LKNEE * 3 + 2] += 0.015;
    this.x[RKNEE * 3 + 2] += 0.02;
    this._center();
  }

  wake() {
    this.asleep = false;
    this.sleepT = 0;
    this.awakeT = 0;
    this.hPrev = HNOM;
  }

  sleep() {
    this.asleep = true;
    this.px.set(this.x);
    this.dirty = true;
  }

  /** S2G: ceset hafifçe zıplar. speed = yukarı hız (m/sn); her nokta biraz farklı hız alır + hafif yan savrulma → "rastgele" zıplama. */
  hop(speed) {
    const s = speed * HNOM;
    for (let i = 0; i < R.COUNT; i++) {
      this.px[i * 3] -= (Math.random() - 0.5) * s * 0.7;
      this.px[i * 3 + 1] -= s * (0.55 + 0.45 * Math.random());
      this.px[i * 3 + 2] -= (Math.random() - 0.5) * s * 0.7;
    }
    this.wake();
    this.dirty = true;
  }

  /** Patlama: merkezden dışarı doğru, mesafeye göre azalan hız verir. Etkilendiyse true. */
  blast(center, radius, strength) {
    let any = false;
    const f = HNOM;
    for (let i = 0; i < R.COUNT; i++) {
      _v.set(this.x[i * 3] - center.x, this.x[i * 3 + 1] - center.y, this.x[i * 3 + 2] - center.z);
      const d = _v.length();
      if (d > radius) continue;
      const fall = 1 - d / radius;
      if (d < 1e-4) _v.set(0, 1, 0);
      else _v.divideScalar(d);
      _v.y += 0.45;
      const s = strength * (0.25 + 0.75 * fall) * f;
      this.px[i * 3] -= _v.x * s;
      this.px[i * 3 + 1] -= _v.y * s;
      this.px[i * 3 + 2] -= _v.z * s;
      any = true;
    }
    if (any) {
      this.wake();
      this.dirty = true;
    }
    return any;
  }

  /** Canlı oyuncular cesedin noktalarını iter (oyuncu kapsülü). bodies: [{ pos }] ayak konumları. */
  pushBodies(bodies) {
    let woke = false;
    const { x, px } = this;
    for (const b of bodies) {
      const bx = b.pos.x;
      const by = b.pos.y;
      const bz = b.pos.z;
      if (Math.abs(bx - this.cx) > 1.7 || Math.abs(bz - this.cz) > 1.7 || by > this.cy + 1.6 || by + PL.height < this.cy - 1.6) continue;
      for (let i = 0; i < R.COUNT; i++) {
        if (i === this.held) continue;
        const o = i * 3;
        const y = x[o + 1];
        if (y < by - RADIUS[i] || y > by + PL.height + RADIUS[i]) continue;
        const dx = x[o] - bx;
        const dz = x[o + 2] - bz;
        const d = Math.hypot(dx, dz);
        const min = PL.radius + RADIUS[i];
        if (d >= min) continue;
        const nx = d > 1e-4 ? dx / d : 1;
        const nz = d > 1e-4 ? dz / d : 0;
        const c = min - d;
        // Konum düzeltmesi: hızın büyük kısmı korunmaz (px de kayar) → ceset fırlamaz, oyuncuyla birlikte kayar; kalan küçük hız kısa süre süzülmesini sağlar.
        x[o] += nx * c;
        x[o + 2] += nz * c;
        px[o] += nx * c * 0.75;
        px[o + 2] += nz * c * 0.75;
        woke = true;
      }
    }
    if (woke) {
      if (this.asleep) {
        this.wake();
        this.dirty = true;
      }
      this.sleepT = 0;
    }
    return woke;
  }

  /** Bir kare ilerlet. Uyuyorsa (ve tutulmuyorsa) hiçbir şey yapmaz. */
  step(dt) {
    if (this.asleep && this.held < 0) return;
    const sub = CC.substeps;
    const h = Math.min(dt, 1 / 30) / sub;
    for (let s = 0; s < sub; s++) {
      this._integrate(h);
      this._pinHeld(h);
      for (let k = 0; k < CC.iterations; k++) this._constrain();
      this._selfCollide(); // uzuvlar birbirinin / gövdenin içinden geçmesin
      this._collide();
    }
    this._center();
    this._rest(h * sub);
    this._sanity();
  }

  _integrate(h) {
    const { x, px } = this;
    const ratio = this.hPrev > 0 ? h / this.hPrev : 1; // kare süresi değişse de hız tutarlı kalsın
    this.hPrev = h;
    const gh = CC.gravity * h * h;
    const damp = CC.damping * ratio;
    for (let i = 0; i < R.COUNT; i++) {
      if (i === this.held) continue;
      const o = i * 3;
      for (let k = 0; k < 3; k++) {
        const cur = x[o + k];
        x[o + k] = cur + (cur - px[o + k]) * damp;
        px[o + k] = cur;
      }
      x[o + 1] -= gh;
    }
  }

  /** Tutulan nokta: hedefe en fazla pullSpeed hızıyla gider (ağırlık hissi), ataleti yoktur. */
  _pinHeld(h) {
    const i = this.held;
    if (i < 0) return;
    const { x, px } = this;
    const o = i * 3;
    _v.set(this.target.x - x[o], this.target.y - x[o + 1], this.target.z - x[o + 2]);
    const d = _v.length();
    const max = CC.pullSpeed * h;
    if (d > max) _v.multiplyScalar(max / d);
    x[o] += _v.x;
    x[o + 1] += _v.y;
    x[o + 2] += _v.z;
    px[o] = x[o];
    px[o + 1] = x[o + 1];
    px[o + 2] = x[o + 2];
  }

  _constrain() {
    const x = this.x;
    for (const L of LINKS) {
      const a = L.a * 3;
      const b = L.b * 3;
      const dx = x[b] - x[a];
      const dy = x[b + 1] - x[a + 1];
      const dz = x[b + 2] - x[a + 2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 1e-12) continue;
      const d = Math.sqrt(d2);
      if (L.kind === 'min' && d >= L.rest) continue;
      const wa = this.held === L.a ? 0 : INV[L.a];
      const wb = this.held === L.b ? 0 : INV[L.b];
      const ws = wa + wb;
      if (ws === 0) continue;
      const k = (d - L.rest) / (d * ws);
      x[a] += dx * k * wa;
      x[a + 1] += dy * k * wa;
      x[a + 2] += dz * k * wa;
      x[b] -= dx * k * wb;
      x[b + 1] -= dy * k * wb;
      x[b + 2] -= dz * k * wb;
    }
  }

  /** Dünya çarpışması: noktalar küre sayılır. Normal hız bileşeni söner (zıplamaz), zemin sürtünmesi uygulanır. */
  _collide() {
    const { x, px, col } = this;
    for (let i = 0; i < R.COUNT; i++) {
      const o = i * 3;
      const y0 = x[o + 1];
      _v.set(x[o], y0, x[o + 2]);
      if (!col.resolveSphere(_v, RADIUS[i], _n)) continue;
      if (_n.y < -0.5 && i !== this.held && y0 < px[o + 1] - 1e-5) {
        // Aşağı inerken yüzeyin ALT tarafından itildi: kısıt çözücü noktayı ince zeminin içinden geçirmiş (zeminin altında kalıp
        // titreşirdi). Hareketi geri al → nokta zeminin üstünde kalır (ceset yere gömülmez, düzgün uyur).
        x[o] = px[o];
        x[o + 1] = px[o + 1];
        x[o + 2] = px[o + 2];
        continue;
      }
      x[o] = _v.x;
      x[o + 1] = _v.y;
      x[o + 2] = _v.z;
      if (i === this.held) {
        px[o] = x[o];
        px[o + 1] = x[o + 1];
        px[o + 2] = x[o + 2];
        continue;
      }
      const vn = (x[o] - px[o]) * _n.x + (x[o + 1] - px[o + 1]) * _n.y + (x[o + 2] - px[o + 2]) * _n.z;
      const adj = vn > 0 ? vn * (1 - CC.restitution) : vn;
      px[o] += _n.x * adj;
      px[o + 1] += _n.y * adj;
      px[o + 2] += _n.z * adj;
      if (_n.y > 0.5) {
        px[o] += (x[o] - px[o]) * CC.groundFriction;
        px[o + 2] += (x[o + 2] - px[o + 2]) * CC.groundFriction;
      }
    }
  }

  // ------------------------------------------------------------------ kendi içinden geçmeme
  /** Gövde çerçevesi (merkez + x/y/z eksenleri) — RagdollView.update ile aynı kurallar. false: dejenere. */
  _torsoFrame() {
    const x = this.x;
    const g = (i) => [x[i * 3], x[i * 3 + 1], x[i * 3 + 2]];
    const [a, b, c, d] = [g(LSH), g(RSH), g(LHIP), g(RHIP)];
    _tc.set((a[0] + b[0] + c[0] + d[0]) / 4, (a[1] + b[1] + c[1] + d[1]) / 4, (a[2] + b[2] + c[2] + d[2]) / 4);
    _ty.set((a[0] + b[0] - c[0] - d[0]) / 2, (a[1] + b[1] - c[1] - d[1]) / 2, (a[2] + b[2] - c[2] - d[2]) / 2);
    _tx.set(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    if (_ty.lengthSq() < 1e-8 || _tx.lengthSq() < 1e-8) return false;
    _ty.normalize();
    _tz.crossVectors(_tx, _ty);
    if (_tz.lengthSq() < 1e-8) return false;
    _tz.normalize();
    _tx.crossVectors(_ty, _tz).normalize();
    return true;
  }

  /** Bir noktayı (x) ve önceki konumunu (px) kaydırır: konum tam, hızın büyük kısmı korunmaz (patlayıcı sekme olmasın). */
  _nudge(i, dx, dy, dz) {
    if (i === this.held) return;
    const o = i * 3;
    const { x, px } = this;
    x[o] += dx;
    x[o + 1] += dy;
    x[o + 2] += dz;
    px[o] += dx * 0.8;
    px[o + 1] += dy * 0.8;
    px[o + 2] += dz * 0.8;
  }

  /** İki kapsülü (a0-a1, yarıçap ra) ve (b0-b1, rb) birbirinden ayırır. a0 === a1 ise küre. */
  _pushSegs(a0, a1, ra, b0, b1, rb) {
    const x = this.x;
    const A = a0 * 3;
    const B = b0 * 3;
    _d1.set(x[a1 * 3] - x[A], x[a1 * 3 + 1] - x[A + 1], x[a1 * 3 + 2] - x[A + 2]);
    _d2.set(x[b1 * 3] - x[B], x[b1 * 3 + 1] - x[B + 1], x[b1 * 3 + 2] - x[B + 2]);
    _r.set(x[A] - x[B], x[A + 1] - x[B + 1], x[A + 2] - x[B + 2]);
    const a = _d1.dot(_d1);
    const e = _d2.dot(_d2);
    const f = _d2.dot(_r);
    let s = 0;
    let t = 0;
    if (a < 1e-9 && e < 1e-9) {
      s = t = 0;
    } else if (a < 1e-9) {
      t = clamp01(f / e);
    } else {
      const c = _d1.dot(_r);
      if (e < 1e-9) {
        s = clamp01(-c / a);
      } else {
        const b = _d1.dot(_d2);
        const den = a * e - b * b;
        s = den > 1e-9 ? clamp01((b * f - c * e) / den) : 0;
        t = (b * s + f) / e;
        if (t < 0) {
          t = 0;
          s = clamp01(-c / a);
        } else if (t > 1) {
          t = 1;
          s = clamp01((b - c) / a);
        }
      }
    }
    _c1.set(x[A] + _d1.x * s, x[A + 1] + _d1.y * s, x[A + 2] + _d1.z * s);
    _c2.set(x[B] + _d2.x * t, x[B + 1] + _d2.y * t, x[B + 2] + _d2.z * t);
    _n.subVectors(_c1, _c2);
    let dist = _n.length();
    const rs = ra + rb;
    if (!(dist < rs)) return; // (NaN da buradan çıkar)
    if (dist < 1e-6) _n.set(0, 1, 0);
    else _n.multiplyScalar(1 / dist);
    const held = this.held;
    const w = (i) => (i === held ? 0 : INV[i]);
    const w1 = (1 - s) * (1 - s) * w(a0) + s * s * w(a1);
    const w2 = (1 - t) * (1 - t) * w(b0) + t * t * w(b1);
    if (w1 + w2 < 1e-9) return;
    const lam = Math.min(SELF_MAX, (rs - dist) * SELF_K) / (w1 + w2);
    this._nudge(a0, _n.x * lam * w(a0) * (1 - s), _n.y * lam * w(a0) * (1 - s), _n.z * lam * w(a0) * (1 - s));
    if (a1 !== a0) this._nudge(a1, _n.x * lam * w(a1) * s, _n.y * lam * w(a1) * s, _n.z * lam * w(a1) * s);
    this._nudge(b0, -_n.x * lam * w(b0) * (1 - t), -_n.y * lam * w(b0) * (1 - t), -_n.z * lam * w(b0) * (1 - t));
    if (b1 !== b0) this._nudge(b1, -_n.x * lam * w(b1) * t, -_n.y * lam * w(b1) * t, -_n.z * lam * w(b1) * t);
  }

  /** Kollar / bacaklar birbirinin, gövdenin ve kafanın içinden geçmesin (uzuvlar kapsül, gövde çekirdek kutusu sayılır). */
  _selfCollide() {
    // 1) kapsül - kapsül (kol-kol, bacak-bacak, kol-bacak)
    for (const [i, j] of SEG_PAIRS) {
      const A = SEGS[i];
      const B = SEGS[j];
      this._pushSegs(A[0], A[1], A[2], B[0], B[1], B[2]);
    }
    // 2) kafa - uzuvlar
    for (const [a, b, r] of SEGS) this._pushSegs(HEAD, HEAD, 0.12, a, b, r);
    // 3) uzuv noktaları - gövde çekirdek kutusu (içine girdiyse en az gömülme ekseninden dışarı iter)
    if (!this._torsoFrame()) return;
    const x = this.x;
    for (const [i, j, t, r] of SAMPLES) {
      const o = i * 3;
      const q = j * 3;
      _v.set(x[o] + (x[q] - x[o]) * t - _tc.x, x[o + 1] + (x[q + 1] - x[o + 1]) * t - _tc.y, x[o + 2] + (x[q + 2] - x[o + 2]) * t - _tc.z);
      const lx = _v.dot(_tx);
      const ly = _v.dot(_ty);
      const lz = _v.dot(_tz);
      const ax = CORE[0] + r - Math.abs(lx);
      const ay = CORE[1] + r - Math.abs(ly);
      const az = CORE[2] + r - Math.abs(lz);
      if (!(ax > 0 && ay > 0 && az > 0)) continue;
      let ux;
      let uy;
      let uz;
      let pen;
      if (ax <= ay && ax <= az) {
        pen = ax;
        const sg = lx < 0 ? -1 : 1;
        ux = _tx.x * sg;
        uy = _tx.y * sg;
        uz = _tx.z * sg;
      } else if (ay <= az) {
        pen = ay;
        const sg = ly < 0 ? -1 : 1;
        ux = _ty.x * sg;
        uy = _ty.y * sg;
        uz = _ty.z * sg;
      } else {
        pen = az;
        const sg = lz < 0 ? -1 : 1;
        ux = _tz.x * sg;
        uy = _tz.y * sg;
        uz = _tz.z * sg;
      }
      const d = Math.min(SELF_MAX, pen * SELF_K);
      this._nudge(i, ux * d * 0.7, uy * d * 0.7, uz * d * 0.7);
      if (j !== i) this._nudge(j, ux * d * 0.7, uy * d * 0.7, uz * d * 0.7);
      for (const k of TORSO_PTS) this._nudge(k, -ux * d * 0.3, -uy * d * 0.3, -uz * d * 0.3);
    }
  }

  _center() {
    const x = this.x;
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (const i of [LSH, RSH, LHIP, RHIP]) {
      sx += x[i * 3];
      sy += x[i * 3 + 1];
      sz += x[i * 3 + 2];
    }
    this.cx = sx / 4;
    this.cy = sy / 4;
    this.cz = sz / 4;
    if (Number.isFinite(this.cx + this.cy + this.cz) && this.cy > -5) this.safe = { x: this.cx, y: this.cy - 1.1, z: this.cz };
  }

  /** Hız küçükse (ve tutulmuyorsa) belirli süre sonra uyutur. */
  _rest(dt) {
    let maxD2 = 0;
    for (let i = 0; i < R.COUNT; i++) {
      const o = i * 3;
      const dx = this.x[o] - this.px[o];
      const dy = this.x[o + 1] - this.px[o + 1];
      const dz = this.x[o + 2] - this.px[o + 2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > maxD2) maxD2 = d2;
    }
    const speed = Math.sqrt(maxD2) / (dt / CC.substeps);
    if (this.held >= 0) {
      this.sleepT = 0;
      this.awakeT = 0;
      return;
    }
    this.awakeT += dt;
    if (speed < CC.sleepSpeed) {
      this.sleepT += dt;
      if (this.sleepT > CC.sleepTime) this.sleep();
    } else this.sleepT = 0;
    if (this.awakeT > CC.maxAwake) this.sleep(); // titreşen / sonsuza dek süzülen ceset de sonunda uyur
  }

  /** NaN / dünyadan düşme koruması: ceset son güvenli yerde yeniden ayakta başlar. */
  _sanity() {
    let bad = this.cy < -60;
    for (let i = 0; i < this.x.length && !bad; i++) if (!Number.isFinite(this.x[i])) bad = true;
    if (!bad) return;
    this.x.set(standingPose(this.safe, 0));
    this.px.set(this.x);
    this.hPrev = HNOM;
    this._center();
  }
}

// =====================================================================================================================
//  GÖRÜNÜM (herkes)
// =====================================================================================================================
const BOX = new THREE.BoxGeometry(1, 1, 1);
export const LEG_GRAY = 0x5a616b; // pantolon / bacaklar HER ZAMAN gri (oyuncu rengi yalnızca üstte: gövde + kollar)
export const SKIN_TONES = [0xeec3a0, 0x8a5638]; // kafa / eller: açık ten rengi ya da kahverengi
const FACE_GEO = new THREE.PlaneGeometry(1, 1); // yüz levhası (boyut: GAME_CONFIG.faces.size ile ölçeklenir)

/** Oyuncu kimliğinden her zaman aynı ten rengi (açık ya da kahverengi): herkes aynı oyuncuyu aynı renkte görür. */
export function skinTone(id) {
  let hsh = 2166136261;
  const s = String(id ?? '');
  for (let i = 0; i < s.length; i++) hsh = Math.imul(hsh ^ s.charCodeAt(i), 16777619);
  hsh ^= hsh >>> 16;
  hsh = Math.imul(hsh, 2246822507);
  hsh ^= hsh >>> 13;
  return SKIN_TONES[(hsh >>> 0) & 1];
}

// [a, b, kalınlık, uzatma, uçKayması, parça]: kutu a→b arasına gerilir; uzatma eklem/el/ayak görünümü içindir
// parça: 'top' = oyuncu rengi (kollar) · 'leg' = gri (bacaklar). Eller ayrı (ten rengi) kutudur.
const LIMBS = [
  [LSH, LEL, 0.13, 0.06, 0, 'top'], [LEL, LHAND, 0.12, 0.03, 1, 'top'],
  [RSH, REL, 0.13, 0.06, 0, 'top'], [REL, RHAND, 0.12, 0.03, 1, 'top'],
  [LHIP, LKNEE, 0.2, 0.06, 0, 'leg'], [LKNEE, LFOOT, 0.17, 0.14, 1, 'leg'],
  [RHIP, RKNEE, 0.2, 0.06, 0, 'leg'], [RKNEE, RFOOT, 0.17, 0.14, 1, 'leg'],
];

export class RagdollView {
  /** shade: kıyafet rengi çarpanı (ceset 0.55 = koyu; yaşayan oyuncu daha parlak) · skin: kafa ve eller için ten rengi (hex). */
  constructor(color, { shade = 0.55, skin = SKIN_TONES[0] } = {}) {
    this.shade = shade;
    this.bodyMat = new THREE.MeshLambertMaterial(); // üst: gövde + kollar (oyuncu rengi / ırgat grisi)
    this.legMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(LEG_GRAY).multiplyScalar(shade) }); // bacaklar: hep gri
    this.skinMat = new THREE.MeshLambertMaterial(); // kafa + eller
    // Yüz levhası: şeffaf zeminli PNG / SVG (assets/faces). Doku önceden çarpılmış alfa ile yüklenir (kenarlarda koyu halka olmasın),
    // bu yüzden karışım "bir, bir eksi kaynak alfa" olarak elle kurulur. Işıklandırma kafa ile aynıdır (karanlıkta yüz de kararır).
    this.faceMat = new THREE.MeshLambertMaterial({
      map: FACES.blank,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.faceMat.color.setScalar(Math.min(1, shade * 1.2));
    this.faceName = null;
    this.disposed = false;
    this.setColor(color);
    this.setSkin(skin);
    this.group = new THREE.Group();
    this.pts = Array.from({ length: R.COUNT }, () => new THREE.Vector3());
    this.center = new THREE.Vector3();
    this.torsoQuat = new THREE.Quaternion();

    const box = (mat, sx, sy, sz, x = 0, y = 0, z = 0, rz = 0) => {
      const m = new THREE.Mesh(BOX, mat);
      m.scale.set(sx, sy, sz);
      m.position.set(x, y, z);
      m.rotation.z = rz;
      return m;
    };

    // gövde: oyuncu renginde üst + gri kemer
    this.torso = new THREE.Group();
    this.torso.add(box(this.bodyMat, 0.5, 0.64, 0.26), box(this.legMat, 0.506, 0.07, 0.266, 0, -0.285, 0));

    // kafa: ten rengi küp + ÖN yüzüne (+Z = ileri; gövde tabanı: x sol, y yukarı, z ileri) oturan yüz levhası. Saç / göz / kaş modeli YOK:
    // yüz tamamen assets/faces içindeki PNG / SVG'den gelir (bkz. faces.js; setFace ile atanır).
    this.head = new THREE.Group();
    this.head.add(box(this.skinMat, 0.3, 0.3, 0.3));
    this.face = new THREE.Mesh(FACE_GEO, this.faceMat);
    this.face.scale.set(GAME_CONFIG.faces.size, GAME_CONFIG.faces.size, 1);
    this.face.position.set(0, 0, GAME_CONFIG.faces.offsetZ);
    this.face.visible = false;
    this.head.add(this.face);

    this.group.add(this.torso, this.head);
    this.limbs = LIMBS.map(([a, b, w, ext, shift, kind]) => {
      const m = new THREE.Mesh(BOX, kind === 'leg' ? this.legMat : this.bodyMat);
      this.group.add(m);
      return { m, a, b, w, ext, shift };
    });
    this.hands = [[LEL, LHAND], [REL, RHAND]].map(([a, b]) => {
      const m = new THREE.Mesh(BOX, this.skinMat);
      m.scale.setScalar(0.1);
      this.group.add(m);
      return { m, a, b };
    });
  }

  /** Üst (gövde + kollar) rengi. Bacaklar hep gri kalır. */
  setColor(color) {
    this.bodyMat.color.set(color).multiplyScalar(this.shade);
  }

  /** Kafa + el ten rengi (hex). */
  setSkin(hex) {
    this.skinMat.color.set(hex).multiplyScalar(Math.min(1, this.shade * 1.2));
  }

  /** Yüz: assets/faces içindeki dosya adı (örn. "yuz1.svg"); null / bulunamayan dosya = yüzsüz kafa. Doku yüklenince kendiliğinden görünür. */
  setFace(name) {
    this.faceName = name || null;
    this.face.visible = false;
    if (!name) return;
    FACES.load(name).then((tex) => {
      if (this.disposed || this.faceName !== name || !tex) return;
      this.faceMat.map = tex;
      this.faceMat.needsUpdate = true;
      this.face.visible = true;
    });
  }

  /** Float32Array(42) dünya noktalarını doğrudan yazar. */
  setPoints(f32) {
    for (let i = 0; i < R.COUNT; i++) this.pts[i].set(f32[i * 3], f32[i * 3 + 1], f32[i * 3 + 2]);
  }

  /** Noktalar hedefe doğru yumuşatılır (ağdan gelen anlık görüntüler arası). */
  smoothTo(f32, k) {
    for (let i = 0; i < R.COUNT; i++) {
      const p = this.pts[i];
      p.x += (f32[i * 3] - p.x) * k;
      p.y += (f32[i * 3 + 1] - p.y) * k;
      p.z += (f32[i * 3 + 2] - p.z) * k;
    }
  }

  /** Noktalardan kutu dönüşümlerini hesaplar. updateWorld=false: dünya matrisleri çizimde (sahne güncellemesinde) hesaplanır (canlı oyuncu modeli). */
  update(updateWorld = true) {
    const p = this.pts;
    _sm.addVectors(p[LSH], p[RSH]).multiplyScalar(0.5);
    _hm.addVectors(p[LHIP], p[RHIP]).multiplyScalar(0.5);
    _y.subVectors(_sm, _hm);
    _x.subVectors(p[LSH], p[RSH]);
    if (_y.lengthSq() > 1e-8 && _x.lengthSq() > 1e-8) {
      _y.normalize();
      _z.crossVectors(_x, _y);
      if (_z.lengthSq() > 1e-8) {
        _z.normalize();
        _x.crossVectors(_y, _z).normalize();
        _m.makeBasis(_x, _y, _z);
        this.torsoQuat.setFromRotationMatrix(_m);
      }
    }
    this.torso.position.addVectors(_sm, _hm).multiplyScalar(0.5);
    this.torso.quaternion.copy(this.torsoQuat);
    this.center.copy(this.torso.position);
    this.head.position.copy(p[HEAD]);
    this.head.quaternion.copy(this.torsoQuat);
    for (const l of this.limbs) {
      const A = p[l.a];
      const B = p[l.b];
      _v.subVectors(B, A);
      const len = _v.length();
      l.m.position.addVectors(A, B).multiplyScalar(0.5);
      if (len > 1e-5) {
        _v.multiplyScalar(1 / len);
        l.m.quaternion.setFromUnitVectors(Y_AXIS, _v);
        l.m.position.addScaledVector(_v, l.ext * 0.5 * l.shift);
      }
      l.m.scale.set(l.w, len + l.ext, l.w);
    }
    for (const hd of this.hands) {
      _v.subVectors(p[hd.b], p[hd.a]);
      const len = _v.length();
      if (len > 1e-5) {
        _v.multiplyScalar(1 / len);
        hd.m.quaternion.setFromUnitVectors(Y_AXIS, _v);
      }
      hd.m.position.copy(p[hd.b]).addScaledVector(_v, 0.04);
    }
    if (updateWorld) this.group.updateMatrixWorld(true);
  }

  dispose() {
    this.disposed = true;
    this.group.removeFromParent();
    this.bodyMat.dispose();
    this.legMat.dispose();
    this.skinMat.dispose();
    this.faceMat.dispose(); // yüz dokuları paylaşımlıdır (faces.js önbelleği): burada silinmez
  }
}
