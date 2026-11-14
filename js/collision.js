// Çarpışma sistemi (three-mesh-bvh).
//  - Statik dünya: "Collision_*" mesh'leri dünya uzayında tek BVH'de birleştirilir.
//  - Dinamik nesneler (kapı, kafes, tablo, hareketli duvar): kendi mesh'lerinin BVH'si, anlık dönüşümleriyle kullanılır.
//    Böylece bu nesneler için ayrıca collision modeli gerekmez; kendi şekilleri engel olur.
//    Blender'da ölçeği UYGULANMAMIŞ (S ile çekilmiş, x/y/z farklı ölçekli) nesneler de doğru çalışır: ölçek BVH'ye işlenir,
//    dönüşüm yalnızca konum + dönüş olur (eskiden kapsül yarıçapı en büyük ölçeğe bölünüyordu: ince duvar / tablo / kapıdan geçilirdi).
//  - Oyuncu: DİKEY KAPSÜL (yarıçap + yükseklik) — adım çıkma + zemine yapışma ile merdiven / basamak desteği.
//    Sağlamlık katmanları (hepsi config.js → GAME_CONFIG.collision ile ayarlanır):
//      1) pierceTriangle: kapsül ekseni bir yüzeyin İÇİNDEN geçmişse (kütüphanenin en yakın nokta hesabı bunu görmez) doğru yana çıkarılır.
//      2) Yürürken: basamak payı tavan varsa kısalır; zemine küçük adımlarla inilir (eksen zeminin içine HİÇ girmez).
//      3) Duvar geçme koruması (crossGuard): kapsül ekseni bir alt adımda statik dünyada bir yüzeyi KESERSE o alt adım geri alınır.
//      4) Alt adımlar küçüktür (≤ yarıçapın yarısı): hızlı hareket ince duvarı atlayamaz.
//  - Küre: eşyalar ve fırlatılan bıçak için.
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { GAME_CONFIG } from './config.js';

const CC = GAME_CONFIG.collision;

const _seg = new THREE.Line3();
const _lseg = new THREE.Line3();
const _box = new THREE.Box3();
const _lbox = new THREE.Box3();
const _lbox2 = new THREE.Box3();
const _tp = new THREE.Vector3();
const _cp = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _ray = new THREE.Ray();
const _wray = new THREE.Ray();
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _push = new THREE.Vector3();
const _start = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _e3 = new THREE.Vector3();
const _fn = new THREE.Vector3();
const _px = new THREE.Vector3();
const _hitInfo = {};
const _dpos = new THREE.Vector3();
const _dquat = new THREE.Quaternion();
const _dscl = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

// ---------------------------------------------------------------------------------------------------------------------
//  Dinamik nesne geometrisi: ölçek BVH'ye işlenir (geometri başına + ölçek başına bir kez)
// ---------------------------------------------------------------------------------------------------------------------
const colliderCache = new WeakMap(); // geometry -> Map(ölçek anahtarı -> { bvh, box })
/** s: dünya ölçeği (Vector3). Dönüş: { bvh, box } — box: ölçekli geometrinin yerel sınır kutusu. Render geometrisine DOKUNMAZ. */
function colliderGeometry(geometry, s) {
  const unit = Math.abs(s.x - 1) < 1e-4 && Math.abs(s.y - 1) < 1e-4 && Math.abs(s.z - 1) < 1e-4;
  const key = unit ? '1' : `${s.x.toFixed(4)},${s.y.toFixed(4)},${s.z.toFixed(4)}`;
  let byKey = colliderCache.get(geometry);
  if (!byKey) colliderCache.set(geometry, (byKey = new Map()));
  let entry = byKey.get(key);
  if (entry) return entry;
  const g = new THREE.BufferGeometry();
  const src = geometry.attributes.position;
  if (unit) g.setAttribute('position', src);
  else {
    const arr = new Float32Array(src.count * 3);
    for (let i = 0; i < src.count; i++) {
      arr[i * 3] = src.getX(i) * s.x;
      arr[i * 3 + 1] = src.getY(i) * s.y;
      arr[i * 3 + 2] = src.getZ(i) * s.z;
    }
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  }
  if (geometry.index) g.setIndex(geometry.index.clone()); // MeshBVH indeksi yerinde yeniden sıralar: render geometrisininkine dokunma
  g.computeBoundingBox();
  entry = { bvh: new MeshBVH(g), box: g.boundingBox };
  byKey.set(key, entry);
  return entry;
}

// ---------------------------------------------------------------------------------------------------------------------
//  Kapsül – üçgen itme
// ---------------------------------------------------------------------------------------------------------------------
/** Üçgenin birim yüzey normali (sarım yönüne göre) → out. */
function triNormal(tri, out) {
  _e1.subVectors(tri.b, tri.a);
  _e2.subVectors(tri.c, tri.a);
  out.crossVectors(_e1, _e2);
  const l = out.length();
  if (l < 1e-12) return out.set(0, 1, 0);
  return out.divideScalar(l);
}

/**
 * Kapsül EKSENİ (seg) üçgenin İÇİNDEN geçiyorsa (iki ucu düzlemin iki yanında ve kesişim noktası üçgenin içinde) kapsülü
 * düzlemin, uçlardan DAHA UZAK olanın bulunduğu yanına çıkarır (kapsülün büyük kısmı orada): ince zemin / tavan / döşemeye
 * saplanan oyuncu doğru tarafa çıkar. three-mesh-bvh'nin closestPointToSegment'i bu durumu GÖRMEZ (yalnızca kenar ve uç mesafelerine bakar;
 * uç zeminin altındaysa "zeminden uzaklaş" diye daha da aşağı iterdi). walkY > 0 ve itme yönü yürünebilir bir zemine bakıyorsa itme DİKEY olur.
 * true: itildi.
 */
function pierceTriangle(tri, seg, radius, walkY) {
  const a = tri.a;
  _e1.subVectors(tri.b, a);
  _e2.subVectors(tri.c, a);
  _fn.crossVectors(_e1, _e2);
  const nl = _fn.length();
  if (nl < 1e-10) return false;
  _fn.divideScalar(nl);
  const ds = _fn.dot(_e3.subVectors(seg.start, a));
  const de = _fn.dot(_e3.subVectors(seg.end, a));
  if (ds * de >= 0) return false; // aynı yanda (ya da düzlemde): kesmiyor
  const t = ds / (ds - de);
  _px.subVectors(seg.end, seg.start).multiplyScalar(t).add(seg.start).sub(a); // kesişim noktası − A
  const d00 = _e2.dot(_e2);
  const d01 = _e2.dot(_e1);
  const d02 = _e2.dot(_px);
  const d11 = _e1.dot(_e1);
  const d12 = _e1.dot(_px);
  const den = d00 * d11 - d01 * d01;
  if (Math.abs(den) < 1e-14) return false;
  const u = (d11 * d02 - d01 * d12) / den;
  const v = (d00 * d12 - d01 * d02) / den;
  if (u < 0 || v < 0 || u + v > 1) return false; // düzlemi üçgenin dışında kesiyor
  const far = Math.abs(ds) >= Math.abs(de) ? ds : de;
  const near = Math.min(Math.abs(ds), Math.abs(de));
  _fn.multiplyScalar(far >= 0 ? 1 : -1); // itme yönü: uzak ucun bulunduğu yan
  const need = radius + near; // yakın uç düzleme near kadar gömülü: önce oraya, sonra radius kadar ötesine
  if (walkY > 0 && _fn.y >= walkY) {
    const lift = need / _fn.y;
    seg.start.y += lift;
    seg.end.y += lift;
  } else {
    seg.start.addScaledVector(_fn, need);
    seg.end.addScaledVector(_fn, need);
  }
  return true;
}

/**
 * Bir BVH'ye (yerel uzayda) kapsül itme uygular. seg: yerel uzayda segment; true döner ise itildi.
 * walkY > 0 ise: temas yönü (üçgenden kapsüle) yukarı bakıyorsa (normal.y ≥ walkY: zemin, rampa, basamak üstü / kenarı)
 * kapsül YALNIZCA YUKARI itilir. Böylece eğimli zeminde ve basamak kenarında yana KAYMA olmaz; merdiven / rampa rahatça çıkılır.
 * Duvar, tavan ve dik yüzeylerde itme temas normali boyuncadır (duvara yaslanıp kayarak ilerleme korunur).
 */
function pushSegment(bvh, seg, radius, walkY = 0) {
  _lbox.makeEmpty();
  _lbox.expandByPoint(seg.start);
  _lbox.expandByPoint(seg.end);
  _lbox.min.addScalar(-radius);
  _lbox.max.addScalar(radius);
  let moved = false;
  bvh.shapecast({
    intersectsBounds: (b) => b.intersectsBox(_lbox),
    intersectsTriangle: (tri) => {
      if (pierceTriangle(tri, seg, radius, walkY)) {
        moved = true;
        return;
      }
      const dist = tri.closestPointToSegment(seg, _tp, _cp);
      if (dist >= radius) return;
      _dir.subVectors(_cp, _tp);
      let len = _dir.length();
      if (len < 1e-5) {
        // eksen üçgene DEĞİYOR (içinden geçmeden): yüzey normali boyunca, kapsülün orta noktasının bulunduğu yana it
        triNormal(tri, _dir);
        const side = _dir.dot(_mid.addVectors(seg.start, seg.end).multiplyScalar(0.5).sub(_tp));
        if (side < -1e-6 || (side <= 1e-6 && _dir.y < 0)) _dir.negate();
        len = 0;
      } else _dir.divideScalar(len);
      if (walkY > 0 && _dir.y >= walkY) {
        // zemin teması: kürenin yüzeyi temas noktasına değene kadar DİKEY yükselt
        const hx2 = (_dir.x * _dir.x + _dir.z * _dir.z) * len * len;
        const lift = Math.sqrt(Math.max(0, radius * radius - hx2)) - _dir.y * len;
        if (lift > 0) {
          seg.start.y += lift;
          seg.end.y += lift;
          moved = true;
        }
      } else {
        const depth = radius - dist;
        seg.start.addScaledVector(_dir, depth);
        seg.end.addScaledVector(_dir, depth);
        moved = true;
      }
    },
  });
  return moved;
}

// ---------------------------------------------------------------------------------------------------------------------
//  Dinamik çarpışma nesnesi
// ---------------------------------------------------------------------------------------------------------------------
export class DynamicCollider {
  constructor(id, obj) {
    this.id = id;
    this.obj = obj;
    this.enabled = true;
    this.parts = [];
    obj.updateWorldMatrix(true, true);
    obj.traverse((c) => {
      if (!(c.isMesh && c.geometry && c.geometry.attributes.position)) return;
      c.matrixWorld.decompose(_dpos, _dquat, _dscl);
      const g = colliderGeometry(c.geometry, _dscl); // ölçek BVH'ye işlenir
      this.parts.push({
        mesh: c,
        bvh: g.bvh,
        localBox: g.box,
        rigid: new THREE.Matrix4(), // yerel (ölçekli) → dünya: yalnızca konum + dönüş
        inv: new THREE.Matrix4(),
        box: new THREE.Box3(), // dünya sınır kutusu (kaba eleme)
        sx: Math.abs(_dscl.x),
        sy: Math.abs(_dscl.y),
        sz: Math.abs(_dscl.z),
      });
    });
    this.refresh();
  }
  refresh() {
    this.obj.updateWorldMatrix(true, true);
    for (const p of this.parts) {
      p.mesh.matrixWorld.decompose(_dpos, _dquat, _dscl);
      p.rigid.compose(_dpos, _dquat, ONE);
      p.inv.copy(p.rigid).invert();
      p.box.copy(p.localBox).applyMatrix4(p.rigid);
    }
  }
}

export class CollisionWorld {
  constructor() {
    this.staticBvh = null;
    this.dynamic = new Map(); // id -> DynamicCollider
    this.bounds = new THREE.Box3();
    this.stats = { meshes: 0, triangles: 0 };
    this.staticMeshes = new Set(); // statik çarpışmaya giren mesh'ler (harita raporu için)
    this.debugOn = false;
    this._dbg = null;
  }

  /** meshes: THREE.Mesh[] (dünya matrisleri güncel olmalı). */
  buildStatic(meshes) {
    let tris = 0;
    for (const m of meshes) {
      const g = m.geometry;
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    }
    const arr = new Float32Array(tris * 9);
    let o = 0;
    const v = new THREE.Vector3();
    for (const m of meshes) {
      m.updateWorldMatrix(true, false);
      const g = m.geometry;
      const pos = g.attributes.position;
      const idx = g.index;
      const n = idx ? idx.count : pos.count;
      for (let i = 0; i < n; i++) {
        v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m.matrixWorld);
        arr[o++] = v.x;
        arr[o++] = v.y;
        arr[o++] = v.z;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    geo.computeBoundingBox();
    this.bounds.copy(geo.boundingBox);
    this.staticBvh = tris > 0 ? new MeshBVH(geo) : null;
    this.stats = { meshes: meshes.length, triangles: Math.round(tris) };
    this.staticMeshes = new Set(meshes);
  }

  addDynamic(id, obj) {
    const c = new DynamicCollider(id, obj);
    this.dynamic.set(id, c);
    return c;
  }
  removeDynamic(id) {
    this.dynamic.delete(id);
  }
  setEnabled(id, on) {
    const c = this.dynamic.get(id);
    if (c) c.enabled = on;
  }
  refreshDynamic() {
    for (const c of this.dynamic.values()) if (c.enabled) c.refresh();
  }

  /**
   * Dinamik nesne (kapı, kafes...) şu an bu kapsülle kesişiyor mu? pos: ayak konumu.
   * tolerance: kapsül yarıçapından düşülür → duvar gibi yaslanıp duran oyuncu "çarpma" sayılmaz, gerçekten içine giren sayılır.
   */
  overlapsDynamic(id, pos, radius, height, tolerance = 0) {
    const c = this.dynamic.get(id);
    if (!c || !c.enabled) return false;
    const r = Math.max(0.01, radius - tolerance);
    _box.min.set(pos.x - radius, pos.y, pos.z - radius);
    _box.max.set(pos.x + radius, pos.y + height, pos.z + radius);
    for (const part of c.parts) {
      if (!part.box.intersectsBox(_box)) continue;
      _lseg.start.set(pos.x, pos.y + radius, pos.z).applyMatrix4(part.inv);
      _lseg.end.set(pos.x, pos.y + height - radius, pos.z).applyMatrix4(part.inv);
      _lbox.makeEmpty();
      _lbox.expandByPoint(_lseg.start);
      _lbox.expandByPoint(_lseg.end);
      _lbox.min.addScalar(-r);
      _lbox.max.addScalar(r);
      const hit = part.bvh.shapecast({
        intersectsBounds: (b) => b.intersectsBox(_lbox),
        intersectsTriangle: (tri) => tri.closestPointToSegment(_lseg, _tp, _cp) < r, // true → tarama durur
      });
      if (hit) return true;
    }
    return false;
  }

  // ---------- Kapsül ----------
  /** pos: ayak konumu. Dünyaya karşı çözümler; pos yerinde güncellenir. Toplam itmeyi _push'ta bırakır. */
  _resolveCapsule(pos, radius, height, walkY = 0) {
    _start.copy(pos);
    for (let iter = 0; iter < CC.iterations; iter++) {
      _seg.start.set(pos.x, pos.y + radius, pos.z);
      _seg.end.set(pos.x, pos.y + height - radius, pos.z);
      const before = _o.copy(_seg.start);
      let moved = false;
      if (this.staticBvh) moved = pushSegment(this.staticBvh, _seg, radius, walkY) || moved;
      if (this.dynamic.size) {
        _box.makeEmpty();
        _box.expandByPoint(_seg.start);
        _box.expandByPoint(_seg.end);
        _box.min.addScalar(-radius);
        _box.max.addScalar(radius);
        for (const c of this.dynamic.values()) {
          if (!c.enabled) continue;
          for (const part of c.parts) {
            if (!part.box.intersectsBox(_box)) continue;
            _lseg.start.copy(_seg.start).applyMatrix4(part.inv);
            _lseg.end.copy(_seg.end).applyMatrix4(part.inv);
            if (pushSegment(part.bvh, _lseg, radius, 0)) { // dinamik nesne yerel uzayda döner: dikey kuralı yalnızca statik dünyada
              _seg.start.copy(_lseg.start).applyMatrix4(part.rigid);
              _seg.end.copy(_lseg.end).applyMatrix4(part.rigid);
              moved = true;
            }
          }
        }
      }
      if (!moved) break;
      pos.x = _seg.start.x;
      pos.y = _seg.start.y - radius;
      pos.z = _seg.start.z;
      if (before.distanceToSquared(_seg.start) < 1e-8) break;
    }
    _push.subVectors(pos, _start);
    return _push;
  }

  /**
   * Oyuncu hareketi. vel: m/s (y dahil). opts: { radius, height, stepHeight, snapDown, grounded, walkableY }
   * Hareket küçük ALT ADIMLARA bölünür (her biri ≤ yarıçapın yarısı). Yerdeyken (yürüme modu) her alt adım:
   *   kapsülü basamak payı kadar (tavan varsa tavana kadar) kaldır → yatay hareket + çözümleme → zemine DEĞENE KADAR küçük adımlarla indir
   *   (basamak çıkma / inme, zemine yapışma; eksen zeminin içine girmez). Havada: doğrudan hareket + çözümleme.
   * Her alt adımdan sonra duvar geçme koruması: kapsül ekseni statik dünyada bir yüzeyi kestiyse alt adım GERİ ALINIR.
   * Dönüş: { grounded, blocked }
   */
  moveCapsule(pos, vel, dt, opts) {
    const { radius, height, stepHeight, snapDown } = opts;
    const walkY = opts.walkableY ?? 0.55;
    const sx0 = pos.x;
    const sy0 = pos.y;
    const sz0 = pos.z;
    const speed = Math.hypot(vel.x, vel.y, vel.z);
    const n = Math.min(CC.maxSubsteps, Math.max(1, Math.ceil((speed * dt) / (radius * CC.substep))));
    const h = dt / n;
    let grounded = false;
    let blocked = false;
    let wasGrounded = !!opts.grounded;
    // Başlangıç zaten bir duvarın / zeminin İÇİNDEYSE (ışınlanma, doğma) koruma bu çağrıda devre dışı kalır: çözümleme dışarı çıkarsın.
    const guard = CC.crossGuard && !!this.staticBvh && !this._embedded(pos, radius, height);
    for (let i = 0; i < n; i++) {
      const ox = pos.x;
      const oy = pos.y;
      const oz = pos.z;
      const vy = vel.y;
      if (wasGrounded && vel.y <= 0.01) grounded = this._walkStep(pos, vel, h, radius, height, stepHeight, snapDown, walkY);
      else grounded = this._airStep(pos, vel, h, radius, height, walkY);
      if (guard && this._crossed(ox, oy, oz, pos, radius, height)) {
        // kapsül ekseni bir yüzeyin ARKASINA geçti (çözümleme başarısız oldu): hamleyi iptal et, olduğun yerde kal
        pos.set(ox, oy, oz);
        vel.y = vy;
        vel.x = 0;
        vel.z = 0;
        grounded = wasGrounded;
        blocked = true;
      } else if (Math.hypot(pos.x - ox, pos.z - oz) < Math.hypot(vel.x, vel.z) * h * 0.5) blocked = true;
      wasGrounded = grounded;
    }
    if (!Number.isFinite(pos.x + pos.y + pos.z)) {
      pos.set(sx0, sy0, sz0); // sayısal bozulma: konumu koru
      vel.set(0, 0, 0);
    }
    return { grounded, blocked };
  }

  /** Yürüme alt adımı. Dönüş: yerde mi. */
  _walkStep(pos, vel, h, radius, height, stepHeight, snapDown, walkY) {
    const y0 = pos.y;
    const nx = pos.x + vel.x * h;
    const nz = pos.z + vel.z * h;
    // 1) yukarı: basamak payı kadar — ama hem şimdiki hem varılacak noktada tavan varsa tavana kadar (eksen tavanın içine girmesin)
    let up = this._headroom(pos.x, y0, pos.z, radius, height, stepHeight);
    if (up > 0 && (nx !== pos.x || nz !== pos.z)) up = Math.min(up, this._headroom(nx, y0, nz, radius, height, stepHeight));
    pos.y = y0 + up;
    // 2) yatay hareket + duvarlara karşı çözümleme
    pos.x = nx;
    pos.z = nz;
    this._resolveCapsule(pos, radius, height, walkY);
    // 3) aşağı: zemine DEĞENE kadar küçük adımlarla (her adım < yarıçap: kapsül ekseni zeminin içinden geçemez)
    const lowest = y0 - snapDown;
    const stepDown = Math.max(0.05, radius * CC.descend);
    for (let k = 0; k < 24 && pos.y > lowest + 1e-4; k++) {
      pos.y = Math.max(lowest, pos.y - stepDown);
      const p = this._resolveCapsule(pos, radius, height, walkY);
      if (p.y > 1e-3) {
        vel.y = 0;
        return true; // zemine oturdu
      }
    }
    // zemin yok (kenardan çıktın / boşluk): eski yükseklikten düşmeye başla (anında aşağı sıçrama olmasın)
    pos.y = y0;
    this._resolveCapsule(pos, radius, height, walkY);
    return false;
  }

  /** Hava alt adımı (zıplama / düşme). Dönüş: yere indi mi. */
  _airStep(pos, vel, h, radius, height, walkY) {
    pos.x += vel.x * h;
    pos.y += vel.y * h;
    pos.z += vel.z * h;
    const p = this._resolveCapsule(pos, radius, height, walkY);
    if (p.y > 1e-3 && vel.y <= 0) {
      vel.y = 0;
      return true;
    }
    if (p.y < -1e-3 && vel.y > 0) vel.y = 0; // tavana çarptı
    return false;
  }

  /** Kapsülün (ayak konumu x,y,z) üstünde `want` metreye kadar boşluk: tavan varsa üst kürenin tavana değmeyeceği kadarı. */
  _headroom(x, y, z, radius, height, want) {
    const top = y + height - radius; // üst küre merkezi
    const k = radius * 0.7;
    let free = want;
    for (let i = 0; i < 3 && free > 0; i++) {
      _o.set(x + (i === 1 ? k : i === 2 ? -k : 0), top, z);
      const hit = this.raycast(_o, UP, want + radius);
      if (hit) free = Math.min(free, Math.max(0, hit.distance - radius));
    }
    return free;
  }

  /** Kapsül ekseninin üç noktası (alt küre merkezi, orta, üst küre merkezi) a→b yolunda statik dünyada bir yüzeyi kesti mi? */
  _crossed(ox, oy, oz, pos, radius, height) {
    _d.set(pos.x - ox, pos.y - oy, pos.z - oz);
    const len = _d.length();
    if (len < 1e-4) return false;
    _d.divideScalar(len);
    _ray.direction.copy(_d);
    for (let i = 0; i < 3; i++) {
      _ray.origin.set(ox, oy + (i === 0 ? radius : i === 1 ? height * 0.5 : height - radius), oz);
      if (this.staticBvh.raycastFirst(_ray, THREE.DoubleSide, 0, len)) return true;
    }
    return false;
  }

  /** Kapsül ekseninin bir noktası statik bir yüzeye yarıçapın yarısından yakınsa true (geçerli bir duruş ≥ yarıçap uzakta olur). */
  _embedded(pos, radius, height) {
    const thr = radius * 0.5;
    for (let i = 0; i < 3; i++) {
      _o.set(pos.x, pos.y + (i === 0 ? radius : i === 1 ? height * 0.5 : height - radius), pos.z);
      const r = this.staticBvh.closestPointToPoint(_o, _hitInfo, 0, thr);
      if (r && r.distance < thr) return true;
    }
    return false;
  }

  /**
   * Eğilmiş oyuncu ayağa kalkabilir mi? pos: ayak konumu. Ayakta kapsülün, eğilmişte bulunmayan ÜST bölümü bir şeye (tavan) değiyor mu bakar.
   * Duvara yaslı durmak engel sayılmaz (küçük tolerans).
   */
  canStand(pos, radius, crouchHeight, standHeight) {
    const r = Math.max(0.05, radius - 0.03);
    _seg.start.set(pos.x, pos.y + crouchHeight - radius, pos.z);
    _seg.end.set(pos.x, pos.y + standHeight - radius, pos.z);
    _lbox.makeEmpty();
    _lbox.expandByPoint(_seg.start);
    _lbox.expandByPoint(_seg.end);
    _lbox.min.addScalar(-r);
    _lbox.max.addScalar(r);
    const test = (bvh, seg, rad, box) =>
      bvh.shapecast({
        intersectsBounds: (b) => b.intersectsBox(box),
        intersectsTriangle: (tri) => tri.closestPointToSegment(seg, _tp, _cp) < rad, // true → tarama durur
      });
    if (this.staticBvh && test(this.staticBvh, _seg, r, _lbox)) return false;
    for (const c of this.dynamic.values()) {
      if (!c.enabled) continue;
      _box.copy(_lbox);
      for (const part of c.parts) {
        if (!part.box.intersectsBox(_box)) continue;
        _lseg.start.copy(_seg.start).applyMatrix4(part.inv);
        _lseg.end.copy(_seg.end).applyMatrix4(part.inv);
        _lbox2.makeEmpty().expandByPoint(_lseg.start).expandByPoint(_lseg.end);
        _lbox2.min.addScalar(-r);
        _lbox2.max.addScalar(r);
        if (test(part.bvh, _lseg, r, _lbox2)) return false;
      }
    }
    return true;
  }

  // ---------- Küre (eşya, bıçak) ----------
  /** Küreyi dünyadan çıkarır. normal: toplam temas normali (çarpma yoksa sıfır). */
  resolveSphere(center, radius, normal) {
    normal.set(0, 0, 0);
    let hit = false;
    const run = (bvh, toLocal, toWorld) => {
      const c = toLocal ? _o.copy(center).applyMatrix4(toLocal) : center;
      bvh.shapecast({
        intersectsBounds: (b) => {
          _lbox.min.copy(c).addScalar(-radius);
          _lbox.max.copy(c).addScalar(radius);
          return b.intersectsBox(_lbox);
        },
        intersectsTriangle: (tri) => {
          tri.closestPointToPoint(c, _p);
          const dist = _p.distanceTo(c);
          if (dist < radius) {
            _dir.subVectors(c, _p);
            if (_dir.lengthSq() < 1e-10) _dir.set(0, 1, 0);
            _dir.normalize();
            c.addScaledVector(_dir, radius - dist);
            _n.copy(_dir);
            if (toWorld) _n.transformDirection(toWorld);
            normal.add(_n);
            hit = true;
          }
        },
      });
      if (toLocal) center.copy(c).applyMatrix4(toWorld);
    };
    if (this.staticBvh) run(this.staticBvh, null, null);
    for (const c of this.dynamic.values()) {
      if (!c.enabled) continue;
      for (const part of c.parts) {
        _box.min.copy(center).addScalar(-radius);
        _box.max.copy(center).addScalar(radius);
        if (!part.box.intersectsBox(_box)) continue;
        run(part.bvh, part.inv, part.rigid);
      }
    }
    if (hit && normal.lengthSq() > 0) normal.normalize();
    return hit;
  }

  // ---------- Işın ----------
  /** Dünyaya ışın at. Dönüş: { distance, point, normal, dynamicId } veya null. dir normalize edilmiş olmalı. */
  raycast(origin, dir, maxDist = 100, { dynamic = true } = {}) {
    let best = null;
    if (this.staticBvh) {
      _ray.origin.copy(origin);
      _ray.direction.copy(dir);
      const hit = this.staticBvh.raycastFirst(_ray, THREE.DoubleSide, 0, maxDist);
      if (hit) best = { distance: hit.distance, point: hit.point.clone(), normal: hit.face.normal.clone(), dynamicId: null };
    }
    if (dynamic && this.dynamic.size) {
      _wray.origin.copy(origin);
      _wray.direction.copy(dir);
      for (const c of this.dynamic.values()) {
        if (!c.enabled) continue;
        for (const part of c.parts) {
          if (!_wray.intersectsBox(part.box)) continue; // kaba eleme: ışın nesnenin kutusuna hiç girmiyor
          _ray.origin.copy(origin).applyMatrix4(part.inv);
          _ray.direction.copy(dir).transformDirection(part.inv);
          const far = best ? best.distance : maxDist;
          const hit = part.bvh.raycastFirst(_ray, THREE.DoubleSide, 0, far);
          if (hit) {
            const point = hit.point.clone().applyMatrix4(part.rigid);
            const distance = point.distanceTo(origin);
            if (!best || distance < best.distance) {
              best = { distance, point, normal: hit.face.normal.clone().transformDirection(part.rigid), dynamicId: c.id };
            }
          }
        }
      }
    }
    return best;
  }

  /** a→b arasında duvar var mı? margin: b'den bu kadar önce biter (b'nin tam yüzeyde olması durumunda yanlış "engel" olmasın). */
  blocked(a, b, margin = 0.05) {
    _d.subVectors(b, a);
    const len = _d.length();
    if (len - margin < 1e-4) return false;
    _d.divideScalar(len);
    return !!this.raycast(a, _d, len - margin);
  }

  /** (x,z) altındaki zemin Y değeri; bulunamazsa null. */
  floorAt(x, y, z, up = 1.5, down = 30) {
    _o.set(x, y + up, z);
    const hit = this.raycast(_o, DOWN, up + down);
    return hit ? hit.point.y : null;
  }

  // ---------- Debug: çarpışma görünümü ----------
  /**
   * Çarpışma gövdesini tel kafes olarak gösterir / gizler (statik: turuncu, hareketli nesneler: mavi; duvarın içinden de görünür).
   * Çizilen şey = oyuncunun gerçekten çarptığı şey: bir duvarın tel kafesi YOKSA o duvarın çarpışması yoktur (içinden geçilir).
   */
  setDebugView(scene, on) {
    on = !!on;
    if (!this._dbg) {
      if (!on) return false;
      const mat = (color) => new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.75, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
      const group = new THREE.Group();
      group.name = '__collisionView';
      group.userData.isCollisionView = true;
      const wires = [];
      if (this.staticBvh) {
        // statik BVH geometrisi dünya uzayındadır: yarı saydam turuncu dolgu + kenar çizgileri (duvarın içinden de görünür)
        const geo = this.staticBvh.geometry;
        const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff8a1f, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: false, toneMapped: false }));
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), new THREE.LineBasicMaterial({ color: 0xffb066, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
        for (const m of [fill, edges]) {
          m.frustumCulled = false;
          m.renderOrder = 999;
          m.userData.isCollisionView = true;
          m.raycast = () => {}; // nişan / etkileşim çizgileri bu yardımcıya takılmasın
          group.add(m);
        }
      }
      const dynMat = mat(0x38b6ff);
      for (const c of this.dynamic.values()) {
        for (const p of c.parts) {
          const w = new THREE.Mesh(p.mesh.geometry, dynMat); // mesh'in çocuğu: dönüşümünü (kapı açılırken vb.) birlikte izler
          w.userData.isCollisionView = true; // harita raporu / aramalar bunu nesne saymasın
          w.raycast = () => {};
          w.frustumCulled = false;
          w.renderOrder = 999;
          p.mesh.add(w);
          wires.push(w);
        }
      }
      this._dbg = { group, wires };
    }
    const { group, wires } = this._dbg;
    if (on) scene.add(group);
    else scene.remove(group);
    for (const w of wires) w.visible = false;
    this.debugOn = on;
    return on;
  }
}
