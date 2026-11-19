// Nişangâhın altında, BAKTIĞIM oyuncunun / cesedin adı: küçük yazı, o kişinin kendi renginde ("Echo", renk adı yazılmaz).
// Birkaç saniye sonra kaybolur; başka birine bakınca onun adına döner. Cesede bakınca da ölenin adı görünür.
// Işın duvara çarparsa (arkadaki kişi) isim gösterilmez. Dedektif herkese "Dedektif" (mavi), diğerleri "Irgat" ya da renkli kod adıyla görünür.
import * as THREE from 'three';
import { GAME_CONFIG } from './config.js';
import { ctx } from './context.js';
import { R } from './ragdoll.js';
import { colorCss, h } from './util.js';

const L = GAME_CONFIG.lookName;
const { HEAD, LSH, RSH, LHIP, RHIP, LEL, REL, LHAND, RHAND, LKNEE, RKNEE, LFOOT, RFOOT } = R;

// Ceset: [a, b, yarıçap] kapsüller (gövde + uzuvlar). Kafa: a = b.
const BODY = [
  [HEAD, HEAD, 0.2], [LSH, RSH, 0.17], [LHIP, RHIP, 0.17], [LSH, LHIP, 0.2], [RSH, RHIP, 0.2], [LSH, RHIP, 0.2], [RSH, LHIP, 0.2],
  [LSH, LEL, 0.1], [LEL, LHAND, 0.09], [RSH, REL, 0.1], [REL, RHAND, 0.09],
  [LHIP, LKNEE, 0.13], [LKNEE, LFOOT, 0.11], [RHIP, RKNEE, 0.13], [RKNEE, RFOOT, 0.11],
];

const _w = new THREE.Vector3();
const _v = new THREE.Vector3();

/** Işın (o, d birim) ile eksen hizalı kutu: isabetse ışın mesafesi, yoksa Infinity. */
function rayBox(o, d, x0, y0, z0, x1, y1, z1) {
  let t0 = 0;
  let t1 = Infinity;
  const mn = [x0, y0, z0];
  const mx = [x1, y1, z1];
  const oo = [o.x, o.y, o.z];
  const dd = [d.x, d.y, d.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dd[i]) < 1e-9) {
      if (oo[i] < mn[i] || oo[i] > mx[i]) return Infinity;
    } else {
      let a = (mn[i] - oo[i]) / dd[i];
      let b = (mx[i] - oo[i]) / dd[i];
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
      if (t0 > t1) return Infinity;
    }
  }
  return t0;
}

/** Işın ile kapsül (a-b, r) arasındaki en yakın geçiş: isabetse ışın mesafesi, yoksa Infinity. */
function rayCapsule(o, d, a, b, r) {
  _v.subVectors(b, a);
  _w.subVectors(o, a);
  const B = d.dot(_v);
  const C = _v.dot(_v);
  const D = d.dot(_w);
  const E = _v.dot(_w);
  const den = C - B * B;
  let s = den > 1e-8 ? (E - D * B) / den : 0;
  s = Math.max(0, Math.min(1, s));
  let t = s * B - D;
  if (t < 0) {
    t = 0;
    s = C > 1e-8 ? Math.max(0, Math.min(1, E / C)) : 0;
  }
  const dx = _w.x + d.x * t - _v.x * s;
  const dy = _w.y + d.y * t - _v.y * s;
  const dz = _w.z + d.z * t - _v.z * s;
  return dx * dx + dy * dy + dz * dz <= r * r ? t : Infinity;
}

export class LookName {
  constructor(parent) {
    this.el = h('div', { class: 'look-name off' });
    parent.appendChild(this.el);
    this.key = null;
    this.until = 0;
    this.cd = 0;
    this.shown = '';
  }

  update(dt) {
    const live = (ctx.phase === 'playing' || ctx.phase === 'ended') && ctx.me && ctx.world;
    const now = performance.now() / 1000;
    if (!live) {
      this.key = null;
      this.until = 0;
    } else {
      this.cd -= dt;
      if (this.cd <= 0) {
        this.cd = 0.05; // saniyede 20 kez bakmak yeter
        const hit = this._pick();
        if (hit) {
          this.until = now + L.showTime;
          if (hit.key !== this.key) {
            this.key = hit.key;
            this._show(hit.idn);
          }
        }
      }
    }
    this.el.classList.toggle('off', !live || now > this.until);
  }

  _show(idn) {
    const text = idn?.label || '';
    this.el.textContent = text;
    this.el.style.color = colorCss(idn?.color ?? 0xffffff);
    this.shown = text;
  }

  /** Bakış ışınının ilk isabet ettiği canlı oyuncu ya da ceset (duvar öndeyse yok). */
  _pick() {
    const mv = ctx.movement;
    const col = ctx.world.collision;
    const o = mv.eye;
    const d = mv.lookDir;
    // Ölünce boşluk görünümünde harita ve canlı oyuncular görünmez: duvar engel olmaz, yalnızca cesetlerin adı okunur.
    const voidV = !!(mv.voidView && ctx.me && !ctx.me.alive);
    const wall = voidV ? null : col.raycast(o, d, L.range);
    let bestT = wall ? wall.distance : L.range;
    let best = null;
    const viewed = mv.viewedPlayer();
    for (const p of ctx.players.map.values()) {
      if (voidV || !p.alive || p === viewed || p === ctx.me || p.umaci) continue; // görünmez Umacı'nın adı okunmaz
      const hh = p.crouch ? 1.35 : 1.85;
      const t = rayBox(o, d, p.pos.x - 0.36, p.pos.y, p.pos.z - 0.36, p.pos.x + 0.36, p.pos.y + hh, p.pos.z + 0.36);
      if (t < bestT) {
        bestT = t;
        best = { key: `${p.id}|${p.identity?.label}`, idn: p.identity };
      }
    }
    for (const c of ctx.corpses.map.values()) {
      if (c.view.center.distanceToSquared(o) > (L.range + 2) * (L.range + 2)) continue;
      const pts = c.view.pts;
      for (const [a, b, r] of BODY) {
        const t = rayCapsule(o, d, pts[a], pts[b], r);
        if (t < bestT) {
          bestT = t;
          const idn = ctx.players.get(c.id)?.identity;
          best = { key: `corpse:${c.id}|${idn?.label}`, idn };
        }
      }
    }
    return best;
  }
}
