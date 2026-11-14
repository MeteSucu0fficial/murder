// İnsan modeli için poz yardımcıları: 3B iki kemikli IK, ekipman tutuşları ve saldırı / atış hareketleri.
// Avatar yerel uzayı: x = karakterin SOLU, y yukarı, z ileri. Tutuş ofsetleri "omuz ortası"na görelidir.
import * as THREE from 'three';

const _u = new THREE.Vector3();
const _q = new THREE.Vector3();

/**
 * 3B iki kemikli IK: omuz s → hedef t. Dirsek pole yönüne bükülür; hedef erişilemezse kol sonuna kadar uzanır.
 * Sonuç elbow (dirsek) ve hand (el) vektörlerine yazılır.
 */
export function ik3(s, t, l1, l2, pole, elbow, hand) {
  _u.subVectors(t, s);
  const d0 = _u.length();
  if (d0 < 1e-5) _u.set(0, 0, 1);
  else _u.multiplyScalar(1 / d0);
  const d = Math.min((l1 + l2) * 0.999, Math.max(Math.abs(l1 - l2) * 1.001 + 0.01, d0));
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  _q.copy(pole).addScaledVector(_u, -pole.dot(_u));
  if (_q.lengthSq() < 1e-6) _q.set(0, -1, 0).addScaledVector(_u, _u.y);
  _q.normalize();
  elbow.copy(s).addScaledVector(_u, a).addScaledVector(_q, h);
  hand.copy(s).addScaledVector(_u, d);
}

/**
 * Ekipman tutuşları. o: ekipmanın (el kavrama noktasının) omuz ortasına göre konumu · rx: yukarı doğru ek eğim (rad)
 * ry: yana ek dönüş · pk: bakış eğimini ne kadar izlediği (1 = tam) · free: tek elli silahlarda boştaki (sol) elin hedefi
 * gun: iki elle tutulan ateşli silah (duruş biraz alçalır ve öne eğilir).
 */
export const HOLDS = {
  knife: { o: [-0.2, -0.34, 0.26], rx: 0.5, ry: 0.14, pk: 0.45, free: [0.2, -0.2, 0.34], gun: false },
  taser: { o: [-0.2, -0.16, 0.2], rx: 0.85, ry: 0.05, pk: 0.6, free: [0.2, -0.28, 0.26], gun: false },
  pistol: { o: [-0.045, -0.17, 0.3], rx: 0, ry: 0, pk: 1, gun: true },
  rifle: { o: [-0.08, -0.15, 0.2], rx: 0, ry: 0, pk: 1, gun: true },
  plasma: { o: [-0.08, -0.15, 0.2], rx: 0, ry: 0, pk: 1, gun: true },
  rocket: { o: [-0.22, 0.07, 0.1], rx: 0, ry: 0, pk: 1, gun: true },
  bomb: { o: [0, -0.2, 0.28], rx: 0.2, ry: 0, pk: 0.4, gun: false },
};

export const ACTION_DUR = { stab: 0.5, shoot: 0.2, zap: 0.55, rocket: 0.5, throw: 0.6, plant: 0.7 };

const e = (x) => {
  const v = x < 0 ? 0 : x > 1 ? 1 : x;
  return v * v * (3 - 2 * v);
};
const out = { dz: 0, dy: 0, rx: 0, lean: 0, step: 0 };

/**
 * Saldırı / atış hareketinin anlık duruşu (u: 0..1 ilerleme). Dönen nesne her çağrıda yeniden kullanılır.
 * dz/dy: ekipmanın öne / aşağı kayması · rx: ekipman eğimi (+ yukarı) · lean: gövdenin öne eğilmesi · step: öne adım (0..1)
 */
export function actionPose(kind, u) {
  out.dz = out.dy = out.rx = out.lean = out.step = 0;
  switch (kind) {
    case 'stab': // hazırlan → ileri hamle → toparlan
      if (u < 0.22) {
        const s = e(u / 0.22);
        out.dz = -0.12 * s;
        out.rx = 0.25 * s;
        out.lean = -0.05 * s;
      } else if (u < 0.5) {
        const v = e((u - 0.22) / 0.28);
        out.dz = -0.12 + 0.52 * v;
        out.rx = 0.25 - 0.65 * v;
        out.lean = -0.05 + 0.3 * v;
        out.step = v;
      } else {
        const w = 1 - e((u - 0.5) / 0.5);
        out.dz = 0.4 * w;
        out.rx = -0.4 * w;
        out.lean = 0.25 * w;
        out.step = w;
      }
      break;
    case 'shoot': {
      const s = (1 - u) * (1 - u);
      out.dz = -0.05 * s;
      out.rx = 0.07 * s;
      out.lean = -0.04 * s;
      break;
    }
    case 'rocket': {
      const s = Math.pow(1 - u, 1.5);
      out.dz = -0.14 * s;
      out.rx = 0.14 * s;
      out.lean = -0.12 * s;
      break;
    }
    case 'zap': // sopayı kaldır → aşağı savur → toparlan
      if (u < 0.25) {
        out.rx = 0.35 * e(u / 0.25);
      } else if (u < 0.5) {
        const v = e((u - 0.25) / 0.25);
        out.rx = 0.35 - 1.4 * v;
        out.dz = 0.25 * v;
        out.lean = 0.2 * v;
      } else {
        const w = 1 - e((u - 0.5) / 0.5);
        out.rx = -1.05 * w;
        out.dz = 0.25 * w;
        out.lean = 0.2 * w;
      }
      break;
    case 'throw': // kolu geri çek → ileri fırlat → toparlan
      if (u < 0.4) {
        const s = e(u / 0.4);
        out.dz = -0.15 * s;
        out.rx = 0.8 * s;
        out.lean = -0.1 * s;
      } else if (u < 0.6) {
        const v = e((u - 0.4) / 0.2);
        out.dz = -0.15 + 0.5 * v;
        out.rx = 0.8 - 1.3 * v;
        out.lean = -0.1 + 0.35 * v;
      } else {
        const w = 1 - e((u - 0.6) / 0.4);
        out.dz = 0.35 * w;
        out.rx = -0.5 * w;
        out.lean = 0.25 * w;
      }
      break;
    case 'plant': {
      const s = Math.sin(Math.PI * Math.min(1, u));
      out.dy = -0.24 * s;
      out.lean = 0.3 * s;
      break;
    }
    default:
      break;
  }
  return out;
}
