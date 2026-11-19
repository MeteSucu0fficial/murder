// Merdivenler: "Ladder_*" (ladder_ · Ladder.001 · Ladder_01 ... hepsi tanınır).
// Merdiven, nesnenin KENDİ sınır kutusudur (nesne dönmüş olsa da doğru: kutu nesnenin dünya yönelimindedir) ve KATI DEĞİLDİR;
// yalnızca "oyuncunun kapsülü merdivene değiyor mu?" sorusunun cevabıdır. Tırmanma mantığı movement.js içindedir (yalnızca yerel oyuncu hareket eder).
// Mesh'i olmayan (Empty) merdiven: Blender'daki "Cube" Empty'nin ölçeği kadar kutu (yarı boyut = ölçek) ya da özel özellik `size: [genişlik, yükseklik, derinlik]`.
// Merdiveni, oyuncuların çıkacağı yüzeyin (zemin / platform) hizasında ya da biraz üstünde bitir; tepeye gelen oyuncu merdivene doğru sıçrayıp üste çıkar.
import * as THREE from 'three';
import { bodyBounds } from './blenderLoader.js';
import { clamp, vec3 } from './util.js';

const SAMPLES = 4; // kapsül ekseni boyunca bakılan nokta sayısı
const _s = new THREE.Vector3();
const _c = new THREE.Vector3();
const _w = new THREE.Vector3();

export class LadderSystem {
  constructor(world, entries) {
    this.world = world;
    this.list = [];
    this.interactables = []; // (world.js sistem arayüzü; merdiven E ile kullanılmaz)
    for (const e of entries) {
      const node = e.node;
      node.updateWorldMatrix(true, true);
      const pivot = node.getWorldPosition(new THREE.Vector3());
      const quat = node.getWorldQuaternion(new THREE.Quaternion());
      let bb = bodyBounds(node);
      if (!bb) {
        // mesh yok: Blender'daki "Cube" Empty (yarı boyut = ölçek) ya da `size`
        const sz = vec3(e.data.size, null);
        const sc = node.getWorldScale(new THREE.Vector3());
        const half = sz ? new THREE.Vector3(sz[0], sz[1], sz[2]).multiplyScalar(0.5) : new THREE.Vector3(Math.abs(sc.x), Math.abs(sc.y), Math.abs(sc.z));
        bb = { min: half.clone().negate(), max: half };
      }
      // dünya uzayındaki köşeler: kaba eleme kutusu + tepe / taban yüksekliği
      const aabb = new THREE.Box3();
      const corner = new THREE.Vector3();
      for (const x of [bb.min.x, bb.max.x]) {
        for (const y of [bb.min.y, bb.max.y]) {
          for (const z of [bb.min.z, bb.max.z]) aabb.expandByPoint(corner.set(x, y, z).applyQuaternion(quat).add(pivot));
        }
      }
      // ince (yüz) eksen: kutunun yatay yerel eksenlerinden kısa olanı (dünya yönü). Tırmanırken merdivene yaslanma çekimi yalnızca bu eksen
      // boyunca olur (movement.js → _ladder); yana çekim yoktur, oyuncu merdivenin ortasına kaymaz. Eksen devrikse (dikeye yakın) null.
      const thin = bb.max.x - bb.min.x <= bb.max.z - bb.min.z ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
      thin.applyQuaternion(quat);
      thin.y = 0;
      const wn = thin.lengthSq() > 0.25 ? thin.normalize() : null;
      this.list.push({
        id: e.name, node, pivot, quat, qInv: quat.clone().invert(), min: bb.min, max: bb.max, aabb, top: aabb.max.y, bottom: aabb.min.y,
        wn: wn ? { x: wn.x, z: wn.z } : null,
      });
    }
  }

  /**
   * Kapsül (pos: ayak konumu) bir merdivene değiyor mu? Kapsülün eksenindeki birkaç noktanın merdiven kutusuna uzaklığına bakar:
   * en yakın nokta ≤ radius + margin ise "değdi". Dönüş (değmiyorsa null):
   *   { ladder, dist, nx, nz, h, flat, top, bottom, px, py, pz }
   *   nx, nz = oyuncudan merdivene YATAY birim yön · h = yatay uzaklık · flat = kapsül ekseni kutunun içinde (yön tanımsız)
   *   px, py, pz = merdiven kutusu üzerindeki en yakın nokta (dünya; arada duvar var mı diye bakmak için)
   */
  touch(pos, radius, height, margin) {
    const lim = radius + margin;
    let best = null;
    let bx = 0;
    let by = 0;
    let bz = 0;
    for (const l of this.list) {
      if (pos.y > l.top + lim || pos.y + height < l.bottom - lim) continue;
      if (pos.x < l.aabb.min.x - lim || pos.x > l.aabb.max.x + lim || pos.z < l.aabb.min.z - lim || pos.z > l.aabb.max.z + lim) continue;
      const span = Math.max(0, height - 2 * radius);
      for (let i = 0; i < SAMPLES; i++) {
        const y = pos.y + radius + (i / (SAMPLES - 1)) * span;
        _s.set(pos.x, y, pos.z).sub(l.pivot).applyQuaternion(l.qInv); // gövde çerçevesi
        _c.set(clamp(_s.x, l.min.x, l.max.x), clamp(_s.y, l.min.y, l.max.y), clamp(_s.z, l.min.z, l.max.z));
        const d = _s.distanceTo(_c);
        if (d <= lim && (!best || d < best.dist)) {
          _w.copy(_c).applyQuaternion(l.quat).add(l.pivot); // kutu üzerindeki en yakın nokta (dünya)
          bx = _w.x;
          by = _w.y;
          bz = _w.z;
          best = { ladder: l, dist: d, nx: 0, nz: 0, h: 0, flat: true, top: l.top, bottom: l.bottom, px: 0, py: 0, pz: 0 };
        }
      }
    }
    if (best) {
      const dx = bx - pos.x;
      const dz = bz - pos.z;
      const h = Math.hypot(dx, dz);
      best.px = bx;
      best.py = by;
      best.pz = bz;
      best.h = h;
      if (h > 1e-3) {
        best.nx = dx / h;
        best.nz = dz / h;
        best.flat = false;
      }
    }
    return best;
  }

  // ---- world.js sistem arayüzü (merdivenin ağ durumu yoktur) ----
  applyEvent() {}
  hostAct() {
    return null;
  }
  update() {}
  getState() {
    return null;
  }
  setState() {}
  reset() {}
}
